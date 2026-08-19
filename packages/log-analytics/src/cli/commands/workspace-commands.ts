/**
 * Workspace CLI Commands - 4 commands for workspace management
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
    .description('Get the schema catalogue (tables and columns) a workspace could hold')
    .argument('<resourceId>', 'Resource ID (use workspace list to find IDs)')
    .action(async (resourceId: string) => {
      try {
        const metadata = await ctx.logAnalytics.getMetadata(resourceId);
        // Name the scope in the summary line too. It is often the only part read before a
        // report is written, and a bare table count reads as an inventory.
        const count = metadata.scope?.tableCount ?? metadata.tables?.length ?? 0;
        outputResult(
          {
            fileName: `metadata-${resourceId}`,
            data: metadata,
            summary: `Schema catalogue for workspace '${resourceId}': ${count} table(s) it could hold, not what it holds - use 'workspace tables' for that`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get metadata'); }
    });

  workspace
    .command('tables')
    .description('List the data types a workspace has actually ingested (from the Usage table)')
    .argument('<resourceId>', 'Resource ID (use workspace list to find IDs)')
    .option('-t, --timespan <timespan>', 'Window to measure (e.g. P7D, P30D)', 'P7D')
    .action(async (resourceId: string, opts: any) => {
      try {
        const result = await ctx.logAnalytics.listWorkspaceTables(resourceId, opts.timespan);
        const { total, timespan, note } = result.summary;
        outputResult(
          {
            fileName: `workspace-tables-${resourceId}`,
            data: result,
            summary: `${total} data type(s) ingested in ${timespan}${note ? ` - ${note}` : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list workspace tables'); }
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
