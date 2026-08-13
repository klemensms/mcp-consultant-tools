/**
 * People Service - directory lookup and direct messaging
 *
 * Shares TeamsService's authenticated Graph client, like MessageService, so there
 * is one token cache and one sign-in for the package.
 *
 * Reachable on the consented delegated scopes:
 *   GET  /users?$search=...   -> User.ReadBasic.All
 *   GET  /me/chats            -> Chat.ReadBasic (Chat.ReadWrite is higher)
 *   POST /chats               -> Chat.Create    (Chat.ReadWrite is higher)
 *   POST /chats/{id}/messages -> ChatMessage.Send (Chat.ReadWrite is higher)
 */

import type { TeamsService } from "./teams-service.js";
import { buildMessageBody, wrapGraphError } from "./message-service.js";
import type { DirectMessageResult, UserInfo } from "../types.js";

/** Directory results to return by default. Enough to disambiguate, not to flood. */
const DEFAULT_USER_TOP = 10;

/** Graph allows far more, but a directory search this wide is never the useful answer. */
const MAX_USER_TOP = 25;

/** Chats fetched per page while looking for an existing one-on-one thread. */
const CHAT_PAGE_SIZE = 50;

/**
 * Pages of chats to walk looking for an existing one-on-one thread.
 *
 * A miss here is not dangerous: POST /chats for a oneOnOne is idempotent - Graph
 * returns the existing chat rather than creating a second one - so the worst case
 * is a chat reported as new when it was not, never a duplicate thread.
 */
const CHAT_LOOKUP_MAX_PAGES = 5;

/** Fields worth returning from a directory hit. */
const USER_SELECT = "id,displayName,userPrincipalName,mail,jobTitle";

export class PeopleService {
  constructor(private teams: TeamsService) {}

  /**
   * Find directory users by name, email or UPN.
   *
   * $search on /users is an advanced query: Graph rejects it outright without BOTH
   * the ConsistencyLevel: eventual header and $count=true, with an error that does
   * not mention either.
   */
  async findUsers(query: string, options: { top?: number } = {}): Promise<UserInfo[]> {
    const client = await this.teams.getGraphClient();
    const term = sanitizeSearchTerm(query);
    const top = clampUserTop(options.top);

    try {
      const response = await client
        .api("/users")
        .header("ConsistencyLevel", "eventual")
        .count(true)
        .search(`"displayName:${term}" OR "mail:${term}" OR "userPrincipalName:${term}"`)
        .select(USER_SELECT)
        .top(top)
        .get();

      return (response.value ?? []).map(toUserInfo);
    } catch (error) {
      throw wrapGraphError(error, `find users matching "${query}"`);
    }
  }

  /**
   * Resolve a name or email to exactly one user, or explain why it could not.
   *
   * An ambiguous name is never resolved by picking the first hit - messaging the
   * wrong colleague is not a recoverable mistake, and the caller has the context
   * needed to choose. An exact match on email, UPN or full display name wins over
   * partial hits, so "jane.doe@contoso.com" resolves even when several Janes exist.
   */
  async resolveUser(nameOrEmail: string): Promise<UserInfo> {
    const matches = await this.findUsers(nameOrEmail, { top: MAX_USER_TOP });

    if (matches.length === 0) {
      throw new Error(
        `No user found matching "${nameOrEmail}". Try a full display name, email address ` +
          `or user principal name, or run find-user to see what the directory returns.`
      );
    }

    if (matches.length === 1) {
      return matches[0];
    }

    const needle = nameOrEmail.trim().toLowerCase();
    const exact = matches.filter(
      (user) =>
        user.mail?.toLowerCase() === needle ||
        user.userPrincipalName?.toLowerCase() === needle ||
        user.displayName?.toLowerCase() === needle
    );

    if (exact.length === 1) {
      return exact[0];
    }

    const candidates = matches
      .slice(0, 10)
      .map((user) => `  - ${user.displayName} <${user.mail ?? user.userPrincipalName ?? user.id}>`)
      .join("\n");

    throw new Error(
      `"${nameOrEmail}" matches ${matches.length} users. Re-run with the exact email ` +
        `address to say which one you mean:\n${candidates}`
    );
  }

  /**
   * Find the existing one-on-one chat with a user, if there is one.
   *
   * Graph exposes no filter for "the one-on-one chat with person X", so this pages
   * the signed-in user's one-on-one chats and matches on member userId. Returns
   * null when the walk finished without a match or ran out of pages.
   */
  async findOneOnOneChat(userId: string): Promise<string | null> {
    const client = await this.teams.getGraphClient();

    let nextUrl: string | undefined;
    let pages = 0;

    try {
      while (pages < CHAT_LOOKUP_MAX_PAGES) {
        const response: any = nextUrl
          ? await client.api(nextUrl).get()
          : await client
              .api("/me/chats")
              .filter("chatType eq 'oneOnOne'")
              .expand("members")
              .top(CHAT_PAGE_SIZE)
              .get();

        pages++;

        for (const chat of response?.value ?? []) {
          const isMatch = (chat.members ?? []).some((member: any) => member?.userId === userId);
          if (isMatch) {
            return chat.id;
          }
        }

        nextUrl = response?.["@odata.nextLink"] ?? undefined;
        if (!nextUrl) {
          return null;
        }
      }

      return null;
    } catch (error) {
      throw wrapGraphError(error, "find an existing one-on-one chat");
    }
  }

  /**
   * Create the one-on-one chat between the signed-in user and one other user.
   *
   * Safe to call without checking first: Graph documents that only one one-on-one
   * chat can exist between two people, and that this returns the existing chat
   * rather than creating a second one.
   */
  async createOneOnOneChat(userId: string): Promise<string> {
    const client = await this.teams.getGraphClient();
    const me = await this.teams.getMe();

    try {
      const chat = await client.api("/chats").post({
        chatType: "oneOnOne",
        members: [
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${me.id}')`,
          },
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${userId}')`,
          },
        ],
      });

      return chat.id;
    } catch (error) {
      throw wrapGraphError(error, "create a one-on-one chat");
    }
  }

  /**
   * Send a direct message to a person, by name or email.
   *
   * Resolve -> find the existing one-on-one chat -> only create one if there is
   * none -> post. The lookup runs first so the result can honestly report whether
   * the message landed in an existing thread or opened a new one; the idempotence
   * of chat creation is the backstop, not the primary guard.
   */
  async sendDirectMessage(
    nameOrEmail: string,
    content: string,
    options: { format?: "text" | "markdown" } = {}
  ): Promise<DirectMessageResult> {
    const recipient = await this.resolveUser(nameOrEmail);

    const existingChatId = await this.findOneOnOneChat(recipient.id);
    const chatId = existingChatId ?? (await this.createOneOnOneChat(recipient.id));

    const client = await this.teams.getGraphClient();

    try {
      const result = await client
        .api(`/chats/${chatId}/messages`)
        .post({ body: buildMessageBody(content, options.format) });

      return {
        messageId: result.id,
        webUrl: result.webUrl,
        chatId,
        chatExisted: existingChatId !== null,
        recipient,
      };
    } catch (error) {
      throw wrapGraphError(error, `send a direct message to ${recipient.displayName}`);
    }
  }
}

/** Clamp a caller-supplied directory page size. */
function clampUserTop(top?: number): number {
  if (!top || top < 1) {
    return DEFAULT_USER_TOP;
  }
  return Math.min(Math.floor(top), MAX_USER_TOP);
}

/**
 * Strip characters that would break out of the quoted $search clause.
 *
 * The term is interpolated inside "field:term" pairs, so a stray double quote
 * turns one clause into several and Graph answers with a parse error rather than
 * a result. Backslashes go too, since they escape the quote.
 */
function sanitizeSearchTerm(query: string): string {
  const cleaned = query.replace(/["\\]/g, "").trim();
  if (!cleaned) {
    throw new Error("Search term is empty. Provide a name, email address or user principal name.");
  }
  return cleaned;
}

/** Map a Graph user onto the reader-facing shape. */
function toUserInfo(user: any): UserInfo {
  return {
    id: user.id,
    displayName: user.displayName ?? "(no display name)",
    userPrincipalName: user.userPrincipalName ?? undefined,
    mail: user.mail ?? undefined,
    jobTitle: user.jobTitle ?? undefined,
  };
}
