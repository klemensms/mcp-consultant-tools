/**
 * Git Tools - 2 read-only tools for repository branches
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';

export function registerGitTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "list-branches",
    "List branches in an Azure DevOps Git repository. Returns the short name, the full ref name, and the tip commit SHA (the refs API exposes no commit date). 'truncated' is true when more branches exist than 'maxResults' allowed.",
    {
      project: z.string().describe("The project name"),
      repositoryId: z.string().describe("Repository name or ID (use list-repositories to find it)"),
      filter: z.string().optional().describe("Ref prefix filter, default 'heads/'. Use 'heads/feature/' to list one folder"),
      maxResults: zCoerceNumber().optional().describe("Maximum branches to return (default 200)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, repositoryId, filter, maxResults }: any) => {
      try {
        const result = await ctx.git.listBranches(project, repositoryId, { filter, maxResults });
        return { content: [{ type: "text", text: `Branches in '${repositoryId}' (${project}):\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing branches:", error);
        return { content: [{ type: "text", text: `Failed to list branches: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "latest-release-branch",
    "Find the newest 'release/*' branch in a repository. 'Newest' means the highest version by digit-aware natural sort, so release/10 beats release/9 (a plain lexical sort gets this backwards). Branches with no digit in their name (e.g. release/next) cannot be ranked and are excluded, but are reported under 'ignoredNonVersionBranches' rather than silently dropped. Azure DevOps exposes no commit date on refs, so this does NOT mean 'most recently committed'.",
    {
      project: z.string().describe("The project name"),
      repositoryId: z.string().describe("Repository name or ID (use list-repositories to find it)"),
      prefix: z.string().optional().describe("Branch prefix, default 'release/'"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, repositoryId, prefix }: any) => {
      try {
        const result = await ctx.git.getLatestReleaseBranch(project, repositoryId, { prefix });
        return { content: [{ type: "text", text: `Latest release branch in '${repositoryId}' (${project}):\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error finding latest release branch:", error);
        return { content: [{ type: "text", text: `Failed to find latest release branch: ${error.message}` }] };
      }
    }
  );
}
