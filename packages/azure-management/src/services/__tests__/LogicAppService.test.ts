/**
 * D13 (parts 3 and 4 of 4): `azure-management` had no command for
 * `Microsoft.Logic/workflows` or `Microsoft.Web/connections`. They are one task
 * because they are one thing operationally: a Logic App workflow reaches a connector
 * through an API connection, and a workflow that looks healthy while its connection
 * sits in `Error` is the exact false all-clear this chain keeps finding.
 *
 * Settled against the ARM swaggers before writing either mapper:
 *
 *  - `Microsoft.Logic/workflows` at api-version 2019-05-01. `Workflows_ListBySubscription`
 *    and `Workflows_ListByResourceGroup` both exist, and both return `definition` and
 *    `parameters` in the list response. Neither takes a `detailed`-style parameter.
 *  - `Microsoft.Web/connections` at api-version 2016-06-01, the only stable version
 *    that has ever shipped for it. `Connections_List` is **resource-group scoped
 *    only** - there is no subscription-wide list operation - so a subscription-wide
 *    answer means listing the resource groups and fanning out across them. That makes
 *    the count only as complete as the resource-group sweep, which is why it goes
 *    through `FanOutRecorder` rather than a per-group try/catch.
 *
 * The workflow payload withholds `definition` and `parameters` by default: the
 * definition is large, and `parameters` can carry `securestring` values. Withholding
 * is fine, silently withholding is not, so each row names what was withheld and the
 * counts derived from the definition survive even when the definition does not.
 */

import { describe, it, expect } from 'vitest';
import type { ArmClient } from '../../client/ArmClient.js';
import { LogicAppService } from '../LogicAppService.js';

const SUB = '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const DEFINITION = {
  $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
  triggers: { When_a_record_is_created: { type: 'ApiConnection' } },
  actions: {
    Get_record: { type: 'ApiConnection' },
    Condition: { type: 'If' },
    Send_email: { type: 'ApiConnection' },
  },
};

/**
 * Extras are spread INSIDE `properties`, never alongside it. A fixture that passes
 * `{ properties: {...} }` as an override replaces the block rather than merging into
 * it, which has produced a false green in this repo before.
 */
const workflow = (name: string, properties: Record<string, unknown> = {}) => ({
  id: `${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Logic/workflows/${name}`,
  name,
  type: 'Microsoft.Logic/workflows',
  location: 'uksouth',
  properties: {
    provisioningState: 'Succeeded',
    state: 'Enabled',
    version: '08585000000000000000',
    createdTime: '2026-01-04T09:12:00Z',
    changedTime: '2026-02-11T14:03:00Z',
    accessEndpoint: 'https://uksouth.logic.azure.com/workflows/aaaaaaaa',
    definition: DEFINITION,
    parameters: {
      $connections: { type: 'Object', value: { sql: { connectionId: 'x' } } },
      apiKey: { type: 'SecureString', value: 'not-a-real-secret' },
    },
    ...properties,
  },
});

const connection = (
  name: string,
  resourceGroup: string,
  properties: Record<string, unknown> = {}
) => ({
  id: `${SUB}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/connections/${name}`,
  name,
  type: 'Microsoft.Web/connections',
  location: 'uksouth',
  properties: {
    displayName: name,
    statuses: [{ status: 'Connected' }],
    createdTime: '2026-01-04T09:12:00Z',
    changedTime: '2026-02-11T14:03:00Z',
    api: { name: 'sql', displayName: 'SQL Server', id: `${SUB}/providers/Microsoft.Web/locations/uksouth/managedApis/sql` },
    nonSecretParameterValues: { server: 'sql-contoso.database.windows.net' },
    parameterValues: { password: 'not-a-real-secret', username: 'svc-contoso' },
    ...properties,
  },
});

/**
 * `paginate` answers by matching on the path, so one stub serves the resource-group
 * sweep and the per-group connection lists at once. A resource group mapped to an
 * Error makes that one group's call fail while the rest succeed.
 */
function stubClient(answers: {
  workflows?: unknown[];
  resourceGroups?: string[];
  connectionsByGroup?: Record<string, unknown[] | Error>;
}) {
  const calls: Array<{ path: string; params?: Record<string, string> }> = [];
  const client = {
    paginate: async (path: string, _apiVersion?: string, params?: Record<string, string>) => {
      calls.push({ path, params });

      if (path.includes('/providers/Microsoft.Logic/workflows')) {
        return answers.workflows ?? [];
      }
      if (path.endsWith('/resourcegroups')) {
        return (answers.resourceGroups ?? []).map((name) => ({
          id: `${SUB}/resourceGroups/${name}`,
          name,
          location: 'uksouth',
        }));
      }
      if (path.includes('/providers/Microsoft.Web/connections')) {
        const group = path.match(/\/resourceGroups\/([^/]+)/i)?.[1] ?? '';
        const answer = answers.connectionsByGroup?.[group];
        if (answer instanceof Error) throw answer;
        return answer ?? [];
      }
      throw new Error(`unexpected path: ${path}`);
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

describe('LogicAppService.listWorkflows', () => {
  it('lists the workflows the subscription holds', async () => {
    const { client, calls } = stubClient({
      workflows: [workflow('la-contoso-sync'), workflow('la-contoso-notify')],
    });

    const result = await new LogicAppService(client).listWorkflows();

    expect(result.workflows.map((w) => w.name)).toEqual(['la-contoso-sync', 'la-contoso-notify']);
    expect(result.summary.total).toBe(2);
    expect(calls[0].path).toBe(`${SUB}/providers/Microsoft.Logic/workflows`);
  });

  it('a disabled workflow is counted apart from an enabled one', async () => {
    const { client } = stubClient({
      workflows: [workflow('la-contoso-sync'), workflow('la-contoso-notify', { state: 'Disabled' })],
    });

    const result = await new LogicAppService(client).listWorkflows();

    expect(result.summary.byState).toEqual({ Enabled: 1, Disabled: 1 });
    // The number to quote as live integration, not the total.
    expect(result.summary.enabled).toBe(1);
    expect(result.summary.note).toMatch(/disabled/i);
  });

  it('withholds the definition and parameters by default, and says which', async () => {
    const { client } = stubClient({ workflows: [workflow('la-contoso-sync')] });

    const result = await new LogicAppService(client).listWorkflows();

    const row = result.workflows[0];
    expect(row.properties?.definition).toBeUndefined();
    expect(row.properties?.parameters).toBeUndefined();
    // Withheld is fine; silently withheld is the defect. Absence must be labelled,
    // or a reader concludes the workflow has no definition.
    expect(row.propertiesWithheld).toEqual(['definition', 'parameters']);
    expect(result.summary.note).toMatch(/definition/i);
    // And the rest of the block survives untouched.
    expect(row.properties?.accessEndpoint).toBe('https://uksouth.logic.azure.com/workflows/aaaaaaaa');
  });

  it('the counts drawn from the definition survive the definition being withheld', async () => {
    const { client } = stubClient({ workflows: [workflow('la-contoso-sync')] });

    const result = await new LogicAppService(client).listWorkflows();

    expect(result.workflows[0].triggerNames).toEqual(['When_a_record_is_created']);
    expect(result.workflows[0].actionCount).toBe(3);
    expect(result.workflows[0].parameterNames).toEqual(['$connections', 'apiKey']);
  });

  it('returns the definition and parameters when asked', async () => {
    const { client } = stubClient({ workflows: [workflow('la-contoso-sync')] });

    const result = await new LogicAppService(client).listWorkflows({ includeDefinition: true });

    expect(result.workflows[0].properties?.definition).toEqual(DEFINITION);
    expect(result.workflows[0].properties?.parameters).toBeDefined();
    expect(result.workflows[0].propertiesWithheld).toEqual([]);
  });

  it('passes the raw properties block through, including keys it does not name', async () => {
    const { client } = stubClient({
      workflows: [workflow('la-contoso-sync', { someFieldThisRepoHasNeverHeardOf: { nested: true } })],
    });

    const result = await new LogicAppService(client).listWorkflows();

    expect(result.workflows[0].properties).toMatchObject({
      someFieldThisRepoHasNeverHeardOf: { nested: true },
    });
  });

  it('a workflow with no definition reports no counts rather than zero', async () => {
    const { client } = stubClient({
      workflows: [workflow('la-contoso-sync', { definition: undefined })],
    });

    const result = await new LogicAppService(client).listWorkflows();

    // Zero actions and an unreadable definition are different facts.
    expect(result.workflows[0].actionCount).toBeUndefined();
    expect(result.workflows[0].triggerNames).toBeUndefined();
  });

  it('an empty result says it looked', async () => {
    const { client } = stubClient({ workflows: [] });

    const result = await new LogicAppService(client).listWorkflows();

    expect(result.summary.total).toBe(0);
    expect(result.summary.note).toMatch(/no logic app workflows/i);
  });

  it('scopes to a resource group when one is given', async () => {
    const { client, calls } = stubClient({ workflows: [workflow('la-contoso-sync')] });

    await new LogicAppService(client).listWorkflows({ resourceGroup: 'rg-contoso' });

    expect(calls[0].path).toBe(`${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Logic/workflows`);
  });
});

describe('LogicAppService.listApiConnections', () => {
  it('sweeps every resource group, because ARM has no subscription-wide list', async () => {
    const { client, calls } = stubClient({
      resourceGroups: ['rg-contoso', 'rg-contoso-data'],
      connectionsByGroup: {
        'rg-contoso': [connection('sql', 'rg-contoso')],
        'rg-contoso-data': [connection('office365', 'rg-contoso-data')],
      },
    });

    const result = await new LogicAppService(client).listApiConnections();

    expect(calls[0].path).toBe(`${SUB}/resourcegroups`);
    expect(result.connections.map((c) => c.name)).toEqual(['sql', 'office365']);
    expect(result.summary.total).toBe(2);
    expect(result.summary.resourceGroupsSwept).toBe(2);
    expect(result.fanOut.attempted).toBe(2);
    expect(result.fanOut.failed).toBe(0);
  });

  it('a refused resource group is reported, not dropped from the sweep', async () => {
    const { client } = stubClient({
      resourceGroups: ['rg-contoso', 'rg-contoso-data', 'rg-contoso-locked'],
      connectionsByGroup: {
        'rg-contoso': [connection('sql', 'rg-contoso')],
        'rg-contoso-data': [connection('office365', 'rg-contoso-data')],
        'rg-contoso-locked': forbidden('AuthorizationFailed: does not have authorization'),
      },
    });

    const result = await new LogicAppService(client).listApiConnections();

    expect(result.summary.total).toBe(2);
    expect(result.fanOut.attempted).toBe(3);
    expect(result.fanOut.failed).toBe(1);
    expect(result.fanOut.failures[0]).toMatchObject({
      item: 'rg-contoso-locked',
      operation: 'connections',
      statusCode: 403,
    });
    // The count is 2 of an unknown total, and the payload has to say so or the
    // sweep reads as the estate.
    expect(result.summary.complete).toBe(false);
    expect(result.summary.note).toMatch(/1 resource group/i);
  });

  it('a connection in Error is not indistinguishable from a connected one', async () => {
    const { client } = stubClient({
      resourceGroups: ['rg-contoso'],
      connectionsByGroup: {
        'rg-contoso': [
          connection('sql', 'rg-contoso'),
          connection('office365', 'rg-contoso', {
            statuses: [
              {
                status: 'Error',
                target: 'office365',
                error: { properties: { code: 'Unauthenticated', message: 'The credential is expired' } },
              },
            ],
          }),
        ],
      },
    });

    const result = await new LogicAppService(client).listApiConnections();

    expect(result.summary.byStatus).toEqual({ Connected: 1, Error: 1 });
    expect(result.connections[1].status).toBe('Error');
    expect(result.connections[1].statusError).toBe('Unauthenticated: The credential is expired');
    // A broken connection is the finding, so the summary must carry it.
    expect(result.summary.broken).toBe(1);
    expect(result.summary.note).toMatch(/not Connected|Error/);
  });

  it('a connection with no status reports unknown rather than connected', async () => {
    const { client } = stubClient({
      resourceGroups: ['rg-contoso'],
      connectionsByGroup: {
        'rg-contoso': [connection('sql', 'rg-contoso', { statuses: undefined })],
      },
    });

    const result = await new LogicAppService(client).listApiConnections();

    expect(result.connections[0].status).toBeUndefined();
    expect(result.summary.byStatus).toEqual({ unknown: 1 });
    expect(result.summary.broken).toBe(0);
  });

  it('redacts parameterValues by default, keeping the keys', async () => {
    const { client } = stubClient({
      resourceGroups: ['rg-contoso'],
      connectionsByGroup: { 'rg-contoso': [connection('sql', 'rg-contoso')] },
    });

    const result = await new LogicAppService(client).listApiConnections();

    const props = result.connections[0].properties as Record<string, any>;
    // ARM's own naming says this map is the one that can hold secrets, so the
    // values go and the keys stay - a missing key would hide that a credential
    // is configured at all.
    expect(props.parameterValues).toEqual({
      password: '***REDACTED***',
      username: '***REDACTED***',
    });
    expect(props.nonSecretParameterValues).toEqual({
      server: 'sql-contoso.database.windows.net',
    });
    expect(result.summary.note).toMatch(/redact/i);
  });

  it('exposes parameterValues when redaction is off', async () => {
    const { client } = stubClient({
      resourceGroups: ['rg-contoso'],
      connectionsByGroup: { 'rg-contoso': [connection('sql', 'rg-contoso')] },
    });

    const result = await new LogicAppService(client, { redactSecrets: false }).listApiConnections();

    const props = result.connections[0].properties as Record<string, any>;
    expect(props.parameterValues.username).toBe('svc-contoso');
  });

  it('scopes to one resource group without sweeping, when one is given', async () => {
    const { client, calls } = stubClient({
      connectionsByGroup: { 'rg-contoso': [connection('sql', 'rg-contoso')] },
    });

    const result = await new LogicAppService(client).listApiConnections({
      resourceGroup: 'rg-contoso',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(`${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Web/connections`);
    expect(result.summary.complete).toBe(true);
  });

  it('an empty sweep says the count depends on the resource-group list', async () => {
    const { client } = stubClient({
      resourceGroups: ['rg-contoso', 'rg-contoso-data'],
      connectionsByGroup: {},
    });

    const result = await new LogicAppService(client).listApiConnections();

    expect(result.summary.total).toBe(0);
    expect(result.summary.resourceGroupsSwept).toBe(2);
    expect(result.summary.note).toMatch(/resource group/i);
  });

  it('passes the raw properties block through, including keys it does not name', async () => {
    const { client } = stubClient({
      resourceGroups: ['rg-contoso'],
      connectionsByGroup: {
        'rg-contoso': [
          connection('sql', 'rg-contoso', { someFieldThisRepoHasNeverHeardOf: { nested: true } }),
        ],
      },
    });

    const result = await new LogicAppService(client).listApiConnections();

    expect(result.connections[0].properties).toMatchObject({
      someFieldThisRepoHasNeverHeardOf: { nested: true },
    });
  });
});
