/**
 * Sync CLI Commands - 8 commands for work item sync and task sync
 */

import type { Command } from 'commander';
import { fanOutSuffix, getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerSyncCommands(program: Command, ctx: ServiceContext): void {
  const sync = program.command('sync').description('Work item sync operations');

  sync
    .command('pull')
    .description('Download work item(s) to local markdown files')
    .argument('<project>', 'Project name')
    .option('-i, --ids <ids...>', 'Work item IDs to pull')
    .option('--parent-id <id>', 'Pull all children of this parent')
    .option('--child-type <type>', 'Filter child type (default: User Story)')
    .option('-f, --folder <path>', 'Override folder path')
    .option('--include-comments', 'Also save comments', false)
    .option('--skip-auto-convert', 'Skip HTML-to-markdown conversion', false)
    .action(async (project: string, opts: any) => {
      try {
        const ids = opts.ids ? opts.ids.map((id: string) => parseInt(id, 10)) : [];
        const parentId = opts.parentId ? parseInt(opts.parentId, 10) : undefined;
        const result = await ctx.sync.syncWorkItemsToFile(project, ids, parentId, opts.childType, opts.folder, opts.includeComments, opts.skipAutoConvert);
        outputResult(
          { fileName: `sync-pull-${project}`, data: result, summary: result.message || `Synced ${result.pulled?.length || 0} work item(s) to local files` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'sync work items to file'); }
    });

  sync
    .command('push')
    .description('Upload local markdown changes to ADO (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)')
    .argument('<project>', 'Project name')
    .option('-i, --ids <ids...>', 'Work item IDs to push')
    .option('-f, --folder <path>', 'Override folder path')
    .option('--skip-auto-convert', 'Skip HTML-to-markdown conversion', false)
    .action(async (project: string, opts: any) => {
      try {
        const ids = opts.ids ? opts.ids.map((id: string) => parseInt(id, 10)) : [];
        const result = await ctx.sync.syncWorkItemsFromFile(project, ids, opts.folder, opts.skipAutoConvert);
        const summary = [];
        if (result.created.length > 0) summary.push(`Created ${result.created.length}`);
        if (result.pushed.length > 0) summary.push(`Updated ${result.pushed.length}`);
        if (result.failed.length > 0) summary.push(`Failed ${result.failed.length}`);
        outputResult(
          {
            persist: false,
            fileName: `sync-push-${project}`,
            data: result,
            summary: (summary.join(', ') || 'No changes pushed') + fanOutSuffix(result.imagePushes),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'sync work items from file'); }
    });

  sync
    .command('check-markdown')
    .description('Check if work item fields are markdown or HTML')
    .argument('<project>', 'Project name')
    .argument('<ids...>', 'Work item IDs')
    .action(async (project: string, ids: string[]) => {
      try {
        const workItemIds = ids.map(id => parseInt(id, 10));
        const result = await ctx.sync.checkWorkItemMarkdown(project, workItemIds);
        outputResult(
          { fileName: `sync-check-markdown`, data: result, summary: `Checked format for ${workItemIds.length} work item(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'check work item markdown'); }
    });

  sync
    .command('list')
    .description('List locally synced work item files')
    .option('-f, --folder <path>', 'Override folder path')
    .action(async (opts: any) => {
      try {
        const result = await ctx.sync.listSyncedWorkItems(opts.folder);
        outputResult(
          {
            fileName: `sync-list`,
            data: result,
            summary: `Synced work items in ${result.folder}: ${result.count} file(s)` + fanOutSuffix(result.fanOut),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list synced work items'); }
    });

  sync
    .command('create-file')
    .description('Create a new work item template file locally')
    .argument('<project>', 'Project name')
    .option('--parent-id <id>', 'Parent work item ID')
    .option('-t, --type <type>', 'Work item type', 'User Story')
    .option('-f, --folder <path>', 'Override folder path')
    .action(async (project: string, opts: any) => {
      try {
        const parentId = opts.parentId ? parseInt(opts.parentId, 10) : undefined;
        const result = await ctx.sync.createWorkItemFile(project, parentId, opts.type, opts.folder);
        outputResult(
          { persist: false, fileName: `sync-create-file`, data: result, summary: `Created new ${opts.type} template` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create work item file'); }
    });

  sync
    .command('create-user-story')
    .description('Create a new user story template file (alias)')
    .argument('<project>', 'Project name')
    .argument('<parentId>', 'Parent Feature ID')
    .option('-f, --folder <path>', 'Override folder path')
    .action(async (project: string, parentId: string, opts: any) => {
      try {
        const result = await ctx.sync.createWorkItemFile(project, parseInt(parentId, 10), 'User Story', opts.folder);
        outputResult(
          { persist: false, fileName: `sync-create-user-story`, data: result, summary: `Created new User Story template` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create user story file'); }
    });

  sync
    .command('pull-tasks')
    .description('Download tasks under parent work item(s) to local files')
    .argument('<project>', 'Project name')
    .argument('<parentIds...>', 'Parent work item IDs')
    .option('-f, --folder <path>', 'Override folder path')
    .option('--skip-auto-convert', 'Skip HTML-to-markdown conversion', false)
    .action(async (project: string, parentIds: string[], opts: any) => {
      try {
        const ids = parentIds.map(id => parseInt(id, 10));
        const result = await ctx.sync.syncTasksToFile(project, ids, opts.folder, opts.skipAutoConvert);
        outputResult(
          {
            fileName: `sync-pull-tasks`,
            data: result,
            summary: `Synced tasks for ${result.pulled?.length || 0} parent(s)` + fanOutSuffix(result.fanOut),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'sync tasks to file'); }
    });

  sync
    .command('push-tasks')
    .description('Push local task changes to ADO (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<parentIds...>', 'Parent work item IDs')
    .option('-f, --folder <path>', 'Override folder path')
    .option('--skip-auto-convert', 'Skip HTML-to-markdown conversion', false)
    .action(async (project: string, parentIds: string[], opts: any) => {
      try {
        const ids = parentIds.map(id => parseInt(id, 10));
        const result = await ctx.sync.syncTasksFromFile(project, ids, opts.folder, opts.skipAutoConvert);
        outputResult(
          { persist: false, fileName: `sync-push-tasks`, data: result, summary: `Pushed tasks (${result.updated?.length || 0} updated, ${result.created?.length || 0} created)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'sync tasks from file'); }
    });
}
