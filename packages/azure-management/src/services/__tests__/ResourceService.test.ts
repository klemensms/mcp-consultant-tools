import { describe, it, expect } from 'vitest';
import type { ArmClient } from '../../client/ArmClient.js';
import { ResourceService, NO_SUBSCRIPTIONS_NOTE } from '../ResourceService.js';

function stubClient(subscriptions: unknown[], capture?: { path?: string; apiVersion?: string }): ArmClient {
  return {
    paginate: async (path: string, apiVersion?: string) => {
      if (capture) {
        capture.path = path;
        capture.apiVersion = apiVersion;
      }
      return subscriptions;
    },
  } as unknown as ArmClient;
}

describe('listSubscriptions', () => {
  it('summarises subscriptions by state', async () => {
    const service = new ResourceService(
      stubClient([
        { subscriptionId: 'a', displayName: 'Dev', state: 'Enabled' },
        { subscriptionId: 'b', displayName: 'Old', state: 'Disabled' },
        { subscriptionId: 'c', displayName: 'Prod', state: 'Enabled' },
      ])
    );

    const result = await service.listSubscriptions();
    expect(result.summary).toEqual({ total: 3, byState: { Enabled: 2, Disabled: 1 } });
    expect(result.note).toBeUndefined();
  });

  it('warns that an empty list is a permissions signal, not proof the tenant has none', async () => {
    // `/subscriptions` is RBAC-filtered and answers 200 [] - never 403 - when the
    // principal holds no role assignment anywhere.
    const service = new ResourceService(stubClient([]));
    const result = await service.listSubscriptions();

    expect(result.subscriptions).toEqual([]);
    expect(result.note).toBe(NO_SUBSCRIPTIONS_NOTE);
    expect(result.note).toMatch(/not evidence/i);
  });

  it('queries the tenant-level endpoint, ignoring the configured subscription', async () => {
    const capture: { path?: string; apiVersion?: string } = {};
    await new ResourceService(stubClient([], capture)).listSubscriptions();
    expect(capture.path).toBe('/subscriptions');
    expect(capture.apiVersion).toBe('2022-12-01');
  });
});
