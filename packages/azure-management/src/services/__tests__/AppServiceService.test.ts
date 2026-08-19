/**
 * D10: `app-service plans` reported `numberOfSites: 0` for all 24 plans in a measured
 * run, including plans demonstrably hosting running apps, and reported no value at all
 * for `workerCount`, `reserved` and `zoneRedundant`. An "unused App Service plan" rule
 * keyed on `numberOfSites === 0` therefore fires on every row, which is worse than no
 * rule at all.
 *
 * Two causes, both settled against the ARM swagger for
 * `Microsoft.Web/serverfarms` at api-version 2022-09-01:
 *
 *  - `AppServicePlans_List` (subscription scope) takes a `detailed` query parameter that
 *    "defaults to false, which returns a subset of the properties". The subset is what
 *    the measured run received. `AppServicePlans_ListByResourceGroup` carries no such
 *    parameter and always returns the full set, which is why a resource-group-scoped
 *    call never showed the defect.
 *  - `targetWorkerCount` is "Scaling worker count" and is writable. The count of
 *    instances actually assigned to a plan is the read-only `numberOfWorkers`. Reporting
 *    the scaling target under the name `workerCount` is a wrong number that looks right.
 *
 * The acceptance criterion is the failure case: a plan whose properties were never
 * requested must not be indistinguishable from a plan that genuinely hosts nothing.
 */

import { describe, it, expect } from 'vitest';
import type { ArmClient } from '../../client/ArmClient.js';
import { AppServiceService } from '../AppServiceService.js';

const SUB = '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const plan = (name: string, properties: Record<string, unknown>) => ({
  id: `${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Web/serverfarms/${name}`,
  name,
  location: 'uksouth',
  sku: { name: 'P1v3', tier: 'PremiumV3', capacity: 3 },
  kind: 'app',
  properties,
});

/**
 * Records the params ARM was asked for, so a test can assert on the request rather than
 * only on the response the stub chose to give back.
 */
function stubClient(plans: unknown[]) {
  const calls: Array<{ path: string; params?: Record<string, string> }> = [];
  const client = {
    paginate: async (path: string, _apiVersion?: string, params?: Record<string, string>) => {
      calls.push({ path, params });
      return plans;
    },
    subscriptionPath: (suffix: string) => `${SUB}${suffix}`,
    resourceGroupPath: (rg: string, suffix: string) => `${SUB}/resourceGroups/${rg}${suffix}`,
    getDefaultResourceGroup: () => 'rg-contoso',
  } as unknown as ArmClient;
  return { client, calls };
}

describe('AppServiceService.listAppServicePlans payload completeness', () => {
  it('asks ARM for the full property set at subscription scope', async () => {
    const { client, calls } = stubClient([plan('asp-contoso', { numberOfSites: 4 })]);

    await new AppServiceService(client).listAppServicePlans();

    expect(calls).toHaveLength(1);
    expect(calls[0].params?.detailed).toBe('true');
  });

  it('reports the assigned instance count, not the scaling target', async () => {
    const { client } = stubClient([
      plan('asp-contoso', { numberOfWorkers: 3, targetWorkerCount: 10, numberOfSites: 4 }),
    ]);

    const result = await new AppServiceService(client).listAppServicePlans();

    expect(result.plans[0].workerCount).toBe(3);
    expect(result.plans[0].targetWorkerCount).toBe(10);
  });

  it('a plan whose properties ARM omitted is not reported as an empty plan', async () => {
    const { client } = stubClient([plan('asp-contoso', {})]);

    const result = await new AppServiceService(client).listAppServicePlans();

    // `undefined` is dropped by JSON.stringify, so the key is absent rather than zero.
    // A `?? 0` here would manufacture the false "unused plan" this test exists to stop.
    expect(result.plans[0].numberOfSites).toBeUndefined();
    expect(result.plans[0].workerCount).toBeUndefined();
  });
});
