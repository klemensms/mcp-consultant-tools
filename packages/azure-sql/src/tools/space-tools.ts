import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { TARGET_SCHEMA, createWithTarget, type Target } from './target-helpers.js';

const DMV_PERMISSION = 'Requires VIEW SERVER STATE (SQL Server) or VIEW DATABASE STATE (Azure SQL Database).';

export function registerSpaceTools(server: any, ctx: ServiceContext): void {
  const withTarget = createWithTarget(ctx);

  server.tool(
    "sql-get-database-space",
    "Data and log file sizes for the target database: size, used, free, free %, max size (null when unlimited), autogrowth setting and physical path. Use to diagnose a full or fast-growing database.",
    TARGET_SCHEMA,
    { readOnlyHint: true, openWorldHint: true },
    async (args: Target) =>
      withTarget(args, 'getting database space', (s, d) => ctx.space.getDatabaseSpace(s, d))
  );

  server.tool(
    "sql-get-table-space",
    `Largest user tables by reserved space, with row counts and the data/index/unused split. System tables are excluded. Defaults to the top 50. ${DMV_PERMISSION} Also requires VIEW DEFINITION.`,
    {
      topN: z.number().int().positive().optional().describe("Maximum tables to return, largest first (default: 50)"),
      ...TARGET_SCHEMA,
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ topN, ...target }: Target & { topN?: number }) =>
      withTarget(target, 'getting table space', (s, d) => ctx.space.getTableSpace(s, d, { topN })),
  );

  server.tool(
    "sql-get-tempdb-space",
    `TempDB file breakdown: size, used, free, and the version-store / user-object / internal-object split that tells you what is consuming it. The database parameter selects the connection; results always describe that connection's TempDB, not the named database. ${DMV_PERMISSION}`,
    TARGET_SCHEMA,
    { readOnlyHint: true, openWorldHint: true },
    async (args: Target) =>
      withTarget(args, 'getting TempDB space', (s, d) => ctx.space.getTempDbSpace(s, d))
  );

  server.tool(
    "sql-get-tempdb-session-usage",
    `User sessions consuming TempDB, ranked by net allocation, split into user objects and internal objects. Pairs with sql-get-tempdb-space to attribute TempDB growth to a session. The database parameter selects the connection; results always describe that connection's TempDB. Defaults to the top 50. ${DMV_PERMISSION}`,
    {
      topN: z.number().int().positive().optional().describe("Maximum sessions to return, largest consumer first (default: 50)"),
      ...TARGET_SCHEMA,
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ topN, ...target }: Target & { topN?: number }) =>
      withTarget(target, 'getting TempDB session usage', (s, d) =>
        ctx.space.getTempDbSessionUsage(s, d, { topN })
      )
  );
}
