/**
 * The acceptance criterion for this contract is the failure case, not the success
 * case: a truncated result must not be indistinguishable from a complete one.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTruncation,
  truncationSuffix,
  UNCAPPED,
  PAGINATION_SAFETY_CEILING,
} from '../truncation.js';

describe('buildTruncation', () => {
  it('a truncated result is distinguishable from a complete one at the same row count', () => {
    const truncated = buildTruncation({
      returnedCount: 500,
      requestedMax: 500,
      hasMore: true,
    });
    const complete = buildTruncation({
      returnedCount: 500,
      requestedMax: 500,
      hasMore: false,
    });

    expect(truncated).not.toEqual(complete);
    expect(truncated.hasMore).toBe(true);
    expect(complete.hasMore).toBe(false);
    expect(truncated.totalAvailable).toBeNull();
    expect(complete.totalAvailable).toBe(500);
  });

  it('claims no total when the fetch stopped short', () => {
    const result = buildTruncation({
      returnedCount: 500,
      requestedMax: 500,
      hasMore: true,
    });

    // 2,637 steps existed behind this. Reporting 500 as the total is the defect.
    expect(result.totalAvailable).toBeNull();
    expect(result.returnedCount).toBe(500);
  });

  it('reports an exact total only when the source was exhausted', () => {
    const result = buildTruncation({
      returnedCount: 542,
      requestedMax: UNCAPPED,
      hasMore: false,
    });

    expect(result.totalAvailable).toBe(542);
    expect(result.requestedMax).toBeNull();
    expect(result.truncationReason).toBeNull();
  });

  it('does not infer hasMore from returnedCount being below the cap', () => {
    // The D1 shape: 22 rows returned under a cap of 25, while the source held 136.
    const result = buildTruncation({
      returnedCount: 22,
      requestedMax: 25,
      hasMore: true,
    });

    expect(result.hasMore).toBe(true);
    expect(result.totalAvailable).toBeNull();
    expect(result.truncationReason).toBe('requestedMax');
  });

  it('never leaves a truncated result without a reason', () => {
    const result = buildTruncation({
      returnedCount: 10,
      requestedMax: 10,
      hasMore: true,
    });

    expect(result.truncationReason).not.toBeNull();
  });

  it('carries the safety-ceiling reason through', () => {
    const result = buildTruncation({
      returnedCount: PAGINATION_SAFETY_CEILING,
      requestedMax: UNCAPPED,
      hasMore: true,
      truncationReason: 'safetyCeiling',
    });

    expect(result.truncationReason).toBe('safetyCeiling');
    expect(result.totalAvailable).toBeNull();
  });
});

describe('truncationSuffix', () => {
  it('says nothing when the result is complete', () => {
    expect(
      truncationSuffix(
        buildTruncation({ returnedCount: 136, requestedMax: UNCAPPED, hasMore: false })
      )
    ).toBe('');
  });

  it('makes a truncated summary line visibly different from a complete one', () => {
    const truncated = truncationSuffix(
      buildTruncation({ returnedCount: 500, requestedMax: 500, hasMore: true })
    );

    expect(truncated).toContain('TRUNCATED');
    // Names the escape hatch in both idioms, because the same line is read by a
    // human at a terminal and by an agent calling the MCP tool.
    expect(truncated).toContain('-m 0');
    expect(truncated).toContain('maxRecords');
    expect(truncated).not.toBe('');
  });

  it('names the safety ceiling rather than suggesting a bigger -m', () => {
    const suffix = truncationSuffix(
      buildTruncation({
        returnedCount: PAGINATION_SAFETY_CEILING,
        requestedMax: UNCAPPED,
        hasMore: true,
        truncationReason: 'safetyCeiling',
      })
    );

    expect(suffix).toContain('safety ceiling');
    expect(suffix).not.toContain('-m 0');
  });
});
