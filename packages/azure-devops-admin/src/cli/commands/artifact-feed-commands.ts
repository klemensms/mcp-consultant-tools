/**
 * Artifact Feed CLI Commands - list packages, get versions, feed summary, provenance
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

/**
 * Parse a positive integer, throwing on anything else.
 *
 * Call this BEFORE reaching into `ctx`: the service getters construct a client
 * and throw on missing config, so a parse evaluated inside the service-call
 * argument list never runs, and a typo surfaces as a credentials error.
 */
function parsePositiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer, got '${value}'`);
  }
  return parsed;
}

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

  feed
    .command('summary')
    .description('All feeds with package counts (unreadable feeds are reported, not counted as empty)')
    .option('-p, --project <name>', 'Project name for project-scoped feeds')
    .option('--max-packages-per-feed <n>', 'Stop counting a feed after this many packages (default 1000)')
    .action(async (opts: any) => {
      try {
        const maxPackagesPerFeed = parsePositiveInt(opts.maxPackagesPerFeed, '--max-packages-per-feed');
        const result = await ctx.artifactFeeds.getFeedSummaries({
          project: opts.project,
          maxPackagesPerFeed,
        });
        outputResult(
          {
            fileName: 'feed-summary',
            data: result,
            summary: `${result.feedCount} feed(s), ${result.totalPackages} package(s)${result.totalPackagesIsLowerBound ? ' (lower bound)' : ''}${result.unreadableFeeds.length ? `, ${result.unreadableFeeds.length} unreadable` : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'summarise feeds'); }
    });

  feed
    .command('provenance')
    .description('Publish provenance for a package version (preview API; build/branch may be absent)')
    .argument('<feedName>', 'Feed name')
    .argument('<packageName>', 'Package name')
    .argument('<version>', 'Exact version string')
    .option('-p, --project <name>', 'Project name for project-scoped feeds')
    .option('--package-type <type>', 'Package protocol type (npm, nuget, maven, upack, pypi)')
    .action(async (feedName: string, packageName: string, version: string, opts: any) => {
      try {
        const result = await ctx.artifactFeeds.getPackageProvenance(feedName, packageName, version, {
          project: opts.project,
          packageType: opts.packageType,
        });
        outputResult(
          {
            fileName: `package-provenance-${packageName}-${version}`,
            data: result,
            summary: result.structuredProvenanceAvailable
              ? `${packageName} ${version}: build ${result.buildId ?? 'n/a'}, branch ${result.branch ?? 'n/a'}`
              : `${packageName} ${version}: no structured build/branch provenance exposed by Azure DevOps`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get package provenance'); }
    });
}
