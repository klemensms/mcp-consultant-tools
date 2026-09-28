/**
 * Building message bodies and recipient lists for drafts and sends. Shared by
 * the write and send services so both sanitise and validate the same way.
 */
import { markdownToHtml, sanitizeHtml } from '../mail-content.js';

export type BodyFormat = 'markdown' | 'text' | 'html';

export interface ComposeInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  format?: BodyFormat;
  importance?: 'low' | 'normal' | 'high';
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The body as sanitised HTML, whatever format it arrived in. */
export function toHtml(body: string, format: BodyFormat = 'markdown'): string {
  if (format === 'text') {
    return escapeHtml(body).replace(/\r?\n/g, '<br>');
  }
  if (format === 'html') {
    return sanitizeHtml(body);
  }
  return markdownToHtml(body).trim();
}

/** Graph recipients, after checking every address looks like one. */
export function toRecipients(addresses: string[] | undefined): { emailAddress: { address: string } }[] {
  return (addresses ?? []).map((raw) => {
    const address = raw.trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(address)) {
      throw new Error(`"${raw}" is not an email address. Give recipients as addresses, such as jdoe@example.com.`);
    }
    return { emailAddress: { address } };
  });
}

/** A Graph message resource for a new draft or a send. */
export function toGraphMessage(input: ComposeInput): Record<string, unknown> {
  const message: Record<string, unknown> = {
    subject: input.subject,
    body: { contentType: 'HTML', content: toHtml(input.body, input.format) },
    toRecipients: toRecipients(input.to),
  };
  if (input.cc?.length) message.ccRecipients = toRecipients(input.cc);
  if (input.bcc?.length) message.bccRecipients = toRecipients(input.bcc);
  if (input.importance) message.importance = input.importance;
  return message;
}

/**
 * Put new HTML above the body Graph generated for a reply or forward, which
 * holds the quoted thread. Inserted just inside <body> when there is one, so
 * the result stays a single well-formed document.
 */
export function prependToBody(existing: string, html: string): string {
  const bodyTag = /<body[^>]*>/i.exec(existing);
  if (!bodyTag) {
    return `${html}\n${existing}`;
  }
  const at = bodyTag.index + bodyTag[0].length;
  return `${existing.slice(0, at)}${html}\n${existing.slice(at)}`;
}

/**
 * Put new HTML after the user's own text but above any quoted thread: before
 * the separator Outlook writes into a reply or forward, or at the end of the
 * body of a new draft.
 */
export function insertAboveQuote(existing: string, html: string): string {
  const quote = /<div[^>]*id="appendonsend"/i.exec(existing) ?? /<div[^>]*id="divRplyFwdMsg"/i.exec(existing);
  if (quote) {
    const before = existing.slice(0, quote.index);
    const hr = before.search(/<hr[^>]*>\s*$/i);
    const at = !/appendonsend/i.test(quote[0]) && hr !== -1 ? hr : quote.index;
    return `${existing.slice(0, at)}${html}${existing.slice(at)}`;
  }
  const end = existing.search(/<\/body>/i);
  return end === -1 ? `${existing}${html}` : `${existing.slice(0, end)}${html}${existing.slice(end)}`;
}

