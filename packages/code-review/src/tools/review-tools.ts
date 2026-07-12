import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, CLONE_NOTE } from './tool-helpers.js';
import { runFullReview } from '../services/review-runner.js';

export function registerReviewTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'cr-review',
    `Run every check (.NET framework EOL, NuGet package audit, and code-complexity estimate) on a repository in a single clone and return a consolidated report with an overall health verdict and a prioritised issue list. ${CLONE_NOTE}`,
    {
      project: z.string().describe('Azure DevOps project name or GitHub org/owner'),
      repository: z.string().describe('Repository name'),
      branch: z.string().optional().describe('Branch name. Defaults to the repository default branch.'),
      includeComplexity: z
        .boolean()
        .optional()
        .describe('Include the code-complexity estimate (default: true). Set false to skip it on very large repositories.'),
      maxFiles: z
        .number()
        .int()
        .optional()
        .describe('Maximum files for the complexity pass (default: 5000, 0 for unlimited).'),
    },
    READ_ONLY,
    async ({
      project,
      repository,
      branch,
      includeComplexity,
      maxFiles,
    }: {
      project: string;
      repository: string;
      branch?: string;
      includeComplexity?: boolean;
      maxFiles?: number;
    }) =>
      runTool('running full review', () =>
        runFullReview(ctx, project, repository, branch, {
          includeComplexity: includeComplexity ?? true,
          maxFiles,
          includeTree: true,
        }),
      ),
  );
}
