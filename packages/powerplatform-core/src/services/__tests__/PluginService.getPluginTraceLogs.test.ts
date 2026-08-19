/**
 * D5: `plugin trace-logs --exception-only` returned the identical 147 records as the
 * same command without the flag, and `parsed.hasException` was false on all 147.
 * Dataverse stores an empty string rather than null in `exceptiondetails` on a clean
 * run, so a `ne null` filter matches every row. The flag manufactured false alarm.
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

const traceLog = (id: number, exceptiondetails = '') => ({
  plugintracelogid: `trace-${id}`,
  primaryentity: 'account',
  messagename: 'Update',
  mode: 0,
  operationtype: 1,
  createdon: '2026-08-18T09:00:00Z',
  exceptiondetails,
});

/**
 * Stands in for Dataverse's own evaluation of the `$filter`. Only the
 * `exceptiondetails` clauses matter here, and the empty-string row is exactly the
 * case the real service stores on a clean run.
 */
const serve = (rows: ReturnType<typeof traceLog>[]) => {
  makeRequest.mockImplementation(async (url: string) => {
    const filter = decodeURIComponent(url);
    let value = rows;
    if (filter.includes("exceptiondetails ne ''")) {
      value = value.filter((r) => r.exceptiondetails !== null && r.exceptiondetails !== '');
    } else if (filter.includes('exceptiondetails ne null')) {
      value = value.filter((r) => r.exceptiondetails !== null);
    }
    return { value };
  });
};

describe('PluginService.getPluginTraceLogs', () => {
  beforeEach(() => {
    makeRequest.mockReset();
  });

  it('a clean window returns nothing under --exception-only, not everything', async () => {
    const rows = Array.from({ length: 147 }, (_, i) => traceLog(i));
    serve(rows);

    const unfiltered = await service.getPluginTraceLogs({});
    const filtered = await service.getPluginTraceLogs({ exceptionOnly: true });

    expect(unfiltered.totalCount).toBe(147);
    expect(filtered.totalCount).toBe(0);
    expect(filtered.totalCount).not.toBe(unfiltered.totalCount);
  });

  it('excludes the empty string as well as null in the filter it sends', async () => {
    serve([]);

    await service.getPluginTraceLogs({ exceptionOnly: true });

    expect(decodeURIComponent(makeRequest.mock.calls[0][0] as string)).toContain(
      "exceptiondetails ne null and exceptiondetails ne ''"
    );
  });

  it('reports exceptionCount so the figure needs no per-record reading', async () => {
    serve([traceLog(1), traceLog(2, 'System.NullReferenceException: boom'), traceLog(3)]);

    const result = await service.getPluginTraceLogs({});

    expect(result.totalCount).toBe(3);
    expect(result.exceptionCount).toBe(1);
  });

  it('exceptionCount equals totalCount when the flag is set', async () => {
    serve([traceLog(1), traceLog(2, 'System.InvalidOperationException: boom'), traceLog(3)]);

    const result = await service.getPluginTraceLogs({ exceptionOnly: true });

    expect(result.totalCount).toBe(1);
    expect(result.exceptionCount).toBe(1);
  });
});
