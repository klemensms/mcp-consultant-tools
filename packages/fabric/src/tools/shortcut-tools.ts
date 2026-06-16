/**
 * Shortcut Tools - Microsoft Fabric OneLake shortcut MCP tools.
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ITEM_ID_EXAMPLES, SHORTCUT_TARGET_EXAMPLES } from '../tool-examples.js';

export function registerShortcutTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'fabric-list-shortcuts',
    'List OneLake shortcuts defined in a Microsoft Fabric item (typically a lakehouse).',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      itemId: z.string().describe(descWithExamples('Item ID (GUID) that owns the shortcuts', ITEM_ID_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ workspaceId, itemId }: any) => {
      try {
        const result = await ctx.shortcuts.listShortcuts(workspaceId, itemId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error listing Fabric shortcuts:', error);
        return { content: [{ type: 'text', text: `Failed to list shortcuts: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-create-shortcut',
    'Create a OneLake shortcut (zero-copy virtual reference into ADLS Gen2, S3, Dataverse, or another OneLake location). WRITE operation - requires FABRIC_ENABLE_WRITE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      itemId: z.string().describe('Item ID (GUID) the shortcut is created under'),
      path: z.string().describe('Path within the item where the shortcut is created (e.g. "Tables" or "Files/folder")'),
      name: z.string().describe('Name of the shortcut'),
      target: z.record(z.any()).describe(
        descWithExamples(
          'Connector-specific target object (e.g. adlsGen2, amazonS3, oneLake, dataverse)',
          SHORTCUT_TARGET_EXAMPLES,
        ),
      ),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ workspaceId, itemId, path, name, target }: any) => {
      try {
        const result = await ctx.shortcuts.createShortcut(workspaceId, itemId, { path, name, target });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error creating Fabric shortcut:', error);
        return { content: [{ type: 'text', text: `Failed to create shortcut: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-delete-shortcut',
    'Delete a OneLake shortcut from a Microsoft Fabric item. DESTRUCTIVE operation - requires FABRIC_ENABLE_DELETE=true.',
    {
      workspaceId: z.string().describe('Workspace ID (GUID)'),
      itemId: z.string().describe('Item ID (GUID) that owns the shortcut'),
      shortcutPath: z.string().describe('Path of the shortcut within the item (e.g. "Tables")'),
      shortcutName: z.string().describe('Name of the shortcut to delete'),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ workspaceId, itemId, shortcutPath, shortcutName }: any) => {
      try {
        const result = await ctx.shortcuts.deleteShortcut(workspaceId, itemId, shortcutPath, shortcutName);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error deleting Fabric shortcut:', error);
        return { content: [{ type: 'text', text: `Failed to delete shortcut: ${error.message}` }], isError: true };
      }
    },
  );
}
