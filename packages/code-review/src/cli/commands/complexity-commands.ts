import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { requireProject, parseExtensions } from './helpers.js';

export function registerComplexityCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('complexity <repository>')
    .description('Estimate code complexity in a repository (cyclomatic complexity is an approximation)')
    .option('-p, --project <project>', 'Azure DevOps project or GitHub org')
    .option('-b, --branch <branch>', 'Branch name')
    .option('--path <filter>', 'Path prefix filter, e.g. "src/"')
    .option('--ext <extensions>', 'Comma-separated file extensions (default: .cs,.ts,.js)')
    .option('--max-files <n>', 'Maximum files to analyze (default: 5000)')
    .option('--no-limit', 'Analyze all matching files (overrides --max-files)')
    .action(
      async (
        repository: string,
        opts: { project?: string; branch?: string; path?: string; ext?: string; maxFiles?: string; limit?: boolean },
      ) => {
        try {
          const project = requireProject(opts.project);
          const maxFiles = opts.limit === false ? 0 : opts.maxFiles ? parseInt(opts.maxFiles, 10) : 5000;
          const report = await ctx.repositories.cloneAndAnalyze(project, repository, opts.branch, (localPath) =>
            ctx.complexity.analyze(localPath, repository, opts.branch ?? 'default', {
              extensions: parseExtensions(opts.ext),
              pathFilter: opts.path,
              maxFiles,
            }),
          );

          const lines = [
            `Repository: ${repository}`,
            `Files: ${report.summary.totalFiles}` +
              (report.summary.truncated ? ` (of ${report.summary.totalFilesFound} found — use --no-limit for all)` : ''),
            `Total LOC: ${report.summary.totalLinesOfCode}`,
            `Avg Complexity (estimate): ${report.summary.averageCyclomaticComplexity}`,
            `Max Complexity (estimate): ${report.summary.maxCyclomaticComplexity}`,
          ];
          if (report.summary.hotspots.length > 0) {
            lines.push('', 'Top Hotspots:');
            for (const h of report.summary.hotspots) {
              lines.push(`  ${h.methodName} (${h.cyclomaticComplexity}) - ${h.filePath} (${h.linesOfCode} LOC)`);
            }
          }

          outputResult({ fileName: `complexity-${repository}`, data: report, summary: lines.join('\n') }, getGlobalFlags(program));
        } catch (error) {
          handleCliError(error, 'analyze code complexity');
        }
      },
    );
}
