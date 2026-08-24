import { describe, it, expect } from 'vitest';
import {
  getDotnetVersionInfo,
  isEolFramework,
  getEolDate,
  getRecommendedFramework,
} from '../dotnet-eol-data.js';

// A fixed "now" so the date-driven classification is deterministic.
const JUL_2026 = new Date('2026-07-11T00:00:00Z');

describe('getDotnetVersionInfo', () => {
  it('normalizes case and a leading v', () => {
    expect(getDotnetVersionInfo('NET8.0')?.moniker).toBe('net8.0');
    expect(getDotnetVersionInfo('vnet462')?.moniker).toBe('net462');
  });

  it('knows .NET 10 (shipped Nov 2025)', () => {
    const info = getDotnetVersionInfo('net10.0');
    expect(info).toBeDefined();
    expect(info?.isLts).toBe(true);
  });

  it('returns undefined for an unknown moniker', () => {
    expect(getDotnetVersionInfo('net99.0')).toBeUndefined();
  });
});

describe('isEolFramework - computed from eolDate vs now', () => {
  it('net9.0 is NOT EOL in July 2026 (real EOL is 2026-11-10, not the stale 2026-05-12)', () => {
    expect(isEolFramework('net9.0', JUL_2026)).toBe(false);
  });

  it('net9.0 IS EOL once its real EOL date has passed', () => {
    expect(isEolFramework('net9.0', new Date('2026-12-01T00:00:00Z'))).toBe(true);
  });

  it('net8.0 (LTS) is not EOL before 2026-11-10 and is EOL after', () => {
    expect(isEolFramework('net8.0', JUL_2026)).toBe(false);
    expect(isEolFramework('net8.0', new Date('2027-01-01T00:00:00Z'))).toBe(true);
  });

  it('net6.0 and net7.0 are already EOL', () => {
    expect(isEolFramework('net6.0', JUL_2026)).toBe(true);
    expect(isEolFramework('net7.0', JUL_2026)).toBe(true);
  });

  it('.NET Framework 4.5.2 / 4.6 / 4.6.1 are EOL (retired 2022-04-26), not supported', () => {
    expect(isEolFramework('net452', JUL_2026)).toBe(true);
    expect(isEolFramework('net46', JUL_2026)).toBe(true);
    expect(isEolFramework('net461', JUL_2026)).toBe(true);
  });

  it('.NET Framework 4.6.2 is still supported (real EOL 2027-01-12)', () => {
    expect(isEolFramework('net462', JUL_2026)).toBe(false);
    expect(getEolDate('net462')).toBe('2027-01-12');
  });

  it('.NET Framework 4.7.x / 4.8 / 4.8.1 have no fixed EOL (OS-tied) and are not flagged', () => {
    expect(isEolFramework('net472', JUL_2026)).toBe(false);
    expect(isEolFramework('net48', JUL_2026)).toBe(false);
    expect(isEolFramework('net481', JUL_2026)).toBe(false);
    expect(getEolDate('net48')).toBeUndefined();
  });

  it('an unknown framework is never flagged EOL', () => {
    expect(isEolFramework('net99.0', JUL_2026)).toBe(false);
  });
});

describe('getRecommendedFramework', () => {
  it('recommends a currently-supported LTS', () => {
    expect(isEolFramework(getRecommendedFramework(), JUL_2026)).toBe(false);
  });
});
