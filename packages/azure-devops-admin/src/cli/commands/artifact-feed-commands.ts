/**
 * Artifact Feed CLI Commands - list packages, get versions
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerArtifactFeedCommands(program: Command, ctx: ServiceContext): void {
  const feed = program.command('feed').alias('af').description('Artifact feed operations');

  feed
    .command('packages')
    .description('List packages in an artifact feed')
    .argument('<feedName>', 'Feed name')
    .option('-p, --project <project>', 'Project-scoped feed (omit for org-scoped)')
    .option('--name-prefix <prefix>', 'Filter by package name prefix')
    .option('--package-type <type>', 'Filter by package type (npm, nuget, maven, etc.)')
    .option('-t, --top <n>', 'Maximum number of results')
    .action(async (feedName: string, opts: any) => {
      try {
        const options: any = {};
        if (opts.project) options.project = opts.project;
        if (opts.namePrefix) options.namePrefix = opts.namePrefix;
        if (opts.packageType) options.packageType = opts.packageType;
        if (opts.top) options.top = parseInt(opts.top);
        const result = await ctx.artifactFeeds.listFeedPackages(feedName, options);
        outputResult(
          { fileName: `feed-packages-${feedName}`, data: result, summary: `Packages in feed '${feedName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list feed packages'); }
    });

  feed
    .command('versions')
    .description('Get version history for a package')
    .argument('<feedName>', 'Feed name')
    .argument('<packageName>', 'Package name')
    .option('-p, --project <project>', 'Project-scoped feed (omit for org-scoped)')
    .option('--package-type <type>', 'Package protocol type (npm, nuget, maven, etc.)')
    .option('-t, --top <n>', 'Maximum number of versions')
    .option('--include-delisted', 'Include delisted versions')
    .action(async (feedName: string, packageName: string, opts: any) => {
      try {
        const options: any = {};
        if (opts.project) options.project = opts.project;
        if (opts.packageType) options.packageType = opts.packageType;
        if (opts.top) options.top = parseInt(opts.top);
        if (opts.includeDelisted) options.includeDelisted = true;
        const result = await ctx.artifactFeeds.getPackageVersions(feedName, packageName, options);
        outputResult(
          { fileName: `feed-versions-${feedName}-${packageName}`, data: result, summary: `Versions of '${packageName}' in feed '${feedName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get package versions'); }
    });
}
