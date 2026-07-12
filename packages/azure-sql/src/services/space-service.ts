import type { QueryService } from './query-service.js';
import type { BuiltQuery } from './performance-service.js';

export interface DatabaseSpaceInfo {
  fileId: number;
  fileName: string;
  fileType: string;
  sizeMb: number;
  usedMb: number;
  freeMb: number;
  freePercent: number;
  maxSizeMb: number | null;
  growthSetting: string;
  physicalName: string;
}

export interface TableSpaceInfo {
  schema: string;
  table: string;
  rowCount: number;
  reservedKb: number;
  dataKb: number;
  indexKb: number;
  unusedKb: number;
  totalMb: number;
}

export interface TempDbSpaceInfo {
  fileId: number;
  sizeMb: number;
  usedMb: number;
  freeMb: number;
  freePercent: number;
  versionStoreMb: number;
  userObjectMb: number;
  internalObjectMb: number;
  mixedExtentMb: number;
}

export interface TempDbSessionUsage {
  sessionId: number;
  loginName: string;
  hostName: string;
  programName: string;
  userObjectsAllocKb: number;
  userObjectsDeallocKb: number;
  internalObjectsAllocKb: number;
  internalObjectsDeallocKb: number;
  netUserObjectsKb: number;
  netInternalObjectsKb: number;
  totalNetKb: number;
}

const TABLE_SPACE_DEFAULT_TOP_N = 50;
const TEMPDB_SESSION_DEFAULT_TOP_N = 50;

export function buildDatabaseSpaceQuery(): BuiltQuery {
  return {
    sql: `
SELECT
  file_id AS FileId,
  name AS FileName,
  CASE type WHEN 0 THEN 'Data' WHEN 1 THEN 'Log' WHEN 2 THEN 'FileStream' ELSE 'Other' END AS FileType,
  CAST(size * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMb,
  CAST(FILEPROPERTY(name, 'SpaceUsed') * 8.0 / 1024 AS DECIMAL(18,2)) AS UsedMb,
  CAST((size - FILEPROPERTY(name, 'SpaceUsed')) * 8.0 / 1024 AS DECIMAL(18,2)) AS FreeMb,
  CAST((size - FILEPROPERTY(name, 'SpaceUsed')) * 100.0 / NULLIF(size, 0) AS DECIMAL(5,2)) AS FreePercent,
  CASE max_size
    WHEN -1 THEN NULL
    WHEN 0 THEN CAST(size * 8.0 / 1024 AS DECIMAL(18,2))
    ELSE CAST(max_size * 8.0 / 1024 AS DECIMAL(18,2))
  END AS MaxSizeMb,
  CASE is_percent_growth
    WHEN 1 THEN CAST(growth AS VARCHAR) + '%'
    ELSE CAST(CAST(growth * 8.0 / 1024 AS DECIMAL(18,2)) AS VARCHAR) + ' MB'
  END AS GrowthSetting,
  physical_name AS PhysicalName
FROM sys.database_files
ORDER BY type, file_id;
`,
    parameters: {},
  };
}

export function buildTableSpaceQuery(options?: { topN?: number }): BuiltQuery {
  return {
    sql: `
SELECT TOP (@topN)
  s.name AS [Schema],
  t.name AS [Table],
  SUM(CASE WHEN ps.index_id IN (0, 1) THEN ps.row_count ELSE 0 END) AS [RowCount],
  SUM(ps.reserved_page_count) * 8 AS ReservedKb,
  SUM(ps.in_row_data_page_count + ps.lob_used_page_count + ps.row_overflow_used_page_count) * 8 AS DataKb,
  SUM(CASE WHEN ps.index_id > 1 THEN ps.used_page_count ELSE 0 END) * 8 AS IndexKb,
  SUM(ps.reserved_page_count - ps.used_page_count) * 8 AS UnusedKb,
  CAST(SUM(ps.reserved_page_count) * 8.0 / 1024 AS DECIMAL(18,2)) AS TotalMb
FROM sys.dm_db_partition_stats ps
INNER JOIN sys.tables t ON ps.object_id = t.object_id
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE t.is_ms_shipped = 0
GROUP BY s.name, t.name
ORDER BY SUM(ps.reserved_page_count) DESC;
`,
    parameters: { topN: options?.topN ?? TABLE_SPACE_DEFAULT_TOP_N },
  };
}

/**
 * Reaches tempdb by three-part name. Azure SQL Database has no `USE` statement, and tempdb is
 * the one documented exception to its ban on cross-database references, so this single form
 * works on SQL Server, Managed Instance and Azure SQL Database alike — no engine-edition branch.
 */
export function buildTempDbSpaceQuery(): BuiltQuery {
  return {
    sql: `
SELECT
  fsu.file_id AS FileId,
  CAST(df.size * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMb,
  CAST((fsu.version_store_reserved_page_count
    + fsu.user_object_reserved_page_count
    + fsu.internal_object_reserved_page_count
    + fsu.mixed_extent_page_count) * 8.0 / 1024 AS DECIMAL(18,2)) AS UsedMb,
  CAST(fsu.unallocated_extent_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS FreeMb,
  CAST(fsu.unallocated_extent_page_count * 100.0 / NULLIF(df.size, 0) AS DECIMAL(5,2)) AS FreePercent,
  CAST(fsu.version_store_reserved_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS VersionStoreMb,
  CAST(fsu.user_object_reserved_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS UserObjectMb,
  CAST(fsu.internal_object_reserved_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS InternalObjectMb,
  CAST(fsu.mixed_extent_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS MixedExtentMb
FROM tempdb.sys.dm_db_file_space_usage fsu
JOIN tempdb.sys.database_files df ON fsu.file_id = df.file_id;
`,
    parameters: {},
  };
}

/**
 * `sys.dm_db_session_space_usage` is documented as applicable only to tempdb, so it reports
 * tempdb allocations regardless of the connected database and needs no `tempdb.` prefix.
 */
export function buildTempDbSessionUsageQuery(options?: { topN?: number }): BuiltQuery {
  return {
    sql: `
SELECT TOP (@topN)
  ssu.session_id AS SessionId,
  es.login_name AS LoginName,
  es.host_name AS HostName,
  es.program_name AS ProgramName,
  ssu.user_objects_alloc_page_count * 8 AS UserObjectsAllocKb,
  ssu.user_objects_dealloc_page_count * 8 AS UserObjectsDeallocKb,
  ssu.internal_objects_alloc_page_count * 8 AS InternalObjectsAllocKb,
  ssu.internal_objects_dealloc_page_count * 8 AS InternalObjectsDeallocKb,
  (ssu.user_objects_alloc_page_count - ssu.user_objects_dealloc_page_count) * 8 AS NetUserObjectsKb,
  (ssu.internal_objects_alloc_page_count - ssu.internal_objects_dealloc_page_count) * 8 AS NetInternalObjectsKb,
  ((ssu.user_objects_alloc_page_count - ssu.user_objects_dealloc_page_count)
   + (ssu.internal_objects_alloc_page_count - ssu.internal_objects_dealloc_page_count)) * 8 AS TotalNetKb
FROM sys.dm_db_session_space_usage ssu
JOIN sys.dm_exec_sessions es ON ssu.session_id = es.session_id
WHERE es.is_user_process = 1
  AND (ssu.user_objects_alloc_page_count + ssu.internal_objects_alloc_page_count) > 0
ORDER BY TotalNetKb DESC;
`,
    parameters: { topN: options?.topN ?? TEMPDB_SESSION_DEFAULT_TOP_N },
  };
}

type Row = Record<string, unknown>;

const str = (row: Row, key: string): string => String(row[key] ?? '');
const num = (row: Row, key: string): number => Number(row[key] ?? 0);

/**
 * SpaceService exposes file, table and TempDB space diagnostics.
 *
 * Reads catalog views and `sys.dm_db_*` DMVs, never Query Store, so it must not gate on
 * Query Store. Insufficient permission raises a SQL error rather than returning no rows,
 * so an empty result is a genuine "nothing to report" answer.
 *
 * Depends on QueryService rather than ConnectionService so that connection pooling,
 * row/response-size limits, PII redaction and error sanitisation all apply unchanged.
 */
export class SpaceService {
  constructor(private readonly queryService: QueryService) {}

  async getDatabaseSpace(
    serverId: string,
    database: string
  ): Promise<{
    files: DatabaseSpaceInfo[];
    summary: { totalSizeMb: number; totalUsedMb: number; totalFreeMb: number; fileCount: number };
  }> {
    const rows = await this.run(serverId, database, buildDatabaseSpaceQuery());

    const files: DatabaseSpaceInfo[] = rows.map(row => ({
      fileId: num(row, 'FileId'),
      fileName: str(row, 'FileName'),
      fileType: str(row, 'FileType'),
      sizeMb: num(row, 'SizeMb'),
      usedMb: num(row, 'UsedMb'),
      freeMb: num(row, 'FreeMb'),
      freePercent: num(row, 'FreePercent'),
      maxSizeMb: row['MaxSizeMb'] != null ? Number(row['MaxSizeMb']) : null,
      growthSetting: str(row, 'GrowthSetting'),
      physicalName: str(row, 'PhysicalName'),
    }));

    return {
      files,
      summary: {
        totalSizeMb: files.reduce((sum, f) => sum + f.sizeMb, 0),
        totalUsedMb: files.reduce((sum, f) => sum + f.usedMb, 0),
        totalFreeMb: files.reduce((sum, f) => sum + f.freeMb, 0),
        fileCount: files.length,
      },
    };
  }

  async getTableSpace(
    serverId: string,
    database: string,
    options?: { topN?: number }
  ): Promise<{
    tables: TableSpaceInfo[];
    summary: { totalTables: number; totalReservedMb: number; largestTable: string | null };
  }> {
    const rows = await this.run(serverId, database, buildTableSpaceQuery(options));

    const tables: TableSpaceInfo[] = rows.map(row => ({
      schema: str(row, 'Schema'),
      table: str(row, 'Table'),
      rowCount: num(row, 'RowCount'),
      reservedKb: num(row, 'ReservedKb'),
      dataKb: num(row, 'DataKb'),
      indexKb: num(row, 'IndexKb'),
      unusedKb: num(row, 'UnusedKb'),
      totalMb: num(row, 'TotalMb'),
    }));

    return {
      tables,
      summary: {
        totalTables: tables.length,
        totalReservedMb: tables.reduce((sum, t) => sum + t.totalMb, 0),
        largestTable: tables.length > 0 ? `${tables[0].schema}.${tables[0].table}` : null,
      },
    };
  }

  /** `database` selects the connection; the rows always describe that connection's tempdb. */
  async getTempDbSpace(
    serverId: string,
    database: string
  ): Promise<{
    files: TempDbSpaceInfo[];
    summary: {
      totalSizeMb: number;
      totalVersionStoreMb: number;
      totalUserObjectMb: number;
      totalInternalObjectMb: number;
    };
  }> {
    const rows = await this.run(serverId, database, buildTempDbSpaceQuery());

    const files: TempDbSpaceInfo[] = rows.map(row => ({
      fileId: num(row, 'FileId'),
      sizeMb: num(row, 'SizeMb'),
      usedMb: num(row, 'UsedMb'),
      freeMb: num(row, 'FreeMb'),
      freePercent: num(row, 'FreePercent'),
      versionStoreMb: num(row, 'VersionStoreMb'),
      userObjectMb: num(row, 'UserObjectMb'),
      internalObjectMb: num(row, 'InternalObjectMb'),
      mixedExtentMb: num(row, 'MixedExtentMb'),
    }));

    return {
      files,
      summary: {
        totalSizeMb: files.reduce((sum, f) => sum + f.sizeMb, 0),
        totalVersionStoreMb: files.reduce((sum, f) => sum + f.versionStoreMb, 0),
        totalUserObjectMb: files.reduce((sum, f) => sum + f.userObjectMb, 0),
        totalInternalObjectMb: files.reduce((sum, f) => sum + f.internalObjectMb, 0),
      },
    };
  }

  /** `database` selects the connection; the rows always describe that connection's tempdb. */
  async getTempDbSessionUsage(
    serverId: string,
    database: string,
    options?: { topN?: number }
  ): Promise<{
    sessions: TempDbSessionUsage[];
    summary: { totalSessions: number; totalNetKb: number; topSession: number | null };
  }> {
    const rows = await this.run(serverId, database, buildTempDbSessionUsageQuery(options));

    const sessions: TempDbSessionUsage[] = rows.map(row => ({
      sessionId: num(row, 'SessionId'),
      loginName: str(row, 'LoginName'),
      hostName: str(row, 'HostName'),
      programName: str(row, 'ProgramName'),
      userObjectsAllocKb: num(row, 'UserObjectsAllocKb'),
      userObjectsDeallocKb: num(row, 'UserObjectsDeallocKb'),
      internalObjectsAllocKb: num(row, 'InternalObjectsAllocKb'),
      internalObjectsDeallocKb: num(row, 'InternalObjectsDeallocKb'),
      netUserObjectsKb: num(row, 'NetUserObjectsKb'),
      netInternalObjectsKb: num(row, 'NetInternalObjectsKb'),
      totalNetKb: num(row, 'TotalNetKb'),
    }));

    return {
      sessions,
      summary: {
        totalSessions: sessions.length,
        totalNetKb: sessions.reduce((sum, s) => sum + s.totalNetKb, 0),
        topSession: sessions.length > 0 ? sessions[0].sessionId : null,
      },
    };
  }

  private async run(serverId: string, database: string, built: BuiltQuery): Promise<Row[]> {
    const result = await this.queryService.executeQuery<Row>(serverId, database, built.sql, built.parameters);
    return result.rows;
  }
}
