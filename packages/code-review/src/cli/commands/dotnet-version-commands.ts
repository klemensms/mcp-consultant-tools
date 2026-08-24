import { scanGapLines } from '../../services/review-runner.js';
import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { requireProject } from './helpers.js';

export function registerDotnetVersionCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('check-dotnet <repository>')
    .description('Check .NET framework versions in a repository and flag end-of-life frameworks')
    .option('-p, --project <project>', 'Azure DevOps project or GitHub org')
    .option('-b, --branch <branch>', 'Branch name')
    .action(async (repository: string, opts: { project?: string; branch?: string }) => {
      try {
        const project = requireProject(opts.project);
        const report = await ctx.repositories.cloneAndAnalyze(project, repository, opts.branch, (localPath) =>
          ctx.dotnetVersions.analyze(localPath, repository, opts.branch ?? 'default'),
        );

        const lines = [
          `Repository: ${repository}`,
          `Projects: ${report.summary.totalProjects}`,
          `Frameworks: ${Object.entries(report.summary.frameworks).map(([k, v]) => `${k} (${v})`).join(', ')}`,
        ];
        if (report.summary.eolFrameworks.length > 0) lines.push(`EOL Frameworks: ${report.summary.eolFrameworks.join(', ')}`);
        if (report.globalJson) lines.push(`SDK Version: ${report.globalJson.sdkVersion}`);
        if (report.summary.ilMergeProjects > 0) lines.push(`ILMerge/ILRepack: ${report.summary.ilMergeProjects} project(s) detected`);
        if (report.summary.recommendations.length > 0) {
          lines.push('', 'Recommendations:', ...report.summary.recommendations.map((r) => `  - ${r}`));
        }

        lines.push(
          ...scanGapLines([
            ['Directory.Build.props files', report.fanOut.directoryBuildProps],
            ['project files', report.fanOut.projects],
            ['source files (plugin detection)', report.fanOut.sourceFiles],
          ])
        );

        outputResult({ fileName: `dotnet-versions-${repository}`, data: report, summary: lines.join('\n') }, getGlobalFlags(program));
      } catch (error) {
        handleCliError(error, 'check .NET versions');
      }
    });
}
