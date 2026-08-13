/**
 * Shortcut CLI Commands - mirrors the fabric shortcut MCP tools.
 */
import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerShortcutCommands(program: Command, ctx: ServiceContext): void {
  const shortcut = program.command('shortcut').description('OneLake shortcut operations');

  shortcut
    .command('list')
    .description('List shortcuts defined in an item')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<itemId>', 'Item ID (GUID) that owns the shortcuts')
    .action(async (workspaceId: string, itemId: string) => {
      try {
        const result = await ctx.shortcuts.listShortcuts(workspaceId, itemId);
        outputResult(
          { fileName: `shortcuts-${itemId}`, data: result, summary: `Found ${result.count} shortcut(s) in item '${itemId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'list shortcuts'); }
    });

  shortcut
    .command('create')
    .description('Create a OneLake shortcut (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<itemId>', 'Item ID (GUID) the shortcut is created under')
    .requiredOption('--path <path>', 'Path within the item (e.g. "Tables")')
    .requiredOption('--name <name>', 'Shortcut name')
    .requiredOption('--target <json>', 'Connector-specific target object as a JSON string')
    .action(async (workspaceId: string, itemId: string, opts: any) => {
      try {
        let target: Record<string, unknown>;
        try {
          target = JSON.parse(opts.target);
        } catch {
          throw new Error('--target must be a valid JSON string');
        }
        const result = await ctx.shortcuts.createShortcut(workspaceId, itemId, {
          path: opts.path,
          name: opts.name,
          target,
        });
        outputResult(
          { persist: false, fileName: `shortcut-created-${itemId}`, data: result, summary: `Created shortcut '${opts.name}' in item '${itemId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'create shortcut'); }
    });

  shortcut
    .command('delete')
    .description('Delete a shortcut - DESTRUCTIVE (requires FABRIC_ENABLE_DELETE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<itemId>', 'Item ID (GUID) that owns the shortcut')
    .argument('<shortcutPath>', 'Path of the shortcut within the item')
    .argument('<shortcutName>', 'Name of the shortcut to delete')
    .action(async (workspaceId: string, itemId: string, shortcutPath: string, shortcutName: string) => {
      try {
        const result = await ctx.shortcuts.deleteShortcut(workspaceId, itemId, shortcutPath, shortcutName);
        outputResult(
          { persist: false, fileName: `shortcut-deleted-${itemId}`, data: result, summary: `Deleted shortcut '${shortcutName}' from item '${itemId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'delete shortcut'); }
    });
}
