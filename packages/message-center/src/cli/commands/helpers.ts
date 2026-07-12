/**
 * Shared option parsing for the Message Center CLI commands.
 * Commander hands every option through as a string, so validate before the service sees it.
 */

export function parsePositiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer, got: '${value}'`);
  }
  return parsed;
}

/**
 * Reject an unknown enum value rather than passing it through to a client-side
 * filter, where it would silently match nothing and read as "no findings". Matches
 * case-insensitively and returns the canonical spelling.
 */
export function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flag: string
): T | undefined {
  if (value === undefined) return undefined;
  const match = allowed.find((a) => a.toLowerCase() === value.toLowerCase());
  if (!match) {
    throw new Error(`${flag} must be one of: ${allowed.join(', ')}. Got: '${value}'`);
  }
  return match;
}

/** Parse a tri-state boolean flag: absent (undefined), 'true', or 'false'. */
export function parseBoolean(value: string | undefined, flag: string): boolean | undefined {
  if (value === undefined) return undefined;
  const lowered = value.toLowerCase();
  if (lowered === 'true') return true;
  if (lowered === 'false') return false;
  throw new Error(`${flag} must be 'true' or 'false', got: '${value}'`);
}

export const ISSUE_CLASSIFICATIONS = ['advisory', 'incident'] as const;
export const MESSAGE_CATEGORIES = ['preventOrFixIssue', 'planForChange', 'stayInformed'] as const;
export const MESSAGE_SEVERITIES = ['normal', 'high', 'critical'] as const;

/** Rendered under any list whose counts were cut short by a result limit. */
export function truncationNote(truncated: boolean): string {
  return truncated ? '  ⚠️ Truncated by the result limit — counts are a lower bound' : '';
}
