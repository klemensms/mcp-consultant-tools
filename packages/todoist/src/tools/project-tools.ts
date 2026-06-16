/**
 * Project MCP tools
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}
function fail(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

export function registerProjectTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'todoist-list-projects',
    'List all Todoist projects for the authenticated user.',
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const projects = await ctx.todoist.listProjects();
        const lines = projects.map(p => `• ${p.name} (id: ${p.id}${p.is_inbox_project ? ', inbox' : ''})`);
        return ok(`Found ${projects.length} project(s):\n${lines.join('\n')}\n\n${JSON.stringify(projects, null, 2)}`);
      } catch (error: any) {
        return fail(`Failed to list projects: ${error.message}`);
      }
    }
  );

  server.tool(
    'todoist-get-project',
    'Get a single Todoist project by ID.',
    {
      id: z.string().describe('Todoist project ID'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ id }: { id: string }) => {
      try {
        const project = await ctx.todoist.getProject(id);
        return ok(JSON.stringify(project, null, 2));
      } catch (error: any) {
        return fail(`Failed to get project: ${error.message}`);
      }
    }
  );

  server.tool(
    'todoist-create-project',
    'Create a new Todoist project.',
    {
      name: z.string().describe('Project name'),
      parent_id: z.string().optional().describe('Parent project ID for nesting'),
      color: z.string().optional().describe('Color name, e.g. "berry_red", "charcoal", "grape"'),
      is_favorite: z.boolean().optional().describe('Mark as favorite'),
      view_style: z.enum(['list', 'board']).optional().describe('Project view style'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        const project = await ctx.todoist.createProject(args);
        return ok(`Created project "${project.name}" (id: ${project.id})\n\n${JSON.stringify(project, null, 2)}`);
      } catch (error: any) {
        return fail(`Failed to create project: ${error.message}`);
      }
    }
  );

  server.tool(
    'todoist-update-project',
    'Update an existing Todoist project.',
    {
      id: z.string().describe('Todoist project ID'),
      name: z.string().optional().describe('New project name'),
      color: z.string().optional().describe('New color name'),
      is_favorite: z.boolean().optional().describe('Favorite flag'),
      view_style: z.enum(['list', 'board']).optional().describe('Project view style'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ id, ...input }: any) => {
      try {
        const project = await ctx.todoist.updateProject(id, input);
        return ok(`Updated project "${project.name}" (id: ${project.id})\n\n${JSON.stringify(project, null, 2)}`);
      } catch (error: any) {
        return fail(`Failed to update project: ${error.message}`);
      }
    }
  );

  server.tool(
    'todoist-delete-project',
    'Delete a Todoist project by ID. This is irreversible.',
    {
      id: z.string().describe('Todoist project ID'),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ id }: { id: string }) => {
      try {
        await ctx.todoist.deleteProject(id);
        return ok(`Deleted project ${id}`);
      } catch (error: any) {
        return fail(`Failed to delete project: ${error.message}`);
      }
    }
  );
}
