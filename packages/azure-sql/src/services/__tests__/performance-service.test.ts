import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PerformanceService,
  buildTopWaitsQuery,
  buildFindQueryInStoreQuery,
  buildQueryWaitStatsQuery,
  buildCpuIntensiveQueriesQuery,
  buildFailedQueriesQuery,
  buildQueryPlanQuery,
  buildQueryStoreStateQuery,
} from '../performance-service.js';
import type { QueryService } from '../query-service.js';

/**
 * Every parameter a caller controls must reach SQL Server as a bound parameter,
 * never as interpolated text. These are the values a builder is allowed to inline.
 */
const expectNoInterpolation = (sql: string, forbidden: string[]) => {
  for (const value of forbidden) {
    expect(sql).not.toContain(value);
  }
};

describe('query builders: parameter binding', () => {
  it('buildTopWaitsQuery takes no parameters and reads Query Store wait stats', () => {
    const { sql, parameters } = buildTopWaitsQuery();
    expect(parameters).toEqual({});
    expect(sql).toContain('sys.query_store_wait_stats');
    expect(sql).toContain('TOP 20');
  });

  it('buildFindQueryInStoreQuery binds the pattern instead of interpolating it', () => {
    const { sql, parameters } = buildFindQueryInStoreQuery({ queryPattern: "x'; DROP TABLE Users--" });
    expect(parameters).toEqual({ queryPattern: "x'; DROP TABLE Users--" });
    expect(sql).toContain('@queryPattern');
    expectNoInterpolation(sql, ['DROP TABLE Users']);
  });

  it('buildQueryWaitStatsQuery binds the query id', () => {
    const { sql, parameters } = buildQueryWaitStatsQuery({ queryId: 42 });
    expect(parameters).toEqual({ queryId: 42 });
    expect(sql).toContain('p.query_id = @queryId');
    expectNoInterpolation(sql, ['42']);
  });

  it('buildQueryPlanQuery binds the query id', () => {
    const { sql, parameters } = buildQueryPlanQuery({ queryId: 7 });
    expect(parameters).toEqual({ queryId: 7 });
    expect(sql).toContain('@queryId');
    expect(sql).toContain('sys.query_store_plan');
  });
});

describe('query builders: defaults', () => {
  it('buildCpuIntensiveQueriesQuery defaults to 24 hours and top 15', () => {
    const { parameters } = buildCpuIntensiveQueriesQuery();
    expect(parameters).toEqual({ hours: 24, limit: 15 });
  });

  it('buildCpuIntensiveQueriesQuery honours explicit hours and limit', () => {
    const { sql, parameters } = buildCpuIntensiveQueriesQuery({ hours: 6, limit: 3 });
    expect(parameters).toEqual({ hours: 6, limit: 3 });
    expect(sql).toContain('@hours');
    expect(sql).toContain('@limit');
  });

  it('buildFailedQueriesQuery defaults to top 50', () => {
    const { parameters } = buildFailedQueriesQuery();
    expect(parameters).toEqual({ limit: 50 });
  });

  it('buildFailedQueriesQuery only selects the plan column when includePlan is set', () => {
    expect(buildFailedQueriesQuery({ includePlan: false }).sql).not.toContain('query_plan');
    expect(buildFailedQueriesQuery({ includePlan: true }).sql).toContain('query_plan');
  });

  it('buildFailedQueriesQuery filters on execution_type 3 (exception)', () => {
    expect(buildFailedQueriesQuery().sql).toContain('rs.execution_type = 3');
  });
});

describe('buildQueryStoreStateQuery', () => {
  it('reads actual_state_desc from the Query Store options view', () => {
    const { sql, parameters } = buildQueryStoreStateQuery();
    expect(parameters).toEqual({});
    expect(sql).toContain('sys.database_query_store_options');
    expect(sql).toContain('actual_state_desc');
  });
});

/** A QueryService stub whose executeQuery returns queued recordsets in order. */
const stubQueryService = (recordsets: unknown[][]) => {
  const executeQuery = vi.fn();
  for (const rows of recordsets) {
    executeQuery.mockResolvedValueOnce({ rows, columns: [], rowCount: rows.length });
  }
  return { executeQuery } as unknown as QueryService & { executeQuery: ReturnType<typeof vi.fn> };
};

const QS_ON = [{ actual_state_desc: 'READ_WRITE' }];

describe('PerformanceService Query Store gating', () => {
  let queryService: ReturnType<typeof stubQueryService>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks Query Store state before running the diagnostic query', async () => {
    queryService = stubQueryService([QS_ON, []]);
    const service = new PerformanceService(queryService);

    await service.getTopWaits('srv', 'db');

    expect(queryService.executeQuery).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = queryService.executeQuery.mock.calls;
    expect(firstCall[2]).toContain('sys.database_query_store_options');
    expect(secondCall[2]).toContain('sys.query_store_wait_stats');
  });

  it('accepts READ_ONLY as an enabled state', async () => {
    queryService = stubQueryService([[{ actual_state_desc: 'READ_ONLY' }], []]);
    const service = new PerformanceService(queryService);
    await expect(service.getTopWaits('srv', 'db')).resolves.toBeDefined();
  });

  it('throws an actionable error when Query Store is OFF, without running the diagnostic query', async () => {
    // Persistent (not `once`) so the gate answers OFF on every invocation below.
    const executeQuery = vi.fn().mockResolvedValue({ rows: [{ actual_state_desc: 'OFF' }], columns: [], rowCount: 1 });
    const service = new PerformanceService({ executeQuery } as unknown as QueryService);

    await expect(service.getTopWaits('srv', 'db')).rejects.toThrow(/Query Store is not enabled/i);
    expect(executeQuery).toHaveBeenCalledTimes(1);

    await expect(service.getTopWaits('srv', 'db')).rejects.toThrow(/ALTER DATABASE \[db\] SET QUERY_STORE = ON/);
  });

  it('throws an actionable error when the Query Store options view is unavailable', async () => {
    const executeQuery = vi.fn().mockRejectedValue(new Error("Invalid object name 'sys.database_query_store_options'."));
    const service = new PerformanceService({ executeQuery } as unknown as QueryService);

    await expect(service.getTopWaits('srv', 'db')).rejects.toThrow(/Query Store is not available/i);
  });

  it('reports the ERROR state distinctly from OFF', async () => {
    queryService = stubQueryService([[{ actual_state_desc: 'ERROR' }]]);
    const service = new PerformanceService(queryService);
    await expect(service.getTopWaits('srv', 'db')).rejects.toThrow(/ERROR state/i);
  });
});

describe('PerformanceService result shaping', () => {
  it('getTopWaits summarises distinct categories and the top one', async () => {
    const queryService = stubQueryService([
      QS_ON,
      [
        { query_sql_text: 'SELECT 1', wait_category_desc: 'Lock', total_wait_ms: 500, avg_wait_ms: 50 },
        { query_sql_text: 'SELECT 2', wait_category_desc: 'BufferIO', total_wait_ms: 100, avg_wait_ms: 10 },
        { query_sql_text: 'SELECT 3', wait_category_desc: 'Lock', total_wait_ms: 40, avg_wait_ms: 4 },
      ],
    ]);
    const service = new PerformanceService(queryService);

    const result = await service.getTopWaits('srv', 'db');

    expect(result.waits).toHaveLength(3);
    expect(result.summary).toEqual({ totalCategories: 2, topCategory: 'Lock' });
    expect(result.waits[0]).toEqual({
      querySqlText: 'SELECT 1',
      waitCategoryDesc: 'Lock',
      totalWaitMs: 500,
      avgWaitMs: 50,
    });
  });

  it('getTopWaits reports a null top category for an empty Query Store', async () => {
    const service = new PerformanceService(stubQueryService([QS_ON, []]));
    const result = await service.getTopWaits('srv', 'db');
    expect(result.summary).toEqual({ totalCategories: 0, topCategory: null });
  });

  it('getCpuIntensiveQueries totals CPU across rows', async () => {
    const queryService = stubQueryService([
      QS_ON,
      [
        { query_hash: '0xAA', total_cpu_ms: 1500.5, sampled_query_text: 'SELECT 1' },
        { query_hash: '0xBB', total_cpu_ms: 499.5, sampled_query_text: 'SELECT 2' },
      ],
    ]);
    const service = new PerformanceService(queryService);

    const result = await service.getCpuIntensiveQueries('srv', 'db');

    expect(result.summary).toEqual({ totalCpuMs: 2000, topQueryHash: '0xAA' });
    expect(result.queries).toHaveLength(2);
  });

  it('getFailedQueries omits queryPlan unless includePlan was requested', async () => {
    const row = { query_hash: '0xAA', query_sql_text: 'SELECT 1', query_plan: '<plan/>' };

    const withoutPlan = new PerformanceService(stubQueryService([QS_ON, [row]]));
    const bare = await withoutPlan.getFailedQueries('srv', 'db');
    expect(bare.queries[0].queryPlan).toBeUndefined();
    expect(bare.summary).toEqual({ total: 1 });

    const withPlan = new PerformanceService(stubQueryService([QS_ON, [row]]));
    const planned = await withPlan.getFailedQueries('srv', 'db', { includePlan: true });
    expect(planned.queries[0].queryPlan).toBe('<plan/>');
  });

  it('findQueryInStore passes the pattern through as a bound parameter', async () => {
    const queryService = stubQueryService([QS_ON, [{ query_id: 9, query_sql_text: 'SELECT 1' }]]);
    const service = new PerformanceService(queryService);

    const result = await service.findQueryInStore('srv', 'db', { queryPattern: '%Orders%' });

    expect(result.queries[0].queryId).toBe(9);
    const [, , , parameters] = queryService.executeQuery.mock.calls[1];
    expect(parameters).toEqual({ queryPattern: '%Orders%' });
  });

  it('getQueryPlan reports how many plans were found', async () => {
    const service = new PerformanceService(
      stubQueryService([QS_ON, [{ query_id: 3, plan_id: 1 }, { query_id: 3, plan_id: 2 }]])
    );
    const result = await service.getQueryPlan('srv', 'db', { queryId: 3 });
    expect(result.summary).toEqual({ total: 2 });
    expect(result.plans.map(p => p.planId)).toEqual([1, 2]);
  });

  it('getQueryWaitStats returns the per-interval breakdown for a query id', async () => {
    const queryService = stubQueryService([
      QS_ON,
      [{ wait_category_desc: 'Lock', avg_query_wait_time_ms: 12, total_query_wait_time_ms: 120 }],
    ]);
    const service = new PerformanceService(queryService);

    const result = await service.getQueryWaitStats('srv', 'db', { queryId: 11 });

    expect(result.waits).toHaveLength(1);
    expect(result.waits[0].waitCategoryDesc).toBe('Lock');
    const [, , , parameters] = queryService.executeQuery.mock.calls[1];
    expect(parameters).toEqual({ queryId: 11 });
  });

  it('passes the resolved server and database through to every query', async () => {
    const queryService = stubQueryService([QS_ON, []]);
    const service = new PerformanceService(queryService);

    await service.getTopWaits('prod-sql', 'AppDB');

    for (const call of queryService.executeQuery.mock.calls) {
      expect(call[0]).toBe('prod-sql');
      expect(call[1]).toBe('AppDB');
    }
  });
});
