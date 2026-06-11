/**
 * Project CLI commands
 */
import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerProjectCommands(program: Command, ctx: ServiceContext): void {
  const projects = program.command('projects').description('Todoist project operations');

  projects
    .command('list')
    .description('List all projects')
    .action(async () => {
      try {
        const data = await ctx.todoist.listProjects();
        outputResult(
          { fileName: 'list-projects', data, summary: `Found ${data.length} project(s): ${data.map(p => p.name).join(', ')}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list projects'); }
    });

  projects
    .command('get <id>')
    .description('Get a project by ID')
    .action(async (id: string) => {
      try {
        const data = await ctx.todoist.getProject(id);
        outputResult(
          { fileName: `get-project-${id}`, data, summary: `Project: ${data.name} (${data.id})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get project'); }
    });

  projects
    .command('create <name>')
    .description('Create a new project')
    .option('--parent-id <id>', 'Parent project ID')
    .option('--color <color>', 'Color name')
    .option('--favorite', 'Mark as favorite')
    .option('--view-style <style>', 'list or board')
    .action(async (name: string, opts: any) => {
      try {
        const data = await ctx.todoist.createProject({
          name,
          parent_id: opts.parentId,
          color: opts.color,
          is_favorite: opts.favorite,
          view_style: opts.viewStyle,
        });
        outputResult(
          { fileName: `create-project-${data.id}`, data, summary: `Created project "${data.name}" (id: ${data.id})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create project'); }
    });

  projects
    .command('update <id>')
    .description('Update an existing project')
    .option('--name <name>', 'New name')
    .option('--color <color>', 'New color name')
    .option('--favorite <value>', 'true or false')
    .option('--view-style <style>', 'list or board')
    .action(async (id: string, opts: any) => {
      try {
        const data = await ctx.todoist.updateProject(id, {
          name: opts.name,
          color: opts.color,
          is_favorite: opts.favorite === undefined ? undefined : opts.favorite === 'true',
          view_style: opts.viewStyle,
        });
        outputResult(
          { fileName: `update-project-${id}`, data, summary: `Updated project "${data.name}" (id: ${data.id})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update project'); }
    });

  projects
    .command('delete <id>')
    .description('Delete a project')
    .action(async (id: string) => {
      try {
        await ctx.todoist.deleteProject(id);
        outputResult(
          { fileName: `delete-project-${id}`, data: { id, deleted: true }, summary: `Deleted project ${id}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete project'); }
    });
}
