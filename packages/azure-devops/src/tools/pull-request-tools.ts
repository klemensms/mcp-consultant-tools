/**
 * Pull Request Tools - 6 read-only + 7 conditional write tools
 */
import { z } from 'zod';
import { descWithExamples, PR_BRANCH_REF_EXAMPLES, PR_MERGE_STRATEGY_EXAMPLES, PR_VOTE_EXAMPLES } from '../tool-examples.js';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';

export function registerPullRequestTools(server: any, ctx: ServiceContext): void {
  // ========================================
  // READ-ONLY TOOLS (always available)
  // ========================================

  server.tool(
    "list-repositories",
    "List all Git repositories in an Azure DevOps project. Returns repository ID, name, default branch, and URLs.",
    { project: z.string().describe("The project name") },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project }: any) => {
      try {
        const result = await ctx.pullRequest.listRepositories(project);
        return { content: [{ type: "text", text: `Repositories in project '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing repositories:", error);
        return { content: [{ type: "text", text: `Failed to list repositories: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "list-pull-requests",
    "List pull requests in a Git repository. Filter by status (active, completed, abandoned, all). Returns PR ID, title, author, branches, and review status.",
    {
      project: z.string().describe("The project name"),
      repositoryId: z.string().describe("Repository ID (GUID) or name"),
      status: z.enum(["active", "completed", "abandoned", "all"]).optional().describe("Filter by PR status (default: active)"),
      top: zCoerceNumber().optional().describe("Maximum results (default: 25)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, repositoryId, status, top }: any) => {
      try {
        const result = await ctx.pullRequest.listPullRequests(project, repositoryId, status || 'active', top || 25);
        return { content: [{ type: "text", text: `Pull requests in '${repositoryId}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing pull requests:", error);
        return { content: [{ type: "text", text: `Failed to list pull requests: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "get-pull-request",
    "Get details of a specific pull request including title, description, author, reviewers with votes, and merge status.",
    {
      project: z.string().describe("The project name"),
      repositoryId: z.string().describe("Repository ID (GUID) or name"),
      pullRequestId: zCoerceNumber().describe("The pull request ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, repositoryId, pullRequestId }: any) => {
      try {
        const result = await ctx.pullRequest.getPullRequest(project, repositoryId, pullRequestId);
        return { content: [{ type: "text", text: `Pull request #${pullRequestId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting pull request:", error);
        return { content: [{ type: "text", text: `Failed to get pull request: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "get-pull-request-threads",
    "Get all comment threads and discussions on a pull request. Includes inline code comments with file paths and line numbers.",
    {
      project: z.string().describe("The project name"),
      repositoryId: z.string().describe("Repository ID (GUID) or name"),
      pullRequestId: zCoerceNumber().describe("The pull request ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, repositoryId, pullRequestId }: any) => {
      try {
        const result = await ctx.pullRequest.getPullRequestThreads(project, repositoryId, pullRequestId);
        return { content: [{ type: "text", text: `Threads for PR #${pullRequestId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting pull request threads:", error);
        return { content: [{ type: "text", text: `Failed to get pull request threads: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "get-pull-request-commits",
    "Get all commits included in a pull request. Shows commit ID, message, author, and date.",
    {
      project: z.string().describe("The project name"),
      repositoryId: z.string().describe("Repository ID (GUID) or name"),
      pullRequestId: zCoerceNumber().describe("The pull request ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, repositoryId, pullRequestId }: any) => {
      try {
        const result = await ctx.pullRequest.getPullRequestCommits(project, repositoryId, pullRequestId);
        return { content: [{ type: "text", text: `Commits for PR #${pullRequestId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting pull request commits:", error);
        return { content: [{ type: "text", text: `Failed to get pull request commits: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "get-pull-request-changes",
    "Get file changes (diffs) in a pull request. Shows added, modified, deleted, and renamed files with their paths.",
    {
      project: z.string().describe("The project name"),
      repositoryId: z.string().describe("Repository ID (GUID) or name"),
      pullRequestId: zCoerceNumber().describe("The pull request ID"),
      iterationId: zCoerceNumber().optional().describe("Iteration ID (default: latest)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, repositoryId, pullRequestId, iterationId }: any) => {
      try {
        const result = await ctx.pullRequest.getPullRequestChanges(project, repositoryId, pullRequestId, iterationId);
        return { content: [{ type: "text", text: `Changes for PR #${pullRequestId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting pull request changes:", error);
        return { content: [{ type: "text", text: `Failed to get pull request changes: ${error.message}` }] };
      }
    }
  );

  // ========================================
  // WRITE TOOLS (conditional on AZUREDEVOPS_ENABLE_PR_WRITE)
  // ========================================

  const enablePullRequestWrite = process.env.AZUREDEVOPS_ENABLE_PR_WRITE === "true";

  if (enablePullRequestWrite) {
    server.tool(
      "add-pull-request-thread",
      "Add a comment or code review feedback to a pull request. Supports both general comments and inline comments on specific files/lines. (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)",
      {
        project: z.string().describe("The project name"),
        repositoryId: z.string().describe("Repository ID (GUID) or name"),
        pullRequestId: zCoerceNumber().describe("The pull request ID"),
        content: z.string().describe("Comment content (markdown supported)"),
        filePath: z.string().optional().describe("File path for inline comment (e.g., '/src/file.ts')"),
        lineNumber: zCoerceNumber().optional().describe("Line number for inline comment (right side of diff)"),
        status: z.enum(["active", "fixed", "wontFix", "closed", "byDesign", "pending"]).optional().describe("Thread status (default: active)"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, repositoryId, pullRequestId, content, filePath, lineNumber, status }: any) => {
        try {
          const result = await ctx.pullRequest.addPullRequestThread(project, repositoryId, pullRequestId, content, filePath, lineNumber, status || 'active');
          return { content: [{ type: "text", text: `Added comment to PR #${pullRequestId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error adding pull request thread:", error);
          return { content: [{ type: "text", text: `Failed to add pull request thread: ${error.message}` }] };
        }
      }
    );

    server.tool(
      "create-pull-request",
      "Create a new pull request in a Git repository. (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)",
      {
        project: z.string().describe("The project name"),
        repositoryId: z.string().describe("Repository ID (GUID) or name"),
        sourceRefName: z.string().describe(descWithExamples("Source branch full ref name", PR_BRANCH_REF_EXAMPLES)),
        targetRefName: z.string().describe(descWithExamples("Target branch full ref name", PR_BRANCH_REF_EXAMPLES)),
        title: z.string().describe("Pull request title"),
        description: z.string().optional().describe("Pull request description (markdown supported)"),
        reviewerIds: z.array(z.string()).optional().describe("Reviewer GUIDs or unique names"),
        isDraft: z.boolean().optional().describe("Create as draft PR (default: false)"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, repositoryId, sourceRefName, targetRefName, title, description, reviewerIds, isDraft }: any) => {
        try {
          const result = await ctx.pullRequest.createPullRequest(project, repositoryId, sourceRefName, targetRefName, title, description, reviewerIds, isDraft);
          return { content: [{ type: "text", text: `Created PR #${result.pullRequestId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error creating pull request:", error);
          return { content: [{ type: "text", text: `Failed to create pull request: ${error.message}` }] };
        }
      }
    );

    server.tool(
      "update-pull-request",
      "Update a pull request's title, description, status, or draft state. (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)",
      {
        project: z.string().describe("The project name"),
        repositoryId: z.string().describe("Repository ID (GUID) or name"),
        pullRequestId: zCoerceNumber().describe("The pull request ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        status: z.enum(["abandoned", "active"]).optional().describe("Set PR status (abandoned or active)"),
        isDraft: z.boolean().optional().describe("Set draft state"),
      },
      // Updates title/description/status (incl. abandon) — reversible, no data loss.
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, repositoryId, pullRequestId, title, description, status, isDraft }: any) => {
        try {
          const result = await ctx.pullRequest.updatePullRequest(project, repositoryId, pullRequestId, { title, description, status, isDraft });
          return { content: [{ type: "text", text: `Updated PR #${pullRequestId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error updating pull request:", error);
          return { content: [{ type: "text", text: `Failed to update pull request: ${error.message}` }] };
        }
      }
    );

    server.tool(
      "complete-pull-request",
      "Complete (merge) a pull request with configurable merge strategy. (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)",
      {
        project: z.string().describe("The project name"),
        repositoryId: z.string().describe("Repository ID (GUID) or name"),
        pullRequestId: zCoerceNumber().describe("The pull request ID"),
        mergeStrategy: z.enum(["squash", "noFastForward", "rebase", "rebaseMerge"]).optional().describe(descWithExamples("Merge strategy (default: squash)", PR_MERGE_STRATEGY_EXAMPLES)),
        deleteSourceBranch: z.boolean().optional().describe("Delete source branch after merge (default: true)"),
        transitionWorkItems: z.boolean().optional().describe("Transition linked work items (default: true)"),
        mergeCommitMessage: z.string().optional().describe("Custom merge commit message"),
      },
      // Merges the PR and (by default) deletes the source branch → destructive/irreversible.
      { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      async ({ project, repositoryId, pullRequestId, mergeStrategy, deleteSourceBranch, transitionWorkItems, mergeCommitMessage }: any) => {
        try {
          const result = await ctx.pullRequest.completePullRequest(
            project, repositoryId, pullRequestId,
            mergeStrategy || 'squash',
            deleteSourceBranch !== undefined ? deleteSourceBranch : true,
            transitionWorkItems !== undefined ? transitionWorkItems : true,
            mergeCommitMessage
          );
          return { content: [{ type: "text", text: `Completed PR #${pullRequestId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error completing pull request:", error);
          return { content: [{ type: "text", text: `Failed to complete pull request: ${error.message}` }] };
        }
      }
    );

    server.tool(
      "add-pr-reviewer",
      "Add or remove a reviewer from a pull request. (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)",
      {
        project: z.string().describe("The project name"),
        repositoryId: z.string().describe("Repository ID (GUID) or name"),
        pullRequestId: zCoerceNumber().describe("The pull request ID"),
        reviewerId: z.string().describe("Reviewer GUID or unique name"),
        isRequired: z.boolean().optional().describe("Whether the reviewer is required (default: false)"),
        remove: z.boolean().optional().describe("Set to true to remove the reviewer instead of adding"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, repositoryId, pullRequestId, reviewerId, isRequired, remove }: any) => {
        try {
          const result = await ctx.pullRequest.addOrRemovePrReviewer(project, repositoryId, pullRequestId, reviewerId, isRequired, remove);
          return { content: [{ type: "text", text: `${remove ? 'Removed' : 'Added'} reviewer on PR #${pullRequestId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error managing PR reviewer:", error);
          return { content: [{ type: "text", text: `Failed to manage PR reviewer: ${error.message}` }] };
        }
      }
    );

    server.tool(
      "vote-pull-request",
      "Submit a vote (approve, reject, etc.) on a pull request. Defaults to authenticated user. (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)",
      {
        project: z.string().describe("The project name"),
        repositoryId: z.string().describe("Repository ID (GUID) or name"),
        pullRequestId: zCoerceNumber().describe("The pull request ID"),
        vote: z.enum(["approve", "approveWithSuggestions", "noResponse", "waitForAuthor", "reject"]).describe(descWithExamples("Vote to submit", PR_VOTE_EXAMPLES)),
        reviewerId: z.string().optional().describe("Reviewer GUID (defaults to authenticated user)"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, repositoryId, pullRequestId, vote, reviewerId }: any) => {
        try {
          const result = await ctx.pullRequest.votePullRequest(project, repositoryId, pullRequestId, vote, reviewerId);
          return { content: [{ type: "text", text: `Voted '${vote}' on PR #${pullRequestId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error voting on pull request:", error);
          return { content: [{ type: "text", text: `Failed to vote on pull request: ${error.message}` }] };
        }
      }
    );

    server.tool(
      "reply-to-pr-thread",
      "Reply to a pull request comment thread and/or update thread status (e.g., resolve). (requires AZUREDEVOPS_ENABLE_PR_WRITE=true)",
      {
        project: z.string().describe("The project name"),
        repositoryId: z.string().describe("Repository ID (GUID) or name"),
        pullRequestId: zCoerceNumber().describe("The pull request ID"),
        threadId: zCoerceNumber().describe("The thread ID to reply to"),
        content: z.string().optional().describe("Reply text (markdown supported)"),
        status: z.enum(["active", "fixed", "wontFix", "closed", "byDesign", "pending"]).optional().describe("Update thread status (e.g., 'fixed' to resolve)"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, repositoryId, pullRequestId, threadId, content, status }: any) => {
        try {
          const result = await ctx.pullRequest.replyToPrThread(project, repositoryId, pullRequestId, threadId, content, status);
          return { content: [{ type: "text", text: `Reply to thread #${threadId} on PR #${pullRequestId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error replying to PR thread:", error);
          return { content: [{ type: "text", text: `Failed to reply to PR thread: ${error.message}` }] };
        }
      }
    );
  }

  return;
}

/** Returns the count of PR write tools registered (for logging) */
export function getPrWriteToolCount(): number {
  return process.env.AZUREDEVOPS_ENABLE_PR_WRITE === "true" ? 7 : 0;
}
