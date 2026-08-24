/**
 * Two false-completeness defects in `gen-integration-audit`.
 *
 * 1. `generateAuditReport` capped the plugin-assembly inventory at 100 and read neither
 *    `hasMore` nor `truncationReason` from the result, so an environment holding more than
 *    100 assemblies produced a report that named 100 and said nothing about the rest. The
 *    truncated report was indistinguishable from a complete one.
 *
 * 2. The `externalPlugins` block read `description` off rows the list query never selected,
 *    so every assembly reported `description: null` - which reads as "this assembly has no
 *    description" rather than "the query did not ask for it".
 *
 * The report caps four other collections too, and each of those now pages and reports its
 * own truncation, so the completeness block states every one either way. That is asserted
 * here too: a partial guarantee read as a total one is worse than none, so `unverified`
 * being empty has to be a claim the payload makes rather than a field that vanished.
 */

import { describe, it, expect } from 'vitest';
import { IntegrationAuditService } from '../IntegrationAuditService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';

const assemblyRow = (i: number) => ({
  pluginassemblyid: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, '0')}`,
  name: `Contoso.Plugins.${i}`,
  version: '1.0.0.0',
  description: `Assembly ${i} does something`,
  culture: 'neutral',
  publickeytoken: '0123456789abcdef',
  isolationmode: 2, // Sandbox, so it lands in externalPlugins
  sourcetype: 0,
  major: 1,
  minor: 0,
  createdon: '2026-01-02T08:00:00Z',
  modifiedon: '2026-01-15T09:00:00Z',
  ismanaged: false,
  ishidden: { Value: false },
  modifiedby: { fullname: 'Jane Doe' },
});

/**
 * Routes `makeRequest` by endpoint. Every collection but `pluginassemblies` comes back
 * empty, which keeps the flow-definition fan-out out of the way; the assemblies page on
 * `@odata.nextLink` so truncation can be driven from the source the way Dataverse would.
 */
function stubClient(assemblies: unknown[], pageSize: number) {
  let served = 0;
  const calls: string[] = [];
  const client = {
    getOrganizationUrl: () => BASE,
    async makeRequest<T>(endpoint: string): Promise<T> {
      calls.push(endpoint);
      if (endpoint.startsWith('api/data/v9.2/pluginassemblies')) {
        const value = assemblies.slice(served, served + pageSize);
        served += value.length;
        const body: Record<string, unknown> = { value };
        if (served < assemblies.length) {
          body['@odata.nextLink'] =
            `${BASE}/api/data/v9.2/pluginassemblies?$skiptoken=${served}`;
        }
        return body as T;
      }
      return { value: [] } as T;
    },
  };
  return { client: client as unknown as PowerPlatformClient, calls };
}

const report = (assemblies: unknown[], pageSize: number, cap: number) =>
  new IntegrationAuditService(stubClient(assemblies, pageSize).client).generateAuditReport(
    0,
    undefined,
    'full',
    true,
    cap
  );

describe('IntegrationAuditService.generateAuditReport completeness', () => {
  it('a truncated report and a complete one at the same assembly count are not equal', async () => {
    const cap = 100;

    const truncated = await report(
      Array.from({ length: cap + 50 }, (_, i) => assemblyRow(i)),
      cap,
      cap
    );
    const complete = await report(
      Array.from({ length: cap }, (_, i) => assemblyRow(i)),
      cap,
      cap
    );

    // Same assembly count in both - the condition under which the old report said nothing.
    expect(truncated.summary.pluginCount).toBe(cap);
    expect(complete.summary.pluginCount).toBe(cap);

    expect(truncated.summary.completeness).not.toEqual(complete.summary.completeness);
    expect(truncated.plugins.truncation).not.toEqual(complete.plugins.truncation);

    expect(truncated.summary.completeness.pluginAssemblies.hasMore).toBe(true);
    expect(truncated.summary.completeness.pluginAssemblies.totalAvailable).toBeNull();
    expect(complete.summary.completeness.pluginAssemblies.hasMore).toBe(false);
    expect(complete.summary.completeness.pluginAssemblies.totalAvailable).toBe(cap);
  });

  it('the markdown a reader actually acts on says which of the two it is', async () => {
    const cap = 100;

    const truncated = await report(
      Array.from({ length: cap + 50 }, (_, i) => assemblyRow(i)),
      cap,
      cap
    );
    const complete = await report(
      Array.from({ length: cap }, (_, i) => assemblyRow(i)),
      cap,
      cap
    );

    expect(truncated.markdownReport).not.toEqual(complete.markdownReport);
    expect(truncated.markdownReport).toContain('TRUNCATED');
    expect(complete.markdownReport).toContain(
      'plugin-assembly inventory is complete at 100'
    );
    expect(complete.markdownReport).not.toContain('TRUNCATED');
  });

  it('vouches for every collection it caps, and says so per collection', async () => {
    const result = await report([assemblyRow(1)], 100, 100);
    const c = result.summary.completeness;

    // A completeness block that covered only assemblies while looking like it covered the
    // whole report is the failure this guards. Endpoints, webhooks, env vars and flows all
    // page now, so each carries its own block and nothing is left unverified.
    expect(c.unverified).toEqual([]);
    expect(c.serviceEndpoints.hasMore).toBe(false);
    expect(c.webhooks.hasMore).toBe(false);
    expect(c.environmentVariables?.hasMore).toBe(false);
    expect(c.flows.hasMore).toBe(false);
    expect(c.failures).toEqual([]);
    expect(c.requestedMax).toBe(100);

    // The markdown a reader acts on states each one rather than staying silent.
    expect(result.markdownReport).toContain('service-endpoint list is complete at');
    expect(result.markdownReport).toContain('webhook-registration list is complete at');
    expect(result.markdownReport).toContain('environment-variable list is complete at');
    expect(result.markdownReport).toContain('flow list is complete at');
    expect(result.markdownReport).not.toContain('Completeness is **not verified** for');
  });

  it('reports an uncapped run as uncapped rather than as a cap of zero', async () => {
    const result = await report(
      Array.from({ length: 240 }, (_, i) => assemblyRow(i)),
      100,
      0
    );

    expect(result.summary.pluginCount).toBe(240);
    expect(result.summary.completeness.requestedMax).toBe(0);
    expect(result.summary.completeness.pluginAssemblies.requestedMax).toBeNull();
    expect(result.summary.completeness.pluginAssemblies.hasMore).toBe(false);
    expect(result.markdownReport).toContain('requested uncapped');
  });

  it('carries each assembly real description into externalPlugins, not a structural null', async () => {
    const result = await report([assemblyRow(7)], 100, 100);

    expect(result.outbound.externalPlugins).toHaveLength(1);
    expect(result.outbound.externalPlugins[0].description).toBe(
      'Assembly 7 does something'
    );
    expect(result.outbound.externalPlugins[0].assemblyName).toBe('Contoso.Plugins.7');
  });

  it('still reports null for an assembly that genuinely has no description', async () => {
    const result = await report(
      [{ ...assemblyRow(8), description: null }],
      100,
      100
    );

    expect(result.outbound.externalPlugins[0].description).toBeNull();
  });
});
