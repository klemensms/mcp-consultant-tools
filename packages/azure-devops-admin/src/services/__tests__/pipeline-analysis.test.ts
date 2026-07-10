import { describe, it, expect } from 'vitest';
import {
  isStageRecord,
  isSuccessfulResult,
  stageNames,
  findSuccessfulStage,
  summariseBuildResults,
  type TimelineRecord,
} from '../pipeline-analysis.js';

const rec = (over: Partial<TimelineRecord>): TimelineRecord => ({ type: 'Stage', ...over });

describe('isStageRecord', () => {
  it('matches case-insensitively, since record.type is not a documented enum', () => {
    expect(isStageRecord({ type: 'Stage' })).toBe(true);
    expect(isStageRecord({ type: 'stage' })).toBe(true);
    expect(isStageRecord({ type: 'Job' })).toBe(false);
    expect(isStageRecord({})).toBe(false);
  });
});

describe('isSuccessfulResult', () => {
  it('counts succeededWithIssues as a successful deploy', () => {
    // A green stage that logged a warning is still deployed. The si source
    // only accepted 'succeeded', so such a stage reported as never deployed.
    expect(isSuccessfulResult('succeeded')).toBe(true);
    expect(isSuccessfulResult('succeededWithIssues')).toBe(true);
    expect(isSuccessfulResult('succeededwithissues')).toBe(true);
  });

  it('rejects every non-success result', () => {
    for (const result of ['failed', 'canceled', 'skipped', 'abandoned', undefined, '']) {
      expect(isSuccessfulResult(result)).toBe(false);
    }
  });
});

describe('findSuccessfulStage', () => {
  const records = [
    rec({ name: 'Dev', result: 'succeeded', finishTime: 'T1' }),
    rec({ name: 'Prod', result: 'failed' }),
    rec({ name: 'UAT', result: 'succeededWithIssues', finishTime: 'T2' }),
    rec({ type: 'Job', name: 'Dev', result: 'succeeded' }),
  ];

  it('matches the stage name case-insensitively', () => {
    // The si source used strict ===, so '--stages prod' against a 'Prod' stage
    // reported "never deployed" forever, indistinguishable from a real miss.
    expect(findSuccessfulStage(records, 'dev')?.finishTime).toBe('T1');
    expect(findSuccessfulStage(records, 'DEV')?.finishTime).toBe('T1');
  });

  it('accepts a succeededWithIssues stage', () => {
    expect(findSuccessfulStage(records, 'UAT')?.finishTime).toBe('T2');
  });

  it('ignores a failed stage', () => {
    expect(findSuccessfulStage(records, 'Prod')).toBeUndefined();
  });

  it('ignores a non-Stage record that happens to share the name', () => {
    const jobOnly = [rec({ type: 'Job', name: 'Release', result: 'succeeded' })];
    expect(findSuccessfulStage(jobOnly, 'Release')).toBeUndefined();
  });

  it('returns undefined when the stage does not exist', () => {
    expect(findSuccessfulStage(records, 'Staging')).toBeUndefined();
  });
});

describe('stageNames', () => {
  it('lists distinct stage names in encounter order, ignoring other record types', () => {
    const names = stageNames([
      rec({ name: 'Dev' }),
      rec({ type: 'Job', name: 'Compile' }),
      rec({ name: 'Prod' }),
      rec({ name: 'Dev' }),
    ]);
    expect(names).toEqual(['Dev', 'Prod']);
  });

  it('is empty when the timeline has no stage records', () => {
    expect(stageNames([rec({ type: 'Task', name: 'Restore' })])).toEqual([]);
  });
});

describe('summariseBuildResults', () => {
  it('covers the whole BuildResult enum so the counts add up', () => {
    const breakdown = summariseBuildResults([
      'succeeded',
      'partiallySucceeded',
      'failed',
      'canceled',
      'none',
      null,
      undefined,
    ]);

    expect(breakdown).toEqual({
      succeeded: 1,
      partiallySucceeded: 1,
      failed: 1,
      canceled: 1,
      none: 1,
      other: 0,
      noBuilds: 2,
    });

    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
    expect(total).toBe(7);
  });

  it('does not lose an unrecognised result', () => {
    expect(summariseBuildResults(['someFutureResult']).other).toBe(1);
  });

  it('is case-insensitive', () => {
    expect(summariseBuildResults(['PartiallySucceeded']).partiallySucceeded).toBe(1);
  });
});
