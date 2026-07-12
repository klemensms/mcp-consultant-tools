/**
 * Shared option parsing for the Entra ID CLI commands.
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

/** `--expiry-days 0` is meaningful: flag only what has already expired. */
export function parseNonNegativeInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer, got: '${value}'`);
  }
  return parsed;
}

/**
 * Reject an unknown enum value rather than passing it through to a client-side
 * filter, where it would silently match nothing and read as "no findings".
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

export const APP_FILTERS = [
  'no-credentials',
  'expiring-credentials',
  'expired-credentials',
] as const;

export const CREDENTIAL_TYPES = ['any', 'secret', 'certificate'] as const;

/** Rendered under any list whose counts were cut short by a result limit. */
export function truncationNote(truncated: boolean): string {
  return truncated ? '  ⚠️ Truncated by the result limit — counts are a lower bound' : '';
}
