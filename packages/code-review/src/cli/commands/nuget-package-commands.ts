import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { requireProject } from './helpers.js';

export function registerNugetPackageCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('check-nuget <repository>')
    .description('Check NuGet packages for outdated/vulnerable versions')
    .option('-p, --project <project>', 'Azure DevOps project or GitHub org')
    .option('-b, --branch <branch>', 'Branch name')
    .option('--skip-vulnerabilities', 'Skip NuGet API vulnerability/version checks (reference-only inventory)')
    .action(async (repository: string, opts: { project?: string; branch?: string; skipVulnerabilities?: boolean }) => {
      try {
        const project = requireProject(opts.project);
        const report = await ctx.repositories.cloneAndAnalyze(project, repository, opts.branch, (localPath) =>
          ctx.nugetPackages.analyze(localPath, repository, opts.branch ?? 'default', !opts.skipVulnerabilities),
        );

        const lines = [
          `Repository: ${repository}`,
          `Projects: ${report.summary.totalProjects}`,
          `Packages: ${report.summary.totalPackages} (${report.summary.uniquePackages} unique)`,
          `Outdated: ${report.summary.outdatedPackages}`,
          `Vulnerable: ${report.summary.vulnerablePackages}`,
        ];
        if (report.summary.vulnerablePackages > 0) {
          lines.push('', 'Vulnerable:');
          for (const proj of report.projects) {
            for (const pkg of proj.packages) {
              if (pkg.status === 'vulnerable') lines.push(`  - ${pkg.id} ${pkg.currentVersion} in ${proj.path}`);
            }
          }
        }

        outputResult({ fileName: `nuget-packages-${repository}`, data: report, summary: lines.join('\n') }, getGlobalFlags(program));
      } catch (error) {
        handleCliError(error, 'check NuGet packages');
      }
    });

  program
    .command('nuget-info <packageId>')
    .description('Get info about a specific NuGet package')
    .option('-v, --version <version>', 'Current version to compare against and check for vulnerabilities')
    .action(async (packageId: string, opts: { version?: string }) => {
      try {
        const result = await ctx.nugetPackages.getPackageInfo(packageId, opts.version);
        outputResult(
          {
            fileName: `nuget-info-${packageId}`,
            data: result,
            summary: [
              `Package: ${result.id}`,
              `Current: ${result.currentVersion || 'N/A'}`,
              `Latest Stable: ${result.latestStableVersion ?? 'N/A'}`,
              `Status: ${result.status}`,
              result.vulnerabilities?.length ? `Vulnerabilities: ${result.vulnerabilities.length}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program),
        );
      } catch (error) {
        handleCliError(error, 'get NuGet package info');
      }
    });
}
