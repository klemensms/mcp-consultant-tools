/**
 * Performance CLI Commands - 6 commands mapping to the Query Store MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { parsePositiveInt, createResolveTarget } from './target-helpers.js';

export function registerPerformanceCommands(program: Command, ctx: ServiceContext): void {
  const perf = program.command('perf').description('Query Store performance diagnostics');

  const resolveTarget = createResolveTarget(ctx);

  perf
    .command('get-top-waits')
    .description('Top 20 wait categories across all queries (Query Store, last 7 days)')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.performance.getTopWaits(serverId, database);
        outputResult(
          {
            fileName: `sql-top-waits-${serverId}-${database}`,
            data: result,
            summary: [
              `Found ${result.waits.length} wait entries across ${result.summary.totalCategories} category/categories in ${serverId}/${database}`,
              result.summary.topCategory ? `  Top category: ${result.summary.topCategory}` : '',
            ].filter(Boolean).join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get top waits'); }
    });

  perf
    .command('find-query-in-store')
    .description('Search Query Store for queries matching a text pattern')
    .argument('<pattern>', "Substring to search for in query text (e.g., 'Orders')")
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (pattern: string, opts: any) => {
      try {
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.performance.findQueryInStore(serverId, database, { queryPattern: pattern });
        outputResult(
          {
            fileName: 'sql-query-store-search',
            data: result,
            summary: `Found ${result.queries.length} matching query/queries in ${serverId}/${database}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'find query in store'); }
    });

  perf
    .command('get-query-wait-stats')
    .description('Wait-category breakdown over time for a Query Store query ID')
    .argument('<queryId>', 'Query Store query_id')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (queryId: string, opts: any) => {
      try {
        const parsedQueryId = parsePositiveInt(queryId, 'queryId');
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.performance.getQueryWaitStats(serverId, database, { queryId: parsedQueryId });
        outputResult(
          {
            fileName: `sql-query-wait-stats-${parsedQueryId}`,
            data: result,
            summary: `Found ${result.waits.length} wait stat entry/entries for query ${parsedQueryId}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get query wait stats'); }
    });

  perf
    .command('get-cpu-intensive-queries')
    .description('Top CPU-consuming queries from Query Store, grouped by query hash')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .option('--hours <hours>', 'Lookback window in hours', '24')
    .option('-l, --limit <limit>', 'Maximum queries to return', '15')
    .action(async (opts: any) => {
      try {
        const hours = parsePositiveInt(opts.hours, '--hours');
        const limit = parsePositiveInt(opts.limit, '--limit');
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.performance.getCpuIntensiveQueries(serverId, database, { hours, limit });
        outputResult(
          {
            fileName: `sql-cpu-intensive-queries-${serverId}-${database}`,
            data: result,
            summary: [
              `Found ${result.queries.length} CPU-intensive query/queries in ${serverId}/${database} over the last ${hours}h`,
              `  Total CPU: ${Math.round(result.summary.totalCpuMs)}ms`,
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get CPU intensive queries'); }
    });

  perf
    .command('get-failed-queries')
    .description('Recent exception/timeout queries from Query Store')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .option('-l, --limit <limit>', 'Maximum queries to return', '50')
    .option('--include-plan', 'Attach XML execution plans (large output)')
    .action(async (opts: any) => {
      try {
        const limit = parsePositiveInt(opts.limit, '--limit');
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.performance.getFailedQueries(serverId, database, {
          includePlan: opts.includePlan,
          limit,
        });
        outputResult(
          {
            fileName: `sql-failed-queries-${serverId}-${database}`,
            data: result,
            summary: `Found ${result.summary.total} failed/exception query/queries in ${serverId}/${database}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get failed queries'); }
    });

  perf
    .command('get-query-plan')
    .description('XML execution plan(s) for a Query Store query ID')
    .argument('<queryId>', 'Query Store query_id')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (queryId: string, opts: any) => {
      try {
        const parsedQueryId = parsePositiveInt(queryId, 'queryId');
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.performance.getQueryPlan(serverId, database, { queryId: parsedQueryId });
        outputResult(
          {
            fileName: `sql-query-plan-${parsedQueryId}`,
            data: result,
            summary: `Found ${result.summary.total} plan(s) for query ${parsedQueryId}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get query plan'); }
    });
}
