/**
 * Truncation contract
 *
 * One shape, used by every list command in every package that can return fewer rows
 * than exist at the source.
 *
 * The failure this guards against is not a missing field, it is a wrong answer: a
 * capped result that is byte-for-byte indistinguishable from a complete one. A
 * consumer reading a returned-row count as a population total gets a confident,
 * well-formed, wrong number and has no way to detect it.
 *
 * Two rules make that impossible:
 *
 * 1. `hasMore` is never inferred from the number of rows returned. A short page is
 *    not proof of exhaustion, and a full page is not proof of truncation. It comes
 *    from a continuation token or from a deliberate over-fetch, nothing else.
 * 2. `totalAvailable` is null whenever the fetch stopped short. We report a total
 *    only when we actually counted one. Absence of a claim beats a plausible guess.
 */

/**
 * Sentinel for "no cap": return every row the source will give us.
 *
 * This is the default for list commands. A capped default makes truncation the
 * normal path, which means a report is complete only if someone remembered to check
 * a field. Uncapped makes completeness the default and truncation the exception.
 */
export const UNCAPPED = 0;

/**
 * Upper bound on an uncapped fetch, so a pathological source cannot hang a command.
 * Hitting it is reported as truncation like any other, never as a complete result.
 */
export const PAGINATION_SAFETY_CEILING = 50_000;

/** Why a fetch stopped before the source was exhausted. */
export type TruncationReason = 'requestedMax' | 'safetyCeiling';

export interface TruncationInfo {
  /** Rows present in this payload, after every filter this command applies. */
  returnedCount: number;
  /** The cap the caller asked for, or null when the caller asked for everything. */
  requestedMax: number | null;
  /** True when rows matching this command's filters exist beyond the ones returned. */
  hasMore: boolean;
  /**
   * Exact count of rows matching this command's filters at the source.
   * Null when the fetch was truncated, because then we do not know it.
   */
  totalAvailable: number | null;
  /** Why the fetch stopped short, or null when it ran to exhaustion. */
  truncationReason: TruncationReason | null;
}

/**
 * Build the truncation block from what a paginated fetch actually observed.
 *
 * `hasMore` must come from the source (a continuation token, or an over-fetched
 * surplus row), never from comparing `returnedCount` to `requestedMax`.
 */
export function buildTruncation(observed: {
  returnedCount: number;
  requestedMax: number;
  hasMore: boolean;
  truncationReason?: TruncationReason | null;
}): TruncationInfo {
  const { returnedCount, requestedMax, hasMore } = observed;
  const truncationReason = hasMore
    ? (observed.truncationReason ?? 'requestedMax')
    : null;

  return {
    returnedCount,
    requestedMax: requestedMax === UNCAPPED ? null : requestedMax,
    hasMore,
    totalAvailable: hasMore ? null : returnedCount,
    truncationReason,
  };
}

/**
 * Suffix for a summary line, in a CLI summary or an MCP tool's text response.
 * Empty when the result is complete, loud when it is not, because the summary line
 * is often the only part of the payload read before a report is written from it.
 */
export function truncationSuffix(truncation: TruncationInfo): string {
  if (!truncation.hasMore) return '';

  if (truncation.truncationReason === 'safetyCeiling') {
    return ` [TRUNCATED at the ${PAGINATION_SAFETY_CEILING}-row safety ceiling. More rows exist. Narrow the query]`;
  }

  return ` [TRUNCATED at ${truncation.returnedCount} of an unknown total. Re-run uncapped (-m 0, or omit maxRecords) for the complete set]`;
}
