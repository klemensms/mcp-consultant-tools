/**
 * The per-item failures `analyzeFlowComplexity` and `generateAuditReport` used to drop.
 *
 * `analyzeFlowComplexity` wrapped each `getFlowDefinition` call in a bare `catch {}`, so a
 * flow whose definition could not be read vanished from the analysis and `summary.total`
 * under-reported with nothing anywhere to show it had. It also discarded the `truncation`
 * block `getFlows` returns, so an analysis of the first 5000 flows read exactly like an
 * analysis of every flow. `generateAuditReport` swallowed the whole environment-variable
 * fetch with `.catch(() => undefined)`, so a report missing that section looked like a
 * report of an environment with no environment variables.
 *
 * Each test is a PAIR at the same visible count, because a count is the only thing a
 * reader sees and the broken and fixed versions agree on it.
 */

import { describe, it, expect } from 'vitest';
import { IntegrationAuditService } from '../IntegrationAuditService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';

const guid = (i: number) =>
  `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, '0')}`;

/** A minimal but real flow definition, so `calculateFlowComplexity` has something to score. */
const clientData = (i: number) =>
  JSON.stringify({
    properties: {
      definition: {
        triggers: {
          manual: { type: 'Request', kind: 'Http' },
        },
        actions: {
          [`Call_service_${i}`]: {
            type: 'Http',
            inputs: { uri: 'https://contoso.example/api/orders', method: 'GET' },
          },
        },
      },
    },
  });

const flowRow = (i: number) => ({
  workflowid: guid(i),
  name: `Contoso Flow ${i}`,
  description: null,
  statecode: 1,
  statuscode: 2,
  type: 1,
  ismanaged: false,
  iscrmuiworkflow: false,
  primaryentity: 'account',
  _ownerid_value: guid(5000),
  createdon: '2026-01-02T08:00:00Z',
  modifiedon: '2026-01-15T09:00:00Z',
  modifiedby: { fullname: 'Jane Doe' },
});

/**
 * Serves the flow list from `flows` and each flow definition from `clientdata`, paging the
 * list on `@odata.nextLink`. Any workflow id in `unreadable` throws on its definition
 * fetch; any id in `emptyDefinition` returns a row with no `clientdata`.
 */
function stubClient(opts: {
  flows: ReturnType<typeof flowRow>[];
  pageSize?: number;
  unreadable?: Set<string>;
  emptyDefinition?: Set<string>;
  failEnvVars?: boolean;
}) {
  const pageSize = opts.pageSize ?? 5000;
  let served = 0;

  return {
    getOrganizationUrl: () => BASE,
    async makeRequest<T>(endpoint: string): Promise<T> {
      if (endpoint.startsWith('api/data/v9.2/environmentvariabledefinitions')) {
        if (opts.failEnvVars) throw new Error('Principal lacks prvReadEnvironmentVariableDefinition');
        return { value: [] } as T;
      }

      // A single flow: `workflows(<guid>)`.
      const single = endpoint.match(/^api\/data\/v9\.2\/workflows\(([^)]+)\)/);
      if (single) {
        const id = single[1];
        if (opts.unreadable?.has(id)) {
          throw new Error(`Principal lacks prvReadWorkflow on ${id}`);
        }
        const flow = opts.flows.find((f) => f.workflowid === id);
        const index = opts.flows.findIndex((f) => f.workflowid === id);
        return {
          ...flow,
          clientdata: opts.emptyDefinition?.has(id) ? null : clientData(index),
        } as T;
      }

      if (endpoint.startsWith('api/data/v9.2/workflows')) {
        const value = opts.flows.slice(served, served + pageSize);
        served += value.length;
        const body: Record<string, unknown> = { value };
        if (served < opts.flows.length) {
          body['@odata.nextLink'] =
            `${BASE}/api/data/v9.2/workflows?$page=1&$skiptoken=${served}`;
        }
        return body as T;
      }

      return { value: [] } as T;
    },
  } as unknown as PowerPlatformClient;
}

const analyse = (client: PowerPlatformClient, maxFlows = 0) =>
  new IntegrationAuditService(client).analyzeFlowComplexity(undefined, maxFlows, true);

describe('IntegrationAuditService.analyzeFlowComplexity', () => {
  it('an analysis missing a flow and one that is complete are not equal at the same count', async () => {
    const four = Array.from({ length: 4 }, (_, i) => flowRow(i));

    const withDrop = await analyse(
      stubClient({ flows: four, unreadable: new Set([four[2].workflowid]) })
    );
    const complete = await analyse(
      stubClient({ flows: four.filter((_, i) => i !== 2) })
    );

    // Both analysed three flows - the condition under which the old result said nothing.
    expect(withDrop.summary.total).toBe(3);
    expect(complete.summary.total).toBe(3);

    expect(withDrop.fanOut).not.toEqual(complete.fanOut);
    expect(withDrop.fanOut.attempted).toBe(4);
    expect(withDrop.fanOut.succeeded).toBe(3);
    expect(withDrop.fanOut.failed).toBe(1);
    expect(withDrop.fanOut.failures[0].item).toBe('Contoso Flow 2');
    expect(withDrop.fanOut.failures[0].reason).toContain('prvReadWorkflow');

    expect(complete.fanOut.attempted).toBe(3);
    expect(complete.fanOut.failed).toBe(0);
  });

  it('records a flow with no stored definition rather than dropping it', async () => {
    const flows = Array.from({ length: 3 }, (_, i) => flowRow(i));

    const result = await analyse(
      stubClient({ flows, emptyDefinition: new Set([flows[1].workflowid]) })
    );

    expect(result.summary.total).toBe(2);
    expect(result.fanOut.attempted).toBe(3);
    expect(result.fanOut.failed).toBe(1);
    expect(result.fanOut.failures[0].reason).toContain('no stored definition');
  });

  it('carries the flow list truncation instead of discarding it', async () => {
    const cap = 5;

    const truncated = await analyse(
      stubClient({
        flows: Array.from({ length: 40 }, (_, i) => flowRow(i)),
        pageSize: cap,
      }),
      cap
    );
    const complete = await analyse(
      stubClient({ flows: Array.from({ length: cap }, (_, i) => flowRow(i)), pageSize: cap }),
      cap
    );

    expect(truncated.summary.total).toBe(cap);
    expect(complete.summary.total).toBe(cap);

    expect(truncated.truncation).not.toEqual(complete.truncation);
    expect(truncated.truncation.hasMore).toBe(true);
    expect(complete.truncation.hasMore).toBe(false);
  });

  it('says when URL resolution ran without environment variables', async () => {
    const flows = [flowRow(0)];

    const resolved = await analyse(stubClient({ flows }));
    const unresolved = await analyse(stubClient({ flows, failEnvVars: true }));

    expect(resolved.summary.total).toBe(unresolved.summary.total);
    expect(resolved.envVarResolutionFailure).toBeUndefined();
    expect(unresolved.envVarResolutionFailure).toContain(
      'prvReadEnvironmentVariableDefinition'
    );
  });
});

describe('IntegrationAuditService.generateAuditReport failure reporting', () => {
  const report = (client: PowerPlatformClient) =>
    new IntegrationAuditService(client).generateAuditReport(0, undefined, 'full', true, 100);

  it('names the environment-variable section it could not build', async () => {
    const flows = [flowRow(0)];

    const failed = await report(stubClient({ flows, failEnvVars: true }));
    const ok = await report(stubClient({ flows }));

    // Both report zero environment variables. Only one of them actually looked.
    expect(failed.summary.completeness.environmentVariables).toBeNull();
    expect(ok.summary.completeness.environmentVariables?.hasMore).toBe(false);

    expect(failed.summary.completeness.failures).not.toEqual(
      ok.summary.completeness.failures
    );
    expect(
      failed.summary.completeness.failures.map((f) => f.section)
    ).toContain('environmentVariables');
    expect(ok.summary.completeness.failures).toEqual([]);

    expect(failed.markdownReport).not.toEqual(ok.markdownReport);
    expect(failed.markdownReport).toContain('could not be read at all');
  });

  it('shows a dropped flow definition in the markdown a reader acts on', async () => {
    const four = Array.from({ length: 4 }, (_, i) => flowRow(i));

    const withDrop = await report(
      stubClient({ flows: four, unreadable: new Set([four[2].workflowid]) })
    );
    const complete = await report(stubClient({ flows: four.filter((_, i) => i !== 2) }));

    expect(withDrop.summary.flowCount).toBe(complete.summary.flowCount);
    expect(withDrop.markdownReport).not.toEqual(complete.markdownReport);
    expect(withDrop.markdownReport).toContain(
      '1 of 4 flow definitions could not be read'
    );
    expect(withDrop.markdownReport).toContain('INCOMPLETE');
    expect(complete.markdownReport).not.toContain('INCOMPLETE');
  });
});
