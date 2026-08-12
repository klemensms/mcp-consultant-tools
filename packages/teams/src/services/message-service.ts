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
 */

import type { TeamsService } from "./teams-service.js";
import { htmlToText, markdownToHtml, sanitizeHtml } from "../message-content.js";
import type {
  ChatInfo,
  MessageInfo,
  MessageReadOptions,
  SendMessageResult,
} from "../types.js";

/** Default page size for message reads - a busy channel will exhaust a context window. */
const DEFAULT_TOP = 20;

/** Graph caps $top at 50 for both channel and chat message collections. */
const MAX_TOP = 50;

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
      const result = await client
        .api(`/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`)
        .post({ body: buildMessageBody(content, options.format) });

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
      let request = client
        .api("/me/chats")
        .top(top)
        .orderby("lastMessagePreview/createdDateTime desc");

      if (options.includeMembers) {
        request = request.expand("members");
      }

      const response = await request.get();

      return (response.value ?? []).map((chat: any) => ({
        id: chat.id,
        topic: chat.topic ?? undefined,
        chatType: chat.chatType ?? "unknown",
        memberNames: chat.members
          ? chat.members.map((m: any) => m.displayName).filter(Boolean)
          : undefined,
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
      const result = await client
        .api(`/chats/${chatId}/messages`)
        .post({ body: buildMessageBody(content, options.format) });

      return { messageId: result.id, webUrl: result.webUrl };
    } catch (error) {
      throw wrapGraphError(error, `send message to chat ${chatId}`);
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
function clampTop(top?: number): number {
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

/**
 * Build a chatMessage body, routing markdown through the shared sanitizer.
 * Model-generated HTML is never handed to Graph unsanitized.
 */
function buildMessageBody(content: string, format?: "text" | "markdown") {
  if (format === "text") {
    return { contentType: "text", content };
  }
  if (format === "markdown" || format === undefined) {
    return { contentType: "html", content: markdownToHtml(content) };
  }
  return { contentType: "html", content: sanitizeHtml(content) };
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
    text: htmlToText(message.body?.content ?? "", message.body?.contentType),
    replyCount: message["replies@odata.count"] ?? undefined,
    importance: message.importance ?? undefined,
    messageType: message.messageType ?? undefined,
    webUrl: message.webUrl ?? undefined,
    isDeleted: message.deletedDateTime ? true : undefined,
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
function wrapGraphError(error: unknown, action: string): Error {
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
