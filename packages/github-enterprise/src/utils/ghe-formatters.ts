/**
 * GitHub Enterprise Formatters
 * Transform GitHub API responses into human-readable markdown
 */

/**
 * Format branch list as markdown table
 */
export function formatBranchListAsMarkdown(branches: any[]): string {
  if (!branches || branches.length === 0) {
    return '*No branches found*';
  }

  const header = '| Branch | Last Commit | Author | Date | Protected |';
  const separator = '|--------|-------------|--------|------|-----------|';

  const rows = branches.map(b => {
    const commitMsg = b.commit?.commit?.message?.split('\n')[0] || 'N/A';
    const author = b.commit?.commit?.author?.name || 'N/A';
    const date = b.commit?.commit?.author?.date
      ? new Date(b.commit.commit.author.date).toLocaleDateString()
      : 'N/A';
    const protected_icon = b.protected ? '🔒' : '';

    return `| ${b.name} | ${commitMsg.substring(0, 50)}${commitMsg.length > 50 ? '...' : ''} | ${author} | ${date} | ${protected_icon} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Format commit history as markdown
 */
export function formatCommitHistoryAsMarkdown(commits: any[]): string {
  if (!commits || commits.length === 0) {
    return '*No commits found*';
  }

  const sections = commits.map((c, index) => {
    const shortSha = c.sha.substring(0, 7);
    const message = c.commit.message.split('\n')[0];
    const author = c.commit.author.name;
    const date = new Date(c.commit.author.date).toLocaleDateString();

    return `### ${index + 1}. \`${shortSha}\` - ${message}\n` +
      `**Author:** ${author}  \n` +
      `**Date:** ${date}  \n` +
      `**Parents:** ${c.parents.map((p: any) => p.sha.substring(0, 7)).join(', ')}\n`;
  });

  return sections.join('\n');
}

/**
 * Format code search results as markdown with highlighting
 */
export function formatCodeSearchResultsAsMarkdown(results: any): string {
  if (!results || !results.items || results.items.length === 0) {
    return '*No code matches found*';
  }

  const sections = results.items.map((item: any, index: number) => {
    const repo = `${item.repository.owner.login}/${item.repository.name}`;
    const score = '⭐'.repeat(Math.min(5, Math.ceil(item.score / 5)));

    let matches = '';
    if (item.text_matches && item.text_matches.length > 0) {
      matches = item.text_matches.map((m: any) => {
        const fragment = m.fragment.substring(0, 200);
        return `\`\`\`\n${fragment}${fragment.length >= 200 ? '...' : ''}\n\`\`\``;
      }).join('\n\n');
    }

    return `### ${index + 1}. ${repo}/${item.path}\n` +
      `**Relevance:** ${score}  \n` +
      `**File:** \`${item.name}\`  \n` +
      `**URL:** ${item.html_url}\n\n` +
      (matches ? `**Matches:**\n${matches}\n` : '');
  });

  return `# Code Search Results\n\n` +
    `**Total Matches:** ${results.total_count}  \n` +
    `**Showing:** ${results.items.length} results\n\n` +
    sections.join('\n---\n\n');
}

/**
 * Format pull requests as markdown table
 */
export function formatPullRequestsAsMarkdown(prs: any[]): string {
  if (!prs || prs.length === 0) {
    return '*No pull requests found*';
  }

  const header = '| # | Title | State | Author | Created | Updated |';
  const separator = '|---|-------|-------|--------|---------|---------|';

  const rows = prs.map(pr => {
    const state = pr.state === 'open' ? '🟢 Open' : pr.merged_at ? '🟣 Merged' : '🔴 Closed';
    const title = pr.title.substring(0, 40) + (pr.title.length > 40 ? '...' : '');
    const author = pr.user.login;
    const created = new Date(pr.created_at).toLocaleDateString();
    const updated = new Date(pr.updated_at).toLocaleDateString();

    return `| #${pr.number} | ${title} | ${state} | ${author} | ${created} | ${updated} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Format file tree as markdown
 */
export function formatFileTreeAsMarkdown(tree: any[], prefix: string = ''): string {
  if (!tree || tree.length === 0) {
    return '*Empty directory*';
  }

  const lines: string[] = [];

  tree.forEach((item, index) => {
    const isLast = index === tree.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const icon = item.type === 'dir' ? '📁' : item.type === 'file' ? '📄' : '📦';

    lines.push(`${prefix}${connector}${icon} ${item.name}`);

    if (item.children) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      lines.push(formatFileTreeAsMarkdown(item.children, childPrefix));
    }
  });

  return lines.join('\n');
}

/**
 * Format directory contents as markdown table
 */
export function formatDirectoryContentsAsMarkdown(contents: any[]): string {
  if (!contents || contents.length === 0) {
    return '*Empty directory*';
  }

  const header = '| Type | Name | Size | SHA |';
  const separator = '|------|------|------|-----|';

  const rows = contents.map(item => {
    const type = item.type === 'dir' ? '📁 Directory' : '📄 File';
    const size = item.size ? `${(item.size / 1024).toFixed(2)} KB` : 'N/A';
    const sha = item.sha.substring(0, 7);

    return `| ${type} | ${item.name} | ${size} | \`${sha}\` |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Analyze branch comparison and extract insights
 */
export function analyzeBranchComparison(comparison: any): string[] {
  const insights: string[] = [];

  if (!comparison) {
    return ['No comparison data available'];
  }

  // Ahead/behind status
  insights.push(`- **${comparison.ahead_by} commits ahead**, **${comparison.behind_by} commits behind** base`);

  // File statistics
  if (comparison.files && comparison.files.length > 0) {
    const totalAdditions = comparison.files.reduce((sum: number, f: any) => sum + f.additions, 0);
    const totalDeletions = comparison.files.reduce((sum: number, f: any) => sum + f.deletions, 0);

    insights.push(`- **${comparison.files.length} files changed** (+${totalAdditions}, -${totalDeletions})`);

    // Group by file type
    const byExtension: Record<string, number> = {};
    comparison.files.forEach((f: any) => {
      const ext = f.filename.split('.').pop() || 'unknown';
      byExtension[ext] = (byExtension[ext] || 0) + 1;
    });

    const topExtensions = Object.entries(byExtension)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ext, count]) => `${ext} (${count})`)
      .join(', ');

    insights.push(`- **File types:** ${topExtensions}`);
  }

  // Commit analysis
  if (comparison.commits && comparison.commits.length > 0) {
    const authors = new Set(comparison.commits.map((c: any) => c.commit.author.name));
    insights.push(`- **Contributors:** ${authors.size} (${Array.from(authors).join(', ')})`);

    // Check for work item references
    const workItemRefs = comparison.commits
      .map((c: any) => c.commit.message.match(/#(\d+)|AB#(\d+)/g))
      .filter((m: any) => m)
      .flat();

    if (workItemRefs.length > 0) {
      const uniqueRefs = [...new Set(workItemRefs)];
      insights.push(`- **Work items referenced:** ${uniqueRefs.join(', ')}`);
    }
  }

  return insights;
}

/**
 * Generate deployment checklist from changes
 */
export function generateDeploymentChecklist(comparison: any): string[] {
  const checklist: string[] = [];

  if (!comparison || !comparison.files) {
    return ['- [ ] Verify changes before deployment'];
  }

  // Check for specific file patterns
  const hasPluginChanges = comparison.files.some((f: any) => f.filename.includes('Plugin'));
  const hasTestChanges = comparison.files.some((f: any) => f.filename.includes('Test'));
  const hasConfigChanges = comparison.files.some((f: any) =>
    f.filename.includes('config') || f.filename.includes('.json') || f.filename.includes('.xml')
  );
  const hasDbChanges = comparison.files.some((f: any) =>
    f.filename.includes('.sql') || f.filename.includes('migration')
  );

  checklist.push('### Pre-Deployment');
  checklist.push('- [ ] Code review approved');
  checklist.push('- [ ] All tests passing');

  if (hasPluginChanges) {
    checklist.push('- [ ] Build plugin assemblies');
    checklist.push('- [ ] Verify plugin registration');
  }

  if (hasConfigChanges) {
    checklist.push('- [ ] Review configuration changes');
    checklist.push('- [ ] Update environment variables');
  }

  if (hasDbChanges) {
    checklist.push('- [ ] Test database migrations');
    checklist.push('- [ ] Backup production database');
  }

  checklist.push('');
  checklist.push('### Deployment');

  if (hasPluginChanges) {
    checklist.push('- [ ] Upload plugin assemblies to PowerPlatform');
    checklist.push('- [ ] Publish customizations');
  }

  if (hasDbChanges) {
    checklist.push('- [ ] Run database migrations');
  }

  checklist.push('- [ ] Deploy code to production');
  checklist.push('- [ ] Verify deployment success');

  checklist.push('');
  checklist.push('### Post-Deployment');
  checklist.push('- [ ] Smoke tests in production');
  checklist.push('- [ ] Monitor error logs (first 1 hour)');

  if (hasPluginChanges) {
    checklist.push('- [ ] Check plugin trace logs');
  }

  checklist.push('- [ ] Update documentation');
  checklist.push('- [ ] Close related work items');

  return checklist;
}

/**
 * Format commit details with file changes
 */
export function formatCommitDetailsAsMarkdown(commit: any): string {
  if (!commit) {
    return '*No commit data*';
  }

  const shortSha = commit.sha.substring(0, 7);
  const message = commit.commit.message;
  const author = commit.commit.author.name;
  const email = commit.commit.author.email;
  const date = new Date(commit.commit.author.date).toLocaleString();

  let output = `# Commit \`${shortSha}\`\n\n`;
  output += `**Message:**\n\`\`\`\n${message}\n\`\`\`\n\n`;
  output += `**Author:** ${author} <${email}>  \n`;
  output += `**Date:** ${date}  \n`;
  output += `**Parents:** ${commit.parents.map((p: any) => p.sha.substring(0, 7)).join(', ')}\n\n`;

  if (commit.stats) {
    output += `**Stats:** +${commit.stats.additions} / -${commit.stats.deletions} (${commit.stats.total} changes)\n\n`;
  }

  if (commit.files && commit.files.length > 0) {
    output += `## Files Changed (${commit.files.length})\n\n`;

    const header = '| File | Status | +/- | Changes |';
    const separator = '|------|--------|-----|---------|';

    const rows = commit.files.map((f: any) => {
      const status = f.status === 'added' ? '🆕 Added' :
                     f.status === 'modified' ? '📝 Modified' :
                     f.status === 'removed' ? '🗑️ Removed' :
                     f.status === 'renamed' ? '📋 Renamed' : f.status;

      return `| \`${f.filename}\` | ${status} | +${f.additions}/-${f.deletions} | ${f.changes} |`;
    });

    output += [header, separator, ...rows].join('\n');
  }

  return output;
}

/**
 * Format pull request details
 */
export function formatPullRequestDetailsAsMarkdown(pr: any): string {
  if (!pr) {
    return '*No pull request data*';
  }

  const state = pr.state === 'open' ? '🟢 Open' : pr.merged_at ? '🟣 Merged' : '🔴 Closed';
  const mergeable = pr.mergeable === true ? '✅ Yes' :
                   pr.mergeable === false ? '❌ No (conflicts)' : '⏳ Checking...';

  let output = `# Pull Request #${pr.number}: ${pr.title}\n\n`;
  output += `**State:** ${state}  \n`;
  output += `**Author:** ${pr.user.login}  \n`;
  output += `**Created:** ${new Date(pr.created_at).toLocaleString()}  \n`;
  output += `**Updated:** ${new Date(pr.updated_at).toLocaleString()}  \n`;

  if (pr.merged_at) {
    output += `**Merged:** ${new Date(pr.merged_at).toLocaleString()}  \n`;
    output += `**Merged by:** ${pr.merged_by?.login || 'N/A'}  \n`;
  }

  output += `**Mergeable:** ${mergeable}  \n`;
  output += `**Base:** \`${pr.base.ref}\` ← **Head:** \`${pr.head.ref}\`  \n\n`;

  if (pr.body) {
    output += `## Description\n\n${pr.body}\n\n`;
  }

  output += `## Stats\n\n`;
  output += `- **Commits:** ${pr.commits}  \n`;
  output += `- **Files Changed:** ${pr.changed_files}  \n`;
  output += `- **Additions:** +${pr.additions}  \n`;
  output += `- **Deletions:** -${pr.deletions}  \n`;
  output += `- **Comments:** ${pr.comments}  \n`;
  output += `- **Review Comments:** ${pr.review_comments}  \n\n`;

  output += `**URL:** ${pr.html_url}\n`;

  return output;
}

/**
 * Format repository overview
 */
export function formatRepositoryOverviewAsMarkdown(
  repo: any,
  branches: any[],
  recentCommits: any[]
): string {
  let output = `# Repository Overview: ${repo.owner}/${repo.repo}\n\n`;

  output += `**URL:** ${repo.url}  \n`;
  if (repo.defaultBranch) {
    output += `**Default Branch:** \`${repo.defaultBranch}\`  \n`;
  }
  if (repo.description) {
    output += `**Description:** ${repo.description}  \n`;
  }
  output += `**Status:** ${repo.active ? '🟢 Active' : '🔴 Inactive'}\n\n`;

  if (branches && branches.length > 0) {
    output += `## Branches (${branches.length})\n\n`;
    output += formatBranchListAsMarkdown(branches.slice(0, 10));
    if (branches.length > 10) {
      output += `\n\n*Showing 10 of ${branches.length} branches*`;
    }
    output += '\n\n';
  }

  if (recentCommits && recentCommits.length > 0) {
    output += `## Recent Activity (Last ${recentCommits.length} commits)\n\n`;
    output += formatCommitHistoryAsMarkdown(recentCommits.slice(0, 5));
    output += '\n\n';
  }

  return output;
}

/**
 * Sanitize error messages (remove sensitive data)
 */
export function sanitizeErrorMessage(error: any): string {
  let message = typeof error === 'string' ? error : error.message || 'Unknown error';

  // Remove tokens
  message = message.replace(/ghp_[a-zA-Z0-9]{36}/g, 'ghp_***');
  message = message.replace(/ghs_[a-zA-Z0-9]{36}/g, 'ghs_***');

  // Remove URLs with tokens
  message = message.replace(/https:\/\/.*:.*@/g, 'https://***:***@');

  return message;
}
