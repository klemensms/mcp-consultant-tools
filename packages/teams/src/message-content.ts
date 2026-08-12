/**
 * Message content conversion for Teams
 *
 * Outbound: markdown -> sanitized HTML. Every message this package sends goes
 * through markdownToHtml, so model-generated markup is never handed to Graph raw.
 *
 * Inbound: Graph message HTML -> readable plain text, so a channel or chat read
 * returns something a person can scan instead of a wall of div soup.
 */

import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";
import { marked } from "marked";

/** Tags Teams renders in a message body. */
const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
  "code", "pre", "blockquote", "ul", "ol", "li", "a",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td",
];

const ALLOWED_ATTR = ["href", "target"];

/**
 * Convert markdown to sanitized HTML for Teams.
 */
export function markdownToHtml(markdown: string): string {
  // Create a DOM for DOMPurify (use any to avoid complex type mismatch with JSDOM)
  const window = new JSDOM("").window;
  const purify = DOMPurify(window as any);

  const rawHtml = marked.parse(markdown, { async: false }) as string;

  return purify.sanitize(rawHtml, { ALLOWED_TAGS, ALLOWED_ATTR });
}

/**
 * Sanitize a caller-supplied HTML message body.
 * Used when a message is sent with contentType "html" so the same allowlist
 * applies whether the content arrived as markdown or as HTML.
 */
export function sanitizeHtml(html: string): string {
  const window = new JSDOM("").window;
  const purify = DOMPurify(window as any);
  return purify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

/** Elements that should produce a line break when flattened to text. */
const BLOCK_TAGS = new Set([
  "P", "DIV", "BR", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6",
  "BLOCKQUOTE", "PRE", "UL", "OL", "TABLE",
]);

/**
 * Flatten Teams message HTML to readable plain text.
 *
 * Keeps @-mentions as "@Name", marks images and attachments as placeholders
 * (their content is a Graph hostedContents URL, useless to a reader), and
 * collapses the div nesting Teams emits into ordinary line breaks.
 */
export function htmlToText(html: string, contentType?: string): string {
  if (!html) {
    return "";
  }

  // Plain-text bodies come through untouched.
  if (contentType === "text") {
    return html.trim();
  }

  const dom = new JSDOM(`<body>${html}</body>`);
  const { document } = dom.window;

  // <at id="0">Jane Doe</at> -> @Jane Doe
  for (const at of Array.from(document.querySelectorAll("at"))) {
    at.replaceWith(document.createTextNode(`@${at.textContent ?? ""}`));
  }

  for (const img of Array.from(document.querySelectorAll("img"))) {
    const alt = img.getAttribute("alt");
    img.replaceWith(document.createTextNode(alt ? `[image: ${alt}]` : "[image]"));
  }

  for (const attachment of Array.from(document.querySelectorAll("attachment"))) {
    attachment.replaceWith(document.createTextNode("[attachment]"));
  }

  // System event messages carry no readable body.
  for (const sys of Array.from(document.querySelectorAll("systemEventMessage"))) {
    sys.replaceWith(document.createTextNode("[system message]"));
  }

  // Insert newlines at block boundaries before reading textContent, otherwise
  // adjacent block elements run their text together.
  for (const el of Array.from(document.querySelectorAll("*"))) {
    if (BLOCK_TAGS.has(el.tagName)) {
      el.insertAdjacentText?.("beforebegin", "\n");
    }
  }

  const text = document.body.textContent ?? "";

  return text
    .replace(/ /g, " ")      // &nbsp;
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Truncate rendered message text so one wide read cannot exhaust a context window.
 * Returns the text unchanged when it is already within the limit.
 */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}… [truncated, ${text.length - maxChars} more chars]`;
}
