/**
 * Work Item Tools - 10 tools for work item operations
 */
import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { formatSummaryFooter, type PipelineReport } from '@mcp-consultant-tools/core';
import { descWithExamples, WIQL_EXAMPLES, PATCH_OP_EXAMPLES, WORK_ITEM_FIELD_EXAMPLES, UPLOAD_ATTACHMENT_EXAMPLES } from '../tool-examples.js';
import { getAllLargeTextFields } from '../sync/html-detection.js';
import { getSyncConfig, recordExternalUpload, buildLocalAttachmentPath } from '../sync/index.js';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';

/**
 * Splits the embedded `piiReport` (added by WorkItemService.redact) off the
 * result so MCP responses can carry the audit footer alongside redacted
 * record bodies. No-op when redaction was disabled or the field is absent.
 */
function splitPiiReport<T>(result: T): { visible: T; footer: string } {
  if (result && typeof result === 'object' && 'piiReport' in (result as any)) {
    const { piiReport, ...rest } = result as any;
    const report = piiReport as PipelineReport | undefined;
    return {
      visible: rest as T,
      footer: report ? `\n\n${formatSummaryFooter(report)}` : '',
    };
  }
  return { visible: result, footer: '' };
}

export function registerWorkItemTools(server: any, ctx: ServiceContext): void {
  const workItemsResourceUri = "ui://ado/work-items";

  registerAppTool(
    server,
    "get-work-item",
    {
      title: "Get Work Item",
      description: "Get a work item by ID with full details from Azure DevOps",
      inputSchema: {
        project: z.string().describe("The project name"),
        workItemId: zCoerceNumber().describe("The work item ID"),
      },
      _meta: { ui: { resourceUri: workItemsResourceUri } },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ project, workItemId }: any) => {
      try {
        const result = await ctx.workItem.getWorkItem(project, workItemId);
        const { visible, footer } = splitPiiReport(result);
        return {
          content: [{ type: "text", text: `Work item ${workItemId}:\n\n${JSON.stringify(visible, null, 2)}${footer}` }],
          structuredContent: { type: "work-item-detail", item: visible },
        };
      } catch (error: any) {
        console.error("Error getting work item:", error);
        return { content: [{ type: "text", text: `Failed to get work item: ${error.message}` }], isError: true };
      }
    }
  );

  registerAppTool(
    server,
    "query-work-items",
    {
      title: "Query Work Items",
      description: "Query work items using WIQL (Work Item Query Language) in Azure DevOps",
      inputSchema: {
        project: z.string().describe("The project name"),
        wiql: z.string().describe(
          descWithExamples(
            "The WIQL query string. SQL-like syntax with field names in brackets. Common fields: [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [System.Parent]. Use @Me for current user.",
            WIQL_EXAMPLES
          )
        ),
        maxResults: zCoerceNumber().optional().describe("Maximum number of results (default: 200)"),
      },
      _meta: { ui: { resourceUri: workItemsResourceUri } },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ project, wiql, maxResults }: any) => {
      try {
        const result = await ctx.workItem.queryWorkItems(project, wiql, maxResults);
        const { visible, footer } = splitPiiReport(result);
        const items = Array.isArray(visible) ? visible : (visible as any)?.workItems ?? visible;
        return {
          content: [{ type: "text", text: `Work items query results:\n\n${JSON.stringify(visible, null, 2)}${footer}` }],
          structuredContent: { type: "work-item-list", items, project },
        };
      } catch (error: any) {
        console.error("Error querying work items:", error);
        return { content: [{ type: "text", text: `Failed to query work items: ${error.message}` }], isError: true };
      }
    }
  );

  registerAppTool(
    server,
    "run-saved-query",
    {
      title: "Run Saved Query",
      description: "Execute a saved Azure DevOps query by its query ID (GUID). Returns a compact summary by default (ID, Title, Assigned To, State, Severity, Priority, Tags, Story Points, Resolved Reason). Use detail='full' for all fields.",
      inputSchema: {
        project: z.string().describe("The project name"),
        queryId: z.string().describe(
          descWithExamples(
            "The saved query GUID. Found in ADO query URLs: https://dev.azure.com/{org}/{project}/_queries/query/{queryId}/",
            [{ label: "From URL", value: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }]
          )
        ),
        maxResults: zCoerceNumber().optional().describe("Maximum number of results (default: 50)"),
        detail: z.enum(['summary', 'full']).optional().describe(
          "Level of detail: 'summary' (default) returns key fields only, 'full' returns all fields expanded"
        ),
        fields: z.array(z.string()).optional().describe(
          descWithExamples(
            "Custom list of ADO field reference names to return. Overrides the default summary fields.",
            [{ label: "Effort and state", value: '["System.Title", "System.State", "Microsoft.VSTS.Scheduling.Effort"]' }]
          )
        ),
        groupBy: z.string().optional().describe(
          descWithExamples(
            "Group results by a summary field name and return counts per group.",
            [
              { label: "By state", value: "state" },
              { label: "By assigned to", value: "assignedTo" },
              { label: "By priority", value: "priority" },
            ]
          )
        ),
      },
      _meta: { ui: { resourceUri: workItemsResourceUri } },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ project, queryId, maxResults, detail, fields, groupBy }: any) => {
      try {
        const result = await ctx.workItem.runSavedQuery(project, queryId, maxResults, detail, fields, groupBy);
        const items = Array.isArray(result) ? result : (result as any)?.workItems ?? [];
        return {
          content: [{ type: "text", text: `Saved query results:\n\n${JSON.stringify(result, null, 2)}` }],
          structuredContent: { type: "work-item-list", items, project },
        };
      } catch (error: any) {
        console.error("Error running saved query:", error);
        return { content: [{ type: "text", text: `Failed to run saved query: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get-saved-query",
    "Get a saved Azure DevOps query's metadata and WIQL text without executing it. Useful for inspecting or modifying a query before running it.",
    {
      project: z.string().describe("The project name"),
      queryId: z.string().describe("The saved query GUID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, queryId }: any) => {
      try {
        const result = await ctx.workItem.getSavedQuery(project, queryId);
        return { content: [{ type: "text", text: `Saved query details:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting saved query:", error);
        return { content: [{ type: "text", text: `Failed to get saved query: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "get-work-item-comments",
    "Get comments/discussion for a work item in Azure DevOps",
    {
      project: z.string().describe("The project name"),
      workItemId: zCoerceNumber().describe("The work item ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, workItemId }: any) => {
      try {
        const result = await ctx.workItem.getWorkItemComments(project, workItemId);
        return { content: [{ type: "text", text: `Comments for work item ${workItemId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting work item comments:", error);
        return { content: [{ type: "text", text: `Failed to get work item comments: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "add-work-item-comment",
    "Add a comment to a work item in Azure DevOps (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true). By default, comments are sent as Markdown. For orgs without Markdown preview, set AZUREDEVOPS_COMMENT_FORMAT=html to auto-convert Markdown to HTML.",
    {
      project: z.string().describe("The project name"),
      workItemId: zCoerceNumber().describe("The work item ID"),
      commentText: z.string().describe("The comment text in Markdown format. Use standard Markdown syntax: **bold**, *italic*, `code`, - lists, [links](url), etc. Will be auto-converted to HTML if AZUREDEVOPS_COMMENT_FORMAT=html is set."),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, workItemId, commentText }: any) => {
      try {
        const result = await ctx.workItem.addWorkItemComment(project, workItemId, commentText);
        const { visible, footer } = splitPiiReport(result);
        return { content: [{ type: "text", text: `Added comment to work item ${workItemId}:\n\n${JSON.stringify(visible, null, 2)}${footer}` }] };
      } catch (error: any) {
        console.error("Error adding work item comment:", error);
        return { content: [{ type: "text", text: `Failed to add work item comment: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "update-work-item-comment",
    "Update an existing comment on a work item in Azure DevOps (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true). By default, comments are sent as Markdown. For orgs without Markdown preview, set AZUREDEVOPS_COMMENT_FORMAT=html to auto-convert Markdown to HTML.",
    {
      project: z.string().describe("The project name"),
      workItemId: zCoerceNumber().describe("The work item ID"),
      commentId: zCoerceNumber().describe("The comment ID to update. Get comment IDs from get-work-item-comments."),
      commentText: z.string().describe("The updated comment text in Markdown format. Use standard Markdown syntax: **bold**, *italic*, `code`, - lists, [links](url), etc. Will be auto-converted to HTML if AZUREDEVOPS_COMMENT_FORMAT=html is set."),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, workItemId, commentId, commentText }: any) => {
      try {
        const result = await ctx.workItem.updateWorkItemComment(project, workItemId, commentId, commentText);
        const { visible, footer } = splitPiiReport(result);
        return { content: [{ type: "text", text: `Updated comment ${commentId} on work item ${workItemId}:\n\n${JSON.stringify(visible, null, 2)}${footer}` }] };
      } catch (error: any) {
        console.error("Error updating work item comment:", error);
        return { content: [{ type: "text", text: `Failed to update work item comment: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "update-work-item",
    "Update a work item in Azure DevOps using JSON Patch operations (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true). Auto-injects markdown format operations for large text fields.",
    {
      project: z.string().describe("The project name"),
      workItemId: zCoerceNumber().describe("The work item ID"),
      patchOperations: z.array(z.object({
        op: z.string().describe("The operation type: 'add' (set value), 'replace' (update existing), or 'remove' (clear field)"),
        path: z.string().describe("The field path starting with '/fields/' (e.g., '/fields/System.State', '/fields/System.Title')"),
        value: z.any().optional().describe("The value to set (not required for 'remove' operation)")
      })).describe(
        descWithExamples(
          "Array of JSON Patch operations. Each operation specifies what to change.",
          PATCH_OP_EXAMPLES
        )
      ),
      skipAutoConvert: z.boolean().optional().describe("Skip automatic markdown format injection for large text fields. Only use when explicitly requested. Default: false"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, workItemId, patchOperations, skipAutoConvert }: any) => {
      try {
        let finalOperations = [...patchOperations];
        const formatOpsAdded: string[] = [];

        if (!skipAutoConvert) {
          const allLargeTextFields = getAllLargeTextFields();
          const largeTextFieldsBeingUpdated = patchOperations
            .filter((op: any) => op.path?.startsWith('/fields/'))
            .map((op: any) => op.path.replace('/fields/', ''))
            .filter((field: string) => allLargeTextFields.includes(field));

          for (const field of largeTextFieldsBeingUpdated) {
            const hasFormatOp = finalOperations.some(
              (op: any) => op.path === `/multilineFieldsFormat/${field}`
            );

            if (!hasFormatOp) {
              finalOperations.push({
                op: 'add',
                path: `/multilineFieldsFormat/${field}`,
                value: 'Markdown'
              });
              formatOpsAdded.push(field);
            }
          }
        }

        const result = await ctx.workItem.updateWorkItem(project, workItemId, finalOperations);
        const { visible, footer } = splitPiiReport(result);

        let message = `Updated work item ${workItemId}`;
        if (formatOpsAdded.length > 0) {
          message += ` (auto-set markdown format for: ${formatOpsAdded.join(', ')})`;
        }

        return { content: [{ type: "text", text: `${message}:\n\n${JSON.stringify(visible, null, 2)}${footer}` }] };
      } catch (error: any) {
        console.error("Error updating work item:", error);
        return { content: [{ type: "text", text: `Failed to update work item: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "create-work-item",
    "Create a new work item in Azure DevOps with optional parent relationship (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)",
    {
      project: z.string().describe("The project name"),
      workItemType: z.string().describe("The work item type: 'Bug', 'Task', 'User Story', 'Feature', 'Epic', or custom types"),
      fields: z.record(z.any()).describe(
        descWithExamples(
          "Object with field values. Required: System.Title. Common fields: System.Description, System.State, System.AssignedTo, Microsoft.VSTS.Common.AcceptanceCriteria, Microsoft.VSTS.TCM.ReproSteps (bugs).",
          WORK_ITEM_FIELD_EXAMPLES
        )
      ),
      parentId: zCoerceNumber().optional().describe("Optional parent work item ID (for creating child items). Simplified alternative to relations parameter."),
      relations: z.array(z.object({
        rel: z.string().describe("Relation type (e.g., 'System.LinkTypes.Hierarchy-Reverse' for parent)"),
        url: z.string().describe("URL to related work item (e.g., 'https://dev.azure.com/org/project/_apis/wit/workItems/123')"),
        attributes: z.record(z.any()).optional().describe("Optional relation attributes")
      })).optional().describe("Optional array of work item relationships. Use parentId for simple parent-child relationships.")
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, workItemType, fields, parentId, relations }: any) => {
      try {
        const result = await ctx.workItem.createWorkItem(project, workItemType, fields, parentId, relations);
        const { visible, footer } = splitPiiReport(result);
        return { content: [{ type: "text", text: `Created work item:\n\n${JSON.stringify(visible, null, 2)}${footer}` }] };
      } catch (error: any) {
        console.error("Error creating work item:", error);
        return { content: [{ type: "text", text: `Failed to create work item: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "upload-work-item-attachment",
    "Upload a local file to ADO as a work item attachment and return the attachment URL (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true). Embed the returned URL in an <img src=...> tag inside any HTML field or comment to reference the file. When workItemId is provided, the upload is recorded in that work item's local .attachments.json so the next sync push knows the file already exists in ADO.",
    {
      project: z.string().describe("The project name"),
      filePath: z.string().describe(
        descWithExamples(
          "Absolute path to the local file to upload. Common case: a screenshot taken by Playwright or a saved evidence file.",
          UPLOAD_ATTACHMENT_EXAMPLES
        )
      ),
      workItemId: zCoerceNumber().optional().describe("Optional work item ID to associate the upload with. When provided, the attachment is recorded in that work item's local manifest so subsequent sync push operations recognise it as already on ADO."),
      fileName: z.string().optional().describe("Optional override for the filename ADO will store. Defaults to the basename of filePath."),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, filePath, workItemId, fileName }: any) => {
      try {
        const result = await ctx.workItem.uploadAttachment(project, filePath, fileName);

        if (workItemId !== undefined) {
          try {
            const syncConfig = getSyncConfig();
            const localPath = buildLocalAttachmentPath(result.id, result.fileName);
            await recordExternalUpload(syncConfig.folder, workItemId, result, localPath);
          } catch (recordError: any) {
            console.error(`Uploaded but failed to record in manifest for #${workItemId}:`, recordError.message);
          }
        }

        const embedUrl = /[?&]fileName=/i.test(result.url)
          ? result.url
          : `${result.url}${result.url.includes('?') ? '&' : '?'}fileName=${encodeURIComponent(result.fileName)}`;
        const message = `Uploaded ${result.fileName} (${result.size} bytes). Embed with: <img src="${embedUrl}" alt="${result.fileName}">`;
        return { content: [{ type: "text", text: `${message}\n\n${JSON.stringify({ ...result, embedUrl }, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error uploading attachment:", error);
        return { content: [{ type: "text", text: `Failed to upload attachment: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "delete-work-item",
    "Delete a work item in Azure DevOps (requires AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true)",
    {
      project: z.string().describe("The project name"),
      workItemId: zCoerceNumber().describe("The work item ID"),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ project, workItemId }: any) => {
      try {
        const result = await ctx.workItem.deleteWorkItem(project, workItemId);
        return { content: [{ type: "text", text: `Deleted work item ${workItemId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error deleting work item:", error);
        return { content: [{ type: "text", text: `Failed to delete work item: ${error.message}` }] };
      }
    }
  );
}
