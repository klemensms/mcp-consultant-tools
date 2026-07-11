import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, CLONE_NOTE } from './tool-helpers.js';

export function registerRepositoryTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'cr-list-repos',
    `List the git repositories in an Azure DevOps project or a GitHub organization (which one depends on the configured provider). ` +
      `Returns each repository's name and default branch. When truncated is true, a paging cap was hit and more repositories exist. ` +
      `When filtered is true, the result is scoped to the configured repository allowlist.`,
    {
      project: z
        .string()
        .optional()
        .describe('Azure DevOps project name or GitHub org/owner. Falls back to CODE_REVIEW_AZDO_PROJECT for Azure DevOps.'),
    },
    READ_ONLY,
    async ({ project }: { project?: string }) =>
      runTool('listing repositories', async () => {
        const result = await ctx.repositories.listRepositories(project);
        return {
          repositories: result.items,
          count: result.items.length,
          truncated: result.truncated,
          filtered: ctx.repositories.isFiltered(),
        };
      }),
  );

  server.tool(
    'cr-tree',
    `Clone a repository and return its full file-tree listing (paths only). Useful for orienting before a deeper review. ${CLONE_NOTE}`,
    {
      project: z.string().describe('Azure DevOps project name or GitHub org/owner'),
      repository: z.string().describe('Repository name'),
      branch: z.string().optional().describe('Branch name. Defaults to the repository default branch.'),
    },
    READ_ONLY,
    async ({ project, repository, branch }: { project: string; repository: string; branch?: string }) =>
      runTool('getting repository tree', async () => {
        const files = await ctx.repositories.getRepositoryTree(project, repository, branch);
        return { repository, files, totalFiles: files.length };
      }),
  );
}
