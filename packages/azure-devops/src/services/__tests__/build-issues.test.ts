import { describe, it, expect } from 'vitest';
import { extractBuildIssues, type TimelineRecord } from '../build-issues.js';

const record = (over: Partial<TimelineRecord>): TimelineRecord => ({
  name: 'Build',
  type: 'Task',
  ...over,
});

describe('extractBuildIssues', () => {
  it('reads lowercase issue types (error/warning), which is all Azure DevOps emits', () => {
    const result = extractBuildIssues([
      record({
        issues: [
          { type: 'error', message: 'CS1002: ; expected' },
          { type: 'warning', message: 'CS0168: variable declared but never used' },
        ],
      }),
    ]);

    expect(result.totalErrors).toBe(1);
    expect(result.totalWarnings).toBe(1);
    expect(result.records[0].issues.map((i) => i.type)).toEqual(['error', 'warning']);
  });

  it('is case-insensitive, so a capitalised type is not silently dropped', () => {
    const result = extractBuildIssues([
      record({ issues: [{ type: 'Error', message: 'boom' }] }),
    ]);

    expect(result.totalErrors).toBe(1);
  });

  it('classifies an unrecognised type as "other" rather than discarding it', () => {
    const result = extractBuildIssues([
      record({ issues: [{ type: 'info', message: 'fyi' }] }),
    ]);

    expect(result.totalErrors).toBe(0);
    expect(result.totalWarnings).toBe(0);
    expect(result.records[0].issues[0].type).toBe('other');
  });

  it('flags when the server counted problems it attached no message to', () => {
    // The si source summed these counters but listed only records with issues[],
    // so the detail silently under-represented the totals.
    const result = extractBuildIssues([
      record({ errorCount: 3, warningCount: 0, issues: [{ type: 'error', message: 'only one' }] }),
    ]);

    expect(result.totalErrors).toBe(1);
    expect(result.timelineCounters).toEqual({ errors: 3, warnings: 0 });
    expect(result.countersExceedListedIssues).toBe(true);
  });

  it('does not flag a disagreement when counters and issues line up', () => {
    const result = extractBuildIssues([
      record({ errorCount: 1, warningCount: 1, issues: [
        { type: 'error', message: 'e' },
        { type: 'warning', message: 'w' },
      ] }),
    ]);

    expect(result.countersExceedListedIssues).toBe(false);
  });

  it('keeps totals complete when filtering to one severity', () => {
    const result = extractBuildIssues(
      [record({ issues: [
        { type: 'error', message: 'e' },
        { type: 'warning', message: 'w' },
      ] })],
      'errors',
    );

    // Listed detail is narrowed...
    expect(result.records[0].issues).toHaveLength(1);
    expect(result.records[0].issues[0].type).toBe('error');
    // ...but the totals still describe the whole build.
    expect(result.totalErrors).toBe(1);
    expect(result.totalWarnings).toBe(1);
  });

  it('omits records with no matching issues after filtering', () => {
    const result = extractBuildIssues(
      [
        record({ name: 'Compile', issues: [{ type: 'error', message: 'e' }] }),
        record({ name: 'Lint', issues: [{ type: 'warning', message: 'w' }] }),
      ],
      'errors',
    );

    expect(result.records.map((r) => r.recordName)).toEqual(['Compile']);
  });

  it('passes the record type through verbatim rather than filtering on it', () => {
    // Timeline record `type` is not a documented enum; we must not depend on its casing.
    const result = extractBuildIssues([
      record({ name: 'Deploy to Prod', type: 'Stage', result: 'failed', issues: [{ type: 'error', message: 'boom' }] }),
    ]);

    expect(result.records[0]).toMatchObject({
      recordName: 'Deploy to Prod',
      recordType: 'Stage',
      result: 'failed',
    });
  });

  it('handles a timeline with no records and no issues', () => {
    const result = extractBuildIssues([]);

    expect(result).toMatchObject({
      totalErrors: 0,
      totalWarnings: 0,
      countersExceedListedIssues: false,
      records: [],
    });
  });

  it('tolerates a record with no issues array (Azure DevOps omits it)', () => {
    const result = extractBuildIssues([record({ errorCount: 0 })]);
    expect(result.records).toEqual([]);
  });
});
