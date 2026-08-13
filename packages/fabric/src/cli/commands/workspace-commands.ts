/**
 * Workspace CLI Commands - mirrors the fabric workspace MCP tools.
 */
import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerWorkspaceCommands(program: Command, ctx: ServiceContext): void {
  const workspace = program.command('workspace').description('Workspace operations');

  workspace
    .command('list')
    .description('List all Fabric workspaces')
    .action(async () => {
      try {
        const result = await ctx.workspaces.listWorkspaces();
        outputResult(
          { fileName: 'workspaces', data: result, summary: `Found ${result.count} workspace(s)` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'list workspaces'); }
    });

  workspace
    .command('get')
    .description('Get a workspace by ID')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .action(async (workspaceId: string) => {
      try {
        const result = await ctx.workspaces.getWorkspace(workspaceId);
        outputResult(
          { fileName: `workspace-${workspaceId}`, data: result, summary: `Workspace '${result.displayName ?? workspaceId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'get workspace'); }
    });

  workspace
    .command('create')
    .description('Create a new workspace (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<displayName>', 'Display name for the new workspace')
    .option('-d, --description <text>', 'Workspace description')
    .option('-c, --capacity-id <id>', 'Capacity ID to assign the workspace to')
    .action(async (displayName: string, opts: any) => {
      try {
        const result = await ctx.workspaces.createWorkspace({
          displayName,
          description: opts.description,
          capacityId: opts.capacityId,
        });
        outputResult(
          { persist: false, fileName: `workspace-created`, data: result, summary: `Created workspace '${displayName}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'create workspace'); }
    });

  workspace
    .command('update')
    .description('Update a workspace (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .option('-n, --display-name <name>', 'New display name')
    .option('-d, --description <text>', 'New description')
    .action(async (workspaceId: string, opts: any) => {
      try {
        const result = await ctx.workspaces.updateWorkspace(workspaceId, {
          displayName: opts.displayName,
          description: opts.description,
        });
        outputResult(
          { persist: false, fileName: `workspace-updated-${workspaceId}`, data: result, summary: `Updated workspace '${workspaceId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'update workspace'); }
    });

  workspace
    .command('delete')
    .description('Delete a workspace - DESTRUCTIVE (requires FABRIC_ENABLE_DELETE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID) to delete')
    .action(async (workspaceId: string) => {
      try {
        const result = await ctx.workspaces.deleteWorkspace(workspaceId);
        outputResult(
          { persist: false, fileName: `workspace-deleted-${workspaceId}`, data: result, summary: `Deleted workspace '${workspaceId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'delete workspace'); }
    });

  workspace
    .command('list-roles')
    .description('List role assignments on a workspace')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .action(async (workspaceId: string) => {
      try {
        const result = await ctx.workspaces.listRoleAssignments(workspaceId);
        outputResult(
          { fileName: `workspace-roles-${workspaceId}`, data: result, summary: `Found ${result.count} role assignment(s) on '${workspaceId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'list workspace role assignments'); }
    });

  workspace
    .command('add-role')
    .description('Add a role assignment to a workspace (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .requiredOption('--principal-id <id>', 'Principal ID (GUID)')
    .requiredOption('--principal-type <type>', 'Principal type: User | Group | ServicePrincipal | ServicePrincipalProfile')
    .requiredOption('--role <role>', 'Role: Admin | Member | Contributor | Viewer')
    .action(async (workspaceId: string, opts: any) => {
      try {
        const result = await ctx.workspaces.addRoleAssignment(workspaceId, {
          principalId: opts.principalId,
          principalType: opts.principalType,
          role: opts.role,
        });
        outputResult(
          { persist: false, fileName: `workspace-role-added-${workspaceId}`, data: result, summary: `Granted ${opts.role} to ${opts.principalId} on '${workspaceId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'add workspace role assignment'); }
    });

  workspace
    .command('remove-role')
    .description('Remove a role assignment from a workspace (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<workspaceId>', 'Workspace ID (GUID)')
    .argument('<principalId>', 'Principal ID (GUID) to remove')
    .action(async (workspaceId: string, principalId: string) => {
      try {
        const result = await ctx.workspaces.removeRoleAssignment(workspaceId, principalId);
        outputResult(
          { persist: false, fileName: `workspace-role-removed-${workspaceId}`, data: result, summary: `Removed ${principalId} from '${workspaceId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'remove workspace role assignment'); }
    });
}
