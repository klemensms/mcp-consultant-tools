import { describe, it, expect } from 'vitest';
import { classifyCredential, MS_PER_DAY } from '../credential-status.js';

const NOW = new Date('2026-07-10T12:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

describe('classifyCredential - missing or unparseable expiry', () => {
  // Graph always returns endDateTime on a credential, but a $select that omits it
  // (or a future schema change) must not silently read as "active".
  it.each([undefined, null, '', 'not-a-date'])('reports unknown for %o', (value) => {
    expect(classifyCredential(value as string | null | undefined, NOW, 30)).toEqual({
      status: 'unknown',
      daysUntilExpiry: null,
    });
  });
});

describe('classifyCredential - the expiry boundary', () => {
  it('treats exactly-now as expired, not as expiring with 0 days', () => {
    // A credential is invalid AT endDateTime, not after it.
    expect(classifyCredential(at(0), NOW, 30)).toEqual({
      status: 'expired',
      daysUntilExpiry: 0,
    });
  });

  it('treats one millisecond past expiry as expired', () => {
    expect(classifyCredential(at(-1), NOW, 30).status).toBe('expired');
  });

  it('treats one millisecond before expiry as expiring', () => {
    expect(classifyCredential(at(1), NOW, 30)).toEqual({
      status: 'expiring',
      daysUntilExpiry: 0,
    });
  });
});

describe('classifyCredential - the threshold boundary', () => {
  it('includes a credential expiring exactly at the threshold', () => {
    expect(classifyCredential(at(30 * MS_PER_DAY), NOW, 30)).toEqual({
      status: 'expiring',
      daysUntilExpiry: 30,
    });
  });

  it('excludes a credential one millisecond past the threshold', () => {
    // Compared in milliseconds, not in rounded days - rounding first would call this
    // "30 days" and wrongly include it.
    expect(classifyCredential(at(30 * MS_PER_DAY + 1), NOW, 30)).toEqual({
      status: 'active',
      daysUntilExpiry: 30,
    });
  });

  it('with a zero threshold, anything still valid is active', () => {
    expect(classifyCredential(at(1), NOW, 0).status).toBe('active');
  });

  it('with a zero threshold, an expired credential is still expired', () => {
    expect(classifyCredential(at(-1), NOW, 0).status).toBe('expired');
  });
});

describe('classifyCredential - daysUntilExpiry', () => {
  it('floors a partial day so 23h remaining reads as "expires today"', () => {
    expect(classifyCredential(at(23 * 3_600_000), NOW, 30).daysUntilExpiry).toBe(0);
  });

  it('reports whole days for a future expiry', () => {
    expect(classifyCredential(at(45 * MS_PER_DAY), NOW, 30)).toEqual({
      status: 'active',
      daysUntilExpiry: 45,
    });
  });

  it('reports a negative day count for an already-expired credential', () => {
    expect(classifyCredential(at(-10 * MS_PER_DAY), NOW, 30)).toEqual({
      status: 'expired',
      daysUntilExpiry: -10,
    });
  });
});

describe('classifyCredential - determinism', () => {
  it('depends only on the injected clock', () => {
    const past = new Date('2020-01-01T00:00:00.000Z');
    const expiry = '2021-01-01T00:00:00.000Z';

    // The same credential is active in 2020 and expired relative to NOW (2026).
    expect(classifyCredential(expiry, past, 30).status).toBe('active');
    expect(classifyCredential(expiry, NOW, 30).status).toBe('expired');
  });
});
