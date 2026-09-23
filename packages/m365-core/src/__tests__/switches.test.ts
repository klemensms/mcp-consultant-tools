import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isEnabled, requireEnabled } from '../switches.js';

const VAR = 'M365_CORE_TEST_SWITCH';

describe('switches', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[VAR];
    delete process.env[VAR];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[VAR];
    else process.env[VAR] = saved;
  });

  it('is enabled only by the exact string "true"', () => {
    process.env[VAR] = 'true';
    expect(isEnabled(VAR)).toBe(true);
  });

  it.each(['TRUE', 'True', '1', 'yes', ' true', ''])('is disabled by %j', (value) => {
    process.env[VAR] = value;
    expect(isEnabled(VAR)).toBe(false);
  });

  it('is disabled when unset', () => {
    expect(isEnabled(VAR)).toBe(false);
  });

  it('requireEnabled throws a message naming the capability and the variable', () => {
    expect(() => requireEnabled(VAR, 'Sending')).toThrow(`Sending is disabled. Set ${VAR}=true to enable.`);
  });

  it('requireEnabled passes when enabled', () => {
    process.env[VAR] = 'true';
    expect(() => requireEnabled(VAR, 'Sending')).not.toThrow();
  });
});
