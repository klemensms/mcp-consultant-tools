/**
 * Sync Tools - 8 tools for work item sync and task sync operations
 */
import { fanOutSuffix } from '@mcp-consultant-tools/core';
import { z } from 'zod';
import {
  descWithExamples,
  SYNC_TO_FILE_EXAMPLES,
  SYNC_FROM_FILE_EXAMPLES,
  SYNC_TASKS_TO_FILE_EXAMPLES,
  SYNC_TASKS_FROM_FILE_EXAMPLES,
  CREATE_WORK_ITEM_FILE_EXAMPLES,
} from '../tool-examples.js';
import { zCoerceNumber, zCoerceNumberArray } from '../schemas.js';
import type { ServiceContext } from '../types.js';

export function registerSyncTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "sync-work-item-to-file",
    descWithExamples(
      "Download work item(s) from ADO and save as local markdown file(s). Token-efficient for editing. READ-ONLY: HTML fields are converted to Markdown in the LOCAL FILE only — ADO is never modified. If a field with an HTML table is converted, a lossy-conversion warning is returned; re-read the original with get-work-item before editing it. Can also pull all child work items under a parent (e.g., all User Stories under a Feature).",
      SYNC_TO_FILE_EXAMPLES
    ),
    {
      project: z.string().describe("The project name"),
      workItemIds: zCoerceNumberArray().default([]).describe("Work item IDs to pull (optional if using parentId)"),
      parentId: zCoerceNumber().optional().describe("Pull all child work items of this parent (e.g., Feature ID to pull all User Stories)"),
      childType: z.string().optional().describe("Filter by work item type when using parentId (default: 'User Story'). Common values: 'User Story', 'Bug', 'Task'"),
      folder: z.string().optional().describe("Override folder path (default: docs/user-stories or AZUREDEVOPS_SYNC_FOLDER)"),
      includeComments: z.boolean().optional().describe("Also save comments to {id}-comments.md (default: false)"),
      skipAutoConvert: z.boolean().optional().describe("Skip automatic HTML-to-markdown conversion. Only use when explicitly requested. Default: false (auto-convert enabled)"),
    },
    // Pulls ADO→local file only; ADO is never modified (description says READ-ONLY) → read.
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, workItemIds, parentId, childType, folder, includeComments, skipAutoConvert }: any) => {
      try {
        const result = await ctx.sync.syncWorkItemsToFile(project, workItemIds || [], parentId, childType, folder, includeComments, skipAutoConvert);

        if (result.message) {
          return { content: [{ type: "text", text: result.message }] };
        }

        let banner = '';
        if (result.conversionWarnings?.length) {
          banner =
            `⚠️ TABLE CONVERSION — ${result.conversionWarnings.length} field(s) containing HTML tables were converted to Markdown pipe tables in the LOCAL FILE only. ` +
            `ADO was NOT modified; the original HTML is intact. Complex tables (merged/styled cells) may have lost structure — re-read the original with get-work-item before editing those:\n` +
            result.conversionWarnings.map((w: string) => `  • ${w}`).join('\n') +
            `\n\n`;
        }

        return {
          content: [{ type: "text", text: `${banner}Synced ${result.pulled.length} work item(s) to local files:\n\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (error: any) {
        console.error("Error syncing work items to files:", error);
        return { content: [{ type: "text", text: `Failed to sync work items: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "sync-work-item-from-file",
    descWithExamples(
      "Upload local markdown changes back to ADO. Auto-detects new_*.md files and creates them as new work items. Auto-converts HTML fields to markdown. Requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true.",
      SYNC_FROM_FILE_EXAMPLES
    ),
    {
      project: z.string().describe("The project name"),
      workItemIds: zCoerceNumberArray().default([]).describe("Work item IDs to push (optional - new_*.md files are auto-detected)"),
      folder: z.string().optional().describe("Override folder path (default: docs/user-stories or AZUREDEVOPS_SYNC_FOLDER)"),
      skipAutoConvert: z.boolean().optional().describe("Skip automatic HTML-to-markdown conversion. Only use when explicitly requested. Default: false (auto-convert enabled)"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, workItemIds, folder, skipAutoConvert }: any) => {
      try {
        const result = await ctx.sync.syncWorkItemsFromFile(project, workItemIds || [], folder, skipAutoConvert);

        const summary = [];
        if (result.created.length > 0) summary.push(`Created ${result.created.length} new work item(s)`);
        if (result.pushed.length > 0) summary.push(`Updated ${result.pushed.length} work item(s)`);
        if (result.partial.length > 0) summary.push(`Partially updated ${result.partial.length} work item(s)`);
        if (result.failed.length > 0) summary.push(`Failed: ${result.failed.length}`);

        return {
          content: [{
            type: "text",
            text: `${summary.join(', ')}${fanOutSuffix(result.imagePushes)}:\n\n${JSON.stringify(result, null, 2)}`,
          }],
        };
      } catch (error: any) {
        console.error("Error syncing work items from files:", error);
        return { content: [{ type: "text", text: `Failed to push work items: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "check-work-item-markdown",
    "Check if work item fields are markdown (required for sync) or HTML format.",
    {
      project: z.string().describe("The project name"),
      workItemIds: zCoerceNumberArray().describe("Work item IDs to check"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, workItemIds }: any) => {
      try {
        const result = await ctx.sync.checkWorkItemMarkdown(project, workItemIds);
        return { content: [{ type: "text", text: `Work item format check:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error checking work item formats:", error);
        return { content: [{ type: "text", text: `Failed to check work item formats: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "list-synced-work-items",
    "List work items that have been synced to local markdown files.",
    {
      folder: z.string().optional().describe("Override folder path (default: docs/user-stories or AZUREDEVOPS_SYNC_FOLDER)"),
    },
    // local-only: lists synced files on disk, no ADO call.
    { readOnlyHint: true },
    async ({ folder }: any) => {
      try {
        const result = await ctx.sync.listSyncedWorkItems(folder);
        return {
          content: [{
            type: "text",
            text: `Synced work items in ${result.folder}: ${result.count} file(s)${fanOutSuffix(result.fanOut)}\n\n${JSON.stringify(result, null, 2)}`,
          }],
        };
      } catch (error: any) {
        console.error("Error listing synced work items:", error);
        return { content: [{ type: "text", text: `Failed to list synced work items: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "create-work-item-file",
    descWithExamples(
      "Create a new work item template file locally for any type (User Story, Bug, Feature, Epic, Task, etc.). The file can be edited and then pushed to ADO using sync-work-item-from-file. Parent is optional - omit for standalone items like Features or Epics.",
      CREATE_WORK_ITEM_FILE_EXAMPLES
    ),
    {
      project: z.string().describe("The project name"),
      parentId: zCoerceNumber().optional().describe("Parent work item ID. Omit for standalone items (Features, Epics)"),
      workItemType: z.string().default("User Story").describe("Work item type: 'User Story', 'Bug', 'Feature', 'Epic', 'Task', etc."),
      folder: z.string().optional().describe("Override folder path (default: docs/user-stories or AZUREDEVOPS_SYNC_FOLDER)"),
    },
    // Writes a local template file only; no ADO work item is created → read w.r.t. ADO.
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, parentId, workItemType, folder }: any) => {
      try {
        const result = await ctx.sync.createWorkItemFile(project, parentId, workItemType || 'User Story', folder);
        return { content: [{ type: "text", text: `Created new ${workItemType || 'User Story'} template:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error creating work item file:", error);
        return { content: [{ type: "text", text: `Failed to create work item file: ${error.message}` }] };
      }
    }
  );

  // Backward-compatible alias
  server.tool(
    "create-user-story-file",
    "Create a new user story template file locally. Alias for create-work-item-file with type='User Story'. The file can be edited and then pushed to ADO using sync-work-item-from-file.",
    {
      project: z.string().describe("The project name"),
      parentId: zCoerceNumber().describe("Parent Feature ID - the new user story will be created under this feature"),
      folder: z.string().optional().describe("Override folder path (default: docs/user-stories or AZUREDEVOPS_SYNC_FOLDER)"),
    },
    // Writes a local template file only; no ADO work item is created → read w.r.t. ADO.
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, parentId, folder }: any) => {
      try {
        const result = await ctx.sync.createWorkItemFile(project, parentId, 'User Story', folder);
        return { content: [{ type: "text", text: `Created new User Story template:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error creating user story file:", error);
        return { content: [{ type: "text", text: `Failed to create user story file: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "sync-tasks-to-file",
    descWithExamples(
      "Download all tasks under a parent work item (User Story) to a local markdown file. Auto-converts HTML descriptions to markdown. Supports pulling tasks for multiple parents at once.",
      SYNC_TASKS_TO_FILE_EXAMPLES
    ),
    {
      project: z.string().describe("The project name"),
      parentIds: zCoerceNumberArray().describe("Parent work item IDs (User Stories) to fetch tasks for"),
      folder: z.string().optional().describe("Override folder path (default: docs/user-stories or AZUREDEVOPS_SYNC_FOLDER)"),
      skipAutoConvert: z.boolean().optional().describe("Skip automatic HTML-to-markdown conversion for task descriptions. Only use when explicitly requested. Default: false"),
    },
    // Pulls ADO→local file only; ADO is never modified → read.
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, parentIds, folder, skipAutoConvert }: any) => {
      try {
        const result = await ctx.sync.syncTasksToFile(project, parentIds, folder, skipAutoConvert);
        return {
          content: [{
            type: "text",
            text: `Synced tasks for ${result.pulled.length} parent(s) to local files${fanOutSuffix(result.fanOut)}:\n\n${JSON.stringify(result, null, 2)}`,
          }],
        };
      } catch (error: any) {
        console.error("Error syncing tasks to files:", error);
        return { content: [{ type: "text", text: `Failed to sync tasks: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "sync-tasks-from-file",
    descWithExamples(
      "Push local task changes back to ADO with upsert semantics. Existing tasks (## Task #ID) are updated, new tasks (## NEW TASK) are created. Auto-converts HTML fields to markdown. Requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true.",
      SYNC_TASKS_FROM_FILE_EXAMPLES
    ),
    {
      project: z.string().describe("The project name"),
      parentIds: zCoerceNumberArray().describe("Parent work item IDs to sync tasks for"),
      folder: z.string().optional().describe("Override folder path (default: docs/user-stories or AZUREDEVOPS_SYNC_FOLDER)"),
      skipAutoConvert: z.boolean().optional().describe("Skip automatic HTML-to-markdown conversion for task descriptions. Only use when explicitly requested. Default: false"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, parentIds, folder, skipAutoConvert }: any) => {
      try {
        const result = await ctx.sync.syncTasksFromFile(project, parentIds, folder, skipAutoConvert);
        return {
          content: [{ type: "text", text: `Pushed tasks to ADO (${result.updated.length} updated, ${result.created.length} created):\n\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (error: any) {
        console.error("Error syncing tasks from files:", error);
        return { content: [{ type: "text", text: `Failed to push tasks: ${error.message}` }] };
      }
    }
  );
}
