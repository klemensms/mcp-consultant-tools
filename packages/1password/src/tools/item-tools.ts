/**
 * Item tools — 10 tools (4 read, 4 write, 2 delete)
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  ITEM_CATEGORY_EXAMPLES,
  ITEM_FIELDS_EXAMPLES,
  VAULT_NAME_EXAMPLES,
} from '../tool-examples.js';

export function registerItemTools(server: any, ctx: ServiceContext): void {

  // ── Read tools (always enabled) ────────────────────────────────

  server.tool(
    "list-items",
    "List items in a 1Password vault. Supports title/tag filtering (client-side). Always enabled.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or ID", VAULT_NAME_EXAMPLES)),
      title: z.string().optional().describe("Filter by title (substring match, case-insensitive)"),
      tag: z.string().optional().describe("Filter by tag (exact match, case-insensitive)"),
      state: z.enum(["active", "archived"]).optional().describe("Filter by item state (default: all)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ vaultId, title, tag, state }: any) => {
      try {
        const resolvedVaultId = await ctx.client.resolveVaultId(vaultId);
        const items = await ctx.items.listItems(resolvedVaultId, { title, tag, state });
        return {
          content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error listing items: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-item",
    "Get full item details including all field values (including concealed fields). Always enabled.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or ID", VAULT_NAME_EXAMPLES)),
      itemId: z.string().describe("Item UUID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ vaultId, itemId }: any) => {
      try {
        const resolvedVaultId = await ctx.client.resolveVaultId(vaultId);
        const item = await ctx.items.getItem(resolvedVaultId, itemId);
        return {
          content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error getting item: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "batch-get-items",
    "Get up to 50 items at once from a vault. Always enabled.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or ID", VAULT_NAME_EXAMPLES)),
      itemIds: z.array(z.string()).describe("Array of item UUIDs (max 50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ vaultId, itemIds }: any) => {
      try {
        const resolvedVaultId = await ctx.client.resolveVaultId(vaultId);
        const items = await ctx.items.batchGetItems(resolvedVaultId, itemIds);
        return {
          content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error batch getting items: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "search-items",
    "Search items across all allowed vaults by title and/or tag. Always enabled.",
    {
      title: z.string().optional().describe("Filter by title (substring match, case-insensitive)"),
      tag: z.string().optional().describe("Filter by tag (exact match, case-insensitive)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ title, tag }: any) => {
      try {
        const items = await ctx.items.searchItems({ title, tag });
        return {
          content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error searching items: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Write tools (require OP_ENABLE_WRITE=true) ─────────────────

  server.tool(
    "create-item",
    "Create a new item in a 1Password vault. Requires OP_ENABLE_WRITE=true.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or ID", VAULT_NAME_EXAMPLES)),
      category: z.string().describe(descWithExamples("Item category", ITEM_CATEGORY_EXAMPLES)),
      title: z.string().describe("Item title"),
      fields: z.array(z.any()).optional().describe(descWithExamples("Item fields array", ITEM_FIELDS_EXAMPLES)),
      notes: z.string().optional().describe("Item notes (top-level property, not a field)"),
      tags: z.array(z.string()).optional().describe("Item tags for categorization"),
      websites: z.array(z.any()).optional().describe("Websites for autofill (Login/Password items)"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ vaultId, category, title, fields, notes, tags, websites }: any) => {
      try {
        ctx.checkWriteEnabled();
        const resolvedVaultId = await ctx.client.resolveVaultId(vaultId);
        const item = { category, title, fields, notes, tags, websites };
        const result = await ctx.items.createItem(resolvedVaultId, item);
        return {
          content: [{ type: "text", text: `Item created: ${result.title} (${result.id})\n\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error creating item: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "update-item",
    "Update an existing item (get-merge-put). Only include fields to change. Requires OP_ENABLE_WRITE=true.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or ID", VAULT_NAME_EXAMPLES)),
      itemId: z.string().describe("Item UUID to update"),
      title: z.string().optional().describe("New title"),
      fields: z.array(z.any()).optional().describe("Fields to update (matched by id or title)"),
      notes: z.string().optional().describe("New notes"),
      tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ vaultId, itemId, ...changes }: any) => {
      try {
        ctx.checkWriteEnabled();
        const resolvedVaultId = await ctx.client.resolveVaultId(vaultId);
        const result = await ctx.items.updateItem(resolvedVaultId, itemId, changes);
        return {
          content: [{ type: "text", text: `Item updated: ${result.title} (${result.id})\n\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error updating item: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "archive-item",
    "Archive an item (soft removal). Requires OP_ENABLE_WRITE=true.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or ID", VAULT_NAME_EXAMPLES)),
      itemId: z.string().describe("Item UUID to archive"),
    },
    // Soft removal (reversible), but removes the item from active use → rule-classified destructive.
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ vaultId, itemId }: any) => {
      try {
        ctx.checkWriteEnabled();
        const resolvedVaultId = await ctx.client.resolveVaultId(vaultId);
        await ctx.items.archiveItem(resolvedVaultId, itemId);
        return {
          content: [{ type: "text", text: `Item archived: ${itemId}` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error archiving item: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "batch-create-items",
    "Create up to 100 items at once. Requires OP_ENABLE_WRITE=true.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or ID", VAULT_NAME_EXAMPLES)),
      items: z.array(z.any()).describe("Array of item objects to create (max 100)"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ vaultId, items }: any) => {
      try {
        ctx.checkWriteEnabled();
        const resolvedVaultId = await ctx.client.resolveVaultId(vaultId);
        const results = await ctx.items.batchCreateItems(resolvedVaultId, items);
        return {
          content: [{ type: "text", text: `Created ${results.length} items\n\n${JSON.stringify(results, null, 2)}` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error batch creating items: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Delete tools (require OP_ENABLE_DELETE=true) ───────────────

  server.tool(
    "delete-item",
    "Permanently delete an item. This cannot be undone. Requires OP_ENABLE_DELETE=true.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or ID", VAULT_NAME_EXAMPLES)),
      itemId: z.string().describe("Item UUID to delete"),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ vaultId, itemId }: any) => {
      try {
        ctx.checkDeleteEnabled();
        const resolvedVaultId = await ctx.client.resolveVaultId(vaultId);
        await ctx.items.deleteItem(resolvedVaultId, itemId);
        return {
          content: [{ type: "text", text: `Item deleted: ${itemId}` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error deleting item: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "batch-delete-items",
    "Delete multiple items at once. This cannot be undone. Requires OP_ENABLE_DELETE=true.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or ID", VAULT_NAME_EXAMPLES)),
      itemIds: z.array(z.string()).describe("Array of item UUIDs to delete"),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ vaultId, itemIds }: any) => {
      try {
        ctx.checkDeleteEnabled();
        const resolvedVaultId = await ctx.client.resolveVaultId(vaultId);
        await ctx.items.batchDeleteItems(resolvedVaultId, itemIds);
        return {
          content: [{ type: "text", text: `Deleted ${itemIds.length} items` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error batch deleting items: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
