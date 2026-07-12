import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, GHE_PACKAGES_NOTE } from './tool-helpers.js';

export function registerPackageTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'cr-packages',
    `List the packages published to a GitHub Enterprise organization. When truncated is true, a paging cap was hit and more packages exist. ${GHE_PACKAGES_NOTE}`,
    {
      org: z.string().describe('GitHub organization name'),
      packageType: z.string().optional().describe('Package type filter, e.g. "npm" (default), "nuget", "maven", "docker".'),
    },
    READ_ONLY,
    async ({ org, packageType }: { org: string; packageType?: string }) =>
      runTool('listing GitHub packages', async () => {
        const result = await ctx.packages.listPackages(org, packageType);
        return { packages: result.items, count: result.items.length, truncated: result.truncated };
      }),
  );

  server.tool(
    'cr-package-versions',
    `List every published version of a package in a GitHub Enterprise organization. When truncated is true, more versions exist beyond the paging cap. ${GHE_PACKAGES_NOTE}`,
    {
      org: z.string().describe('GitHub organization name'),
      packageName: z.string().describe('Package name, e.g. "my-lib" or "@contoso/my-lib"'),
      packageType: z.string().optional().describe('Package type (default: "npm").'),
    },
    READ_ONLY,
    async ({ org, packageName, packageType }: { org: string; packageName: string; packageType?: string }) =>
      runTool('getting package versions', async () => {
        const result = await ctx.packages.getPackageVersions(org, packageName, packageType);
        return { versions: result.items, count: result.items.length, truncated: result.truncated };
      }),
  );

  server.tool(
    'cr-latest-package-version',
    `Get the latest STABLE release version of a package in a GitHub Enterprise organization, excluding pre-release/feature builds (e.g. 2.0.38-g066b9a3212). Versions are ordered by SemVer. ${GHE_PACKAGES_NOTE}`,
    {
      org: z.string().describe('GitHub organization name'),
      packageName: z.string().describe('Package name, e.g. "my-lib"'),
    },
    READ_ONLY,
    async ({ org, packageName }: { org: string; packageName: string }) =>
      runTool('getting latest package version', () => ctx.packages.getLatestReleaseVersion(org, packageName)),
  );
}
