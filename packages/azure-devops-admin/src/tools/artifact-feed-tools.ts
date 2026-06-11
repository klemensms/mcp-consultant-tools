/**
 * Artifact feed tools - read-only only (no upsert/delete tiers).
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';
import { descWithExamples, PACKAGE_TYPE_EXAMPLES, FEED_SCOPE_EXAMPLES } from '../tool-examples.js';

export function registerArtifactFeedTools(server: any, ctx: ServiceContext): { readonly: number; upsert: number; delete: number } {
  let readonlyCount = 0;

  server.tool(
    "list-feed-packages",
    "List packages in an Azure Artifacts feed. Returns package names, latest versions, and publish dates. Use to discover available packages before querying specific versions.",
    {
      feedName: z.string().describe("Feed name (e.g., 'Acme')"),
      project: z.string().optional().describe(
        descWithExamples("Project name for project-scoped feeds. Omit for org-scoped feeds", FEED_SCOPE_EXAMPLES)
      ),
      namePrefix: z.string().optional().describe("Filter packages by name prefix (e.g., 'pp-solution-')"),
      packageType: z.enum(["nuget", "npm", "maven", "upack", "pypi"]).optional().describe(
        descWithExamples("Filter by package protocol type", PACKAGE_TYPE_EXAMPLES)
      ),
      top: zCoerceNumber().optional().describe("Maximum number of packages to return (default: 50)"),
    },
    async ({ feedName, project, namePrefix, packageType, top }: any) => {
      try {
        const result = await ctx.artifactFeeds.listFeedPackages(feedName, { project, namePrefix, packageType, top: top || 50 });
        return { content: [{ type: "text", text: `Packages in feed '${feedName}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing feed packages:", error);
        return { content: [{ type: "text", text: `Failed to list feed packages: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-package-versions",
    "Get version history for a specific package in an Azure Artifacts feed. Returns versions sorted by publish date, useful for finding the latest version before queuing a deployment pipeline.",
    {
      feedName: z.string().describe("Feed name (e.g., 'Acme')"),
      packageName: z.string().describe("Full package name (e.g., 'pp-solution-core')"),
      project: z.string().optional().describe("Project name for project-scoped feeds. Omit for org-scoped feeds."),
      packageType: z.enum(["nuget", "npm", "maven", "upack", "pypi"]).optional().describe(
        descWithExamples("Protocol type hint for faster lookup", PACKAGE_TYPE_EXAMPLES)
      ),
      top: zCoerceNumber().optional().describe("Maximum number of versions to return (default: 10)"),
      includeDelisted: z.boolean().optional().describe("Include delisted/deprecated versions (default: false)"),
    },
    async ({ feedName, packageName, project, packageType, top, includeDelisted }: any) => {
      try {
        const result = await ctx.artifactFeeds.getPackageVersions(feedName, packageName, {
          project, packageType, top: top || 10, includeDelisted: includeDelisted || false
        });
        return { content: [{ type: "text", text: `Versions for '${packageName}' in feed '${feedName}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting package versions:", error);
        return { content: [{ type: "text", text: `Failed to get package versions: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  return { readonly: readonlyCount, upsert: 0, delete: 0 };
}
