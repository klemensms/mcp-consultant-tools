/**
 * Work Item CLI Commands - 10 commands mapping to work-item MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerWorkItemCommands(program: Command, ctx: ServiceContext): void {
  const wi = program.command('work-item').alias('wi').description('Work item operations');

  wi
    .command('get')
    .description('Get a work item by ID')
    .argument('<project>', 'Project name')
    .argument('<id>', 'Work item ID')
    .action(async (project: string, id: string) => {
      try {
        const workItemId = parseInt(id, 10);
        const result = await ctx.workItem.getWorkItem(project, workItemId);
        outputResult(
          { fileName: `work-item-${workItemId}`, data: result, summary: `Work item #${workItemId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get work item'); }
    });

  wi
    .command('query')
    .description('Query work items using WIQL')
    .argument('<project>', 'Project name')
    .argument('<wiql>', 'WIQL query string')
    .option('-m, --max-results <n>', 'Maximum results', '200')
    .action(async (project: string, wiql: string, opts: any) => {
      try {
        const result = await ctx.workItem.queryWorkItems(project, wiql, parseInt(opts.maxResults));
        outputResult(
          { fileName: `work-items-query`, data: result, summary: `Query returned results` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'query work items'); }
    });

  wi
    .command('run-saved-query')
    .description('Execute a saved ADO query by ID')
    .argument('<project>', 'Project name')
    .argument('<queryId>', 'Saved query GUID')
    .option('-m, --max-results <n>', 'Maximum results', '50')
    .option('-d, --detail <level>', 'Detail level: summary or full', 'summary')
    .option('-f, --fields <fields...>', 'Custom field reference names')
    .option('-g, --group-by <field>', 'Group results by field')
    .action(async (project: string, queryId: string, opts: any) => {
      try {
        const result = await ctx.workItem.runSavedQuery(project, queryId, parseInt(opts.maxResults), opts.detail, opts.fields, opts.groupBy);
        outputResult(
          { fileName: `saved-query-${queryId}`, data: result, summary: `Saved query results` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'run saved query'); }
    });

  wi
    .command('get-saved-query')
    .description('Get a saved query metadata and WIQL without executing')
    .argument('<project>', 'Project name')
    .argument('<queryId>', 'Saved query GUID')
    .action(async (project: string, queryId: string) => {
      try {
        const result = await ctx.workItem.getSavedQuery(project, queryId);
        outputResult(
          { fileName: `saved-query-meta-${queryId}`, data: result, summary: `Saved query: ${(result as any)?.name || queryId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get saved query'); }
    });

  wi
    .command('comments')
    .description('Get comments for a work item')
    .argument('<project>', 'Project name')
    .argument('<id>', 'Work item ID')
    .action(async (project: string, id: string) => {
      try {
        const workItemId = parseInt(id, 10);
        const result = await ctx.workItem.getWorkItemComments(project, workItemId);
        outputResult(
          { fileName: `work-item-${workItemId}-comments`, data: result, summary: `Comments for work item #${workItemId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get work item comments'); }
    });

  wi
    .command('add-comment')
    .description('Add a comment to a work item (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<id>', 'Work item ID')
    .argument('<text>', 'Comment text (markdown)')
    .action(async (project: string, id: string, text: string) => {
      try {
        const workItemId = parseInt(id, 10);
        const result = await ctx.workItem.addWorkItemComment(project, workItemId, text);
        outputResult(
          { persist: false, fileName: `work-item-${workItemId}-comment-added`, data: result, summary: `Added comment to work item #${workItemId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'add work item comment'); }
    });

  wi
    .command('update-comment')
    .description('Update a comment on a work item (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<workItemId>', 'Work item ID')
    .argument('<commentId>', 'Comment ID')
    .argument('<text>', 'Updated comment text (markdown)')
    .action(async (project: string, workItemId: string, commentId: string, text: string) => {
      try {
        const result = await ctx.workItem.updateWorkItemComment(project, parseInt(workItemId, 10), parseInt(commentId, 10), text);
        outputResult(
          { persist: false, fileName: `work-item-${workItemId}-comment-${commentId}-updated`, data: result, summary: `Updated comment #${commentId} on work item #${workItemId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update work item comment'); }
    });

  wi
    .command('update')
    .description('Update a work item with JSON Patch operations (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<id>', 'Work item ID')
    .argument('<patchOps>', 'JSON array of patch operations')
    .option('--skip-auto-convert', 'Skip automatic markdown format injection')
    .action(async (project: string, id: string, patchOps: string, opts: any) => {
      try {
        const workItemId = parseInt(id, 10);
        const operations = JSON.parse(patchOps);
        const result = await ctx.workItem.updateWorkItem(project, workItemId, operations);
        outputResult(
          { persist: false, fileName: `work-item-${workItemId}-updated`, data: result, summary: `Updated work item #${workItemId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update work item'); }
    });

  wi
    .command('create')
    .description('Create a new work item (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<type>', 'Work item type (Bug, Task, User Story, Feature, Epic)')
    .argument('<fields>', 'JSON object of field values')
    .option('--parent-id <id>', 'Parent work item ID')
    .action(async (project: string, type: string, fieldsJson: string, opts: any) => {
      try {
        const fields = JSON.parse(fieldsJson);
        const parentId = opts.parentId ? parseInt(opts.parentId, 10) : undefined;
        const result = await ctx.workItem.createWorkItem(project, type, fields, parentId);
        outputResult(
          { persist: false, fileName: `work-item-created`, data: result, summary: `Created ${type} work item` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create work item'); }
    });

  wi
    .command('upload-attachment')
    .description('Upload a file as a work item attachment (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<filePath>', 'Local file path to upload')
    .option('--work-item-id <id>', 'Optional work item ID to record the upload in its manifest')
    .option('--file-name <name>', 'Optional override for the filename ADO will store')
    .action(async (project: string, filePath: string, opts: any) => {
      try {
        const result = await ctx.workItem.uploadAttachment(project, filePath, opts.fileName);
        const embedUrl = /[?&]fileName=/i.test(result.url)
          ? result.url
          : `${result.url}${result.url.includes('?') ? '&' : '?'}fileName=${encodeURIComponent(result.fileName)}`;

        if (opts.workItemId) {
          try {
            const { getSyncConfig, recordExternalUpload, buildLocalAttachmentPath } = await import('../../sync/index.js');
            const syncConfig = getSyncConfig();
            const localPath = buildLocalAttachmentPath(result.id, result.fileName);
            await recordExternalUpload(syncConfig.folder, parseInt(opts.workItemId, 10), result, localPath);
          } catch (recordError: any) {
            console.error(`Uploaded but failed to record in manifest:`, recordError.message);
          }
        }

        outputResult(
          { persist: false,
            fileName: `attachment-uploaded-${result.id}`,
            data: { ...result, embedUrl },
            summary: `Uploaded ${result.fileName} (${result.size} bytes) - embed via: ${embedUrl}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'upload attachment'); }
    });

  wi
    .command('delete')
    .description('Delete a work item (requires AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true)')
    .argument('<project>', 'Project name')
    .argument('<id>', 'Work item ID')
    .action(async (project: string, id: string) => {
      try {
        const workItemId = parseInt(id, 10);
        const result = await ctx.workItem.deleteWorkItem(project, workItemId);
        outputResult(
          { persist: false, fileName: `work-item-${workItemId}-deleted`, data: result, summary: `Deleted work item #${workItemId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete work item'); }
    });
}
