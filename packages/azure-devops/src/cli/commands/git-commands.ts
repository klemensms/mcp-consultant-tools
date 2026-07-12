/**
 * Git CLI Commands - 2 commands
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

export function registerGitCommands(program: Command, ctx: ServiceContext): void {
  const git = program.command('git').description('Git repository operations');

  git
    .command('branches')
    .description('List branches in a repository')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository name or ID')
    .option('-f, --filter <prefix>', "Ref prefix filter (default 'heads/')")
    .option('--max-results <n>', 'Maximum branches to return (default 200)')
    .action(async (project: string, repositoryId: string, opts: any) => {
      try {
        const maxResults = parsePositiveInt(opts.maxResults, '--max-results');
        const result = await ctx.git.listBranches(project, repositoryId, {
          filter: opts.filter,
          maxResults,
        });
        outputResult(
          { fileName: `branches-${repositoryId}`, data: result, summary: `${result.branchCount} branch(es) in '${repositoryId}'${result.truncated ? ' (truncated)' : ''}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list branches'); }
    });

  git
    .command('latest-release')
    .description("Find the newest 'release/*' branch by version (digit-aware natural sort)")
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository name or ID')
    .option('-p, --prefix <prefix>', "Branch prefix (default 'release/')")
    .action(async (project: string, repositoryId: string, opts: any) => {
      try {
        const result = await ctx.git.getLatestReleaseBranch(project, repositoryId, {
          prefix: opts.prefix,
        });
        outputResult(
          {
            fileName: `latest-release-${repositoryId}`,
            data: result,
            summary: result.branchName
              ? `Latest release branch: ${result.branchName} (${result.candidateCount} candidate(s))`
              : `No version-like release branch found in '${repositoryId}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'find latest release branch'); }
    });
}
