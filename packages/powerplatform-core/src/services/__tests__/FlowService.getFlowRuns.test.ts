/**
 * `$top`-based completeness check, site 4 of 4 - and the one most likely to bite.
 *
 * `getFlowRuns` spelled the cap inline as `$top=${limit + 1}` and read `hasMore` off
 * the returned row count. `flowruns` holds one row per execution, so a busy flow passes
 * Dataverse's 5,000-row response cap easily: the server returned exactly 5,000 rows,
 * the sentinel never arrived, and a truncated run history was reported as complete.
 *
 * The inline `$top` spelling is how this site survived two separate counts of the
 * defect - a grep for `maxRecords + 1` misses it.
 */

import { describe, it, expect } from 'vitest';
import { FlowService } from '../FlowService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';
const FLOW_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const runRow = (i: number) => ({
  flowrunid: `run-${String(i).padStart(6, '0')}`,
  status: i % 5 === 0 ? 'Failed' : 'Succeeded',
  starttime: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T09:00:00Z`,
  endtime: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T09:01:00Z`,
  errorcode: i % 5 === 0 ? 'ActionFailed' : null,
  errormessage: i % 5 === 0 ? 'The action failed' : null,
  duration: 60000,
  triggertype: 'Manual',
});

function stubClient(rows: unknown[], pageSize: number) {
  let served = 0;
  const calls: string[] = [];
  const client = {
    getOrganizationUrl: () => BASE,
    async makeRequest<T>(endpoint: string): Promise<T> {
      calls.push(endpoint);
      if (endpoint.includes('organizations')) {
        return { value: [{ organizationid: 'env-1' }] } as T;
      }
      const value = rows.slice(served, served + pageSize);
      served += value.length;
      const body: Record<string, unknown> = { value };
      if (served < rows.length) {
        body['@odata.nextLink'] =
          `${BASE}/api/data/v9.2/flowruns?$skiptoken=${served}`;
      }
      return body as T;
    },
  };
  return { client: client as unknown as PowerPlatformClient, calls };
}

describe('FlowService.getFlowRuns', () => {
  it('a truncated run history and a complete one at the same row count are not equal', async () => {
    const cap = 50;

    const truncated = await new FlowService(
      stubClient(Array.from({ length: cap + 200 }, (_, i) => runRow(i)), cap).client
    ).getFlowRuns(FLOW_ID, { maxRecords: cap });

    const complete = await new FlowService(
      stubClient(Array.from({ length: cap }, (_, i) => runRow(i)), cap).client
    ).getFlowRuns(FLOW_ID, { maxRecords: cap });

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
    const stub = stubClient([runRow(1)], 10);

    await new FlowService(stub.client).getFlowRuns(FLOW_ID, { maxRecords: 50 });

    const runsCall = stub.calls.find((c) => c.startsWith('api/data/v9.2/flowruns'));
    expect(runsCall).toBeDefined();
    expect(runsCall).not.toContain('$top');
    expect(runsCall).toContain(`_workflow_value eq '${FLOW_ID}'`);
  });

  it('resolves maxRecords 0 to the documented 250-run ceiling, not to uncapped', async () => {
    // The old form turned 0 into `$top=1` and returned no runs at all while claiming
    // more were available. Passing 0 straight to the paginator would instead mean
    // "everything", up to a 50,000-row safety ceiling, which a documented max of 250
    // does not promise.
    const stub = stubClient(
      Array.from({ length: 400 }, (_, i) => runRow(i)),
      250
    );

    const result = await new FlowService(stub.client).getFlowRuns(FLOW_ID, {
      maxRecords: 0,
    });

    expect(result.totalCount).toBe(250);
    expect(result.filterApplied.maxRecords).toBe(250);
    expect(result.truncation.requestedMax).toBe(250);
    expect(result.truncation.hasMore).toBe(true);
    expect(result.truncation.totalAvailable).toBeNull();
  });

  it('still clamps a request above the 250-run ceiling', async () => {
    const stub = stubClient(
      Array.from({ length: 400 }, (_, i) => runRow(i)),
      250
    );

    const result = await new FlowService(stub.client).getFlowRuns(FLOW_ID, {
      maxRecords: 1000,
    });

    expect(result.totalCount).toBe(250);
    expect(result.filterApplied.maxRecords).toBe(250);
  });

  it('applies the status and window filters server-side', async () => {
    const stub = stubClient([runRow(1)], 10);

    await new FlowService(stub.client).getFlowRuns(FLOW_ID, {
      status: 'Failed',
      startedAfter: '2026-02-01T00:00:00Z',
      startedBefore: '2026-02-28T00:00:00Z',
    });

    const runsCall = stub.calls.find((c) => c.startsWith('api/data/v9.2/flowruns'));
    expect(runsCall).toContain("status eq 'Failed'");
    expect(runsCall).toContain('starttime ge 2026-02-01T00:00:00Z');
    expect(runsCall).toContain('starttime le 2026-02-28T00:00:00Z');
  });

  it('reports a short history as complete', async () => {
    const stub = stubClient(
      Array.from({ length: 7 }, (_, i) => runRow(i)),
      250
    );

    const result = await new FlowService(stub.client).getFlowRuns(FLOW_ID, {
      maxRecords: 50,
    });

    expect(result.totalCount).toBe(7);
    expect(result.hasMore).toBe(false);
    expect(result.truncation.totalAvailable).toBe(7);
  });
});
