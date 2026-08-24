/**
 * Case-insensitive matching and client-side ordering for the serviceAnnouncement data.
 *
 * Everything here compares case-insensitively on purpose. Microsoft's docs are internally
 * inconsistent about enum casing - the schema tables say camelCase (`advisory`,
 * `stayInformed`, `normal`) while every example payload is PascalCase (`Advisory`,
 * `StayInformed`, `Normal`) - so a case-sensitive equality check against the documented
 * spelling would silently match zero rows on live data. That is exactly the false-all-clear
 * an assurance tool must not produce.
 */

/** Case-insensitive equality that treats null/undefined as "no value" (never matches). */
export function equalsIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/** Case-insensitive substring test; a null/undefined haystack never matches. */
export function includesIgnoreCase(haystack: string | null | undefined, needle: string): boolean {
  if (haystack == null) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** True if any string in the list contains `needle` (case-insensitive). */
export function someIncludesIgnoreCase(haystack: readonly string[] | null | undefined, needle: string): boolean {
  return (haystack ?? []).some((h) => includesIgnoreCase(h, needle));
}

/**
 * Sort by `lastModifiedDateTime` descending (newest first), client-side, because `$orderby`
 * is undocumented for these collections and may be silently ignored. Missing or unparseable
 * dates sort last. Returns a new array; does not mutate the input.
 */
export function sortByLastModifiedDesc<T extends { lastModifiedDateTime?: string }>(items: T[]): T[] {
  const time = (v?: string): number => {
    if (!v) return -Infinity;
    const t = Date.parse(v);
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...items].sort((a, b) => time(b.lastModifiedDateTime) - time(a.lastModifiedDateTime));
}
