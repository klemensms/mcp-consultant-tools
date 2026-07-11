import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, CLONE_NOTE } from './tool-helpers.js';

export function registerDotnetVersionTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'cr-check-dotnet',
    `Scan a repository for .NET target-framework versions (from global.json, Directory.Build.props, and .csproj files) and flag end-of-life frameworks. ` +
      `EOL status is computed from each framework's published end-of-life date versus today, so it never goes stale. Also detects CRM/Dataverse SDK usage and ILMerge/ILRepack. ${CLONE_NOTE}`,
    {
      project: z.string().describe('Azure DevOps project name or GitHub org/owner'),
      repository: z.string().describe('Repository name'),
      branch: z.string().optional().describe('Branch name. Defaults to the repository default branch.'),
    },
    READ_ONLY,
    async ({ project, repository, branch }: { project: string; repository: string; branch?: string }) =>
      runTool('checking .NET versions', () =>
        ctx.repositories.cloneAndAnalyze(project, repository, branch, (localPath) =>
          ctx.dotnetVersions.analyze(localPath, repository, branch ?? 'default'),
        ),
      ),
  );
}
