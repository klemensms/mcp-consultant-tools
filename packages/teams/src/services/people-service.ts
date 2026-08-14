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
import { wrapGraphError } from "./message-service.js";
import { buildOutboundMessage } from "../mentions.js";
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

/**
 * The marker Entra puts in a guest's user principal name:
 * `jane_contoso.com#EXT#@yourtenant.onmicrosoft.com`.
 *
 * A tenant directory holds far more than colleagues - suppliers, client contacts
 * and personal addresses invited to a channel all sit in `/users` and come back
 * from `$search` alongside staff. `userType` would say so outright, but reading it
 * needs `User.Read.All`, which is not consented and is not worth requesting for a
 * label; the guest UPN carries the same fact on the scope already held.
 *
 * ceiling: keys on the B2B guest marker, so someone genuinely external who was
 * given a full member account reads as a colleague. `userType` if that ever matters.
 */
const GUEST_UPN_MARKER = "#EXT#";

/** True when this directory entry is a guest rather than a member of the tenant. */
export function isExternalUser(user: UserInfo): boolean {
  return (user.userPrincipalName ?? "").toUpperCase().includes(GUEST_UPN_MARKER);
}

/** The best address to show a reader for a directory entry. */
function addressOf(user: UserInfo): string {
  return user.mail ?? user.userPrincipalName ?? user.id;
}

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
    return searchDirectoryUsers(client, query, options.top);
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
    const client = await this.teams.getGraphClient();
    return resolveDirectoryUser(client, nameOrEmail);
  }

  /**
   * Find the existing one-on-one chat with a user, if there is one.
   *
   * Graph exposes no filter for "the one-on-one chat with person X", so this pages
   * the signed-in user's one-on-one chats and matches on member userId. Returns
   * null when the walk finished without a match or ran out of pages.
   *
   * The match is on "some member holds this id", which is right for anybody else
   * and silently wrong for the signed-in user: they are a member of every chat in
   * the list, so their own id matches whichever page one happens to return first
   * and the caller is handed a colleague's thread. There is no self chat for this
   * lookup to find, so that case answers null before the walk starts.
   */
  async findOneOnOneChat(userId: string): Promise<string | null> {
    const me = await this.teams.getMe();
    if (userId === me.id) {
      return null;
    }

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

    // Addressing yourself is refused rather than served. A one-on-one chat needs
    // two people, so there is nothing correct to send to - and the failure mode is
    // the worst one this tool has: the chat lookup matches on membership, the
    // signed-in user is in all of their one-on-one chats, and the message lands on
    // whichever colleague came back first with nothing said about it.
    const me = await this.teams.getMe();
    if (recipient.id === me.id) {
      throw new Error(
        `"${nameOrEmail}" resolves to you. This tool messages someone else, and ` +
          `there is no one-on-one chat with yourself for it to use.`
      );
    }

    const existingChatId = await this.findOneOnOneChat(recipient.id);
    const chatId = existingChatId ?? (await this.createOneOnOneChat(recipient.id));

    const client = await this.teams.getGraphClient();

    try {
      const outbound = await buildOutboundMessage(client, content, options.format);

      const result = await client
        .api(`/chats/${chatId}/messages`)
        .post({ body: outbound.body, ...(outbound.mentions ? { mentions: outbound.mentions } : {}) });

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

/**
 * Find directory users by name, email or UPN.
 *
 * Module-level rather than a method because the mention builder needs the same
 * lookup, and it cannot reach PeopleService: PeopleService depends on TeamsService,
 * and TeamsService owns one of the four outbound paths that can carry a mention.
 * Routing both through this keeps one set of resolution semantics.
 */
export async function searchDirectoryUsers(
  client: any,
  query: string,
  top?: number
): Promise<UserInfo[]> {
  const term = sanitizeSearchTerm(query);

  try {
    const response = await client
      .api("/users")
      .header("ConsistencyLevel", "eventual")
      .count(true)
      .search(`"displayName:${term}" OR "mail:${term}" OR "userPrincipalName:${term}"`)
      .select(USER_SELECT)
      .top(clampUserTop(top))
      .get();

    return (response.value ?? []).map(toUserInfo);
  } catch (error) {
    throw wrapGraphError(error, `find users matching "${query}"`);
  }
}

/**
 * Resolve a name or email to exactly one user, or explain why it could not.
 *
 * An ambiguous name is never resolved by picking the first hit - messaging or
 * mentioning the wrong colleague is not a recoverable mistake. An exact match on
 * email, UPN or full display name wins over partial hits.
 *
 * A guest is only ever resolved from their exact address, never from a name. The
 * ambiguity rule alone does not cover this: a first name that happens to match one
 * supplier and no colleague is unambiguous, and would otherwise message a stranger
 * at another company with nothing said about it. Same unrecoverable mistake, and it
 * is the case a caller is least likely to be expecting.
 */
export async function resolveDirectoryUser(client: any, nameOrEmail: string): Promise<UserInfo> {
  const matches = await searchDirectoryUsers(client, nameOrEmail, MAX_USER_TOP);

  if (matches.length === 0) {
    throw new Error(
      `No user found matching "${nameOrEmail}". Try a full display name, email address ` +
        `or user principal name, or run find-user to see what the directory returns.`
    );
  }

  const needle = nameOrEmail.trim().toLowerCase();
  // Addressed, NOT merely matched: a full display name is enough to pick one person
  // out of several, but it is not the deliberate act that reaching outside the
  // organisation should take.
  const addressed = (user: UserInfo) =>
    user.mail?.toLowerCase() === needle || user.userPrincipalName?.toLowerCase() === needle;

  if (matches.length === 1) {
    return guardExternal(matches[0], nameOrEmail, addressed(matches[0]));
  }

  const exact = matches.filter(
    (user) => addressed(user) || user.displayName?.toLowerCase() === needle
  );

  if (exact.length === 1) {
    return guardExternal(exact[0], nameOrEmail, addressed(exact[0]));
  }

  const candidates = matches.slice(0, 10).map(describeCandidate).join("\n");

  throw new Error(
    `"${nameOrEmail}" matches ${matches.length} users. Re-run with the exact email ` +
      `address to say which one you mean:\n${candidates}`
  );
}

/** One line per candidate, saying plainly which of them are not colleagues. */
function describeCandidate(user: UserInfo): string {
  const guest = isExternalUser(user) ? " (guest - outside the organisation)" : "";
  return `  - ${user.displayName} <${addressOf(user)}>${guest}`;
}

/**
 * Refuse a guest resolved from anything other than their exact address.
 *
 * Deliberately an error rather than a warning: the caller here is usually an agent,
 * and a warning it prints after the message has gone is not a guard.
 */
function guardExternal(user: UserInfo, typed: string, byAddress: boolean): UserInfo {
  if (byAddress || !isExternalUser(user)) {
    return user;
  }

  const address = addressOf(user);
  throw new Error(
    `"${typed}" resolves to ${user.displayName} <${address}>, a guest in the directory ` +
      `rather than a colleague - messaging them sends outside the organisation. ` +
      `Re-run with "${address}" to confirm that is who you mean.`
  );
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
