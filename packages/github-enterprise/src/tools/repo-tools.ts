import { z } from 'zod';
import * as gheFormatters from '../utils/ghe-formatters.js';
import type { ServiceContext } from '../types.js';

/**
 * Register repository, branch, file, commit, and search tools.
 */
export function registerRepoTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "ghe-list-repos",
    "List all configured GitHub Enterprise repositories (active and inactive)",
    {},
    // Reads configured repos from local config only — no network call.
    { readOnlyHint: true },
    async () => {
      try {
        const repos = ctx.repo.base.getAllRepos();
        const reposWithUrls = repos.map((r: any) => ({
          ...r,
          url: `${ctx.repo.base.config.baseUrl}/${r.owner}/${r.repo}`
        }));

        return {
          content: [{
            type: "text",
            text: `# Configured GitHub Enterprise Repositories\n\n` +
              `**Total:** ${repos.length} repositories\n` +
              `**Active:** ${repos.filter(r => r.active).length}\n\n` +
              JSON.stringify(reposWithUrls, null, 2)
          }]
        };
      } catch (error: any) {
        console.error("Error listing GitHub Enterprise repositories:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to list repositories: ${error.message}\n\n` +
              `Troubleshooting:\n` +
              `1. Verify GHE_URL is set correctly\n` +
              `2. Verify GHE_PAT or GitHub App credentials are set\n` +
              `3. Verify GHE_REPOS is configured as JSON array\n` +
              `4. Check repository access permissions`
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "ghe-list-branches",
    "List all branches for a GitHub Enterprise repository",
    {
      repoId: z.string().describe("Repository ID from configuration (e.g., 'plugin-core')"),
      protectedOnly: z.boolean().optional().describe("Filter by protection status (true for protected branches only)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, protectedOnly }: any) => {
      try {
        const branches = await ctx.repo.listBranches(repoId, protectedOnly);
        return {
          content: [{
            type: "text",
            text: `# Branches for Repository: ${repoId}\n\n` +
              `**Total:** ${branches.length} branches\n\n` +
              gheFormatters.formatBranchListAsMarkdown(branches)
          }]
        };
      } catch (error: any) {
        console.error("Error listing branches:", error);
        return { content: [{ type: "text", text: `Failed to list branches: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-get-default-branch",
    "Auto-detect the default branch for a repository (handles typos, provides alternatives)",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      userSpecified: z.string().optional().describe("User-specified branch name (overrides auto-detection)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, userSpecified }: any) => {
      try {
        const result = await ctx.repo.getDefaultBranch(repoId, userSpecified);

        let output = `# Default Branch for Repository: ${repoId}\n\n`;
        output += `**Selected Branch:** \`${result.branch}\`  \n`;
        output += `**Reason:** ${result.reason}  \n`;
        output += `**Confidence:** ${result.confidence}  \n\n`;

        if (result.alternatives && result.alternatives.length > 0) {
          output += `**Alternative Branches:**\n`;
          result.alternatives.slice(0, 5).forEach(alt => { output += `- \`${alt}\`\n`; });
          if (result.alternatives.length > 5) output += `- ... and ${result.alternatives.length - 5} more\n`;
        }

        if (result.message) output += `\n**Note:** ${result.message}\n`;

        return { content: [{ type: "text", text: output }] };
      } catch (error: any) {
        console.error("Error getting default branch:", error);
        return { content: [{ type: "text", text: `Failed to get default branch: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-get-file",
    "Get file content from a GitHub Enterprise repository",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      path: z.string().describe("File path (e.g., 'src/Plugins/ContactPlugin.cs')"),
      branch: z.string().optional().describe("Branch name (default: auto-detected)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, path, branch }: any) => {
      try {
        const file = await ctx.repo.getFile(repoId, path, branch);
        return {
          content: [{
            type: "text",
            text: `# File: ${path}\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**Branch:** \`${file.branch}\`  \n` +
              `**Size:** ${file.size} bytes  \n` +
              `**SHA:** \`${file.sha}\`  \n\n` +
              `## Content\n\n\`\`\`\n${file.decodedContent}\n\`\`\``
          }]
        };
      } catch (error: any) {
        console.error("Error getting file:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get file: ${error.message}\n\n` +
              `Troubleshooting:\n` +
              `1. Verify file path is correct\n` +
              `2. Verify branch exists (or let auto-detection find it)\n` +
              `3. Check if file size exceeds GHE_MAX_FILE_SIZE (default: 1MB)`
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "ghe-search-code",
    "Search code across GitHub Enterprise repositories",
    {
      query: z.string().describe("Search query (e.g., 'class ContactPlugin')"),
      repoId: z.string().optional().describe("Limit to specific repository"),
      path: z.string().optional().describe("Filter by file path pattern"),
      extension: z.string().optional().describe("Filter by file extension (e.g., 'cs', 'js')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ query, repoId, path, extension }: any) => {
      try {
        const results = await ctx.repo.searchCode(query, repoId, path, extension);
        return { content: [{ type: "text", text: gheFormatters.formatCodeSearchResultsAsMarkdown(results) }] };
      } catch (error: any) {
        console.error("Error searching code:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to search code: ${error.message}\n\n` +
              `Troubleshooting:\n1. Simplify search query if too complex\n2. Check rate limits if search fails\n3. Verify repository access permissions`
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "ghe-list-files",
    "List files in a directory of a GitHub Enterprise repository",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      path: z.string().optional().describe("Directory path (default: root)"),
      branch: z.string().optional().describe("Branch name (default: auto-detected)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, path, branch }: any) => {
      try {
        const result = await ctx.repo.listFiles(repoId, path, branch);
        return {
          content: [{
            type: "text",
            text: `# Directory: ${path || '/'}\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**Branch:** \`${result.branch}\`  \n\n` +
              gheFormatters.formatDirectoryContentsAsMarkdown(result.contents)
          }]
        };
      } catch (error: any) {
        console.error("Error listing files:", error);
        return { content: [{ type: "text", text: `Failed to list files: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-clear-cache",
    "Clear cached GitHub Enterprise API responses (useful after pushing code updates)",
    {
      pattern: z.string().optional().describe("Clear only cache entries matching this pattern (e.g., 'ContactPlugin.cs')"),
      repoId: z.string().optional().describe("Clear cache for specific repository only"),
    },
    // Clears local response cache only; regenerable, no remote data touched.
    { readOnlyHint: false, destructiveHint: false },
    async ({ pattern, repoId }: any) => {
      try {
        const cleared = ctx.repo.base.clearCache(pattern, repoId);
        return {
          content: [{
            type: "text",
            text: `Cleared ${cleared} cache entries` +
              (pattern ? ` matching pattern '${pattern}'` : '') +
              (repoId ? ` for repository '${repoId}'` : '')
          }]
        };
      } catch (error: any) {
        console.error("Error clearing cache:", error);
        return { content: [{ type: "text", text: `Failed to clear cache: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-get-commits",
    "Get commit history for a branch in a GitHub Enterprise repository",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      branch: z.string().optional().describe("Branch name (default: auto-detected)"),
      since: z.string().optional().describe("ISO 8601 date (e.g., '2025-01-01T00:00:00Z')"),
      until: z.string().optional().describe("ISO 8601 date"),
      author: z.string().optional().describe("Filter by author"),
      path: z.string().optional().describe("Filter by file path"),
      limit: z.number().optional().describe("Max commits (default: 50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, branch, since, until, author, path, limit }: any) => {
      try {
        const commits = await ctx.repo.getCommits(repoId, branch, since, until, author, path, limit || 50);
        return {
          content: [{
            type: "text",
            text: `# Commit History\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**Count:** ${commits.length}\n\n` +
              gheFormatters.formatCommitHistoryAsMarkdown(commits)
          }]
        };
      } catch (error: any) {
        console.error("Error getting commits:", error);
        return { content: [{ type: "text", text: `Failed to get commits: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-get-commit-details",
    "Get detailed information about a specific commit in a GitHub Enterprise repository",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      sha: z.string().describe("Commit SHA"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, sha }: any) => {
      try {
        const commit = await ctx.repo.getCommitDetails(repoId, sha);
        return { content: [{ type: "text", text: gheFormatters.formatCommitDetailsAsMarkdown(commit) }] };
      } catch (error: any) {
        console.error("Error getting commit details:", error);
        return { content: [{ type: "text", text: `Failed to get commit details: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-search-commits",
    "Search commits by message or hash (supports work item references like '#1234')",
    {
      query: z.string().describe("Search query (e.g., '#1234', 'fix bug')"),
      repoId: z.string().optional().describe("Limit to specific repository"),
      author: z.string().optional().describe("Filter by author"),
      since: z.string().optional().describe("ISO 8601 date"),
      until: z.string().optional().describe("ISO 8601 date"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ query, repoId, author, since, until }: any) => {
      try {
        const results = await ctx.repo.searchCommits(query, repoId, author, since, until);
        return {
          content: [{
            type: "text",
            text: `# Commit Search Results\n\n` +
              `**Query:** ${query}  \n` +
              `**Total Results:** ${results.total_count}  \n` +
              `**Showing:** ${results.items.length}\n\n` +
              gheFormatters.formatCommitHistoryAsMarkdown(results.items)
          }]
        };
      } catch (error: any) {
        console.error("Error searching commits:", error);
        return { content: [{ type: "text", text: `Failed to search commits: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-get-commit-diff",
    "Get detailed diff for a commit in unified format",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      sha: z.string().describe("Commit SHA"),
      format: z.enum(['diff', 'patch']).optional().describe("Format: 'diff' or 'patch' (default: 'diff')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, sha, format }: any) => {
      try {
        const diff = await ctx.repo.getCommitDiff(repoId, sha, format || 'diff');
        return {
          content: [{
            type: "text",
            text: `# Commit Diff: ${sha}\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**Format:** ${format || 'diff'}  \n\n` +
              `\`\`\`diff\n${diff}\n\`\`\``
          }]
        };
      } catch (error: any) {
        console.error("Error getting commit diff:", error);
        return { content: [{ type: "text", text: `Failed to get commit diff: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-compare-branches",
    "Compare two branches and show differences",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      base: z.string().describe("Base branch name"),
      head: z.string().describe("Head branch name"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, base, head }: any) => {
      try {
        const comparison = await ctx.repo.compareBranches(repoId, base, head);
        const insights = gheFormatters.analyzeBranchComparison(comparison);
        return {
          content: [{
            type: "text",
            text: `# Branch Comparison: ${base} <- ${head}\n\n` +
              `**Repository:** ${repoId}  \n\n` +
              `## Summary\n\n` +
              insights.join('\n') + '\n\n' +
              `## Commits (${comparison.commits.length})\n\n` +
              gheFormatters.formatCommitHistoryAsMarkdown(comparison.commits.slice(0, 10))
          }]
        };
      } catch (error: any) {
        console.error("Error comparing branches:", error);
        return { content: [{ type: "text", text: `Failed to compare branches: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-get-branch-details",
    "Get detailed information about a specific branch",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      branch: z.string().describe("Branch name"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, branch }: any) => {
      try {
        const branchInfo = await ctx.repo.getBranchDetails(repoId, branch);
        return {
          content: [{
            type: "text",
            text: `# Branch Details: ${branch}\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**Protected:** ${branchInfo.protected ? 'Yes' : 'No'}  \n` +
              `**Last Commit:** \`${branchInfo.commit.sha.substring(0, 7)}\`  \n` +
              `**Commit Message:** ${branchInfo.commit.commit.message.split('\n')[0]}  \n` +
              `**Author:** ${branchInfo.commit.commit.author.name}  \n` +
              `**Date:** ${new Date(branchInfo.commit.commit.author.date).toLocaleString()}  \n\n` +
              JSON.stringify(branchInfo, null, 2)
          }]
        };
      } catch (error: any) {
        console.error("Error getting branch details:", error);
        return { content: [{ type: "text", text: `Failed to get branch details: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-get-dir-structure",
    "Get recursive directory tree structure",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      path: z.string().optional().describe("Directory path (default: root)"),
      branch: z.string().optional().describe("Branch name (default: auto-detected)"),
      depth: z.number().optional().describe("Recursion depth limit (default: 3)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, path, branch, depth }: any) => {
      try {
        const result = await ctx.repo.getDirectoryStructure(repoId, path, branch, depth || 3);
        return {
          content: [{
            type: "text",
            text: `# Directory Structure: ${path || '/'}\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**Branch:** \`${result.branch}\`  \n` +
              `**Max Depth:** ${depth || 3}\n\n` +
              '```\n' + gheFormatters.formatFileTreeAsMarkdown(result.tree) + '\n```'
          }]
        };
      } catch (error: any) {
        console.error("Error getting directory structure:", error);
        return { content: [{ type: "text", text: `Failed to get directory structure: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-get-file-history",
    "Get commit history for a specific file",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      path: z.string().describe("File path"),
      branch: z.string().optional().describe("Branch name (default: auto-detected)"),
      limit: z.number().optional().describe("Max commits (default: 50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, path, branch, limit }: any) => {
      try {
        const commits = await ctx.repo.getFileHistory(repoId, path, branch, limit || 50);
        return {
          content: [{
            type: "text",
            text: `# File History: ${path}\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**Commits:** ${commits.length}\n\n` +
              gheFormatters.formatCommitHistoryAsMarkdown(commits)
          }]
        };
      } catch (error: any) {
        console.error("Error getting file history:", error);
        return { content: [{ type: "text", text: `Failed to get file history: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-create-branch",
    "Create a new branch (requires GHE_ENABLE_CREATE=true)",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      branchName: z.string().describe("New branch name"),
      fromBranch: z.string().optional().describe("Source branch (default: auto-detected)"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ repoId, branchName, fromBranch }: any) => {
      try {
        const result = await ctx.repo.createBranch(repoId, branchName, fromBranch);
        return {
          content: [{
            type: "text",
            text: `Branch '${branchName}' created successfully\n\n` + JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        console.error("Error creating branch:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to create branch: ${error.message}\n\nNote: Branch creation requires GHE_ENABLE_CREATE=true`
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "ghe-update-file",
    "Update file content (requires GHE_ENABLE_WRITE=true)",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      path: z.string().describe("File path"),
      content: z.string().describe("New file content"),
      message: z.string().describe("Commit message"),
      branch: z.string().describe("Branch name"),
      sha: z.string().describe("Current file SHA (for conflict detection)"),
    },
    // Commits new file content (additive revision); not a destructive delete.
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ repoId, path, content, message, branch, sha }: any) => {
      try {
        const result = await ctx.repo.updateFile(repoId, path, content, message, branch, sha);
        return {
          content: [{
            type: "text",
            text: `File '${path}' updated successfully\n\n` +
              `**Commit SHA:** \`${result.commit.sha}\`  \n` +
              `**Branch:** \`${branch}\`  \n` +
              `**Message:** ${message}`
          }]
        };
      } catch (error: any) {
        console.error("Error updating file:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to update file: ${error.message}\n\nNote: File updates require GHE_ENABLE_WRITE=true`
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "ghe-create-file",
    "Create a new file (requires GHE_ENABLE_CREATE=true)",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      path: z.string().describe("File path"),
      content: z.string().describe("File content"),
      message: z.string().describe("Commit message"),
      branch: z.string().describe("Branch name"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ repoId, path, content, message, branch }: any) => {
      try {
        const result = await ctx.repo.createFile(repoId, path, content, message, branch);
        return {
          content: [{
            type: "text",
            text: `File '${path}' created successfully\n\n` +
              `**Commit SHA:** \`${result.commit.sha}\`  \n` +
              `**Branch:** \`${branch}\`  \n` +
              `**Message:** ${message}`
          }]
        };
      } catch (error: any) {
        console.error("Error creating file:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to create file: ${error.message}\n\nNote: File creation requires GHE_ENABLE_CREATE=true`
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "ghe-search-repos",
    "Search repositories by name or description across GitHub Enterprise",
    {
      query: z.string().describe("Search query"),
      owner: z.string().optional().describe("Filter by organization/owner"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ query, owner }: any) => {
      try {
        const results = await ctx.repo.searchRepositories(query, owner);
        return {
          content: [{
            type: "text",
            text: `# Repository Search Results\n\n` +
              `**Query:** ${query}  \n` +
              `**Total Results:** ${results.total_count}  \n` +
              `**Showing:** ${results.items.length}\n\n` +
              JSON.stringify(results.items, null, 2)
          }]
        };
      } catch (error: any) {
        console.error("Error searching repositories:", error);
        return { content: [{ type: "text", text: `Failed to search repositories: ${error.message}` }], isError: true };
      }
    }
  );
}
