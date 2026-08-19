/**
 * X2: one command family produced 32 authorisation failures inside commands that all
 * exited 0 and still wrote a cache file, so a partial collection was invisible unless
 * someone read the log.
 *
 * The acceptance criterion is the failure case: a partially-authorised collection must
 * not be indistinguishable from a fully-authorised one.
 */

import { describe, it, expect } from 'vitest';
import { FanOutRecorder, fanOutSuffix } from '../fan-out.js';

const forbidden = () => {
  const error = new Error('Request failed with status code 403') as Error & {
    response: { status: number };
  };
  error.response = { status: 403 };
  return error;
};

describe('FanOutRecorder', () => {
  it('a partial collection is distinguishable from a complete one', async () => {
    const partial = new FanOutRecorder();
    await partial.run('site-a', 'configuration', async () => ({ ok: true }));
    await partial.run('site-b', 'configuration', async () => {
      throw forbidden();
    });

    const complete = new FanOutRecorder();
    await complete.run('site-a', 'configuration', async () => ({ ok: true }));
    await complete.run('site-b', 'configuration', async () => ({ ok: true }));

    expect(partial.result()).not.toEqual(complete.result());
    expect(partial.result().failed).toBe(1);
    expect(complete.result().failed).toBe(0);
  });

  it('counts every attempt, not only the ones that returned', async () => {
    const recorder = new FanOutRecorder();
    for (let i = 0; i < 32; i++) {
      await recorder.run(`site-${i}`, 'configuration', async () => {
        throw forbidden();
      });
    }

    const result = recorder.result();

    expect(result.attempted).toBe(32);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(32);
    expect(result.failures).toHaveLength(32);
  });

  it('names what failed, what was attempted on it, and the status code', async () => {
    const recorder = new FanOutRecorder();
    await recorder.run('contoso-func', 'configuration', async () => {
      throw forbidden();
    });

    expect(recorder.result().failures[0]).toEqual({
      item: 'contoso-func',
      operation: 'configuration',
      reason: 'Request failed with status code 403',
      statusCode: 403,
    });
  });

  it('hands the caller null for a failed item rather than throwing', async () => {
    const recorder = new FanOutRecorder();

    const value = await recorder.run('site-a', 'configuration', async () => {
      throw forbidden();
    });

    expect(value).toBeNull();
  });

  it('returns the value unchanged when the call succeeds', async () => {
    const recorder = new FanOutRecorder();

    const value = await recorder.run('site-a', 'configuration', async () => ({ appSettings: [] }));

    expect(value).toEqual({ appSettings: [] });
  });

  it('records a status code of null when the error carries none', async () => {
    const recorder = new FanOutRecorder();
    await recorder.run('site-a', 'slots', async () => {
      throw new Error('socket hang up');
    });

    expect(recorder.result().failures[0].statusCode).toBeNull();
  });
});

describe('fanOutSuffix', () => {
  it('is empty when nothing failed and loud when something did', async () => {
    const clean = new FanOutRecorder();
    await clean.run('site-a', 'configuration', async () => ({ ok: true }));

    const partial = new FanOutRecorder();
    await partial.run('site-a', 'configuration', async () => {
      throw forbidden();
    });

    expect(fanOutSuffix(clean.result())).toBe('');
    expect(fanOutSuffix(partial.result())).toContain('INCOMPLETE');
    expect(fanOutSuffix(partial.result())).toContain('1 of 1');
  });

  it('names the commonest status code so a permissions gap is readable at a glance', async () => {
    const recorder = new FanOutRecorder();
    for (let i = 0; i < 32; i++) {
      await recorder.run(`site-${i}`, 'configuration', async () => {
        throw forbidden();
      });
    }

    expect(fanOutSuffix(recorder.result())).toContain('403');
  });
});
