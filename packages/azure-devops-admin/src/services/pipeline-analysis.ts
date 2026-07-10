/**
 * Pure helpers for pipeline summaries and per-stage deployment lookup.
 *
 * Build API facts (Microsoft Learn, api-version 7.1):
 * - `Build.result` is one of `none | succeeded | partiallySucceeded | failed |
 *   canceled` (lowercase). Note this differs from the Pipelines API's
 *   `RunResult`, which has NO `partiallySucceeded`.
 * - Stage-level status is NOT on the Build object. The build timeline's
 *   `Stage`-type records are the only source that works for every YAML
 *   multi-stage pipeline. (`vsrm.dev.azure.com` is Classic Release only, and
 *   `environmentdeploymentrecords` only sees stages using the `environment:`
 *   keyword.)
 * - Timeline record `type` is documented as a bare string with NO published
 *   enum, so we match it case-insensitively rather than trusting `'Stage'`.
 */

/** A timeline record `result` that counts as a successful deployment. */
const SUCCESS_RESULTS = new Set(['succeeded', 'succeededwithissues']);

export interface TimelineRecord {
  type?: string;
  name?: string;
  result?: string;
  state?: string;
  startTime?: string;
  finishTime?: string;
}

export function isStageRecord(record: TimelineRecord): boolean {
  return (record.type ?? '').toLowerCase() === 'stage';
}

/**
 * A stage counts as deployed when it succeeded, with or without issues.
 *
 * `succeededWithIssues` is a green stage that logged a warning. Treating only
 * `succeeded` as success (as the si source did) reports a deployed stage as
 * never deployed.
 */
export function isSuccessfulResult(result: string | undefined): boolean {
  return SUCCESS_RESULTS.has((result ?? '').toLowerCase());
}

/** Every distinct stage name in a timeline, in encounter order. */
export function stageNames(records: TimelineRecord[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const record of records) {
    if (!isStageRecord(record)) continue;
    const name = record.name ?? '';
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/**
 * Find a successful stage by name, comparing case-insensitively.
 *
 * The si source used `record.name === stageName`, so asking for `prod` when the
 * pipeline names the stage `Prod` reported "never deployed" forever — and that
 * looked identical to a pipeline that genuinely had no successful deploy.
 */
export function findSuccessfulStage(
  records: TimelineRecord[],
  stageName: string,
): TimelineRecord | undefined {
  const wanted = stageName.toLowerCase();
  return records.find(
    (record) =>
      isStageRecord(record) &&
      (record.name ?? '').toLowerCase() === wanted &&
      isSuccessfulResult(record.result),
  );
}

export interface BuildResultBreakdown {
  succeeded: number;
  partiallySucceeded: number;
  failed: number;
  canceled: number;
  none: number;
  other: number;
  noBuilds: number;
}

/**
 * Count pipelines by the result of their latest build.
 *
 * Covers the whole `BuildResult` enum plus "never built". The si source counted
 * only `succeeded` and `failed`, so the numbers never added up to the total and
 * a `partiallySucceeded` pipeline looked like neither healthy nor failing.
 */
export function summariseBuildResults(
  latestResults: Array<string | null | undefined>,
): BuildResultBreakdown {
  const breakdown: BuildResultBreakdown = {
    succeeded: 0,
    partiallySucceeded: 0,
    failed: 0,
    canceled: 0,
    none: 0,
    other: 0,
    noBuilds: 0,
  };

  for (const result of latestResults) {
    if (result === null || result === undefined) {
      breakdown.noBuilds++;
      continue;
    }
    switch (result.toLowerCase()) {
      case 'succeeded': breakdown.succeeded++; break;
      case 'partiallysucceeded': breakdown.partiallySucceeded++; break;
      case 'failed': breakdown.failed++; break;
      case 'canceled': breakdown.canceled++; break;
      case 'none': breakdown.none++; break;
      default: breakdown.other++; break;
    }
  }

  return breakdown;
}
