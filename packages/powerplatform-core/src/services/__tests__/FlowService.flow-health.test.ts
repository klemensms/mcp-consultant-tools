import { describe, it, expect } from 'vitest';
import { FlowService } from '../FlowService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://yourorg.crm.dynamics.com';

interface StubOpts {
  /** flow rows returned by the workflows (category eq 5) query, optionally across pages */
  flowPages: Record<string, unknown>[][];
  /** run rows keyed by flowId (workflowid) */
  runsByFlow?: Record<string, Record<string, unknown>[]>;
  /** flowIds whose flowruns fetch should throw a 403 */
  denyRuns?: string[];
}

/**
 * Plain stub PowerPlatformClient (no vi.mock): routes makeRequest on the endpoint.
 * Emulates Dataverse @odata.nextLink paging for the workflows query.
 */
function stubClient(opts: StubOpts): PowerPlatformClient {
  let workflowPageIdx = 0;
  const client = {
    getOrganizationUrl() {
      return BASE;
    },
    async makeRequest<T>(endpoint: string): Promise<T> {
      if (endpoint.includes('organizations')) {
        return { value: [{ organizationid: 'env-1' }] } as T;
      }
      if (endpoint.startsWith('api/data/v9.2/workflows')) {
        const page = opts.flowPages[workflowPageIdx] ?? [];
        const isLast = workflowPageIdx >= opts.flowPages.length - 1;
        workflowPageIdx++;
        const body: Record<string, unknown> = { value: page };
        if (!isLast) {
          body['@odata.nextLink'] = `${BASE}/api/data/v9.2/workflows?$skiptoken=page${workflowPageIdx}`;
        }
        return body as T;
      }
      if (endpoint.startsWith('api/data/v9.2/flowruns')) {
        const m = endpoint.match(/_workflow_value eq '([^']+)'/);
        const flowId = m?.[1] ?? '';
        if (opts.denyRuns?.includes(flowId)) {
          throw { response: { status: 403 } };
        }
        return { value: opts.runsByFlow?.[flowId] ?? [] } as T;
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    },
  };
  return client as unknown as PowerPlatformClient;
}

const runRow = (status: string, starttime: string, errorcode?: string, errormessage?: string) => ({
  flowrunid: `run-${starttime}`,
  status,
  starttime,
  endtime: starttime,
  errorcode: errorcode ?? null,
  errormessage: errormessage ?? null,
  duration: 100,
  triggertype: 'Manual',
});

describe('FlowService.getFlowInventory', () => {
  it('follows @odata.nextLink across pages and maps rows', async () => {
    const svc = new FlowService(
      stubClient({
        flowPages: [
          [{ workflowid: 'a', name: 'Alpha', statecode: 1, ismanaged: false, modifiedon: '2026-07-01T00:00:00Z' }],
          [{ workflowid: 'b', name: 'Beta', statecode: 0, ismanaged: true, modifiedon: '2026-07-02T00:00:00Z' }],
        ],
      }),
    );
    const result = await svc.getFlowInventory({ maxRecords: 500 });
    expect(result.totalCount).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.flows.map((f) => f.flowId)).toEqual(['a', 'b']);
    expect(result.flows[1].state).toBe('Draft');
  });

  it('stops at maxRecords and reports hasMore when more pages remain', async () => {
    const svc = new FlowService(
      stubClient({
        flowPages: [
          [{ workflowid: 'a', name: 'Alpha', statecode: 1, ismanaged: false, modifiedon: null }],
          [{ workflowid: 'b', name: 'Beta', statecode: 1, ismanaged: false, modifiedon: null }],
        ],
      }),
    );
    const result = await svc.getFlowInventory({ maxRecords: 1 });
    expect(result.totalCount).toBe(1);
    expect(result.hasMore).toBe(true);
  });
});

describe('FlowService.scanFlowHealth', () => {
  it('aggregates per-flow run health across all flows', async () => {
    const svc = new FlowService(
      stubClient({
        flowPages: [[
          { workflowid: 'healthy', name: 'Healthy', statecode: 1 },
          { workflowid: 'failing', name: 'Failing', statecode: 1 },
          { workflowid: 'idle', name: 'Idle', statecode: 1 },
        ]],
        runsByFlow: {
          healthy: [runRow('Succeeded', '2026-07-10T10:00:00Z'), runRow('Succeeded', '2026-07-10T09:00:00Z')],
          failing: [runRow('Succeeded', '2026-07-10T10:00:00Z'), runRow('Failed', '2026-07-10T09:00:00Z', 'E', 'boom')],
          idle: [],
        },
      }),
    );
    const result = await svc.scanFlowHealth({ daysBack: 7, maxFlows: 500, activeOnly: true });
    expect(result.summary.totalFlowsScanned).toBe(3);
    expect(result.summary.flowsHealthy).toBe(1);
    expect(result.summary.flowsWithFailures).toBe(1);
    expect(result.summary.flowsNoRuns).toBe(1);
    expect(result.summary.flowsErrored).toBe(0);
    expect(result.summary.overallSuccessRate).toBeCloseTo(75, 1);
    expect(result.topFailingFlows.map((f) => f.flowId)).toEqual(['failing']);
    expect(result.daysAnalyzed).toBe(7);
    expect(result.allFlows).toHaveLength(3);
  });

  it('buckets a flow whose run fetch is denied (403) as errored, not idle', async () => {
    const svc = new FlowService(
      stubClient({
        flowPages: [[
          { workflowid: 'ok', name: 'Ok', statecode: 1 },
          { workflowid: 'denied', name: 'Denied', statecode: 1 },
        ]],
        runsByFlow: { ok: [runRow('Succeeded', '2026-07-10T10:00:00Z')] },
        denyRuns: ['denied'],
      }),
    );
    const result = await svc.scanFlowHealth({ maxFlows: 500 });
    expect(result.summary.flowsErrored).toBe(1);
    expect(result.summary.flowsNoRuns).toBe(0);
    const denied = result.allFlows.find((f) => f.flowId === 'denied');
    expect(denied?.scanError).toContain('Access denied');
  });

  it('flags flows whose run history exceeded the per-flow sample cap', async () => {
    const svc = new FlowService(
      stubClient({
        flowPages: [[{ workflowid: 'busy', name: 'Busy', statecode: 1 }]],
        runsByFlow: {
          busy: [
            runRow('Succeeded', '2026-07-10T10:00:00Z'),
            runRow('Succeeded', '2026-07-10T09:00:00Z'),
            runRow('Failed', '2026-07-10T08:00:00Z', 'E', 'boom'),
          ],
        },
      }),
    );
    // maxRunsPerFlow=2 → getFlowRuns returns 2 rows + hasMore, so the sample is truncated.
    const result = await svc.scanFlowHealth({ maxFlows: 500, maxRunsPerFlow: 2 });
    expect(result.summary.flowsSampleTruncated).toBe(1);
    expect(result.allFlows[0].sampleTruncated).toBe(true);
    expect(result.allFlows[0].totalRuns).toBe(2);
    expect(result.runsSampledPerFlow).toBe(2);
  });

  it('adds a statecode filter to the flow list only when activeOnly is set', async () => {
    const seen: string[] = [];
    const base = stubClient({ flowPages: [[]], runsByFlow: {} });
    const spy = {
      getOrganizationUrl() {
        return BASE;
      },
      async makeRequest<T>(endpoint: string): Promise<T> {
        seen.push(endpoint);
        return base.makeRequest<T>(endpoint);
      },
    } as unknown as PowerPlatformClient;
    const svc = new FlowService(spy);
    await svc.scanFlowHealth({ activeOnly: true });
    expect(seen.some((e) => e.includes('statecode eq 1'))).toBe(true);
  });
});
