import { z } from 'zod';
import * as gheFormatters from '../utils/ghe-formatters.js';
import type { ServiceContext } from '../types.js';

/**
 * Register GitHub Enterprise prompts.
 */
export function registerGhePrompts(server: any, ctx: ServiceContext): void {
  server.prompt(
    "ghe-repo-overview",
    "Get a comprehensive repository overview with branch analysis and recent commits",
    {
      repoId: z.string().describe("Repository ID from configuration"),
    },
    async ({ repoId }: any) => {
      const repo = ctx.repo.base.getRepoById(repoId);
      const [branches, defaultBranchInfo] = await Promise.all([
        ctx.repo.listBranches(repoId),
        ctx.repo.getDefaultBranch(repoId),
      ]);
      const recentCommits = await ctx.repo.getCommits(repoId, defaultBranchInfo.branch, undefined, undefined, undefined, undefined, 10);

      const output = gheFormatters.formatRepositoryOverviewAsMarkdown(
        {
          owner: repo.owner, repo: repo.repo,
          url: `${ctx.repo.base.config.baseUrl}/${repo.owner}/${repo.repo}`,
          defaultBranch: defaultBranchInfo.branch,
          description: repo.description, active: repo.active,
        },
        branches,
        recentCommits
      );

      return { messages: [{ role: "user", content: { type: "text", text: output } }] };
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
      const results = await ctx.repo.searchCode(query, repoId, undefined, extension);
      const output = gheFormatters.formatCodeSearchResultsAsMarkdown(results);
      return { messages: [{ role: "user", content: { type: "text", text: output } }] };
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
      const repo = ctx.repo.base.getRepoById(repoId);
      const comparison = await ctx.repo.compareBranches(repoId, base, head);
      const insights = gheFormatters.analyzeBranchComparison(comparison);
      const checklist = gheFormatters.generateDeploymentChecklist(comparison);

      let output = `# Branch Comparison: ${base} <- ${head}\n\n`;
      output += `**Repository:** ${repo.owner}/${repo.repo}\n`;
      output += `**Comparing:** \`${base}\` (base) <- \`${head}\` (head)\n\n`;
      output += `## Summary\n\n${insights.join('\n')}\n\n`;

      if (comparison.commits && comparison.commits.length > 0) {
        output += `## Commits to Deploy\n\n${gheFormatters.formatCommitHistoryAsMarkdown(comparison.commits)}\n\n`;
      }

      if (comparison.files && comparison.files.length > 0) {
        output += `## Files Changed (${comparison.files.length})\n\n`;
        const header = '| File | Status | +/- | Changes |';
        const separator = '|------|--------|-----|---------|';
        const rows = comparison.files.slice(0, 20).map((f: any) => {
          const status = f.status === 'added' ? 'Added' :
                         f.status === 'modified' ? 'Modified' :
                         f.status === 'removed' ? 'Removed' :
                         f.status === 'renamed' ? 'Renamed' : f.status;
          return `| \`${f.filename}\` | ${status} | +${f.additions}/-${f.deletions} | ${f.changes} |`;
        });
        output += [header, separator, ...rows].join('\n');
        if (comparison.files.length > 20) output += `\n\n*Showing 20 of ${comparison.files.length} files*`;
        output += '\n\n';
      }

      output += `## Deployment Checklist\n\n${checklist.join('\n')}`;

      return { messages: [{ role: "user", content: { type: "text", text: output } }] };
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
      const repo = ctx.repo.base.getRepoById(repoId);
      const codeResults = await ctx.repo.searchCode(searchQuery, repoId);
      const commitResults = await ctx.repo.searchCommits(searchQuery, repoId);

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

      if (commitResults.total_count > 0) {
        output += `Found **${commitResults.total_count} commits** referencing "${searchQuery}":\n\n`;
        output += gheFormatters.formatCommitHistoryAsMarkdown(commitResults.items.slice(0, 10)) + '\n\n';
        if (commitResults.items.length > 10) output += `*Showing 10 of ${commitResults.items.length} commits*\n\n`;
      } else {
        output += `*No commits found referencing "${searchQuery}"*\n\n`;
      }

      output += `## Recommendations\n\n`;
      output += `1. **Review Code Matches**: Check the code search results above for relevant implementations\n`;
      output += `2. **Analyze Recent Changes**: Review commit history for recent modifications\n`;
      output += `3. **Check Branch**: Current search is on branch \`${branch || 'auto-detected'}\`\n`;
      output += `4. **Cross-Reference**: Use ADO work items or PowerPlatform plugin names to correlate issues\n`;

      return { messages: [{ role: "user", content: { type: "text", text: output } }] };
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
      const repo = ctx.repo.base.getRepoById(repoId);
      const targetBranch = toBranch || (await ctx.repo.getDefaultBranch(repoId)).branch;
      const comparison = await ctx.repo.compareBranches(repoId, fromBranch, targetBranch);
      const insights = gheFormatters.analyzeBranchComparison(comparison);
      const checklist = gheFormatters.generateDeploymentChecklist(comparison);

      let output = `# Deployment Report: ${targetBranch} -> ${fromBranch}\n\n`;
      output += `**Repository:** ${repo.owner}/${repo.repo}\n`;
      output += `**Source:** \`${targetBranch}\`\n`;
      output += `**Target:** \`${fromBranch}\` (Production)\n`;
      output += `**Date:** ${new Date().toISOString().split('T')[0]}\n\n`;
      output += `## Executive Summary\n\n${insights.join('\n')}\n\n`;
      output += `## Changes by Component\n\n`;

      if (comparison.files && comparison.files.length > 0) {
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
          if (files.length > 10) output += `*...and ${files.length - 10} more files*\n\n`;
        });
      }

      output += `## Deployment Steps\n\n`;
      output += `### 1. Pre-Deployment Verification\n`;
      output += `\`\`\`bash\n# Review changes\ngit diff ${fromBranch}...${targetBranch}\n\n# Run tests\nnpm test  # or: dotnet test\n\`\`\`\n\n`;
      output += `### 2. Merge to Production\n`;
      output += `\`\`\`bash\ngit checkout ${fromBranch}\ngit merge ${targetBranch} --no-ff\ngit push origin ${fromBranch}\n\`\`\`\n\n`;
      output += `### 3. Post-Deployment Verification\n`;
      output += `- [ ] Smoke tests passing\n- [ ] No errors in logs (first 15 minutes)\n- [ ] Verify key functionality works\n\n`;
      output += `## Rollback Plan\n\nIf issues occur after deployment:\n\n`;
      output += `\`\`\`bash\n# Option 1: Revert merge commit\ngit revert -m 1 HEAD\ngit push origin ${fromBranch}\n\n`;
      output += `# Option 2: Reset to previous commit (if not pushed)\ngit reset --hard HEAD~1\n\`\`\`\n\n`;
      output += `## Testing Checklist\n\n${checklist.join('\n')}`;

      return { messages: [{ role: "user", content: { type: "text", text: output } }] };
    }
  );
}
