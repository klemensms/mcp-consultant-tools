/**
 * Session CLI Commands - 4 commands mapping to the live session/transaction MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { parsePositiveInt, createResolveTarget } from './target-helpers.js';

export function registerSessionCommands(program: Command, ctx: ServiceContext): void {
  const session = program.command('session').description('Live session, request and transaction diagnostics');

  const resolveTarget = createResolveTarget(ctx);

  session
    .command('get-blocking-chains')
    .description('Active blocking hierarchy (head blockers and the sessions behind them)')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.session.getBlockingChains(serverId, database);
        outputResult(
          {
            fileName: `sql-blocking-chains-${serverId}-${database}`,
            data: result,
            summary: [
              `Found ${result.summary.headBlockers} head blocker(s) blocking ${result.summary.totalBlocked} session(s) in ${serverId}/${database}`,
              result.chains.length === 0 ? '  Nothing is currently blocking' : '',
            ].filter(Boolean).join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get blocking chains'); }
    });

  session
    .command('get-executing-requests')
    .description('Currently running queries with live CPU and read statistics')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .option('--include-plan', 'Attach XML execution plans (large output)')
    .action(async (opts: any) => {
      try {
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.session.getExecutingRequests(serverId, database, {
          includePlan: opts.includePlan,
        });
        outputResult(
          {
            fileName: `sql-executing-requests-${serverId}-${database}`,
            data: result,
            summary: [
              `Found ${result.summary.total} executing request(s) in ${serverId}/${database}`,
              `  Total CPU: ${Math.round(result.summary.totalCpuMs)}ms`,
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get executing requests'); }
    });

  session
    .command('get-deadlock-graphs')
    .description('Recent deadlocks from system_health XEvents (not supported on Azure SQL Database)')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .option('-l, --limit <limit>', 'Maximum deadlock events to return', '20')
    .action(async (opts: any) => {
      try {
        const limit = parsePositiveInt(opts.limit, '--limit');
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.session.getDeadlockGraphs(serverId, database, { limit });
        outputResult(
          {
            fileName: `sql-deadlock-graphs-${serverId}-${database}`,
            data: result,
            summary: [
              `Found ${result.summary.total} deadlock event(s) in ${serverId}/${database}`,
              result.summary.latestTimestamp ? `  Most recent: ${result.summary.latestTimestamp}` : '',
            ].filter(Boolean).join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get deadlock graphs'); }
    });

  session
    .command('get-long-running-transactions')
    .description('Open user transactions past a duration threshold')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .option('-t, --threshold-seconds <seconds>', 'Only report transactions open longer than this', '30')
    .action(async (opts: any) => {
      try {
        const thresholdSeconds = parsePositiveInt(opts.thresholdSeconds, '--threshold-seconds');
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.session.getLongRunningTransactions(serverId, database, { thresholdSeconds });
        outputResult(
          {
            fileName: `sql-long-running-transactions-${serverId}-${database}`,
            data: result,
            summary: [
              `Found ${result.summary.total} transaction(s) open longer than ${thresholdSeconds}s in ${serverId}/${database}`,
              `  Longest: ${result.summary.maxDurationSeconds}s, log used: ${result.summary.totalLogUsedBytes} bytes`,
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get long-running transactions'); }
    });
}
