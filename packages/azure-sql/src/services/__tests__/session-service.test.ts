import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SessionService,
  buildBlockingChainsQuery,
  buildExecutingRequestsQuery,
  buildLongRunningTransactionsQuery,
  buildDeadlockGraphsQuery,
  buildEngineEditionQuery,
} from '../session-service.js';
import type { QueryService } from '../query-service.js';

/** SERVERPROPERTY('EngineEdition'): 3 = Enterprise (on-prem), 5 = Azure SQL Database, 8 = Managed Instance. */
const ON_PREM = [{ engine_edition: 3 }];
const AZURE_SQL_DB = [{ engine_edition: 5 }];
const MANAGED_INSTANCE = [{ engine_edition: 8 }];

/** A QueryService stub whose executeQuery returns queued recordsets in order. */
const stubQueryService = (recordsets: unknown[][]) => {
  const executeQuery = vi.fn();
  for (const rows of recordsets) {
    executeQuery.mockResolvedValueOnce({ rows, columns: [], rowCount: rows.length });
  }
  return { executeQuery } as unknown as QueryService & { executeQuery: ReturnType<typeof vi.fn> };
};

describe('query builders: parameter binding', () => {
  it('buildBlockingChainsQuery takes no parameters and walks the blocking hierarchy', () => {
    const { sql, parameters } = buildBlockingChainsQuery();
    expect(parameters).toEqual({});
    expect(sql).toContain('sys.dm_exec_sessions');
    expect(sql).toContain('sys.dm_exec_requests');
    expect(sql).toContain('cteBlockingHierarchy');
  });

  it('buildLongRunningTransactionsQuery binds the threshold instead of interpolating it', () => {
    const { sql, parameters } = buildLongRunningTransactionsQuery({ thresholdSeconds: 90 });
    expect(parameters).toEqual({ thresholdSeconds: 90 });
    expect(sql).toContain('@thresholdSeconds');
    expect(sql).not.toContain('90');
  });

  it('buildLongRunningTransactionsQuery defaults to a 30 second threshold', () => {
    expect(buildLongRunningTransactionsQuery().parameters).toEqual({ thresholdSeconds: 30 });
  });

  it('buildLongRunningTransactionsQuery reads the transaction DMVs, not Query Store', () => {
    const { sql } = buildLongRunningTransactionsQuery();
    expect(sql).toContain('sys.dm_tran_active_transactions');
    expect(sql).not.toContain('query_store');
  });
});

describe('buildExecutingRequestsQuery', () => {
  it('takes no bound parameters', () => {
    expect(buildExecutingRequestsQuery().parameters).toEqual({});
  });

  it('only selects plan columns when includePlan is set', () => {
    expect(buildExecutingRequestsQuery({ includePlan: false }).sql).not.toContain('query_plan');
    const withPlan = buildExecutingRequestsQuery({ includePlan: true }).sql;
    expect(withPlan).toContain('sys.dm_exec_query_plan');
    expect(withPlan).toContain('sys.dm_exec_query_statistics_xml');
  });
});

/**
 * The single most important behaviour of this service: it reads DMVs, not Query Store.
 * Gating these tools on Query Store (as PerformanceService does) would make them fail
 * on a perfectly healthy database.
 */
describe('SessionService does not gate on Query Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues exactly one query per call, with no Query Store state probe', async () => {
    const queryService = stubQueryService([[]]);
    const service = new SessionService(queryService);

    await service.getBlockingChains('srv', 'db');

    expect(queryService.executeQuery).toHaveBeenCalledTimes(1);
    expect(queryService.executeQuery.mock.calls[0][2]).not.toContain('database_query_store_options');
  });

  it('returns an empty, non-error result when nothing is blocking', async () => {
    const service = new SessionService(stubQueryService([[]]));
    const result = await service.getBlockingChains('srv', 'db');
    expect(result.chains).toEqual([]);
    expect(result.summary).toEqual({ totalBlocked: 0, headBlockers: 0 });
  });
});

describe('SessionService result shaping', () => {
  it('getBlockingChains counts head blockers and blocked sessions by level', async () => {
    const queryService = stubQueryService([
      [
        { head_blocker_session_id: 51, session_id: 51, Level: 0, wait_duration_ms: 0 },
        { head_blocker_session_id: 51, session_id: 52, Level: 1, wait_duration_ms: 900 },
        { head_blocker_session_id: 51, session_id: 53, Level: 2, wait_duration_ms: 400 },
      ],
    ]);
    const service = new SessionService(queryService);

    const result = await service.getBlockingChains('srv', 'db');

    expect(result.chains).toHaveLength(3);
    expect(result.summary).toEqual({ totalBlocked: 2, headBlockers: 1 });
    expect(result.chains[1].sessionId).toBe(52);
    expect(result.chains[1].level).toBe(1);
  });

  it('getExecutingRequests totals CPU across requests', async () => {
    const queryService = stubQueryService([
      [
        { session_id: 51, cpu_time_ms: 1500, statement_text: 'SELECT 1' },
        { session_id: 52, cpu_time_ms: 500, statement_text: 'SELECT 2' },
      ],
    ]);
    const service = new SessionService(queryService);

    const result = await service.getExecutingRequests('srv', 'db');

    expect(result.summary).toEqual({ total: 2, totalCpuMs: 2000 });
  });

  it('getExecutingRequests omits queryPlan unless includePlan was requested', async () => {
    const row = { session_id: 51, query_plan: '<plan/>' };

    const bare = await new SessionService(stubQueryService([[row]])).getExecutingRequests('srv', 'db');
    expect(bare.requests[0].queryPlan).toBeUndefined();

    const planned = await new SessionService(stubQueryService([[row]])).getExecutingRequests('srv', 'db', {
      includePlan: true,
    });
    expect(planned.requests[0].queryPlan).toBe('<plan/>');
  });

  it('getExecutingRequests prefers the compiled plan, falling back to in-flight statistics', async () => {
    const both = stubQueryService([
      [{ session_id: 51, query_plan: '<compiled/>', query_plan_with_in_flight_statistics: '<live/>' }],
    ]);
    const preferred = await new SessionService(both).getExecutingRequests('srv', 'db', { includePlan: true });
    expect(preferred.requests[0].queryPlan).toBe('<compiled/>');

    // dm_exec_query_plan returns NULL for some requests; dm_exec_query_statistics_xml still has the live plan.
    const liveOnly = stubQueryService([
      [{ session_id: 51, query_plan: null, query_plan_with_in_flight_statistics: '<live/>' }],
    ]);
    const fallback = await new SessionService(liveOnly).getExecutingRequests('srv', 'db', { includePlan: true });
    expect(fallback.requests[0].queryPlan).toBe('<live/>');
  });

  it('getLongRunningTransactions summarises the worst duration and total log usage', async () => {
    const queryService = stubQueryService([
      [
        { transaction_id: 1, session_id: 51, duration_seconds: 120, log_used_bytes: 4096 },
        { transaction_id: 2, session_id: 52, duration_seconds: 45, log_used_bytes: 1024 },
      ],
    ]);
    const service = new SessionService(queryService);

    const result = await service.getLongRunningTransactions('srv', 'db');

    expect(result.summary).toEqual({ total: 2, maxDurationSeconds: 120, totalLogUsedBytes: 5120 });
  });

  it('getLongRunningTransactions binds the caller threshold', async () => {
    const queryService = stubQueryService([[]]);
    const service = new SessionService(queryService);

    await service.getLongRunningTransactions('srv', 'db', { thresholdSeconds: 300 });

    const [, , , parameters] = queryService.executeQuery.mock.calls[0];
    expect(parameters).toEqual({ thresholdSeconds: 300 });
  });

  it('passes the resolved server and database through to every query', async () => {
    const queryService = stubQueryService([[]]);
    const service = new SessionService(queryService);

    await service.getExecutingRequests('prod-sql', 'AppDB');

    const [serverId, database] = queryService.executeQuery.mock.calls[0];
    expect(serverId).toBe('prod-sql');
    expect(database).toBe('AppDB');
  });
});

describe('buildDeadlockGraphsQuery', () => {
  it('binds the limit instead of interpolating it', () => {
    const { sql, parameters } = buildDeadlockGraphsQuery({ limit: 5 });
    expect(parameters).toEqual({ limit: 5 });
    expect(sql).toContain('TOP (@limit)');
  });

  it('defaults to the 20 most recent deadlocks', () => {
    expect(buildDeadlockGraphsQuery().parameters).toEqual({ limit: 20 });
  });

  it('reads the on-prem system_health ring buffer', () => {
    const { sql } = buildDeadlockGraphsQuery();
    expect(sql).toContain('sys.dm_xe_session_targets');
    expect(sql).toContain("s.name = 'system_health'");
    expect(sql).toContain('xml_deadlock_report');
  });
});

describe('buildEngineEditionQuery', () => {
  it('reads EngineEdition via SERVERPROPERTY', () => {
    const { sql, parameters } = buildEngineEditionQuery();
    expect(parameters).toEqual({});
    expect(sql).toContain("SERVERPROPERTY('EngineEdition')");
  });
});

/**
 * Azure SQL Database has no default-running system_health session, and its server-scoped
 * XEvent DMVs do not exist. The tool must say so rather than emit a confusing
 * "Invalid object name" or silently return nothing.
 */
describe('SessionService deadlock graphs engine gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('probes the engine edition before reading the ring buffer', async () => {
    const queryService = stubQueryService([ON_PREM, []]);
    const service = new SessionService(queryService);

    await service.getDeadlockGraphs('srv', 'db');

    expect(queryService.executeQuery).toHaveBeenCalledTimes(2);
    const [first, second] = queryService.executeQuery.mock.calls;
    expect(first[2]).toContain('SERVERPROPERTY');
    expect(second[2]).toContain('system_health');
  });

  it('refuses on Azure SQL Database without running the ring-buffer query', async () => {
    const executeQuery = vi.fn().mockResolvedValue({ rows: AZURE_SQL_DB, columns: [], rowCount: 1 });
    const service = new SessionService({ executeQuery } as unknown as QueryService);

    await expect(service.getDeadlockGraphs('srv', 'db')).rejects.toThrow(/not available on Azure SQL Database/i);
    expect(executeQuery).toHaveBeenCalledTimes(1);
  });

  it('tells the caller how to capture deadlocks on Azure SQL Database', async () => {
    const executeQuery = vi.fn().mockResolvedValue({ rows: AZURE_SQL_DB, columns: [], rowCount: 1 });
    const service = new SessionService({ executeQuery } as unknown as QueryService);

    await expect(service.getDeadlockGraphs('srv', 'db')).rejects.toThrow(/database_xml_deadlock_report/);
  });

  it('allows Managed Instance, which does run system_health', async () => {
    const service = new SessionService(stubQueryService([MANAGED_INSTANCE, []]));
    await expect(service.getDeadlockGraphs('srv', 'db')).resolves.toBeDefined();
  });
});

describe('SessionService deadlock graph parsing', () => {
  const DEADLOCK_XML =
    '<deadlock><victim-list><victimProcess id="process1"/></victim-list>' +
    '<process-list><process id="process1" waitresource="KEY: 5:123" waittype="LCK_M_U"/>' +
    '<process id="process2" waittype="LCK_M_X"/></process-list>' +
    '<resource-list><keylock objectname="dbo.Orders"/><pagelock objectname="dbo.Orders"/></resource-list></deadlock>';

  it('summarises timestamps newest-first and extracts victim, waits and objects', async () => {
    const queryService = stubQueryService([
      ON_PREM,
      [
        { event_timestamp: '2026-07-10T09:00:00Z', deadlock_xml: DEADLOCK_XML },
        { event_timestamp: '2026-07-09T09:00:00Z', deadlock_xml: DEADLOCK_XML },
      ],
    ]);
    const service = new SessionService(queryService);

    const result = await service.getDeadlockGraphs('srv', 'db');

    expect(result.summary).toEqual({
      total: 2,
      earliestTimestamp: '2026-07-09T09:00:00Z',
      latestTimestamp: '2026-07-10T09:00:00Z',
    });

    const [first] = result.deadlocks;
    expect(first.victimProcess).toBe('process1');
    expect(first.processCount).toBe(2);
    expect(first.waitTypes).toEqual(['LCK_M_U', 'LCK_M_X']);
    expect(first.objectNames).toEqual(['dbo.Orders']);
  });

  it('reports empty summary timestamps when no deadlocks were captured', async () => {
    const service = new SessionService(stubQueryService([ON_PREM, []]));
    const result = await service.getDeadlockGraphs('srv', 'db');
    expect(result.summary).toEqual({ total: 0, earliestTimestamp: null, latestTimestamp: null });
  });

  it('binds the caller limit', async () => {
    const queryService = stubQueryService([ON_PREM, []]);
    await new SessionService(queryService).getDeadlockGraphs('srv', 'db', { limit: 3 });

    const [, , , parameters] = queryService.executeQuery.mock.calls[1];
    expect(parameters).toEqual({ limit: 3 });
  });
});
