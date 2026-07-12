import { describe, it, expect } from 'vitest';
import {
  classifyRunStatus,
  summariseFlowRuns,
  erroredFlowEntry,
  aggregateFlowHealth,
  nextRelativeUrl,
  mapInventoryRow,
  type FlowRef,
  type FlowRunLike,
} from '../flow-health.js';

const flow = (over: Partial<FlowRef> = {}): FlowRef => ({
  workflowid: 'flow-1',
  name: 'Sample Flow',
  state: 'Activated',
  statecode: 1,
  ...over,
});

const run = (status: string, startTime: string, error?: { code: string; message: string }): FlowRunLike => ({
  status,
  startTime,
  error: error ?? null,
});

describe('classifyRunStatus', () => {
  it('classifies the canonical Logic Apps vocabulary', () => {
    expect(classifyRunStatus('Succeeded')).toBe('succeeded');
    expect(classifyRunStatus('Failed')).toBe('failed');
    expect(classifyRunStatus('Cancelled')).toBe('cancelled');
    expect(classifyRunStatus('Running')).toBe('running');
    expect(classifyRunStatus('Waiting')).toBe('running');
  });

  it('is case-insensitive (flowrun.status is unvalidated free text)', () => {
    // The si source compared with === and would miscount if casing differed.
    expect(classifyRunStatus('succeeded')).toBe('succeeded');
    expect(classifyRunStatus('FAILED')).toBe('failed');
    expect(classifyRunStatus('cancelled')).toBe('cancelled');
  });

  it('treats the "Success" prose variant as succeeded', () => {
    // Microsoft prose says "Success"; the runtime string may differ from "Succeeded".
    expect(classifyRunStatus('Success')).toBe('succeeded');
  });

  it('groups Faulted/TimedOut/Aborted as failed and Canceled (US) as cancelled', () => {
    expect(classifyRunStatus('Faulted')).toBe('failed');
    expect(classifyRunStatus('TimedOut')).toBe('failed');
    expect(classifyRunStatus('Aborted')).toBe('failed');
    expect(classifyRunStatus('Canceled')).toBe('cancelled');
  });

  it('classifies unknown/empty/nullish as other', () => {
    expect(classifyRunStatus('Frobnicated')).toBe('other');
    expect(classifyRunStatus('')).toBe('other');
    expect(classifyRunStatus(null)).toBe('other');
    expect(classifyRunStatus(undefined)).toBe('other');
  });
});

describe('summariseFlowRuns', () => {
  it('counts runs by class case-insensitively and computes success rate', () => {
    const entry = summariseFlowRuns(
      flow(),
      [
        run('Succeeded', '2026-07-10T10:00:00Z'),
        run('succeeded', '2026-07-10T09:00:00Z'),
        run('Failed', '2026-07-10T08:00:00Z', { code: 'E1', message: 'boom' }),
        run('Cancelled', '2026-07-10T07:00:00Z'),
      ],
      false,
    );
    expect(entry.totalRuns).toBe(4);
    expect(entry.succeededRuns).toBe(2);
    expect(entry.failedRuns).toBe(1);
    expect(entry.cancelledRuns).toBe(1);
    expect(entry.runningRuns).toBe(0);
    expect(entry.successRate).toBe(50);
  });

  it('reports successRate as null (not 0) when there are no runs', () => {
    // si reported 0, which reads as "100% failure"; null means "no data".
    const entry = summariseFlowRuns(flow(), [], false);
    expect(entry.totalRuns).toBe(0);
    expect(entry.successRate).toBeNull();
    expect(entry.scanError).toBeNull();
    expect(entry.lastRunTime).toBeNull();
  });

  it('derives lastRunTime/lastFailure from the newest run regardless of input order', () => {
    // si assumed runs[0] was newest; we compute the max startTime so order does not matter.
    const entry = summariseFlowRuns(
      flow(),
      [
        run('Succeeded', '2026-07-01T00:00:00Z'),
        run('Failed', '2026-07-09T00:00:00Z', { code: 'LATE', message: 'newest failure' }),
        run('Failed', '2026-07-05T00:00:00Z', { code: 'OLD', message: 'older failure' }),
      ],
      false,
    );
    expect(entry.lastRunTime).toBe('2026-07-09T00:00:00Z');
    expect(entry.lastFailureTime).toBe('2026-07-09T00:00:00Z');
    expect(entry.lastErrorCode).toBe('LATE');
    expect(entry.lastErrorMessage).toBe('newest failure');
  });

  it('passes through the sampleTruncated flag', () => {
    expect(summariseFlowRuns(flow(), [run('Succeeded', '2026-07-10T10:00:00Z')], true).sampleTruncated).toBe(true);
    expect(summariseFlowRuns(flow(), [run('Succeeded', '2026-07-10T10:00:00Z')], false).sampleTruncated).toBe(false);
  });
});

describe('erroredFlowEntry', () => {
  it('marks scanError distinctly from a no-runs flow', () => {
    const entry = erroredFlowEntry(flow(), 'Access denied to flowruns table');
    expect(entry.scanError).toBe('Access denied to flowruns table');
    expect(entry.totalRuns).toBe(0);
    expect(entry.successRate).toBeNull();
  });
});

describe('aggregateFlowHealth', () => {
  it('separates errored flows from genuinely idle (no-runs) flows', () => {
    // The si bug: a 403 while scanning was bucketed as flowsNoRuns, masking access problems.
    const healthy = summariseFlowRuns(flow({ workflowid: 'ok' }), [run('Succeeded', '2026-07-10T10:00:00Z')], false);
    const idle = summariseFlowRuns(flow({ workflowid: 'idle' }), [], false);
    const errored = erroredFlowEntry(flow({ workflowid: 'err' }), '403 denied');

    const { summary } = aggregateFlowHealth([healthy, idle, errored]);
    expect(summary.totalFlowsScanned).toBe(3);
    expect(summary.flowsHealthy).toBe(1);
    expect(summary.flowsNoRuns).toBe(1);
    expect(summary.flowsErrored).toBe(1);
  });

  it('computes overall success rate over analysed runs and null when none', () => {
    const a = summariseFlowRuns(flow({ workflowid: 'a' }), [
      run('Succeeded', '2026-07-10T10:00:00Z'),
      run('Failed', '2026-07-10T09:00:00Z', { code: 'x', message: 'y' }),
    ], false);
    const b = summariseFlowRuns(flow({ workflowid: 'b' }), [run('Succeeded', '2026-07-10T08:00:00Z')], false);

    const { summary } = aggregateFlowHealth([a, b]);
    expect(summary.totalRunsAnalyzed).toBe(3);
    expect(summary.totalSucceeded).toBe(2);
    expect(summary.totalFailures).toBe(1);
    expect(summary.overallSuccessRate).toBeCloseTo(66.67, 1);

    expect(aggregateFlowHealth([]).summary.overallSuccessRate).toBeNull();
  });

  it('ranks top failing flows by failure count and honours topN', () => {
    const mk = (id: string, failures: number) =>
      summariseFlowRuns(
        flow({ workflowid: id }),
        Array.from({ length: failures }, (_, i) => run('Failed', `2026-07-10T0${i}:00:00Z`, { code: 'e', message: 'm' })),
        false,
      );
    const { topFailingFlows } = aggregateFlowHealth([mk('one', 1), mk('three', 3), mk('two', 2)], 2);
    expect(topFailingFlows.map((f) => f.flowId)).toEqual(['three', 'two']);
  });

  it('counts flows whose run sample was truncated', () => {
    const capped = summariseFlowRuns(flow({ workflowid: 'c' }), [run('Succeeded', '2026-07-10T10:00:00Z')], true);
    const full = summariseFlowRuns(flow({ workflowid: 'f' }), [run('Succeeded', '2026-07-10T09:00:00Z')], false);
    expect(aggregateFlowHealth([capped, full]).summary.flowsSampleTruncated).toBe(1);
  });
});

describe('nextRelativeUrl', () => {
  it('strips the org base URL and the leading slash to produce a relative endpoint', () => {
    const base = 'https://yourorg.crm.dynamics.com';
    const next = 'https://yourorg.crm.dynamics.com/api/data/v9.2/workflows?$skiptoken=abc';
    expect(nextRelativeUrl(next, base)).toBe('api/data/v9.2/workflows?$skiptoken=abc');
  });

  it('tolerates a trailing slash on the base URL', () => {
    expect(
      nextRelativeUrl('https://yourorg.crm.dynamics.com/api/data/v9.2/workflows?x=1', 'https://yourorg.crm.dynamics.com/'),
    ).toBe('api/data/v9.2/workflows?x=1');
  });

  it('returns the link unchanged when it does not start with the base URL', () => {
    const other = 'https://example.com/api/data/v9.2/workflows';
    expect(nextRelativeUrl(other, 'https://yourorg.crm.dynamics.com')).toBe(other);
  });
});

describe('mapInventoryRow', () => {
  it('maps a raw workflow row to an inventory entry with a state label', () => {
    const entry = mapInventoryRow({
      workflowid: 'wf-1',
      name: 'Nightly Sync',
      statecode: 1,
      ismanaged: true,
      modifiedon: '2026-07-01T00:00:00Z',
      modifiedby: { fullname: 'Jane Doe' },
    });
    expect(entry).toEqual({
      flowId: 'wf-1',
      name: 'Nightly Sync',
      state: 'Activated',
      statecode: 1,
      isManaged: true,
      modifiedOn: '2026-07-01T00:00:00Z',
      modifiedBy: 'Jane Doe',
    });
  });

  it('maps draft state and a missing modifiedby to null', () => {
    const entry = mapInventoryRow({ workflowid: 'wf-2', name: 'Draft Flow', statecode: 0, ismanaged: false, modifiedon: null });
    expect(entry.state).toBe('Draft');
    expect(entry.modifiedBy).toBeNull();
  });
});
