/**
 * Pure helpers for cloud-flow health scanning and inventory.
 *
 * The Dataverse `flowrun` (elastic) table exposes `status` as an UNVALIDATED
 * free-text column, so run classification is case-insensitive and tolerates
 * the documented "Success" prose variant alongside the Logic Apps vocabulary.
 * Kept free of any client/IO so the failure-prone arithmetic (success-rate,
 * truncation honesty, errored-vs-idle separation) is unit-testable in isolation.
 */

export type FlowRunStatusClass = 'succeeded' | 'failed' | 'cancelled' | 'running' | 'other';

const SUCCEEDED = new Set(['succeeded', 'success']);
const FAILED = new Set(['failed', 'faulted', 'timedout', 'aborted']);
const CANCELLED = new Set(['cancelled', 'canceled']);
const RUNNING = new Set(['running', 'waiting', 'started', 'suspended', 'paused', 'resuming']);

export function classifyRunStatus(status: string | null | undefined): FlowRunStatusClass {
  const key = (status ?? '').trim().toLowerCase();
  if (SUCCEEDED.has(key)) return 'succeeded';
  if (FAILED.has(key)) return 'failed';
  if (CANCELLED.has(key)) return 'cancelled';
  if (RUNNING.has(key)) return 'running';
  return 'other';
}

export interface FlowRunLike {
  status: string;
  startTime: string | null;
  error?: { code: string; message: string } | null;
}

export interface FlowRef {
  workflowid: string;
  name: string;
  state: string;
  statecode: number;
}

export interface FlowHealthEntry {
  flowId: string;
  flowName: string;
  state: string;
  statecode: number;
  /** Number of runs actually analysed (the newest `maxRunsPerFlow` in the window). */
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  runningRuns: number;
  otherRuns: number;
  /** succeeded / totalRuns as a percentage, or null when no runs were analysed. */
  successRate: number | null;
  /** True when more runs existed in the window than were sampled (rate is over a sample). */
  sampleTruncated: boolean;
  /** Non-null when the run fetch failed for this flow (e.g. 403) - distinct from "no runs". */
  scanError: string | null;
  lastRunTime: string | null;
  lastFailureTime: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

function roundPct(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 10000) / 100;
}

/** Lexical max works for ISO-8601 timestamps and avoids assuming input ordering. */
function latest(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}

export function summariseFlowRuns(
  flow: FlowRef,
  runs: FlowRunLike[],
  sampleTruncated: boolean,
): FlowHealthEntry {
  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;
  let running = 0;
  let other = 0;
  let lastRunTime: string | null = null;
  let newestFailure: FlowRunLike | null = null;

  for (const run of runs) {
    switch (classifyRunStatus(run.status)) {
      case 'succeeded': succeeded++; break;
      case 'failed':
        failed++;
        if (newestFailure === null || latest(run.startTime, newestFailure.startTime) === run.startTime) {
          newestFailure = run;
        }
        break;
      case 'cancelled': cancelled++; break;
      case 'running': running++; break;
      default: other++; break;
    }
    lastRunTime = latest(lastRunTime, run.startTime);
  }

  const total = runs.length;

  return {
    flowId: flow.workflowid,
    flowName: flow.name,
    state: flow.state,
    statecode: flow.statecode,
    totalRuns: total,
    succeededRuns: succeeded,
    failedRuns: failed,
    cancelledRuns: cancelled,
    runningRuns: running,
    otherRuns: other,
    successRate: total > 0 ? roundPct(succeeded, total) : null,
    sampleTruncated,
    scanError: null,
    lastRunTime,
    lastFailureTime: newestFailure?.startTime ?? null,
    lastErrorCode: newestFailure?.error?.code ?? null,
    lastErrorMessage: newestFailure?.error?.message ?? null,
  };
}

export function erroredFlowEntry(flow: FlowRef, errorMessage: string): FlowHealthEntry {
  return {
    flowId: flow.workflowid,
    flowName: flow.name,
    state: flow.state,
    statecode: flow.statecode,
    totalRuns: 0,
    succeededRuns: 0,
    failedRuns: 0,
    cancelledRuns: 0,
    runningRuns: 0,
    otherRuns: 0,
    successRate: null,
    sampleTruncated: false,
    scanError: errorMessage,
    lastRunTime: null,
    lastFailureTime: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  };
}

export interface FlowHealthSummary {
  totalFlowsScanned: number;
  flowsHealthy: number;
  flowsWithFailures: number;
  flowsNoRuns: number;
  flowsErrored: number;
  flowsSampleTruncated: number;
  totalRunsAnalyzed: number;
  totalSucceeded: number;
  totalFailures: number;
  overallSuccessRate: number | null;
}

export function aggregateFlowHealth(
  entries: FlowHealthEntry[],
  topN = 20,
): { summary: FlowHealthSummary; topFailingFlows: FlowHealthEntry[] } {
  let flowsHealthy = 0;
  let flowsWithFailures = 0;
  let flowsNoRuns = 0;
  let flowsErrored = 0;
  let flowsSampleTruncated = 0;
  let totalRunsAnalyzed = 0;
  let totalSucceeded = 0;
  let totalFailures = 0;

  for (const e of entries) {
    if (e.scanError !== null) {
      flowsErrored++;
    } else if (e.totalRuns === 0) {
      flowsNoRuns++;
    } else if (e.failedRuns === 0) {
      flowsHealthy++;
    }
    if (e.failedRuns > 0) flowsWithFailures++;
    if (e.sampleTruncated) flowsSampleTruncated++;
    totalRunsAnalyzed += e.totalRuns;
    totalSucceeded += e.succeededRuns;
    totalFailures += e.failedRuns;
  }

  const topFailingFlows = entries
    .filter((e) => e.failedRuns > 0)
    .sort((a, b) => b.failedRuns - a.failedRuns)
    .slice(0, topN);

  return {
    summary: {
      totalFlowsScanned: entries.length,
      flowsHealthy,
      flowsWithFailures,
      flowsNoRuns,
      flowsErrored,
      flowsSampleTruncated,
      totalRunsAnalyzed,
      totalSucceeded,
      totalFailures,
      overallSuccessRate: totalRunsAnalyzed > 0 ? roundPct(totalSucceeded, totalRunsAnalyzed) : null,
    },
    topFailingFlows,
  };
}

/**
 * Convert an absolute Dataverse `@odata.nextLink` into a relative endpoint that
 * `PowerPlatformClient.makeRequest` can consume (it prepends the org URL itself).
 */
export function nextRelativeUrl(odataNextLink: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (odataNextLink.startsWith(base)) {
    return odataNextLink.slice(base.length).replace(/^\/+/, '');
  }
  return odataNextLink;
}

export interface FlowInventoryEntry {
  flowId: string;
  name: string;
  state: string;
  statecode: number;
  isManaged: boolean;
  modifiedOn: string | null;
  modifiedBy: string | null;
}

function stateLabel(statecode: number): string {
  return statecode === 0 ? 'Draft' : statecode === 1 ? 'Activated' : 'Suspended';
}

export function mapInventoryRow(row: Record<string, unknown>): FlowInventoryEntry {
  return {
    flowId: row.workflowid as string,
    name: row.name as string,
    state: stateLabel(row.statecode as number),
    statecode: row.statecode as number,
    isManaged: (row.ismanaged as boolean) ?? false,
    modifiedOn: (row.modifiedon as string) ?? null,
    modifiedBy: (row.modifiedby as { fullname?: string } | null)?.fullname ?? null,
  };
}
