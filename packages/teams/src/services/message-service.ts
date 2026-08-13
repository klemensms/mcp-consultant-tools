/**
 * Message Service - reading and replying to Teams channel messages and chats
 *
 * Shares TeamsService's authenticated Graph client rather than owning auth, so
 * there is one token cache and one sign-in for the whole package.
 *
 * Every method here is reachable on the delegated scopes consented for this app
 * registration (ChannelMessage.Read.All, ChannelMessage.Send, Chat.ReadWrite,
 * User.Read). Verified against the Graph v1.0 permission tables:
 *   channel messages / replies  -> ChannelMessage.Read.All
 *   reply to channel message    -> ChannelMessage.Send
 *   list chats / chat members   -> Chat.ReadBasic (Chat.ReadWrite is higher)
 *   chat messages               -> Chat.Read      (Chat.ReadWrite is higher)
 *   send chat message           -> ChatMessage.Send (Chat.ReadWrite is higher)
 *   markChatReadForUser         -> Chat.ReadWrite (only listed permission)
 *   channel message reactions   -> ChannelMessage.Send
 *   chat message reactions      -> Chat.ReadWrite
 */

import type { TeamsService } from "./teams-service.js";
import { htmlToText } from "../message-content.js";
import { buildOutboundMessage } from "../mentions.js";
import type {
  ChannelDeltaResult,
  ChatInfo,
  MessageInfo,
  MessageReadOptions,
  ReactionType,
  SendMessageResult,
} from "../types.js";

/**
 * setReaction/unsetReaction want the Unicode emoji character in reactionType,
 * not the friendly name - posting the name returns HTTP 400 "Unicode 'like' in
 * the payload is not supported". Callers keep the names everywhere else (tool
 * schema, CLI --type, error text); they are mapped here, immediately before the
 * wire. These values are confirmed against a live tenant, not inferred from the
 * Graph reference, which documents the names. ❤️ is two code points
 * (U+2764 U+FE0F) and the variation selector is part of what was confirmed.
 */
const REACTION_EMOJI: Record<ReactionType, string> = {
  like: "👍",
  angry: "😠",
  sad: "😢",
  laugh: "😆",
  heart: "❤️",
  surprised: "😮",
};

/** Default page size for message reads - a busy channel will exhaust a context window. */
const DEFAULT_TOP = 20;

/** Graph caps $top at 50 for both channel and chat message collections. */
const MAX_TOP = 50;

/**
 * Pages a cold-start delta walk will follow before giving up.
 * Graph ignores $deltatoken=latest here, so a first call has to walk the channel's
 * whole history to reach a deltaLink; this stops a busy channel walking forever.
 */
const DEFAULT_DELTA_MAX_PAGES = 10;

export class MessageService {
  constructor(private teams: TeamsService) {}

  /**
   * Read recent messages from a channel, newest first, without their replies.
   *
   * Channel messages support only $top and $expand - no $filter or $orderby - so
   * the since/until range is applied client-side over the fetched page. Widen `top`
   * if a range returns fewer messages than expected.
   */
  async getChannelMessages(
    options: MessageReadOptions & { teamId?: string; channelId?: string } = {}
  ): Promise<MessageInfo[]> {
    const client = await this.teams.getGraphClient();
    const teamId = this.teams.getTeamId(options.teamId);
    const channelId = this.teams.getChannelId(options.channelId);
    const top = clampTop(options.top);

    try {
      const response = await client
        .api(`/teams/${teamId}/channels/${channelId}/messages`)
        .top(top)
        .get();

      const messages = (response.value ?? []).map(toMessageInfo);
      return applyDateRange(messages, options);
    } catch (error) {
      throw wrapGraphError(error, "read channel messages");
    }
  }

  /**
   * Incremental channel read: everything created or changed since a previous call.
   *
   * Pass the `deltaLink` a previous call returned to get only what changed since.
   * With no deltaLink this is a cold start, and a cold start is expensive: Graph
   * does NOT honour `$deltatoken=latest` on this endpoint, so the only way to reach
   * a usable deltaLink is to page to the end of the channel's history once.
   *
   * `maxPages` bounds that walk. Stopping early is reported rather than hidden -
   * a truncated cold start returns no deltaLink at all, because a deltaLink from a
   * partial walk would silently skip every message beyond the cut.
   *
   * The v1.0 delta response is undocumented but real, so the shape is read
   * defensively.
   */
  async getChannelMessagesDelta(
    options: {
      teamId?: string;
      channelId?: string;
      deltaLink?: string;
      maxPages?: number;
    } = {}
  ): Promise<ChannelDeltaResult> {
    const client = await this.teams.getGraphClient();
    const teamId = this.teams.getTeamId(options.teamId);
    const channelId = this.teams.getChannelId(options.channelId);
    const maxPages = Math.max(1, Math.floor(options.maxPages ?? DEFAULT_DELTA_MAX_PAGES));

    let nextUrl: string | undefined =
      options.deltaLink ?? `/teams/${teamId}/channels/${channelId}/messages/delta`;
    let deltaLink: string | undefined;
    const messages: MessageInfo[] = [];
    let pagesFetched = 0;

    try {
      while (nextUrl && pagesFetched < maxPages) {
        const response: any = await client.api(nextUrl).get();
        pagesFetched++;

        for (const raw of response?.value ?? []) {
          messages.push(toMessageInfo(raw));
        }

        deltaLink = response?.["@odata.deltaLink"] ?? undefined;
        nextUrl = response?.["@odata.nextLink"] ?? undefined;

        // A deltaLink ends the walk: there is nothing further to page.
        if (deltaLink) {
          break;
        }
      }
    } catch (error) {
      throw wrapGraphError(error, "read channel message delta");
    }

    const truncated = !deltaLink && Boolean(nextUrl);

    return {
      messages,
      // Only hand back a deltaLink that actually represents a complete walk.
      deltaLink: truncated ? undefined : deltaLink,
      pagesFetched,
      truncated,
    };
  }

  /**
   * Read the replies to a single channel message.
   * Kept separate from getChannelMessages so a wide skim stays cheap.
   */
  async getMessageReplies(
    messageId: string,
    options: MessageReadOptions & { teamId?: string; channelId?: string } = {}
  ): Promise<MessageInfo[]> {
    const client = await this.teams.getGraphClient();
    const teamId = this.teams.getTeamId(options.teamId);
    const channelId = this.teams.getChannelId(options.channelId);
    const top = clampTop(options.top);

    try {
      const response = await client
        .api(`/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`)
        .top(top)
        .get();

      const messages = (response.value ?? []).map(toMessageInfo);
      return applyDateRange(messages, options);
    } catch (error) {
      throw wrapGraphError(error, `read replies to message ${messageId}`);
    }
  }

  /**
   * Post a reply to an existing channel message.
   */
  async replyToMessage(
    messageId: string,
    content: string,
    options: {
      teamId?: string;
      channelId?: string;
      format?: "text" | "markdown";
    } = {}
  ): Promise<SendMessageResult> {
    const client = await this.teams.getGraphClient();
    const teamId = this.teams.getTeamId(options.teamId);
    const channelId = this.teams.getChannelId(options.channelId);

    try {
      const outbound = await buildOutboundMessage(client, content, options.format);

      const result = await client
        .api(`/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`)
        .post({ body: outbound.body, ...(outbound.mentions ? { mentions: outbound.mentions } : {}) });

      return { messageId: result.id, webUrl: result.webUrl };
    } catch (error) {
      throw wrapGraphError(error, `reply to message ${messageId}`);
    }
  }

  /**
   * List the chats the signed-in user is part of, most recently active first.
   *
   * Member names come from $expand=members, which Graph caps at 25 members per
   * chat regardless of $top. Those member ids are the only directory data this
   * registration can see - it cannot search users by name.
   */
  async listChats(options: { top?: number; includeMembers?: boolean } = {}): Promise<ChatInfo[]> {
    const client = await this.teams.getGraphClient();
    const top = clampTop(options.top);

    try {
      // lastMessagePreview is the property this list is ordered by, but Graph
      // does not return it unless it is expanded - so without this the caller
      // sees no timestamp for the very thing determining the order.
      const expand = options.includeMembers
        ? "members,lastMessagePreview"
        : "lastMessagePreview";

      const request = client
        .api("/me/chats")
        .top(top)
        .orderby("lastMessagePreview/createdDateTime desc")
        .expand(expand);

      const response = await request.get();

      return (response.value ?? []).map((chat: any) => ({
        id: chat.id,
        topic: chat.topic ?? undefined,
        chatType: chat.chatType ?? "unknown",
        memberNames: chat.members
          ? chat.members.map((m: any) => m.displayName).filter(Boolean)
          : undefined,
        lastMessageDateTime: chat.lastMessagePreview?.createdDateTime ?? undefined,
        lastUpdatedDateTime: chat.lastUpdatedDateTime ?? undefined,
        webUrl: chat.webUrl ?? undefined,
      }));
    } catch (error) {
      throw wrapGraphError(error, "list chats");
    }
  }

  /**
   * Read recent messages from a chat, newest first.
   *
   * Chat messages do support server-side filtering, but only when $orderby and
   * $filter name the same property - so the range is expressed against
   * lastModifiedDateTime, the one property accepting both gt and lt.
   */
  async getChatMessages(chatId: string, options: MessageReadOptions = {}): Promise<MessageInfo[]> {
    const client = await this.teams.getGraphClient();
    const top = clampTop(options.top);

    try {
      let request = client.api(`/chats/${chatId}/messages`).top(top);

      const filters: string[] = [];
      if (options.since) {
        filters.push(`lastModifiedDateTime gt ${toGraphDate(options.since)}`);
      }
      if (options.until) {
        filters.push(`lastModifiedDateTime lt ${toGraphDate(options.until)}`);
      }

      if (filters.length > 0) {
        request = request.orderby("lastModifiedDateTime desc").filter(filters.join(" and "));
      }

      const response = await request.get();
      return (response.value ?? []).map(toMessageInfo);
    } catch (error) {
      throw wrapGraphError(error, `read messages in chat ${chatId}`);
    }
  }

  /**
   * Send a message to an existing chat. Cannot create a chat - use listChats to
   * find the id of one that already exists.
   */
  async sendChatMessage(
    chatId: string,
    content: string,
    options: { format?: "text" | "markdown" } = {}
  ): Promise<SendMessageResult> {
    const client = await this.teams.getGraphClient();

    try {
      const outbound = await buildOutboundMessage(client, content, options.format);

      const result = await client
        .api(`/chats/${chatId}/messages`)
        .post({ body: outbound.body, ...(outbound.mentions ? { mentions: outbound.mentions } : {}) });

      return { messageId: result.id, webUrl: result.webUrl };
    } catch (error) {
      throw wrapGraphError(error, `send message to chat ${chatId}`);
    }
  }

  /**
   * Add or remove a reaction on a channel message, or on one reply within its
   * thread. Both actions run on ChannelMessage.Send and share the message path.
   */
  async reactToChannelMessage(
    messageId: string,
    options: {
      teamId?: string;
      channelId?: string;
      replyId?: string;
      reactionType?: ReactionType;
      action?: "add" | "remove";
    } = {}
  ): Promise<void> {
    const client = await this.teams.getGraphClient();
    const teamId = this.teams.getTeamId(options.teamId);
    const channelId = this.teams.getChannelId(options.channelId);
    const reactionType = options.reactionType ?? "like";
    const remove = options.action === "remove";

    const messagePath = options.replyId
      ? `/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies/${options.replyId}`
      : `/teams/${teamId}/channels/${channelId}/messages/${messageId}`;

    try {
      await client
        .api(`${messagePath}/${remove ? "unsetReaction" : "setReaction"}`)
        .post({ reactionType: REACTION_EMOJI[reactionType] });
    } catch (error) {
      throw wrapGraphError(
        error,
        `${remove ? "remove" : "add"} ${reactionType} reaction on message ${options.replyId ?? messageId}`
      );
    }
  }

  /**
   * Add or remove a reaction on a chat message. Runs on Chat.ReadWrite.
   */
  async reactToChatMessage(
    chatId: string,
    messageId: string,
    options: { reactionType?: ReactionType; action?: "add" | "remove" } = {}
  ): Promise<void> {
    const client = await this.teams.getGraphClient();
    const reactionType = options.reactionType ?? "like";
    const remove = options.action === "remove";

    try {
      await client
        .api(`/chats/${chatId}/messages/${messageId}/${remove ? "unsetReaction" : "setReaction"}`)
        .post({ reactionType: REACTION_EMOJI[reactionType] });
    } catch (error) {
      throw wrapGraphError(
        error,
        `${remove ? "remove" : "add"} ${reactionType} reaction on chat message ${messageId}`
      );
    }
  }

  /**
   * Mark a chat as read for the signed-in user.
   * Graph requires the caller's own AAD id and tenant in the body.
   */
  async markChatRead(chatId: string): Promise<void> {
    const client = await this.teams.getGraphClient();
    const me = await this.teams.getMe();

    try {
      await client.api(`/chats/${chatId}/markChatReadForUser`).post({
        user: { id: me.id, tenantId: this.teams.getTenantId() },
      });
    } catch (error) {
      throw wrapGraphError(error, `mark chat ${chatId} as read`);
    }
  }
}

/** Clamp a caller-supplied page size into Graph's accepted range. */
export function clampTop(top?: number): number {
  if (!top || top < 1) {
    return DEFAULT_TOP;
  }
  return Math.min(Math.floor(top), MAX_TOP);
}

/** Graph wants an unquoted ISO-8601 literal in $filter. */
function toGraphDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date "${value}". Use an ISO-8601 timestamp, e.g. 2026-08-01T00:00:00Z`);
  }
  return parsed.toISOString();
}

/** Map a Graph chatMessage onto the reader-facing shape. */
function toMessageInfo(message: any): MessageInfo {
  const user = message.from?.user;
  const application = message.from?.application;

  const authorName =
    user?.displayName ??
    application?.displayName ??
    (message.messageType && message.messageType !== "message" ? "System" : "Unknown");

  return {
    id: message.id,
    createdDateTime: message.createdDateTime,
    lastModifiedDateTime: message.lastModifiedDateTime ?? undefined,
    authorName,
    authorId: user?.id ?? undefined,
    text: htmlToText(message.body?.content ?? "", message.body?.contentType, message.mentions),
    replyCount: message["replies@odata.count"] ?? undefined,
    importance: message.importance ?? undefined,
    messageType: message.messageType ?? undefined,
    webUrl: message.webUrl ?? undefined,
    isDeleted: message.deletedDateTime ? true : undefined,
    hasEventDetail: message.eventDetail ? true : undefined,
  };
}

/**
 * Filter a fetched page by modification date.
 * Used for channel messages, where Graph supports no $filter.
 */
function applyDateRange(messages: MessageInfo[], options: MessageReadOptions): MessageInfo[] {
  if (!options.since && !options.until) {
    return messages;
  }

  const since = options.since ? new Date(toGraphDate(options.since)).getTime() : undefined;
  const until = options.until ? new Date(toGraphDate(options.until)).getTime() : undefined;

  return messages.filter((message) => {
    const stamp = new Date(message.lastModifiedDateTime ?? message.createdDateTime).getTime();
    if (since !== undefined && stamp < since) return false;
    if (until !== undefined && stamp >= until) return false;
    return true;
  });
}

/**
 * Turn a Graph failure into an actionable message.
 * A 403 here almost always means the token predates a scope change, which is
 * invisible from the error text alone.
 */
export function wrapGraphError(error: unknown, action: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = (error as { statusCode?: number })?.statusCode;

  if (statusCode === 403) {
    return new Error(
      `Failed to ${action}: ${message}\n\n` +
        `This is a permissions failure. If you authenticated before this version was installed, ` +
        `the cached token carries a narrower scope set - run 'logout' then 'authenticate' to get one ` +
        `with the current scopes.`
    );
  }

  return new Error(`Failed to ${action}: ${message}`);
}
