/**
 * Capacity Tools - Microsoft Fabric capacity MCP tools.
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, CAPACITY_ID_EXAMPLES, WORKSPACE_ID_EXAMPLES } from '../tool-examples.js';

export function registerCapacityTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'fabric-list-capacities',
    'List all Microsoft Fabric capacities the service principal can access.',
    {},
    async () => {
      try {
        const result = await ctx.capacities.listCapacities();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error listing Fabric capacities:', error);
        return { content: [{ type: 'text', text: `Failed to list capacities: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-get-capacity',
    'Get details of a single Microsoft Fabric capacity by ID.',
    {
      capacityId: z.string().describe(descWithExamples('Capacity ID (GUID)', CAPACITY_ID_EXAMPLES)),
    },
    async ({ capacityId }: any) => {
      try {
        const result = await ctx.capacities.getCapacity(capacityId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error getting Fabric capacity:', error);
        return { content: [{ type: 'text', text: `Failed to get capacity: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-assign-workspace-to-capacity',
    'Assign a Microsoft Fabric workspace to a capacity. WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      workspaceId: z.string().describe(descWithExamples('Workspace ID (GUID)', WORKSPACE_ID_EXAMPLES)),
      capacityId: z.string().describe(descWithExamples('Capacity ID (GUID) to assign the workspace to', CAPACITY_ID_EXAMPLES)),
    },
    async ({ workspaceId, capacityId }: any) => {
      try {
        const result = await ctx.capacities.assignWorkspaceToCapacity(workspaceId, capacityId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error assigning Fabric workspace to capacity:', error);
        return { content: [{ type: 'text', text: `Failed to assign workspace to capacity: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-unassign-workspace-from-capacity',
    'Unassign a Microsoft Fabric workspace from its capacity. WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      workspaceId: z.string().describe(descWithExamples('Workspace ID (GUID) to unassign', WORKSPACE_ID_EXAMPLES)),
    },
    async ({ workspaceId }: any) => {
      try {
        const result = await ctx.capacities.unassignWorkspaceFromCapacity(workspaceId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error unassigning Fabric workspace from capacity:', error);
        return { content: [{ type: 'text', text: `Failed to unassign workspace from capacity: ${error.message}` }], isError: true };
      }
    },
  );
}
