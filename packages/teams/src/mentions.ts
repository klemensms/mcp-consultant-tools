/**
 * @-mention support for outbound messages
 *
 * A mention is not just a name in the text. Graph needs BOTH an `<at id="N">`
 * element in the message body AND a matching entry in the message's `mentions[]`
 * array carrying the resolved AAD user id. Send one without the other and Teams
 * renders a literal `<at>` tag, or drops the mention silently.
 *
 * Callers write `@[Name or email]` inline in the message. This module parses those
 * markers, resolves each to exactly one directory user, and returns the paired
 * body + mentions array. Every outbound path in the package routes through
 * buildOutboundMessage, so the two halves cannot drift apart.
 */

import { markdownToHtml } from "./message-content.js";
import { resolveDirectoryUser } from "./services/people-service.js";
import type { UserInfo } from "./types.js";

/**
 * Inline mention marker: @[Jane Doe] or @[jdoe@example.com].
 *
 * Brackets are required. "@Jane Doe" is not parseable - there is no way to know
 * where the name ends, and guessing would mention the wrong person or swallow the
 * next word of the sentence.
 */
const MENTION_PATTERN = /@\[([^\]\n]+)\]/g;

/**
 * Placeholder standing in for a mention while the body goes through markdown
 * conversion and sanitisation.
 *
 * Deliberately plain alphanumerics: markdown leaves it alone, and DOMPurify has no
 * reason to touch it. Injecting the real `<at>` element before sanitisation would
 * mean either widening the tag allowlist or watching the sanitizer strip the very
 * markup we just added.
 */
function placeholderFor(index: number): string {
  return `zzMcpTeamsMentionzz${index}zz`;
}

/** A chatMessage mention entry, in the shape Graph expects on send. */
export interface OutboundMention {
  id: number;
  mentionText: string;
  mentioned: {
    user: {
      displayName: string;
      id: string;
      userIdentityType: "aadUser";
    };
  };
}

export interface OutboundMessage {
  body: { contentType: "text" | "html"; content: string };
  /** Omitted entirely when the message mentions nobody. */
  mentions?: OutboundMention[];
}

/** The distinct mention targets named in a message, in first-appearance order. */
export function extractMentionTargets(content: string): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];

  for (const match of content.matchAll(MENTION_PATTERN)) {
    const target = match[1].trim();
    const key = target.toLowerCase();
    if (target && !seen.has(key)) {
      seen.add(key);
      targets.push(target);
    }
  }

  return targets;
}

/**
 * Build the body (and mentions array) for an outbound message.
 *
 * `client` is only touched when the message actually contains a mention marker, so
 * the overwhelmingly common no-mention path costs no directory calls and works
 * unchanged on a token without User.ReadBasic.All.
 *
 * The same person mentioned twice resolves once and reuses the id: Graph keys
 * `mentions[]` on the `<at id>`, and two entries for one person renders as a
 * duplicate mention in the Teams client.
 */
export async function buildOutboundMessage(
  client: any,
  content: string,
  format?: "text" | "markdown"
): Promise<OutboundMessage> {
  const targets = extractMentionTargets(content);

  if (targets.length === 0) {
    return {
      body:
        format === "text"
          ? { contentType: "text", content }
          : { contentType: "html", content: markdownToHtml(content) },
    };
  }

  // Resolution is sequential on purpose: a failure names the marker that could not
  // be resolved, and an ambiguous name must stop the send rather than race others.
  const resolved: UserInfo[] = [];
  for (const target of targets) {
    try {
      resolved.push(await resolveDirectoryUser(client, target));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not resolve the mention @[${target}]: ${reason}`);
    }
  }

  // Swap markers for placeholders before conversion, keyed by target so a repeated
  // mention maps to the same id.
  const indexByTarget = new Map(targets.map((t, i) => [t.toLowerCase(), i]));
  const withPlaceholders = content.replace(MENTION_PATTERN, (whole, raw: string) => {
    const index = indexByTarget.get(raw.trim().toLowerCase());
    return index === undefined ? whole : placeholderFor(index);
  });

  // A mention only renders from an HTML body, so a "text" message carrying one is
  // escaped and wrapped rather than refused - the caller's intent (do not interpret
  // markdown) is preserved either way.
  const converted =
    format === "text"
      ? escapeHtml(withPlaceholders).replace(/\n/g, "<br>")
      : markdownToHtml(withPlaceholders);

  const finalContent = resolved.reduce(
    (html, user, index) =>
      html.split(placeholderFor(index)).join(`<at id="${index}">${escapeHtml(user.displayName)}</at>`),
    converted
  );

  return {
    body: { contentType: "html", content: finalContent },
    mentions: resolved.map((user, index) => ({
      id: index,
      mentionText: user.displayName,
      mentioned: {
        user: {
          displayName: user.displayName,
          id: user.id,
          userIdentityType: "aadUser" as const,
        },
      },
    })),
  };
}

/**
 * Escape text that is injected after sanitisation.
 *
 * The `<at>` markup is built here rather than sanitized, because DOMPurify would
 * strip it. That is only safe while everything interpolated into it is escaped:
 * the id is an integer we generated, and the display name comes from Graph but is
 * still attacker-influenceable (a display name can contain anything).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
