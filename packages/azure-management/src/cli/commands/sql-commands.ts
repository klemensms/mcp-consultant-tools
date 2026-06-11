/**
 * SQL CLI Commands - 2 commands mapping to SQL MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerSqlCommands(program: Command, ctx: ServiceContext): void {
  const sql = program.command('sql').description('Azure SQL operations');

  sql
    .command('list-servers')
    .description('List all SQL Servers in the subscription or resource group')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.sql.listSqlServers({
          resourceGroup: opts.resourceGroup,
        });
        const count = result.summary?.total ?? '?';
        outputResult(
          { fileName: 'sql-servers-list', data: result, summary: `Found ${count} SQL Server(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list sql servers'); }
    });

  sql
    .command('list-databases')
    .description('List all databases on a SQL Server')
    .argument('<serverName>', 'SQL Server name')
    .option('-g, --resource-group <name>', 'Resource group')
    .action(async (serverName: string, opts: any) => {
      try {
        const result = await ctx.management.sql.listSqlDatabases({
          serverName,
          resourceGroup: opts.resourceGroup,
        });
        const count = result.summary?.total ?? '?';
        outputResult(
          { fileName: `sql-databases-${serverName}`, data: result, summary: `Found ${count} database(s) on '${serverName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list sql databases'); }
    });
}
