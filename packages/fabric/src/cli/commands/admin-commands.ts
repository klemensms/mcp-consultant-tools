/**
 * Admin CLI Commands - mirrors the fabric admin MCP tools (read-only).
 * Admin routes use the Fabric admin API and require Fabric admin rights.
 */
import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerAdminCommands(program: Command, ctx: ServiceContext): void {
  const admin = program.command('admin').description('Tenant-wide admin operations - Fabric admin API');

  admin
    .command('list-workspaces')
    .description('List all workspaces in the tenant (admin view)')
    .action(async () => {
      try {
        const result = await ctx.admin.listWorkspaces();
        outputResult(
          { fileName: 'admin-workspaces', data: result, summary: `Found ${result.count} workspace(s) tenant-wide` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'list workspaces (admin)'); }
    });

  admin
    .command('list-items')
    .description('List the tenant-wide item inventory (admin view)')
    .option('-t, --type <type>', 'Filter by item type')
    .option('-w, --workspace-id <id>', 'Filter by workspace ID (GUID)')
    .action(async (opts: any) => {
      try {
        const result = await ctx.admin.listItems({ type: opts.type, workspaceId: opts.workspaceId });
        outputResult(
          { fileName: 'admin-items', data: result, summary: `Found ${result.count} item(s) tenant-wide` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'list items (admin)'); }
    });

  admin
    .command('get-tenant-settings')
    .description('Get the Fabric tenant settings (read-only)')
    .action(async () => {
      try {
        const result = await ctx.admin.getTenantSettings();
        outputResult(
          { fileName: 'admin-tenant-settings', data: result, summary: 'Retrieved Fabric tenant settings' },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'get tenant settings'); }
    });
}
