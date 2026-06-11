/**
 * Connection CLI Commands - 4 commands mapping to connection MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerConnectionCommands(program: Command, ctx: ServiceContext): void {
  const conn = program.command('connection').description('Connection and server operations');

  conn
    .command('list-servers')
    .description('List all configured SQL servers')
    .action(async () => {
      try {
        const servers = await ctx.connection.listServers();
        outputResult(
          { fileName: 'sql-servers', data: servers, summary: `Found ${servers.length} configured SQL server(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list servers'); }
    });

  conn
    .command('list-databases')
    .description('List databases on a SQL server')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .action(async (opts: any) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const databases = await ctx.connection.listDatabases(resolvedServerId);
        outputResult(
          { fileName: `sql-databases-${resolvedServerId}`, data: databases, summary: `Found ${databases.length} database(s) on server '${resolvedServerId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list databases'); }
    });

  conn
    .command('get-defaults')
    .description('Get the default server and database configuration')
    .action(async () => {
      try {
        const defaults = ctx.connection.getDefaultConfiguration();
        outputResult(
          { fileName: 'sql-defaults', data: defaults, summary: `Default: server='${defaults.defaultServerId}', database='${defaults.defaultDatabase}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get defaults'); }
    });

  conn
    .command('test')
    .description('Test SQL Server connectivity and return connection information')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.connection.testConnection(resolvedServerId, resolvedDatabase);
        const status = result.connected ? 'Connected' : 'Failed';
        outputResult(
          { fileName: `sql-test-${resolvedServerId}`, data: result, summary: `Connection test: ${status} to ${result.server}/${result.database}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'test connection'); }
    });
}
