/**
 * Group Chat Service - messaging several people at once, and adding people to chats
 *
 * Shares TeamsService's authenticated Graph client, like the other services.
 * Reachable on the consented delegated scopes:
 *   GET  /users?$search=...               -> User.ReadBasic.All
 *   GET  /me/chats, GET /chats/{id}       -> Chat.ReadBasic (Chat.ReadWrite is higher)
 *   POST /chats (chatType group)          -> Chat.Create (Chat.ReadWrite is higher)
 *   POST /chats/{id}/messages             -> ChatMessage.Send (Chat.ReadWrite is higher)
 *   POST /chats/{id}/members              -> ChatMember.ReadWrite (Chat.ReadWrite is higher)
 *
 * Unlike a one-on-one chat, creating a group chat is NOT idempotent: every
 * POST /chats makes a new chat, even for the same people. So the lookup for an
 * existing group chat with exactly these members is the only thing between a
 * repeated send and a pile of duplicate threads, and it walks further than the
 * one-on-one lookup does for that reason.
 *
 * People are resolved through resolveDirectoryUser(), the same resolver as
 * send-direct-message and @-mentions, so an ambiguous name or a guest named by
 * anything but their exact address is refused here too.
 */

import type { TeamsService } from "./teams-service.js";
import { wrapGraphError } from "./message-service.js";
import { isExternalUser, resolveDirectoryUser } from "./people-service.js";
import { buildOutboundMessage } from "../mentions.js";
import type { AddChatMemberResult, GroupMessageResult, UserInfo } from "../types.js";

/** Chats per page while looking for an existing group chat. */
const CHAT_PAGE_SIZE = 50;

/**
 * Pages to walk looking for an existing group chat. Graph applies the chatType
 * filter after paging, so each page covers 50 chats of every type and returns
 * only the group ones: 10 pages look through the 500 most recently active chats.
 * A miss past that creates a second chat with the same people.
 */
const GROUP_LOOKUP_MAX_PAGES = 10;

/** Graph's value for "share the whole chat history" when adding a member. */
const ALL_HISTORY = "0001-01-01T00:00:00Z";

const MEMBER_TYPE = "#microsoft.graph.aadUserConversationMember";

/** "none" shares no history (the default), "all" the whole of it, a number that many days. */
export type ShareHistory = "none" | "all" | number;

export class GroupChatService {
  constructor(private teams: TeamsService) {}

  /**
   * Send one message to several people, in the group chat that holds exactly
   * them and the signed-in user, creating that chat only if there is none.
   *
   * Everyone is resolved, and every @-mention in the message too, before
   * anything is created or sent: one bad name must not leave a half-built chat
   * behind, or send to some of the people and not the rest.
   *
   * With a topic, only a chat of that name is reused; without one, any chat with
   * exactly these people is, most recently active first.
   */
  async sendGroupMessage(
    people: string[],
    content: string,
    options: { topic?: string; format?: "text" | "markdown" } = {}
  ): Promise<GroupMessageResult> {
    const client = await this.teams.getGraphClient();
    const me = await this.teams.getMe();
    const topic = options.topic?.trim() || undefined;

    const recipients: UserInfo[] = [];
    const failures: string[] = [];
    for (const name of people) {
      try {
        const user = await resolveDirectoryUser(client, name);
        // You are in the chat anyway, and naming someone twice adds nobody.
        if (user.id !== me.id && !recipients.some((r) => r.id === user.id)) {
          recipients.push(user);
        }
      } catch (error) {
        failures.push(`- ${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Nothing was sent. ${failures.length} of the ${people.length} people named could not be ` +
          `resolved to exactly one person:\n${failures.join("\n")}`
      );
    }
    if (recipients.length < 2) {
      throw new Error(
        `A group message needs at least two people besides you; this names ${recipients.length}. ` +
          `Use send-direct-message to message one person. Nothing was sent.`
      );
    }

    const outbound = await buildOutboundMessage(client, content, options.format);

    const existingChatId = await this.findGroupChat(client, me.id, recipients, topic);
    const chatId = existingChatId ?? (await this.createGroupChat(client, me.id, recipients, topic));

    try {
      const result = await client
        .api(`/chats/${chatId}/messages`)
        .post({ body: outbound.body, ...(outbound.mentions ? { mentions: outbound.mentions } : {}) });

      return {
        messageId: result.id,
        webUrl: result.webUrl,
        chatId,
        chatExisted: existingChatId !== null,
        recipients,
        topic,
      };
    } catch (error) {
      throw wrapGraphError(error, `send the group message to ${recipients.map((r) => r.displayName).join(", ")}`);
    }
  }

  /**
   * Add one person to an existing group or meeting chat.
   *
   * A one-on-one chat cannot take a third person - Teams starts a new group chat
   * instead - so that is refused before anything is resolved or posted, and the
   * error points at send-group-message. No history is shared unless asked for.
   */
  async addChatMember(
    chatId: string,
    person: string,
    options: { shareHistory?: ShareHistory } = {}
  ): Promise<AddChatMemberResult> {
    const client = await this.teams.getGraphClient();
    const shareHistory = options.shareHistory ?? "none";
    // Checked before any call, so a bad value costs nothing.
    const start = historyStart(shareHistory);

    let chat: any;
    try {
      chat = await client.api(`/chats/${chatId}`).expand("members").get();
    } catch (error) {
      throw wrapGraphError(error, `read chat ${chatId}`);
    }

    if (chat?.chatType === "oneOnOne") {
      throw new Error(
        `This is a one-on-one chat, and a one-on-one chat cannot take a third person - Teams ` +
          `starts a new group chat instead. Use send-group-message with the other person and ` +
          `"${person}" to do the same. Nothing was changed.`
      );
    }

    const user = await resolveDirectoryUser(client, person);

    if ((chat?.members ?? []).some((m: any) => m?.userId === user.id)) {
      return { chatId, member: user, added: false, alreadyMember: true, history: "none" };
    }

    try {
      await client.api(`/chats/${chatId}/members`).post({
        "@odata.type": MEMBER_TYPE,
        "user@odata.bind": userBind(user.id),
        roles: [roleFor(user)],
        ...(start ? { visibleHistoryStartDateTime: start } : {}),
      });
    } catch (error) {
      throw wrapGraphError(error, `add ${user.displayName} to chat ${chatId}`);
    }

    return { chatId, member: user, added: true, alreadyMember: false, history: shareHistory };
  }

  /** The most recently active group chat holding exactly me plus these people, or null. */
  private async findGroupChat(
    client: any,
    myId: string,
    recipients: UserInfo[],
    topic: string | undefined
  ): Promise<string | null> {
    const wanted = new Set([myId, ...recipients.map((r) => r.id)]);
    let nextUrl: string | undefined;

    try {
      for (let pages = 0; pages < GROUP_LOOKUP_MAX_PAGES; pages++) {
        const response: any = nextUrl
          ? await client.api(nextUrl).get()
          : await client
              .api("/me/chats")
              .filter("chatType eq 'group'")
              .expand("members,lastMessagePreview")
              .orderby("lastMessagePreview/createdDateTime desc")
              .top(CHAT_PAGE_SIZE)
              .get();

        for (const chat of response?.value ?? []) {
          if (chat?.chatType === "group" && hasExactly(chat.members, wanted) && topicMatches(chat.topic, topic)) {
            return chat.id;
          }
        }

        nextUrl = response?.["@odata.nextLink"] ?? undefined;
        if (!nextUrl) return null;
      }
      return null;
    } catch (error) {
      throw wrapGraphError(error, "look for an existing group chat");
    }
  }

  private async createGroupChat(
    client: any,
    myId: string,
    recipients: UserInfo[],
    topic: string | undefined
  ): Promise<string> {
    try {
      const chat = await client.api("/chats").post({
        chatType: "group",
        ...(topic ? { topic } : {}),
        members: [
          { "@odata.type": MEMBER_TYPE, roles: ["owner"], "user@odata.bind": userBind(myId) },
          ...recipients.map((user) => ({
            "@odata.type": MEMBER_TYPE,
            roles: [roleFor(user)],
            "user@odata.bind": userBind(user.id),
          })),
        ],
      });
      return chat.id;
    } catch (error) {
      throw wrapGraphError(error, "create a group chat");
    }
  }
}

function userBind(userId: string): string {
  return `https://graph.microsoft.com/v1.0/users('${userId}')`;
}

/** Graph requires the guest role for an in-tenant guest; everyone else is an owner, as in the Teams client. */
function roleFor(user: UserInfo): "owner" | "guest" {
  return isExternalUser(user) ? "guest" : "owner";
}

/**
 * Exact membership, not "contains": a chat with one extra person is a different
 * audience. Graph caps expanded members at 25, so a bigger chat never matches.
 */
function hasExactly(members: any[] | undefined, wanted: Set<string>): boolean {
  const ids = new Set((members ?? []).map((m) => m?.userId).filter(Boolean));
  return ids.size === wanted.size && [...wanted].every((id) => ids.has(id));
}

function topicMatches(chatTopic: string | null | undefined, topic: string | undefined): boolean {
  return topic === undefined || (chatTopic ?? "").trim().toLowerCase() === topic.toLowerCase();
}

/** The visibleHistoryStartDateTime to send, or undefined for no history. */
function historyStart(share: ShareHistory): string | undefined {
  if (share === "none") return undefined;
  if (share === "all") return ALL_HISTORY;
  if (!Number.isInteger(share) || share < 1 || share > 365) {
    throw new Error(`shareHistory must be "none", "all" or a whole number of days from 1 to 365, got ${share}.`);
  }
  return new Date(Date.now() - share * 24 * 60 * 60 * 1000).toISOString();
}
