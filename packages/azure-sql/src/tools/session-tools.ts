import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { TARGET_SCHEMA, createWithTarget, type Target } from './target-helpers.js';

/** Stated on every tool: the DMVs behind them are permission-gated, and the name differs by platform. */
const DMV_PERMISSION = 'Requires VIEW SERVER STATE (SQL Server) or VIEW DATABASE STATE (Azure SQL Database).';

export function registerSessionTools(server: any, ctx: ServiceContext): void {
  const withTarget = createWithTarget(ctx);

  server.tool(
    "sql-get-blocking-chains",
    `Live blocking hierarchy: which session is at the head of each blocking chain, and which sessions are blocked behind it (with the blocker's query text and wait resource). An empty result means nothing is currently blocking. On Azure SQL Database the view is scoped to the connected database. ${DMV_PERMISSION}`,
    TARGET_SCHEMA,
    { readOnlyHint: true, openWorldHint: true },
    async (args: Target) =>
      withTarget(args, 'getting blocking chains', (s, d) => ctx.session.getBlockingChains(s, d))
  );

  server.tool(
    "sql-get-executing-requests",
    `Currently executing requests with live CPU, logical reads, degree of parallelism and statement text, ordered by CPU. Set includePlan=true to attach execution plans (large output; on Azure SQL Database the in-flight plan needs a Premium tier or admin login). ${DMV_PERMISSION}`,
    {
      includePlan: z.boolean().optional().describe("Attach XML execution plans (default: false; can produce very large output)"),
      ...TARGET_SCHEMA,
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ includePlan, ...target }: Target & { includePlan?: boolean }) =>
      withTarget(target, 'getting executing requests', (s, d) =>
        ctx.session.getExecutingRequests(s, d, { includePlan })
      )
  );

  server.tool(
    "sql-get-deadlock-graphs",
    `Recent deadlock graphs from the system_health Extended Events ring buffer, newest first, with the victim process, wait types and objects involved. NOT SUPPORTED on Azure SQL Database, which does not run system_health - the tool fails with instructions rather than returning nothing. Works on SQL Server and Azure SQL Managed Instance. ${DMV_PERMISSION}`,
    {
      limit: z.number().int().positive().optional().describe("Maximum deadlock events to return (default: 20)"),
      ...TARGET_SCHEMA,
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ limit, ...target }: Target & { limit?: number }) =>
      withTarget(target, 'getting deadlock graphs', (s, d) =>
        ctx.session.getDeadlockGraphs(s, d, { limit })
      )
  );

  server.tool(
    "sql-get-long-running-transactions",
    `Open user transactions running longer than a threshold, with duration, isolation level, transaction log bytes used and the current statement. Use to find transactions pinning the log or holding locks. Defaults to 30 seconds. ${DMV_PERMISSION}`,
    {
      thresholdSeconds: z.number().int().positive().optional().describe("Only report transactions open longer than this many seconds (default: 30)"),
      ...TARGET_SCHEMA,
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ thresholdSeconds, ...target }: Target & { thresholdSeconds?: number }) =>
      withTarget(target, 'getting long-running transactions', (s, d) =>
        ctx.session.getLongRunningTransactions(s, d, { thresholdSeconds })
      )
  );
}
