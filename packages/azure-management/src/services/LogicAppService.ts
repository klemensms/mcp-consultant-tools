import { ArmClient } from '../client/ArmClient.js';
import { FanOutRecorder, type FanOutInfo } from '@mcp-consultant-tools/core';
import type { LogicWorkflow, ApiConnection, ResourceGroup } from '../types/arm-types.js';
import { getApiVersion } from '../utils/arm-api-versions.js';

/**
 * Keys withheld from a workflow's `properties` block unless `includeDefinition` is
 * set. `definition` is large enough to dominate a listing, and `parameters` can
 * carry `securestring` values.
 */
const WITHHELD_WORKFLOW_KEYS = ['definition', 'parameters'] as const;

/** Bucket a connection lands in when ARM returned no status for it. */
const UNKNOWN_STATUS = 'unknown';

/**
 * Processed Logic App workflow summary.
 */
export interface LogicWorkflowSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  /** `Enabled` or `Disabled`. A disabled workflow runs nothing. */
  state?: string;
  provisioningState?: string;
  version?: string;
  createdTime?: string;
  changedTime?: string;
  accessEndpoint?: string;
  integrationAccountId?: string;
  /** Trigger names off the definition. Absent when the definition was unreadable. */
  triggerNames?: string[];
  /** Action count off the definition. Absent, not zero, when it was unreadable. */
  actionCount?: number;
  /** Parameter names off the definition's parameter block. Names only, never values. */
  parameterNames?: string[];
  /**
   * The `properties` block as ARM returned it, minus whatever
   * {@link LogicWorkflowSummary.propertiesWithheld} names.
   */
  properties?: Record<string, unknown>;
  /**
   * Keys removed from `properties` before returning it. Empty when nothing was.
   *
   * Withholding a heavy or sensitive key is fine; withholding it silently is the
   * defect, because an absent `definition` then reads as a workflow that has none.
   */
  propertiesWithheld: string[];
}

export interface ListWorkflowsResult {
  workflows: LogicWorkflowSummary[];
  summary: {
    total: number;
    /** Workflows in state `Enabled`. The number to quote as live integration. */
    enabled: number;
    byState: Record<string, number>;
    byLocation: Record<string, number>;
    note?: string;
  };
}

/**
 * Processed API connection summary.
 */
export interface ApiConnectionSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  displayName?: string;
  /** Connector this connection is for, e.g. `sql`, `office365`. */
  apiName?: string;
  /** First reported status, typically `Connected` or `Error`. Absent when none was. */
  status?: string;
  /** The error behind a non-Connected status, flattened to `code: message`. */
  statusError?: string;
  createdTime?: string;
  changedTime?: string;
  /**
   * The `properties` block as ARM returned it, with `parameterValues` values
   * replaced by `***REDACTED***` unless redaction is off. Keys are kept: a missing
   * key would hide that a credential is configured at all.
   */
  properties?: Record<string, unknown>;
}

export interface ListApiConnectionsResult {
  connections: ApiConnectionSummary[];
  summary: {
    total: number;
    byStatus: Record<string, number>;
    /** Connections whose status is neither `Connected` nor absent. */
    broken: number;
    /** Resource groups the sweep covered. Null when scoped to one group directly. */
    resourceGroupsSwept: number | null;
    /**
     * False when any resource group in the sweep refused. `total` is then a count
     * of what was reachable, not of what exists.
     */
    complete: boolean;
    note?: string;
  };
  fanOut: FanOutInfo;
}

/**
 * Service for Logic Apps: workflows and the API connections they authenticate
 * connectors through.
 *
 * Read-only. Both resource types were absent from this package, and they are one
 * service because they are one thing operationally - a workflow that looks healthy
 * while its connection sits in `Error` is a false all-clear, and neither half shows
 * it alone.
 */
export class LogicAppService {
  private redactSecrets: boolean;

  constructor(
    private client: ArmClient,
    options: { redactSecrets?: boolean } = {}
  ) {
    this.redactSecrets = options.redactSecrets ?? true;
  }

  /**
   * List Logic App workflows in the subscription or a resource group.
   *
   * `definition` and `parameters` are withheld by default and named in each row's
   * `propertiesWithheld`. The counts a review actually wants from the definition -
   * trigger names, action count, parameter names - are read before it is withheld,
   * so withholding costs payload rather than information.
   */
  async listWorkflows(
    options: {
      resourceGroup?: string;
      includeDefinition?: boolean;
    } = {}
  ): Promise<ListWorkflowsResult> {
    const { resourceGroup, includeDefinition = false } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.Logic/workflows')
      : this.client.subscriptionPath('/providers/Microsoft.Logic/workflows');

    const workflows = await this.client.paginate<LogicWorkflow>(
      path,
      getApiVersion('Microsoft.Logic/workflows')
    );

    const results: LogicWorkflowSummary[] = [];
    const summary = {
      total: workflows.length,
      enabled: 0,
      byState: {} as Record<string, number>,
      byLocation: {} as Record<string, number>,
      note: undefined as string | undefined,
    };

    for (const raw of workflows) {
      const processed = this.processWorkflow(raw, includeDefinition);
      results.push(processed);

      const state = processed.state || UNKNOWN_STATUS;
      summary.byState[state] = (summary.byState[state] || 0) + 1;
      if (state === 'Enabled') summary.enabled++;

      if (processed.location) {
        summary.byLocation[processed.location] = (summary.byLocation[processed.location] || 0) + 1;
      }
    }

    summary.note = buildWorkflowNote(summary, includeDefinition, Boolean(resourceGroup));

    return { workflows: results, summary };
  }

  /**
   * List API connections.
   *
   * `Connections_List` is resource-group scoped only - ARM ships no subscription-wide
   * list for `Microsoft.Web/connections` - so a subscription-wide answer means
   * listing the resource groups and asking each one. Every group is one `fanOut`
   * attempt, so a refused group is a named failure rather than a silently shorter
   * list, and `summary.complete` is false whenever any group refused.
   */
  async listApiConnections(
    options: { resourceGroup?: string } = {}
  ): Promise<ListApiConnectionsResult> {
    const { resourceGroup } = options;

    const fanOut = new FanOutRecorder();
    const raw: ApiConnection[] = [];
    let resourceGroupsSwept: number | null = null;

    if (resourceGroup) {
      // One group, asked directly. A refusal here should fail the command rather
      // than be recorded as a partial sweep, so it is not wrapped.
      raw.push(...(await this.fetchConnections(resourceGroup)));
    } else {
      const groups = await this.client.paginate<ResourceGroup>(
        this.client.subscriptionPath('/resourcegroups'),
        getApiVersion('Microsoft.Resources/resourceGroups')
      );
      resourceGroupsSwept = groups.length;

      for (const group of groups) {
        const found = await fanOut.run(group.name, 'connections', () =>
          this.fetchConnections(group.name)
        );
        if (found) raw.push(...found);
      }
    }

    const results: ApiConnectionSummary[] = [];
    const summary = {
      total: raw.length,
      byStatus: {} as Record<string, number>,
      broken: 0,
      resourceGroupsSwept,
      complete: fanOut.result().failed === 0,
      note: undefined as string | undefined,
    };

    for (const item of raw) {
      const processed = this.processConnection(item);
      results.push(processed);

      const status = processed.status || UNKNOWN_STATUS;
      summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
      if (processed.status && processed.status !== 'Connected') summary.broken++;
    }

    const fanOutResult = fanOut.result();
    summary.note = buildConnectionNote(summary, fanOutResult, this.redactSecrets);

    return { connections: results, summary, fanOut: fanOutResult };
  }

  private async fetchConnections(resourceGroup: string): Promise<ApiConnection[]> {
    return this.client.paginate<ApiConnection>(
      this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.Web/connections'),
      getApiVersion('Microsoft.Web/connections')
    );
  }

  /**
   * Map a workflow, reading the definition-derived counts before withholding the
   * definition itself.
   */
  private processWorkflow(
    raw: LogicWorkflow,
    includeDefinition: boolean
  ): LogicWorkflowSummary {
    const props = (raw.properties ?? {}) as Record<string, any>;
    const rgMatch = raw.id.match(/\/resourceGroups\/([^/]+)/i);

    const definition = props.definition as Record<string, any> | undefined;
    const parameters = props.parameters as Record<string, unknown> | undefined;

    let properties = raw.properties as Record<string, unknown> | undefined;
    const propertiesWithheld: string[] = [];

    if (!includeDefinition && properties) {
      const kept = { ...properties };
      for (const key of WITHHELD_WORKFLOW_KEYS) {
        if (key in kept) {
          delete kept[key];
          propertiesWithheld.push(key);
        }
      }
      properties = kept;
    }

    return {
      id: raw.id,
      name: raw.name,
      resourceGroup: rgMatch ? rgMatch[1] : '',
      location: raw.location,
      state: props.state,
      provisioningState: props.provisioningState,
      version: props.version,
      createdTime: props.createdTime,
      changedTime: props.changedTime,
      accessEndpoint: props.accessEndpoint,
      integrationAccountId: props.integrationAccount?.id,
      // Absent rather than zero when the definition was unreadable: "no actions"
      // and "we could not see the actions" are different facts.
      triggerNames: definition?.triggers ? Object.keys(definition.triggers) : undefined,
      actionCount: definition?.actions ? Object.keys(definition.actions).length : undefined,
      parameterNames: parameters ? Object.keys(parameters) : undefined,
      properties,
      propertiesWithheld,
    };
  }

  /**
   * Map a connection, redacting `parameterValues` unless redaction is off.
   *
   * The redaction is by field rather than by key name: ARM's own naming says
   * `parameterValues` is the map that can hold secrets and
   * `nonSecretParameterValues` is the one that cannot, which is a better signal
   * than guessing from a key like `server` or `username`.
   */
  private processConnection(raw: ApiConnection): ApiConnectionSummary {
    const props = (raw.properties ?? {}) as Record<string, any>;
    const rgMatch = raw.id.match(/\/resourceGroups\/([^/]+)/i);

    const first = props.statuses?.[0];
    const error = first?.error?.properties;

    let properties = raw.properties as Record<string, unknown> | undefined;
    if (this.redactSecrets && properties && props.parameterValues) {
      properties = {
        ...properties,
        parameterValues: Object.fromEntries(
          Object.keys(props.parameterValues).map((key) => [key, '***REDACTED***'])
        ),
      };
    }

    return {
      id: raw.id,
      name: raw.name,
      resourceGroup: rgMatch ? rgMatch[1] : '',
      location: raw.location,
      displayName: props.displayName,
      apiName: props.api?.name,
      status: first?.status,
      statusError: error
        ? [error.code, error.message].filter(Boolean).join(': ') || undefined
        : undefined,
      createdTime: props.createdTime,
      changedTime: props.changedTime,
      properties,
    };
  }
}

/**
 * The note that stops a workflow listing being misread.
 *
 * Two silences need words: a disabled workflow counted as live integration, and a
 * withheld definition read as a workflow that has none.
 */
function buildWorkflowNote(
  summary: { total: number; enabled: number; byState: Record<string, number> },
  includeDefinition: boolean,
  scopedToResourceGroup: boolean
): string | undefined {
  const parts: string[] = [];

  if (summary.total === 0) {
    parts.push(
      scopedToResourceGroup
        ? 'No Logic App workflows in this resource group. The subscription may hold workflows elsewhere.'
        : 'No Logic App workflows in this subscription.'
    );
  }

  const notEnabled = summary.total - summary.enabled;
  if (notEnabled > 0) {
    // Name the states rather than saying "not Enabled". `Disabled` is the common
    // one but not the only one, and a reader scanning for the word they expect
    // should find it.
    const states = Object.entries(summary.byState)
      .filter(([state]) => state !== 'Enabled')
      .map(([state, count]) => `${state}: ${count}`)
      .join(', ');
    parts.push(
      `${notEnabled} of ${summary.total} workflow(s) are not in state Enabled (${states}) and run nothing. Quote summary.enabled as live integration, not summary.total.`
    );
  }

  if (!includeDefinition && summary.total > 0) {
    parts.push(
      'definition and parameters were withheld from every row and are named in propertiesWithheld: the definition is large and parameters can carry securestring values. Their absence is not evidence a workflow has none. triggerNames, actionCount and parameterNames are derived before they are withheld. Pass includeDefinition (CLI: --include-definition) for the full block.'
    );
  }

  if (summary.total > 0) {
    parts.push(
      'A workflow being Enabled says nothing about the API connections it runs through: check list-api-connections for a connection in Error.'
    );
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * The note that stops a connection sweep being misread.
 *
 * The sweep is only as complete as the resource-group list it walked, and ARM gives
 * no subscription-wide alternative, so that dependency is stated on every result
 * rather than only when something fails.
 */
function buildConnectionNote(
  summary: {
    total: number;
    broken: number;
    resourceGroupsSwept: number | null;
    complete: boolean;
  },
  fanOut: FanOutInfo,
  redactSecrets: boolean
): string {
  const parts: string[] = [];

  if (summary.resourceGroupsSwept !== null) {
    parts.push(
      `Microsoft.Web/connections has no subscription-wide list operation, so this is a sweep of ${summary.resourceGroupsSwept} resource group(s). The count is only as complete as that list.`
    );
  }

  if (!summary.complete) {
    parts.push(
      `INCOMPLETE: ${fanOut.failed} resource group(s) refused the connections call and hold an unknown number of connections. ${summary.total} is what was reachable, not what exists. See fanOut.failures.`
    );
  }

  if (summary.total === 0 && summary.complete) {
    parts.push('No API connections were found in any resource group swept.');
  }

  if (summary.broken > 0) {
    parts.push(
      `${summary.broken} connection(s) report a status that is not Connected. A workflow using one will fail at run time while still reporting state Enabled: see statusError on each.`
    );
  }

  if (redactSecrets && summary.total > 0) {
    parts.push(
      'parameterValues is redacted to its keys, because ARM treats that map as the one that can hold secrets. Set AZURE_REDACT_SECRETS=false to see values. nonSecretParameterValues is never redacted.'
    );
  }

  return parts.join(' ');
}
