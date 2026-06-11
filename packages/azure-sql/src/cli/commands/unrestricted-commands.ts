/**
 * Unrestricted SQL CLI Command - maps to sql-execute-unrestricted MCP tool
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerUnrestrictedCommands(program: Command, ctx: ServiceContext): void {
  if (process.env.SQL_ENABLE_UNRESTRICTED !== 'true') return;

  const unrestricted = program.command('unrestricted').description('Execute any T-SQL without restrictions (requires SQL_ENABLE_UNRESTRICTED=true)');

  unrestricted
    .command('execute')
    .description('Execute any T-SQL (DDL, DML, EXEC, multi-batch with GO)')
    .argument('<sql>', 'T-SQL to execute (use GO on its own line to separate batches)')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (sql: string, opts: any) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.write.executeUnrestricted(
          resolvedServerId, resolvedDatabase, sql
        );
        const summary = result.completedBatches === result.totalBatches
          ? `All ${result.totalBatches} batch(es) executed successfully.`
          : `${result.completedBatches}/${result.totalBatches} batch(es) completed. Batch ${result.completedBatches} failed.`;
        outputResult(
          { fileName: 'sql-unrestricted', data: result, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'unrestricted execute'); }
    });
}
