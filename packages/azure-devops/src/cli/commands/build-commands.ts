/**
 * Build CLI Commands - 3 commands for build troubleshooting
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerBuildCommands(program: Command, ctx: ServiceContext): void {
  const build = program.command('build').description('Build troubleshooting operations');

  build
    .command('status')
    .description('Get build status and details')
    .argument('<project>', 'Project name')
    .argument('<buildId>', 'Build ID')
    .option('-d, --detail <level>', 'Detail level: summary, timeline, full', 'summary')
    .option('-s, --scope <scope>', 'Timeline scope: problems, stages, jobs, all', 'problems')
    .option('-m, --max-issues <n>', 'Max issues per record', '5')
    .action(async (project: string, buildId: string, opts: any) => {
      try {
        const result = await ctx.build.getBuildStatus(project, parseInt(buildId), opts.detail, opts.scope, parseInt(opts.maxIssues));
        outputResult(
          { fileName: `build-${buildId}-status`, data: result, summary: `Build #${buildId} status: ${(result as any)?.status || 'unknown'}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get build status'); }
    });

  build
    .command('timeline')
    .description('Get step-by-step breakdown of a build')
    .argument('<project>', 'Project name')
    .argument('<buildId>', 'Build ID')
    .option('-s, --scope <scope>', 'Filter scope: problems, stages, jobs, all', 'problems')
    .option('-m, --max-issues <n>', 'Max issues per record', '5')
    .action(async (project: string, buildId: string, opts: any) => {
      try {
        const result = await ctx.build.getBuildTimeline(project, parseInt(buildId), opts.scope, parseInt(opts.maxIssues));
        outputResult(
          { fileName: `build-${buildId}-timeline`, data: result, summary: `Build #${buildId} timeline` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get build timeline'); }
    });

  build
    .command('logs')
    .description('Get build logs')
    .argument('<project>', 'Project name')
    .argument('<buildId>', 'Build ID')
    .option('-l, --log-id <n>', 'Specific log ID to retrieve')
    .option('-m, --mode <mode>', 'Filter mode: summary, full, errors', 'summary')
    .action(async (project: string, buildId: string, opts: any) => {
      try {
        const logId = opts.logId ? parseInt(opts.logId) : undefined;
        const result = await ctx.build.getBuildLogs(project, parseInt(buildId), logId, opts.mode);
        outputResult(
          { fileName: `build-${buildId}-logs${logId ? `-${logId}` : ''}`, data: result, summary: `Build #${buildId} logs` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get build logs'); }
    });
}
