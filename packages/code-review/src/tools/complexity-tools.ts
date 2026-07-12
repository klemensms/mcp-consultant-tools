import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, CLONE_NOTE } from './tool-helpers.js';

export function registerComplexityTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'cr-complexity',
    `Estimate code-complexity metrics (cyclomatic complexity, lines of code, method length) for C#/TypeScript/JavaScript files in a repository, with per-file detail and the top hotspots. ` +
      `Cyclomatic complexity is a regex-based ESTIMATE (decision-point count), not an AST measurement — treat the numbers as approximate. ${CLONE_NOTE}`,
    {
      project: z.string().describe('Azure DevOps project name or GitHub org/owner'),
      repository: z.string().describe('Repository name'),
      branch: z.string().optional().describe('Branch name. Defaults to the repository default branch.'),
      pathFilter: z.string().optional().describe('Path prefix to limit the scan, e.g. "src/".'),
      fileExtensions: z
        .array(z.string())
        .optional()
        .describe('File extensions to analyse (default: [".cs", ".ts", ".js"]).'),
      maxFiles: z
        .number()
        .int()
        .optional()
        .describe('Maximum files to analyse (default: 5000, 0 for unlimited). When the cap trims the set, the summary reports truncated: true.'),
    },
    READ_ONLY,
    async ({
      project,
      repository,
      branch,
      pathFilter,
      fileExtensions,
      maxFiles,
    }: {
      project: string;
      repository: string;
      branch?: string;
      pathFilter?: string;
      fileExtensions?: string[];
      maxFiles?: number;
    }) =>
      runTool('analysing code complexity', () =>
        ctx.repositories.cloneAndAnalyze(project, repository, branch, (localPath) =>
          ctx.complexity.analyze(localPath, repository, branch ?? 'default', {
            extensions: fileExtensions,
            pathFilter,
            maxFiles,
          }),
        ),
      ),
  );
}
