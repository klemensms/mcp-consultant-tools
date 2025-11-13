#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { GitHubEnterpriseService } from "./GitHubEnterpriseService.js";
import type { GitHubEnterpriseConfig } from "./GitHubEnterpriseService.js";
import { z } from 'zod';
import * as gheFormatters from './utils/ghe-formatters.js';

export function registerGitHubEnterpriseTools(server: any, githubenterpriseService?: GitHubEnterpriseService) {
  let service: GitHubEnterpriseService | null = githubenterpriseService || null;

  function getGitHubEnterpriseService(): GitHubEnterpriseService {
    if (!service) {
      const missingConfig: string[] = [];
      let repos: any[] = [];

      if (process.env.GHE_REPOS) {
        try {
          repos = JSON.parse(process.env.GHE_REPOS);
        } catch (error) {
          throw new Error("Failed to parse GHE_REPOS JSON");
        }
      } else {
        missingConfig.push("GHE_REPOS");
      }

      if (!process.env.GHE_TOKEN) missingConfig.push("GHE_TOKEN");

      if (missingConfig.length > 0) {
        throw new Error(`Missing GitHub Enterprise configuration: ${missingConfig.join(", ")}`);
      }

      const config: GitHubEnterpriseConfig = {
        repos,
        baseUrl: process.env.GHE_BASE_URL || 'https://github.com',
        apiVersion: process.env.GHE_API_VERSION || '2022-11-28',
        authMethod: 'pat',
        pat: process.env.GHE_TOKEN!,
        enableWrite: process.env.GHE_ENABLE_WRITE === 'true',
        enableCreate: process.env.GHE_ENABLE_CREATE === 'true',
        enableCache: process.env.GHE_ENABLE_CACHE !== 'false',
        cacheTtl: parseInt(process.env.GHE_CACHE_TTL || '300'),
        maxFileSize: parseInt(process.env.GHE_MAX_FILE_SIZE || '1048576'),
        maxSearchResults: parseInt(process.env.GHE_MAX_SEARCH_RESULTS || '100'),
      };

      service = new GitHubEnterpriseService(config);
      console.error("GitHub Enterprise service initialized");
    }
    return service;
  }

  // ========================================
  // PROMPTS
  // ========================================

  server.prompt(
    "ghe-repo-overview",
    "Get a comprehensive repository overview with branch analysis and recent commits",
    {
      repoId: z.string().describe("Repository ID from configuration"),
    },
    async ({ repoId }: any) => {
      const service = getGitHubEnterpriseService();
  
      const repo = service.getRepoById(repoId);
      const [branches, defaultBranchInfo] = await Promise.all([
        service.listBranches(repoId),
        service.getDefaultBranch(repoId),
      ]);
  
      const recentCommits = await service.getCommits(repoId, defaultBranchInfo.branch, undefined, undefined, undefined, undefined, 10);
  
      const output = gheFormatters.formatRepositoryOverviewAsMarkdown(
        {
          owner: repo.owner,
          repo: repo.repo,
          url: `${service['config'].baseUrl}/${repo.owner}/${repo.repo}`,
          defaultBranch: defaultBranchInfo.branch,
          description: repo.description,
          active: repo.active,
        },
        branches,
        recentCommits
      );
  
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: output,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "ghe-code-search-report",
    "Search code across repositories and get formatted results with analysis",
    {
      query: z.string().describe("Search query"),
      repoId: z.string().optional().describe("Limit to specific repository ID"),
      extension: z.string().optional().describe("Filter by file extension (e.g., 'cs', 'js')"),
    },
    async ({ query, repoId, extension }: any) => {
      const service = getGitHubEnterpriseService();
      const results = await service.searchCode(query, repoId, undefined, extension);
  
      const output = gheFormatters.formatCodeSearchResultsAsMarkdown(results);
  
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: output,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "ghe-branch-comparison-report",
    "Compare branches and generate deployment-ready summary with checklist",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      base: z.string().describe("Base branch (e.g., 'main')"),
      head: z.string().describe("Head branch to compare (e.g., 'release/9.0')"),
    },
    async ({ repoId, base, head }: any) => {
      const service = getGitHubEnterpriseService();
      const repo = service.getRepoById(repoId);
  
      const comparison = await service.compareBranches(repoId, base, head);
      const insights = gheFormatters.analyzeBranchComparison(comparison);
      const checklist = gheFormatters.generateDeploymentChecklist(comparison);
  
      let output = `# Branch Comparison: ${base} ← ${head}\n\n`;
      output += `**Repository:** ${repo.owner}/${repo.repo}\n`;
      output += `**Comparing:** \`${base}\` (base) ← \`${head}\` (head)\n\n`;
  
      output += `## Summary\n\n`;
      output += insights.join('\n') + '\n\n';
  
      if (comparison.commits && comparison.commits.length > 0) {
        output += `## Commits to Deploy\n\n`;
        output += gheFormatters.formatCommitHistoryAsMarkdown(comparison.commits) + '\n\n';
      }
  
      if (comparison.files && comparison.files.length > 0) {
        output += `## Files Changed (${comparison.files.length})\n\n`;
        const header = '| File | Status | +/- | Changes |';
        const separator = '|------|--------|-----|---------|';
        const rows = comparison.files.slice(0, 20).map((f: any) => {
          const status = f.status === 'added' ? '🆕 Added' :
                         f.status === 'modified' ? '📝 Modified' :
                         f.status === 'removed' ? '🗑️ Removed' :
                         f.status === 'renamed' ? '📋 Renamed' : f.status;
          return `| \`${f.filename}\` | ${status} | +${f.additions}/-${f.deletions} | ${f.changes} |`;
        });
        output += [header, separator, ...rows].join('\n');
  
        if (comparison.files.length > 20) {
          output += `\n\n*Showing 20 of ${comparison.files.length} files*`;
        }
        output += '\n\n';
      }
  
      output += `## Deployment Checklist\n\n`;
      output += checklist.join('\n');
  
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: output,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "ghe-troubleshooting-guide",
    "Generate comprehensive bug troubleshooting report with source code analysis",
    {
      repoId: z.string().describe("Repository ID to investigate"),
      searchQuery: z.string().describe("Search query (e.g., plugin name, entity name, or code pattern)"),
      branch: z.string().optional().describe("Branch to search (default: auto-detected)"),
    },
    async ({ repoId, searchQuery, branch }: any) => {
      const service = getGitHubEnterpriseService();
      const repo = service.getRepoById(repoId);
  
      // Search for code
      const codeResults = await service.searchCode(searchQuery, repoId);
  
      // Search commits for references
      const commitResults = await service.searchCommits(repoId, searchQuery);
  
      let output = `# Bug Troubleshooting Report\n\n`;
      output += `**Repository:** ${repo.owner}/${repo.repo}\n`;
      output += `**Search Query:** \`${searchQuery}\`\n\n`;
  
      output += `## Source Code Analysis\n\n`;
  
      if (codeResults.total_count > 0) {
        output += `Found **${codeResults.total_count} code matches** across ${codeResults.items.length} files:\n\n`;
        output += gheFormatters.formatCodeSearchResultsAsMarkdown(codeResults) + '\n\n';
      } else {
        output += `*No code matches found for query: "${searchQuery}"*\n\n`;
      }
  
      output += `## Related Commits\n\n`;
  
      if (commitResults.length > 0) {
        output += `Found **${commitResults.length} commits** referencing "${searchQuery}":\n\n`;
        output += gheFormatters.formatCommitHistoryAsMarkdown(commitResults.slice(0, 10)) + '\n\n';
  
        if (commitResults.length > 10) {
          output += `*Showing 10 of ${commitResults.length} commits*\n\n`;
        }
      } else {
        output += `*No commits found referencing "${searchQuery}"*\n\n`;
      }
  
      output += `## Recommendations\n\n`;
      output += `1. **Review Code Matches**: Check the code search results above for relevant implementations\n`;
      output += `2. **Analyze Recent Changes**: Review commit history for recent modifications\n`;
      output += `3. **Check Branch**: Current search is on branch \`${branch || 'auto-detected'}\`\n`;
      output += `4. **Cross-Reference**: Use ADO work items or PowerPlatform plugin names to correlate issues\n`;
  
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: output,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "ghe-deployment-report",
    "Generate deployment-ready report with code changes, testing checklist, and rollback plan",
    {
      repoId: z.string().describe("Repository ID"),
      fromBranch: z.string().optional().describe("Source branch (default: main)"),
      toBranch: z.string().optional().describe("Target branch (default: auto-detected)"),
    },
    async ({ repoId, fromBranch = "main", toBranch }: any) => {
      const service = getGitHubEnterpriseService();
      const repo = service.getRepoById(repoId);
  
      // Auto-detect target branch if not specified
      const targetBranch = toBranch || (await service.getDefaultBranch(repoId)).branch;
  
      // Get branch comparison
      const comparison = await service.compareBranches(repoId, fromBranch, targetBranch);
      const insights = gheFormatters.analyzeBranchComparison(comparison);
      const checklist = gheFormatters.generateDeploymentChecklist(comparison);
  
      let output = `# Deployment Report: ${targetBranch} → ${fromBranch}\n\n`;
      output += `**Repository:** ${repo.owner}/${repo.repo}\n`;
      output += `**Source:** \`${targetBranch}\`\n`;
      output += `**Target:** \`${fromBranch}\` (Production)\n`;
      output += `**Date:** ${new Date().toISOString().split('T')[0]}\n\n`;
  
      output += `## Executive Summary\n\n`;
      output += insights.join('\n') + '\n\n';
  
      output += `## Changes by Component\n\n`;
  
      if (comparison.files && comparison.files.length > 0) {
        // Group files by directory/component
        const filesByDir: Record<string, any[]> = {};
        comparison.files.forEach((f: any) => {
          const dir = f.filename.split('/')[0] || 'root';
          if (!filesByDir[dir]) filesByDir[dir] = [];
          filesByDir[dir].push(f);
        });
  
        Object.entries(filesByDir).forEach(([dir, files]) => {
          output += `### ${dir}/ (${files.length} files)\n\n`;
          const rows = files.slice(0, 10).map((f: any) =>
            `- \`${f.filename}\` (+${f.additions}, -${f.deletions})`
          );
          output += rows.join('\n') + '\n\n';
  
          if (files.length > 10) {
            output += `*...and ${files.length - 10} more files*\n\n`;
          }
        });
      }
  
      output += `## Deployment Steps\n\n`;
      output += `### 1. Pre-Deployment Verification\n`;
      output += `\`\`\`bash\n# Review changes\ngit diff ${fromBranch}...${targetBranch}\n\n# Run tests\nnpm test  # or: dotnet test\n\`\`\`\n\n`;
  
      output += `### 2. Merge to Production\n`;
      output += `\`\`\`bash\ngit checkout ${fromBranch}\ngit merge ${targetBranch} --no-ff\ngit push origin ${fromBranch}\n\`\`\`\n\n`;
  
      output += `### 3. Post-Deployment Verification\n`;
      output += `- [ ] Smoke tests passing\n`;
      output += `- [ ] No errors in logs (first 15 minutes)\n`;
      output += `- [ ] Verify key functionality works\n\n`;
  
      output += `## Rollback Plan\n\n`;
      output += `If issues occur after deployment:\n\n`;
      output += `\`\`\`bash\n# Option 1: Revert merge commit\ngit revert -m 1 HEAD\ngit push origin ${fromBranch}\n\n`;
      output += `# Option 2: Reset to previous commit (if not pushed)\ngit reset --hard HEAD~1\n\`\`\`\n\n`;
  
      output += `## Testing Checklist\n\n`;
      output += checklist.join('\n');
  
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: output,
            },
          },
        ],
      };
    }
  );

  // ========================================
  // TOOLS
  // ========================================

  server.tool(
    "ghe-list-repos",
    "List all configured GitHub Enterprise repositories (active and inactive)",
    {},
    async () => {
      try {
        const service = getGitHubEnterpriseService();
        const repos = service.getAllRepos();
  
        const reposWithUrls = repos.map((r: any) => ({
          ...r,
          url: `${service['config'].baseUrl}/${r.owner}/${r.repo}`
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
          }]
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
    async ({ repoId, protectedOnly }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const branches = await service.listBranches(repoId, protectedOnly);
  
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
        return {
          content: [{
            type: "text",
            text: `Failed to list branches: ${error.message}`
          }]
        };
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
    async ({ repoId, userSpecified }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const result = await service.getDefaultBranch(repoId, userSpecified);
  
        let output = `# Default Branch for Repository: ${repoId}\n\n`;
        output += `**Selected Branch:** \`${result.branch}\`  \n`;
        output += `**Reason:** ${result.reason}  \n`;
        output += `**Confidence:** ${result.confidence}  \n\n`;
  
        if (result.alternatives && result.alternatives.length > 0) {
          output += `**Alternative Branches:**\n`;
          result.alternatives.slice(0, 5).forEach(alt => {
            output += `- \`${alt}\`\n`;
          });
          if (result.alternatives.length > 5) {
            output += `- ... and ${result.alternatives.length - 5} more\n`;
          }
        }
  
        if (result.message) {
          output += `\n**Note:** ${result.message}\n`;
        }
  
        return {
          content: [{
            type: "text",
            text: output
          }]
        };
      } catch (error: any) {
        console.error("Error getting default branch:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get default branch: ${error.message}`
          }]
        };
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
    async ({ repoId, path, branch }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const file = await service.getFile(repoId, path, branch);
  
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
          }]
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
    async ({ query, repoId, path, extension }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const results = await service.searchCode(query, repoId, path, extension);
  
        return {
          content: [{
            type: "text",
            text: gheFormatters.formatCodeSearchResultsAsMarkdown(results)
          }]
        };
      } catch (error: any) {
        console.error("Error searching code:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to search code: ${error.message}\n\n` +
              `Troubleshooting:\n` +
              `1. Simplify search query if too complex\n` +
              `2. Check rate limits if search fails\n` +
              `3. Verify repository access permissions`
          }]
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
    async ({ repoId, path, branch }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const result = await service.listFiles(repoId, path, branch);
  
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
        return {
          content: [{
            type: "text",
            text: `Failed to list files: ${error.message}`
          }]
        };
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
    async ({ pattern, repoId }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const cleared = service.clearCache(pattern, repoId);
  
        return {
          content: [{
            type: "text",
            text: `✅ Cleared ${cleared} cache entries` +
              (pattern ? ` matching pattern '${pattern}'` : '') +
              (repoId ? ` for repository '${repoId}'` : '')
          }]
        };
      } catch (error: any) {
        console.error("Error clearing cache:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to clear cache: ${error.message}`
          }]
        };
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
    async ({ repoId, branch, since, until, author, path, limit }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const commits = await service.getCommits(repoId, branch, since, until, author, path, limit || 50);
  
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
        return {
          content: [{
            type: "text",
            text: `Failed to get commits: ${error.message}`
          }]
        };
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
    async ({ repoId, sha }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const commit = await service.getCommitDetails(repoId, sha);
  
        return {
          content: [{
            type: "text",
            text: gheFormatters.formatCommitDetailsAsMarkdown(commit)
          }]
        };
      } catch (error: any) {
        console.error("Error getting commit details:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get commit details: ${error.message}`
          }]
        };
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
    async ({ query, repoId, author, since, until }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const results = await service.searchCommits(query, repoId, author, since, until);
  
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
        return {
          content: [{
            type: "text",
            text: `Failed to search commits: ${error.message}`
          }]
        };
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
    async ({ repoId, sha, format }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const diff = await service.getCommitDiff(repoId, sha, format || 'diff');
  
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
        return {
          content: [{
            type: "text",
            text: `Failed to get commit diff: ${error.message}`
          }]
        };
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
    async ({ repoId, base, head }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const comparison = await service.compareBranches(repoId, base, head);
  
        const insights = gheFormatters.analyzeBranchComparison(comparison);
  
        return {
          content: [{
            type: "text",
            text: `# Branch Comparison: ${base} ← ${head}\n\n` +
              `**Repository:** ${repoId}  \n\n` +
              `## Summary\n\n` +
              insights.join('\n') + '\n\n' +
              `## Commits (${comparison.commits.length})\n\n` +
              gheFormatters.formatCommitHistoryAsMarkdown(comparison.commits.slice(0, 10))
          }]
        };
      } catch (error: any) {
        console.error("Error comparing branches:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to compare branches: ${error.message}`
          }]
        };
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
    async ({ repoId, branch }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const branchInfo = await service.getBranchDetails(repoId, branch);
  
        return {
          content: [{
            type: "text",
            text: `# Branch Details: ${branch}\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**Protected:** ${branchInfo.protected ? '🔒 Yes' : 'No'}  \n` +
              `**Last Commit:** \`${branchInfo.commit.sha.substring(0, 7)}\`  \n` +
              `**Commit Message:** ${branchInfo.commit.commit.message.split('\n')[0]}  \n` +
              `**Author:** ${branchInfo.commit.commit.author.name}  \n` +
              `**Date:** ${new Date(branchInfo.commit.commit.author.date).toLocaleString()}  \n\n` +
              JSON.stringify(branchInfo, null, 2)
          }]
        };
      } catch (error: any) {
        console.error("Error getting branch details:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get branch details: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "ghe-list-pull-requests",
    "List pull requests for a GitHub Enterprise repository",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      state: z.enum(['open', 'closed', 'all']).optional().describe("PR state (default: 'open')"),
      base: z.string().optional().describe("Filter by base branch"),
      head: z.string().optional().describe("Filter by head branch"),
      sort: z.enum(['created', 'updated', 'popularity']).optional().describe("Sort order (default: 'created')"),
      limit: z.number().optional().describe("Max results (default: 30)"),
    },
    async ({ repoId, state, base, head, sort, limit }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const prs = await service.listPullRequests(repoId, state || 'open', base, head, sort || 'created', limit || 30);
  
        return {
          content: [{
            type: "text",
            text: `# Pull Requests\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**State:** ${state || 'open'}  \n` +
              `**Count:** ${prs.length}\n\n` +
              gheFormatters.formatPullRequestsAsMarkdown(prs)
          }]
        };
      } catch (error: any) {
        console.error("Error listing pull requests:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to list pull requests: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "ghe-get-pull-request",
    "Get detailed information about a specific pull request",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      prNumber: z.number().describe("Pull request number"),
    },
    async ({ repoId, prNumber }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const pr = await service.getPullRequest(repoId, prNumber);
  
        return {
          content: [{
            type: "text",
            text: gheFormatters.formatPullRequestDetailsAsMarkdown(pr)
          }]
        };
      } catch (error: any) {
        console.error("Error getting pull request:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get pull request: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "ghe-get-pr-files",
    "Get files changed in a pull request",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      prNumber: z.number().describe("Pull request number"),
    },
    async ({ repoId, prNumber }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const files = await service.getPullRequestFiles(repoId, prNumber);
  
        const header = '| File | Status | +/- | Changes |';
        const separator = '|------|--------|-----|---------|';
  
        const rows = files.map(f => {
          const status = f.status === 'added' ? '🆕 Added' :
                         f.status === 'modified' ? '📝 Modified' :
                         f.status === 'removed' ? '🗑️ Removed' :
                         f.status === 'renamed' ? '📋 Renamed' : f.status;
  
          return `| \`${f.filename}\` | ${status} | +${f.additions}/-${f.deletions} | ${f.changes} |`;
        });
  
        return {
          content: [{
            type: "text",
            text: `# Pull Request #${prNumber} - Files Changed\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**Total Files:** ${files.length}\n\n` +
              [header, separator, ...rows].join('\n')
          }]
        };
      } catch (error: any) {
        console.error("Error getting PR files:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get PR files: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "ghe-get-directory-structure",
    "Get recursive directory tree structure",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      path: z.string().optional().describe("Directory path (default: root)"),
      branch: z.string().optional().describe("Branch name (default: auto-detected)"),
      depth: z.number().optional().describe("Recursion depth limit (default: 3)"),
    },
    async ({ repoId, path, branch, depth }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const result = await service.getDirectoryStructure(repoId, path, branch, depth || 3);
  
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
        return {
          content: [{
            type: "text",
            text: `Failed to get directory structure: ${error.message}`
          }]
        };
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
    async ({ repoId, path, branch, limit }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const commits = await service.getFileHistory(repoId, path, branch, limit || 50);
  
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
        return {
          content: [{
            type: "text",
            text: `Failed to get file history: ${error.message}`
          }]
        };
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
    async ({ repoId, branchName, fromBranch }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const result = await service.createBranch(repoId, branchName, fromBranch);
  
        return {
          content: [{
            type: "text",
            text: `✅ Branch '${branchName}' created successfully\n\n` +
              JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        console.error("Error creating branch:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to create branch: ${error.message}\n\n` +
              `Note: Branch creation requires GHE_ENABLE_CREATE=true`
          }]
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
    async ({ repoId, path, content, message, branch, sha }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const result = await service.updateFile(repoId, path, content, message, branch, sha);
  
        return {
          content: [{
            type: "text",
            text: `✅ File '${path}' updated successfully\n\n` +
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
            text: `Failed to update file: ${error.message}\n\n` +
              `Note: File updates require GHE_ENABLE_WRITE=true`
          }]
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
    async ({ repoId, path, content, message, branch }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const result = await service.createFile(repoId, path, content, message, branch);
  
        return {
          content: [{
            type: "text",
            text: `✅ File '${path}' created successfully\n\n` +
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
            text: `Failed to create file: ${error.message}\n\n` +
              `Note: File creation requires GHE_ENABLE_CREATE=true`
          }]
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
    async ({ query, owner }: any) => {
      try {
        const service = getGitHubEnterpriseService();
        const results = await service.searchRepositories(query, owner);
  
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
        return {
          content: [{
            type: "text",
            text: `Failed to search repositories: ${error.message}`
          }]
        };
      }
    }
  );

  console.error("github-enterprise tools registered: 22 tools, 5 prompts");

  console.error("GitHub Enterprise tools registered: 22 tools, 5 prompts");
}

// CLI entry point (standalone execution)
// Uses realpathSync to resolve symlinks created by npx
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "mcp-github-enterprise",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerGitHubEnterpriseTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start GitHub Enterprise MCP server:", error);
    process.exit(1);
  });
  console.error("GitHub Enterprise MCP server running");
}
