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
import type { ChatInfo, MessageInfo } from "../types.js";

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
    if (message.messageType && message.messageType !== "message") {
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
    const lastActivity = chat.lastUpdatedDateTime ? formatTimestamp(chat.lastUpdatedDateTime) : "-";
    const members = chat.memberNames?.length ? chat.memberNames.join(", ") : "-";

    lines.push(`| ${escapeCell(topic)} | ${chat.chatType} | \`${chat.id}\` | ${lastActivity} | ${escapeCell(members)} |`);
  }

  lines.push("", `**Total:** ${chats.length} chat(s)`);

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
