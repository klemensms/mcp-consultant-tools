/**
 * Task MCP tools
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}
function fail(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

const priorityDesc = 'Priority 1 (normal) to 4 (urgent). Todoist UI shows these inverted: p4=1, p1=4.';

export function registerTaskTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'todoist-list-tasks',
    'List active Todoist tasks. Filter by project, section, label, or Todoist filter query.',
    {
      project_id: z.string().optional().describe('Filter by project ID'),
      section_id: z.string().optional().describe('Filter by section ID'),
      label: z.string().optional().describe('Filter by label name'),
      filter: z.string().optional().describe('Todoist filter query, e.g. "today", "overdue", "@work & !p4"'),
      lang: z.string().optional().describe('Filter language (e.g. "en")'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const tasks = await ctx.todoist.listTasks(args);
        const lines = tasks.map(t => `• [${t.id}] ${t.content}${t.due?.string ? ` (due: ${t.due.string})` : ''}`);
        return ok(`Found ${tasks.length} task(s):\n${lines.join('\n')}\n\n${JSON.stringify(tasks, null, 2)}`);
      } catch (error: any) {
        return fail(`Failed to list tasks: ${error.message}`);
      }
    }
  );

  server.tool(
    'todoist-get-task',
    'Get a single Todoist task by ID.',
    { id: z.string().describe('Task ID') },
    { readOnlyHint: true, openWorldHint: true },
    async ({ id }: { id: string }) => {
      try {
        const task = await ctx.todoist.getTask(id);
        return ok(JSON.stringify(task, null, 2));
      } catch (error: any) {
        return fail(`Failed to get task: ${error.message}`);
      }
    }
  );

  server.tool(
    'todoist-create-task',
    'Create a new Todoist task. Use due_string for natural language dates ("tomorrow 9am", "every monday").',
    {
      content: z.string().describe('Task title / content'),
      description: z.string().optional().describe('Longer description'),
      project_id: z.string().optional().describe('Project ID (defaults to Inbox)'),
      section_id: z.string().optional().describe('Section ID within the project'),
      parent_id: z.string().optional().describe('Parent task ID for sub-tasks'),
      labels: z.array(z.string()).optional().describe('Label names'),
      priority: z.number().int().min(1).max(4).optional().describe(priorityDesc),
      due_string: z.string().optional().describe('Natural language due date, e.g. "tomorrow 9am"'),
      due_date: z.string().optional().describe('Due date YYYY-MM-DD'),
      due_datetime: z.string().optional().describe('Due datetime in RFC3339 UTC'),
      due_lang: z.string().optional().describe('Language of due_string (default "en")'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        const task = await ctx.todoist.createTask(args);
        return ok(`Created task "${task.content}" (id: ${task.id})\n\n${JSON.stringify(task, null, 2)}`);
      } catch (error: any) {
        return fail(`Failed to create task: ${error.message}`);
      }
    }
  );

  server.tool(
    'todoist-update-task',
    'Update an existing Todoist task. Only provided fields are changed.',
    {
      id: z.string().describe('Task ID'),
      content: z.string().optional().describe('New task content'),
      description: z.string().optional().describe('New description'),
      labels: z.array(z.string()).optional().describe('Replace labels'),
      priority: z.number().int().min(1).max(4).optional().describe(priorityDesc),
      due_string: z.string().optional().describe('Natural language due date'),
      due_date: z.string().optional().describe('Due date YYYY-MM-DD'),
      due_datetime: z.string().optional().describe('Due datetime in RFC3339 UTC'),
      due_lang: z.string().optional().describe('Language of due_string'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ id, ...input }: any) => {
      try {
        const task = await ctx.todoist.updateTask(id, input);
        return ok(`Updated task "${task.content}" (id: ${task.id})\n\n${JSON.stringify(task, null, 2)}`);
      } catch (error: any) {
        return fail(`Failed to update task: ${error.message}`);
      }
    }
  );

  server.tool(
    'todoist-complete-task',
    'Mark a Todoist task as complete (close it).',
    { id: z.string().describe('Task ID') },
    // State change (close), not data destruction → mutating non-destructive.
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ id }: { id: string }) => {
      try {
        await ctx.todoist.closeTask(id);
        return ok(`Completed task ${id}`);
      } catch (error: any) {
        return fail(`Failed to complete task: ${error.message}`);
      }
    }
  );

  server.tool(
    'todoist-reopen-task',
    'Reopen a previously completed Todoist task.',
    { id: z.string().describe('Task ID') },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ id }: { id: string }) => {
      try {
        await ctx.todoist.reopenTask(id);
        return ok(`Reopened task ${id}`);
      } catch (error: any) {
        return fail(`Failed to reopen task: ${error.message}`);
      }
    }
  );

  server.tool(
    'todoist-delete-task',
    'Delete a Todoist task by ID. This is irreversible.',
    { id: z.string().describe('Task ID') },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ id }: { id: string }) => {
      try {
        await ctx.todoist.deleteTask(id);
        return ok(`Deleted task ${id}`);
      } catch (error: any) {
        return fail(`Failed to delete task: ${error.message}`);
      }
    }
  );
}
