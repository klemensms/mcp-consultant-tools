/**
 * D9: `networking event-grid-topics` reported `total: 0` in every one of 16
 * subscriptions in a measured run, while the resource inventory from the same run held
 * 15 `Microsoft.EventGrid/systemTopics`. The command enumerated custom topics only and
 * presented that partial scope as a clean zero, so "this subscription has no Event Grid
 * topics" and "this subscription has 15 topics of a type I did not look at" were
 * byte-for-byte identical.
 *
 * The acceptance criterion is the failure case: an out-of-scope resource type must make
 * the result declare its scope rather than return a bare zero.
 */

import { describe, it, expect } from 'vitest';
import type { ArmClient } from '../../client/ArmClient.js';
import { NetworkingService } from '../NetworkingService.js';

const SUB = '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const forbidden = () => {
  const error = new Error('Request failed with status code 403') as Error & {
    response: { status: number };
  };
  error.response = { status: 403 };
  return error;
};

const customTopic = (name: string) => ({
  id: `${SUB}/resourceGroups/rg-contoso/providers/Microsoft.EventGrid/topics/${name}`,
  name,
  location: 'uksouth',
  properties: { endpoint: `https://${name}.uksouth-1.eventgrid.azure.net/api/events`, inputSchema: 'EventGridSchema' },
});

const systemTopic = (name: string) => ({
  id: `${SUB}/resourceGroups/rg-contoso/providers/Microsoft.EventGrid/systemTopics/${name}`,
  name,
  location: 'uksouth',
  properties: { source: `${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Storage/storageAccounts/contosostore`, topicType: 'Microsoft.Storage.StorageAccounts' },
});

/**
 * `paginate` serves both topic types off the same stub, keyed on the request path, so a
 * test can hold one type while the other is empty, or make one of them refuse.
 */
function stubClient(opts: {
  custom?: unknown[] | 'forbidden';
  system?: unknown[] | 'forbidden';
}): ArmClient {
  return {
    paginate: async (path: string) => {
      const which = path.includes('/systemTopics') ? opts.system : opts.custom;
      if (which === 'forbidden') throw forbidden();
      return which ?? [];
    },
    subscriptionPath: (suffix: string) => `${SUB}${suffix}`,
    resourceGroupPath: (rg: string, suffix: string) => `${SUB}/resourceGroups/${rg}${suffix}`,
    getDefaultResourceGroup: () => 'rg-contoso',
  } as unknown as ArmClient;
}

describe('NetworkingService.listEventGridTopics scope declaration', () => {
  const fifteenSystemTopics = Array.from({ length: 15 }, (_, i) => systemTopic(`contoso-system-topic-${i}`));

  it('a subscription holding only system topics is distinguishable from an empty one', async () => {
    const systemOnly = await new NetworkingService(
      stubClient({ custom: [], system: fifteenSystemTopics })
    ).listEventGridTopics();
    const empty = await new NetworkingService(
      stubClient({ custom: [], system: [] })
    ).listEventGridTopics();

    expect(systemOnly.summary).not.toEqual(empty.summary);
    expect(systemOnly.summary.total).toBe(15);
    expect(systemOnly.summary.system).toBe(15);
    expect(systemOnly.summary.custom).toBe(0);
    expect(empty.summary.total).toBe(0);
  });

  it('names the scope when topics exist that the default call does not list', async () => {
    const result = await new NetworkingService(
      stubClient({ custom: [], system: fifteenSystemTopics })
    ).listEventGridTopics();

    expect(result.topics).toHaveLength(0);
    expect(result.summary.listed).toBe(0);
    expect(result.summary.systemTopicsListed).toBe(false);
    expect(result.summary.note).toContain('15');
    expect(result.summary.note).toContain('includeSystemTopics');
  });

  it('adds no note when the unlisted scope is genuinely empty', async () => {
    const result = await new NetworkingService(
      stubClient({ custom: [customTopic('contoso-orders')], system: [] })
    ).listEventGridTopics();

    expect(result.summary.total).toBe(1);
    expect(result.summary.listed).toBe(1);
    expect(result.summary.note).toBeUndefined();
  });

  it('lists the system topics when asked, and counts them the same either way', async () => {
    const client = () => stubClient({ custom: [customTopic('contoso-orders')], system: fifteenSystemTopics });

    const listed = await new NetworkingService(client()).listEventGridTopics({
      includeSystemTopics: true,
    });
    const counted = await new NetworkingService(client()).listEventGridTopics();

    expect(listed.topics).toHaveLength(16);
    expect(listed.summary.listed).toBe(16);
    expect(listed.summary.systemTopicsListed).toBe(true);
    expect(listed.summary.note).toBeUndefined();
    expect(counted.summary.total).toBe(listed.summary.total);
    expect(counted.summary.system).toBe(listed.summary.system);
  });

  it('a refused system-topic query is named, not reported as an absence', async () => {
    const denied = await new NetworkingService(
      stubClient({ custom: [customTopic('contoso-orders')], system: 'forbidden' })
    ).listEventGridTopics();
    const genuinelyNone = await new NetworkingService(
      stubClient({ custom: [customTopic('contoso-orders')], system: [] })
    ).listEventGridTopics();

    expect(denied.fanOut).not.toEqual(genuinelyNone.fanOut);
    expect(denied.fanOut.failed).toBe(1);
    expect(denied.fanOut.failures[0]).toMatchObject({
      operation: 'systemTopics',
      statusCode: 403,
    });
    expect(denied.summary.systemTopicsUnavailable).toBe(true);
    expect(genuinelyNone.fanOut.failed).toBe(0);
    expect(genuinelyNone.summary.systemTopicsUnavailable).toBeUndefined();
  });

  it('a refused custom-topic query does not abandon the system topics', async () => {
    const result = await new NetworkingService(
      stubClient({ custom: 'forbidden', system: fifteenSystemTopics })
    ).listEventGridTopics({ includeSystemTopics: true });

    expect(result.summary.system).toBe(15);
    expect(result.topics).toHaveLength(15);
    expect(result.fanOut.failed).toBe(1);
    expect(result.fanOut.failures[0]).toMatchObject({ operation: 'customTopics', statusCode: 403 });
    expect(result.summary.customTopicsUnavailable).toBe(true);
  });
});
