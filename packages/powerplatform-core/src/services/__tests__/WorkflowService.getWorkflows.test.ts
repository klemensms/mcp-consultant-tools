/**
 * `$top`-based completeness check, site 2 of 4.
 *
 * `getWorkflows` asked for `$top = maxRecords + 1` and read `hasMore` off the returned
 * row count. At Dataverse's 5,000-row response cap the sentinel row can never come
 * back, so a truncated list was reported as complete and was byte-identical to a
 * genuinely complete one.
 */

import { describe, it, expect } from 'vitest';
import { WorkflowService } from '../WorkflowService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';

const workflowRow = (i: number) => ({
  workflowid: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, '0')}`,
  name: `Contoso Workflow ${i}`,
  statecode: 1,
  statuscode: 2,
  description: null,
  createdon: '2026-01-15T09:00:00Z',
  modifiedon: '2026-02-15T09:00:00Z',
  type: 1,
  ismanaged: false,
  iscrmuiworkflow: true,
  primaryentity: 'account',
  mode: 0,
  subprocess: false,
  ondemand: false,
  triggeroncreate: true,
  triggerondelete: false,
  syncworkflowlogonfailure: false,
  _ownerid_value: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  modifiedby: { fullname: 'Jane Doe' },
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

describe('WorkflowService.getWorkflows', () => {
  it('a truncated result and a complete one at the same row count are not equal', async () => {
    const cap = 25;

    const truncated = await new WorkflowService(
      stubClient(Array.from({ length: cap + 10 }, (_, i) => workflowRow(i)), cap).client
    ).getWorkflows(false, cap);

    const complete = await new WorkflowService(
      stubClient(Array.from({ length: cap }, (_, i) => workflowRow(i)), cap).client
    ).getWorkflows(false, cap);

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

    await new WorkflowService(stub.client).getWorkflows(false, 25);

    expect(stub.calls[0]).not.toContain('$top');
    expect(stub.calls[0]).toContain('$filter=category eq 0');
  });

  it('filters to activated workflows server-side when asked', async () => {
    const stub = stubClient([workflowRow(1)], 10);

    await new WorkflowService(stub.client).getWorkflows(true, 25);

    expect(stub.calls[0]).toContain('category eq 0 and statecode eq 1');
  });

  it('returns everything when asked for everything', async () => {
    const stub = stubClient(
      Array.from({ length: 60 }, (_, i) => workflowRow(i)),
      25
    );

    const result = await new WorkflowService(stub.client).getWorkflows(false, 0);

    expect(result.totalCount).toBe(60);
    expect(result.truncation.hasMore).toBe(false);
    expect(result.truncation.requestedMax).toBeNull();
    expect(result.truncation.totalAvailable).toBe(60);
  });
});
