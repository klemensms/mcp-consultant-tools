/**
 * `$top`-based completeness check, site 3 of 4.
 *
 * `searchWorkflows` asked for `$top = maxResults + 1` and read `hasMore` off the
 * returned row count. At Dataverse's 5,000-row response cap the sentinel row can never
 * come back, so a truncated search result was reported as complete and was
 * byte-identical to a genuinely complete one.
 *
 * This site was absent from every earlier record of the defect because it spells the
 * cap `maxResults` rather than `maxRecords`.
 */

import { describe, it, expect } from 'vitest';
import { FlowService } from '../FlowService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';

const workflowRow = (i: number) => ({
  workflowid: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, '0')}`,
  name: `Contoso Flow ${i}`,
  description: 'AUTO-DOCS:v1',
  statecode: 1,
  statuscode: 2,
  category: 5,
  type: 1,
  primaryentity: 'account',
  ismanaged: false,
  createdon: '2026-01-15T09:00:00Z',
  modifiedon: '2026-02-15T09:00:00Z',
  _ownerid_value: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  modifiedby: { fullname: 'Jane Doe' },
  createdby: { fullname: 'Jane Doe' },
});

function stubClient(rows: unknown[], pageSize: number) {
  let served = 0;
  const calls: string[] = [];
  const client = {
    getOrganizationUrl: () => BASE,
    async makeRequest<T>(endpoint: string): Promise<T> {
      calls.push(endpoint);
      const value = rows.slice(served, served + pageSize);
      served += value.length;
      const body: Record<string, unknown> = { value };
      if (served < rows.length) {
        body['@odata.nextLink'] =
          `${BASE}/api/data/v9.2/workflows?$skiptoken=${served}`;
      }
      return body as T;
    },
  };
  return { client: client as unknown as PowerPlatformClient, calls };
}

describe('FlowService.searchWorkflows', () => {
  it('a truncated result and a complete one at the same row count are not equal', async () => {
    const cap = 50;

    const truncated = await new FlowService(
      stubClient(Array.from({ length: cap + 25 }, (_, i) => workflowRow(i)), cap).client
    ).searchWorkflows({ maxResults: cap });

    const complete = await new FlowService(
      stubClient(Array.from({ length: cap }, (_, i) => workflowRow(i)), cap).client
    ).searchWorkflows({ maxResults: cap });

    expect(truncated.totalCount).toBe(cap);
    expect(complete.totalCount).toBe(cap);

    expect(truncated).not.toEqual(complete);
    expect(truncated.hasMore).toBe(true);
    expect(truncated.truncation.hasMore).toBe(true);
    expect(truncated.truncation.totalAvailable).toBeNull();

    expect(complete.hasMore).toBe(false);
    expect(complete.truncation.hasMore).toBe(false);
    expect(complete.truncation.totalAvailable).toBe(cap);
  });

  it('no longer sends $top', async () => {
    const stub = stubClient([workflowRow(1)], 10);

    await new FlowService(stub.client).searchWorkflows({ maxResults: 50 });

    expect(stub.calls[0]).not.toContain('$top');
  });

  it('escapes a quote in the name filter', async () => {
    const stub = stubClient([workflowRow(1)], 10);

    await new FlowService(stub.client).searchWorkflows({ name: "O'Brien" });

    expect(stub.calls[0]).toContain("contains(name,'O''Brien')");
  });

  it('returns everything when asked for everything', async () => {
    const stub = stubClient(
      Array.from({ length: 120 }, (_, i) => workflowRow(i)),
      50
    );

    const result = await new FlowService(stub.client).searchWorkflows({
      maxResults: 0,
    });

    expect(result.totalCount).toBe(120);
    expect(result.truncation.hasMore).toBe(false);
    expect(result.truncation.requestedMax).toBeNull();
    expect(result.truncation.totalAvailable).toBe(120);
  });
});
