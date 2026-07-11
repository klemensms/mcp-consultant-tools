import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { requireProject } from './helpers.js';
import { runFullReview } from '../../services/review-runner.js';

export function registerReviewCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('review <repository>')
    .description('Run a full code review (dotnet versions, NuGet packages, complexity estimate)')
    .option('-p, --project <project>', 'Azure DevOps project or GitHub org')
    .option('-b, --branch <branch>', 'Branch name')
    .option('--skip-complexity', 'Skip the code-complexity estimate')
    .option('--max-files <n>', 'Maximum files for complexity analysis (0 for unlimited)')
    .action(
      async (
        repository: string,
        opts: { project?: string; branch?: string; skipComplexity?: boolean; maxFiles?: string },
      ) => {
        try {
          const project = requireProject(opts.project);
          const report = await runFullReview(ctx, project, repository, opts.branch, {
            includeComplexity: !opts.skipComplexity,
            maxFiles: opts.maxFiles ? parseInt(opts.maxFiles, 10) : undefined,
            includeTree: true,
          });

          const lines = [
            `Repository: ${repository}`,
            `Health: ${report.overallHealth.toUpperCase()}`,
            `Total files: ${report.totalFiles ?? 0}`,
            `Projects: ${report.dotnetVersions?.summary.totalProjects ?? 0}`,
            `Packages: ${report.nugetPackages?.summary.totalPackages ?? 0}`,
            `Vulnerable: ${report.nugetPackages?.summary.vulnerablePackages ?? 0}`,
            report.complexity
              ? `Files (complexity): ${report.complexity.summary.totalFiles}` +
                (report.complexity.summary.truncated ? ` (of ${report.complexity.summary.totalFilesFound} found)` : '') +
                ` (${report.complexity.summary.totalLinesOfCode} LOC)`
              : '',
            '',
            `Issues (${report.issues.length}):`,
            ...report.issues.map((i) => `  [${i.severity.toUpperCase()}] ${i.message}`),
          ].filter(Boolean);

          outputResult({ fileName: `review-${repository}`, data: report, summary: lines.join('\n') }, getGlobalFlags(program));
        } catch (error) {
          handleCliError(error, 'run full review');
        }
      },
    );
}
