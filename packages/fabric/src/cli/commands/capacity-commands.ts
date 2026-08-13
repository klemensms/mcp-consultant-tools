/**
 * Capacity CLI Commands - mirrors the fabric capacity MCP tools.
 */
import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerCapacityCommands(program: Command, ctx: ServiceContext): void {
  const capacity = program.command('capacity').description('Capacity operations');

  capacity
    .command('list')
    .description('List all Fabric capacities')
    .action(async () => {
      try {
        const result = await ctx.capacities.listCapacities();
        outputResult(
          { fileName: 'capacities', data: result, summary: `Found ${result.count} capacity/capacities` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'list capacities'); }
    });

  capacity
    .command('get')
    .description('Get a capacity by ID')
    .argument('<capacityId>', 'Capacity ID (GUID)')
    .action(async (capacityId: string) => {
      try {
        const result = await ctx.capacities.getCapacity(capacityId);
        outputResult(
          { fileName: `capacity-${capacityId}`, data: result, summary: `Capacity '${result.displayName ?? capacityId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'get capacity'); }
    });

  capacity
    .command('assign')
    .description('Assign a workspace to a capacity (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<capacityId>', 'Capacity ID (GUID)')
    .action(async (workspaceId: string, capacityId: string) => {
      try {
        const result = await ctx.capacities.assignWorkspaceToCapacity(workspaceId, capacityId);
        outputResult(
          { persist: false, fileName: `capacity-assign-${workspaceId}`, data: result, summary: `Assigned workspace '${workspaceId}' to capacity '${capacityId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'assign workspace to capacity'); }
    });

  capacity
    .command('unassign')
    .description('Unassign a workspace from its capacity (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .action(async (workspaceId: string) => {
      try {
        const result = await ctx.capacities.unassignWorkspaceFromCapacity(workspaceId);
        outputResult(
          { persist: false, fileName: `capacity-unassign-${workspaceId}`, data: result, summary: `Unassigned workspace '${workspaceId}' from its capacity` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'unassign workspace from capacity'); }
    });
}
