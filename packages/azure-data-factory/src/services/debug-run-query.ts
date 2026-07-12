/**
 * Pure helpers for the ADF debug-run query tool.
 *
 * These hold the bug-prone logic (status casing, filter building, paging /
 * truncation, aggregation) in isolation so it can be unit-tested with no HTTP
 * client — the paging seam is the injected `fetchPage` function.
 *
 * NOTE: the underlying ARM operation `.../factories/{name}/queryDebugPipelineRuns`
 * is a real, RBAC-registered control-plane action but is UNDOCUMENTED by
 * Microsoft (absent from the public Swagger/REST reference). It mirrors the
 * documented `queryPipelineRuns` request/response contract. Debug-run history
 * is retained server-side for only 15 days regardless of the query window.
 */

import type {
  PipelineRun,
  PipelineRunFilter,
  QueryPipelineRunsRequest,
  QueryPipelineRunsResponse,
} from '../models/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The six documented wire values for `PipelineRun.status`. */
const CANONICAL_STATUS = ['Queued', 'InProgress', 'Succeeded', 'Failed', 'Canceling', 'Cancelled'];

/**
 * Map of lower-cased spellings (incl. British/American variants) → canonical
 * wire casing. The wire enum uses American single-L "Canceling" and double-L
 * "Cancelled"; callers commonly type the opposite, which an exact-match ARM
 * `Status Equals` filter would silently reject.
 */
const STATUS_ALIASES: Record<string, string> = {
  cancelling: 'Canceling', // British double-L → wire single-L
  canceled: 'Cancelled', // American single-L → wire double-L
};

/**
 * Normalize a caller-supplied run status to the canonical wire casing.
 * Unknown values pass through unchanged (let ARM decide rather than mangle).
 */
export function normalizeRunStatus(input: string): string {
  const key = input.trim().toLowerCase();
  const canonical = CANONICAL_STATUS.find((s) => s.toLowerCase() === key);
  if (canonical) return canonical;
  return STATUS_ALIASES[key] ?? input;
}

/**
 * Build the RunFilterParameters body for a debug-run query: a `[now - lastDays,
 * now + 1 day]` window ordered by RunStart DESC, with optional PipelineName /
 * Status filters (status normalized to wire casing).
 */
export function buildDebugRunRequest(opts: {
  lastDays: number;
  now: number;
  pipelineName?: string;
  status?: string;
}): QueryPipelineRunsRequest {
  const filters: PipelineRunFilter[] = [];
  if (opts.pipelineName) {
    filters.push({ operand: 'PipelineName', operator: 'Equals', values: [opts.pipelineName] });
  }
  if (opts.status) {
    filters.push({ operand: 'Status', operator: 'Equals', values: [normalizeRunStatus(opts.status)] });
  }
  return {
    lastUpdatedAfter: new Date(opts.now - opts.lastDays * DAY_MS).toISOString(),
    lastUpdatedBefore: new Date(opts.now + DAY_MS).toISOString(),
    filters,
    orderBy: [{ orderBy: 'RunStart', order: 'DESC' }],
  };
}

/** A query body that may carry a paging continuation token. */
type DebugRunQueryBody = QueryPipelineRunsRequest & { continuationToken?: string };

/**
 * Page through debug runs, following `continuationToken`, up to `maxResults`.
 * Returns `truncated: true` when the cap was reached with more runs available
 * (another page, or a page that overflowed the cap) — the response schema has
 * no total-count field, so a capped result must NOT be reported as the total.
 */
export async function paginateDebugRuns(
  fetchPage: (body: DebugRunQueryBody) => Promise<QueryPipelineRunsResponse>,
  baseBody: QueryPipelineRunsRequest,
  maxResults: number
): Promise<{ runs: PipelineRun[]; truncated: boolean }> {
  const runs: PipelineRun[] = [];
  let continuationToken: string | undefined;

  do {
    const body: DebugRunQueryBody = continuationToken
      ? { ...baseBody, continuationToken }
      : { ...baseBody };
    const response = await fetchPage(body);
    runs.push(...(response.value ?? []));
    continuationToken = response.continuationToken;

    if (runs.length >= maxResults) {
      const truncated = runs.length > maxResults || !!continuationToken;
      return { runs: runs.slice(0, maxResults), truncated };
    }
  } while (continuationToken);

  return { runs, truncated: false };
}

export interface DebugRunSummary {
  returned: number;
  truncated: boolean;
  byStatus: Record<string, number>;
  byPipeline: Record<string, number>;
}

/**
 * Aggregate runs into status/pipeline counts. Keys are the verbatim wire status
 * casing (no comparison against a literal, so it is inherently case-safe).
 */
export function summariseDebugRuns(runs: PipelineRun[], truncated: boolean): DebugRunSummary {
  const byStatus: Record<string, number> = {};
  const byPipeline: Record<string, number> = {};

  for (const run of runs) {
    const status = run.status ?? 'Unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
    const pipeline = run.pipelineName ?? 'Unknown';
    byPipeline[pipeline] = (byPipeline[pipeline] || 0) + 1;
  }

  return { returned: runs.length, truncated, byStatus, byPipeline };
}
