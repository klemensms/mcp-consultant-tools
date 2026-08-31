/**
 * Shared rendering for message reads.
 *
 * Messages are rendered for a reader, not as raw Graph JSON: author, local
 * timestamp, body as plain text, and the message ID - the ID matters because it is
 * what a reply call needs next.
 *
 * One read shares a single body budget across its messages, so a wide read cannot
 * exhaust a context window while a narrow one can return a long message whole.
 * Narrowing with `top` or a date range therefore does buy a bigger per-message
 * budget - see allocateBodyBudgets.
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

/**
 * Body budget for one read, shared across every message in it.
 *
 * Set to what a default 20-message read used to cost at the old fixed 1500 chars
 * per message, so an ordinary read is no more expensive than before. The budget
 * being shared rather than per-message is what lets a narrow read spend it all on
 * one long message.
 */
const TOTAL_BODY_CHARS = 30_000;

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
  const budgets = allocateBodyBudgets(messages);
  const hint = truncationHint(messages.length);

  for (const [index, message] of messages.entries()) {
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

    const body = message.text
      ? truncateText(message.text, budgets[index] ?? 0, hint)
      : "_(no text content)_";
    lines.push(body);
    lines.push("");
  }

  lines.push(`**Total:** ${messages.length} message(s)`);

  return lines.join("\n");
}

/**
 * Split the read's body budget across its messages, max-min fair share.
 *
 * An equal split alone would be worse than the fixed cap it replaces: a single
 * long message inside a 50-message read would get 600 chars where it used to get
 * 1500. So the shortest messages are served first and whatever they do not use is
 * released to the ones still waiting. Real reads are mostly short messages, so in
 * practice one long message in an ordinary read comes back whole.
 *
 * Returns one budget per message, positionally aligned with `messages`.
 */
function allocateBodyBudgets(messages: MessageInfo[]): number[] {
  const budgets = new Array<number>(messages.length).fill(0);
  const shortestFirst = messages
    .map((message, index) => ({ length: message.text?.length ?? 0, index }))
    .sort((a, b) => a.length - b.length);

  let remaining = TOTAL_BODY_CHARS;
  let unserved = shortestFirst.length;

  for (const { length, index } of shortestFirst) {
    const share = Math.floor(remaining / unserved);
    const granted = Math.min(length, share);
    budgets[index] = granted;
    remaining -= granted;
    unserved--;
  }

  return budgets;
}

/**
 * What to do about a body that did not fit.
 *
 * A wider read can be narrowed, and narrowing now genuinely raises the budget. A
 * read that is already one message has nothing left to narrow, so it says so
 * rather than sending the caller round a loop that changes nothing.
 */
function truncationHint(readSize: number): string {
  return readSize > 1
    ? "narrow to this message with top: 1 and a since/until window for the full text"
    : "this message is over the whole-read budget, open it in Teams to read the rest";
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
      ? `  _(channel - team \`${hit.teamId}\`, channel \`${hit.channelId}\`)_`
      : `  _(channel \`${hit.channelId}\` - team could not be identified, open the link to read it)_`;
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
        `history, so **no deltaLink was issued** - one taken from a partial walk would silently ` +
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
