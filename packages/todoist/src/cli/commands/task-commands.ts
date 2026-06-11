/**
 * Task CLI commands
 */
import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerTaskCommands(program: Command, ctx: ServiceContext): void {
  const tasks = program.command('tasks').description('Todoist task operations');

  tasks
    .command('list')
    .description('List active tasks')
    .option('--project-id <id>', 'Filter by project ID')
    .option('--section-id <id>', 'Filter by section ID')
    .option('--label <name>', 'Filter by label name')
    .option('--filter <query>', 'Todoist filter query, e.g. "today"')
    .option('--lang <code>', 'Filter language')
    .action(async (opts: any) => {
      try {
        const data = await ctx.todoist.listTasks({
          project_id: opts.projectId,
          section_id: opts.sectionId,
          label: opts.label,
          filter: opts.filter,
          lang: opts.lang,
        });
        outputResult(
          {
            fileName: 'list-tasks',
            data,
            summary: `Found ${data.length} task(s)${data.length ? ': ' + data.slice(0, 5).map(t => t.content).join(' | ') + (data.length > 5 ? ' …' : '') : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list tasks'); }
    });

  tasks
    .command('get <id>')
    .description('Get a task by ID')
    .action(async (id: string) => {
      try {
        const data = await ctx.todoist.getTask(id);
        outputResult(
          { fileName: `get-task-${id}`, data, summary: `Task: ${data.content} (${data.id})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get task'); }
    });

  tasks
    .command('create <content>')
    .description('Create a new task')
    .option('--description <text>', 'Longer description')
    .option('--project-id <id>', 'Project ID (defaults to Inbox)')
    .option('--section-id <id>', 'Section ID')
    .option('--parent-id <id>', 'Parent task ID for sub-tasks')
    .option('--labels <list>', 'Comma-separated label names')
    .option('--priority <n>', 'Priority 1-4 (1=normal, 4=urgent)', (v: string) => parseInt(v, 10))
    .option('--due-string <text>', 'Natural language due date, e.g. "tomorrow 9am"')
    .option('--due-date <date>', 'Due date YYYY-MM-DD')
    .option('--due-datetime <datetime>', 'Due datetime in RFC3339 UTC')
    .action(async (content: string, opts: any) => {
      try {
        const data = await ctx.todoist.createTask({
          content,
          description: opts.description,
          project_id: opts.projectId,
          section_id: opts.sectionId,
          parent_id: opts.parentId,
          labels: opts.labels ? opts.labels.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
          priority: opts.priority,
          due_string: opts.dueString,
          due_date: opts.dueDate,
          due_datetime: opts.dueDatetime,
        });
        outputResult(
          { fileName: `create-task-${data.id}`, data, summary: `Created task "${data.content}" (id: ${data.id})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create task'); }
    });

  tasks
    .command('update <id>')
    .description('Update an existing task')
    .option('--content <text>', 'New content')
    .option('--description <text>', 'New description')
    .option('--labels <list>', 'Comma-separated label names (replaces)')
    .option('--priority <n>', 'Priority 1-4', (v: string) => parseInt(v, 10))
    .option('--due-string <text>', 'Natural language due date')
    .option('--due-date <date>', 'Due date YYYY-MM-DD')
    .option('--due-datetime <datetime>', 'Due datetime in RFC3339 UTC')
    .action(async (id: string, opts: any) => {
      try {
        const data = await ctx.todoist.updateTask(id, {
          content: opts.content,
          description: opts.description,
          labels: opts.labels ? opts.labels.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
          priority: opts.priority,
          due_string: opts.dueString,
          due_date: opts.dueDate,
          due_datetime: opts.dueDatetime,
        });
        outputResult(
          { fileName: `update-task-${id}`, data, summary: `Updated task "${data.content}" (id: ${data.id})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update task'); }
    });

  tasks
    .command('complete <id>')
    .description('Complete (close) a task')
    .action(async (id: string) => {
      try {
        await ctx.todoist.closeTask(id);
        outputResult(
          { fileName: `complete-task-${id}`, data: { id, completed: true }, summary: `Completed task ${id}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'complete task'); }
    });

  tasks
    .command('reopen <id>')
    .description('Reopen a previously completed task')
    .action(async (id: string) => {
      try {
        await ctx.todoist.reopenTask(id);
        outputResult(
          { fileName: `reopen-task-${id}`, data: { id, reopened: true }, summary: `Reopened task ${id}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'reopen task'); }
    });

  tasks
    .command('delete <id>')
    .description('Delete a task')
    .action(async (id: string) => {
      try {
        await ctx.todoist.deleteTask(id);
        outputResult(
          { fileName: `delete-task-${id}`, data: { id, deleted: true }, summary: `Deleted task ${id}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete task'); }
    });
}
