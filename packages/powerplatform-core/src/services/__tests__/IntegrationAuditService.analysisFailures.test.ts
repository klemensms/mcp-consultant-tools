/**
 * A flow whose definition reads fine but cannot be analysed.
 *
 * `analyseOneFlow` calls four utilities that each swallowed their own failure and
 * returned an empty answer, so a flow with a malformed definition was scored zero,
 * listed with no URLs and reported as carrying no hardcoded secrets - identical in
 * every visible field to a genuinely simple flow. The `fanOut` block does not cover it:
 * the definition fetch succeeded, so nothing was a read failure.
 *
 * The flow stays in `flows` rather than being dropped, because dropping it would make
 * `summary.total` under-report - the same failure `flowFanOut.test.ts` guards. What
 * changes is that the analysis now names the sections it could not build.
 *
 * Each test is a PAIR at the same flow count, because the count is what a reader quotes
 * and the broken and fixed versions agree on it.
 */

import { describe, it, expect } from 'vitest';
import { IntegrationAuditService } from '../IntegrationAuditService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';

const guid = (i: number) =>
  `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, '0')}`;

/** A well-formed definition, so the healthy half of each pair scores normally. */
const healthyDefinition = (i: number) =>
  JSON.stringify({
    properties: {
      definition: {
        triggers: { manual: { type: 'Request', kind: 'Http' } },
        actions: {
          [`Call_service_${i}`]: {
            type: 'Http',
            inputs: { uri: 'https://contoso.example/api/orders', method: 'GET' },
          },
        },
      },
    },
  });

/**
 * A null where an action object belongs. `clientdata` is author-controlled JSON, so
 * this is malformed input rather than a hypothetical.
 */
const malformedDefinition = () =>
  JSON.stringify({
    properties: {
      definition: {
        triggers: { manual: { type: 'Request', kind: 'Http' } },
        actions: { Broken_action: null },
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

/** Serves the flow list, giving any id in `malformed` a definition that cannot be parsed. */
function stubClient(opts: {
  flows: ReturnType<typeof flowRow>[];
  malformed?: Set<string>;
}) {
  return {
    getOrganizationUrl: () => BASE,
    async makeRequest<T>(endpoint: string): Promise<T> {
      if (endpoint.startsWith('api/data/v9.2/environmentvariabledefinitions')) {
        return { value: [] } as T;
      }

      const single = endpoint.match(/^api\/data\/v9\.2\/workflows\(([^)]+)\)/);
      if (single) {
        const id = single[1];
        const flow = opts.flows.find((f) => f.workflowid === id);
        const index = opts.flows.findIndex((f) => f.workflowid === id);
        return {
          ...flow,
          clientdata: opts.malformed?.has(id)
            ? malformedDefinition()
            : healthyDefinition(index),
        } as T;
      }

      if (endpoint.startsWith('api/data/v9.2/workflows')) {
        return { value: opts.flows } as T;
      }

      return { value: [] } as T;
    },
  } as unknown as PowerPlatformClient;
}

const analyse = (client: PowerPlatformClient) =>
  new IntegrationAuditService(client).analyzeFlowComplexity(undefined, 0, true);

describe('IntegrationAuditService.analyzeFlowComplexity partial analysis', () => {
  it('a flow that could not be analysed and one that is simple are not equal', async () => {
    const flows = Array.from({ length: 3 }, (_, i) => flowRow(i));

    const withMalformed = await analyse(
      stubClient({ flows, malformed: new Set([flows[1].workflowid]) })
    );
    const allHealthy = await analyse(stubClient({ flows }));

    // Both analysed three flows and read three definitions - the condition under
    // which the old result said nothing at all.
    expect(withMalformed.summary.total).toBe(3);
    expect(allHealthy.summary.total).toBe(3);
    expect(withMalformed.fanOut.failed).toBe(0);
    expect(allHealthy.fanOut.failed).toBe(0);

    const broken = withMalformed.flows.find((f) => f.name === 'Contoso Flow 1')!;
    const healthy = allHealthy.flows.find((f) => f.name === 'Contoso Flow 1')!;

    expect(broken.analysisFailures).toBeDefined();
    expect(broken.analysisFailures!.map((f) => f.section)).toContain('complexity');
    expect(healthy.analysisFailures).toBeUndefined();
  });

  it('counts the partially analysed flows in the summary a reader quotes', async () => {
    const flows = Array.from({ length: 3 }, (_, i) => flowRow(i));

    const withMalformed = await analyse(
      stubClient({ flows, malformed: new Set([flows[1].workflowid]) })
    );
    const allHealthy = await analyse(stubClient({ flows }));

    expect(withMalformed.summary.total).toBe(allHealthy.summary.total);
    expect(withMalformed.summary.flowsWithPartialAnalysis).toBe(1);
    expect(allHealthy.summary.flowsWithPartialAnalysis).toBe(0);
  });

  it('keeps the sections that did not fail', async () => {
    const flows = [flowRow(0)];

    const result = await analyse(
      stubClient({ flows, malformed: new Set([flows[0].workflowid]) })
    );
    const broken = result.flows[0];

    // The complexity walk throws on the null action; the URL and secret scans guard
    // every property access and complete honestly over the same definition.
    expect(broken.analysisFailures!.map((f) => f.section)).toEqual(['complexity']);
    expect(broken.analysisFailures![0].reason).toBeTruthy();
    // Both completed and found nothing, which is the honest answer for this
    // definition. `urls` is undefined only when its own traversal threw.
    expect(broken.urls).toEqual([]);
    expect(broken.secretWarnings).toBeUndefined();
  });
});
