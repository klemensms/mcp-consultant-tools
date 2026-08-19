/**
 * D7: `plugin list` and `plugin get` returned two different shapes for the same assembly.
 * `list` decoded the row - `isManaged: true`, `isolationMode: "Sandbox"`, `modifiedBy` as a
 * display name - while `get` returned the raw Dataverse row: `ismanaged`,
 * `isolationmode: 2`, `modifiedon`, plus `@odata.etag` and a nested `ishidden`
 * managed-property object.
 *
 * A consumer written against the first shape reads `undefined` for every one of those
 * fields in the second, with no error. That is this repo's defect class exactly: the
 * failure looks like an assembly with nothing set rather than like a mismatch.
 *
 * The acceptance criterion is the failure case. Serve one row through both calls and
 * require every field `list` emits to be present in `get` under the same name, with the
 * same decoded value. That fails on the shape that shipped, and cannot be satisfied by a
 * `get` payload that merely contains the data somewhere.
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

/** The row as Dataverse returns it, including the noise `get` used to pass straight through. */
const RAW_ASSEMBLY = {
  '@odata.etag': 'W/"12345678"',
  pluginassemblyid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Contoso.Plugins.Core',
  version: '1.2.3.4',
  culture: 'neutral',
  publickeytoken: '0123456789abcdef',
  isolationmode: 2,
  sourcetype: 0,
  major: 1,
  minor: 2,
  createdon: '2026-01-02T08:00:00Z',
  modifiedon: '2026-01-15T09:00:00Z',
  ismanaged: false,
  ishidden: { Value: false },
  description: 'Core plugin assembly',
  modifiedby: { fullname: 'Jane Doe' },
};

/** Route by endpoint, because `getPluginAssemblyComplete` makes up to four calls. */
function serveComplete(assembly: Record<string, unknown> = RAW_ASSEMBLY) {
  makeRequest.mockImplementation(async (endpoint: string) => {
    if (endpoint.includes('pluginassemblies')) return { value: [assembly] };
    if (endpoint.includes('plugintypes')) return { value: [] };
    if (endpoint.includes('sdkmessageprocessingsteps')) return { value: [] };
    return { value: [] };
  });
}

describe('plugin assembly shape is the same from list and from get', () => {
  beforeEach(() => {
    makeRequest.mockReset();
  });

  it('get carries every field list emits, under the same name and decoded the same way', async () => {
    serveComplete();
    const listed = (await service.getPluginAssemblies(true)).assemblies[0] as Record<
      string,
      unknown
    >;

    serveComplete();
    const fetched = (await service.getPluginAssemblyComplete('Contoso.Plugins.Core'))
      .assembly as Record<string, unknown>;

    // Not a subset check on values only - the field has to be there under the same key,
    // because reading `undefined` is the failure this closes.
    for (const [key, value] of Object.entries(listed)) {
      expect(fetched, `get is missing '${key}'`).toHaveProperty(key);
      expect(fetched[key], `get disagrees with list on '${key}'`).toEqual(value);
    }
  });

  it('get does not leak the raw row alongside the decoded one', async () => {
    serveComplete();
    const fetched = (await service.getPluginAssemblyComplete('Contoso.Plugins.Core'))
      .assembly as Record<string, unknown>;

    // Two names for one fact is the next defect, not the fix for this one.
    for (const raw of ['ismanaged', 'isolationmode', 'modifiedon', 'createdon', 'sourcetype', 'publickeytoken', '@odata.etag']) {
      expect(fetched, `get still carries the raw '${raw}'`).not.toHaveProperty(raw);
    }
  });

  it('get decodes the fields only it selects, rather than passing them through raw', async () => {
    serveComplete();
    const fetched = (await service.getPluginAssemblyComplete('Contoso.Plugins.Core'))
      .assembly as Record<string, unknown>;

    expect(fetched.description).toBe('Core plugin assembly');
    expect(fetched.culture).toBe('neutral');
    expect(fetched.publicKeyToken).toBe('0123456789abcdef');
    expect(fetched.sourceType).toBe('Database');
    expect(fetched.createdOn).toBe('2026-01-02T08:00:00Z');
    expect(fetched.isHidden).toBe(false);
  });

  it('reports an isolation mode it does not recognise instead of calling it External', async () => {
    serveComplete({ ...RAW_ASSEMBLY, isolationmode: 3 });
    expect(
      ((await service.getPluginAssemblyComplete('Contoso.Plugins.Core')).assembly as any)
        .isolationMode
    ).toBe('External');

    serveComplete({ ...RAW_ASSEMBLY, isolationmode: null });
    expect(
      ((await service.getPluginAssemblyComplete('Contoso.Plugins.Core')).assembly as any)
        .isolationMode
    ).toBe('Unknown (null)');
  });

  it('decodes the ishidden managed property whether it arrives wrapped or bare', async () => {
    serveComplete({ ...RAW_ASSEMBLY, ishidden: { Value: true } });
    expect(
      ((await service.getPluginAssemblyComplete('Contoso.Plugins.Core')).assembly as any).isHidden
    ).toBe(true);

    serveComplete({ ...RAW_ASSEMBLY, ishidden: true });
    expect(
      ((await service.getPluginAssemblyComplete('Contoso.Plugins.Core')).assembly as any).isHidden
    ).toBe(true);
  });
});
