/**
 * CRUD CLI Commands - 3 commands mapping to INSERT/UPDATE/DELETE MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerCrudCommands(program: Command, ctx: ServiceContext): void {
  const crud = program.command('crud').description('Data modification operations (INSERT, UPDATE, DELETE)');

  crud
    .command('insert')
    .description('Execute an INSERT query')
    .argument('<query>', 'INSERT query to execute (e.g., "INSERT INTO Users (Name, Email) VALUES (\'John\', \'john@example.com\')")')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (query: string, opts: any) => {
      try {
        ctx.checkInsertEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.write.executeInsert(resolvedServerId, resolvedDatabase, query);
        outputResult(
          { fileName: 'sql-crud-insert', data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'insert'); }
    });

  crud
    .command('update')
    .description('Execute an UPDATE query')
    .argument('<query>', 'UPDATE query to execute (e.g., "UPDATE Users SET Status = 1 WHERE Email = \'john@example.com\'")')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (query: string, opts: any) => {
      try {
        ctx.checkUpdateEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.write.executeUpdate(resolvedServerId, resolvedDatabase, query);
        outputResult(
          { fileName: 'sql-crud-update', data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update'); }
    });

  crud
    .command('delete')
    .description('Execute a DELETE query (requires WHERE clause)')
    .argument('<query>', 'DELETE query to execute (e.g., "DELETE FROM Users WHERE Status = 0")')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (query: string, opts: any) => {
      try {
        ctx.checkDeleteEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.write.executeDelete(resolvedServerId, resolvedDatabase, query);
        outputResult(
          { fileName: 'sql-crud-delete', data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete'); }
    });
}
