import { describe, it, expect } from 'vitest';
import { canonicalSerialize, computeRecordHash, ZERO_HASH } from '../chain.js';

describe('canonicalSerialize', () => {
  it('produces stable output regardless of insertion order', () => {
    const a = canonicalSerialize({ b: 2, a: 1, c: { z: 9, y: 8 } });
    const b = canonicalSerialize({ a: 1, c: { y: 8, z: 9 }, b: 2 });
    expect(a).toBe(b);
  });

  it('handles arrays preserving element order', () => {
    const s = canonicalSerialize({ ids: ['c', 'a', 'b'] });
    expect(s).toBe('{"ids":["c","a","b"]}');
  });

  it('handles null and missing values', () => {
    const s = canonicalSerialize({ a: null, b: undefined, c: 1 });
    expect(s).toBe('{"a":null,"c":1}');
  });
});

describe('computeRecordHash', () => {
  it('is deterministic', () => {
    const r = { v: 1, ts: '2026-05-01T12:00:00Z', seq: 1, prevHash: ZERO_HASH };
    expect(computeRecordHash(r)).toBe(computeRecordHash(r));
  });

  it('changes when any field changes', () => {
    const r1 = { v: 1, ts: '2026-05-01T12:00:00Z', seq: 1, prevHash: ZERO_HASH };
    const r2 = { ...r1, ts: '2026-05-01T12:00:01Z' };
    expect(computeRecordHash(r1)).not.toBe(computeRecordHash(r2));
  });

  it('returns a 64-char hex string', () => {
    const h = computeRecordHash({ x: 1 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('exposes ZERO_HASH as a 64-zero hex string', () => {
    expect(ZERO_HASH).toBe('0'.repeat(64));
  });
});
