/**
 * Table CLI Commands - 10 commands for table storage operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerTableCommands(program: Command, ctx: ServiceContext): void {
  const table = program.command('table').description('Table storage operations');

  table
    .command('list')
    .description('List tables')
    .argument('<accountId>', 'Storage account ID')
    .option('-m, --max-results <n>', 'Maximum results (default: 1000)')
    .action(async (accountId: string, opts: any) => {
      try {
        const tableSvc = ctx.storage.getTableService(accountId);
        const maxResults = opts.maxResults ? parseInt(opts.maxResults) : undefined;
        const result = await tableSvc.listTables(maxResults);
        outputResult(
          { fileName: `tables-${accountId}`, data: result, summary: `Found ${result.items.length} table(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list tables'); }
    });

  table
    .command('create')
    .description('Create table (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<tableName>', 'Table name')
    .action(async (accountId: string, tableName: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.createTable(tableName);
        outputResult(
          { fileName: `create-table-${tableName}`, data: result, summary: `Table '${tableName}' created: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create table'); }
    });

  table
    .command('delete')
    .description('Delete table (requires AZURE_STORAGE_ENABLE_DELETE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<tableName>', 'Table name')
    .action(async (accountId: string, tableName: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
          throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
        }
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.deleteTable(tableName);
        outputResult(
          { fileName: `delete-table-${tableName}`, data: result, summary: `Table '${tableName}' deleted: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete table'); }
    });

  table
    .command('get-entity')
    .description('Get entity by PartitionKey and RowKey')
    .argument('<accountId>', 'Storage account ID')
    .argument('<tableName>', 'Table name')
    .argument('<partitionKey>', 'Partition key')
    .argument('<rowKey>', 'Row key')
    .action(async (accountId: string, tableName: string, partitionKey: string, rowKey: string) => {
      try {
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.getEntity(tableName, partitionKey, rowKey);
        outputResult(
          { fileName: `entity-${partitionKey}-${rowKey}`, data: result, summary: `Entity: ${tableName} [${partitionKey}/${rowKey}]` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get entity'); }
    });

  table
    .command('query')
    .description('Query entities with OData filter')
    .argument('<accountId>', 'Storage account ID')
    .argument('<tableName>', 'Table name')
    .option('-f, --filter <filter>', 'OData filter expression')
    .option('-s, --select <columns>', 'Columns to return (comma-separated)')
    .option('-t, --top <n>', 'Maximum results (default: 1000)')
    .action(async (accountId: string, tableName: string, opts: any) => {
      try {
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.queryEntities(tableName, {
          filter: opts.filter,
          select: opts.select ? opts.select.split(',').map((s: string) => s.trim()) : undefined,
          top: opts.top ? parseInt(opts.top) : undefined,
        });
        outputResult(
          { fileName: `query-${tableName}`, data: result, summary: `Found ${result.items.length} entit${result.items.length === 1 ? 'y' : 'ies'} in '${tableName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'query entities'); }
    });

  table
    .command('insert')
    .description('Insert new entity (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<tableName>', 'Table name')
    .argument('<entity>', 'Entity JSON with partitionKey, rowKey, and properties')
    .action(async (accountId: string, tableName: string, entity: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const tableSvc = ctx.storage.getTableService(accountId);
        const entityObj = JSON.parse(entity);
        const result = await tableSvc.insertEntity(tableName, entityObj);
        outputResult(
          { fileName: `insert-entity-${tableName}`, data: result, summary: `Entity inserted into '${tableName}': ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'insert entity'); }
    });

  table
    .command('update')
    .description('Update existing entity (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<tableName>', 'Table name')
    .argument('<entity>', 'Entity JSON with partitionKey, rowKey, and properties')
    .option('--mode <mode>', 'Update mode: merge or replace (default: merge)', 'merge')
    .action(async (accountId: string, tableName: string, entity: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const tableSvc = ctx.storage.getTableService(accountId);
        const entityObj = JSON.parse(entity);
        const result = await tableSvc.updateEntity(tableName, entityObj, opts.mode);
        outputResult(
          { fileName: `update-entity-${tableName}`, data: result, summary: `Entity updated in '${tableName}': ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update entity'); }
    });

  table
    .command('upsert')
    .description('Insert or update entity (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<tableName>', 'Table name')
    .argument('<entity>', 'Entity JSON with partitionKey, rowKey, and properties')
    .option('--mode <mode>', 'Upsert mode: merge or replace (default: merge)', 'merge')
    .action(async (accountId: string, tableName: string, entity: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const tableSvc = ctx.storage.getTableService(accountId);
        const entityObj = JSON.parse(entity);
        const result = await tableSvc.upsertEntity(tableName, entityObj, opts.mode);
        outputResult(
          { fileName: `upsert-entity-${tableName}`, data: result, summary: `Entity upserted in '${tableName}': ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'upsert entity'); }
    });

  table
    .command('delete-entity')
    .description('Delete entity (requires AZURE_STORAGE_ENABLE_DELETE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<tableName>', 'Table name')
    .argument('<partitionKey>', 'Partition key')
    .argument('<rowKey>', 'Row key')
    .action(async (accountId: string, tableName: string, partitionKey: string, rowKey: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
          throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
        }
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.deleteEntity(tableName, partitionKey, rowKey);
        outputResult(
          { fileName: `delete-entity-${partitionKey}-${rowKey}`, data: result, summary: `Entity [${partitionKey}/${rowKey}] deleted: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete entity'); }
    });

  table
    .command('batch')
    .description('Execute batch operations on same partition (requires AZURE_STORAGE_ENABLE_WRITE=true for write ops, AZURE_STORAGE_ENABLE_DELETE=true for delete ops)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<tableName>', 'Table name')
    .argument('<operations>', 'Operations JSON array')
    .action(async (accountId: string, tableName: string, operations: string) => {
      try {
        const ops = JSON.parse(operations);
        const hasWrite = ops.some((op: any) => ['create', 'update', 'upsert'].includes(op.operation));
        const hasDelete = ops.some((op: any) => op.operation === 'delete');
        if (hasWrite && process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        if (hasDelete && process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
          throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
        }
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.batchOperation(tableName, ops);
        outputResult(
          { fileName: `batch-${tableName}`, data: result, summary: `Batch on '${tableName}': ${result.success ? 'succeeded' : 'failed'}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'batch operation'); }
    });
}
