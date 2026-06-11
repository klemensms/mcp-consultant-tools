/**
 * App CLI Commands - 4 commands for model-driven app inspection
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerAppCommands(program: Command, ctx: ServiceContext): void {
  const app = program.command('app').description('Model-driven app inspection');

  app
    .command('list')
    .description('List all model-driven apps')
    .option('--active-only', 'Only return active apps', false)
    .option('-m, --max <n>', 'Maximum number of apps to return', '100')
    .option('--no-unpublished', 'Exclude unpublished/draft apps')
    .option('-s, --solution <name>', 'Filter apps by solution unique name')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getApps(
          opts.activeOnly,
          parseInt(opts.max),
          opts.unpublished !== false,
          opts.solution
        );
        outputResult(
          { fileName: 'apps', data: result, summary: `Found ${result.totalCount} model-driven app(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list apps'); }
    });

  app
    .command('get')
    .description('Get detailed information about a model-driven app')
    .argument('<appId>', 'App GUID (appmoduleid)')
    .action(async (appId: string) => {
      try {
        const result = await ctx.pp.getApp(appId);
        const name = (result as any)?.name || appId;
        outputResult(
          { fileName: `app-${appId}`, data: result, summary: `Model-driven app '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get app'); }
    });

  app
    .command('components')
    .description('Get all components in a model-driven app')
    .argument('<appId>', 'App GUID (appmoduleid)')
    .action(async (appId: string) => {
      try {
        const result = await ctx.pp.getAppComponents(appId);
        outputResult(
          { fileName: `app-components-${appId}`, data: result, summary: `App components (found ${result.totalCount})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get app components'); }
    });

  app
    .command('sitemap')
    .description('Get the sitemap (navigation) for a model-driven app')
    .argument('<appId>', 'App GUID (appmoduleid)')
    .action(async (appId: string) => {
      try {
        const result = await ctx.pp.getAppSitemap(appId);
        outputResult(
          { fileName: `app-sitemap-${appId}`, data: result, summary: `App sitemap for '${appId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get app sitemap'); }
    });
}
