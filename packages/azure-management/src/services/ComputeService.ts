import { ArmClient } from '../client/ArmClient.js';
import { FanOutRecorder, type FanOutInfo } from '@mcp-consultant-tools/core';
import type {
  VirtualMachine,
  VirtualMachineInstanceView,
  InstanceViewStatus,
} from '../types/arm-types.js';
import { getApiVersion } from '../utils/arm-api-versions.js';

/** Bucket a VM lands in when its runtime state was not asked for. */
const NOT_COLLECTED = 'not collected';
/** Bucket a VM lands in when its runtime state was asked for and refused. */
const UNAVAILABLE = 'unavailable';
/** Bucket a VM lands in when ARM answered but gave no `PowerState/...` entry. */
const UNKNOWN = 'unknown';

/**
 * Processed virtual machine summary.
 */
export interface VirtualMachineSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  zones?: string[];
  vmSize?: string;
  osType?: string;
  provisioningState?: string;
  vmId?: string;
  availabilitySetId?: string;
  scaleSetId?: string;
  /**
   * Runtime power state with the `PowerState/` prefix stripped - `running`,
   * `deallocated`, `stopped`. Absent whenever it was not collected, and absent is
   * never a state: see {@link statusUnavailable} and `summary.byPowerState`.
   */
  powerState?: string;
  /** Names of the OS and data disks attached to the VM. */
  disks?: string[];
  /** Resource ids of the network interfaces attached to the VM. */
  networkInterfaceIds?: string[];
  /** True when runtime state was asked for and the call was refused. */
  statusUnavailable?: boolean;
  /**
   * The `properties` block as ARM returned it, unfiltered.
   *
   * Passed through whole rather than mapped field by field. The VM properties block
   * is large and version-dependent, and a documentation-derived allowlist has now
   * discarded live payload three times in this repo.
   */
  properties?: Record<string, unknown>;
}

export interface ListVirtualMachinesResult {
  virtualMachines: VirtualMachineSummary[];
  summary: {
    total: number;
    byPowerState: Record<string, number>;
    bySize: Record<string, number>;
    byOsType: Record<string, number>;
    byLocation: Record<string, number>;
    /** What was and was not collected, in words, because the buckets alone can mislead. */
    note?: string;
  };
  fanOut: FanOutInfo;
}

/**
 * Service for Azure Compute operations.
 *
 * Read-only. Virtual machines were absent from this package entirely, which made a
 * subscription full of them look like a subscription with no compute in it.
 */
export class ComputeService {
  constructor(private client: ArmClient) {}

  /**
   * List virtual machines in the subscription or a resource group.
   *
   * Runtime state (`powerState`) is opt-in through `includeStatus`, because it costs
   * one extra ARM call per VM. It is collected through `VirtualMachines_InstanceView`
   * rather than the list operation's own parameters: `$expand=instanceView` is only
   * accepted alongside a `$filter`, and `statusOnly=true` exists at subscription
   * scope only, so neither works uniformly for a plain listing.
   *
   * Without `includeStatus`, `powerState` is absent on every row and every VM lands
   * in the `not collected` bucket. That is deliberate. A deallocated VM and a running
   * one must not look the same, and defaulting an uncollected state to anything at
   * all is how they would.
   */
  async listVirtualMachines(
    options: {
      resourceGroup?: string;
      includeStatus?: boolean;
    } = {}
  ): Promise<ListVirtualMachinesResult> {
    const { resourceGroup, includeStatus = false } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(
          resourceGroup,
          '/providers/Microsoft.Compute/virtualMachines'
        )
      : this.client.subscriptionPath('/providers/Microsoft.Compute/virtualMachines');

    const vms = await this.client.paginate<VirtualMachine>(
      path,
      getApiVersion('Microsoft.Compute/virtualMachines')
    );

    const fanOut = new FanOutRecorder();
    const results: VirtualMachineSummary[] = [];
    const summary = {
      total: vms.length,
      byPowerState: {} as Record<string, number>,
      bySize: {} as Record<string, number>,
      byOsType: {} as Record<string, number>,
      byLocation: {} as Record<string, number>,
      note: undefined as string | undefined,
    };

    for (const machine of vms) {
      const processed = this.processVirtualMachine(machine);

      let bucket = NOT_COLLECTED;
      if (includeStatus) {
        const view = await fanOut.run(machine.name, 'instanceView', () =>
          this.getInstanceView(machine.id)
        );

        if (view === null) {
          processed.statusUnavailable = true;
          bucket = UNAVAILABLE;
        } else {
          const power = readPowerState(view.statuses);
          if (power) {
            processed.powerState = power;
            bucket = power;
          } else {
            bucket = UNKNOWN;
          }
        }
      }

      summary.byPowerState[bucket] = (summary.byPowerState[bucket] || 0) + 1;

      if (processed.vmSize) {
        summary.bySize[processed.vmSize] = (summary.bySize[processed.vmSize] || 0) + 1;
      }
      if (processed.osType) {
        summary.byOsType[processed.osType] = (summary.byOsType[processed.osType] || 0) + 1;
      }
      if (processed.location) {
        summary.byLocation[processed.location] = (summary.byLocation[processed.location] || 0) + 1;
      }

      results.push(processed);
    }

    summary.note = buildNote(vms.length, includeStatus, summary.byPowerState, Boolean(resourceGroup));

    return { virtualMachines: results, summary, fanOut: fanOut.result() };
  }

  /**
   * Runtime view of one VM. `VirtualMachines_InstanceView` is a separate operation
   * from the list, and is the only route to power state that works at both scopes.
   */
  private async getInstanceView(resourceId: string): Promise<VirtualMachineInstanceView> {
    return this.client.get<VirtualMachineInstanceView>(
      `${resourceId}/instanceView`,
      getApiVersion('Microsoft.Compute/virtualMachines')
    );
  }

  /**
   * Map a VM into a summary, reading the fields the summary needs off the raw
   * `properties` block and passing that block through untouched alongside them.
   */
  private processVirtualMachine(machine: VirtualMachine): VirtualMachineSummary {
    const props = (machine.properties ?? {}) as Record<string, any>;

    const rgMatch = machine.id.match(/\/resourceGroups\/([^/]+)/i);

    const osDisk = props.storageProfile?.osDisk;
    const dataDisks: Array<{ name?: string }> = props.storageProfile?.dataDisks ?? [];

    return {
      id: machine.id,
      name: machine.name,
      resourceGroup: rgMatch ? rgMatch[1] : '',
      location: machine.location,
      zones: machine.zones,
      vmSize: props.hardwareProfile?.vmSize,
      osType: osDisk?.osType,
      provisioningState: props.provisioningState,
      vmId: props.vmId,
      availabilitySetId: props.availabilitySet?.id,
      scaleSetId: props.virtualMachineScaleSet?.id,
      disks: [osDisk?.name, ...dataDisks.map((d) => d.name)].filter(
        (n): n is string => typeof n === 'string'
      ),
      networkInterfaceIds: (props.networkProfile?.networkInterfaces ?? [])
        .map((nic: { id?: string }) => nic.id)
        .filter((id: unknown): id is string => typeof id === 'string'),
      properties: machine.properties,
    };
  }
}

/**
 * Pull the power state out of an instance view's status list.
 *
 * The array carries a `ProvisioningState/...` entry as well, so matching on the
 * `PowerState/` prefix is the whole job. Returns undefined when ARM answered
 * without one, which is a different thing from ARM refusing to answer.
 */
function readPowerState(statuses?: InstanceViewStatus[]): string | undefined {
  const entry = statuses?.find((s) => s.code?.startsWith('PowerState/'));
  return entry?.code?.slice('PowerState/'.length) || undefined;
}

/**
 * The note that stops the buckets being misread.
 *
 * An empty result and an uncollected power state are both silences, and a silence
 * is exactly what gets read as good news, so each one says in words what it is.
 */
function buildNote(
  total: number,
  includeStatus: boolean,
  byPowerState: Record<string, number>,
  scopedToResourceGroup: boolean
): string | undefined {
  const parts: string[] = [];

  if (total === 0) {
    parts.push(
      scopedToResourceGroup
        ? 'No virtual machines in this resource group. The subscription may hold VMs elsewhere - re-run without a resource group to see them.'
        : 'No virtual machines in this subscription. This is a real empty result, not a refused call: a refusal would have failed the command.'
    );
  }

  if (!includeStatus && total > 0) {
    parts.push(
      'Runtime power state was not collected, so every VM is in the "not collected" bucket and no row carries powerState. A deallocated VM is indistinguishable from a running one in this payload. Pass includeStatus (CLI: --include-status) to collect it, at one extra ARM call per VM.'
    );
  }

  if (includeStatus && byPowerState[UNAVAILABLE]) {
    parts.push(
      `${byPowerState[UNAVAILABLE]} VM(s) refused the instanceView call and are in the "unavailable" bucket rather than any power state. See fanOut.failures - do not read them as stopped.`
    );
  }

  if (includeStatus && byPowerState[UNKNOWN]) {
    parts.push(
      `${byPowerState[UNKNOWN]} VM(s) returned an instanceView with no PowerState entry and are in the "unknown" bucket. ARM answered; it just did not say.`
    );
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}
