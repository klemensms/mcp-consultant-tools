/**
 * D4: `security connection-refs` returned exactly 100 of 169 with no truncation
 * field, so `summary.byConnector` under-counted every connector silently.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionReferenceService } from '../ConnectionReferenceService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';
const makeRequest = vi.fn();
const service = new ConnectionReferenceService({
  makeRequest,
  getOrganizationUrl: () => BASE,
} as unknown as PowerPlatformClient);

const rawRef = (id: number, connector = 'shared_commondataserviceforapps', connectionId: string | null = 'conn-1') => ({
  connectionreferenceid: `ref-${id}`,
  connectionreferencelogicalname: `contoso_ref_${id}`,
  connectionreferencedisplayname: `Reference ${id}`,
  connectorid: `/providers/Microsoft.PowerApps/apis/${connector}`,
  statecode: 0,
  statuscode: 1,
  ismanaged: false,
  connectionid: connectionId,
});

const serve = (rows: ReturnType<typeof rawRef>[], pageSize: number) => {
  let served = 0;
  makeRequest.mockImplementation(async () => {
    const value = rows.slice(served, served + pageSize);
    served += value.length;
    const body: Record<string, unknown> = { value };
    if (served < rows.length) {
      body['@odata.nextLink'] = `${BASE}/api/data/v9.2/connectionreferences?$skiptoken=${served}`;
    }
    return body;
  });
};

describe('ConnectionReferenceService.getConnectionReferences', () => {
  beforeEach(() => {
    makeRequest.mockReset();
  });

  it('a truncated byConnector census says so', async () => {
    serve(
      Array.from({ length: 169 }, (_, i) => rawRef(i)),
      100
    );

    const result = await service.getConnectionReferences({ maxRecords: 100 });

    expect(result.summary.total).toBe(100);
    expect(result.truncation.hasMore).toBe(true);
    expect(result.truncation.totalAvailable).toBeNull();
  });

  it('returns every reference by default, so byConnector counts the environment', async () => {
    serve(
      [
        ...Array.from({ length: 100 }, (_, i) => rawRef(i, 'shared_sharepointonline')),
        ...Array.from({ length: 69 }, (_, i) => rawRef(100 + i, 'shared_office365')),
      ],
      50
    );

    const result = await service.getConnectionReferences();

    expect(result.summary.total).toBe(169);
    expect(result.summary.byConnector).toEqual({
      sharepointonline: 100,
      office365: 69,
    });
    expect(result.truncation.hasMore).toBe(false);
    expect(result.truncation.totalAvailable).toBe(169);
  });

  it('a hasConnection filter that matches nothing is not the same as an empty environment', async () => {
    serve(
      Array.from({ length: 10 }, (_, i) => rawRef(i, 'shared_office365', 'conn-1')),
      10
    );

    const result = await service.getConnectionReferences({ hasConnection: false });

    expect(result.references).toHaveLength(0);
    expect(result.truncation.hasMore).toBe(false);
    // The fetch ran to exhaustion, so zero really is zero rather than zero-so-far.
    expect(result.truncation.totalAvailable).toBe(0);
  });

  it('a cap counts references returned, not references fetched', async () => {
    serve(
      [
        rawRef(1, 'shared_office365', null),
        rawRef(2, 'shared_office365', 'conn-1'),
        rawRef(3, 'shared_office365', null),
        rawRef(4, 'shared_office365', 'conn-1'),
      ],
      2
    );

    const result = await service.getConnectionReferences({
      hasConnection: true,
      maxRecords: 2,
    });

    expect(result.references).toHaveLength(2);
    expect(result.truncation.hasMore).toBe(false);
  });
});
