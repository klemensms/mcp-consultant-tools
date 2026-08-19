/**
 * Networking CLI Commands - 3 commands mapping to networking MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerNetworkingCommands(program: Command, ctx: ServiceContext): void {
  const networking = program.command('networking').description('Azure networking operations');

  networking
    .command('front-doors')
    .description('List all Azure Front Door profiles')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.networking.listFrontDoors({
          resourceGroup: opts.resourceGroup,
        });
        const count = result.summary?.total ?? '?';
        outputResult(
          { fileName: 'front-doors-list', data: result, summary: `Found ${count} Front Door profile(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list front doors'); }
    });

  networking
    .command('get-front-door')
    .description('Get detailed information about an Azure Front Door profile')
    .argument('<name>', 'Front Door profile name')
    .option('-g, --resource-group <name>', 'Resource group')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.management.networking.getFrontDoor({
          name,
          resourceGroup: opts.resourceGroup,
        });
        outputResult(
          { fileName: `front-door-${name}`, data: result, summary: `Front Door '${name}' details` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get front door'); }
    });

  networking
    .command('event-grid-topics')
    .description('List Event Grid topics')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .option('--include-system-topics', 'List system topics too (they are always counted)')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.networking.listEventGridTopics({
          resourceGroup: opts.resourceGroup,
          includeSystemTopics: opts.includeSystemTopics,
        });
        const { total, custom, system, note } = result.summary;
        const summary =
          `Found ${total} Event Grid topic(s): ${custom} custom, ${system} system` +
          (note ? ` - ${note}` : '');
        outputResult(
          { fileName: 'event-grid-topics', data: result, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list event grid topics'); }
    });
}
