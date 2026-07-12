import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { truncationNote } from './helpers.js';

export function registerPackageCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('packages')
    .description('List packages in a GitHub Enterprise organization')
    .requiredOption('--org <org>', 'GitHub organization name')
    .option('--type <type>', 'Package type (default: npm)')
    .action(async (opts: { org: string; type?: string }) => {
      try {
        const result = await ctx.packages.listPackages(opts.org, opts.type);
        outputResult(
          {
            fileName: `packages-${opts.org}`,
            data: { packages: result.items, truncated: result.truncated },
            summary: [
              `Found ${result.items.length} package(s): ${result.items.map((p) => p.name).join(', ')}`,
              truncationNote(result.truncated),
            ]
              .filter((line) => line !== '')
              .join('\n'),
          },
          getGlobalFlags(program),
        );
      } catch (error) {
        handleCliError(error, 'list packages');
      }
    });

  program
    .command('package-versions <packageName>')
    .description('List versions of a GitHub package')
    .requiredOption('--org <org>', 'GitHub organization name')
    .option('--type <type>', 'Package type (default: npm)')
    .action(async (packageName: string, opts: { org: string; type?: string }) => {
      try {
        const result = await ctx.packages.getPackageVersions(opts.org, packageName, opts.type);
        const latest = result.items[0];
        outputResult(
          {
            fileName: `package-versions-${packageName}`,
            data: { versions: result.items, truncated: result.truncated },
            summary: [
              `Found ${result.items.length} version(s)${latest ? ` (latest: ${latest.name})` : ''}`,
              truncationNote(result.truncated),
            ]
              .filter((line) => line !== '')
              .join('\n'),
          },
          getGlobalFlags(program),
        );
      } catch (error) {
        handleCliError(error, 'get package versions');
      }
    });

  program
    .command('latest-package-version <packageName>')
    .description('Get the latest stable release version of a GitHub package (excludes pre-release)')
    .requiredOption('--org <org>', 'GitHub organization name')
    .action(async (packageName: string, opts: { org: string }) => {
      try {
        const result = await ctx.packages.getLatestReleaseVersion(opts.org, packageName);
        outputResult(
          {
            fileName: `latest-package-version-${packageName}`,
            data: result,
            summary: result.latestVersion
              ? `Latest release: ${result.latestVersion} (${result.allReleaseVersions.length} release versions total)`
              : `No release versions found for ${packageName}`,
          },
          getGlobalFlags(program),
        );
      } catch (error) {
        handleCliError(error, 'get latest package version');
      }
    });
}
