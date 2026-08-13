/**
 * Shared rendering for message reads.
 *
 * Messages are rendered for a reader, not as raw Graph JSON: author, local
 * timestamp, body as plain text, and the message ID - the ID matters because it is
 * what a reply call needs next.
 *
 * Long bodies are truncated per message so one wide read cannot exhaust a context
 * window; the caller can narrow with `top` or a date range and read the rest.
 */

import { truncateText } from "../message-content.js";
import { isExternalUser } from "../services/people-service.js";
import type {
  ChannelDeltaResult,
  ChatInfo,
  MessageInfo,
  MessageSearchHit,
  MessageSearchResult,
  UserInfo,
} from "../types.js";

/** Per-message body budget. A 20-message read stays well inside a context window. */
const MAX_BODY_CHARS = 1500;

export interface FormatOptions {
  heading: string;
  emptyMessage: string;
  /** Show the reply count when Graph supplied one. */
  showReplyCount?: boolean;
}

export function formatMessages(messages: MessageInfo[], options: FormatOptions): string {
  if (messages.length === 0) {
    return options.emptyMessage;
  }

  const lines: string[] = [`## ${options.heading}`, ""];

  for (const message of messages) {
    const timestamp = formatTimestamp(message.createdDateTime);
    const flags: string[] = [];

    if (message.importance && message.importance !== "normal") {
      flags.push(message.importance);
    }
    // Graph types some system events as the enum placeholder "unknownFutureValue"
    // and describes them in eventDetail instead. Showing the placeholder tells a
    // reader nothing - the body already renders as [system message].
    const placeholderType = message.messageType === "unknownFutureValue" && message.hasEventDetail;

    if (message.messageType && message.messageType !== "message" && !placeholderType) {
      flags.push(message.messageType);
    }
    if (message.isDeleted) {
      flags.push("deleted");
    }
    if (options.showReplyCount && message.replyCount) {
      flags.push(`${message.replyCount} ${message.replyCount === 1 ? "reply" : "replies"}`);
    }

    const flagSuffix = flags.length > 0 ? `  _(${flags.join(", ")})_` : "";

    lines.push(`**${message.authorName}** · ${timestamp} · \`${message.id}\`${flagSuffix}`);

    const body = message.text ? truncateText(message.text, MAX_BODY_CHARS) : "_(no text content)_";
    lines.push(body);
    lines.push("");
  }

  lines.push(`**Total:** ${messages.length} message(s)`);

  return lines.join("\n");
}

export function formatChats(chats: ChatInfo[]): string {
  if (chats.length === 0) {
    return "No chats found.";
  }

  const lines: string[] = [
    "## Chats",
    "",
    "| Topic | Type | ID | Last activity | Members |",
    "|-------|------|----|---------------|---------|",
  ];

  for (const chat of chats) {
    const topic = chat.topic || describeUntitledChat(chat);
    // The list is ordered by the last message, so show that. lastUpdatedDateTime
    // tracks changes to the chat rather than messages in it and can sit weeks
    // behind, which reads as a colleague who has gone quiet when they have not.
    const lastActivityAt = chat.lastMessageDateTime ?? chat.lastUpdatedDateTime;
    const lastActivity = lastActivityAt ? formatTimestamp(lastActivityAt) : "-";
    const members = chat.memberNames?.length ? chat.memberNames.join(", ") : "-";

    lines.push(`| ${escapeCell(topic)} | ${chat.chatType} | \`${chat.id}\` | ${lastActivity} | ${escapeCell(members)} |`);
  }

  lines.push("", `**Total:** ${chats.length} chat(s)`);

  return lines.join("\n");
}

export function formatUsers(users: UserInfo[]): string {
  if (users.length === 0) {
    return "No matching users found.";
  }

  const lines: string[] = [
    "## Users",
    "",
    "| Name | Email | Job title | In org | ID |",
    "|------|-------|-----------|--------|----|",
  ];

  let guests = 0;

  for (const user of users) {
    const email = user.mail ?? user.userPrincipalName ?? "-";
    // A directory search reaches guests as readily as colleagues, and an email
    // domain is easy to skim past. Say which is which in its own column.
    const external = isExternalUser(user);
    if (external) {
      guests++;
    }
    lines.push(
      `| ${escapeCell(user.displayName)} | ${escapeCell(email)} | ${escapeCell(user.jobTitle ?? "-")} | ${external ? "guest" : "yes"} | \`${user.id}\` |`
    );
  }

  lines.push("", `**Total:** ${users.length} user(s)`);
  if (guests > 0) {
    lines.push(
      "",
      `${guests === 1 ? "One of these is a guest" : `${guests} of these are guests`}, outside the organisation. ` +
        `Guests can only be messaged or mentioned by their exact email address, never by name.`
    );
  }

  return lines.join("\n");
}

export function formatSearchResults(result: MessageSearchResult, query: string): string {
  if (result.hits.length === 0) {
    return `No messages found matching "${query}".`;
  }

  const lines: string[] = [`## Message search: "${query}"`, ""];

  for (const hit of result.hits) {
    const timestamp = hit.createdDateTime ? formatTimestamp(hit.createdDateTime) : "unknown time";
    lines.push(`**${hit.authorName}** · ${timestamp} · \`${hit.id}\`${describeHitLocation(hit)}`);
    lines.push(hit.text || hit.summary || "_(no text content)_");
    // The whole point of a hit is getting back to the message. The ids do that for a
    // follow-up read; the deep link does it for a person.
    if (hit.webUrl) {
      lines.push(`View: ${hit.webUrl}`);
    }
    lines.push("");
  }

  // Graph's total is an estimate over the whole matching set, not the page - saying
  // "20 of about 340" is the difference between a complete answer and a first page.
  const shown =
    result.totalMatches && result.totalMatches > result.hits.length
      ? `${result.hits.length} of about ${result.totalMatches} match(es)`
      : `${result.hits.length} match(es)`;

  lines.push(`**Showing:** ${shown}`);
  if (result.moreResultsAvailable) {
    lines.push("More results are available - raise `top`, or page with `from`.");
  }

  return lines.join("\n");
}

/**
 * Say where a hit came from, and carry the ids a follow-up read needs.
 * A channel hit needs teamId + channelId; a chat hit needs chatId.
 *
 * A channel hit can arrive with no usable team id - see confirmChannelTeams in
 * search-service. Say so rather than omitting the location, so the reader knows
 * the message is in a channel and why they cannot read it straight from here.
 */
function describeHitLocation(hit: MessageSearchHit): string {
  if (hit.channelId) {
    return hit.teamId
      ? `  _(channel — team \`${hit.teamId}\`, channel \`${hit.channelId}\`)_`
      : `  _(channel \`${hit.channelId}\` — team could not be identified, open the link to read it)_`;
  }
  if (hit.chatId) {
    return `  _(chat \`${hit.chatId}\`)_`;
  }
  return "";
}

export function formatDelta(result: ChannelDeltaResult): string {
  const body =
    result.messages.length === 0
      ? "No new or changed messages since the last delta."
      : formatMessages(result.messages, {
          heading: "Channel changes",
          emptyMessage: "No new or changed messages since the last delta.",
        });

  const lines = [body, ""];

  if (result.truncated) {
    lines.push(
      `⚠️ Stopped after ${result.pagesFetched} page(s) before reaching the end of the channel's ` +
        `history, so **no deltaLink was issued** — one taken from a partial walk would silently ` +
        `skip everything beyond the cut. Re-run with a higher \`maxPages\` to complete the ` +
        `first pass.`
    );
  } else if (result.deltaLink) {
    lines.push(
      "Pass this `deltaLink` to the next call to get only what changes after this point:",
      "",
      `\`${result.deltaLink}\``
    );
  }

  return lines.join("\n");
}

/** One-on-one chats have no topic; name them by their members when known. */
function describeUntitledChat(chat: ChatInfo): string {
  if (chat.memberNames?.length) {
    return chat.memberNames.join(", ");
  }
  return "(no topic)";
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

/** Keep table cells from breaking the markdown table. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
