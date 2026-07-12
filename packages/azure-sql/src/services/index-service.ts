import type { QueryService } from './query-service.js';
import type { BuiltQuery } from './performance-service.js';

export interface DisabledIndex {
  schema: string;
  table: string;
  indexName: string;
  indexType: string;
  indexColumns: string;
  tableRowCount: number;
  backsForeignKey: boolean;
  /** Ready-to-run DDL. Returned as text; this service never executes it. */
  rebuildStatement: string;
}

export interface FkIndexStatus {
  schema: string;
  table: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  isIndexed: boolean;
}

export interface FkIndexCreationResult {
  indexName: string;
  schema: string;
  table: string;
  column: string;
  status: 'created' | 'skipped' | 'failed';
  errorMessage: string | null;
}

export interface IndexUsageStat {
  schema: string;
  table: string;
  indexName: string;
  indexType: string;
  /** False when the DMV held no row for this index — see `getIndexUsageStats`. */
  hasUsageData: boolean;
  userSeeks: number;
  userScans: number;
  userLookups: number;
  userUpdates: number;
  lastUserSeek: string | null;
  lastUserScan: string | null;
  lastUserLookup: string | null;
  lastUserUpdate: string | null;
  rowCount: number;
  isUnused: boolean;
  isHeavilyScanned: boolean;
}

const INDEX_USAGE_DEFAULT_TOP_N = 100;

/** A scan-to-seek ratio this lopsided, at this volume, suggests a missing or misordered key. */
const HEAVY_SCAN_SEEK_RATIO = 10;
const HEAVY_SCAN_MIN_SCANS = 1000;

/**
 * Disabled indexes, with the DDL that would rebuild them.
 *
 * The rebuild statement is assembled with QUOTENAME rather than bracket concatenation:
 * a catalog name may legally contain `]`, which would otherwise terminate the identifier
 * early and corrupt the generated statement.
 */
export function buildDisabledIndexesQuery(): BuiltQuery {
  return {
    sql: `
SELECT
  s.name AS [Schema],
  t.name AS [Table],
  i.name AS IndexName,
  i.type_desc AS IndexType,
  STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS IndexColumns,
  p.row_count AS TableRowCount,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM sys.foreign_key_columns fkc
      WHERE fkc.parent_object_id = i.object_id
        AND fkc.parent_column_id IN (
          SELECT ic2.column_id
          FROM sys.index_columns ic2
          WHERE ic2.object_id = i.object_id
            AND ic2.index_id = i.index_id
            AND ic2.key_ordinal = 1
        )
    ) THEN 1
    ELSE 0
  END AS BacksFK,
  'ALTER INDEX ' + QUOTENAME(i.name) + ' ON ' + QUOTENAME(s.name) + '.' + QUOTENAME(t.name) + ' REBUILD;' AS RebuildStatement
FROM sys.indexes i
INNER JOIN sys.tables t ON i.object_id = t.object_id
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
INNER JOIN (
  SELECT object_id, SUM(row_count) AS row_count
  FROM sys.dm_db_partition_stats
  WHERE index_id IN (0, 1)
  GROUP BY object_id
) p ON i.object_id = p.object_id
WHERE i.is_disabled = 1
  AND ic.key_ordinal > 0
GROUP BY s.name, t.name, i.name, i.type_desc, i.object_id, i.index_id, p.row_count
ORDER BY p.row_count DESC, t.name, i.name;
`,
    parameters: {},
  };
}

/**
 * Every foreign-key column with a flag for whether it is the leading key of some index.
 *
 * Leading-key, not merely present: an FK column buried at position 2 of a composite index
 * cannot serve the FK lookup. Evaluated per column, so a composite foreign key reports each
 * of its columns separately.
 */
export function buildMissingFkIndexesQuery(): BuiltQuery {
  return {
    sql: `
SELECT
  OBJECT_SCHEMA_NAME(fkc.parent_object_id) AS [Schema],
  OBJECT_NAME(fkc.parent_object_id) AS [Table],
  COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS [Column],
  OBJECT_NAME(fkc.referenced_object_id) AS ReferencedTable,
  COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS ReferencedColumn,
  CASE WHEN EXISTS (
    SELECT 1
    FROM sys.index_columns ic
    INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    WHERE ic.object_id = fkc.parent_object_id
      AND ic.column_id = fkc.parent_column_id
      AND ic.key_ordinal = 1
      AND i.type IN (1, 2)
  ) THEN 1 ELSE 0 END AS IsIndexed
FROM sys.foreign_key_columns fkc
ORDER BY OBJECT_NAME(fkc.parent_object_id), COL_NAME(fkc.parent_object_id, fkc.parent_column_id);
`,
    parameters: {},
  };
}

/**
 * Create a single-column nonclustered index over every foreign-key column that lacks one.
 *
 * Returns one row per attempt with its outcome, so a partial run reports exactly which
 * indexes landed and why the rest did not. Identifiers are QUOTENAME'd before they reach
 * sp_executesql; the names come from catalog views, not from the caller, but a table
 * legally named `foo]bar` would otherwise break out of the generated statement.
 *
 * `@IndexName` is oversized on purpose: a generated name longer than sysname's 128
 * characters must fail loudly inside CREATE INDEX rather than be silently truncated
 * into a collision with another index.
 */
export function buildCreateFkIndexesQuery(): BuiltQuery {
  return {
    sql: `
SET NOCOUNT ON;

DECLARE @Results TABLE (
  Ordinal      INT IDENTITY(1, 1),
  IndexName    NVARCHAR(300),
  SchemaName   sysname,
  TableName    sysname,
  ColumnName   sysname,
  Status       VARCHAR(10),
  ErrorMessage NVARCHAR(4000) NULL
);

DECLARE @SchemaName sysname, @TableName sysname, @ColumnName sysname;
DECLARE @IndexName NVARCHAR(300), @Sql NVARCHAR(MAX);

DECLARE fk_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT
  OBJECT_SCHEMA_NAME(fkc.parent_object_id) AS SchemaName,
  OBJECT_NAME(fkc.parent_object_id) AS TableName,
  COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS ColumnName
FROM sys.foreign_key_columns fkc
WHERE NOT EXISTS (
  SELECT 1
  FROM sys.index_columns ic
  INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
  WHERE ic.object_id = fkc.parent_object_id
    AND ic.column_id = fkc.parent_column_id
    AND ic.key_ordinal = 1
    AND i.type IN (1, 2)
)
ORDER BY TableName, ColumnName;

OPEN fk_cursor;
FETCH NEXT FROM fk_cursor INTO @SchemaName, @TableName, @ColumnName;

WHILE @@FETCH_STATUS = 0
BEGIN
  SET @IndexName = N'IX_' + @TableName + N'_' + @ColumnName;

  IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = @IndexName
      AND object_id = OBJECT_ID(QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName))
  )
  BEGIN
    INSERT INTO @Results (IndexName, SchemaName, TableName, ColumnName, Status, ErrorMessage)
    VALUES (@IndexName, @SchemaName, @TableName, @ColumnName, 'skipped', NULL);
  END
  ELSE
  BEGIN
    SET @Sql = N'CREATE NONCLUSTERED INDEX ' + QUOTENAME(@IndexName)
             + N' ON ' + QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName)
             + N' (' + QUOTENAME(@ColumnName) + N' ASC);';

    BEGIN TRY
      EXEC sp_executesql @Sql;
      INSERT INTO @Results (IndexName, SchemaName, TableName, ColumnName, Status, ErrorMessage)
      VALUES (@IndexName, @SchemaName, @TableName, @ColumnName, 'created', NULL);
    END TRY
    BEGIN CATCH
      INSERT INTO @Results (IndexName, SchemaName, TableName, ColumnName, Status, ErrorMessage)
      VALUES (@IndexName, @SchemaName, @TableName, @ColumnName, 'failed', ERROR_MESSAGE());
    END CATCH
  END

  FETCH NEXT FROM fk_cursor INTO @SchemaName, @TableName, @ColumnName;
END

CLOSE fk_cursor;
DEALLOCATE fk_cursor;

SELECT IndexName, SchemaName, TableName, ColumnName, Status, ErrorMessage
FROM @Results
ORDER BY Ordinal;
`,
    parameters: {},
  };
}

/**
 * Read/write counters per index, least-read first.
 *
 * Three properties of `sys.dm_db_index_usage_stats` shape this query:
 *
 * 1. An index that has seen no activity since the counters started has **no row**, not a row
 *    of zeros. Hence the LEFT JOIN and the `HasUsageData` flag — "no data" and "zero reads"
 *    are different answers and must not collapse into one.
 * 2. The counters reset whenever the database engine starts, and when the database is
 *    detached, taken offline or AUTO_CLOSEd. `StatsWindowHours` reports how long they have
 *    been accumulating, so a restart an hour ago cannot masquerade as a dormant index.
 *    DATEDIFF runs on the server's own clock, avoiding client/server timezone skew.
 * 3. The DMV covers neither memory-optimized nor spatial indexes, so those are excluded
 *    rather than reported as having no usage data.
 *
 * `sys.dm_os_sys_info` carries the same permission requirement as the usage DMV on every
 * platform, so joining it adds no new grant for the caller to obtain.
 */
export function buildIndexUsageStatsQuery(options?: { topN?: number }): BuiltQuery {
  return {
    sql: `
SELECT TOP (@topN)
  s.name AS [Schema],
  t.name AS [Table],
  i.name AS IndexName,
  i.type_desc AS IndexType,
  CASE WHEN ius.object_id IS NULL THEN 0 ELSE 1 END AS HasUsageData,
  ISNULL(ius.user_seeks, 0) AS UserSeeks,
  ISNULL(ius.user_scans, 0) AS UserScans,
  ISNULL(ius.user_lookups, 0) AS UserLookups,
  ISNULL(ius.user_updates, 0) AS UserUpdates,
  ius.last_user_seek AS LastUserSeek,
  ius.last_user_scan AS LastUserScan,
  ius.last_user_lookup AS LastUserLookup,
  ius.last_user_update AS LastUserUpdate,
  ISNULL(ps.row_count, 0) AS [RowCount],
  osi.sqlserver_start_time AS StatsSince,
  DATEDIFF(HOUR, osi.sqlserver_start_time, GETDATE()) AS StatsWindowHours
FROM sys.indexes i
INNER JOIN sys.tables t ON i.object_id = t.object_id
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
CROSS JOIN sys.dm_os_sys_info osi
LEFT JOIN sys.dm_db_index_usage_stats ius
  ON i.object_id = ius.object_id
  AND i.index_id = ius.index_id
  AND ius.database_id = DB_ID()
LEFT JOIN (
  SELECT object_id, SUM(row_count) AS row_count
  FROM sys.dm_db_partition_stats
  WHERE index_id IN (0, 1)
  GROUP BY object_id
) ps ON t.object_id = ps.object_id
WHERE i.name IS NOT NULL
  AND i.type > 0
  AND i.type <> 4
  AND t.is_memory_optimized = 0
  AND t.is_ms_shipped = 0
ORDER BY
  ISNULL(ius.user_seeks, 0) + ISNULL(ius.user_scans, 0) + ISNULL(ius.user_lookups, 0) ASC,
  ISNULL(ius.user_updates, 0) DESC;
`,
    parameters: { topN: options?.topN ?? INDEX_USAGE_DEFAULT_TOP_N },
  };
}

type Row = Record<string, unknown>;

const str = (row: Row, key: string): string => String(row[key] ?? '');
const num = (row: Row, key: string): number => Number(row[key] ?? 0);
const nullableStr = (row: Row, key: string): string | null => (row[key] != null ? String(row[key]) : null);

/**
 * IndexService exposes index health diagnostics: disabled indexes, foreign-key columns
 * missing a backing index, index usage counters, and the one write in the suite.
 *
 * Reads catalog views and `sys.dm_db_*` DMVs, never Query Store, so it must not gate on
 * Query Store. Insufficient permission raises a SQL error rather than returning no rows,
 * so an empty result is a genuine "nothing to report" answer.
 *
 * Depends on QueryService rather than ConnectionService so that connection pooling,
 * row/response-size limits, PII redaction and error sanitisation all apply unchanged.
 */
export class IndexService {
  constructor(private readonly queryService: QueryService) {}

  /**
   * Disabled indexes and the DDL that would rebuild them. The DDL is returned as text and
   * is never executed here — rebuilding is the caller's decision, taken with the table's
   * size and the maintenance window in view.
   */
  async getDisabledIndexes(
    serverId: string,
    database: string
  ): Promise<{
    indexes: DisabledIndex[];
    summary: { total: number; byTable: Record<string, number>; backingForeignKeys: number };
  }> {
    const { rows } = await this.run(serverId, database, buildDisabledIndexesQuery());

    const indexes: DisabledIndex[] = rows.map(row => ({
      schema: str(row, 'Schema'),
      table: str(row, 'Table'),
      indexName: str(row, 'IndexName'),
      indexType: str(row, 'IndexType'),
      indexColumns: str(row, 'IndexColumns'),
      tableRowCount: num(row, 'TableRowCount'),
      backsForeignKey: num(row, 'BacksFK') === 1,
      rebuildStatement: str(row, 'RebuildStatement'),
    }));

    const byTable: Record<string, number> = {};
    for (const idx of indexes) {
      const key = `${idx.schema}.${idx.table}`;
      byTable[key] = (byTable[key] ?? 0) + 1;
    }

    return {
      indexes,
      summary: {
        total: indexes.length,
        byTable,
        backingForeignKeys: indexes.filter(i => i.backsForeignKey).length,
      },
    };
  }

  /** Every foreign-key column, flagged with whether an index leads on it. */
  async getMissingFkIndexes(
    serverId: string,
    database: string
  ): Promise<{
    foreignKeys: FkIndexStatus[];
    summary: { total: number; indexed: number; missing: number };
  }> {
    const { rows } = await this.run(serverId, database, buildMissingFkIndexesQuery());

    const foreignKeys: FkIndexStatus[] = rows.map(row => ({
      schema: str(row, 'Schema'),
      table: str(row, 'Table'),
      column: str(row, 'Column'),
      referencedTable: str(row, 'ReferencedTable'),
      referencedColumn: str(row, 'ReferencedColumn'),
      isIndexed: num(row, 'IsIndexed') === 1,
    }));

    const indexed = foreignKeys.filter(fk => fk.isIndexed).length;

    return {
      foreignKeys,
      summary: { total: foreignKeys.length, indexed, missing: foreignKeys.length - indexed },
    };
  }

  /**
   * Create the missing foreign-key indexes. The only write in this service.
   *
   * `truncated` marks the row limit having capped the report, in which case the summary
   * counts are a lower bound on what the server actually did.
   */
  async createFkIndexes(
    serverId: string,
    database: string
  ): Promise<{
    results: FkIndexCreationResult[];
    summary: { created: number; skipped: number; failed: number };
    truncated: boolean;
  }> {
    const { rows, truncated } = await this.run(serverId, database, buildCreateFkIndexesQuery());

    const results: FkIndexCreationResult[] = rows.map(row => ({
      indexName: str(row, 'IndexName'),
      schema: str(row, 'SchemaName'),
      table: str(row, 'TableName'),
      column: str(row, 'ColumnName'),
      status: str(row, 'Status') as FkIndexCreationResult['status'],
      errorMessage: nullableStr(row, 'ErrorMessage'),
    }));

    return {
      results,
      summary: {
        created: results.filter(r => r.status === 'created').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        failed: results.filter(r => r.status === 'failed').length,
      },
      truncated: truncated ?? false,
    };
  }

  /**
   * Index read/write counters, least-read first.
   *
   * `isUnused` means the engine maintains the index on every write but nothing has read it
   * — the index costs and returns nothing. It deliberately requires `hasUsageData`: an index
   * with no DMV row has seen no activity of any kind, which is an absence of evidence rather
   * than evidence of disuse. Weigh any drop decision against `summary.statsWindowHours`,
   * since the counters reset on engine restart.
   */
  async getIndexUsageStats(
    serverId: string,
    database: string,
    options?: { topN?: number }
  ): Promise<{
    indexes: IndexUsageStat[];
    summary: {
      total: number;
      unusedCount: number;
      heavilyScannedCount: number;
      withoutUsageData: number;
      unusedIndexes: string[];
      statsSince: string | null;
      statsWindowHours: number | null;
    };
  }> {
    const { rows } = await this.run(serverId, database, buildIndexUsageStatsQuery(options));

    const indexes: IndexUsageStat[] = rows.map(row => {
      const hasUsageData = num(row, 'HasUsageData') === 1;
      const userSeeks = num(row, 'UserSeeks');
      const userScans = num(row, 'UserScans');
      const userLookups = num(row, 'UserLookups');
      const userUpdates = num(row, 'UserUpdates');

      return {
        schema: str(row, 'Schema'),
        table: str(row, 'Table'),
        indexName: str(row, 'IndexName'),
        indexType: str(row, 'IndexType'),
        hasUsageData,
        userSeeks,
        userScans,
        userLookups,
        userUpdates,
        lastUserSeek: nullableStr(row, 'LastUserSeek'),
        lastUserScan: nullableStr(row, 'LastUserScan'),
        lastUserLookup: nullableStr(row, 'LastUserLookup'),
        lastUserUpdate: nullableStr(row, 'LastUserUpdate'),
        rowCount: num(row, 'RowCount'),
        isUnused: hasUsageData && userSeeks === 0 && userScans === 0 && userLookups === 0 && userUpdates > 0,
        isHeavilyScanned: userScans > userSeeks * HEAVY_SCAN_SEEK_RATIO && userScans > HEAVY_SCAN_MIN_SCANS,
      };
    });

    const first = rows[0];

    return {
      indexes,
      summary: {
        total: indexes.length,
        unusedCount: indexes.filter(i => i.isUnused).length,
        heavilyScannedCount: indexes.filter(i => i.isHeavilyScanned).length,
        withoutUsageData: indexes.filter(i => !i.hasUsageData).length,
        unusedIndexes: indexes.filter(i => i.isUnused).map(i => `${i.schema}.${i.table}.${i.indexName}`),
        statsSince: first ? nullableStr(first, 'StatsSince') : null,
        statsWindowHours: first ? num(first, 'StatsWindowHours') : null,
      },
    };
  }

  private async run(
    serverId: string,
    database: string,
    built: BuiltQuery
  ): Promise<{ rows: Row[]; truncated?: boolean }> {
    const result = await this.queryService.executeQuery<Row>(serverId, database, built.sql, built.parameters);
    return { rows: result.rows, truncated: result.truncated };
  }
}
