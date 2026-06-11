/**
 * Microsoft Fabric MCP prompts.
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';

export function registerFabricPrompts(server: any, ctx: ServiceContext): void {
  server.prompt(
    'fabric-workspace-overview',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
    },
    async ({ workspaceId }: any) => {
      try {
        const workspace = await ctx.workspaces.getWorkspace(workspaceId);
        const items = await ctx.items.listItems(workspaceId);
        const roleAssignments = await ctx.workspaces.listRoleAssignments(workspaceId);

        const sections = [
          `# Fabric Workspace Overview: ${workspace.displayName ?? workspaceId}`,
          '',
          '## Workspace',
          '```json',
          JSON.stringify(workspace, null, 2),
          '```',
          '',
          `## Items (${items.count})`,
          '```json',
          JSON.stringify(items.items, null, 2),
          '```',
          '',
          `## Role Assignments (${roleAssignments.count})`,
          '```json',
          JSON.stringify(roleAssignments.roleAssignments, null, 2),
          '```',
        ];

        return {
          description: `Fabric workspace overview: ${workspace.displayName ?? workspaceId}`,
          messages: [
            { role: 'user', content: { type: 'text', text: `Show an overview of Fabric workspace ${workspaceId}` } },
            { role: 'assistant', content: { type: 'text', text: sections.join('\n') } },
          ],
        };
      } catch (error: any) {
        console.error('Error generating Fabric workspace overview:', error);
        throw error;
      }
    },
  );

  server.prompt('fabric-tenant-inventory', {}, async () => {
    try {
      const workspaces = await ctx.admin.listWorkspaces();
      const domains = await ctx.domains.listDomains();

      const sections = [
        '# Fabric Tenant Inventory',
        '',
        `## Workspaces (${workspaces.count})`,
        '```json',
        JSON.stringify(workspaces.workspaces, null, 2),
        '```',
        '',
        `## Domains (${domains.count})`,
        '```json',
        JSON.stringify(domains.domains, null, 2),
        '```',
      ];

      return {
        description: 'Fabric tenant-wide workspace and domain inventory',
        messages: [
          { role: 'user', content: { type: 'text', text: 'Show the Fabric tenant inventory' } },
          { role: 'assistant', content: { type: 'text', text: sections.join('\n') } },
        ],
      };
    } catch (error: any) {
      console.error('Error generating Fabric tenant inventory:', error);
      throw error;
    }
  });
}
