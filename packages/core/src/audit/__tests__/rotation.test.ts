import { describe, it, expect } from 'vitest';
import { currentFilename } from '../rotation.js';

describe('currentFilename', () => {
  const date = new Date('2026-05-01T12:34:56Z');

  it('uses YYYY-MM for monthly rotation', () => {
    expect(currentFilename('monthly', date)).toBe('2026-05.jsonl');
  });

  it('uses YYYY-MM-DD for daily rotation', () => {
    expect(currentFilename('daily', date)).toBe('2026-05-01.jsonl');
  });

  it('uses YYYY-Www for weekly rotation (ISO week)', () => {
    expect(currentFilename('weekly', date)).toMatch(/^2026-W\d{2}\.jsonl$/);
  });

  it('uses ISO week-year (not calendar year) at year boundaries', () => {
    // 2024-12-30 is Monday of ISO week 2025-W01 — calendar year 2024 but ISO year 2025
    expect(currentFilename('weekly', new Date('2024-12-30T12:00:00Z'))).toBe('2025-W01.jsonl');
  });

  it('uses size-rotation marker filename', () => {
    expect(currentFilename({ sizeBytes: 100 * 1024 * 1024 }, date)).toMatch(
      /^2026-05-01_\d{6}\.jsonl$/
    );
  });
});
