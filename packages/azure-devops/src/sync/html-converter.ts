/**
 * HTML to Markdown Converter
 *
 * Converts HTML content to Markdown format for ADO work item fields.
 * Used for auto-converting HTML fields to markdown when syncing.
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { isHtmlContent } from './html-detection.js';

const turndown = new TurndownService({
  headingStyle: 'atx',        // Use # style headings
  bulletListMarker: '-',      // Use - for lists
  codeBlockStyle: 'fenced',   // Use ``` for code blocks
  emDelimiter: '*',           // Use * for emphasis
  strongDelimiter: '**',      // Use ** for strong
});

// GitHub-flavoured-markdown rules: converts <table> to Markdown pipe tables
// (without this, Turndown flattens tables into a run of bare cell text) plus
// strikethrough and task lists. Simple tables survive intact; complex tables
// (merged/styled cells) still lose structure - callers flag those as "lossy".
turndown.use(gfm);

// Configure turndown to handle ADO-specific HTML patterns
turndown.addRule('adoSpan', {
  filter: ['span'],
  replacement: (content) => content,
});

// Remove empty divs that ADO sometimes creates.
// IMPORTANT: do NOT strip divs whose only "content" is a meaningful element
// like <img>, <iframe>, <video> etc. - those have no text content but are
// not visually empty and stripping them silently deletes embedded media.
turndown.addRule('emptyDiv', {
  filter: (node) => {
    if (node.nodeName !== 'DIV') return false;
    if (node.textContent?.trim()) return false;
    if ((node as any).querySelector?.('img, iframe, video, audio, picture, embed, object, svg, canvas')) {
      return false;
    }
    return true;
  },
  replacement: () => '',
});

/**
 * Convert HTML content to Markdown
 *
 * @param html - HTML content string
 * @returns Markdown formatted string
 */
export function htmlToMarkdown(html: string): string {
  if (!html?.trim()) return '';

  try {
    // Preserve HTML comments through Turndown (which drops Comment nodes by default)
    // Replace with placeholders before conversion, restore after
    const comments: string[] = [];
    const preserved = html.replace(/<!--[\s\S]*?-->/g, (match) => {
      comments.push(match);
      return `\n%%HTML_COMMENT_${comments.length - 1}%%\n`;
    });

    let markdown = turndown.turndown(preserved);

    // Restore HTML comments from placeholders
    markdown = markdown.replace(/%%HTML_COMMENT_(\d+)%%/g, (_match, index) => {
      return comments[parseInt(index, 10)] || '';
    });

    // Clean up excessive newlines
    return markdown.replace(/\n{3,}/g, '\n\n').trim();
  } catch (error) {
    // If conversion fails, return the original content stripped of HTML tags
    console.error('HTML to markdown conversion failed, stripping tags:', error);
    return html.replace(/<[^>]*>/g, '').trim();
  }
}

/**
 * Normalise Markdown body text for change-detection comparison.
 *
 * On push we compare the local Markdown against `htmlToMarkdown(adoHtml)` to
 * decide whether an HTML-stored body field was actually edited. Both sides must
 * be normalised the same way `htmlToMarkdown` finishes (CRLF→LF, collapse 3+
 * blank lines, trim) so cosmetic whitespace differences don't read as a real
 * edit and trigger a needless re-push - which would flip the field to Markdown
 * format and overwrite a complex table with the lossy pulled Markdown.
 */
export function normalizeMarkdownForCompare(s: string): string {
  return (s || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * True if the HTML contains a table element.
 *
 * HTML tables cannot round-trip losslessly to Markdown - merged cells,
 * colspans, and cell styling have no Markdown equivalent - so any field that
 * holds one is flagged "lossy" when converted, telling the agent the ADO
 * original is the higher-fidelity copy.
 */
export function htmlHasTable(html: string | null | undefined): boolean {
  return /<table[\s>]/i.test(html || '');
}

/**
 * Convert HTML fields to Markdown IN MEMORY. Mutates `fields` in place.
 *
 * This NEVER writes to ADO. The work item in ADO is left exactly as the client
 * authored it (HTML, tables and all); only the in-memory copy - destined for
 * the local markdown file - is converted. The ADO copy therefore stays the
 * lossless source of truth and can be re-read at any time.
 *
 * @param fields - Work item field map (mutated in place)
 * @param fieldsToConvert - Refnames to convert if they currently hold HTML
 * @returns `converted` (refnames converted) and `lossy` (the subset that held a
 *          table and may have lost fidelity in conversion)
 */
export function convertFieldsToMarkdownInMemory(
  fields: Record<string, any>,
  fieldsToConvert: string[]
): { converted: string[]; lossy: string[] } {
  const converted: string[] = [];
  const lossy: string[] = [];

  for (const field of fieldsToConvert) {
    const content = fields[field];
    if (content && isHtmlContent(content)) {
      if (htmlHasTable(content)) lossy.push(field);
      fields[field] = htmlToMarkdown(content);
      converted.push(field);
    }
  }

  return { converted, lossy };
}
