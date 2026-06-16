/**
 * Checklist Tools - 8 tools for ADO work item checklists
 *
 * Read tools (always available):
 * - get-checklist: Merged checklist for a work item
 * - get-checklist-template: Default template for a work item type
 * - list-checklist-templates: All templates in a project
 * - get-checklist-report: Completion report across work items
 *
 * Write tools (require AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true):
 * - update-checklist-item: Update state of a checklist item
 * - add-checklist-item: Add custom item to shared checklist
 * - remove-checklist-item: Remove custom item from shared checklist
 * - update-checklist-template: Modify a WIT default template
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  CHECKLIST_STATE_EXAMPLES,
  CHECKLIST_WIT_EXAMPLES,
  CHECKLIST_REPORT_EXAMPLES,
  CHECKLIST_TEMPLATE_ITEMS_EXAMPLES,
} from '../tool-examples.js';

export function registerChecklistTools(server: any, ctx: ServiceContext): void {

  // ─── Read Tools ──────────────────────────────────────────────────────────

  server.tool(
    "get-checklist",
    "Get the merged checklist for a work item. Combines the WIT default template with per-work-item state overrides and custom items. Shows completion status for each item.",
    {
      project: z.string().describe("The project name"),
      workItemId: zCoerceNumber().describe("The work item ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, workItemId }: any) => {
      try {
        const result = await ctx.checklist.getChecklist(project, workItemId);
        const summary = result.items.map(i =>
          `${i.state === 'Completed' ? '[x]' : '[ ]'} ${i.text} (${i.state})${i.required ? ' *required*' : ''}${i.isTemplateItem ? '' : ' [custom]'}`
        ).join('\n');
        return {
          content: [{
            type: "text",
            text: `Checklist for ${result.workItemType} #${workItemId} — ${result.completionPercent}% complete (${result.completedCount}/${result.totalCount})\n\n${summary}\n\nFull data:\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        console.error("Error getting checklist:", error);
        return { content: [{ type: "text", text: `Failed to get checklist: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get-checklist-template",
    "Get the default checklist template for a work item type in a project. Templates define the standard checklist items that appear on all work items of that type.",
    {
      project: z.string().describe("The project name"),
      workItemType: z.string().describe(
        descWithExamples("The work item type name", CHECKLIST_WIT_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, workItemType }: any) => {
      try {
        const result = await ctx.checklist.getTemplate(project, workItemType);
        if (!result) {
          return { content: [{ type: "text", text: `No checklist template found for '${workItemType}' in project '${project}'.` }] };
        }
        const summary = result.checklistItems.map(i =>
          `- ${i.text}${i.required !== false ? ' (required)' : ' (optional)'}`
        ).join('\n');
        return {
          content: [{
            type: "text",
            text: `Checklist template for '${workItemType}' (${result.checklistItems.length} items):\n\n${summary}\n\nFull data:\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        console.error("Error getting checklist template:", error);
        return { content: [{ type: "text", text: `Failed to get checklist template: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "list-checklist-templates",
    "List all checklist templates configured in a project. Shows which work item types have checklist templates and how many items each has.",
    {
      project: z.string().describe("The project name"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project }: any) => {
      try {
        const result = await ctx.checklist.listTemplates(project);
        if (result.length === 0) {
          return { content: [{ type: "text", text: `No checklist templates found in project '${project}'.` }] };
        }
        const summary = result.map(t =>
          `- ${t.workItemType}: ${t.itemCount} items (${t.requiredCount} required)`
        ).join('\n');
        return {
          content: [{
            type: "text",
            text: `Checklist templates in '${project}' (${result.length} types):\n\n${summary}\n\nFull data:\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        console.error("Error listing checklist templates:", error);
        return { content: [{ type: "text", text: `Failed to list checklist templates: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get-checklist-report",
    "Get a completion report for checklists across work items. Cross-references checklist data with ADO work items to show which items have incomplete checklists. Results sorted by completion (least complete first).",
    {
      project: z.string().describe("The project name"),
      workItemType: z.string().optional().describe(
        descWithExamples("Filter by work item type", CHECKLIST_WIT_EXAMPLES)
      ),
      workItemState: z.string().optional().describe(
        descWithExamples("Filter by work item state (e.g., 'Active', 'Testing', 'Resolved')", CHECKLIST_REPORT_EXAMPLES)
      ),
      maxResults: zCoerceNumber().optional().describe("Maximum work items to include (default: 200)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, workItemType, workItemState, maxResults }: any) => {
      try {
        const result = await ctx.checklist.getReport(project, workItemType, workItemState, maxResults || 200);
        if (result.totalWorkItems === 0) {
          return { content: [{ type: "text", text: `No work items found matching the criteria in project '${project}'.` }] };
        }
        const summary = [
          `Checklist Report — ${result.totalWorkItems} work items`,
          `  Complete: ${result.fullyComplete} | Partial: ${result.partiallyComplete} | Not started: ${result.notStarted}`,
          '',
          ...result.entries.slice(0, 20).map(e =>
            `#${e.workItemId} ${e.title} — ${e.completionPercent}% (${e.completedItems}/${e.totalItems})${e.incompleteRequired > 0 ? ` [${e.incompleteRequired} required incomplete]` : ''}`
          ),
          result.entries.length > 20 ? `\n... and ${result.entries.length - 20} more (see full data)` : '',
        ].join('\n');

        return {
          content: [{
            type: "text",
            text: `${summary}\n\nFull data:\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        console.error("Error getting checklist report:", error);
        return { content: [{ type: "text", text: `Failed to get checklist report: ${error.message}` }], isError: true };
      }
    }
  );

  // ─── Write Tools ─────────────────────────────────────────────────────────

  server.tool(
    "update-checklist-item",
    "Update the state of a checklist item on a work item. When setting to 'Completed', automatically records who completed it and when. Requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true.",
    {
      project: z.string().describe("The project name"),
      workItemId: zCoerceNumber().describe("The work item ID"),
      itemId: z.string().describe("The checklist item ID (from get-checklist response)"),
      state: z.enum(["New", "In Progress", "Blocked", "N/A", "Completed"]).describe(
        descWithExamples("The new state for the checklist item", CHECKLIST_STATE_EXAMPLES)
      ),
      completedByDisplayName: z.string().optional().describe("Display name for completedBy (defaults to 'MCP Automation'). Only used when state is 'Completed'."),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, workItemId, itemId, state, completedByDisplayName }: any) => {
      try {
        const result = await ctx.checklist.updateItemState(project, workItemId, itemId, state, completedByDisplayName);
        return {
          content: [{
            type: "text",
            text: `Updated checklist item '${itemId}' on work item #${workItemId} to '${state}'.\n\nUpdated checklist (${result.completionPercent}% complete):\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        console.error("Error updating checklist item:", error);
        return { content: [{ type: "text", text: `Failed to update checklist item: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "add-checklist-item",
    "Add a custom checklist item to a work item's shared checklist. Custom items are visible to all users. Max 128 characters. Requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true.",
    {
      project: z.string().describe("The project name"),
      workItemId: zCoerceNumber().describe("The work item ID"),
      text: z.string().describe("The checklist item text (max 128 characters)"),
      required: z.boolean().optional().describe("Whether the item is required (default: false)"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, workItemId, text, required }: any) => {
      try {
        const result = await ctx.checklist.addItem(project, workItemId, text, required);
        return {
          content: [{
            type: "text",
            text: `Added custom checklist item to work item #${workItemId}.\n\nUpdated checklist (${result.completionPercent}% complete):\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        console.error("Error adding checklist item:", error);
        return { content: [{ type: "text", text: `Failed to add checklist item: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "remove-checklist-item",
    "Remove a custom checklist item from a work item's shared checklist. Only custom items can be removed (not template items). Requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true.",
    {
      project: z.string().describe("The project name"),
      workItemId: zCoerceNumber().describe("The work item ID"),
      itemId: z.string().describe("The checklist item ID to remove (from get-checklist response, must be a custom item)"),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ project, workItemId, itemId }: any) => {
      try {
        const result = await ctx.checklist.removeItem(project, workItemId, itemId);
        return {
          content: [{
            type: "text",
            text: `Removed checklist item '${itemId}' from work item #${workItemId}.\n\nUpdated checklist (${result.completionPercent}% complete):\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        console.error("Error removing checklist item:", error);
        return { content: [{ type: "text", text: `Failed to remove checklist item: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "update-checklist-template",
    "Update the default checklist template for a work item type. Replaces all template items. Changes affect all work items of that type immediately. Requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true.",
    {
      project: z.string().describe("The project name"),
      workItemType: z.string().describe(
        descWithExamples("The work item type name", CHECKLIST_WIT_EXAMPLES)
      ),
      items: z.string().describe(
        descWithExamples(
          "JSON array of template items. Each item: {text: string, required?: boolean}. Max 128 chars per item.",
          CHECKLIST_TEMPLATE_ITEMS_EXAMPLES
        )
      ),
    },
    // update-* config replace: overwrites template items but not user data → non-destructive.
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, workItemType, items }: any) => {
      try {
        const parsedItems = JSON.parse(items);
        if (!Array.isArray(parsedItems)) {
          throw new Error('items must be a JSON array');
        }
        const result = await ctx.checklist.updateTemplate(project, workItemType, parsedItems);
        return {
          content: [{
            type: "text",
            text: `Updated checklist template for '${workItemType}' (${result.checklistItems.length} items).\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        console.error("Error updating checklist template:", error);
        return { content: [{ type: "text", text: `Failed to update checklist template: ${error.message}` }], isError: true };
      }
    }
  );
}
