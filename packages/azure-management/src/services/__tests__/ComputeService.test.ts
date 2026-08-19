/**
 * D13 (part 1 of 4): `azure-management` had no command for
 * `Microsoft.Compute/virtualMachines` at all. In the estate measured, VMs and their
 * dependants were 244 of 1,117 resources, so every audit run against this package
 * reported a subscription with no compute in it.
 *
 * A list command alone is not enough to close that, because the field that matters
 * most on a VM is its power state, and a VM's power state is not in the list
 * response. `VirtualMachines_ListAll` returns the model, not the runtime; the
 * runtime lives in `properties.instanceView`, which the list operation only
 * populates when asked. So the failure case this file exists to stop is a
 * deallocated VM being indistinguishable from a running one, which is the same
 * fail-towards-a-clean-result the rest of this chain has been closing.
 *
 * Settled against the ARM swagger for `Microsoft.Compute/virtualMachines` at
 * api-version 2024-07-01:
 *
 *  - `VirtualMachines_ListAll` (subscription scope) takes `statusOnly`, and
 *    `VirtualMachines_List` (resource-group scope) does not. `$expand=instanceView`
 *    exists on both but "can only be specified if a valid $filter option is
 *    specified", so it is not usable for a plain listing.
 *  - `VirtualMachines_InstanceView` is a per-VM operation and is the only route to
 *    runtime state that works identically at both scopes.
 *  - `statuses[].code` carries the power state as `PowerState/running`,
 *    `PowerState/deallocated` and so on, alongside a `ProvisioningState/...` entry.
 *
 * Runtime state is therefore opt-in and collected per VM through `FanOutRecorder`,
 * so a refused `instanceView` is reported rather than read as a VM with no state.
 */

import { describe, it, expect } from 'vitest';
import type { ArmClient } from '../../client/ArmClient.js';
import { ComputeService } from '../ComputeService.js';

const SUB = '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * Extras are spread INSIDE `properties`, never alongside it. A fixture that passes
 * `{ properties: {...} }` as an override replaces the block rather than merging into
 * it, which has produced a false green in this repo before.
 */
const vm = (name: string, properties: Record<string, unknown> = {}) => ({
  id: `${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Compute/virtualMachines/${name}`,
  name,
  type: 'Microsoft.Compute/virtualMachines',
  location: 'uksouth',
  properties: {
    vmId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    provisioningState: 'Succeeded',
    hardwareProfile: { vmSize: 'Standard_D2s_v3' },
    ...properties,
  },
});

const powerStatus = (state: string) => ({
  statuses: [
    { code: 'ProvisioningState/succeeded', level: 'Info', displayStatus: 'Provisioning succeeded' },
    { code: `PowerState/${state}`, level: 'Info', displayStatus: `VM ${state}` },
  ],
});

/**
 * Records the paths and params ARM was asked for, so a test can assert on the
 * request rather than only on the response the stub chose to give back.
 * `instanceViews` maps a VM name to what its `/instanceView` call returns; a name
 * mapped to an Error makes that one call fail while the rest succeed.
 */
function stubClient(
  vms: unknown[],
  instanceViews: Record<string, unknown | Error> = {}
) {
  const calls: Array<{ path: string; params?: Record<string, string> }> = [];
  const client = {
    paginate: async (path: string, _apiVersion?: string, params?: Record<string, string>) => {
      calls.push({ path, params });
      return vms;
    },
    get: async (path: string, _apiVersion?: string, params?: Record<string, string>) => {
      calls.push({ path, params });
      const name = path.match(/virtualMachines\/([^/]+)/)?.[1] ?? '';
      const answer = instanceViews[name];
      if (answer instanceof Error) throw answer;
      return answer ?? {};
    },
    subscriptionPath: (suffix: string) => `${SUB}${suffix}`,
    resourceGroupPath: (rg: string, suffix: string) => `${SUB}/resourceGroups/${rg}${suffix}`,
    getDefaultResourceGroup: () => 'rg-contoso',
  } as unknown as ArmClient;
  return { client, calls };
}

const forbidden = (message: string) => {
  const error = new Error(message) as Error & { status?: number };
  error.status = 403;
  return error;
};

describe('ComputeService.listVirtualMachines', () => {
  it('lists the VMs the subscription holds', async () => {
    const { client, calls } = stubClient([vm('vm-contoso-01'), vm('vm-contoso-02')]);

    const result = await new ComputeService(client).listVirtualMachines();

    expect(result.virtualMachines.map((v) => v.name)).toEqual(['vm-contoso-01', 'vm-contoso-02']);
    expect(result.summary.total).toBe(2);
    expect(calls[0].path).toBe(`${SUB}/providers/Microsoft.Compute/virtualMachines`);
  });

  it('a VM whose runtime state was never collected does not report one', async () => {
    const { client, calls } = stubClient([vm('vm-contoso-01')]);

    const result = await new ComputeService(client).listVirtualMachines();

    // The whole point: absent must read as "not asked", never as a state.
    expect(result.virtualMachines[0].powerState).toBeUndefined();
    expect(result.summary.byPowerState).toEqual({ 'not collected': 1 });
    expect(result.summary.note).toMatch(/power state/i);
    // And no per-VM call was made, so the default stays one request.
    expect(calls).toHaveLength(1);
  });

  it('collects runtime state per VM when asked, and reports it', async () => {
    const { client, calls } = stubClient(
      [vm('vm-contoso-01'), vm('vm-contoso-02')],
      {
        'vm-contoso-01': powerStatus('running'),
        'vm-contoso-02': powerStatus('deallocated'),
      }
    );

    const result = await new ComputeService(client).listVirtualMachines({ includeStatus: true });

    expect(result.virtualMachines[0].powerState).toBe('running');
    expect(result.virtualMachines[1].powerState).toBe('deallocated');
    expect(result.summary.byPowerState).toEqual({ running: 1, deallocated: 1 });
    expect(result.fanOut.attempted).toBe(2);
    expect(result.fanOut.failed).toBe(0);
    expect(calls[1].path).toBe(
      `${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Compute/virtualMachines/vm-contoso-01/instanceView`
    );
  });

  it('a refused instanceView is reported, not read as a VM with no state', async () => {
    const { client } = stubClient(
      [vm('vm-contoso-01'), vm('vm-contoso-02')],
      {
        'vm-contoso-01': powerStatus('deallocated'),
        'vm-contoso-02': forbidden('AuthorizationFailed: does not have authorization'),
      }
    );

    const result = await new ComputeService(client).listVirtualMachines({ includeStatus: true });

    expect(result.fanOut.attempted).toBe(2);
    expect(result.fanOut.failed).toBe(1);
    expect(result.fanOut.failures[0]).toMatchObject({
      item: 'vm-contoso-02',
      operation: 'instanceView',
      statusCode: 403,
    });
    // The refused VM must not land in the same bucket as the one that answered
    // "deallocated", or a cost review counts a VM it was never allowed to see.
    expect(result.virtualMachines[1].powerState).toBeUndefined();
    expect(result.virtualMachines[1].statusUnavailable).toBe(true);
    expect(result.summary.byPowerState).toEqual({ deallocated: 1, unavailable: 1 });
  });

  it('every VM lands in exactly one power-state bucket', async () => {
    const { client } = stubClient(
      [vm('vm-contoso-01'), vm('vm-contoso-02'), vm('vm-contoso-03')],
      {
        'vm-contoso-01': powerStatus('running'),
        // No PowerState entry at all: ARM answered, but not with a power state.
        'vm-contoso-02': { statuses: [{ code: 'ProvisioningState/updating', level: 'Info' }] },
        'vm-contoso-03': forbidden('AuthorizationFailed'),
      }
    );

    const result = await new ComputeService(client).listVirtualMachines({ includeStatus: true });

    const bucketed = Object.values(result.summary.byPowerState).reduce((a, b) => a + b, 0);
    expect(bucketed).toBe(result.summary.total);
    expect(result.summary.byPowerState).toEqual({ running: 1, unknown: 1, unavailable: 1 });
  });

  it('passes the raw properties block through, including keys it does not name', async () => {
    const { client } = stubClient([
      vm('vm-contoso-01', {
        // A key no mapper in this repo knows about. The chain has now had a
        // documentation-derived field allowlist discard live payload three times.
        someFieldThisRepoHasNeverHeardOf: { nested: true },
        storageProfile: { osDisk: { osType: 'Linux' } },
      }),
    ]);

    const result = await new ComputeService(client).listVirtualMachines();

    expect(result.virtualMachines[0].properties).toMatchObject({
      someFieldThisRepoHasNeverHeardOf: { nested: true },
    });
  });

  it('reads size and OS off the properties block for the summary', async () => {
    const { client } = stubClient([
      vm('vm-contoso-01', {
        hardwareProfile: { vmSize: 'Standard_D2s_v3' },
        storageProfile: { osDisk: { osType: 'Linux' } },
      }),
      vm('vm-contoso-02', {
        hardwareProfile: { vmSize: 'Standard_D2s_v3' },
        storageProfile: { osDisk: { osType: 'Windows' } },
      }),
    ]);

    const result = await new ComputeService(client).listVirtualMachines();

    expect(result.virtualMachines[0].vmSize).toBe('Standard_D2s_v3');
    expect(result.virtualMachines[0].osType).toBe('Linux');
    expect(result.summary.bySize).toEqual({ Standard_D2s_v3: 2 });
    expect(result.summary.byOsType).toEqual({ Linux: 1, Windows: 1 });
  });

  it('scopes to a resource group when one is given', async () => {
    const { client, calls } = stubClient([vm('vm-contoso-01')]);

    await new ComputeService(client).listVirtualMachines({ resourceGroup: 'rg-contoso' });

    expect(calls[0].path).toBe(
      `${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Compute/virtualMachines`
    );
  });

  it('an empty subscription says it looked, rather than saying nothing', async () => {
    const { client } = stubClient([]);

    const result = await new ComputeService(client).listVirtualMachines();

    expect(result.virtualMachines).toEqual([]);
    expect(result.summary.total).toBe(0);
    expect(result.summary.note).toMatch(/no virtual machines/i);
  });
});
