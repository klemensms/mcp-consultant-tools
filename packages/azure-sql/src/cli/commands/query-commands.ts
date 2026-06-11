/**
 * Query CLI Commands - 8 commands mapping to query MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerQueryCommands(program: Command, ctx: ServiceContext): void {
  const query = program.command('query').description('Query and schema operations');

  query
    .command('list-tables')
    .description('List all user tables in the database with row counts and sizes')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const tables = await ctx.query.listTables(resolvedServerId, resolvedDatabase);
        outputResult(
          { fileName: `sql-tables-${resolvedServerId}-${resolvedDatabase}`, data: tables, summary: `Found ${tables.length} table(s) in ${resolvedServerId}/${resolvedDatabase}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list tables'); }
    });

  query
    .command('list-views')
    .description('List all views in the database')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const views = await ctx.query.listViews(resolvedServerId, resolvedDatabase);
        outputResult(
          { fileName: `sql-views-${resolvedServerId}-${resolvedDatabase}`, data: views, summary: `Found ${views.length} view(s) in ${resolvedServerId}/${resolvedDatabase}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list views'); }
    });

  query
    .command('list-sprocs')
    .description('List all stored procedures in the database')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const procedures = await ctx.query.listStoredProcedures(resolvedServerId, resolvedDatabase);
        outputResult(
          { fileName: `sql-sprocs-${resolvedServerId}-${resolvedDatabase}`, data: procedures, summary: `Found ${procedures.length} stored procedure(s) in ${resolvedServerId}/${resolvedDatabase}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list stored procedures'); }
    });

  query
    .command('list-triggers')
    .description('List all database triggers in the database')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const triggers = await ctx.query.listTriggers(resolvedServerId, resolvedDatabase);
        outputResult(
          { fileName: `sql-triggers-${resolvedServerId}-${resolvedDatabase}`, data: triggers, summary: `Found ${triggers.length} trigger(s) in ${resolvedServerId}/${resolvedDatabase}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list triggers'); }
    });

  query
    .command('list-functions')
    .description('List all user-defined functions in the database')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (opts: any) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const functions = await ctx.query.listFunctions(resolvedServerId, resolvedDatabase);
        outputResult(
          { fileName: `sql-functions-${resolvedServerId}-${resolvedDatabase}`, data: functions, summary: `Found ${functions.length} function(s) in ${resolvedServerId}/${resolvedDatabase}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list functions'); }
    });

  query
    .command('table-schema')
    .description('Get detailed schema information for a table including columns, indexes, and foreign keys')
    .argument('<schemaName>', "Schema name (e.g., 'dbo')")
    .argument('<tableName>', "Table name (e.g., 'Users')")
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (schemaName: string, tableName: string, opts: any) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const schema = await ctx.query.getTableSchema(resolvedServerId, resolvedDatabase, schemaName, tableName);
        outputResult(
          { fileName: `sql-schema-${schemaName}-${tableName}`, data: schema, summary: `Schema for ${schemaName}.${tableName}: ${(schema as any).columns?.length ?? 0} column(s), ${(schema as any).indexes?.length ?? 0} index(es), ${(schema as any).foreignKeys?.length ?? 0} FK(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get table schema'); }
    });

  query
    .command('obj-def')
    .description('Get the SQL definition for a view, stored procedure, function, or trigger')
    .argument('<schemaName>', "Schema name (e.g., 'dbo')")
    .argument('<objectName>', 'Object name')
    .argument('<objectType>', 'Object type: VIEW, PROCEDURE, FUNCTION, or TRIGGER')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (schemaName: string, objectName: string, objectType: string, opts: any) => {
      try {
        const validTypes = ['VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER'];
        const upperType = objectType.toUpperCase();
        if (!validTypes.includes(upperType)) {
          throw new Error(`Invalid object type '${objectType}'. Must be one of: ${validTypes.join(', ')}`);
        }
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const definition = await ctx.query.getObjectDefinition(resolvedServerId, resolvedDatabase, schemaName, objectName, upperType as any);
        outputResult(
          { fileName: `sql-def-${schemaName}-${objectName}`, data: definition, summary: `${upperType} definition for ${schemaName}.${objectName}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get object definition'); }
    });

  query
    .command('execute')
    .description('Execute a SELECT query against Azure SQL Database')
    .argument('<query>', 'SELECT query to execute')
    .option('-s, --server-id <id>', 'Server ID (omit for default)')
    .option('-d, --database <name>', 'Database name (omit for default)')
    .action(async (queryStr: string, opts: any) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(opts.serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, opts.database);
        const result = await ctx.query.executeSelectQuery(resolvedServerId, resolvedDatabase, queryStr);
        const truncatedMsg = result.truncated ? ' (truncated)' : '';
        outputResult(
          { fileName: 'sql-query-result', data: result, summary: `Query returned ${result.rowCount} row(s)${truncatedMsg}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'execute query'); }
    });
}
