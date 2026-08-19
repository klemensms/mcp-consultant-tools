/**
 * D20: `workspace metadata` returned 679-691 tables for every workspace with near-identical
 * content, including a workspace that had ingested zero records in seven days. It is the
 * workspace's *schema catalogue* - every table the workspace could hold - and nothing in
 * the payload said so, so a consumer recording "available tables per workspace" credited
 * every empty workspace with a full telemetry stack, and a "no X table present" rule could
 * never fire.
 *
 * The acceptance criterion is the failure case: a schema catalogue must not be
 * indistinguishable from an inventory of what the workspace actually holds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { LogAnalyticsService } from '../log-analytics-service.js';

vi.mock('axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
const mockedPost = vi.mocked(axios.post);
const mockedGet = vi.mocked(axios.get);

function makeService(): LogAnalyticsService {
  return new LogAnalyticsService({
    authMethod: 'api-key',
    resources: [
      {
        id: 'ws-empty',
        name: 'ws-empty',
        workspaceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        active: true,
        apiKey: 'fake-api-key',
      },
      {
        id: 'ws-busy',
        name: 'ws-busy',
        workspaceId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
        active: true,
        apiKey: 'fake-api-key',
      },
    ],
  });
}

/** The metadata endpoint answers the same catalogue whatever the workspace holds. */
const catalogueOf = (n: number) => ({
  data: {
    tables: Array.from({ length: n }, (_, i) => ({
      name: `AppTable${i}`,
      columns: [{ name: 'TimeGenerated', type: 'datetime' }],
    })),
  },
});

const usageResponse = (rows: unknown[][]) => ({
  data: {
    tables: [
      {
        name: 'PrimaryResult',
        columns: [
          { name: 'DataType', type: 'string' },
          { name: 'TotalVolumeMB', type: 'real' },
        ],
        rows,
      },
    ],
  },
});

describe('LogAnalyticsService.getMetadata declares itself a schema catalogue', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
  });

  it('names its own scope, so 679 tables cannot be read as 679 populated tables', async () => {
    mockedGet.mockResolvedValueOnce(catalogueOf(679));

    const result = await makeService().getMetadata('ws-empty');

    expect(result.scope).toBeDefined();
    expect(result.scope!.kind).toBe('schema-catalogue');
    expect(result.scope!.tableCount).toBe(679);
    expect(result.scope!.note).toContain('la-list-workspace-tables');
  });

  it('an empty workspace and a busy one get the same catalogue, which is why it must say so', async () => {
    mockedGet.mockResolvedValueOnce(catalogueOf(679)).mockResolvedValueOnce(catalogueOf(679));
    const service = makeService();

    const empty = await service.getMetadata('ws-empty');
    const busy = await service.getMetadata('ws-busy');

    expect(empty.scope).toEqual(busy.scope);
    expect(empty.scope!.note).toBeTruthy();
  });
});

describe('LogAnalyticsService.listWorkspaceTables', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
  });

  it('a workspace that ingested nothing is distinguishable from one that ingested something', async () => {
    const service = makeService();

    mockedPost.mockResolvedValueOnce(usageResponse([]));
    const empty = await service.listWorkspaceTables('ws-empty', 'P7D');

    mockedPost.mockResolvedValueOnce(
      usageResponse([
        ['AppTraces', 1024.5],
        ['FunctionAppLogs', 12.25],
      ])
    );
    const busy = await service.listWorkspaceTables('ws-busy', 'P7D');

    expect(empty.summary).not.toEqual(busy.summary);
    expect(empty.summary.total).toBe(0);
    expect(busy.summary.total).toBe(2);
    expect(busy.tables.map((t) => t.dataType)).toEqual(['AppTraces', 'FunctionAppLogs']);
  });

  it('says which window it measured, so a zero is never a window-independent claim', async () => {
    mockedPost.mockResolvedValueOnce(usageResponse([]));

    const result = await makeService().listWorkspaceTables('ws-empty', 'P7D');

    expect(result.summary.timespan).toBe('P7D');
    expect(result.summary.note).toContain('P7D');
    expect(result.summary.note).toContain('Usage');
  });

  it('an empty result carries a note; a populated one does not need one', async () => {
    const service = makeService();

    mockedPost.mockResolvedValueOnce(usageResponse([]));
    const empty = await service.listWorkspaceTables('ws-empty');

    mockedPost.mockResolvedValueOnce(usageResponse([['AppTraces', 5]]));
    const busy = await service.listWorkspaceTables('ws-busy');

    expect(empty.summary.note).toBeTruthy();
    expect(busy.summary.note).toBeUndefined();
    expect(busy.summary.caveat).toContain('Usage');
  });

  it('queries the Usage table over the requested window, not the default', async () => {
    mockedPost.mockResolvedValueOnce(usageResponse([]));

    await makeService().listWorkspaceTables('ws-busy', 'P30D');

    const body = mockedPost.mock.calls[0][1] as any;
    expect(body.query).toContain('Usage');
    expect(body.query).toContain('ago(30d)');
    expect(body.timespan).toBe('P30D');
  });

  it('defaults to a seven-day window, which is the one the defect was measured over', async () => {
    mockedPost.mockResolvedValueOnce(usageResponse([]));

    const result = await makeService().listWorkspaceTables('ws-busy');

    expect(result.summary.timespan).toBe('P7D');
  });
});
