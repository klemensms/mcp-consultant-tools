/**
 * Item CLI Commands - mirrors the fabric item MCP tools.
 */
import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerItemCommands(program: Command, ctx: ServiceContext): void {
  const item = program.command('item').description('Item operations (lakehouses, warehouses, notebooks, etc.)');

  item
    .command('list')
    .description('List items in a workspace')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .option('-t, --type <type>', 'Filter by item type (e.g. Lakehouse, Warehouse, Notebook)')
    .action(async (workspaceId: string, opts: any) => {
      try {
        const result = await ctx.items.listItems(workspaceId, opts.type);
        outputResult(
          { fileName: `items-${workspaceId}`, data: result, summary: `Found ${result.count} item(s) in workspace '${workspaceId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'list items'); }
    });

  item
    .command('get')
    .description('Get an item by ID')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<itemId>', 'Item ID (GUID)')
    .action(async (workspaceId: string, itemId: string) => {
      try {
        const result = await ctx.items.getItem(workspaceId, itemId);
        outputResult(
          { fileName: `item-${itemId}`, data: result, summary: `Item '${result.displayName ?? itemId}' (${result.type ?? 'unknown type'})` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'get item'); }
    });

  item
    .command('create')
    .description('Create a generic item of any type (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<displayName>', 'Display name for the new item')
    .requiredOption('-t, --type <type>', 'Fabric item type (e.g. Lakehouse, Warehouse, Notebook)')
    .option('-d, --description <text>', 'Item description')
    .action(async (workspaceId: string, displayName: string, opts: any) => {
      try {
        const result = await ctx.items.createItem(workspaceId, {
          displayName,
          type: opts.type,
          description: opts.description,
        });
        outputResult(
          { persist: false, fileName: `item-created`, data: result, summary: `Created ${opts.type} '${displayName}' in workspace '${workspaceId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'create item'); }
    });

  item
    .command('update')
    .description('Update an item (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<itemId>', 'Item ID (GUID)')
    .option('-n, --display-name <name>', 'New display name')
    .option('-d, --description <text>', 'New description')
    .action(async (workspaceId: string, itemId: string, opts: any) => {
      try {
        const result = await ctx.items.updateItem(workspaceId, itemId, {
          displayName: opts.displayName,
          description: opts.description,
        });
        outputResult(
          { persist: false, fileName: `item-updated-${itemId}`, data: result, summary: `Updated item '${itemId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'update item'); }
    });

  item
    .command('delete')
    .description('Delete an item - DESTRUCTIVE (requires FABRIC_ENABLE_DELETE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<itemId>', 'Item ID (GUID) to delete')
    .action(async (workspaceId: string, itemId: string) => {
      try {
        const result = await ctx.items.deleteItem(workspaceId, itemId);
        outputResult(
          { persist: false, fileName: `item-deleted-${itemId}`, data: result, summary: `Deleted item '${itemId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'delete item'); }
    });

  item
    .command('create-lakehouse')
    .description('Create a lakehouse (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<displayName>', 'Display name for the new lakehouse')
    .option('-d, --description <text>', 'Description')
    .action(async (workspaceId: string, displayName: string, opts: any) => {
      try {
        const result = await ctx.items.createLakehouse(workspaceId, { displayName, description: opts.description });
        outputResult(
          { persist: false, fileName: `lakehouse-created`, data: result, summary: `Created lakehouse '${displayName}' in workspace '${workspaceId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'create lakehouse'); }
    });

  item
    .command('create-warehouse')
    .description('Create a warehouse (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<displayName>', 'Display name for the new warehouse')
    .option('-d, --description <text>', 'Description')
    .action(async (workspaceId: string, displayName: string, opts: any) => {
      try {
        const result = await ctx.items.createWarehouse(workspaceId, { displayName, description: opts.description });
        outputResult(
          { persist: false, fileName: `warehouse-created`, data: result, summary: `Created warehouse '${displayName}' in workspace '${workspaceId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'create warehouse'); }
    });

  item
    .command('create-notebook')
    .description('Create a notebook (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<displayName>', 'Display name for the new notebook')
    .option('-d, --description <text>', 'Description')
    .action(async (workspaceId: string, displayName: string, opts: any) => {
      try {
        const result = await ctx.items.createNotebook(workspaceId, { displayName, description: opts.description });
        outputResult(
          { persist: false, fileName: `notebook-created`, data: result, summary: `Created notebook '${displayName}' in workspace '${workspaceId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'create notebook'); }
    });
}
