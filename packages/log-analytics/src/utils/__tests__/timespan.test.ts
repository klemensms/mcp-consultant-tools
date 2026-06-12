import { describe, it, expect } from 'vitest';
import { resolveEffectiveTimespan } from '../timespan.js';

describe('resolveEffectiveTimespan', () => {
  describe('no explicit timespan', () => {
    it('derives the timespan from ago() in the KQL instead of defaulting to PT1H', () => {
      const result = resolveEffectiveTimespan('AppTraces | where TimeGenerated > ago(30d)');
      expect(result.effectiveTimespan).toBe('P30D');
      expect(result.timespanWarning).toBeUndefined();
    });

    it('uses the widest ago() when the KQL contains several', () => {
      const result = resolveEffectiveTimespan(
        'AppTraces | where TimeGenerated > ago(1h) | join (AppExceptions | where TimeGenerated > ago(7d)) on OperationId'
      );
      expect(result.effectiveTimespan).toBe('P7D');
    });

    it('maps hour and minute ago() units to PT forms', () => {
      expect(resolveEffectiveTimespan('T | where t > ago(12h)').effectiveTimespan).toBe('PT12H');
      expect(resolveEffectiveTimespan('T | where t > ago(90m)').effectiveTimespan).toBe('PT90M');
    });

    it('handles fractional ago() values', () => {
      expect(resolveEffectiveTimespan('T | where t > ago(1.5d)').effectiveTimespan).toBe('PT36H');
    });

    it('defaults to PT1H when the KQL has no ago() at all', () => {
      const result = resolveEffectiveTimespan('AppTraces | take 10');
      expect(result.effectiveTimespan).toBe('PT1H');
      expect(result.timespanWarning).toBeUndefined();
    });
  });

  describe('explicit timespan', () => {
    it('is respected verbatim even when ago() is wider', () => {
      const result = resolveEffectiveTimespan('T | where t > ago(30d)', 'PT1H');
      expect(result.effectiveTimespan).toBe('PT1H');
    });

    it('warns when the KQL ago() is wider than the timespan in force', () => {
      const result = resolveEffectiveTimespan('T | where t > ago(30d)', 'PT1H');
      expect(result.timespanWarning).toContain('30d');
      expect(result.timespanWarning).toContain('PT1H');
    });

    it('does not warn when the timespan is wider than ago()', () => {
      const result = resolveEffectiveTimespan('T | where t > ago(30d)', 'P60D');
      expect(result.effectiveTimespan).toBe('P60D');
      expect(result.timespanWarning).toBeUndefined();
    });

    it('does not warn when timespan and ago() match', () => {
      const result = resolveEffectiveTimespan('T | where t > ago(1h)', 'PT1H');
      expect(result.timespanWarning).toBeUndefined();
    });

    it('passes through a start/end datetime timespan without attempting comparison', () => {
      const span = '2026-01-01T00:00:00Z/2026-01-02T00:00:00Z';
      const result = resolveEffectiveTimespan('T | where t > ago(30d)', span);
      expect(result.effectiveTimespan).toBe(span);
      expect(result.timespanWarning).toBeUndefined();
    });
  });
});
