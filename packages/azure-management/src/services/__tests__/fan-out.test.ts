/**
 * X2 / D12: `--include-configuration` needs `Microsoft.Web/sites/config/list/action`,
 * a POST action outside Reader. Against a read-only credential every site 403s - 32
 * times in one measured run - while the command exits 0, writes a cache file, and
 * leaves `configuration` simply absent. A consumer cannot tell "no settings" from
 * "not allowed to look".
 *
 * The acceptance criterion is the failure case: a partially-authorised collection must
 * not be indistinguishable from a fully-authorised one.
 */

import { describe, it, expect } from 'vitest';
import type { ArmClient } from '../../client/ArmClient.js';
import { FunctionAppService } from '../FunctionAppService.js';
import { AppServiceService } from '../AppServiceService.js';

const forbidden = () => {
  const error = new Error('Request failed with status code 403') as Error & {
    response: { status: number };
  };
  error.response = { status: 403 };
  return error;
};

const site = (name: string, kind: string) => ({
  id: `/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/resourceGroups/rg-contoso/providers/Microsoft.Web/sites/${name}`,
  name,
  kind,
  location: 'uksouth',
  properties: { state: 'Running', httpsOnly: true },
});

/**
 * `paginate` lists the sites; `get` and `post` serve the per-site config calls, which
 * is where the 403 lands against a Reader credential.
 */
function stubClient(sites: unknown[], configBehaviour: 'ok' | 'forbidden'): ArmClient {
  return {
    paginate: async () => sites,
    get: async () => {
      if (configBehaviour === 'forbidden') throw forbidden();
      return { properties: { alwaysOn: true, http20Enabled: false } };
    },
    post: async () => {
      if (configBehaviour === 'forbidden') throw forbidden();
      return { properties: {} };
    },
    subscriptionPath: (suffix: string) => `/subscriptions/x${suffix}`,
    resourceGroupPath: (rg: string, suffix: string) => `/subscriptions/x/resourceGroups/${rg}${suffix}`,
    getDefaultResourceGroup: () => 'rg-contoso',
  } as unknown as ArmClient;
}

describe('FunctionAppService.listFunctionApps fan-out', () => {
  const apps = Array.from({ length: 32 }, (_, i) => site(`contoso-func-${i}`, 'functionapp'));

  it('a run where every configuration call 403s is distinguishable from one where none did', async () => {
    const denied = await new FunctionAppService(stubClient(apps, 'forbidden')).listFunctionApps({
      includeConfiguration: true,
    });
    const allowed = await new FunctionAppService(stubClient(apps, 'ok')).listFunctionApps({
      includeConfiguration: true,
    });

    expect(denied.fanOut).not.toEqual(allowed.fanOut);
    expect(denied.fanOut.attempted).toBe(32);
    expect(denied.fanOut.succeeded).toBe(0);
    expect(denied.fanOut.failed).toBe(32);
    expect(allowed.fanOut.failed).toBe(0);
  });

  it('names each site that could not be collected, and the status code', async () => {
    const result = await new FunctionAppService(stubClient(apps, 'forbidden')).listFunctionApps({
      includeConfiguration: true,
    });

    expect(result.fanOut.failures).toHaveLength(32);
    expect(result.fanOut.failures[0]).toMatchObject({
      item: 'contoso-func-0',
      operation: 'configuration',
      statusCode: 403,
    });
  });

  it('marks the site itself, so a blank configuration cannot read as "no settings"', async () => {
    const result = await new FunctionAppService(stubClient(apps, 'forbidden')).listFunctionApps({
      includeConfiguration: true,
    });

    expect(result.functionApps[0].configurationUnavailable).toBe(true);
    expect(result.functionApps[0].configuration).toBeUndefined();
  });

  it('does not mark sites whose configuration was collected', async () => {
    const result = await new FunctionAppService(stubClient(apps, 'ok')).listFunctionApps({
      includeConfiguration: true,
    });

    expect(result.functionApps[0].configurationUnavailable).toBeUndefined();
    expect(result.functionApps[0].configuration).toBeDefined();
  });

  it('reports an empty fan-out when nothing extra was asked for', async () => {
    const result = await new FunctionAppService(stubClient(apps, 'forbidden')).listFunctionApps({});

    expect(result.fanOut.attempted).toBe(0);
    expect(result.fanOut.failed).toBe(0);
  });
});

describe('AppServiceService.listAppServices fan-out', () => {
  const apps = Array.from({ length: 3 }, (_, i) => site(`contoso-web-${i}`, 'app'));

  it('reports the same shape, so a caller reads one contract across both commands', async () => {
    const result = await new AppServiceService(stubClient(apps, 'forbidden')).listAppServices({
      includeConfiguration: true,
    });

    expect(result.fanOut.attempted).toBe(3);
    expect(result.fanOut.failed).toBe(3);
    expect(result.appServices[0].configurationUnavailable).toBe(true);
  });
});
