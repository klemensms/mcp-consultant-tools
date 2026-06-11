/**
 * View CLI Commands - 2 commands mapping to view management MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerViewCommands(program: Command, ctx: ServiceContext): void {
  const view = program.command('view').description('View management operations');

  view
    .command('manage')
    .description('Create or alter a SQL view')
    .argument('<schemaName>', "Schema name (e.g., 'dbo')")
    .argument('<viewName>', "View name (e.g., 'vw_ActiveUsers')")
    .argument('<selectBody>', 'SELECT body for the view (e.g., "SELECT id, name FROM Users WHERE active = 1")')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (schemaName: string, viewName: string, selectBody: string, opts: any) => {
      try {
        ctx.checkViewManageEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.write.manageView(resolvedServerId, resolvedDatabase, schemaName, viewName, selectBody);
        outputResult(
          { fileName: `sql-view-manage-${schemaName}-${viewName}`, data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'manage view'); }
    });

  view
    .command('deploy')
    .description('Deploy a SQL view from a local .sql file')
    .argument('<filePath>', 'Path to a .sql file containing a CREATE OR ALTER VIEW statement')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (filePath: string, opts: any) => {
      try {
        ctx.checkViewManageEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.write.deployViewFromFile(resolvedServerId, resolvedDatabase, filePath);
        outputResult(
          { fileName: `sql-view-deploy-${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`, data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'deploy view from file'); }
    });

  view
    .command('drop')
    .description('Drop a SQL view if it exists')
    .argument('<schemaName>', "Schema name (e.g., 'dbo')")
    .argument('<viewName>', "View name (e.g., 'vw_ActiveUsers')")
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (schemaName: string, viewName: string, opts: any) => {
      try {
        ctx.checkViewDropEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.write.dropView(resolvedServerId, resolvedDatabase, schemaName, viewName);
        outputResult(
          { fileName: `sql-view-drop-${schemaName}-${viewName}`, data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'drop view'); }
    });
}
