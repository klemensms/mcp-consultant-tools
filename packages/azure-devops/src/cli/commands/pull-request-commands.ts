/**
 * Pull Request CLI Commands - 6 read-only + 7 write commands
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerPullRequestCommands(program: Command, ctx: ServiceContext): void {
  const pr = program.command('pr').description('Pull request operations');

  // --- Read-only commands ---

  pr
    .command('list-repos')
    .description('List all Git repositories in a project')
    .argument('<project>', 'Project name')
    .action(async (project: string) => {
      try {
        const result = await ctx.pullRequest.listRepositories(project);
        outputResult(
          { fileName: `repos-${project}`, data: result, summary: `Found ${Array.isArray(result) ? result.length : 0} repositories in '${project}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list repositories'); }
    });

  pr
    .command('list')
    .description('List pull requests in a repository')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .option('-s, --status <status>', 'Filter by status: active, completed, abandoned, all', 'active')
    .option('-t, --top <n>', 'Maximum results', '25')
    .action(async (project: string, repositoryId: string, opts: any) => {
      try {
        const result = await ctx.pullRequest.listPullRequests(project, repositoryId, opts.status, parseInt(opts.top));
        outputResult(
          { fileName: `prs-${repositoryId}`, data: result, summary: `Pull requests in '${repositoryId}' (${opts.status})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list pull requests'); }
    });

  pr
    .command('get')
    .description('Get pull request details')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .argument('<pullRequestId>', 'Pull request ID')
    .action(async (project: string, repositoryId: string, pullRequestId: string) => {
      try {
        const result = await ctx.pullRequest.getPullRequest(project, repositoryId, parseInt(pullRequestId));
        outputResult(
          { fileName: `pr-${pullRequestId}`, data: result, summary: `Pull request #${pullRequestId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get pull request'); }
    });

  pr
    .command('threads')
    .description('Get comment threads on a pull request')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .argument('<pullRequestId>', 'Pull request ID')
    .action(async (project: string, repositoryId: string, pullRequestId: string) => {
      try {
        const result = await ctx.pullRequest.getPullRequestThreads(project, repositoryId, parseInt(pullRequestId));
        outputResult(
          { fileName: `pr-${pullRequestId}-threads`, data: result, summary: `Threads for PR #${pullRequestId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get PR threads'); }
    });

  pr
    .command('commits')
    .description('Get commits in a pull request')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .argument('<pullRequestId>', 'Pull request ID')
    .action(async (project: string, repositoryId: string, pullRequestId: string) => {
      try {
        const result = await ctx.pullRequest.getPullRequestCommits(project, repositoryId, parseInt(pullRequestId));
        outputResult(
          { fileName: `pr-${pullRequestId}-commits`, data: result, summary: `Commits for PR #${pullRequestId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get PR commits'); }
    });

  pr
    .command('changes')
    .description('Get file changes in a pull request')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .argument('<pullRequestId>', 'Pull request ID')
    .option('-i, --iteration-id <n>', 'Iteration ID (default: latest)')
    .action(async (project: string, repositoryId: string, pullRequestId: string, opts: any) => {
      try {
        const iterationId = opts.iterationId ? parseInt(opts.iterationId) : undefined;
        const result = await ctx.pullRequest.getPullRequestChanges(project, repositoryId, parseInt(pullRequestId), iterationId);
        outputResult(
          { fileName: `pr-${pullRequestId}-changes`, data: result, summary: `Changes for PR #${pullRequestId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get PR changes'); }
    });

  // --- Write commands (require AZUREDEVOPS_ENABLE_PR_WRITE=true) ---

  pr
    .command('add-thread')
    .description('Add a comment thread to a PR (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .argument('<pullRequestId>', 'Pull request ID')
    .argument('<content>', 'Comment content (markdown)')
    .option('-f, --file-path <path>', 'File path for inline comment')
    .option('-l, --line-number <n>', 'Line number for inline comment')
    .option('-s, --status <status>', 'Thread status', 'active')
    .action(async (project: string, repositoryId: string, pullRequestId: string, content: string, opts: any) => {
      try {
        const lineNumber = opts.lineNumber ? parseInt(opts.lineNumber) : undefined;
        const result = await ctx.pullRequest.addPullRequestThread(project, repositoryId, parseInt(pullRequestId), content, opts.filePath, lineNumber, opts.status);
        outputResult(
          { fileName: `pr-${pullRequestId}-thread-added`, data: result, summary: `Added comment to PR #${pullRequestId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'add PR thread'); }
    });

  pr
    .command('create')
    .description('Create a new pull request (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .requiredOption('--source <ref>', 'Source branch ref (e.g., refs/heads/feature)')
    .requiredOption('--target <ref>', 'Target branch ref (e.g., refs/heads/main)')
    .requiredOption('--title <title>', 'PR title')
    .option('-d, --description <text>', 'PR description')
    .option('--reviewers <ids...>', 'Reviewer GUIDs')
    .option('--draft', 'Create as draft PR', false)
    .action(async (project: string, repositoryId: string, opts: any) => {
      try {
        const result = await ctx.pullRequest.createPullRequest(
          project, repositoryId, opts.source, opts.target, opts.title,
          opts.description, opts.reviewers, opts.draft
        );
        outputResult(
          { fileName: `pr-created`, data: result, summary: `Created PR #${(result as any)?.pullRequestId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create pull request'); }
    });

  pr
    .command('update')
    .description('Update a pull request (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .argument('<pullRequestId>', 'Pull request ID')
    .option('--title <title>', 'New title')
    .option('-d, --description <text>', 'New description')
    .option('-s, --status <status>', 'Set status: abandoned or active')
    .option('--draft <bool>', 'Set draft state')
    .action(async (project: string, repositoryId: string, pullRequestId: string, opts: any) => {
      try {
        const isDraft = opts.draft !== undefined ? opts.draft === 'true' : undefined;
        const result = await ctx.pullRequest.updatePullRequest(
          project, repositoryId, parseInt(pullRequestId),
          { title: opts.title, description: opts.description, status: opts.status, isDraft }
        );
        outputResult(
          { fileName: `pr-${pullRequestId}-updated`, data: result, summary: `Updated PR #${pullRequestId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update pull request'); }
    });

  pr
    .command('complete')
    .description('Complete (merge) a pull request (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .argument('<pullRequestId>', 'Pull request ID')
    .option('--strategy <strategy>', 'Merge strategy: squash, noFastForward, rebase, rebaseMerge', 'squash')
    .option('--no-delete-branch', 'Keep source branch after merge')
    .option('--no-transition-work-items', 'Do not transition linked work items')
    .option('--commit-message <msg>', 'Custom merge commit message')
    .action(async (project: string, repositoryId: string, pullRequestId: string, opts: any) => {
      try {
        const result = await ctx.pullRequest.completePullRequest(
          project, repositoryId, parseInt(pullRequestId),
          opts.strategy, opts.deleteBranch ?? true, opts.transitionWorkItems ?? true, opts.commitMessage
        );
        outputResult(
          { fileName: `pr-${pullRequestId}-completed`, data: result, summary: `Completed PR #${pullRequestId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'complete pull request'); }
    });

  pr
    .command('add-reviewer')
    .description('Add or remove a reviewer (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .argument('<pullRequestId>', 'Pull request ID')
    .argument('<reviewerId>', 'Reviewer GUID or unique name')
    .option('--required', 'Mark as required reviewer', false)
    .option('--remove', 'Remove reviewer instead of adding', false)
    .action(async (project: string, repositoryId: string, pullRequestId: string, reviewerId: string, opts: any) => {
      try {
        const result = await ctx.pullRequest.addOrRemovePrReviewer(
          project, repositoryId, parseInt(pullRequestId), reviewerId, opts.required, opts.remove
        );
        outputResult(
          { fileName: `pr-${pullRequestId}-reviewer`, data: result, summary: `${opts.remove ? 'Removed' : 'Added'} reviewer on PR #${pullRequestId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'manage PR reviewer'); }
    });

  pr
    .command('vote')
    .description('Submit a vote on a pull request (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .argument('<pullRequestId>', 'Pull request ID')
    .argument('<vote>', 'Vote: approve, approveWithSuggestions, noResponse, waitForAuthor, reject')
    .option('-r, --reviewer-id <id>', 'Reviewer GUID (defaults to authenticated user)')
    .action(async (project: string, repositoryId: string, pullRequestId: string, vote: string, opts: any) => {
      try {
        const result = await ctx.pullRequest.votePullRequest(
          project, repositoryId, parseInt(pullRequestId), vote as any, opts.reviewerId
        );
        outputResult(
          { fileName: `pr-${pullRequestId}-vote`, data: result, summary: `Voted '${vote}' on PR #${pullRequestId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'vote on PR'); }
    });

  pr
    .command('reply')
    .description('Reply to a PR thread (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<repositoryId>', 'Repository ID or name')
    .argument('<pullRequestId>', 'Pull request ID')
    .argument('<threadId>', 'Thread ID')
    .option('-c, --content <text>', 'Reply text (markdown)')
    .option('-s, --status <status>', 'Update thread status: active, fixed, wontFix, closed, byDesign, pending')
    .action(async (project: string, repositoryId: string, pullRequestId: string, threadId: string, opts: any) => {
      try {
        const result = await ctx.pullRequest.replyToPrThread(
          project, repositoryId, parseInt(pullRequestId), parseInt(threadId), opts.content, opts.status
        );
        outputResult(
          { fileName: `pr-${pullRequestId}-reply-${threadId}`, data: result, summary: `Replied to thread #${threadId} on PR #${pullRequestId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'reply to PR thread'); }
    });
}
