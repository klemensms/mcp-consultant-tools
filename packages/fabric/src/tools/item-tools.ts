/**
 * Item Tools - Microsoft Fabric item MCP tools.
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  WORKSPACE_ID_EXAMPLES,
  ITEM_ID_EXAMPLES,
  ITEM_TYPE_EXAMPLES,
} from '../tool-examples.js';

export function registerItemTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'fabric-list-items',
    'List items (lakehouses, warehouses, notebooks, pipelines, semantic models, reports, etc.) in a Microsoft Fabric workspace.',
    {
      workspaceId: z.string().describe(descWithExamples('Workspace ID (GUID)', WORKSPACE_ID_EXAMPLES)),
      type: z.string().optional().describe(descWithExamples('Optional item type filter', ITEM_TYPE_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ workspaceId, type }: any) => {
      try {
        const result = await ctx.items.listItems(workspaceId, type);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error listing Fabric items:', error);
        return { content: [{ type: 'text', text: `Failed to list items: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-get-item',
    'Get details of a single Microsoft Fabric item by ID.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      itemId: z.string().describe(descWithExamples('Item ID (GUID)', ITEM_ID_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ workspaceId, itemId }: any) => {
      try {
        const result = await ctx.items.getItem(workspaceId, itemId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error getting Fabric item:', error);
        return { content: [{ type: 'text', text: `Failed to get item: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-create-item',
    'Create a generic Microsoft Fabric item of any type in a workspace. WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      displayName: z.string().describe('Display name for the new item'),
      type: z.string().describe(descWithExamples('Fabric item type', ITEM_TYPE_EXAMPLES)),
      description: z.string().optional().describe('Optional item description'),
      definition: z.any().optional().describe('Optional item definition payload (type-specific)'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ workspaceId, displayName, type, description, definition }: any) => {
      try {
        const result = await ctx.items.createItem(workspaceId, { displayName, type, description, definition });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error creating Fabric item:', error);
        return { content: [{ type: 'text', text: `Failed to create item: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-update-item',
    'Update a Microsoft Fabric item display name and/or description. WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      itemId: z.string().describe('Item ID (GUID)'),
      displayName: z.string().optional().describe('New display name'),
      description: z.string().optional().describe('New description'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ workspaceId, itemId, displayName, description }: any) => {
      try {
        const result = await ctx.items.updateItem(workspaceId, itemId, { displayName, description });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error updating Fabric item:', error);
        return { content: [{ type: 'text', text: `Failed to update item: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-delete-item',
    'Delete a Microsoft Fabric item. DESTRUCTIVE operation - requires FABRIC_ENABLE_DELETE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      itemId: z.string().describe('Item ID (GUID) to delete'),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ workspaceId, itemId }: any) => {
      try {
        const result = await ctx.items.deleteItem(workspaceId, itemId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error deleting Fabric item:', error);
        return { content: [{ type: 'text', text: `Failed to delete item: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-create-lakehouse',
    'Create a lakehouse in a Microsoft Fabric workspace. WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      displayName: z.string().describe('Display name for the new lakehouse'),
      description: z.string().optional().describe('Optional description'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ workspaceId, displayName, description }: any) => {
      try {
        const result = await ctx.items.createLakehouse(workspaceId, { displayName, description });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error creating Fabric lakehouse:', error);
        return { content: [{ type: 'text', text: `Failed to create lakehouse: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-create-warehouse',
    'Create a warehouse in a Microsoft Fabric workspace. WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      displayName: z.string().describe('Display name for the new warehouse'),
      description: z.string().optional().describe('Optional description'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ workspaceId, displayName, description }: any) => {
      try {
        const result = await ctx.items.createWarehouse(workspaceId, { displayName, description });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error creating Fabric warehouse:', error);
        return { content: [{ type: 'text', text: `Failed to create warehouse: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-create-notebook',
    'Create a notebook in a Microsoft Fabric workspace. WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      displayName: z.string().describe('Display name for the new notebook'),
      description: z.string().optional().describe('Optional description'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ workspaceId, displayName, description }: any) => {
      try {
        const result = await ctx.items.createNotebook(workspaceId, { displayName, description });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error creating Fabric notebook:', error);
        return { content: [{ type: 'text', text: `Failed to create notebook: ${error.message}` }], isError: true };
      }
    },
  );
}
