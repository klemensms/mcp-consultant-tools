import type { QueryService } from './query-service.js';
import type { BuiltQuery } from './performance-service.js';

export interface BlockingChainEntry {
  headBlockerSessionId: number;
  sessionId: number;
  blockingSessionId: number;
  waitType: string;
  waitDurationMs: number;
  waitResource: string;
  level: number;
  blockerQuery: string;
}

export interface ExecutingRequest {
  sessionId: number;
  status: string;
  startTime: string;
  cpuTimeMs: number;
  logicalReads: number;
  dop: number;
  loginName: string;
  hostName: string;
  programName: string;
  objectName: string;
  statementText: string;
  queryPlan?: string;
}

export interface DeadlockEvent {
  eventTimestamp: string;
  deadlockXml: string;
  victimProcess: string;
  deadlockResources: string[];
  waitTypes: string[];
  objectNames: string[];
  processCount: number;
}

export interface LongRunningTransaction {
  transactionId: number;
  sessionId: number;
  transactionBeginTime: string;
  durationSeconds: number;
  transactionType: string;
  transactionState: string;
  loginName: string;
  hostName: string;
  programName: string;
  isolationLevel: string;
  logUsedBytes: number;
  currentStatementText: string;
  openResultSets: number;
}

const LONG_RUNNING_DEFAULT_THRESHOLD_SECONDS = 30;
const DEADLOCK_GRAPHS_DEFAULT_LIMIT = 20;

/** SERVERPROPERTY('EngineEdition') value for Azure SQL Database (as opposed to 8 = Managed Instance). */
const AZURE_SQL_DATABASE_ENGINE_EDITION = 5;

export function buildEngineEditionQuery(): BuiltQuery {
  return {
    sql: `SELECT CAST(SERVERPROPERTY('EngineEdition') AS INT) AS engine_edition;`,
    parameters: {},
  };
}

export function buildDeadlockGraphsQuery(options?: { limit?: number }): BuiltQuery {
  return {
    sql: `
WITH deadlock_xml AS (
  SELECT
    xdr.value('@timestamp', 'datetime2') AS event_timestamp,
    xdr.query('.') AS deadlock_graph
  FROM (
    SELECT CAST(target_data AS xml) AS target_data
    FROM sys.dm_xe_session_targets st
    JOIN sys.dm_xe_sessions s ON s.address = st.event_session_address
    WHERE s.name = 'system_health'
      AND st.target_name = 'ring_buffer'
  ) AS data
  CROSS APPLY target_data.nodes('RingBufferTarget/event[@name="xml_deadlock_report"]') AS xd(xdr)
)
SELECT TOP (@limit)
  event_timestamp,
  CAST(deadlock_graph AS NVARCHAR(MAX)) AS deadlock_xml
FROM deadlock_xml
ORDER BY event_timestamp DESC;
`,
    parameters: { limit: options?.limit ?? DEADLOCK_GRAPHS_DEFAULT_LIMIT },
  };
}

export function buildBlockingChainsQuery(): BuiltQuery {
  return {
    sql: `
WITH cteHead (session_id,request_id,wait_type,wait_resource,last_wait_type,
 is_user_process,request_cpu_time,request_logical_reads,request_reads,
 request_writes,wait_time,blocking_session_id,memory_usage,
 session_cpu_time,session_reads, session_writes,session_logical_reads,
 percent_complete,est_completion_time,request_start_time,request_status,
 command,plan_handle,sql_handle, statement_start_offset,statement_end_offset,
 most_recent_sql_handle,session_status,group_id, query_hash,query_plan_hash)
AS
(SELECT sess.session_id, req.request_id,
  LEFT (ISNULL (req.wait_type, ''), 50) AS 'wait_type',
  LEFT (ISNULL (req.wait_resource, ''), 40) AS 'wait_resource',
  LEFT (req.last_wait_type, 50) AS 'last_wait_type',sess.is_user_process,
  req.cpu_time AS 'request_cpu_time',
  req.logical_reads AS 'request_logical_reads',
  req.reads AS 'request_reads',req.writes AS 'request_writes',
  req.wait_time,req.blocking_session_id,sess.memory_usage,
  sess.cpu_time AS 'session_cpu_time',sess.reads AS 'session_reads',
  sess.writes AS 'session_writes',
  sess.logical_reads AS 'session_logical_reads',
  CONVERT (decimal(5,2), req.percent_complete) AS 'percent_complete',
  req.estimated_completion_time AS 'est_completion_time',
  req.start_time AS 'request_start_time',
  LEFT (req.status, 15) AS 'request_status', req.command, req.plan_handle,
  req.[sql_handle], req.statement_start_offset, req.statement_end_offset,
  conn.most_recent_sql_handle,
  LEFT (sess.status, 15) AS 'session_status', sess.group_id,
  req.query_hash, req.query_plan_hash
 FROM sys.dm_exec_sessions AS sess
 LEFT OUTER JOIN
  sys.dm_exec_requests AS req ON sess.session_id = req.session_id
 LEFT OUTER JOIN
  sys.dm_exec_connections AS conn on conn.session_id = sess.session_id
 ),
cteBlockingHierarchy
 (head_blocker_session_id,session_id,blocking_session_id,wait_type,
  wait_duration_ms,wait_resource,statement_start_offset,statement_end_offset,
  plan_handle,sql_handle,most_recent_sql_handle,[Level])
AS (SELECT head.session_id AS head_blocker_session_id,
     head.session_id AS session_id,head.blocking_session_id,head.wait_type,
     head.wait_time,head.wait_resource,head.statement_start_offset,
     head.statement_end_offset,head.plan_handle,
     head.sql_handle,head.most_recent_sql_handle, 0 AS [Level]
    FROM cteHead AS head
    WHERE (head.blocking_session_id IS NULL OR head.blocking_session_id = 0)
    AND head.session_id IN
     (SELECT DISTINCT blocking_session_id
       FROM cteHead WHERE blocking_session_id != 0)
    UNION ALL
    SELECT h.head_blocker_session_id,blocked.session_id,
     blocked.blocking_session_id, blocked.wait_type,blocked.wait_time,
     blocked.wait_resource,h.statement_start_offset,h.statement_end_offset,
     h.plan_handle,h.sql_handle,h.most_recent_sql_handle,[Level] + 1
    FROM cteHead AS blocked
    INNER JOIN cteBlockingHierarchy AS h
     ON h.session_id = blocked.blocking_session_id
    and h.session_id!=blocked.session_id
    WHERE h.wait_type COLLATE Latin1_General_BIN
     NOT IN('EXCHANGE','CXPACKET') or h.wait_type is null
    )
SELECT bh.*, txt.text AS blocker_query_or_most_recent_query
FROM cteBlockingHierarchy AS bh
OUTER APPLY sys.dm_exec_sql_text
 (ISNULL ([sql_handle],most_recent_sql_handle)) AS txt
ORDER BY bh.wait_duration_ms DESC;
`,
    parameters: {},
  };
}

export function buildExecutingRequestsQuery(options?: { includePlan?: boolean }): BuiltQuery {
  const planColumns = options?.includePlan
    ? ',\nqp.query_plan,qsx.query_plan as query_plan_with_in_flight_statistics'
    : '';
  const planApply = options?.includePlan
    ? `
OUTER APPLY sys.dm_exec_query_plan(req.plan_handle) as qp
OUTER APPLY sys.dm_exec_query_statistics_xml(req.session_id) as qsx`
    : '';

  return {
    sql: `
SELECT req.session_id, req.status, req.start_time, req.cpu_time AS 'cpu_time_ms',
req.logical_reads,req.dop,s.login_name,s.host_name,s.program_name,
object_name(st.objectid,st.dbid) 'ObjectName',
REPLACE (REPLACE (SUBSTRING (st.text,(req.statement_start_offset/2) + 1,
 ((CASE req.statement_end_offset WHEN -1 THEN DATALENGTH(st.text)
   ELSE req.statement_end_offset END - req.statement_start_offset)/2) + 1),
   CHAR(10), ' '), CHAR(13), ' ') AS statement_text${planColumns}
FROM sys.dm_exec_requests as req
JOIN sys.dm_exec_sessions as s on req.session_id=s.session_id
CROSS APPLY sys.dm_exec_sql_text(req.sql_handle) as st${planApply}
ORDER BY req.cpu_time desc;
`,
    parameters: {},
  };
}

export function buildLongRunningTransactionsQuery(options?: { thresholdSeconds?: number }): BuiltQuery {
  return {
    sql: `
SELECT
  at.transaction_id,
  es.session_id,
  at.transaction_begin_time,
  DATEDIFF(SECOND, at.transaction_begin_time, GETUTCDATE()) AS duration_seconds,
  CASE at.transaction_type
    WHEN 1 THEN 'Read/Write'
    WHEN 2 THEN 'Read-Only'
    WHEN 3 THEN 'System'
    WHEN 4 THEN 'Distributed'
    ELSE 'Unknown (' + CAST(at.transaction_type AS VARCHAR) + ')'
  END AS transaction_type,
  CASE at.transaction_state
    WHEN 0 THEN 'Not fully initialized'
    WHEN 1 THEN 'Initialized, not started'
    WHEN 2 THEN 'Active'
    WHEN 3 THEN 'Ended (read-only)'
    WHEN 4 THEN 'Commit initiated'
    WHEN 5 THEN 'Prepared, awaiting resolution'
    WHEN 6 THEN 'Committed'
    WHEN 7 THEN 'Rolling back'
    WHEN 8 THEN 'Rolled back'
    ELSE 'Unknown (' + CAST(at.transaction_state AS VARCHAR) + ')'
  END AS transaction_state,
  es.login_name,
  es.host_name,
  es.program_name,
  CASE es.transaction_isolation_level
    WHEN 0 THEN 'Unspecified'
    WHEN 1 THEN 'ReadUncommitted'
    WHEN 2 THEN 'ReadCommitted'
    WHEN 3 THEN 'Repeatable'
    WHEN 4 THEN 'Serializable'
    WHEN 5 THEN 'Snapshot'
    ELSE 'Unknown'
  END AS isolation_level,
  ISNULL(dtdt.database_transaction_log_bytes_used, 0) AS log_used_bytes,
  ISNULL(REPLACE(REPLACE(
    SUBSTRING(st.text, (er.statement_start_offset/2)+1,
      ((CASE er.statement_end_offset WHEN -1 THEN DATALENGTH(st.text)
        ELSE er.statement_end_offset END - er.statement_start_offset)/2)+1),
    CHAR(10), ' '), CHAR(13), ' '), '') AS current_statement_text,
  es.open_transaction_count AS open_result_sets
FROM sys.dm_tran_active_transactions at
JOIN sys.dm_tran_session_transactions tst ON at.transaction_id = tst.transaction_id
JOIN sys.dm_exec_sessions es ON tst.session_id = es.session_id
LEFT JOIN sys.dm_tran_database_transactions dtdt
  ON at.transaction_id = dtdt.transaction_id
LEFT JOIN sys.dm_exec_requests er ON es.session_id = er.session_id
OUTER APPLY sys.dm_exec_sql_text(er.sql_handle) st
WHERE es.is_user_process = 1
  AND DATEDIFF(SECOND, at.transaction_begin_time, GETUTCDATE()) > @thresholdSeconds
ORDER BY duration_seconds DESC;
`,
    parameters: { thresholdSeconds: options?.thresholdSeconds ?? LONG_RUNNING_DEFAULT_THRESHOLD_SECONDS },
  };
}

type Row = Record<string, unknown>;

const str = (row: Row, key: string): string => String(row[key] ?? '');
const num = (row: Row, key: string): number => Number(row[key] ?? 0);

/**
 * SessionService exposes live session, request and transaction diagnostics from DMVs.
 *
 * Unlike PerformanceService these tools read `sys.dm_exec_*` / `sys.dm_tran_*`, not Query
 * Store, so they must NOT gate on Query Store — doing so would make them fail on a healthy
 * database. No proactive gate is needed at all: insufficient permission on these DMVs raises
 * a SQL error rather than silently returning no rows, so an empty result genuinely means
 * "nothing is blocking / running / long-lived" and is a valid answer.
 *
 * Depends on QueryService rather than ConnectionService so that connection pooling,
 * row/response-size limits, PII redaction and error sanitisation all apply unchanged.
 */
export class SessionService {
  constructor(private readonly queryService: QueryService) {}

  async getBlockingChains(
    serverId: string,
    database: string
  ): Promise<{ chains: BlockingChainEntry[]; summary: { totalBlocked: number; headBlockers: number } }> {
    const rows = await this.run(serverId, database, buildBlockingChainsQuery());

    const chains: BlockingChainEntry[] = rows.map(row => ({
      headBlockerSessionId: num(row, 'head_blocker_session_id'),
      sessionId: num(row, 'session_id'),
      blockingSessionId: num(row, 'blocking_session_id'),
      waitType: str(row, 'wait_type'),
      waitDurationMs: num(row, 'wait_duration_ms'),
      waitResource: str(row, 'wait_resource'),
      level: num(row, 'Level'),
      blockerQuery: str(row, 'blocker_query_or_most_recent_query'),
    }));

    return {
      chains,
      summary: {
        totalBlocked: chains.filter(c => c.level > 0).length,
        headBlockers: new Set(chains.filter(c => c.level === 0).map(c => c.sessionId)).size,
      },
    };
  }

  async getExecutingRequests(
    serverId: string,
    database: string,
    options?: { includePlan?: boolean }
  ): Promise<{ requests: ExecutingRequest[]; summary: { total: number; totalCpuMs: number } }> {
    const rows = await this.run(serverId, database, buildExecutingRequestsQuery(options));

    const requests: ExecutingRequest[] = rows.map(row => {
      const request: ExecutingRequest = {
        sessionId: num(row, 'session_id'),
        status: str(row, 'status'),
        startTime: str(row, 'start_time'),
        cpuTimeMs: num(row, 'cpu_time_ms'),
        logicalReads: num(row, 'logical_reads'),
        dop: num(row, 'dop'),
        loginName: str(row, 'login_name'),
        hostName: str(row, 'host_name'),
        programName: str(row, 'program_name'),
        objectName: str(row, 'ObjectName'),
        statementText: str(row, 'statement_text'),
      };
      if (options?.includePlan) {
        const plan = row['query_plan'] ?? row['query_plan_with_in_flight_statistics'];
        if (plan) request.queryPlan = String(plan);
      }
      return request;
    });

    return {
      requests,
      summary: {
        total: requests.length,
        totalCpuMs: requests.reduce((sum, r) => sum + r.cpuTimeMs, 0),
      },
    };
  }

  async getLongRunningTransactions(
    serverId: string,
    database: string,
    options?: { thresholdSeconds?: number }
  ): Promise<{
    transactions: LongRunningTransaction[];
    summary: { total: number; maxDurationSeconds: number; totalLogUsedBytes: number };
  }> {
    const rows = await this.run(serverId, database, buildLongRunningTransactionsQuery(options));

    const transactions: LongRunningTransaction[] = rows.map(row => ({
      transactionId: num(row, 'transaction_id'),
      sessionId: num(row, 'session_id'),
      transactionBeginTime: str(row, 'transaction_begin_time'),
      durationSeconds: num(row, 'duration_seconds'),
      transactionType: str(row, 'transaction_type'),
      transactionState: str(row, 'transaction_state'),
      loginName: str(row, 'login_name'),
      hostName: str(row, 'host_name'),
      programName: str(row, 'program_name'),
      isolationLevel: str(row, 'isolation_level'),
      logUsedBytes: num(row, 'log_used_bytes'),
      currentStatementText: str(row, 'current_statement_text'),
      openResultSets: num(row, 'open_result_sets'),
    }));

    return {
      transactions,
      summary: {
        total: transactions.length,
        maxDurationSeconds: transactions.reduce((max, t) => Math.max(max, t.durationSeconds), 0),
        totalLogUsedBytes: transactions.reduce((sum, t) => sum + t.logUsedBytes, 0),
      },
    };
  }

  async getDeadlockGraphs(
    serverId: string,
    database: string,
    options?: { limit?: number }
  ): Promise<{
    deadlocks: DeadlockEvent[];
    summary: { total: number; earliestTimestamp: string | null; latestTimestamp: string | null };
  }> {
    await this.assertSystemHealthAvailable(serverId, database);
    const rows = await this.run(serverId, database, buildDeadlockGraphsQuery(options));

    const deadlocks: DeadlockEvent[] = rows.map(row => {
      const xml = str(row, 'deadlock_xml');
      return {
        eventTimestamp: str(row, 'event_timestamp'),
        deadlockXml: xml,
        victimProcess: extractFromXml(xml, /<victimProcess\s+id="([^"]+)"/i),
        deadlockResources: extractAllFromXml(xml, /<[a-z]+lock[^>]*>/gi),
        waitTypes: extractAllFromXml(xml, /waittype="([^"]+)"/gi),
        objectNames: extractAllFromXml(xml, /objectname="([^"]+)"/gi),
        processCount: (xml.match(/<process /gi) || []).length,
      };
    });

    // The ring-buffer query orders by event_timestamp DESC, so the newest row is first.
    const timestamps = deadlocks.map(d => d.eventTimestamp).filter(Boolean);

    return {
      deadlocks,
      summary: {
        total: deadlocks.length,
        earliestTimestamp: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
        latestTimestamp: timestamps.length > 0 ? timestamps[0] : null,
      },
    };
  }

  private async run(serverId: string, database: string, built: BuiltQuery): Promise<Row[]> {
    const result = await this.queryService.executeQuery<Row>(serverId, database, built.sql, built.parameters);
    return result.rows;
  }

  /**
   * Azure SQL Database has no default-running `system_health` session and no server-scoped
   * `sys.dm_xe_sessions`, so the ring-buffer query would fail with a bare "Invalid object name".
   * Fail first with something the caller can act on. Managed Instance (8) does run system_health.
   */
  private async assertSystemHealthAvailable(serverId: string, database: string): Promise<void> {
    const rows = await this.run(serverId, database, buildEngineEditionQuery());
    if (rows.length > 0 && num(rows[0], 'engine_edition') === AZURE_SQL_DATABASE_ENGINE_EDITION) {
      throw new Error(
        `Deadlock graphs are not available on Azure SQL Database. It does not run the system_health ` +
        `Extended Events session that captures deadlocks by default on SQL Server and Managed Instance. ` +
        `To capture them, create a database-scoped session first: ` +
        `CREATE EVENT SESSION [deadlocks] ON DATABASE ADD EVENT sqlserver.database_xml_deadlock_report ` +
        `ADD TARGET package0.ring_buffer; ALTER EVENT SESSION [deadlocks] ON DATABASE STATE = START; ` +
        `Only deadlocks occurring after the session starts are captured. Alternatively, route the ` +
        `Deadlocks diagnostic-setting category to Log Analytics.`
      );
    }
  }
}

function extractFromXml(xml: string, pattern: RegExp): string {
  const match = xml.match(pattern);
  return match ? match[1] : '';
}

function extractAllFromXml(xml: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    matches.push(match[1] ?? match[0]);
  }
  return [...new Set(matches)];
}
