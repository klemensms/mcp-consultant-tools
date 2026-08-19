/**
 * Logic Apps CLI Commands - 2 commands mapping to the logic app MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerLogicAppCommands(program: Command, ctx: ServiceContext): void {
  const logicApps = program.command('logic-apps').description('Azure Logic Apps operations');

  logicApps
    .command('list-workflows')
    .description('List Logic App workflows in the subscription or resource group')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .option(
      '--include-definition',
      'Return the full definition and parameters blocks (withheld by default)'
    )
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.logicApps.listWorkflows({
          resourceGroup: opts.resourceGroup,
          includeDefinition: opts.includeDefinition,
        });
        const { total, enabled, note } = result.summary;
        const summary =
          `Found ${total} workflow(s), ${enabled} enabled` + (note ? `\n${note}` : '');
        outputResult(
          { fileName: 'logic-app-workflows', data: result, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list logic app workflows'); }
    });

  logicApps
    .command('list-connections')
    .description('List API connections (sweeps every resource group unless one is given)')
    .option('-g, --resource-group <name>', 'Ask one resource group directly instead of sweeping')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.logicApps.listApiConnections({
          resourceGroup: opts.resourceGroup,
        });
        const { total, broken, note } = result.summary;
        const summary =
          `Found ${total} API connection(s), ${broken} not Connected` + (note ? `\n${note}` : '');
        outputResult(
          { fileName: 'api-connections', data: result, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list api connections'); }
    });
}
