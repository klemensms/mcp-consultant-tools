/**
 * D6: `plugin list --include-managed` returned 314 of 409 assemblies and declared no
 * exclusion, unlike `integration endpoints` and `integration env-vars` in the same
 * package. Most of the 95 dropped were Microsoft-prefixed, but at least one was not,
 * so a consumer could not infer the rule from the output.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginService } from '../PluginService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';
const makeRequest = vi.fn();
const service = new PluginService({
  makeRequest,
  getOrganizationUrl: () => BASE,
} as unknown as PowerPlatformClient);

const rawAssembly = (id: number, hidden = false, name = `Contoso.Plugins.${id}`) => ({
  pluginassemblyid: `asm-${id}`,
  name,
  version: '1.0.0.0',
  isolationmode: 2,
  ismanaged: false,
  modifiedon: '2026-01-15T09:00:00Z',
  modifiedby: { fullname: 'Jane Doe' },
  major: 1,
  minor: 0,
  ishidden: { Value: hidden },
});

const serve = (rows: ReturnType<typeof rawAssembly>[], pageSize: number) => {
  let served = 0;
  makeRequest.mockImplementation(async () => {
    const value = rows.slice(served, served + pageSize);
    served += value.length;
    const body: Record<string, unknown> = { value };
    if (served < rows.length) {
      body['@odata.nextLink'] = `${BASE}/api/data/v9.2/pluginassemblies?$skiptoken=${served}`;
    }
    return body;
  });
};

describe('PluginService.getPluginAssemblies', () => {
  beforeEach(() => {
    makeRequest.mockReset();
  });

  it('declares the hidden-assembly exclusion rather than dropping rows silently', async () => {
    serve(
      [
        rawAssembly(1),
        rawAssembly(2, true, 'Microsoft.Crm.Something'),
        rawAssembly(3, true, 'PluginProfiler'),
        rawAssembly(4),
      ],
      10
    );

    const result = await service.getPluginAssemblies(true);

    expect(result.totalCount).toBe(2);
    expect(result.ootbExcluded).toBe(2);
    expect(result.truncation.hasMore).toBe(false);
    expect(result.truncation.totalAvailable).toBe(2);
  });

  it('a capped list is distinguishable from a complete one', async () => {
    serve(
      Array.from({ length: 409 }, (_, i) => rawAssembly(i)),
      100
    );

    const result = await service.getPluginAssemblies(true, 100);

    expect(result.totalCount).toBe(100);
    expect(result.truncation.hasMore).toBe(true);
    expect(result.truncation.totalAvailable).toBeNull();
  });

  it('returns every assembly by default', async () => {
    serve(
      Array.from({ length: 409 }, (_, i) => rawAssembly(i)),
      100
    );

    const result = await service.getPluginAssemblies(true);

    expect(result.totalCount).toBe(409);
    expect(result.ootbExcluded).toBe(0);
    expect(result.truncation.totalAvailable).toBe(409);
  });

  it('a cap counts assemblies returned, not assemblies fetched', async () => {
    serve(
      [rawAssembly(1, true), rawAssembly(2), rawAssembly(3, true), rawAssembly(4)],
      2
    );

    const result = await service.getPluginAssemblies(true, 2);

    expect(result.totalCount).toBe(2);
    expect(result.ootbExcluded).toBe(2);
    expect(result.truncation.hasMore).toBe(false);
  });

  it('excludes managed assemblies at the source unless asked for them', async () => {
    serve([rawAssembly(1)], 10);

    await service.getPluginAssemblies(false);

    expect(makeRequest.mock.calls[0][0]).toContain('$filter=ismanaged eq false');
  });
});
