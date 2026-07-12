/**
 * The Resource Graph REST API has no query-parameter binding, so user-supplied
 * filter values must be escaped into the KQL string literal by hand.
 */

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Escape a value for embedding inside a single-quoted KQL string literal.
 *
 * Backslash must be escaped *before* the quote, otherwise a trailing `\` in the
 * input escapes the closing quote and the caller breaks out of the literal.
 * The source this was ported from escaped only the quote.
 */
export function escapeKqlStringLiteral(value: string): string {
  if (hasControlCharacters(value)) {
    throw new Error('Filter values must not contain control characters.');
  }
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Render a value as a complete, quoted KQL string literal. */
export function kqlString(value: string): string {
  return `'${escapeKqlStringLiteral(value)}'`;
}
