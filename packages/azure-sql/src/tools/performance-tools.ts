import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, QUERY_PATTERN_EXAMPLES } from '../tool-examples.js';
import { TARGET_SCHEMA, createWithTarget, type Target } from './target-helpers.js';

export function registerPerformanceTools(server: any, ctx: ServiceContext): void {
  const withTarget = createWithTarget(ctx);

  server.tool(
    "sql-get-top-waits",
    "Top 20 wait categories across all queries from Query Store (last 7 days). Identifies whether the bottleneck is I/O, CPU, locking or memory. Requires Query Store to be enabled.",
    TARGET_SCHEMA,
    { readOnlyHint: true, openWorldHint: true },
    async (args: Target) =>
      withTarget(args, 'getting top waits', (s, d) => ctx.performance.getTopWaits(s, d))
  );

  server.tool(
    "sql-find-query-in-store",
    descWithExamples(
      "Search Query Store for queries whose text matches a pattern. Returns query IDs to feed into sql-get-query-wait-stats and sql-get-query-plan. Requires Query Store to be enabled.",
      QUERY_PATTERN_EXAMPLES
    ),
    {
      queryPattern: z.string().describe("Substring to search for in query text, matched as a SQL LIKE '%pattern%'. Wildcards (% and _) are honoured; case sensitivity follows the database collation."),
      ...TARGET_SCHEMA,
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ queryPattern, ...target }: Target & { queryPattern: string }) =>
      withTarget(target, 'finding query in store', (s, d) =>
        ctx.performance.findQueryInStore(s, d, { queryPattern })
      )
  );

  server.tool(
    "sql-get-query-wait-stats",
    "Wait-category breakdown over time for one Query Store query ID. Use sql-find-query-in-store first to discover query IDs. Requires Query Store to be enabled.",
    {
      queryId: z.number().int().describe("Query Store query_id, as returned by sql-find-query-in-store"),
      ...TARGET_SCHEMA,
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ queryId, ...target }: Target & { queryId: number }) =>
      withTarget(target, 'getting query wait stats', (s, d) =>
        ctx.performance.getQueryWaitStats(s, d, { queryId })
      )
  );

  server.tool(
    "sql-get-cpu-intensive-queries",
    "Top CPU-consuming queries from Query Store, grouped by query hash so plan variants roll up together. Defaults to the last 24 hours, top 15. Requires Query Store to be enabled.",
    {
      hours: z.number().int().positive().optional().describe("Lookback window in hours (default: 24)"),
      limit: z.number().int().positive().optional().describe("Maximum queries to return (default: 15)"),
      ...TARGET_SCHEMA,
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ hours, limit, ...target }: Target & { hours?: number; limit?: number }) =>
      withTarget(target, 'getting CPU intensive queries', (s, d) =>
        ctx.performance.getCpuIntensiveQueries(s, d, { hours, limit })
      )
  );

  server.tool(
    "sql-get-failed-queries",
    "Recent queries that ended in an exception or timeout, from Query Store. Defaults to the 50 most recent. Set includePlan=true to attach XML execution plans (large output). Requires Query Store to be enabled.",
    {
      includePlan: z.boolean().optional().describe("Attach XML execution plans (default: false; can produce very large output)"),
      limit: z.number().int().positive().optional().describe("Maximum queries to return (default: 50)"),
      ...TARGET_SCHEMA,
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ includePlan, limit, ...target }: Target & { includePlan?: boolean; limit?: number }) =>
      withTarget(target, 'getting failed queries', (s, d) =>
        ctx.performance.getFailedQueries(s, d, { includePlan, limit })
      )
  );

  server.tool(
    "sql-get-query-plan",
    "XML execution plan(s) for one Query Store query ID, newest plan first. Use sql-find-query-in-store to discover query IDs. Output can exceed 1 MB. Requires Query Store to be enabled.",
    {
      queryId: z.number().int().describe("Query Store query_id, as returned by sql-find-query-in-store"),
      ...TARGET_SCHEMA,
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ queryId, ...target }: Target & { queryId: number }) =>
      withTarget(target, 'getting query plan', (s, d) =>
        ctx.performance.getQueryPlan(s, d, { queryId })
      )
  );
}
