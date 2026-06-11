/**
 * Lightweight HTML sanitizer for LLM-generated visualization HTML.
 *
 * Primary threat: prompt injection via work item data (e.g., a title containing <script>).
 * The design system prompt instructs the LLM to HTML-escape data values (primary defense).
 * This sanitizer is the secondary defense layer.
 *
 * Allows: inline scripts, Chart.js CDN, event handlers (needed for interactivity).
 * Strips: external scripts (non-CDN), iframes, objects, embeds, base, meta, external forms.
 */

const ALLOWED_SCRIPT_SRC_PATTERN = /^https:\/\/cdn\.jsdelivr\.net\//;

const DANGEROUS_ELEMENTS_PATTERN = /<(iframe|object|embed|base|meta)\b[^>]*>[\s\S]*?<\/\1>|<(iframe|object|embed|base|meta)\b[^>]*\/?>/gi;

const EXTERNAL_FORM_ACTION_PATTERN = /<form\b([^>]*)\baction\s*=\s*["'](https?:\/\/[^"']*)["']([^>]*)>/gi;

export function sanitizeGenUiHtml(html: string): string {
  let sanitized = html;

  // Strip dangerous elements (with or without closing tags)
  sanitized = sanitized.replace(DANGEROUS_ELEMENTS_PATTERN, '');

  // Strip external script sources — keep inline scripts and Chart.js CDN
  sanitized = sanitized.replace(
    /<script\b([^>]*)\bsrc\s*=\s*["']([^"']*)["']([^>]*)>/gi,
    (match, _before, src) => {
      return ALLOWED_SCRIPT_SRC_PATTERN.test(src) ? match : '<!-- stripped external script -->';
    }
  );

  // Strip forms with external actions (keep the form tag but remove the action)
  sanitized = sanitized.replace(EXTERNAL_FORM_ACTION_PATTERN, '<form$1$3>');

  return sanitized;
}
