/**
 * Item CLI Commands - maps to item MCP tools:
 *   list-items, get-item, batch-get-items, search-items,
 *   create-item, update-item, delete-item, archive-item,
 *   batch-create-items, batch-delete-items
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerItemCommands(program: Command, ctx: ServiceContext): void {
  const item = program.command('item').description('1Password item operations');

  item
    .command('list <vaultId>')
    .description('List items in a vault with optional filtering')
    .option('--title <search>', 'Filter by title (partial match)')
    .option('--tag <tag>', 'Filter by tag (exact match)')
    .action(async (vaultId: string, opts: any) => {
      try {
        const filter = opts.title || opts.tag
          ? { title: opts.title, tag: opts.tag }
          : undefined;
        const items = await ctx.items.listItems(vaultId, filter);
        outputResult(
          {
            fileName: `items-${vaultId}`,
            data: items,
            summary: `Found ${items.length} item(s) in vault ${vaultId}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list items');
      }
    });

  item
    .command('get <vaultId> <itemId>')
    .description('Get a single item with all field values')
    .action(async (vaultId: string, itemId: string) => {
      try {
        const result = await ctx.items.getItem(vaultId, itemId);
        outputResult(
          {
            fileName: `item-${vaultId}-${itemId}`,
            data: result,
            summary: `Item '${itemId}' from vault '${vaultId}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get item');
      }
    });

  item
    .command('batch-get <vaultId>')
    .description('Get multiple items at once (up to 50)')
    .argument('<itemIds...>', 'Item IDs to retrieve')
    .action(async (vaultId: string, itemIds: string[]) => {
      try {
        const result = await ctx.items.batchGetItems(vaultId, itemIds);
        outputResult(
          {
            fileName: `items-batch-${vaultId}`,
            data: result,
            summary: `Batch retrieved ${itemIds.length} item(s) from vault '${vaultId}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'batch get items');
      }
    });

  item
    .command('search')
    .description('Search items across all allowed vaults')
    .option('--title <search>', 'Filter by title (partial match)')
    .option('--tag <tag>', 'Filter by tag (exact match)')
    .action(async (opts: any) => {
      try {
        const filter = opts.title || opts.tag
          ? { title: opts.title, tag: opts.tag }
          : undefined;
        const results = await ctx.items.searchItems(filter);
        outputResult(
          {
            fileName: `items-search`,
            data: results,
            summary: `Found ${results.length} item(s) across all allowed vaults`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'search items');
      }
    });

  item
    .command('create <vaultId> <itemJson>')
    .description('Create a new item (requires OP_ENABLE_WRITE=true)')
    .action(async (vaultId: string, itemJson: string) => {
      try {
        ctx.checkWriteEnabled();
        const itemData = JSON.parse(itemJson);
        const result = await ctx.items.createItem(vaultId, itemData);
        outputResult(
          { persist: false,
            fileName: `created-item-${vaultId}`,
            data: result,
            summary: `Item created successfully in vault '${vaultId}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'create item');
      }
    });

  item
    .command('update <vaultId> <itemId> <changesJson>')
    .description('Update an existing item (requires OP_ENABLE_WRITE=true)')
    .action(async (vaultId: string, itemId: string, changesJson: string) => {
      try {
        ctx.checkWriteEnabled();
        const changes = JSON.parse(changesJson);
        const result = await ctx.items.updateItem(vaultId, itemId, changes);
        outputResult(
          { persist: false,
            fileName: `updated-item-${vaultId}-${itemId}`,
            data: result,
            summary: `Item '${itemId}' updated in vault '${vaultId}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'update item');
      }
    });

  item
    .command('delete <vaultId> <itemId>')
    .description('Permanently delete an item (requires OP_ENABLE_DELETE=true)')
    .option('--confirm', 'Confirm deletion (required)', false)
    .action(async (vaultId: string, itemId: string, opts: any) => {
      try {
        ctx.checkDeleteEnabled();
        if (!opts.confirm) {
          process.stderr.write(
            `Delete operation requires --confirm flag.\n` +
            `You are about to permanently delete item '${itemId}' from vault '${vaultId}'.\n` +
            `This operation cannot be undone.\n` +
            `To proceed, run again with --confirm.\n`
          );
          process.exit(1);
        }
        await ctx.items.deleteItem(vaultId, itemId);
        outputResult(
          { persist: false,
            fileName: `deleted-item-${vaultId}-${itemId}`,
            data: { vaultId, itemId, deleted: true },
            summary: `Item '${itemId}' deleted from vault '${vaultId}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'delete item');
      }
    });

  item
    .command('archive <vaultId> <itemId>')
    .description('Move an item to the archive (requires OP_ENABLE_DELETE=true)')
    .action(async (vaultId: string, itemId: string) => {
      try {
        ctx.checkDeleteEnabled();
        await ctx.items.archiveItem(vaultId, itemId);
        outputResult(
          { persist: false,
            fileName: `archived-item-${vaultId}-${itemId}`,
            data: { vaultId, itemId, archived: true },
            summary: `Item '${itemId}' archived in vault '${vaultId}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'archive item');
      }
    });

  item
    .command('batch-create <vaultId> <itemsJson>')
    .description('Create multiple items at once (up to 100, requires OP_ENABLE_WRITE=true)')
    .action(async (vaultId: string, itemsJson: string) => {
      try {
        ctx.checkWriteEnabled();
        const items = JSON.parse(itemsJson);
        const result = await ctx.items.batchCreateItems(vaultId, items);
        outputResult(
          { persist: false,
            fileName: `batch-created-items-${vaultId}`,
            data: result,
            summary: `Batch created ${items.length} item(s) in vault '${vaultId}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'batch create items');
      }
    });

  item
    .command('batch-delete <vaultId>')
    .description('Delete multiple items at once (requires OP_ENABLE_DELETE=true)')
    .argument('<itemIds...>', 'Item IDs to delete')
    .option('--confirm', 'Confirm deletion (required)', false)
    .action(async (vaultId: string, itemIds: string[], opts: any) => {
      try {
        ctx.checkDeleteEnabled();
        if (!opts.confirm) {
          process.stderr.write(
            `Batch delete requires --confirm flag.\n` +
            `You are about to permanently delete ${itemIds.length} item(s) from vault '${vaultId}'.\n` +
            `This operation cannot be undone.\n` +
            `To proceed, run again with --confirm.\n`
          );
          process.exit(1);
        }
        await ctx.items.batchDeleteItems(vaultId, itemIds);
        outputResult(
          { persist: false,
            fileName: `batch-deleted-items-${vaultId}`,
            data: { vaultId, itemIds, deleted: true },
            summary: `Deleted ${itemIds.length} item(s) from vault '${vaultId}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'batch delete items');
      }
    });
}
