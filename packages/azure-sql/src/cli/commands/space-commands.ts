/**
 * Space CLI Commands - 4 commands mapping to the database/table/TempDB space MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { parsePositiveInt, createResolveTarget } from './target-helpers.js';

export function registerSpaceCommands(program: Command, ctx: ServiceContext): void {
  const space = program.command('space').description('Database, table and TempDB space diagnostics');

  const resolveTarget = createResolveTarget(ctx);

  space
    .command('get-database-space')
    .description('Data and log file sizes, used/free space and growth settings')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.space.getDatabaseSpace(serverId, database);
        outputResult(
          {
            fileName: `sql-database-space-${serverId}-${database}`,
            data: result,
            summary: [
              `Found ${result.summary.fileCount} file(s) in ${serverId}/${database}`,
              `  Size: ${result.summary.totalSizeMb}MB, used: ${result.summary.totalUsedMb}MB, free: ${result.summary.totalFreeMb}MB`,
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get database space'); }
    });

  space
    .command('get-table-space')
    .description('Largest user tables by reserved space')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .option('-n, --top-n <n>', 'Maximum tables to return, largest first', '50')
    .action(async (opts: any) => {
      try {
        const topN = parsePositiveInt(opts.topN, '--top-n');
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.space.getTableSpace(serverId, database, { topN });
        outputResult(
          {
            fileName: `sql-table-space-${serverId}-${database}`,
            data: result,
            summary: [
              `Found ${result.summary.totalTables} table(s) totalling ${result.summary.totalReservedMb}MB in ${serverId}/${database}`,
              result.summary.largestTable ? `  Largest: ${result.summary.largestTable}` : '',
            ].filter(Boolean).join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get table space'); }
    });

  space
    .command('get-tempdb-space')
    .description("TempDB file breakdown (version store, user objects, internal objects)")
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name selecting the connection (omit for default)')
    .action(async (opts: any) => {
      try {
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.space.getTempDbSpace(serverId, database);
        outputResult(
          {
            fileName: `sql-tempdb-space-${serverId}`,
            data: result,
            summary: [
              `TempDB on ${serverId} spans ${result.files.length} file(s), ${result.summary.totalSizeMb}MB total`,
              `  Version store: ${result.summary.totalVersionStoreMb}MB, user objects: ${result.summary.totalUserObjectMb}MB, internal: ${result.summary.totalInternalObjectMb}MB`,
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get TempDB space'); }
    });

  space
    .command('get-tempdb-session-usage')
    .description('User sessions consuming TempDB, ranked by net allocation')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name selecting the connection (omit for default)')
    .option('-n, --top-n <n>', 'Maximum sessions to return, largest consumer first', '50')
    .action(async (opts: any) => {
      try {
        const topN = parsePositiveInt(opts.topN, '--top-n');
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.space.getTempDbSessionUsage(serverId, database, { topN });
        outputResult(
          {
            fileName: `sql-tempdb-session-usage-${serverId}`,
            data: result,
            summary: [
              `Found ${result.summary.totalSessions} session(s) using ${result.summary.totalNetKb}KB of TempDB on ${serverId}`,
              result.summary.topSession ? `  Top session: ${result.summary.topSession}` : '',
            ].filter(Boolean).join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get TempDB session usage'); }
    });
}
