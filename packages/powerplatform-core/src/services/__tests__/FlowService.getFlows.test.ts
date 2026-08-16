/**
 * D1: `flow list` reported `hasMore: false` at its default cap while 114 further
 * flows existed. That is worse than a missing signal, because a consumer that
 * correctly checks `hasMore` before paging is told there is nothing more.
 *
 * The cause was computing `hasMore` from a single over-fetched page *after* the
 * client-side exclusions had run over it. These tests assert the failure case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowService } from '../FlowService.js';
import { UNCAPPED } from '@mcp-consultant-tools/core';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';
const makeRequest = vi.fn();
const service = new FlowService({
  makeRequest,
  getOrganizationUrl: () => BASE,
} as unknown as PowerPlatformClient);

const rawFlow = (id: number, modifiedBy = 'Jane Doe') => ({
  workflowid: `flow-${id}`,
  name: `Flow ${id}`,
  description: null,
  statecode: 1,
  statuscode: 2,
  type: 1,
  primaryentity: 'account',
  ismanaged: false,
  _ownerid_value: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  modifiedon: '2026-01-15T09:00:00Z',
  createdon: '2026-01-01T09:00:00Z',
  modifiedby: { fullname: modifiedBy },
});

/**
 * Serve `total` flows in pages of `pageSize`, where one in every `systemEvery`
 * is SYSTEM-modified and therefore dropped client-side.
 */
const serve = (total: number, pageSize: number, systemEvery = 0) => {
  let served = 0;
  makeRequest.mockImplementation(async () => {
    const value = Array.from({ length: Math.min(pageSize, total - served) }, (_, i) => {
      const n = served + i;
      const isSystem = systemEvery > 0 && n % systemEvery === 0;
      return rawFlow(n, isSystem ? 'SYSTEM' : 'Jane Doe');
    });
    served += value.length;
    const body: Record<string, unknown> = { value };
    if (served < total) {
      body['@odata.nextLink'] = `${BASE}/api/data/v9.2/workflows?$skiptoken=${served}`;
    }
    return body;
  });
};

describe('FlowService.getFlows', () => {
  beforeEach(() => {
    makeRequest.mockReset();
  });

  it('the D1 regression: a cap plus client-side exclusions must still report hasMore', async () => {
    // 136 flows at the source, every third dropped as SYSTEM, cap of 25.
    // The old code fetched one over-sized page, filtered it below 25, and called it complete.
    serve(136, 25, 3);

    const result = await service.getFlows({ maxRecords: 25 });

    expect(result.totalCount).toBe(25);
    expect(result.hasMore).toBe(true);
    expect(result.truncation.hasMore).toBe(true);
    expect(result.truncation.totalAvailable).toBeNull();
  });

  it('a capped result is distinguishable from a complete one at the same row count', async () => {
    serve(22, 25, 0);
    const complete = await service.getFlows({ maxRecords: 25 });

    makeRequest.mockReset();
    serve(500, 22, 0);
    const capped = await service.getFlows({ maxRecords: 22 });

    expect(complete.totalCount).toBe(22);
    expect(capped.totalCount).toBe(22);
    expect(complete.hasMore).toBe(false);
    expect(capped.hasMore).toBe(true);
    expect(complete.truncation.totalAvailable).toBe(22);
    expect(capped.truncation.totalAvailable).toBeNull();
  });

  it('returns every flow by default rather than a first page', async () => {
    serve(136, 50);

    const result = await service.getFlows();

    expect(result.totalCount).toBe(136);
    expect(result.hasMore).toBe(false);
    expect(result.truncation.totalAvailable).toBe(136);
    expect(result.requestedMax).toBe(UNCAPPED);
    expect(result.truncation.requestedMax).toBeNull();
  });

  it('counts what the client-side exclusions dropped', async () => {
    serve(30, 30, 3); // 10 of 30 are SYSTEM-modified

    const result = await service.getFlows();

    expect(result.excluded.system).toBe(10);
    expect(result.totalCount).toBe(20);
    expect(result.hasMore).toBe(false);
  });

  it('does not page for excluded rows when the exclusions are switched off', async () => {
    serve(30, 30, 3);

    const result = await service.getFlows({
      excludeSystem: false,
      excludeCopilotSales: false,
    });

    expect(result.totalCount).toBe(30);
    expect(result.excluded.system).toBe(0);
  });
});
