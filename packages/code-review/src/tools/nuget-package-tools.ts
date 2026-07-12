import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, CLONE_NOTE } from './tool-helpers.js';

export function registerNugetPackageTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'cr-check-nuget',
    `Extract every NuGet PackageReference (including Central Package Management and packages.config) from a repository and check each against the public NuGet API for the latest stable version and for vulnerabilities affecting the referenced version. ${CLONE_NOTE}`,
    {
      project: z.string().describe('Azure DevOps project name or GitHub org/owner'),
      repository: z.string().describe('Repository name'),
      branch: z.string().optional().describe('Branch name. Defaults to the repository default branch.'),
      checkVulnerabilities: z
        .boolean()
        .optional()
        .describe('Query the NuGet API for latest versions and vulnerabilities (default: true). Set false for a fast reference-only inventory.'),
    },
    READ_ONLY,
    async ({
      project,
      repository,
      branch,
      checkVulnerabilities,
    }: {
      project: string;
      repository: string;
      branch?: string;
      checkVulnerabilities?: boolean;
    }) =>
      runTool('checking NuGet packages', () =>
        ctx.repositories.cloneAndAnalyze(project, repository, branch, (localPath) =>
          ctx.nugetPackages.analyze(localPath, repository, branch ?? 'default', checkVulnerabilities ?? true),
        ),
      ),
  );

  server.tool(
    'cr-nuget-info',
    `Look up version and vulnerability information for a single NuGet package from the public NuGet API, optionally comparing against a version you hold. Vulnerabilities reported are those affecting the given currentVersion.`,
    {
      packageId: z.string().describe('NuGet package ID, e.g. "Newtonsoft.Json"'),
      currentVersion: z
        .string()
        .optional()
        .describe('A version to compare against and to check for vulnerabilities, e.g. "13.0.1". Omit for latest-only info.'),
    },
    READ_ONLY,
    async ({ packageId, currentVersion }: { packageId: string; currentVersion?: string }) =>
      runTool('getting NuGet package info', () => ctx.nugetPackages.getPackageInfo(packageId, currentVersion)),
  );
}
