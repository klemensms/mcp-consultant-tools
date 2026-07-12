import type { QueryService } from './query-service.js';

export interface QueryWaitStat {
  querySqlText: string;
  waitCategoryDesc: string;
  totalWaitMs: number;
  avgWaitMs: number;
}

export interface QueryStoreEntry {
  queryId: number;
  querySqlText: string;
  avgDuration: number;
  avgCpuTime: number;
  countExecutions: number;
}

export interface QueryWaitDetail {
  waitCategoryDesc: string;
  avgQueryWaitTimeMs: number;
  totalQueryWaitTimeMs: number;
  maxQueryWaitTimeMs: number;
  stdevQueryWaitTimeMs: number;
  startTime: string;
  endTime: string;
}

export interface CpuIntensiveQuery {
  queryHash: string;
  totalCpuMs: number;
  avgCpuMs: number;
  maxCpuMs: number;
  maxLogicalReads: number;
  numberOfDistinctPlans: number;
  numberOfDistinctQueryIds: number;
  abortedExecutionCount: number;
  regularExecutionCount: number;
  exceptionExecutionCount: number;
  totalExecutions: number;
  sampledQueryText: string;
}

export interface FailedQuery {
  queryHash: string;
  querySqlText: string;
  executionType: number;
  executionTypeDesc: string;
  countExecutions: number;
  lastExecutionTime: string;
  avgDurationSeconds: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  lastDurationSeconds: number;
  queryPlan?: string;
}

export interface QueryPlanResult {
  queryId: number;
  planId: number;
  querySqlText: string;
  queryPlanXml: string;
  engineVersion: string;
}

/** A SQL statement plus the parameters to bind to it. Never interpolate caller input into `sql`. */
export interface BuiltQuery {
  sql: string;
  parameters: Record<string, unknown>;
}

const CPU_INTENSIVE_DEFAULT_HOURS = 24;
const CPU_INTENSIVE_DEFAULT_LIMIT = 15;
const FAILED_QUERIES_DEFAULT_LIMIT = 50;

/** Query Store states in which the `sys.query_store_*` views can be read. */
const READABLE_QUERY_STORE_STATES = ['READ_ONLY', 'READ_WRITE'];

export function buildQueryStoreStateQuery(): BuiltQuery {
  return {
    sql: `SELECT actual_state_desc FROM sys.database_query_store_options;`,
    parameters: {},
  };
}

export function buildTopWaitsQuery(): BuiltQuery {
  return {
    sql: `
SELECT TOP 20
  MIN(SUBSTRING(qt.query_sql_text, 1, 200)) AS query_sql_text,
  ws.wait_category_desc,
  SUM(ws.total_query_wait_time_ms) AS total_wait_ms,
  AVG(ws.avg_query_wait_time_ms) AS avg_wait_ms
FROM sys.query_store_wait_stats ws
JOIN sys.query_store_runtime_stats_interval rsi
  ON ws.runtime_stats_interval_id = rsi.runtime_stats_interval_id
JOIN sys.query_store_plan p ON ws.plan_id = p.plan_id
JOIN sys.query_store_query q ON p.query_id = q.query_id
JOIN sys.query_store_query_text qt ON q.query_text_id = qt.query_text_id
WHERE rsi.start_time >= DATEADD(DAY, -7, GETUTCDATE())
GROUP BY q.query_hash, ws.wait_category_desc
ORDER BY total_wait_ms DESC;
`,
    parameters: {},
  };
}

export function buildFindQueryInStoreQuery(options: { queryPattern: string }): BuiltQuery {
  return {
    sql: `
SELECT q.query_id, qt.query_sql_text,
  rs.avg_duration, rs.avg_cpu_time,
  rs.count_executions
FROM sys.query_store_query_text qt
JOIN sys.query_store_query q ON qt.query_text_id = q.query_text_id
JOIN sys.query_store_plan p ON q.query_id = p.query_id
JOIN sys.query_store_runtime_stats rs ON p.plan_id = rs.plan_id
WHERE qt.query_sql_text LIKE '%' + @queryPattern + '%'
ORDER BY rs.last_execution_time DESC;
`,
    parameters: { queryPattern: options.queryPattern },
  };
}

export function buildQueryWaitStatsQuery(options: { queryId: number }): BuiltQuery {
  return {
    sql: `
SELECT
  ws.wait_category_desc,
  ws.avg_query_wait_time_ms,
  ws.total_query_wait_time_ms,
  ws.max_query_wait_time_ms,
  ws.stdev_query_wait_time_ms,
  rst.start_time,
  rst.end_time
FROM sys.query_store_wait_stats ws
JOIN sys.query_store_plan p ON ws.plan_id = p.plan_id
JOIN sys.query_store_runtime_stats_interval rst
  ON ws.runtime_stats_interval_id = rst.runtime_stats_interval_id
WHERE p.query_id = @queryId
ORDER BY rst.start_time DESC;
`,
    parameters: { queryId: options.queryId },
  };
}

export function buildCpuIntensiveQueriesQuery(options?: { hours?: number; limit?: number }): BuiltQuery {
  return {
    sql: `
WITH AggregatedCPU AS
  (SELECT
    q.query_hash,
    SUM(count_executions * avg_cpu_time / 1000.0) AS total_cpu_ms,
    SUM(count_executions * avg_cpu_time / 1000.0) / SUM(count_executions) AS avg_cpu_ms,
    MAX(rs.max_cpu_time / 1000.00) AS max_cpu_ms,
    MAX(max_logical_io_reads) AS max_logical_reads,
    COUNT(DISTINCT p.plan_id) AS number_of_distinct_plans,
    COUNT(DISTINCT p.query_id) AS number_of_distinct_query_ids,
    SUM(CASE WHEN rs.execution_type_desc='Aborted' THEN count_executions ELSE 0 END) AS aborted_execution_count,
    SUM(CASE WHEN rs.execution_type_desc='Regular' THEN count_executions ELSE 0 END) AS regular_execution_count,
    SUM(CASE WHEN rs.execution_type_desc='Exception' THEN count_executions ELSE 0 END) AS exception_execution_count,
    SUM(count_executions) AS total_executions,
    MIN(qt.query_sql_text) AS sampled_query_text
   FROM sys.query_store_query_text AS qt
   JOIN sys.query_store_query AS q ON qt.query_text_id = q.query_text_id
   JOIN sys.query_store_plan AS p ON q.query_id = p.query_id
   JOIN sys.query_store_runtime_stats AS rs ON rs.plan_id = p.plan_id
   JOIN sys.query_store_runtime_stats_interval AS rsi ON rsi.runtime_stats_interval_id = rs.runtime_stats_interval_id
   WHERE
    rs.execution_type_desc IN ('Regular', 'Aborted', 'Exception') AND
    rsi.start_time >= DATEADD(HOUR, -@hours, GETUTCDATE())
   GROUP BY q.query_hash),
OrderedCPU AS
   (SELECT *,
    ROW_NUMBER() OVER (ORDER BY total_cpu_ms DESC, query_hash ASC) AS RN
    FROM AggregatedCPU)
SELECT *
FROM OrderedCPU AS OD
WHERE OD.RN <= @limit
ORDER BY total_cpu_ms DESC;
`,
    parameters: {
      hours: options?.hours ?? CPU_INTENSIVE_DEFAULT_HOURS,
      limit: options?.limit ?? CPU_INTENSIVE_DEFAULT_LIMIT,
    },
  };
}

export function buildFailedQueriesQuery(options?: { includePlan?: boolean; limit?: number }): BuiltQuery {
  const planColumn = options?.includePlan ? 'cast(p.query_plan as xml) AS query_plan,' : '';
  return {
    sql: `
SELECT TOP (@limit)
  q.query_hash,
  qt.query_sql_text,
  ${planColumn}
  rs.execution_type,
  rs.execution_type_desc,
  rs.count_executions,
  rs.last_execution_time,
  (rs.avg_duration / 1000000.0) AS avg_duration_seconds,
  (rs.min_duration / 1000000.0) AS min_duration_seconds,
  (rs.max_duration / 1000000.0) AS max_duration_seconds,
  (rs.last_duration / 1000000.0) AS last_duration_seconds
FROM sys.query_store_query AS q
JOIN sys.query_store_plan AS p ON q.query_id = p.query_id
JOIN sys.query_store_query_text AS qt ON q.query_text_id = qt.query_text_id
JOIN sys.query_store_runtime_stats rs ON p.plan_id = rs.plan_id
WHERE rs.execution_type = 3
ORDER BY rs.last_execution_time DESC;
`,
    parameters: { limit: options?.limit ?? FAILED_QUERIES_DEFAULT_LIMIT },
  };
}

export function buildQueryPlanQuery(options: { queryId: number }): BuiltQuery {
  return {
    sql: `
SELECT
  p.query_id,
  p.plan_id,
  qt.query_sql_text,
  cast(p.query_plan as xml) AS query_plan_xml,
  p.engine_version
FROM sys.query_store_plan AS p
JOIN sys.query_store_query AS q ON p.query_id = q.query_id
JOIN sys.query_store_query_text AS qt ON q.query_text_id = qt.query_text_id
WHERE p.query_id = @queryId
ORDER BY p.last_execution_time DESC;
`,
    parameters: { queryId: options.queryId },
  };
}

type Row = Record<string, unknown>;

const str = (row: Row, key: string): string => String(row[key] ?? '');
const num = (row: Row, key: string): number => Number(row[key] ?? 0);

/**
 * PerformanceService exposes Query Store diagnostics: waits, CPU, failures and plans.
 *
 * Every method gates on Query Store being enabled first. Without that gate the
 * `sys.query_store_*` views still resolve when Query Store is OFF and simply return
 * no rows, which reads as "the database is healthy" rather than "diagnostics are
 * unavailable". The gate costs one extra round-trip per call.
 *
 * Depends on QueryService rather than ConnectionService so that connection pooling,
 * row/response-size limits, PII redaction and error sanitisation all apply unchanged.
 */
export class PerformanceService {
  constructor(private readonly queryService: QueryService) {}

  async getTopWaits(
    serverId: string,
    database: string
  ): Promise<{ waits: QueryWaitStat[]; summary: { totalCategories: number; topCategory: string | null } }> {
    await this.assertQueryStoreEnabled(serverId, database);
    const rows = await this.run(serverId, database, buildTopWaitsQuery());

    const waits: QueryWaitStat[] = rows.map(row => ({
      querySqlText: str(row, 'query_sql_text'),
      waitCategoryDesc: str(row, 'wait_category_desc'),
      totalWaitMs: num(row, 'total_wait_ms'),
      avgWaitMs: num(row, 'avg_wait_ms'),
    }));

    return {
      waits,
      summary: {
        totalCategories: new Set(waits.map(w => w.waitCategoryDesc)).size,
        topCategory: waits.length > 0 ? waits[0].waitCategoryDesc : null,
      },
    };
  }

  async findQueryInStore(
    serverId: string,
    database: string,
    options: { queryPattern: string }
  ): Promise<{ queries: QueryStoreEntry[] }> {
    await this.assertQueryStoreEnabled(serverId, database);
    const rows = await this.run(serverId, database, buildFindQueryInStoreQuery(options));

    return {
      queries: rows.map(row => ({
        queryId: num(row, 'query_id'),
        querySqlText: str(row, 'query_sql_text'),
        avgDuration: num(row, 'avg_duration'),
        avgCpuTime: num(row, 'avg_cpu_time'),
        countExecutions: num(row, 'count_executions'),
      })),
    };
  }

  async getQueryWaitStats(
    serverId: string,
    database: string,
    options: { queryId: number }
  ): Promise<{ waits: QueryWaitDetail[] }> {
    await this.assertQueryStoreEnabled(serverId, database);
    const rows = await this.run(serverId, database, buildQueryWaitStatsQuery(options));

    return {
      waits: rows.map(row => ({
        waitCategoryDesc: str(row, 'wait_category_desc'),
        avgQueryWaitTimeMs: num(row, 'avg_query_wait_time_ms'),
        totalQueryWaitTimeMs: num(row, 'total_query_wait_time_ms'),
        maxQueryWaitTimeMs: num(row, 'max_query_wait_time_ms'),
        stdevQueryWaitTimeMs: num(row, 'stdev_query_wait_time_ms'),
        startTime: str(row, 'start_time'),
        endTime: str(row, 'end_time'),
      })),
    };
  }

  async getCpuIntensiveQueries(
    serverId: string,
    database: string,
    options?: { hours?: number; limit?: number }
  ): Promise<{ queries: CpuIntensiveQuery[]; summary: { totalCpuMs: number; topQueryHash: string | null } }> {
    await this.assertQueryStoreEnabled(serverId, database);
    const rows = await this.run(serverId, database, buildCpuIntensiveQueriesQuery(options));

    const queries: CpuIntensiveQuery[] = rows.map(row => ({
      queryHash: str(row, 'query_hash'),
      totalCpuMs: num(row, 'total_cpu_ms'),
      avgCpuMs: num(row, 'avg_cpu_ms'),
      maxCpuMs: num(row, 'max_cpu_ms'),
      maxLogicalReads: num(row, 'max_logical_reads'),
      numberOfDistinctPlans: num(row, 'number_of_distinct_plans'),
      numberOfDistinctQueryIds: num(row, 'number_of_distinct_query_ids'),
      abortedExecutionCount: num(row, 'aborted_execution_count'),
      regularExecutionCount: num(row, 'regular_execution_count'),
      exceptionExecutionCount: num(row, 'exception_execution_count'),
      totalExecutions: num(row, 'total_executions'),
      sampledQueryText: str(row, 'sampled_query_text'),
    }));

    return {
      queries,
      summary: {
        totalCpuMs: queries.reduce((sum, q) => sum + q.totalCpuMs, 0),
        topQueryHash: queries.length > 0 ? queries[0].queryHash : null,
      },
    };
  }

  async getFailedQueries(
    serverId: string,
    database: string,
    options?: { includePlan?: boolean; limit?: number }
  ): Promise<{ queries: FailedQuery[]; summary: { total: number } }> {
    await this.assertQueryStoreEnabled(serverId, database);
    const rows = await this.run(serverId, database, buildFailedQueriesQuery(options));

    const queries: FailedQuery[] = rows.map(row => {
      const query: FailedQuery = {
        queryHash: str(row, 'query_hash'),
        querySqlText: str(row, 'query_sql_text'),
        executionType: num(row, 'execution_type'),
        executionTypeDesc: str(row, 'execution_type_desc'),
        countExecutions: num(row, 'count_executions'),
        lastExecutionTime: str(row, 'last_execution_time'),
        avgDurationSeconds: num(row, 'avg_duration_seconds'),
        minDurationSeconds: num(row, 'min_duration_seconds'),
        maxDurationSeconds: num(row, 'max_duration_seconds'),
        lastDurationSeconds: num(row, 'last_duration_seconds'),
      };
      if (options?.includePlan && row['query_plan']) {
        query.queryPlan = String(row['query_plan']);
      }
      return query;
    });

    return { queries, summary: { total: queries.length } };
  }

  async getQueryPlan(
    serverId: string,
    database: string,
    options: { queryId: number }
  ): Promise<{ plans: QueryPlanResult[]; summary: { total: number } }> {
    await this.assertQueryStoreEnabled(serverId, database);
    const rows = await this.run(serverId, database, buildQueryPlanQuery(options));

    const plans: QueryPlanResult[] = rows.map(row => ({
      queryId: num(row, 'query_id'),
      planId: num(row, 'plan_id'),
      querySqlText: str(row, 'query_sql_text'),
      queryPlanXml: str(row, 'query_plan_xml'),
      engineVersion: str(row, 'engine_version'),
    }));

    return { plans, summary: { total: plans.length } };
  }

  private async run(serverId: string, database: string, built: BuiltQuery): Promise<Row[]> {
    const result = await this.queryService.executeQuery<Row>(serverId, database, built.sql, built.parameters);
    return result.rows;
  }

  /**
   * Fail loudly when Query Store cannot serve diagnostics, rather than returning
   * the empty result set the views produce when it is switched off.
   */
  private async assertQueryStoreEnabled(serverId: string, database: string): Promise<void> {
    let state: string;
    try {
      const rows = await this.run(serverId, database, buildQueryStoreStateQuery());
      if (rows.length === 0) {
        throw new Error(this.queryStoreUnavailableMessage(database));
      }
      state = str(rows[0], 'actual_state_desc').toUpperCase();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Invalid object name') || message.includes('database_query_store_options')) {
        throw new Error(this.queryStoreUnavailableMessage(database));
      }
      throw error;
    }

    if (state === 'ERROR') {
      throw new Error(
        `Query Store on database '${database}' is in ERROR state, so diagnostics cannot be read. ` +
        `Inspect sys.database_query_store_options, then recover with: ` +
        `ALTER DATABASE [${database}] SET QUERY_STORE CLEAR; ALTER DATABASE [${database}] SET QUERY_STORE = ON;`
      );
    }

    if (!READABLE_QUERY_STORE_STATES.includes(state)) {
      throw new Error(
        `Query Store is not enabled on database '${database}' (state: ${state || 'unknown'}), ` +
        `so no performance diagnostics are available. Enable it with: ` +
        `ALTER DATABASE [${database}] SET QUERY_STORE = ON (QUERY_CAPTURE_MODE = AUTO); ` +
        `then allow time for query data to accumulate before retrying.`
      );
    }
  }

  private queryStoreUnavailableMessage(database: string): string {
    return (
      `Query Store is not available on database '${database}'. ` +
      `The sys.database_query_store_options view could not be read — the database may be a system database, ` +
      `may predate SQL Server 2016, or the login may lack VIEW DATABASE STATE permission.`
    );
  }
}
