import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { requireProject, truncationNote } from './helpers.js';

export function registerRepositoryCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('list-repos')
    .description('List all repositories in a project/organization')
    .option('-p, --project <project>', 'Azure DevOps project or GitHub org')
    .action(async (opts: { project?: string }) => {
      try {
        const result = await ctx.repositories.listRepositories(opts.project);
        outputResult(
          {
            fileName: 'repositories',
            data: { repositories: result.items, truncated: result.truncated, filtered: ctx.repositories.isFiltered() },
            summary: [
              `Found ${result.items.length} repositories${ctx.repositories.isFiltered() ? ' (filtered)' : ''}:`,
              truncationNote(result.truncated),
              ...result.items.map((r) => `  ${r.name} (${r.defaultBranch})`),
            ]
              .filter((line) => line !== '')
              .join('\n'),
          },
          getGlobalFlags(program),
        );
      } catch (error) {
        handleCliError(error, 'list repositories');
      }
    });

  program
    .command('tree <repository>')
    .description('Show a repository file tree')
    .option('-p, --project <project>', 'Azure DevOps project or GitHub org')
    .option('-b, --branch <branch>', 'Branch name')
    .action(async (repository: string, opts: { project?: string; branch?: string }) => {
      try {
        const project = requireProject(opts.project);
        const files = await ctx.repositories.getRepositoryTree(project, repository, opts.branch);
        outputResult(
          {
            fileName: `tree-${repository}`,
            data: { repository, files, totalFiles: files.length },
            summary: [
              `Repository: ${repository} (${files.length} files)`,
              ...files.slice(0, 50).map((f) => `  ${f}`),
              files.length > 50 ? `  ... and ${files.length - 50} more` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program),
        );
      } catch (error) {
        handleCliError(error, 'get repository tree');
      }
    });
}
