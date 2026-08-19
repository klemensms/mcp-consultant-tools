/**
 * Compute CLI Commands - 1 command mapping to the compute MCP tool
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerComputeCommands(program: Command, ctx: ServiceContext): void {
  const compute = program.command('compute').description('Azure compute operations');

  compute
    .command('list-vms')
    .description('List virtual machines in the subscription or resource group')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .option(
      '--include-status',
      'Collect runtime power state per VM (one extra ARM call per VM)'
    )
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.compute.listVirtualMachines({
          resourceGroup: opts.resourceGroup,
          includeStatus: opts.includeStatus,
        });
        const { total, byPowerState, note } = result.summary;
        const states = Object.entries(byPowerState)
          .map(([state, count]) => `${count} ${state}`)
          .join(', ');
        const summary =
          `Found ${total} virtual machine(s)` +
          (states ? ` - ${states}` : '') +
          (note ? `\n${note}` : '');
        outputResult(
          { fileName: 'virtual-machines', data: result, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list virtual machines'); }
    });
}
