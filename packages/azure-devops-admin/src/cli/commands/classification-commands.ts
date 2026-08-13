/**
 * Classification CLI Commands - Iterations and Areas (list, get, CRUD, team assignment)
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerClassificationCommands(program: Command, ctx: ServiceContext): void {
  // --- Iteration commands ---
  const iteration = program.command('iteration').alias('it').description('Iteration (sprint) operations');

  iteration
    .command('list')
    .description('List all iterations in a project')
    .argument('<project>', 'Project name')
    .option('-d, --depth <n>', 'Tree depth to retrieve', '10')
    .action(async (project: string, opts: any) => {
      try {
        const result = await ctx.classification.listClassificationNodes(project, 'iterations', parseInt(opts.depth));
        outputResult(
          { fileName: `iterations-${project}`, data: result, summary: `Iterations in '${project}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list iterations'); }
    });

  iteration
    .command('get')
    .description('Get a specific iteration node')
    .argument('<project>', 'Project name')
    .argument('<path>', 'Iteration path (e.g., Sprint 1 or Release\\Sprint 1)')
    .action(async (project: string, path: string) => {
      try {
        const result = await ctx.classification.getClassificationNode(project, 'iterations', path);
        outputResult(
          { fileName: `iteration-${path.replace(/\\/g, '-')}`, data: result, summary: `Iteration '${path}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get iteration'); }
    });

  iteration
    .command('create')
    .description('Create a new iteration')
    .argument('<project>', 'Project name')
    .argument('<name>', 'Iteration name')
    .option('-p, --parent-path <path>', 'Parent iteration path')
    .option('--start-date <date>', 'Start date (YYYY-MM-DD)')
    .option('--finish-date <date>', 'Finish date (YYYY-MM-DD)')
    .action(async (project: string, name: string, opts: any) => {
      try {
        const attrs: any = {};
        if (opts.startDate) attrs.startDate = opts.startDate;
        if (opts.finishDate) attrs.finishDate = opts.finishDate;
        const result = await ctx.classification.createClassificationNode(
          project, 'iterations', name, opts.parentPath, Object.keys(attrs).length > 0 ? attrs : undefined
        );
        outputResult(
          { persist: false, fileName: `iteration-created-${name}`, data: result, summary: `Created iteration '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create iteration'); }
    });

  iteration
    .command('update')
    .description('Update an iteration')
    .argument('<project>', 'Project name')
    .argument('<path>', 'Iteration path')
    .option('-n, --name <name>', 'New iteration name')
    .option('--start-date <date>', 'New start date (YYYY-MM-DD)')
    .option('--finish-date <date>', 'New finish date (YYYY-MM-DD)')
    .action(async (project: string, path: string, opts: any) => {
      try {
        const updates: any = {};
        if (opts.name) updates.name = opts.name;
        if (opts.startDate) updates.startDate = opts.startDate;
        if (opts.finishDate) updates.finishDate = opts.finishDate;
        const result = await ctx.classification.updateClassificationNode(project, 'iterations', path, updates);
        outputResult(
          { persist: false, fileName: `iteration-updated-${path.replace(/\\/g, '-')}`, data: result, summary: `Updated iteration '${path}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update iteration'); }
    });

  iteration
    .command('delete')
    .description('Delete an iteration (DESTRUCTIVE)')
    .argument('<project>', 'Project name')
    .argument('<path>', 'Iteration path to delete')
    .argument('<reclassifyId>', 'Node ID to reclassify work items into')
    .action(async (project: string, path: string, reclassifyId: string) => {
      try {
        const result = await ctx.classification.deleteClassificationNode(project, 'iterations', path, parseInt(reclassifyId));
        outputResult(
          { persist: false, fileName: `iteration-deleted-${path.replace(/\\/g, '-')}`, data: result, summary: `Deleted iteration '${path}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete iteration'); }
    });

  iteration
    .command('add-to-team')
    .description('Add an iteration to a team\'s backlog')
    .argument('<project>', 'Project name')
    .argument('<team>', 'Team name')
    .argument('<iterationId>', 'Iteration identifier (GUID)')
    .action(async (project: string, team: string, iterationId: string) => {
      try {
        const result = await ctx.classification.addIterationToTeam(project, team, iterationId);
        outputResult(
          { persist: false, fileName: `iteration-team-${team}-${iterationId}`, data: result, summary: `Added iteration to team '${team}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'add iteration to team'); }
    });

  // --- Area commands ---
  const area = program.command('area').alias('ar').description('Area path operations');

  area
    .command('list')
    .description('List all area paths in a project')
    .argument('<project>', 'Project name')
    .option('-d, --depth <n>', 'Tree depth to retrieve', '10')
    .action(async (project: string, opts: any) => {
      try {
        const result = await ctx.classification.listClassificationNodes(project, 'areas', parseInt(opts.depth));
        outputResult(
          { fileName: `areas-${project}`, data: result, summary: `Areas in '${project}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list areas'); }
    });

  area
    .command('get')
    .description('Get a specific area path node')
    .argument('<project>', 'Project name')
    .argument('<path>', 'Area path (e.g., Frontend or Platform\\API)')
    .action(async (project: string, path: string) => {
      try {
        const result = await ctx.classification.getClassificationNode(project, 'areas', path);
        outputResult(
          { fileName: `area-${path.replace(/\\/g, '-')}`, data: result, summary: `Area '${path}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get area'); }
    });

  area
    .command('create')
    .description('Create a new area path')
    .argument('<project>', 'Project name')
    .argument('<name>', 'Area name')
    .option('-p, --parent-path <path>', 'Parent area path')
    .action(async (project: string, name: string, opts: any) => {
      try {
        const result = await ctx.classification.createClassificationNode(project, 'areas', name, opts.parentPath);
        outputResult(
          { persist: false, fileName: `area-created-${name}`, data: result, summary: `Created area '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create area'); }
    });

  area
    .command('update')
    .description('Update an area path')
    .argument('<project>', 'Project name')
    .argument('<path>', 'Area path')
    .option('-n, --name <name>', 'New area name')
    .action(async (project: string, path: string, opts: any) => {
      try {
        const updates: any = {};
        if (opts.name) updates.name = opts.name;
        const result = await ctx.classification.updateClassificationNode(project, 'areas', path, updates);
        outputResult(
          { persist: false, fileName: `area-updated-${path.replace(/\\/g, '-')}`, data: result, summary: `Updated area '${path}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update area'); }
    });

  area
    .command('delete')
    .description('Delete an area path (DESTRUCTIVE)')
    .argument('<project>', 'Project name')
    .argument('<path>', 'Area path to delete')
    .argument('<reclassifyId>', 'Node ID to reclassify work items into')
    .action(async (project: string, path: string, reclassifyId: string) => {
      try {
        const result = await ctx.classification.deleteClassificationNode(project, 'areas', path, parseInt(reclassifyId));
        outputResult(
          { persist: false, fileName: `area-deleted-${path.replace(/\\/g, '-')}`, data: result, summary: `Deleted area '${path}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete area'); }
    });
}
