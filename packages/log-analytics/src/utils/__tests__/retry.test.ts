/**
 * `LogAnalyticsService.executeQuery` made exactly one `axios.post` and had no retry
 * policy, while `ArmClient` and `DefenderClient` both retry the transient set with
 * backoff and honour `Retry-After`. Its 429 branch read that header purely to print it,
 * so the caller was told how long to wait and then left to wait themselves.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  RETRY_STATUS_CODES,
  DEFAULT_MAX_RETRIES,
} from '../retry.js';

const httpError = (status: number, headers: Record<string, unknown> = {}) => ({
  response: { status, headers },
});

/** Collects the delays asked for instead of waiting them out. */
function recordingSleep() {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms);
    },
  };
}

describe('withRetry', () => {
  it('returns the first success without sleeping', async () => {
    const { delays, sleep } = recordingSleep();
    const op = vi.fn().mockResolvedValue('ok');

    expect(await withRetry(op, { sleep })).toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('retries every status in the transient set and eventually succeeds', async () => {
    for (const status of RETRY_STATUS_CODES) {
      const { sleep } = recordingSleep();
      const op = vi
        .fn()
        .mockRejectedValueOnce(httpError(status))
        .mockResolvedValue('ok');

      expect(await withRetry(op, { sleep })).toBe('ok');
      expect(op, `status ${status} was not retried`).toHaveBeenCalledTimes(2);
    }
  });

  it('honours Retry-After rather than only printing it', async () => {
    const { delays, sleep } = recordingSleep();
    const op = vi
      .fn()
      .mockRejectedValueOnce(httpError(429, { 'retry-after': '7' }))
      .mockResolvedValue('ok');

    await withRetry(op, { sleep });

    // 7 seconds as the service asked, not the 1000ms backoff it would otherwise use.
    expect(delays).toEqual([7000]);
  });

  it('backs off exponentially when there is no usable Retry-After', async () => {
    const { delays, sleep } = recordingSleep();
    const op = vi.fn().mockRejectedValue(httpError(503));

    await expect(withRetry(op, { sleep })).rejects.toMatchObject({
      response: { status: 503 },
    });

    expect(delays).toEqual([1000, 2000, 4000]);
    expect(op).toHaveBeenCalledTimes(DEFAULT_MAX_RETRIES + 1);
  });

  it('falls back to backoff on a malformed Retry-After rather than retrying instantly', async () => {
    const { delays, sleep } = recordingSleep();
    const op = vi
      .fn()
      .mockRejectedValueOnce(httpError(429, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }))
      .mockResolvedValue('ok');

    await withRetry(op, { sleep });

    // A zero here would hammer the service exactly when it asked us not to.
    expect(delays).toEqual([1000]);
  });

  it('does not retry a status outside the transient set', async () => {
    const { sleep } = recordingSleep();

    for (const status of [400, 401, 403, 404]) {
      const op = vi.fn().mockRejectedValue(httpError(status));
      await expect(withRetry(op, { sleep })).rejects.toMatchObject({
        response: { status },
      });
      expect(op, `status ${status} should not be retried`).toHaveBeenCalledTimes(1);
    }
  });

  it('does not retry 504, where the query itself is what did not finish', async () => {
    // ArmClient and DefenderClient do retry 504. On the query API an identical retry
    // buys another 30-second wait and then the same answer, and the existing error
    // message already tells the caller to narrow the query.
    const { sleep } = recordingSleep();
    const op = vi.fn().mockRejectedValue(httpError(504));

    await expect(withRetry(op, { sleep })).rejects.toMatchObject({
      response: { status: 504 },
    });
    expect(op).toHaveBeenCalledTimes(1);
    expect(RETRY_STATUS_CODES).not.toContain(504);
  });

  it('rethrows the original error unchanged, so the caller mapping still works', async () => {
    const { sleep } = recordingSleep();
    const original = httpError(500, { 'x-ms-request-id': 'abc' });
    const op = vi.fn().mockRejectedValue(original);

    await expect(withRetry(op, { sleep })).rejects.toBe(original);
  });

  it('does not retry a network error that carries no response', async () => {
    const { sleep } = recordingSleep();
    const op = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(withRetry(op, { sleep })).rejects.toThrow('ECONNREFUSED');
    expect(op).toHaveBeenCalledTimes(1);
  });
});
