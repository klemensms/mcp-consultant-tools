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
 * A Graph chatMessage mention. Only the fields needed to identify what a given
 * <at> element points at - the entity a mention resolves to is a user, a
 * conversation (channel/team tag), an application or a tag.
 */
export interface GraphMention {
  id?: number;
  mentionText?: string;
  mentioned?: {
    user?: { id?: string };
    conversation?: { id?: string };
    application?: { id?: string };
    tag?: { id?: string };
  };
}

/**
 * A Graph chatMessage attachment. The message body carries only an
 * <attachment id="..."> placeholder; everything a reader needs - the file name,
 * the link a preview card points at, the message a reply is quoting - lives out
 * here and has to be joined back on by id.
 */
export interface GraphAttachment {
  id?: string;
  /** "reference" for a file or an unfurled link, "messageReference" for a quote. */
  contentType?: string;
  contentUrl?: string;
  /** JSON string; the quoted message for a messageReference, card payload otherwise. */
  content?: string | null;
  name?: string;
}

/** Longest quoted-message preview rendered inline before it is clipped. */
const QUOTE_PREVIEW_CHARS = 200;

/**
 * The entity a given <at> element resolves to, or undefined when it cannot be
 * resolved. Two <at> elements belong to the same mention only if this matches.
 */
function entityKeyFor(at: Element, mentions?: GraphMention[]): string | undefined {
  if (!mentions?.length) {
    return undefined;
  }

  const id = at.getAttribute("id");
  if (id === null) {
    return undefined;
  }

  const mentioned = mentions.find((m) => String(m.id) === id)?.mentioned;

  return (
    mentioned?.user?.id ??
    mentioned?.conversation?.id ??
    mentioned?.application?.id ??
    mentioned?.tag?.id
  );
}

/** True for a text node holding nothing but whitespace (&nbsp; counts). */
function isBlankText(node: ChildNode | null): boolean {
  return node !== null && node.nodeType === 3 && !(node.textContent ?? "").trim();
}

function isAtElement(node: ChildNode | null): node is Element {
  return node !== null && node.nodeType === 1 && (node as Element).tagName.toLowerCase() === "at";
}

/**
 * Replace each mention with a single "@Name", joining the per-word <at>
 * elements Graph emits for one mention.
 *
 * Graph splits a multi-word mention across one <at> per word, each with its own
 * mentions[] entry, all resolving to the same entity - so "Jane Doe" arrives as
 * two elements and renders as "@Jane @Doe" if taken at face value. Runs are
 * keyed on the resolved entity id and NOT on adjacency: two different people
 * mentioned back to back are also adjacent, and merging those would invent a
 * name that nobody wrote. Without a mentions array there is nothing to key on,
 * so each element is rendered separately rather than guessed at.
 */
function renderMentions(document: Document, mentions?: GraphMention[]): void {
  const consumed = new Set<Element>();

  for (const at of Array.from(document.querySelectorAll("at"))) {
    if (consumed.has(at)) {
      continue;
    }

    const key = entityKeyFor(at, mentions);
    const words = [at.textContent ?? ""];
    let pendingBlanks: ChildNode[] = [];
    let cursor: ChildNode | null = at.nextSibling;

    while (key !== undefined && cursor !== null) {
      if (isBlankText(cursor)) {
        pendingBlanks.push(cursor);
        cursor = cursor.nextSibling;
        continue;
      }

      if (!isAtElement(cursor) || entityKeyFor(cursor, mentions) !== key) {
        break;
      }

      words.push(cursor.textContent ?? "");
      consumed.add(cursor);
      for (const blank of pendingBlanks) {
        blank.remove();
      }
      pendingBlanks = [];

      const next: ChildNode | null = cursor.nextSibling;
      cursor.remove();
      cursor = next;
    }

    at.replaceWith(document.createTextNode(`@${words.join(" ").trim()}`));
  }
}

/**
 * True when an anchor's label is just its own URL, which is what Teams emits for
 * a pasted link. Rendering those as markdown would produce [https://x](https://x),
 * so they are compared with the scheme and any trailing slash set aside.
 */
function isSelfLabelled(label: string, href: string): boolean {
  const bare = (value: string) => value.replace(/^(mailto:|tel:)/i, "").replace(/\/+$/, "");
  return bare(label) === bare(href);
}

/**
 * Render each link as markdown, so the URL survives the flattening.
 *
 * textContent keeps an anchor's label and throws the href away, which loses the
 * one part of a link that cannot be recovered from the rest of the message - and
 * loses it silently, since the label reads as ordinary prose afterwards.
 *
 * Runs after mentions, emoji and images so a label built out of those elements is
 * already resolved by the time it is read.
 */
function renderAnchors(document: Document): void {
  for (const anchor of Array.from(document.querySelectorAll("a"))) {
    const href = (anchor.getAttribute("href") ?? "").trim();
    const label = (anchor.textContent ?? "").trim();

    let rendered: string;
    if (!href) {
      rendered = label;
    } else if (!label) {
      rendered = href;
    } else if (isSelfLabelled(label, href)) {
      // The label, not the href: it is the same target either way, and it is the
      // form without the mailto: scheme or the slash Teams appends.
      rendered = label;
    } else {
      rendered = `[${label}](${href})`;
    }

    anchor.replaceWith(document.createTextNode(rendered));
  }
}

/** Describe a quoted reply from the message it quotes. */
function describeQuotedReply(attachment: GraphAttachment): string {
  let sender: string | undefined;
  let preview: string | undefined;

  try {
    const quoted = JSON.parse(attachment.content ?? "");
    sender = quoted?.messageSender?.user?.displayName?.trim() || undefined;
    preview = quoted?.messagePreview?.replace(/\s+/g, " ").trim() || undefined;
  } catch {
    // The marker alone still tells the reader a quote was there, which is the
    // part that misleads when it is missing.
  }

  if (preview && preview.length > QUOTE_PREVIEW_CHARS) {
    preview = `${preview.slice(0, QUOTE_PREVIEW_CHARS)}…`;
  }

  return `[quoted reply${sender ? ` from ${sender}` : ""}${preview ? `: ${preview}` : ""}]`;
}

/**
 * Describe one attachment in a single bracketed line.
 *
 * A bare "[attachment]" is ambiguous in the way that costs a reader the most: a
 * quoted reply and an unfurled link card look identical, so which one it is has
 * to be guessed from where it sits in the message. Naming the thing removes the
 * guess.
 */
function describeAttachment(attachment?: GraphAttachment): string {
  if (!attachment) {
    return "[attachment]";
  }

  if (attachment.contentType === "messageReference") {
    return describeQuotedReply(attachment);
  }

  const name = attachment.name?.trim();
  const url = attachment.contentUrl?.trim();

  if (name && url) {
    return `[attachment: ${name} - ${url}]`;
  }

  const identified = name || url || attachment.contentType?.trim();

  return identified ? `[attachment: ${identified}]` : "[attachment]";
}

/**
 * Flatten Teams message HTML to readable plain text.
 *
 * Keeps @-mentions as "@Name", renders links as markdown so their URLs survive,
 * marks images as placeholders (their content is a Graph hostedContents URL,
 * useless to a reader), names each attachment from the sibling attachments[]
 * array, and collapses the div nesting Teams emits into ordinary line breaks.
 */
export function htmlToText(
  html: string,
  contentType?: string,
  mentions?: GraphMention[],
  attachments?: GraphAttachment[],
): string {
  if (!html) {
    return "";
  }

  // Plain-text bodies come through untouched.
  if (contentType === "text") {
    return html.trim();
  }

  const dom = new JSDOM(`<body>${html}</body>`);
  const { document } = dom.window;

  // <at id="0">Jane</at>&nbsp;<at id="1">Doe</at> -> @Jane Doe
  renderMentions(document, mentions);

  // Teams carries the character itself in the alt attribute; the element has no
  // text content, so without this every emoji vanishes from the rendered body.
  for (const emoji of Array.from(document.querySelectorAll("emoji"))) {
    const char = emoji.getAttribute("alt") ?? emoji.getAttribute("title") ?? "";
    emoji.replaceWith(document.createTextNode(char));
  }

  for (const img of Array.from(document.querySelectorAll("img"))) {
    const alt = img.getAttribute("alt");
    img.replaceWith(document.createTextNode(alt ? `[image: ${alt}]` : "[image]"));
  }

  renderAnchors(document);

  // The placeholder carries only an id; the name and URL are joined back on from
  // attachments[]. Rendered on its own line because Teams emits the placeholder
  // as an inline sibling of the body, so it otherwise runs into the last word.
  const placed = new Set<string>();
  for (const placeholder of Array.from(document.querySelectorAll("attachment"))) {
    const id = placeholder.getAttribute("id");
    const attachment = id ? attachments?.find((a) => a.id === id) : undefined;

    if (attachment?.id) {
      placed.add(attachment.id);
    }

    // Graph separates the placeholder from the body with its own newline, which
    // would leave a blank line inside the message - and a blank line is what
    // separates one message from the next in a rendered read, so the quote reads
    // as its own message. Drop the blank sibling and keep the single break.
    while (isBlankText(placeholder.nextSibling)) {
      placeholder.nextSibling?.remove();
    }

    placeholder.replaceWith(document.createTextNode(`\n${describeAttachment(attachment)}`));
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

  const text = (document.body.textContent ?? "")
    .replace(/ /g, " ")      // &nbsp;
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Graph does not always pair an attachment with a placeholder in the body.
  // Appending the strays keeps the failure mode this whole function exists to
  // fix - content arriving from Graph and silently not being shown - from
  // recurring one level up.
  const strays = (attachments ?? [])
    .filter((attachment) => !attachment.id || !placed.has(attachment.id))
    .map(describeAttachment);

  return [text, ...strays].filter((line) => line !== "").join("\n");
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
