/**
 * Project CLI Commands - list, get, properties, create, update, delete
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerProjectCommands(program: Command, ctx: ServiceContext): void {
  const proj = program.command('project').alias('p').description('Project operations');

  proj
    .command('list')
    .description('List all projects in the organization')
    .option('-s, --state <filter>', 'State filter (all, wellFormed, createPending, deleting)')
    .option('-t, --top <n>', 'Maximum number of results')
    .option('--skip <n>', 'Number to skip (pagination)')
    .action(async (opts: any) => {
      try {
        const result = await ctx.projects.listProjects(
          opts.state,
          opts.top ? parseInt(opts.top) : undefined,
          opts.skip ? parseInt(opts.skip) : undefined
        );
        outputResult(
          { fileName: 'projects-list', data: result, summary: `Found ${result.totalCount} projects` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list projects'); }
    });

  proj
    .command('get')
    .description('Get project details including capabilities')
    .argument('<projectId>', 'Project name or ID')
    .action(async (projectId: string) => {
      try {
        const result = await ctx.projects.getProject(projectId);
        outputResult(
          { fileName: `project-${projectId}`, data: result, summary: `Project: ${result.name}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get project'); }
    });

  proj
    .command('properties')
    .description('Get extended project properties')
    .argument('<projectId>', 'Project name or ID')
    .action(async (projectId: string) => {
      try {
        const result = await ctx.projects.getProjectProperties(projectId);
        outputResult(
          { fileName: `project-props-${projectId}`, data: result, summary: `Properties for '${projectId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get project properties'); }
    });

  proj
    .command('create')
    .description('Create a new project (polls until complete)')
    .argument('<name>', 'Project name')
    .option('-d, --description <text>', 'Project description')
    .option('-v, --visibility <type>', 'Visibility: private or public', 'private')
    .option('--process <template>', 'Process template: Agile, Scrum, Basic, CMMI', 'Agile')
    .option('--vcs <type>', 'Version control: Git or Tfvc', 'Git')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.projects.createProject(
          name, opts.description, opts.visibility, opts.process, opts.vcs
        );
        outputResult(
          { fileName: `project-created-${name}`, data: result, summary: `Created project '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create project'); }
    });

  proj
    .command('update')
    .description('Update a project name and/or description')
    .argument('<projectId>', 'Project name or ID')
    .option('-n, --name <name>', 'New project name')
    .option('-d, --description <text>', 'New project description')
    .action(async (projectId: string, opts: any) => {
      try {
        const updates: any = {};
        if (opts.name) updates.name = opts.name;
        if (opts.description) updates.description = opts.description;
        const result = await ctx.projects.updateProject(projectId, updates);
        outputResult(
          { fileName: `project-updated-${projectId}`, data: result, summary: `Updated project '${projectId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update project'); }
    });

  proj
    .command('delete')
    .description('Delete a project (DESTRUCTIVE, polls until complete)')
    .argument('<projectId>', 'Project name or ID')
    .action(async (projectId: string) => {
      try {
        const result = await ctx.projects.deleteProject(projectId);
        outputResult(
          { fileName: `project-deleted-${projectId}`, data: result, summary: `Deleted project '${projectId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete project'); }
    });
}
