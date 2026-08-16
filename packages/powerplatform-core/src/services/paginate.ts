/**
 * Dataverse pagination
 *
 * One paginator for every list service in this package, so that no service has to
 * decide for itself what "there might be more" means.
 *
 * Paging is driven by `Prefer: odata.maxpagesize` plus `@odata.nextLink`, never by
 * `$top`. Dataverse ignores `$top` when a page-size preference is present and returns
 * no continuation token for a `$top`-capped query, so a `$top` result cannot
 * distinguish "capped" from "exhausted". Several services in this package used to
 * derive `hasMore` from `value.length` against a `$top`, which is wrong in both
 * directions and produced complete-looking truncated results. The same reasoning is
 * written up on `DataService.queryRecords`, which has always done it correctly.
 *
 * Client-side filters run inside the paging loop via `keep`, so a cap of 25 means 25
 * rows returned rather than 25 rows fetched and however many happen to survive.
 *
 * One deliberate asymmetry: Dataverse occasionally offers a continuation token whose
 * next page turns out to be empty, so `hasMore` can be true where nothing further
 * existed. Over-warning is the safe direction here. Under-warning is the defect class
 * this file exists to close.
 */

import {
  UNCAPPED,
  PAGINATION_SAFETY_CEILING,
  type TruncationReason,
} from '@mcp-consultant-tools/core';
import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';
import { nextRelativeUrl } from './flow-health.js';

/** Dataverse's hard per-response row cap. */
export const DATAVERSE_MAX_PAGE_SIZE = 5000;

export interface PaginateOptions<T> {
  /**
   * Relative endpoint with query string, minus `$top`. The paginator sets the page
   * size via the `Prefer` header, then follows `@odata.nextLink` from there.
   */
  endpoint: string;
  /** Max rows to return. `UNCAPPED` (0) fetches everything up to the safety ceiling. */
  maxRecords: number;
  /**
   * Client-side row filter. Rows it rejects do not count towards `maxRecords`.
   * Tally your own per-reason exclusion counts inside this callback; it sees every
   * row fetched, which under a cap may be slightly more than the page returned.
   */
  keep?: (row: T) => boolean;
}

export interface PaginateResult<T> {
  rows: T[];
  /** True when rows matching the same filters remained at the source. From the token, never from row count. */
  hasMore: boolean;
  truncationReason: TruncationReason | null;
}

/**
 * Page a Dataverse collection endpoint until the cap, the safety ceiling, or
 * exhaustion.
 */
export async function paginateDataverse<T>(
  client: PowerPlatformClient,
  options: PaginateOptions<T>
): Promise<PaginateResult<T>> {
  const { endpoint, maxRecords, keep } = options;

  // A NaN from `parseInt` on a mistyped -m would otherwise reach the wire as
  // `odata.maxpagesize=NaN`. Fail loudly rather than silently fetching everything,
  // which would look like the caller got what they asked for.
  if (!Number.isInteger(maxRecords) || maxRecords < 0) {
    throw new Error(
      `maxRecords must be a non-negative integer (0 = all); received ${maxRecords}`
    );
  }

  const uncapped = maxRecords === UNCAPPED;
  const ceiling = uncapped ? PAGINATION_SAFETY_CEILING : maxRecords;
  const pageSize = Math.min(Math.max(ceiling, 1), DATAVERSE_MAX_PAGE_SIZE);
  const prefer = `odata.maxpagesize=${pageSize}`;

  let next: string | null = endpoint;
  const rows: T[] = [];
  let hasMore = false;
  let truncationReason: TruncationReason | null = null;

  while (next) {
    const page: ApiCollectionResponse<T> = await client.makeRequest<
      ApiCollectionResponse<T>
    >(next, 'GET', undefined, { Prefer: prefer });

    for (const row of page.value ?? []) {
      if (keep && !keep(row)) continue;
      rows.push(row);
    }

    const link: string | undefined = page['@odata.nextLink'];

    if (rows.length >= ceiling) {
      // A surplus row we fetched but will not return is proof of more on its own,
      // independently of whether the server offered a continuation token.
      hasMore = rows.length > ceiling || Boolean(link);
      truncationReason = uncapped ? 'safetyCeiling' : 'requestedMax';
      break;
    }

    next = link ? nextRelativeUrl(link, client.getOrganizationUrl()) : null;
  }

  return {
    rows: rows.slice(0, ceiling),
    hasMore,
    truncationReason: hasMore ? truncationReason : null,
  };
}
