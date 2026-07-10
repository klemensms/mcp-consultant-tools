import { describe, it, expect, vi } from 'vitest';
import { SecureScoreService, toPercent, summariseScoreControls } from '../secure-score-service.js';
import type { DefenderClient } from '../../defender-client.js';
import type { SecureScoreControl } from '../../models/defender-types.js';

const control = (percentage: number, healthy: number, unhealthy: number): SecureScoreControl =>
  ({
    id: 'id',
    name: 'name',
    type: 'type',
    properties: {
      displayName: 'Control',
      score: { max: 10, current: 10 * percentage, percentage },
      healthyResourceCount: healthy,
      unhealthyResourceCount: unhealthy,
      notApplicableResourceCount: 0,
      weight: 1,
    },
  }) as SecureScoreControl;

describe('toPercent', () => {
  it('scales the ARM fraction to a percent with one decimal', () => {
    expect(toPercent(0.5)).toBe(50);
    expect(toPercent(1)).toBe(100);
    expect(toPercent(0)).toBe(0);
    expect(toPercent(0.4567)).toBe(45.7);
  });
});

describe('summariseScoreControls', () => {
  it('sums resource counts and averages the score', () => {
    const summary = summariseScoreControls([control(1, 3, 0), control(0, 0, 2)]);
    expect(summary).toEqual({
      total: 2,
      totalHealthy: 3,
      totalUnhealthy: 2,
      averageScorePercentage: 50,
    });
  });

  it('returns 0 rather than NaN for an empty control list', () => {
    expect(summariseScoreControls([]).averageScorePercentage).toBe(0);
  });
});

describe('SecureScoreService', () => {
  const fakeClient = (paginate: unknown, get?: unknown) =>
    ({
      subscriptionPath: (p = '') => `/subscriptions/SUB${p}`,
      paginate,
      get,
    }) as unknown as DefenderClient;

  it("defaults the score name to the well-known 'ascScore'", async () => {
    const get = vi.fn().mockResolvedValue({
      properties: { displayName: 'ASC Default', score: { max: 60, current: 30, percentage: 0.5 } },
    });
    const service = new SecureScoreService(fakeClient(vi.fn(), get));

    const result = await service.getSecureScore();

    expect(get.mock.calls[0][0]).toBe('/subscriptions/SUB/providers/Microsoft.Security/secureScores/ascScore');
    expect(result.summary.percentage).toBe(50);
  });

  it('url-encodes a custom score name', async () => {
    const get = vi.fn().mockResolvedValue({
      properties: { displayName: 'x', score: { max: 1, current: 1, percentage: 1 } },
    });
    const service = new SecureScoreService(fakeClient(vi.fn(), get));

    await service.getSecureScore('my score/name');

    expect(get.mock.calls[0][0]).toContain('my%20score%2Fname');
  });

  it('propagates the truncated flag from the client', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [control(1, 1, 0)], truncated: true });
    const service = new SecureScoreService(fakeClient(paginate));

    const result = await service.listScoreControls({ maxResults: 1 });

    expect(result.truncated).toBe(true);
    expect(result.summary.total).toBe(1);
  });
});
