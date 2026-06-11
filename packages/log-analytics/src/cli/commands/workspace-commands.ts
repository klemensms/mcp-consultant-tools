/**
 * Workspace CLI Commands - 3 commands for workspace management
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerWorkspaceCommands(program: Command, ctx: ServiceContext): void {
  const workspace = program.command('workspace').description('Workspace operations');

  workspace
    .command('list')
    .description('List all configured Log Analytics workspaces (active and inactive)')
    .action(async () => {
      try {
        const resources = ctx.logAnalytics.getAllResources();
        outputResult(
          { fileName: 'workspaces', data: resources, summary: `Found ${resources.length} configured workspace(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list workspaces'); }
    });

  workspace
    .command('metadata')
    .description('Get schema metadata (tables and columns) for a workspace')
    .argument('<resourceId>', 'Resource ID (use workspace list to find IDs)')
    .action(async (resourceId: string) => {
      try {
        const metadata = await ctx.logAnalytics.getMetadata(resourceId);
        outputResult(
          { fileName: `metadata-${resourceId}`, data: metadata, summary: `Metadata for workspace '${resourceId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get metadata'); }
    });

  workspace
    .command('test')
    .description('Test access to a Log Analytics workspace')
    .argument('<resourceId>', 'Resource ID')
    .action(async (resourceId: string) => {
      try {
        const result = await ctx.logAnalytics.testWorkspaceAccess(resourceId);
        outputResult(
          { fileName: `test-${resourceId}`, data: result, summary: result.success ? `Access OK: ${result.message}` : `Access FAILED: ${result.message}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'test access'); }
    });
}
