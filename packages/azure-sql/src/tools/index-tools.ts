import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { TARGET_SCHEMA, createWithTarget, type Target } from './target-helpers.js';

const DMV_PERMISSION = 'Requires VIEW SERVER STATE (SQL Server) or VIEW DATABASE STATE (Azure SQL Database), plus VIEW DEFINITION.';

export function registerIndexTools(server: any, ctx: ServiceContext): void {
  const withTarget = createWithTarget(ctx);

  server.tool(
    "sql-get-disabled-indexes",
    `Disabled indexes: their key columns, the table's row count, whether they back a foreign key, and a ready-to-run ALTER INDEX ... REBUILD statement. The rebuild DDL is returned as text and is never executed — a rebuild takes a schema lock and can run for a long time on a large table, so run it yourself in a maintenance window. ${DMV_PERMISSION}`,
    TARGET_SCHEMA,
    { readOnlyHint: true, openWorldHint: true },
    async (args: Target) =>
      withTarget(args, 'getting disabled indexes', (s, d) => ctx.index.getDisabledIndexes(s, d))
  );

  server.tool(
    "sql-get-missing-fk-indexes",
    "Every foreign-key column with an isIndexed flag saying whether some index leads on it, plus a summary of how many lack one. An FK column buried at position 2 of a composite index counts as missing, because it cannot serve the lookup. Evaluated per column: a composite foreign key reports each of its columns separately. This is the dry run for sql-create-fk-indexes, which creates exactly what this reports as missing.",
    TARGET_SCHEMA,
    { readOnlyHint: true, openWorldHint: true },
    async (args: Target) =>
      withTarget(args, 'getting missing FK indexes', (s, d) => ctx.index.getMissingFkIndexes(s, d))
  );

  server.tool(
    "sql-get-index-usage-stats",
    `Seeks, scans, lookups and updates per index, least-read first (default: top 100). Read three fields before recommending a drop. summary.statsWindowHours is how long the counters have been accumulating — they reset when the database engine restarts and when the database is detached, taken offline or AUTO_CLOSEd, so a short window makes a busy index look dormant. hasUsageData=false means the DMV held no row at all for that index: no activity of any kind, which is an absence of evidence rather than evidence of disuse. isUnused is the real signal — the engine maintains the index on every write and nothing has ever read it. Memory-optimized and spatial indexes are excluded, since the DMV does not report on them. ${DMV_PERMISSION}`,
    {
      topN: z.number().int().positive().optional().describe("Maximum indexes to return, least-read first (default: 100)"),
      ...TARGET_SCHEMA,
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ topN, ...target }: Target & { topN?: number }) =>
      withTarget(target, 'getting index usage stats', (s, d) => ctx.index.getIndexUsageStats(s, d, { topN }))
  );

  server.tool(
    "sql-create-fk-indexes",
    "Create a single-column nonclustered index named IX_<table>_<column> on every foreign-key column that lacks a leading-key index. Requires SQL_ENABLE_INDEX_CREATE=true. Run sql-get-missing-fk-indexes first — it lists exactly what this will create. Each CREATE INDEX takes a schema lock on its table and can run for minutes on a large one, so treat this as a maintenance-window operation. Returns one row per attempt: created, skipped (an index of that name already exists), or failed with the SQL error.",
    TARGET_SCHEMA,
    // Adds indexes; additive, not destructive. Matches sql-manage-view.
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: Target) =>
      withTarget(
        args,
        'creating FK indexes',
        (s, d) => ctx.index.createFkIndexes(s, d),
        () => ctx.checkIndexCreateEnabled()
      )
  );
}
