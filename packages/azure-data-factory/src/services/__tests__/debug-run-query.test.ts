import { describe, it, expect } from 'vitest';
import type { PipelineRun, QueryPipelineRunsRequest, QueryPipelineRunsResponse } from '../../models/index.js';
import {
  normalizeRunStatus,
  buildDebugRunRequest,
  paginateDebugRuns,
  summariseDebugRuns,
} from '../debug-run-query.js';

const DAY = 24 * 60 * 60 * 1000;

function run(partial: Partial<PipelineRun>): PipelineRun {
  return {
    runId: 'r',
    pipelineName: 'P',
    status: 'Succeeded',
    ...partial,
  } as PipelineRun;
}

describe('normalizeRunStatus', () => {
  it('maps case-insensitive input to the canonical wire casing', () => {
    expect(normalizeRunStatus('failed')).toBe('Failed');
    expect(normalizeRunStatus('SUCCEEDED')).toBe('Succeeded');
    expect(normalizeRunStatus('inprogress')).toBe('InProgress');
    expect(normalizeRunStatus('queued')).toBe('Queued');
    expect(normalizeRunStatus('cancelled')).toBe('Cancelled');
    expect(normalizeRunStatus('canceling')).toBe('Canceling');
  });

  it('maps the British "Cancelling" spelling to the wire "Canceling" (single L)', () => {
    // The wire enum uses American single-L "Canceling"; a caller typing the
    // British double-L "Cancelling" must not silently get zero matches.
    expect(normalizeRunStatus('Cancelling')).toBe('Canceling');
    expect(normalizeRunStatus('cancelling')).toBe('Canceling');
  });

  it('maps the single-L "Canceled" spelling to the wire "Cancelled" (double L)', () => {
    expect(normalizeRunStatus('Canceled')).toBe('Cancelled');
  });

  it('passes an unrecognised value through unchanged rather than mangling it', () => {
    expect(normalizeRunStatus('Bogus')).toBe('Bogus');
  });
});

describe('buildDebugRunRequest', () => {
  const now = 1_700_000_000_000;

  it('builds a RunStart-DESC window of lastDays back to +1 day, with no filters when none given', () => {
    const req = buildDebugRunRequest({ lastDays: 7, now });
    expect(req.lastUpdatedAfter).toBe(new Date(now - 7 * DAY).toISOString());
    expect(req.lastUpdatedBefore).toBe(new Date(now + DAY).toISOString());
    expect(req.orderBy).toEqual([{ orderBy: 'RunStart', order: 'DESC' }]);
    expect(req.filters).toEqual([]);
  });

  it('adds a PipelineName Equals filter when a pipeline name is given', () => {
    const req = buildDebugRunRequest({ lastDays: 1, now, pipelineName: 'Copy_Data' });
    expect(req.filters).toContainEqual({ operand: 'PipelineName', operator: 'Equals', values: ['Copy_Data'] });
  });

  it('adds a Status filter with the normalized canonical casing', () => {
    const req = buildDebugRunRequest({ lastDays: 1, now, status: 'failed' });
    expect(req.filters).toContainEqual({ operand: 'Status', operator: 'Equals', values: ['Failed'] });
  });

  it('normalizes the British "Cancelling" status in the filter value', () => {
    const req = buildDebugRunRequest({ lastDays: 1, now, status: 'Cancelling' });
    expect(req.filters).toContainEqual({ operand: 'Status', operator: 'Equals', values: ['Canceling'] });
  });
});

describe('paginateDebugRuns', () => {
  function pager(pages: QueryPipelineRunsResponse[], captured?: QueryPipelineRunsRequest[]) {
    let i = 0;
    return async (body: QueryPipelineRunsRequest): Promise<QueryPipelineRunsResponse> => {
      captured?.push(body);
      return pages[i++];
    };
  }

  const base: QueryPipelineRunsRequest = {
    lastUpdatedAfter: 'a',
    lastUpdatedBefore: 'b',
    filters: [],
    orderBy: [{ orderBy: 'RunStart', order: 'DESC' }],
  };

  it('returns all runs from a single page under the cap, not truncated', async () => {
    const fetch = pager([{ value: [run({ runId: '1' }), run({ runId: '2' })] }]);
    const result = await paginateDebugRuns(fetch, base, 100);
    expect(result.runs.map((r) => r.runId)).toEqual(['1', '2']);
    expect(result.truncated).toBe(false);
  });

  it('follows continuationToken across pages and concatenates, not truncated when exhausted', async () => {
    const fetch = pager([
      { value: [run({ runId: '1' })], continuationToken: 'tok1' },
      { value: [run({ runId: '2' })], continuationToken: 'tok2' },
      { value: [run({ runId: '3' })] },
    ]);
    const result = await paginateDebugRuns(fetch, base, 100);
    expect(result.runs.map((r) => r.runId)).toEqual(['1', '2', '3']);
    expect(result.truncated).toBe(false);
  });

  it('injects the continuationToken into the body on subsequent pages only', async () => {
    const captured: QueryPipelineRunsRequest[] = [];
    const fetch = pager(
      [
        { value: [run({ runId: '1' })], continuationToken: 'tok1' },
        { value: [run({ runId: '2' })] },
      ],
      captured
    );
    await paginateDebugRuns(fetch, base, 100);
    expect((captured[0] as any).continuationToken).toBeUndefined();
    expect((captured[1] as any).continuationToken).toBe('tok1');
  });

  it('stops at maxResults and reports truncated when more pages remain', async () => {
    const fetch = pager([
      { value: [run({ runId: '1' }), run({ runId: '2' })], continuationToken: 'more' },
    ]);
    const result = await paginateDebugRuns(fetch, base, 2);
    expect(result.runs.map((r) => r.runId)).toEqual(['1', '2']);
    expect(result.truncated).toBe(true);
  });

  it('slices to maxResults and reports truncated when a single page overflows the cap', async () => {
    const fetch = pager([{ value: [run({ runId: '1' }), run({ runId: '2' }), run({ runId: '3' })] }]);
    const result = await paginateDebugRuns(fetch, base, 2);
    expect(result.runs.map((r) => r.runId)).toEqual(['1', '2']);
    expect(result.truncated).toBe(true);
  });

  it('reports NOT truncated when exactly maxResults are returned with no continuationToken', async () => {
    const fetch = pager([{ value: [run({ runId: '1' }), run({ runId: '2' })] }]);
    const result = await paginateDebugRuns(fetch, base, 2);
    expect(result.runs).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it('handles an empty first page', async () => {
    const fetch = pager([{ value: [] }]);
    const result = await paginateDebugRuns(fetch, base, 100);
    expect(result.runs).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

describe('summariseDebugRuns', () => {
  it('counts byStatus and byPipeline and reports returned + truncated', () => {
    const runs = [
      run({ runId: '1', pipelineName: 'A', status: 'Succeeded' }),
      run({ runId: '2', pipelineName: 'A', status: 'Failed' }),
      run({ runId: '3', pipelineName: 'B', status: 'Failed' }),
    ];
    const summary = summariseDebugRuns(runs, true);
    expect(summary.returned).toBe(3);
    expect(summary.truncated).toBe(true);
    expect(summary.byStatus).toEqual({ Succeeded: 1, Failed: 2 });
    expect(summary.byPipeline).toEqual({ A: 2, B: 1 });
  });

  it('preserves the verbatim wire status casing as keys (no case-folding)', () => {
    const runs = [run({ status: 'InProgress' }), run({ status: 'InProgress' })];
    const summary = summariseDebugRuns(runs, false);
    expect(summary.byStatus).toEqual({ InProgress: 2 });
  });
});
