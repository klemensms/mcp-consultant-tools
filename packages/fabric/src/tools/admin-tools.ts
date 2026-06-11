/**
 * Admin Tools - Microsoft Fabric tenant-wide admin MCP tools (read-only).
 *
 * Admin routes use the Fabric admin API and require Fabric admin rights
 * plus the relevant tenant-setting opt-in.
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ITEM_TYPE_EXAMPLES, WORKSPACE_ID_EXAMPLES } from '../tool-examples.js';

export function registerAdminTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'fabric-admin-list-workspaces',
    'List all workspaces in the tenant (admin view). Uses the Fabric admin API - requires Fabric admin rights.',
    {},
    async () => {
      try {
        const result = await ctx.admin.listWorkspaces();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error listing Fabric workspaces (admin):', error);
        return { content: [{ type: 'text', text: `Failed to list workspaces (admin): ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-admin-list-items',
    'List the tenant-wide item inventory (admin view), optionally filtered by item type or workspace. Uses the Fabric admin API - requires Fabric admin rights.',
    {
      type: z.string().optional().describe(descWithExamples('Optional item type filter', ITEM_TYPE_EXAMPLES)),
      workspaceId: z.string().optional().describe(descWithExamples('Optional workspace ID filter', WORKSPACE_ID_EXAMPLES)),
    },
    async ({ type, workspaceId }: any) => {
      try {
        const result = await ctx.admin.listItems({ type, workspaceId });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error listing Fabric items (admin):', error);
        return { content: [{ type: 'text', text: `Failed to list items (admin): ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-admin-get-tenant-settings',
    'Get the Microsoft Fabric tenant settings (read-only). Uses the Fabric admin API - requires Fabric admin rights.',
    {},
    async () => {
      try {
        const result = await ctx.admin.getTenantSettings();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error getting Fabric tenant settings:', error);
        return { content: [{ type: 'text', text: `Failed to get tenant settings: ${error.message}` }], isError: true };
      }
    },
  );
}
