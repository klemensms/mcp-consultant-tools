/**
 * Azure Resource Graph query helper.
 *
 * Two surfaces in this package read `securityresources`: attack paths, which are
 * only ever in Resource Graph, and assessments, which are in Resource Graph *and*
 * in ARM but with different blind spots. One helper so the request body, the
 * truncation reporting and the paging cannot diverge between them.
 */

import type { DefenderClient } from '../defender-client.js';
import { DEFENDER_API_VERSIONS } from './defender-api-versions.js';

export const RESOURCE_GRAPH_PATH = '/providers/Microsoft.ResourceGraph/resources';

/** Resource Graph's own maximum page size. Asking for more is rejected, not clamped. */
export const RESOURCE_GRAPH_PAGE_SIZE = 1000;

/**
 * Ceiling on pages followed when `pageAll` is set. Reaching it reports `truncated`
 * rather than returning a short list that looks complete.
 */
export const MAX_RESOURCE_GRAPH_PAGES = 20;

/** Resource Graph's response envelope. `$skipToken` is absent on the last page. */
interface ResourceGraphResponse {
  data?: unknown[];
  count?: number;
  totalRecords?: number;
  resultTruncated?: string | boolean;
  $skipToken?: string;
}

export interface ResourceGraphResult {
  rows: Record<string, unknown>[];
  /** True when Resource Graph capped the result, or when the page ceiling was hit. */
  truncated: boolean;
}

/**
 * Run one KQL query against Resource Graph, scoped to the client's subscription.
 *
 * Scope comes from the request body's `subscriptions` array, not a `where
 * subscriptionId ==` clause, which is one less place to interpolate a value into KQL.
 *
 * `pageAll` follows `$skipToken` until the result is exhausted. Leave it off for a
 * query that carries its own `| limit`, which fits in one page by construction.
 */
export async function queryResourceGraph(
  client: DefenderClient,
  query: string,
  options?: { pageAll?: boolean }
): Promise<ResourceGraphResult> {
  const subscriptionId = client.getSubscriptionId();
  const pageAll = options?.pageAll ?? false;

  const rows: Record<string, unknown>[] = [];
  let truncated = false;
  let skipToken: string | undefined;
  let pages = 0;

  do {
    const requestOptions: Record<string, unknown> = { resultFormat: 'objectArray' };
    if (pageAll) {
      requestOptions.$top = RESOURCE_GRAPH_PAGE_SIZE;
      if (skipToken) requestOptions.$skipToken = skipToken;
    }

    const response = await client.post<ResourceGraphResponse>(
      RESOURCE_GRAPH_PATH,
      { subscriptions: [subscriptionId], query, options: requestOptions },
      DEFENDER_API_VERSIONS.resourceGraph
    );

    rows.push(...((response.data ?? []) as Record<string, unknown>[]));

    if (response.resultTruncated === true || String(response.resultTruncated) === 'true') {
      truncated = true;
    }

    skipToken = pageAll ? response.$skipToken : undefined;
    pages++;

    if (skipToken && pages >= MAX_RESOURCE_GRAPH_PAGES) {
      truncated = true;
      break;
    }
  } while (skipToken);

  return { rows, truncated };
}
