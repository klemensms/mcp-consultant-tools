import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  IndexService,
  buildDisabledIndexesQuery,
  buildMissingFkIndexesQuery,
  buildCreateFkIndexesQuery,
  buildIndexUsageStatsQuery,
} from '../index-service.js';
import type { QueryService } from '../query-service.js';
import { createServiceContext } from '../../context-factory.js';

/** A QueryService stub whose executeQuery returns queued recordsets in order. */
const stubQueryService = (recordsets: unknown[][]) => {
  const executeQuery = vi.fn();
  for (const rows of recordsets) {
    executeQuery.mockResolvedValueOnce({ rows, columns: [], rowCount: rows.length });
  }
  return { executeQuery } as unknown as QueryService & { executeQuery: ReturnType<typeof vi.fn> };
};

describe('query builders: parameter binding', () => {
  it('buildDisabledIndexesQuery takes no parameters and filters on is_disabled', () => {
    const { sql, parameters } = buildDisabledIndexesQuery();
    expect(parameters).toEqual({});
    expect(sql).toContain('sys.indexes');
    expect(sql).toContain('i.is_disabled = 1');
  });

  it('buildMissingFkIndexesQuery takes no parameters and tests the leading key column', () => {
    const { sql, parameters } = buildMissingFkIndexesQuery();
    expect(parameters).toEqual({});
    expect(sql).toContain('sys.foreign_key_columns');
    expect(sql).toContain('ic.key_ordinal = 1');
  });

  it('buildCreateFkIndexesQuery takes no parameters and reports one row per attempt', () => {
    const { sql, parameters } = buildCreateFkIndexesQuery();
    expect(parameters).toEqual({});
    expect(sql).toContain('CREATE NONCLUSTERED INDEX');
    // Failures must surface, not be swallowed into a bare error count.
    expect(sql).toContain('ERROR_MESSAGE()');
  });

  it('buildIndexUsageStatsQuery binds topN instead of interpolating it', () => {
    const { sql, parameters } = buildIndexUsageStatsQuery({ topN: 7 });
    expect(parameters).toEqual({ topN: 7 });
    expect(sql).toContain('TOP (@topN)');
    expect(sql).not.toContain('TOP (7)');
  });

  it('buildIndexUsageStatsQuery defaults to the 100 least-used indexes', () => {
    expect(buildIndexUsageStatsQuery().parameters).toEqual({ topN: 100 });
  });
});

describe('buildIndexUsageStatsQuery guards the unused-index traps', () => {
  it('LEFT JOINs the usage DMV so a never-used index still appears', () => {
    const { sql } = buildIndexUsageStatsQuery();
    expect(sql).toContain('LEFT JOIN sys.dm_db_index_usage_stats');
  });

  it('reports whether the DMV actually held a row for the index', () => {
    // A never-used index has NO row in the DMV, not a row of zeros. Collapsing both to 0
    // would let a caller read "0 seeks" as evidence the index is safe to drop.
    const { sql } = buildIndexUsageStatsQuery();
    expect(sql).toContain('HasUsageData');
  });

  it('reports the counter accumulation window, computed server-side', () => {
    // Counters reset when the engine restarts. Without the window, "0 seeks" after a
    // restart an hour ago is indistinguishable from "0 seeks over six months".
    const { sql } = buildIndexUsageStatsQuery();
    expect(sql).toContain('sys.dm_os_sys_info');
    expect(sql).toContain('sqlserver_start_time');
    // DATEDIFF runs in the server's own clock, so no client/server timezone skew.
    expect(sql).toContain('DATEDIFF(HOUR, osi.sqlserver_start_time, GETDATE())');
  });

  it('excludes spatial and memory-optimized indexes, which the DMV never reports on', () => {
    const { sql } = buildIndexUsageStatsQuery();
    expect(sql).toContain('i.type <> 4');
    expect(sql).toContain('t.is_memory_optimized = 0');
  });
});

describe('getIndexUsageStats', () => {
  const base = {
    Schema: 'dbo',
    Table: 'Orders',
    IndexType: 'NONCLUSTERED',
    UserSeeks: 0,
    UserScans: 0,
    UserLookups: 0,
    UserUpdates: 0,
    LastUserSeek: null,
    LastUserScan: null,
    LastUserLookup: null,
    LastUserUpdate: null,
    RowCount: 5000,
    StatsSince: '2026-07-01T00:00:00.000Z',
    StatsWindowHours: 220,
  };

  it('flags an index that is maintained on every write but never read', async () => {
    const queryService = stubQueryService([
      [{ ...base, IndexName: 'IX_Orders_Unread', HasUsageData: 1, UserUpdates: 9000 }],
    ]);

    const result = await new IndexService(queryService).getIndexUsageStats('srv', 'db');

    expect(result.indexes[0].isUnused).toBe(true);
    expect(result.summary.unusedIndexes).toEqual(['dbo.Orders.IX_Orders_Unread']);
  });

  it('does not flag an index that has no DMV row as unused', async () => {
    // No row means no activity of any kind since the counters started — including no
    // writes. That is an absence of evidence, not evidence the index is dead weight.
    const queryService = stubQueryService([
      [{ ...base, IndexName: 'IX_Orders_NoData', HasUsageData: 0 }],
    ]);

    const result = await new IndexService(queryService).getIndexUsageStats('srv', 'db');

    expect(result.indexes[0].hasUsageData).toBe(false);
    expect(result.indexes[0].isUnused).toBe(false);
    expect(result.summary.unusedCount).toBe(0);
    expect(result.summary.withoutUsageData).toBe(1);
  });

  it('does not flag a read index as unused', async () => {
    const queryService = stubQueryService([
      [{ ...base, IndexName: 'IX_Orders_Read', HasUsageData: 1, UserSeeks: 3, UserUpdates: 9000 }],
    ]);
    const result = await new IndexService(queryService).getIndexUsageStats('srv', 'db');
    expect(result.indexes[0].isUnused).toBe(false);
  });

  it('surfaces the accumulation window so a fresh restart cannot read as "unused"', async () => {
    const queryService = stubQueryService([
      [{ ...base, IndexName: 'IX_Orders_Unread', HasUsageData: 1, UserUpdates: 5, StatsWindowHours: 1 }],
    ]);

    const result = await new IndexService(queryService).getIndexUsageStats('srv', 'db');

    expect(result.summary.statsWindowHours).toBe(1);
    expect(result.summary.statsSince).toBe('2026-07-01T00:00:00.000Z');
  });

  it('reports a null window when no indexes came back', async () => {
    const result = await new IndexService(stubQueryService([[]])).getIndexUsageStats('srv', 'db');
    expect(result.summary.statsSince).toBeNull();
    expect(result.summary.statsWindowHours).toBeNull();
    expect(result.summary.total).toBe(0);
  });

  it('flags a heavily scanned index only past both the ratio and the volume floor', async () => {
    const queryService = stubQueryService([
      [
        { ...base, IndexName: 'IX_Hot', HasUsageData: 1, UserSeeks: 10, UserScans: 5000 },
        { ...base, IndexName: 'IX_LowVolume', HasUsageData: 1, UserSeeks: 1, UserScans: 500 },
      ],
    ]);

    const result = await new IndexService(queryService).getIndexUsageStats('srv', 'db');

    expect(result.indexes[0].isHeavilyScanned).toBe(true);
    expect(result.indexes[1].isHeavilyScanned).toBe(false);
    expect(result.summary.heavilyScannedCount).toBe(1);
  });
});

describe('generated DDL quotes identifiers', () => {
  // Catalog names can legally contain ']'. Naked bracket concatenation would let a table
  // named `foo]bar` break out of the identifier and inject into the generated statement.
  it('the rebuild statement is assembled with QUOTENAME, not bracket concatenation', () => {
    const { sql } = buildDisabledIndexesQuery();
    expect(sql).toContain('QUOTENAME(i.name)');
    expect(sql).not.toContain("'ALTER INDEX [' +");
  });

  it('the CREATE INDEX statement quotes index, schema, table and column names', () => {
    const { sql } = buildCreateFkIndexesQuery();
    expect(sql).toContain('QUOTENAME(@IndexName)');
    expect(sql).toContain('QUOTENAME(@SchemaName)');
    expect(sql).toContain('QUOTENAME(@TableName)');
    expect(sql).toContain('QUOTENAME(@ColumnName)');
    expect(sql).not.toContain("N'CREATE NONCLUSTERED INDEX [' +");
  });
});

describe('getDisabledIndexes', () => {
  const row = {
    Schema: 'dbo',
    Table: 'Orders',
    IndexName: 'IX_Orders_CustomerId',
    IndexType: 'NONCLUSTERED',
    IndexColumns: 'CustomerId',
    TableRowCount: 1200,
    BacksFK: 1,
    RebuildStatement: 'ALTER INDEX [IX_Orders_CustomerId] ON [dbo].[Orders] REBUILD;',
  };

  it('returns the rebuild DDL as text and never executes it', async () => {
    const queryService = stubQueryService([[row]]);
    const service = new IndexService(queryService);

    const result = await service.getDisabledIndexes('srv', 'db');

    expect(result.indexes[0].rebuildStatement).toBe(row.RebuildStatement);
    // One read. The DDL is data, not a second statement to run.
    expect(queryService.executeQuery).toHaveBeenCalledTimes(1);
    const executedSql = queryService.executeQuery.mock.calls[0][2] as string;
    expect(executedSql).toContain('SELECT');
    expect(executedSql).not.toContain('EXEC');
  });

  it('summarises by table and counts indexes backing foreign keys', async () => {
    const queryService = stubQueryService([
      [row, { ...row, IndexName: 'IX_Orders_Status', BacksFK: 0 }, { ...row, Table: 'Items', BacksFK: 0 }],
    ]);
    const service = new IndexService(queryService);

    const result = await service.getDisabledIndexes('srv', 'db');

    expect(result.summary.total).toBe(3);
    expect(result.summary.byTable).toEqual({ 'dbo.Orders': 2, 'dbo.Items': 1 });
    expect(result.summary.backingForeignKeys).toBe(1);
  });

  it('does not probe Query Store state', async () => {
    const queryService = stubQueryService([[]]);
    await new IndexService(queryService).getDisabledIndexes('srv', 'db');
    expect(queryService.executeQuery.mock.calls[0][2]).not.toContain('database_query_store_options');
  });
});

describe('getMissingFkIndexes', () => {
  it('splits the foreign keys into indexed and missing', async () => {
    const queryService = stubQueryService([
      [
        { Schema: 'dbo', Table: 'Orders', Column: 'CustomerId', ReferencedTable: 'Customers', ReferencedColumn: 'Id', IsIndexed: 1 },
        { Schema: 'dbo', Table: 'Orders', Column: 'StatusId', ReferencedTable: 'Statuses', ReferencedColumn: 'Id', IsIndexed: 0 },
        { Schema: 'dbo', Table: 'Items', Column: 'OrderId', ReferencedTable: 'Orders', ReferencedColumn: 'Id', IsIndexed: 0 },
      ],
    ]);

    const result = await new IndexService(queryService).getMissingFkIndexes('srv', 'db');

    expect(result.summary).toEqual({ total: 3, indexed: 1, missing: 2 });
    expect(result.foreignKeys[0].isIndexed).toBe(true);
    expect(result.foreignKeys[1].isIndexed).toBe(false);
  });
});

describe('createFkIndexes', () => {
  it('reports per-index outcome, including failures with their error message', async () => {
    const queryService = stubQueryService([
      [
        { IndexName: 'IX_Orders_StatusId', SchemaName: 'dbo', TableName: 'Orders', ColumnName: 'StatusId', Status: 'created', ErrorMessage: null },
        { IndexName: 'IX_Items_OrderId', SchemaName: 'dbo', TableName: 'Items', ColumnName: 'OrderId', Status: 'skipped', ErrorMessage: null },
        { IndexName: 'IX_Audit_UserId', SchemaName: 'dbo', TableName: 'Audit', ColumnName: 'UserId', Status: 'failed', ErrorMessage: 'Cannot create index on a view.' },
      ],
    ]);

    const result = await new IndexService(queryService).createFkIndexes('srv', 'db');

    expect(result.summary).toEqual({ created: 1, skipped: 1, failed: 1 });
    // The source this was ported from labelled every row 'created' regardless of outcome.
    expect(result.results.map(r => r.status)).toEqual(['created', 'skipped', 'failed']);
    expect(result.results[2].errorMessage).toBe('Cannot create index on a view.');
    expect(result.results[0].errorMessage).toBeNull();
  });

  it('issues exactly one round trip', async () => {
    const queryService = stubQueryService([[]]);
    await new IndexService(queryService).createFkIndexes('srv', 'db');
    expect(queryService.executeQuery).toHaveBeenCalledTimes(1);
  });
});

describe('checkIndexCreateEnabled', () => {
  const original = process.env.SQL_ENABLE_INDEX_CREATE;
  afterEach(() => {
    if (original === undefined) delete process.env.SQL_ENABLE_INDEX_CREATE;
    else process.env.SQL_ENABLE_INDEX_CREATE = original;
  });

  it('throws when the flag is unset', () => {
    delete process.env.SQL_ENABLE_INDEX_CREATE;
    expect(() => createServiceContext().checkIndexCreateEnabled()).toThrow(/SQL_ENABLE_INDEX_CREATE=true/);
  });

  it('throws when the flag is any value other than "true"', () => {
    process.env.SQL_ENABLE_INDEX_CREATE = '1';
    expect(() => createServiceContext().checkIndexCreateEnabled()).toThrow(/disabled/);
  });

  it('permits index creation when the flag is exactly "true"', () => {
    process.env.SQL_ENABLE_INDEX_CREATE = 'true';
    expect(() => createServiceContext().checkIndexCreateEnabled()).not.toThrow();
  });
});
