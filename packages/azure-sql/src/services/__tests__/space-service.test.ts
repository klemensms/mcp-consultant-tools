import { describe, it, expect, vi } from 'vitest';
import {
  SpaceService,
  buildDatabaseSpaceQuery,
  buildTableSpaceQuery,
  buildTempDbSpaceQuery,
  buildTempDbSessionUsageQuery,
} from '../space-service.js';
import type { QueryService } from '../query-service.js';

/** A QueryService stub whose executeQuery returns queued recordsets in order. */
const stubQueryService = (recordsets: unknown[][]) => {
  const executeQuery = vi.fn();
  for (const rows of recordsets) {
    executeQuery.mockResolvedValueOnce({ rows, columns: [], rowCount: rows.length });
  }
  return { executeQuery } as unknown as QueryService & { executeQuery: ReturnType<typeof vi.fn> };
};

describe('query builders: parameter binding', () => {
  it('buildDatabaseSpaceQuery takes no parameters and reads the current database files', () => {
    const { sql, parameters } = buildDatabaseSpaceQuery();
    expect(parameters).toEqual({});
    expect(sql).toContain('sys.database_files');
  });

  it('buildTableSpaceQuery binds topN instead of interpolating it', () => {
    const { sql, parameters } = buildTableSpaceQuery({ topN: 7 });
    expect(parameters).toEqual({ topN: 7 });
    expect(sql).toContain('TOP (@topN)');
    expect(sql).not.toContain('TOP (7)');
  });

  it('buildTableSpaceQuery defaults to the top 50 tables', () => {
    expect(buildTableSpaceQuery().parameters).toEqual({ topN: 50 });
  });

  it('buildTableSpaceQuery excludes system-shipped tables', () => {
    const { sql } = buildTableSpaceQuery();
    expect(sql).toContain('sys.dm_db_partition_stats');
    expect(sql).toContain('t.is_ms_shipped = 0');
  });
});

describe('SpaceService does not gate on Query Store', () => {
  it('issues exactly one query per call, with no Query Store state probe', async () => {
    const queryService = stubQueryService([[]]);
    const service = new SpaceService(queryService);

    await service.getDatabaseSpace('srv', 'db');

    expect(queryService.executeQuery).toHaveBeenCalledTimes(1);
    expect(queryService.executeQuery.mock.calls[0][2]).not.toContain('database_query_store_options');
  });
});

describe('SpaceService result shaping', () => {
  it('getDatabaseSpace totals size, used and free across files', async () => {
    const queryService = stubQueryService([
      [
        { FileId: 1, FileName: 'data', FileType: 'Data', SizeMb: 1000, UsedMb: 600, FreeMb: 400 },
        { FileId: 2, FileName: 'log', FileType: 'Log', SizeMb: 200, UsedMb: 50, FreeMb: 150 },
      ],
    ]);
    const service = new SpaceService(queryService);

    const result = await service.getDatabaseSpace('srv', 'db');

    expect(result.summary).toEqual({
      totalSizeMb: 1200,
      totalUsedMb: 650,
      totalFreeMb: 550,
      fileCount: 2,
    });
  });

  it('getDatabaseSpace preserves an unlimited max size as null rather than zero', async () => {
    const queryService = stubQueryService([[{ FileId: 1, FileName: 'data', MaxSizeMb: null }]]);
    const result = await new SpaceService(queryService).getDatabaseSpace('srv', 'db');
    expect(result.files[0].maxSizeMb).toBeNull();
  });

  it('getTableSpace names the largest table as schema.table', async () => {
    const queryService = stubQueryService([
      [
        { Schema: 'dbo', Table: 'Orders', TotalMb: 512.5 },
        { Schema: 'sales', Table: 'Invoices', TotalMb: 128.5 },
      ],
    ]);
    const service = new SpaceService(queryService);

    const result = await service.getTableSpace('srv', 'db');

    expect(result.summary).toEqual({ totalTables: 2, totalReservedMb: 641, largestTable: 'dbo.Orders' });
  });

  it('getTableSpace reports a null largest table for an empty database', async () => {
    const result = await new SpaceService(stubQueryService([[]])).getTableSpace('srv', 'db');
    expect(result.summary.largestTable).toBeNull();
  });

  it('getTableSpace binds the caller topN', async () => {
    const queryService = stubQueryService([[]]);
    await new SpaceService(queryService).getTableSpace('srv', 'db', { topN: 5 });

    const [, , , parameters] = queryService.executeQuery.mock.calls[0];
    expect(parameters).toEqual({ topN: 5 });
  });

  it('passes the resolved server and database through to every query', async () => {
    const queryService = stubQueryService([[]]);
    await new SpaceService(queryService).getDatabaseSpace('prod-sql', 'AppDB');

    const [serverId, database] = queryService.executeQuery.mock.calls[0];
    expect(serverId).toBe('prod-sql');
    expect(database).toBe('AppDB');
  });
});

/**
 * Azure SQL Database has no USE statement, so tempdb must be reached by three-part name -
 * the one documented exception to its ban on cross-database references. Both tempdb queries
 * are therefore portable as written and need no engine-edition branch.
 */
describe('tempdb query builders are portable to Azure SQL Database', () => {
  it('buildTempDbSpaceQuery reaches tempdb by three-part name rather than USE', () => {
    const { sql, parameters } = buildTempDbSpaceQuery();
    expect(parameters).toEqual({});
    expect(sql).toContain('tempdb.sys.dm_db_file_space_usage');
    expect(sql).toContain('tempdb.sys.database_files');
    expect(sql).not.toContain('USE tempdb');
  });

  it('buildTempDbSessionUsageQuery uses the inherently tempdb-scoped DMV unprefixed', () => {
    const { sql } = buildTempDbSessionUsageQuery();
    expect(sql).toContain('sys.dm_db_session_space_usage');
    expect(sql).not.toContain('tempdb.sys.dm_db_session_space_usage');
  });

  it('buildTempDbSessionUsageQuery binds topN and defaults to 50', () => {
    expect(buildTempDbSessionUsageQuery().parameters).toEqual({ topN: 50 });
    const { sql, parameters } = buildTempDbSessionUsageQuery({ topN: 5 });
    expect(parameters).toEqual({ topN: 5 });
    expect(sql).toContain('TOP (@topN)');
  });

  it('buildTempDbSessionUsageQuery only reports user sessions that allocated space', () => {
    const { sql } = buildTempDbSessionUsageQuery();
    expect(sql).toContain('es.is_user_process = 1');
  });
});

describe('SpaceService tempdb result shaping', () => {
  it('getTempDbSpace totals size and the three allocation categories across files', async () => {
    const queryService = stubQueryService([
      [
        { FileId: 1, SizeMb: 100, VersionStoreMb: 10, UserObjectMb: 20, InternalObjectMb: 5 },
        { FileId: 2, SizeMb: 100, VersionStoreMb: 2, UserObjectMb: 8, InternalObjectMb: 1 },
      ],
    ]);
    const service = new SpaceService(queryService);

    const result = await service.getTempDbSpace('srv', 'db');

    expect(result.summary).toEqual({
      totalSizeMb: 200,
      totalVersionStoreMb: 12,
      totalUserObjectMb: 28,
      totalInternalObjectMb: 6,
    });
  });

  it('getTempDbSessionUsage totals net allocation and names the top session', async () => {
    const queryService = stubQueryService([
      [
        { SessionId: 51, TotalNetKb: 8192 },
        { SessionId: 52, TotalNetKb: 1024 },
      ],
    ]);
    const service = new SpaceService(queryService);

    const result = await service.getTempDbSessionUsage('srv', 'db');

    expect(result.summary).toEqual({ totalSessions: 2, totalNetKb: 9216, topSession: 51 });
  });

  it('getTempDbSessionUsage reports a null top session when tempdb is idle', async () => {
    const result = await new SpaceService(stubQueryService([[]])).getTempDbSessionUsage('srv', 'db');
    expect(result.summary.topSession).toBeNull();
  });

  it('getTempDbSpace issues exactly one query, with no engine-edition probe', async () => {
    const queryService = stubQueryService([[]]);
    await new SpaceService(queryService).getTempDbSpace('srv', 'db');

    expect(queryService.executeQuery).toHaveBeenCalledTimes(1);
    expect(queryService.executeQuery.mock.calls[0][2]).not.toContain('SERVERPROPERTY');
  });
});
