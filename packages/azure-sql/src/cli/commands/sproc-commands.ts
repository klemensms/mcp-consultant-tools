/**
 * Sproc CLI Commands - 3 commands mapping to stored procedure MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerSprocCommands(program: Command, ctx: ServiceContext): void {
  const sproc = program.command('sproc').description('Stored procedure management and execution');

  sproc
    .command('manage')
    .description('Create or alter a stored procedure')
    .argument('<schemaName>', "Schema name (e.g., 'dbo')")
    .argument('<sprocName>', "Procedure name (e.g., 'usp_GetActiveUsers')")
    .argument('<definition>', 'Procedure definition (parameters + body, e.g., "@Status INT AS SELECT * FROM Users WHERE Status = @Status")')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (schemaName: string, sprocName: string, definition: string, opts: any) => {
      try {
        ctx.checkSprocManageEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.write.manageSproc(resolvedServerId, resolvedDatabase, schemaName, sprocName, definition);
        outputResult(
          { fileName: `sql-sproc-manage-${schemaName}-${sprocName}`, data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'manage sproc'); }
    });

  sproc
    .command('deploy')
    .description('Deploy a stored procedure from a local .sql file')
    .argument('<filePath>', 'Path to a .sql file containing a CREATE OR ALTER PROCEDURE statement')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (filePath: string, opts: any) => {
      try {
        ctx.checkSprocManageEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.write.deploySprocFromFile(resolvedServerId, resolvedDatabase, filePath);
        outputResult(
          { persist: false, fileName: `sql-sproc-deploy-${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`, data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'deploy sproc from file'); }
    });

  sproc
    .command('drop')
    .description('Drop a stored procedure if it exists')
    .argument('<schemaName>', "Schema name (e.g., 'dbo')")
    .argument('<sprocName>', "Procedure name (e.g., 'usp_GetActiveUsers')")
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (schemaName: string, sprocName: string, opts: any) => {
      try {
        ctx.checkSprocDropEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.write.dropSproc(resolvedServerId, resolvedDatabase, schemaName, sprocName);
        outputResult(
          { fileName: `sql-sproc-drop-${schemaName}-${sprocName}`, data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'drop sproc'); }
    });

  sproc
    .command('execute')
    .description('Execute a stored procedure with optional parameters')
    .argument('<schemaName>', "Schema name (e.g., 'dbo')")
    .argument('<sprocName>', "Procedure name (e.g., 'usp_GetActiveUsers')")
    .option('-p, --parameters <json>', 'Parameters as JSON object (e.g., \'{"Status": 1, "Name": "John"}\')')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (schemaName: string, sprocName: string, opts: any) => {
      try {
        ctx.checkSprocExecuteEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const parameters = opts.parameters ? JSON.parse(opts.parameters) : undefined;
        const result = await ctx.write.executeSproc(resolvedServerId, resolvedDatabase, schemaName, sprocName, parameters);
        outputResult(
          { fileName: `sql-sproc-exec-${schemaName}-${sprocName}`, data: result, summary: `Procedure ${schemaName}.${sprocName} returned ${result.rowCount} row(s), return value: ${result.returnValue}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'execute sproc'); }
    });
}
