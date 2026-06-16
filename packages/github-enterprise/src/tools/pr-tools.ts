import { z } from 'zod';
import * as gheFormatters from '../utils/ghe-formatters.js';
import {
  descWithExamples,
  REVIEW_EVENT_EXAMPLES,
  MERGE_METHOD_EXAMPLES,
  BRANCH_EXAMPLES,
  PR_NUMBER_EXAMPLES,
  FILE_PATH_EXAMPLES,
  REVIEW_BODY_EXAMPLES,
  INLINE_COMMENT_EXAMPLES,
  PR_TITLE_EXAMPLES,
  PR_DESCRIPTION_EXAMPLES,
  LABEL_EXAMPLES,
  REVIEWER_EXAMPLES,
  TEAM_REVIEWER_EXAMPLES,
} from '../tool-examples.js';
import type { ServiceContext } from '../types.js';

/**
 * Register pull request tools (read + conditional write).
 */
export function registerPrTools(server: any, ctx: ServiceContext): void {
  // ========================================
  // PR READ TOOLS (always available)
  // ========================================

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
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, state, base, head, sort, limit }: any) => {
      try {
        const prs = await ctx.pr.listPullRequests(repoId, state || 'open', base, head, sort || 'created', limit || 30);
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
        return { content: [{ type: "text", text: `Failed to list pull requests: ${error.message}` }], isError: true };
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
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, prNumber }: any) => {
      try {
        const pr = await ctx.pr.getPullRequest(repoId, prNumber);
        return { content: [{ type: "text", text: gheFormatters.formatPullRequestDetailsAsMarkdown(pr) }] };
      } catch (error: any) {
        console.error("Error getting pull request:", error);
        return { content: [{ type: "text", text: `Failed to get pull request: ${error.message}` }], isError: true };
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
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, prNumber }: any) => {
      try {
        const files = await ctx.pr.getPullRequestFiles(repoId, prNumber);
        const header = '| File | Status | +/- | Changes |';
        const separator = '|------|--------|-----|---------|';
        const rows = files.map(f => {
          const status = f.status === 'added' ? 'Added' :
                         f.status === 'modified' ? 'Modified' :
                         f.status === 'removed' ? 'Removed' :
                         f.status === 'renamed' ? 'Renamed' : f.status;
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
        return { content: [{ type: "text", text: `Failed to get PR files: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-list-pr-reviews",
    "List all reviews on a pull request",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, prNumber }: any) => {
      try {
        const reviews = await ctx.pr.listPrReviews(repoId, prNumber);
        return {
          content: [{
            type: "text",
            text: `# PR #${prNumber} Reviews\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**Count:** ${reviews.length}\n\n` +
              gheFormatters.formatPrReviewsAsMarkdown(reviews)
          }]
        };
      } catch (error: any) {
        console.error("Error listing PR reviews:", error);
        return { content: [{ type: "text", text: `Failed to list PR reviews: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-list-pr-comments",
    "List all comments on a pull request (general comments, not inline review comments)",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, prNumber }: any) => {
      try {
        const comments = await ctx.pr.listPrComments(repoId, prNumber);
        return {
          content: [{
            type: "text",
            text: `# PR #${prNumber} Comments\n\n` +
              `**Repository:** ${repoId}  \n` +
              `**Count:** ${comments.length}\n\n` +
              gheFormatters.formatPrCommentsAsMarkdown(comments)
          }]
        };
      } catch (error: any) {
        console.error("Error listing PR comments:", error);
        return { content: [{ type: "text", text: `Failed to list PR comments: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ghe-get-pr-diff",
    "Get the diff for a pull request in unified diff format",
    {
      repoId: z.string().describe("Repository ID from configuration"),
      prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ repoId, prNumber }: any) => {
      try {
        const diff = await ctx.pr.getPrDiff(repoId, prNumber);
        return {
          content: [{
            type: "text",
            text: `# PR #${prNumber} Diff\n\n` +
              `**Repository:** ${repoId}\n\n` +
              `\`\`\`diff\n${diff}\n\`\`\``
          }]
        };
      } catch (error: any) {
        console.error("Error getting PR diff:", error);
        return { content: [{ type: "text", text: `Failed to get PR diff: ${error.message}` }], isError: true };
      }
    }
  );

  // ========================================
  // PR WRITE TOOLS (require GHE_ENABLE_PR_WRITE=true)
  // ========================================

  const enablePrWrite = process.env.GHE_ENABLE_PR_WRITE === 'true';
  const enableCreate = process.env.GHE_ENABLE_CREATE === 'true';

  if (enablePrWrite) {
    server.tool(
      "ghe-submit-pr-review",
      "Submit a review on a pull request (approve, request changes, or comment). Requires GHE_ENABLE_PR_WRITE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
        event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']).describe(
          descWithExamples("Review action to take", REVIEW_EVENT_EXAMPLES)
        ),
        body: z.string().optional().describe(
          descWithExamples("Review comment (required for REQUEST_CHANGES)", REVIEW_BODY_EXAMPLES)
        ),
        commitId: z.string().optional().describe("Specific commit SHA to review (default: latest)"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ repoId, prNumber, event, body, commitId }: any) => {
        try {
          const result = await ctx.pr.submitPrReview(repoId, prNumber, { event, body, commitId });
          return { content: [{ type: "text", text: gheFormatters.formatReviewResultAsMarkdown(result) }] };
        } catch (error: any) {
          console.error("Error submitting PR review:", error);
          return { content: [{ type: "text", text: `Failed to submit PR review: ${error.message}` }], isError: true };
        }
      }
    );

    server.tool(
      "ghe-add-pr-comment",
      "Add a general comment to a pull request. Requires GHE_ENABLE_PR_WRITE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
        body: z.string().describe("Comment body (supports markdown)"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ repoId, prNumber, body }: any) => {
        try {
          const result = await ctx.pr.addPrComment(repoId, prNumber, body);
          return { content: [{ type: "text", text: gheFormatters.formatPrCommentResultAsMarkdown(result) }] };
        } catch (error: any) {
          console.error("Error adding PR comment:", error);
          return { content: [{ type: "text", text: `Failed to add PR comment: ${error.message}` }], isError: true };
        }
      }
    );

    server.tool(
      "ghe-add-review-comment",
      "Add an inline review comment on a specific line in a PR. Requires GHE_ENABLE_PR_WRITE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
        body: z.string().describe(descWithExamples("Comment body (supports markdown)", INLINE_COMMENT_EXAMPLES)),
        commitId: z.string().describe("The SHA of the commit to comment on"),
        path: z.string().describe(descWithExamples("File path relative to repo root", FILE_PATH_EXAMPLES)),
        line: z.number().optional().describe("Line number in the diff to comment on"),
        side: z.enum(['LEFT', 'RIGHT']).optional().describe("Side of the diff (LEFT=old, RIGHT=new)"),
        startLine: z.number().optional().describe("Start line for multi-line comment"),
        startSide: z.enum(['LEFT', 'RIGHT']).optional().describe("Start side for multi-line comment"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ repoId, prNumber, body, commitId, path, line, side, startLine, startSide }: any) => {
        try {
          const result = await ctx.pr.addReviewComment(repoId, prNumber, {
            body, commitId, path, line, side, startLine, startSide
          });
          return { content: [{ type: "text", text: gheFormatters.formatPrCommentResultAsMarkdown(result) }] };
        } catch (error: any) {
          console.error("Error adding review comment:", error);
          return { content: [{ type: "text", text: `Failed to add review comment: ${error.message}` }], isError: true };
        }
      }
    );

    server.tool(
      "ghe-merge-pull-request",
      "Merge a pull request. Requires GHE_ENABLE_PR_WRITE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
        mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional().describe(
          descWithExamples("How to merge the PR (default: merge)", MERGE_METHOD_EXAMPLES)
        ),
        commitTitle: z.string().optional().describe("Title for the merge commit (default: PR title)"),
        commitMessage: z.string().optional().describe("Message for the merge commit"),
        sha: z.string().optional().describe("HEAD SHA to ensure PR hasn't changed"),
      },
      // Merge = state change (no branch delete here), not data deletion.
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ repoId, prNumber, mergeMethod, commitTitle, commitMessage, sha }: any) => {
        try {
          const result = await ctx.pr.mergePullRequest(repoId, prNumber, {
            mergeMethod, commitTitle, commitMessage, sha
          });
          return { content: [{ type: "text", text: gheFormatters.formatMergeResultAsMarkdown(result) }] };
        } catch (error: any) {
          console.error("Error merging PR:", error);
          return { content: [{ type: "text", text: `Failed to merge PR: ${error.message}` }], isError: true };
        }
      }
    );

    server.tool(
      "ghe-reply-to-review-comment",
      "Reply to an existing review comment. Requires GHE_ENABLE_PR_WRITE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
        commentId: z.number().describe("ID of the comment to reply to"),
        body: z.string().describe("Reply body (supports markdown)"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ repoId, prNumber, commentId, body }: any) => {
        try {
          const result = await ctx.pr.replyToReviewComment(repoId, prNumber, commentId, body);
          return { content: [{ type: "text", text: gheFormatters.formatPrCommentResultAsMarkdown(result) }] };
        } catch (error: any) {
          console.error("Error replying to comment:", error);
          return { content: [{ type: "text", text: `Failed to reply to comment: ${error.message}` }], isError: true };
        }
      }
    );

    server.tool(
      "ghe-update-pull-request",
      "Update a pull request's title, description, state, or base branch. Requires GHE_ENABLE_PR_WRITE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
        title: z.string().optional().describe(descWithExamples("New PR title", PR_TITLE_EXAMPLES)),
        body: z.string().optional().describe("New PR description (supports markdown)"),
        state: z.enum(['open', 'closed']).optional().describe("Change PR state"),
        base: z.string().optional().describe(descWithExamples("Change target branch", BRANCH_EXAMPLES)),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ repoId, prNumber, title, body, state, base }: any) => {
        try {
          const result = await ctx.pr.updatePullRequest(repoId, prNumber, { title, body, state, base });
          return { content: [{ type: "text", text: gheFormatters.formatPullRequestDetailsAsMarkdown(result) }] };
        } catch (error: any) {
          console.error("Error updating PR:", error);
          return { content: [{ type: "text", text: `Failed to update PR: ${error.message}` }], isError: true };
        }
      }
    );

    server.tool(
      "ghe-request-pr-reviewers",
      "Request reviewers for a pull request. Requires GHE_ENABLE_PR_WRITE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
        reviewers: z.array(z.string()).optional().describe(
          descWithExamples("GitHub usernames to request review from", REVIEWER_EXAMPLES)
        ),
        teamReviewers: z.array(z.string()).optional().describe(
          descWithExamples("Team slugs to request review from", TEAM_REVIEWER_EXAMPLES)
        ),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ repoId, prNumber, reviewers, teamReviewers }: any) => {
        try {
          const result = await ctx.pr.requestPrReviewers(repoId, prNumber, reviewers, teamReviewers);
          return { content: [{ type: "text", text: gheFormatters.formatReviewerRequestAsMarkdown(result) }] };
        } catch (error: any) {
          console.error("Error requesting reviewers:", error);
          return { content: [{ type: "text", text: `Failed to request reviewers: ${error.message}` }], isError: true };
        }
      }
    );

    server.tool(
      "ghe-remove-pr-reviewers",
      "Remove requested reviewers from a pull request. Requires GHE_ENABLE_PR_WRITE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
        reviewers: z.array(z.string()).optional().describe("GitHub usernames to remove"),
        teamReviewers: z.array(z.string()).optional().describe("Team slugs to remove"),
      },
      // remove-* → destructive hint; detaches a reviewer request (reversible).
      { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      async ({ repoId, prNumber, reviewers, teamReviewers }: any) => {
        try {
          await ctx.pr.removePrReviewers(repoId, prNumber, reviewers, teamReviewers);
          return {
            content: [{
              type: "text",
              text: `Reviewers removed from PR #${prNumber}\n\n` +
                (reviewers?.length ? `**Removed users:** ${reviewers.join(', ')}\n` : '') +
                (teamReviewers?.length ? `**Removed teams:** ${teamReviewers.join(', ')}\n` : '')
            }]
          };
        } catch (error: any) {
          console.error("Error removing reviewers:", error);
          return { content: [{ type: "text", text: `Failed to remove reviewers: ${error.message}` }], isError: true };
        }
      }
    );

    server.tool(
      "ghe-add-pr-labels",
      "Add labels to a pull request. Requires GHE_ENABLE_PR_WRITE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
        labels: z.array(z.string()).describe(descWithExamples("Labels to add", LABEL_EXAMPLES)),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ repoId, prNumber, labels }: any) => {
        try {
          const result = await ctx.pr.addPrLabels(repoId, prNumber, labels);
          return { content: [{ type: "text", text: gheFormatters.formatLabelsAsMarkdown(result) }] };
        } catch (error: any) {
          console.error("Error adding labels:", error);
          return { content: [{ type: "text", text: `Failed to add labels: ${error.message}` }], isError: true };
        }
      }
    );

    server.tool(
      "ghe-remove-pr-label",
      "Remove a label from a pull request. Requires GHE_ENABLE_PR_WRITE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
        label: z.string().describe(descWithExamples("Label name to remove", LABEL_EXAMPLES)),
      },
      // remove-* → destructive hint; detaches a label (reversible).
      { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      async ({ repoId, prNumber, label }: any) => {
        try {
          await ctx.pr.removePrLabel(repoId, prNumber, label);
          return { content: [{ type: "text", text: `Label '${label}' removed from PR #${prNumber}` }] };
        } catch (error: any) {
          console.error("Error removing label:", error);
          return { content: [{ type: "text", text: `Failed to remove label: ${error.message}` }], isError: true };
        }
      }
    );

    server.tool(
      "ghe-close-pull-request",
      "Close a pull request without merging. Requires GHE_ENABLE_PR_WRITE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        prNumber: z.number().describe(descWithExamples("Pull request number", PR_NUMBER_EXAMPLES)),
      },
      // Close without merge = reversible state change, not data deletion.
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ repoId, prNumber }: any) => {
        try {
          const result = await ctx.pr.closePullRequest(repoId, prNumber);
          return {
            content: [{
              type: "text",
              text: `PR #${prNumber} closed\n\n` + gheFormatters.formatPullRequestDetailsAsMarkdown(result)
            }]
          };
        } catch (error: any) {
          console.error("Error closing PR:", error);
          return { content: [{ type: "text", text: `Failed to close PR: ${error.message}` }], isError: true };
        }
      }
    );
  }

  // Create PR tool requires GHE_ENABLE_CREATE flag
  if (enableCreate) {
    server.tool(
      "ghe-create-pull-request",
      "Create a new pull request. Requires GHE_ENABLE_CREATE=true",
      {
        repoId: z.string().describe("Repository ID from configuration"),
        title: z.string().describe(descWithExamples("PR title", PR_TITLE_EXAMPLES)),
        head: z.string().describe(descWithExamples("Source branch (contains your changes)", BRANCH_EXAMPLES)),
        base: z.string().describe(descWithExamples("Target branch (where to merge)", BRANCH_EXAMPLES)),
        body: z.string().optional().describe(descWithExamples("PR description (supports markdown)", PR_DESCRIPTION_EXAMPLES)),
        draft: z.boolean().optional().describe("Create as draft PR (default: false)"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ repoId, title, head, base, body, draft }: any) => {
        try {
          const result = await ctx.pr.createPullRequest(repoId, { title, head, base, body, draft });
          return { content: [{ type: "text", text: gheFormatters.formatPrCreationAsMarkdown(result) }] };
        } catch (error: any) {
          console.error("Error creating PR:", error);
          return {
            content: [{
              type: "text",
              text: `Failed to create PR: ${error.message}\n\nNote: PR creation requires GHE_ENABLE_CREATE=true`
            }],
            isError: true,
          };
        }
      }
    );
  }
}
