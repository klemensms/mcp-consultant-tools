/**
 * Checklist CLI Commands - 8 commands for ADO work item checklists
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerChecklistCommands(program: Command, ctx: ServiceContext): void {
  const checklist = program.command('checklist').description('Work item checklist operations');

  checklist
    .command('get')
    .description('Get merged checklist for a work item')
    .argument('<project>', 'Project name')
    .argument('<workItemId>', 'Work item ID')
    .action(async (project: string, workItemId: string) => {
      try {
        const result = await ctx.checklist.getChecklist(project, parseInt(workItemId));
        const summary = `Checklist for #${workItemId}: ${(result as any).completionPercent}% complete (${(result as any).completedCount}/${(result as any).totalCount})`;
        outputResult({ fileName: `checklist-${workItemId}`, data: result, summary }, getGlobalFlags(program));
      } catch (error) { handleCliError(error, 'get checklist'); }
    });

  checklist
    .command('template')
    .description('Get checklist template for a work item type')
    .argument('<project>', 'Project name')
    .argument('<workItemType>', 'Work item type (e.g., "User Story", "Bug")')
    .action(async (project: string, workItemType: string) => {
      try {
        const result = await ctx.checklist.getTemplate(project, workItemType);
        const summary = result
          ? `Template for '${workItemType}': ${result.checklistItems.length} items`
          : `No template found for '${workItemType}'`;
        outputResult({ fileName: `checklist-template-${workItemType.replace(/\s+/g, '-').toLowerCase()}`, data: result, summary }, getGlobalFlags(program));
      } catch (error) { handleCliError(error, 'get checklist template'); }
    });

  checklist
    .command('templates')
    .description('List all checklist templates in a project')
    .argument('<project>', 'Project name')
    .action(async (project: string) => {
      try {
        const result = await ctx.checklist.listTemplates(project);
        const summary = `${result.length} checklist template(s) in '${project}'`;
        outputResult({ fileName: `checklist-templates-${project}`, data: result, summary }, getGlobalFlags(program));
      } catch (error) { handleCliError(error, 'list checklist templates'); }
    });

  checklist
    .command('report')
    .description('Get checklist completion report across work items')
    .argument('<project>', 'Project name')
    .option('-t, --type <type>', 'Filter by work item type')
    .option('-s, --state <state>', 'Filter by work item state')
    .option('-m, --max <n>', 'Maximum results', '200')
    .action(async (project: string, opts: any) => {
      try {
        const result = await ctx.checklist.getReport(project, opts.type, opts.state, parseInt(opts.max));
        const r = result as any;
        const summary = `Checklist report: ${r.totalWorkItems} items — ${r.fullyComplete} complete, ${r.partiallyComplete} partial, ${r.notStarted} not started`;
        outputResult({ fileName: `checklist-report-${project}`, data: result, summary }, getGlobalFlags(program));
      } catch (error) { handleCliError(error, 'get checklist report'); }
    });

  checklist
    .command('update-item')
    .description('Update checklist item state on a work item')
    .argument('<project>', 'Project name')
    .argument('<workItemId>', 'Work item ID')
    .argument('<itemId>', 'Checklist item ID')
    .argument('<state>', 'New state')
    .option('--completed-by <name>', 'Display name for completedBy')
    .action(async (project: string, workItemId: string, itemId: string, state: string, opts: any) => {
      try {
        const result = await ctx.checklist.updateItemState(project, parseInt(workItemId), itemId, state as any, opts.completedBy);
        outputResult({ fileName: `checklist-${workItemId}-updated`, data: result, summary: `Updated item '${itemId}' to '${state}'` }, getGlobalFlags(program));
      } catch (error) { handleCliError(error, 'update checklist item'); }
    });

  checklist
    .command('add-item')
    .description('Add custom checklist item to a work item')
    .argument('<project>', 'Project name')
    .argument('<workItemId>', 'Work item ID')
    .argument('<text>', 'Item text (max 128 chars)')
    .option('-r, --required', 'Mark as required')
    .action(async (project: string, workItemId: string, text: string, opts: any) => {
      try {
        const result = await ctx.checklist.addItem(project, parseInt(workItemId), text, opts.required || false);
        outputResult({ fileName: `checklist-${workItemId}-added`, data: result, summary: `Added item to #${workItemId}` }, getGlobalFlags(program));
      } catch (error) { handleCliError(error, 'add checklist item'); }
    });

  checklist
    .command('remove-item')
    .description('Remove custom checklist item from a work item')
    .argument('<project>', 'Project name')
    .argument('<workItemId>', 'Work item ID')
    .argument('<itemId>', 'Checklist item ID to remove')
    .action(async (project: string, workItemId: string, itemId: string) => {
      try {
        const result = await ctx.checklist.removeItem(project, parseInt(workItemId), itemId);
        outputResult({ fileName: `checklist-${workItemId}-removed`, data: result, summary: `Removed item '${itemId}' from #${workItemId}` }, getGlobalFlags(program));
      } catch (error) { handleCliError(error, 'remove checklist item'); }
    });

  checklist
    .command('update-template')
    .description('Update checklist template for a work item type')
    .argument('<project>', 'Project name')
    .argument('<workItemType>', 'Work item type')
    .argument('<items>', 'JSON array of items: [{"text": "...", "required": true}]')
    .action(async (project: string, workItemType: string, items: string) => {
      try {
        const parsedItems = JSON.parse(items);
        const result = await ctx.checklist.updateTemplate(project, workItemType, parsedItems);
        outputResult({
          fileName: `checklist-template-${workItemType.replace(/\s+/g, '-').toLowerCase()}-updated`,
          data: result,
          summary: `Updated template for '${workItemType}' (${result.checklistItems.length} items)`
        }, getGlobalFlags(program));
      } catch (error) { handleCliError(error, 'update checklist template'); }
    });
}
