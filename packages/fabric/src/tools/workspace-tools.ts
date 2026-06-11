/**
 * Workspace Tools - Microsoft Fabric workspace MCP tools.
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, WORKSPACE_ID_EXAMPLES, CAPACITY_ID_EXAMPLES } from '../tool-examples.js';

const PRINCIPAL_TYPES = ['User', 'Group', 'ServicePrincipal', 'ServicePrincipalProfile'] as const;
const WORKSPACE_ROLES = ['Admin', 'Member', 'Contributor', 'Viewer'] as const;

export function registerWorkspaceTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'fabric-list-workspaces',
    'List all Microsoft Fabric workspaces the service principal can access.',
    {},
    async () => {
      try {
        const result = await ctx.workspaces.listWorkspaces();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error listing Fabric workspaces:', error);
        return { content: [{ type: 'text', text: `Failed to list workspaces: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-get-workspace',
    'Get details of a single Microsoft Fabric workspace by ID.',
    {
      workspaceId: z.string().describe(descWithExamples('Workspace ID (GUID)', WORKSPACE_ID_EXAMPLES)),
    },
    async ({ workspaceId }: any) => {
      try {
        const result = await ctx.workspaces.getWorkspace(workspaceId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error getting Fabric workspace:', error);
        return { content: [{ type: 'text', text: `Failed to get workspace: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-create-workspace',
    'Create a new Microsoft Fabric workspace. WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      displayName: z.string().describe('Display name for the new workspace'),
      description: z.string().optional().describe('Optional workspace description'),
      capacityId: z.string().optional().describe(descWithExamples('Optional capacity ID to assign the workspace to', CAPACITY_ID_EXAMPLES)),
    },
    async ({ displayName, description, capacityId }: any) => {
      try {
        const result = await ctx.workspaces.createWorkspace({ displayName, description, capacityId });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error creating Fabric workspace:', error);
        return { content: [{ type: 'text', text: `Failed to create workspace: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-update-workspace',
    'Update a Microsoft Fabric workspace display name and/or description. WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      displayName: z.string().optional().describe('New display name'),
      description: z.string().optional().describe('New description'),
    },
    async ({ workspaceId, displayName, description }: any) => {
      try {
        const result = await ctx.workspaces.updateWorkspace(workspaceId, { displayName, description });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error updating Fabric workspace:', error);
        return { content: [{ type: 'text', text: `Failed to update workspace: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-delete-workspace',
    'Delete a Microsoft Fabric workspace. DESTRUCTIVE operation - requires FABRIC_ENABLE_DELETE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID) to delete'),
    },
    async ({ workspaceId }: any) => {
      try {
        const result = await ctx.workspaces.deleteWorkspace(workspaceId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error deleting Fabric workspace:', error);
        return { content: [{ type: 'text', text: `Failed to delete workspace: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-list-workspace-role-assignments',
    'List role assignments (principals and their roles) on a Microsoft Fabric workspace.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
    },
    async ({ workspaceId }: any) => {
      try {
        const result = await ctx.workspaces.listRoleAssignments(workspaceId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error listing Fabric workspace role assignments:', error);
        return { content: [{ type: 'text', text: `Failed to list role assignments: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-add-workspace-role-assignment',
    'Grant a principal a role on a Microsoft Fabric workspace. WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      principalId: z.string().describe('Principal ID (GUID of the user, group, or service principal)'),
      principalType: z.enum(PRINCIPAL_TYPES).describe('Type of the principal'),
      role: z.enum(WORKSPACE_ROLES).describe('Role to grant'),
    },
    async ({ workspaceId, principalId, principalType, role }: any) => {
      try {
        const result = await ctx.workspaces.addRoleAssignment(workspaceId, { principalId, principalType, role });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error adding Fabric workspace role assignment:', error);
        return { content: [{ type: 'text', text: `Failed to add role assignment: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-remove-workspace-role-assignment',
    'Remove a principal\'s role assignment from a Microsoft Fabric workspace. WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      principalId: z.string().describe('Principal ID (GUID) whose role assignment should be removed'),
    },
    async ({ workspaceId, principalId }: any) => {
      try {
        const result = await ctx.workspaces.removeRoleAssignment(workspaceId, principalId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error removing Fabric workspace role assignment:', error);
        return { content: [{ type: 'text', text: `Failed to remove role assignment: ${error.message}` }], isError: true };
      }
    },
  );
}
