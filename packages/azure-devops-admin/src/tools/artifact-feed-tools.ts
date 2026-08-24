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
    { readOnlyHint: true, openWorldHint: true },
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
    { readOnlyHint: true, openWorldHint: true },
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

  server.tool(
    "feed-summary",
    "All Azure Artifacts feeds with their package counts. Counts are obtained by paging, since the API publishes no total. A feed that could not be read (e.g. 403) is listed under 'unreadableFeeds' with its HTTP status - never as a feed with zero packages. When 'totalPackagesIsLowerBound' is true the total is a floor, not an exact figure.",
    {
      project: z.string().optional().describe(
        descWithExamples("Project name for project-scoped feeds. Omit for org-scoped feeds", FEED_SCOPE_EXAMPLES)
      ),
      maxPackagesPerFeed: zCoerceNumber().optional().describe("Stop counting a feed after this many packages (default: 1000)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, maxPackagesPerFeed }: any) => {
      try {
        const result = await ctx.artifactFeeds.getFeedSummaries({ project, maxPackagesPerFeed });
        return { content: [{ type: "text", text: `Feed summary:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error summarising feeds:", error);
        return { content: [{ type: "text", text: `Failed to summarise feeds: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "package-provenance",
    "Publish provenance for one package version: who published it, with what agent, and from what source. IMPORTANT: Azure DevOps publishes no structured build/branch/commit field for a package version - the endpoint is preview-only and returns an untyped 'data' bag whose keys vary by protocol. 'buildId' and 'branch' are best-effort reads of that bag and are null when absent (never the string 'unknown'). Check 'structuredProvenanceAvailable'.",
    {
      feedName: z.string().describe("Feed name (e.g., 'Acme')"),
      packageName: z.string().describe("Full package name (e.g., 'pp-solution-core')"),
      version: z.string().describe("Exact version string (e.g., '1.2.3')"),
      project: z.string().optional().describe("Project name for project-scoped feeds. Omit for org-scoped feeds."),
      packageType: z.enum(["nuget", "npm", "maven", "upack", "pypi"]).optional().describe(
        descWithExamples("Protocol type hint for faster lookup", PACKAGE_TYPE_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ feedName, packageName, version, project, packageType }: any) => {
      try {
        const result = await ctx.artifactFeeds.getPackageProvenance(feedName, packageName, version, { project, packageType });
        return { content: [{ type: "text", text: `Provenance for '${packageName}' ${version} in feed '${feedName}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting package provenance:", error);
        return { content: [{ type: "text", text: `Failed to get package provenance: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  return { readonly: readonlyCount, upsert: 0, delete: 0 };
}
