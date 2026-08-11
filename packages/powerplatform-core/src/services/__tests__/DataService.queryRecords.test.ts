import { describe, it, expect } from 'vitest';
import { DataService } from '../DataService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://yourorg.crm.dynamics.com';

interface Call {
  endpoint: string;
  headers?: Record<string, string>;
}

/**
 * Plain stub PowerPlatformClient emulating the two Dataverse behaviours that make
 * row-count-based completeness checks wrong:
 *   1. A single response never exceeds 5,000 rows, whatever `$top` asks for.
 *   2. `$top` is ignored when `Prefer: odata.maxpagesize` is present; continuation
 *      is signalled by `@odata.nextLink`, not by a short page.
 */
function stubClient(totalRows: number): { client: PowerPlatformClient; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    getOrganizationUrl() {
      return BASE;
    },
    async makeRequest<T>(
      endpoint: string,
      _method?: string,
      _data?: unknown,
      headers?: Record<string, string>
    ): Promise<T> {
      calls.push({ endpoint, headers });

      const prefer = headers?.Prefer ?? '';
      const maxPageSize = prefer.match(/odata\.maxpagesize=(\d+)/);
      const top = endpoint.match(/[?&]\$top=(\d+)/);
      const requested = maxPageSize
        ? Number(maxPageSize[1])
        : top
          ? Number(top[1])
          : 5000;
      const pageSize = Math.min(requested, 5000);

      const skipToken = endpoint.match(/[?&]\$skiptoken=(\d+)/);
      const offset = skipToken ? Number(skipToken[1]) : 0;

      const rows = Array.from(
        { length: Math.max(Math.min(offset + pageSize, totalRows) - offset, 0) },
        (_, i) => ({ contactid: `row-${offset + i}` })
      );

      const body: Record<string, unknown> = { value: rows };
      const nextOffset = offset + rows.length;
      if (nextOffset < totalRows) {
        body['@odata.nextLink'] =
          `${BASE}/api/data/v9.2/contacts?$skiptoken=${nextOffset}`;
      }
      return body as T;
    },
  };
  return { client: client as unknown as PowerPlatformClient, calls };
}

const FILTER = "createdon ge 2022-01-01 and createdon lt 2023-01-01";

describe('DataService.queryRecords', () => {
  it('reports hasMore when the window holds more rows than the 5,000-row page cap', async () => {
    const { client } = stubClient(8323);
    const svc = new DataService(client);

    const result = await svc.queryRecords('contacts', FILTER, 5000);

    expect(result.returnedCount).toBe(5000);
    expect(result.hasMore).toBe(true);
  });

  it('pages past 5,000 rows when maxRecords asks for more', async () => {
    const { client } = stubClient(8323);
    const svc = new DataService(client);

    const result = await svc.queryRecords('contacts', FILTER, 10000);

    expect(result.returnedCount).toBe(8323);
    expect(result.hasMore).toBe(false);
  });

  it('returns every row with hasMore false when the window fits in one page', async () => {
    const { client } = stubClient(10);
    const svc = new DataService(client);

    const result = await svc.queryRecords('contacts', FILTER, 50);

    expect(result.returnedCount).toBe(10);
    expect(result.hasMore).toBe(false);
  });

  it('trims to maxRecords and reports hasMore below the page cap', async () => {
    const { client } = stubClient(60);
    const svc = new DataService(client);

    const result = await svc.queryRecords('contacts', FILTER, 50);

    expect(result.returnedCount).toBe(50);
    expect(result.hasMore).toBe(true);
  });

  it('pages with odata.maxpagesize and keeps annotations on every request', async () => {
    const { client, calls } = stubClient(12000);
    const svc = new DataService(client);

    await svc.queryRecords('contacts', FILTER, 12000, ['contactid']);

    expect(calls.length).toBe(3);
    for (const call of calls) {
      expect(call.headers?.Prefer).toContain('odata.maxpagesize=5000');
      expect(call.headers?.Prefer).toContain('odata.include-annotations="*"');
    }
    expect(calls[0].endpoint).not.toContain('$top=');
    expect(calls[0].endpoint).toContain('$select=contactid');
  });
});
