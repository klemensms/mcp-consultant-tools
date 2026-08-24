/**
 * The three remaining `$top` collections in `IntegrationAuditService`, and the
 * per-item failures the same file dropped.
 *
 * `getServiceEndpoints`, `getWebhookRegistrations` and `getEnvironmentVariables` fetched
 * with `&$top=${maxRecords}` and returned a summary whose `total` was the returned row
 * count. Dataverse returns no continuation token for a `$top`-capped query, so a capped
 * page was byte-for-byte indistinguishable from a population. All three also applied
 * their OOTB exclusion *after* fetching, so a full page filtered below the cap read as
 * exhausted.
 *
 * Every test here is a PAIR: a truncated result and a complete one, at the same returned
 * count, must not be equal. An assertion that only checks `hasMore === true` on the bad
 * case passes against the broken code too, because the broken code has no `hasMore` and
 * the property read is `undefined` either way.
 */

import { describe, it, expect } from 'vitest';
import { IntegrationAuditService } from '../IntegrationAuditService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';

const guid = (i: number) =>
  `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, '0')}`;

// --- Row builders -----------------------------------------------------------
// The OOTB variants are built to trip the real predicates in `utils/ootb-filters.ts`
// rather than a test-only flag: `IoT Message` is an exact OOTB endpoint name, `chat` an
// exact OOTB webhook entity, and a managed environment variable is OOTB by definition.

const endpointRow = (i: number, ootb = false) => ({
  serviceendpointid: guid(i),
  name: ootb ? 'IoT Message' : `Contoso.Endpoint.${i}`,
  url: 'https://contoso.example/api/hook',
  namespaceaddress: null,
  path: null,
  contract: 8, // Webhook
  authtype: 2, // HttpHeader
  connectionmode: 1,
  description: null,
  ismanaged: false,
  createdon: '2026-01-02T08:00:00Z',
  modifiedon: '2026-01-15T09:00:00Z',
  saskeyname: null,
  issaskeyset: false,
  solutionnamespace: null,
});

const webhookRow = (i: number, ootb = false) => ({
  sdkmessageprocessingstepid: guid(i),
  name: `Contoso Webhook ${i}`,
  stage: 40,
  mode: 1,
  statuscode: 1,
  filteringattributes: null,
  _eventhandler_value: guid(9000 + i),
  ismanaged: false,
  sdkmessageid: { name: ootb ? 'msdyn_Something' : 'Create' },
  sdkmessagefilterid: { primaryobjecttypecode: ootb ? 'chat' : 'account' },
  eventhandler_serviceendpoint: {
    name: `Contoso.Endpoint.${i}`,
    url: 'https://contoso.example/api/hook',
  },
});

const envVarRow = (i: number, ootb = false) => ({
  environmentvariabledefinitionid: guid(i),
  schemaname: ootb ? `msdyn_Setting${i}` : `contoso_Setting${i}`,
  displayname: `Setting ${i}`,
  type: 100000000, // String
  defaultvalue: 'https://contoso.example/service',
  description: null,
  ismanaged: false,
  environmentvariabledefinition_environmentvariablevalue: [],
});

/**
 * Serves one Dataverse collection by `@odata.nextLink`, the way the server would, so
 * truncation is driven from the source rather than from a row count. Every other
 * endpoint answers empty.
 *
 * `stepCountRows` backs the `sdkmessageprocessingsteps` step-count query that
 * `getServiceEndpoints` runs; `failStepCounts` makes that one query throw while the
 * endpoint fetch still succeeds, which is the state that used to report
 * `messageStepCount: 0` for every endpoint.
 */
function stubClient(opts: {
  match: string;
  rows: unknown[];
  pageSize: number;
  stepCountRows?: unknown[];
  failStepCounts?: boolean;
}) {
  const served = new Map<string, number>();

  const page = (key: string, rows: unknown[], path: string) => {
    const from = served.get(key) ?? 0;
    const value = rows.slice(from, from + opts.pageSize);
    served.set(key, from + value.length);
    const body: Record<string, unknown> = { value };
    if (from + value.length < rows.length) {
      // The continuation carries the routing key, because a bare `$skiptoken` on
      // `sdkmessageprocessingsteps` would be ambiguous between the webhook collection
      // and the step-count query that `getServiceEndpoints` runs against the same table.
      body['@odata.nextLink'] = `${BASE}/${path}&$skiptoken=${from + value.length}`;
    }
    return body;
  };

  // Only the step-count query selects `_eventhandler_value` on its own; the webhook
  // collection selects it alongside the step's own columns.
  const isStepCountQuery = (endpoint: string) =>
    endpoint.startsWith('api/data/v9.2/sdkmessageprocessingsteps') &&
    endpoint.includes('$select=_eventhandler_value');

  const client = {
    getOrganizationUrl: () => BASE,
    async makeRequest<T>(endpoint: string): Promise<T> {
      if (isStepCountQuery(endpoint)) {
        if (opts.failStepCounts) {
          throw new Error('Principal lacks prvReadSdkMessageProcessingStep');
        }
        return page(
          'steps',
          opts.stepCountRows ?? [],
          'api/data/v9.2/sdkmessageprocessingsteps?$select=_eventhandler_value'
        ) as T;
      }

      if (endpoint.startsWith(`api/data/v9.2/${opts.match}`)) {
        return page('main', opts.rows, `api/data/v9.2/${opts.match}?$page=1`) as T;
      }

      return { value: [] } as T;
    },
  };

  return client as unknown as PowerPlatformClient;
}

const service = (client: PowerPlatformClient) => new IntegrationAuditService(client);

// ---------------------------------------------------------------------------
describe('IntegrationAuditService.getServiceEndpoints', () => {
  it('a truncated page and a complete collection at the same count are not equal', async () => {
    const cap = 60;

    const truncated = await service(
      stubClient({
        match: 'serviceendpoints',
        rows: Array.from({ length: 200 }, (_, i) => endpointRow(i)),
        pageSize: cap,
      })
    ).getServiceEndpoints(cap);

    const complete = await service(
      stubClient({
        match: 'serviceendpoints',
        rows: Array.from({ length: cap }, (_, i) => endpointRow(i)),
        pageSize: cap,
      })
    ).getServiceEndpoints(cap);

    // Same returned count in both - the condition under which the old result said nothing.
    expect(truncated.endpoints).toHaveLength(cap);
    expect(complete.endpoints).toHaveLength(cap);
    expect(truncated.summary.total).toBe(complete.summary.total);

    expect(truncated.truncation).not.toEqual(complete.truncation);
    expect(truncated.truncation.hasMore).toBe(true);
    expect(truncated.truncation.totalAvailable).toBeNull();
    expect(complete.truncation.hasMore).toBe(false);
    expect(complete.truncation.totalAvailable).toBe(cap);
  });

  it('a cap means that many endpoints returned, not that many fetched then filtered', async () => {
    const cap = 60;
    // Every third row is OOTB, so a single `$top=60` fetch yields 40 after filtering.
    const rows = Array.from({ length: 300 }, (_, i) => endpointRow(i, i % 3 === 0));

    const result = await service(
      stubClient({ match: 'serviceendpoints', rows, pageSize: cap })
    ).getServiceEndpoints(cap);

    expect(result.endpoints).toHaveLength(cap);
    expect(result.truncation.hasMore).toBe(true);
    expect(result.summary.ootbExcluded).toBeGreaterThan(0);
  });

  it('a full page filtered below the cap does not read as exhausted', async () => {
    const cap = 60;
    // 100 rows in the source, 50 of them OOTB: fewer than the cap survive filtering,
    // but rows matching the same filters remain beyond what was returned.
    const rows = [
      ...Array.from({ length: 60 }, (_, i) => endpointRow(i, i % 2 === 0)),
      ...Array.from({ length: 60 }, (_, i) => endpointRow(100 + i)),
    ];

    const result = await service(
      stubClient({ match: 'serviceendpoints', rows, pageSize: 60 })
    ).getServiceEndpoints(cap);

    expect(result.endpoints).toHaveLength(cap);
    expect(result.truncation.hasMore).toBe(true);
  });

  it('reports 0 steps and "could not count steps" as different answers', async () => {
    const endpoint = endpointRow(1);

    const counted = await service(
      stubClient({
        match: 'serviceendpoints',
        rows: [endpoint],
        pageSize: 100,
        stepCountRows: [],
      })
    ).getServiceEndpoints(100);

    const uncounted = await service(
      stubClient({
        match: 'serviceendpoints',
        rows: [endpoint],
        pageSize: 100,
        failStepCounts: true,
      })
    ).getServiceEndpoints(100);

    expect(counted.endpoints[0].messageStepCount).toBe(0);
    expect(uncounted.endpoints[0].messageStepCount).toBeNull();
    expect(counted.endpoints).not.toEqual(uncounted.endpoints);
    expect(uncounted.summary.stepCountFailure).toContain('prvReadSdkMessageProcessingStep');
    expect(counted.summary.stepCountFailure).toBeUndefined();
  });

  it('counts the steps it did read', async () => {
    const endpoint = endpointRow(1);
    const stepRows = [
      { _eventhandler_value: endpoint.serviceendpointid },
      { _eventhandler_value: endpoint.serviceendpointid },
      { _eventhandler_value: guid(777) },
    ];

    const result = await service(
      stubClient({
        match: 'serviceendpoints',
        rows: [endpoint],
        pageSize: 100,
        stepCountRows: stepRows,
      })
    ).getServiceEndpoints(100);

    expect(result.endpoints[0].messageStepCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe('IntegrationAuditService.getWebhookRegistrations', () => {
  it('a truncated page and a complete collection at the same count are not equal', async () => {
    const cap = 40;

    const truncated = await service(
      stubClient({
        match: 'sdkmessageprocessingsteps',
        rows: Array.from({ length: 150 }, (_, i) => webhookRow(i)),
        pageSize: cap,
      })
    ).getWebhookRegistrations(cap);

    const complete = await service(
      stubClient({
        match: 'sdkmessageprocessingsteps',
        rows: Array.from({ length: cap }, (_, i) => webhookRow(i)),
        pageSize: cap,
      })
    ).getWebhookRegistrations(cap);

    expect(truncated.webhooks).toHaveLength(cap);
    expect(complete.webhooks).toHaveLength(cap);

    expect(truncated.truncation).not.toEqual(complete.truncation);
    expect(truncated.truncation.hasMore).toBe(true);
    expect(truncated.truncation.totalAvailable).toBeNull();
    expect(complete.truncation.hasMore).toBe(false);
    expect(complete.truncation.totalAvailable).toBe(cap);
  });

  it('a cap means that many webhooks returned, not that many fetched then filtered', async () => {
    const cap = 40;
    const rows = Array.from({ length: 300 }, (_, i) => webhookRow(i, i % 3 === 0));

    const result = await service(
      stubClient({ match: 'sdkmessageprocessingsteps', rows, pageSize: cap })
    ).getWebhookRegistrations(cap);

    expect(result.webhooks).toHaveLength(cap);
    expect(result.truncation.hasMore).toBe(true);
    expect(result.summary.ootbExcluded).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
describe('IntegrationAuditService.getEnvironmentVariables', () => {
  it('a truncated page and a complete collection at the same count are not equal', async () => {
    const cap = 50;

    const truncated = await service(
      stubClient({
        match: 'environmentvariabledefinitions',
        rows: Array.from({ length: 200 }, (_, i) => envVarRow(i)),
        pageSize: cap,
      })
    ).getEnvironmentVariables(cap);

    const complete = await service(
      stubClient({
        match: 'environmentvariabledefinitions',
        rows: Array.from({ length: cap }, (_, i) => envVarRow(i)),
        pageSize: cap,
      })
    ).getEnvironmentVariables(cap);

    expect(truncated.allVariables).toHaveLength(cap);
    expect(complete.allVariables).toHaveLength(cap);

    expect(truncated.truncation).not.toEqual(complete.truncation);
    expect(truncated.truncation.hasMore).toBe(true);
    expect(truncated.truncation.totalAvailable).toBeNull();
    expect(complete.truncation.hasMore).toBe(false);
    expect(complete.truncation.totalAvailable).toBe(cap);
  });

  it('a cap means that many variables returned, not that many fetched then filtered', async () => {
    const cap = 50;
    const rows = Array.from({ length: 300 }, (_, i) => envVarRow(i, i % 3 === 0));

    const result = await service(
      stubClient({ match: 'environmentvariabledefinitions', rows, pageSize: cap })
    ).getEnvironmentVariables(cap);

    expect(result.allVariables).toHaveLength(cap);
    expect(result.truncation.hasMore).toBe(true);
    expect(result.summary.ootbExcluded).toBeGreaterThan(0);
  });
});
