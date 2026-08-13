/**
 * Index CLI Commands - 4 commands mapping to the index-health MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { parsePositiveInt, createResolveTarget } from './target-helpers.js';

export function registerIndexCommands(program: Command, ctx: ServiceContext): void {
  const index = program.command('index').description('Index health diagnostics');

  const resolveTarget = createResolveTarget(ctx);

  index
    .command('get-disabled-indexes')
    .description('Disabled indexes, with the DDL that would rebuild them (returned as text, never executed)')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.index.getDisabledIndexes(serverId, database);
        outputResult(
          {
            fileName: `sql-disabled-indexes-${serverId}-${database}`,
            data: result,
            summary: [
              `Found ${result.summary.total} disabled index(es) in ${serverId}/${database}`,
              result.summary.backingForeignKeys > 0
                ? `  ${result.summary.backingForeignKeys} back a foreign key`
                : '',
            ].filter(Boolean).join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get disabled indexes'); }
    });

  index
    .command('get-missing-fk-indexes')
    .description('Foreign-key columns lacking a leading-key index (the dry run for create-fk-indexes)')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.index.getMissingFkIndexes(serverId, database);
        outputResult(
          {
            fileName: `sql-missing-fk-indexes-${serverId}-${database}`,
            data: result,
            summary: [
              `Found ${result.summary.total} foreign-key column(s) in ${serverId}/${database}`,
              `  ${result.summary.missing} missing an index, ${result.summary.indexed} indexed`,
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get missing FK indexes'); }
    });

  index
    .command('get-index-usage-stats')
    .description('Seeks/scans/lookups/updates per index, least-read first')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .option('-n, --top-n <n>', 'Maximum indexes to return, least-read first', '100')
    .action(async (opts: any) => {
      try {
        const topN = parsePositiveInt(opts.topN, '--top-n');
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.index.getIndexUsageStats(serverId, database, { topN });
        outputResult(
          {
            fileName: `sql-index-usage-stats-${serverId}-${database}`,
            data: result,
            summary: [
              `Found ${result.summary.total} index(es) in ${serverId}/${database}`,
              `  ${result.summary.unusedCount} maintained but never read, ${result.summary.heavilyScannedCount} heavily scanned, ${result.summary.withoutUsageData} with no usage data`,
              result.summary.statsWindowHours !== null
                ? `  Counters have accumulated for ${result.summary.statsWindowHours}h (since ${result.summary.statsSince})`
                : '',
            ].filter(Boolean).join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get index usage stats'); }
    });

  index
    .command('create-fk-indexes')
    .description('Create a nonclustered index on every foreign-key column that lacks one (requires SQL_ENABLE_INDEX_CREATE=true)')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        ctx.checkIndexCreateEnabled();
        const { serverId, database } = resolveTarget(opts);
        const result = await ctx.index.createFkIndexes(serverId, database);
        outputResult(
          { persist: false,
            fileName: `sql-create-fk-indexes-${serverId}-${database}`,
            data: result,
            summary: [
              `Created ${result.summary.created}, skipped ${result.summary.skipped}, failed ${result.summary.failed} in ${serverId}/${database}`,
              result.truncated ? '  ⚠️ Report truncated by the row limit — counts are a lower bound' : '',
            ].filter(Boolean).join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create FK indexes'); }
    });
}
