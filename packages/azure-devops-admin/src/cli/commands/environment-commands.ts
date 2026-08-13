/**
 * Environment CLI Commands - list, get, deployments, checks, CRUD
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerEnvironmentCommands(program: Command, ctx: ServiceContext): void {
  const env = program.command('env').alias('e').description('Environment operations');

  env
    .command('list')
    .description('List all environments in a project')
    .argument('<project>', 'Project name')
    .action(async (project: string) => {
      try {
        const result = await ctx.environments.listEnvironments(project);
        outputResult(
          { fileName: `environments-${project}`, data: result, summary: `Environments in '${project}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list environments'); }
    });

  env
    .command('get')
    .description('Get detailed environment information')
    .argument('<project>', 'Project name')
    .argument('<envId>', 'Environment ID')
    .action(async (project: string, envId: string) => {
      try {
        const result = await ctx.environments.getEnvironment(project, parseInt(envId));
        outputResult(
          { fileName: `environment-${envId}`, data: result, summary: `Environment #${envId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get environment'); }
    });

  env
    .command('deployments')
    .description('Get deployment history for an environment')
    .argument('<project>', 'Project name')
    .argument('<envId>', 'Environment ID')
    .option('-t, --top <n>', 'Maximum number of results', '10')
    .action(async (project: string, envId: string, opts: any) => {
      try {
        const result = await ctx.environments.getEnvironmentDeployments(project, parseInt(envId), parseInt(opts.top));
        outputResult(
          { fileName: `env-deployments-${envId}`, data: result, summary: `Deployments for environment #${envId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get environment deployments'); }
    });

  env
    .command('checks')
    .description('Get checks/gates configured for an environment')
    .argument('<project>', 'Project name')
    .argument('<envId>', 'Environment ID')
    .action(async (project: string, envId: string) => {
      try {
        const result = await ctx.environments.getEnvironmentChecks(project, parseInt(envId));
        outputResult(
          { fileName: `env-checks-${envId}`, data: result, summary: `Checks for environment #${envId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get environment checks'); }
    });

  env
    .command('create')
    .description('Create a new environment')
    .argument('<project>', 'Project name')
    .argument('<name>', 'Environment name')
    .option('-d, --description <text>', 'Environment description')
    .action(async (project: string, name: string, opts: any) => {
      try {
        const result = await ctx.environments.createEnvironment(project, name, opts.description);
        outputResult(
          { persist: false, fileName: `env-created-${name}`, data: result, summary: `Created environment '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create environment'); }
    });

  env
    .command('update')
    .description('Update an environment')
    .argument('<project>', 'Project name')
    .argument('<envId>', 'Environment ID')
    .option('-n, --name <name>', 'New environment name')
    .option('-d, --description <text>', 'New description')
    .action(async (project: string, envId: string, opts: any) => {
      try {
        const updates: any = {};
        if (opts.name) updates.name = opts.name;
        if (opts.description) updates.description = opts.description;
        const result = await ctx.environments.updateEnvironment(project, parseInt(envId), updates);
        outputResult(
          { persist: false, fileName: `env-updated-${envId}`, data: result, summary: `Updated environment #${envId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update environment'); }
    });

  env
    .command('delete')
    .description('Delete an environment (DESTRUCTIVE)')
    .argument('<project>', 'Project name')
    .argument('<envId>', 'Environment ID')
    .action(async (project: string, envId: string) => {
      try {
        const result = await ctx.environments.deleteEnvironment(project, parseInt(envId));
        outputResult(
          { persist: false, fileName: `env-deleted-${envId}`, data: result, summary: `Deleted environment #${envId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete environment'); }
    });

  env
    .command('add-check')
    .description('Add a check/gate to an environment')
    .argument('<project>', 'Project name')
    .argument('<envId>', 'Environment ID')
    .argument('<type>', 'Check type (e.g., Approval, ExclusiveLock, TaskCheck)')
    .option('-s, --settings <json>', 'Check settings as JSON')
    .option('--timeout <minutes>', 'Timeout in minutes')
    .action(async (project: string, envId: string, type: string, opts: any) => {
      try {
        const config: any = {};
        if (opts.settings) config.settings = JSON.parse(opts.settings);
        if (opts.timeout) config.timeout = parseInt(opts.timeout);
        const result = await ctx.environments.addEnvironmentCheck(project, parseInt(envId), type, config);
        outputResult(
          { persist: false, fileName: `env-check-added-${envId}`, data: result, summary: `Added ${type} check to environment #${envId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'add environment check'); }
    });

  env
    .command('update-check')
    .description('Update an environment check')
    .argument('<project>', 'Project name')
    .argument('<checkId>', 'Check configuration ID')
    .option('-s, --settings <json>', 'Updated settings as JSON')
    .option('--timeout <minutes>', 'Updated timeout in minutes')
    .action(async (project: string, checkId: string, opts: any) => {
      try {
        const updates: any = {};
        if (opts.settings) updates.settings = JSON.parse(opts.settings);
        if (opts.timeout) updates.timeout = parseInt(opts.timeout);
        const result = await ctx.environments.updateEnvironmentCheck(project, parseInt(checkId), updates);
        outputResult(
          { persist: false, fileName: `env-check-updated-${checkId}`, data: result, summary: `Updated check #${checkId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update environment check'); }
    });

  env
    .command('delete-check')
    .description('Delete an environment check (DESTRUCTIVE)')
    .argument('<project>', 'Project name')
    .argument('<checkId>', 'Check configuration ID')
    .action(async (project: string, checkId: string) => {
      try {
        const result = await ctx.environments.removeEnvironmentCheck(project, parseInt(checkId));
        outputResult(
          { persist: false, fileName: `env-check-deleted-${checkId}`, data: result, summary: `Deleted check #${checkId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete environment check'); }
    });
}
