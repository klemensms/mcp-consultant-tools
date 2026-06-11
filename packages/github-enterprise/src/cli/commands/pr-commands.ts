/**
 * Pull Request CLI Commands
 *
 * Maps to MCP tools: ghe-list-pull-requests, ghe-get-pull-request,
 * ghe-get-pr-files, ghe-list-pr-reviews, ghe-list-pr-comments,
 * ghe-get-pr-diff, ghe-create-pull-request, ghe-update-pull-request,
 * ghe-close-pull-request, ghe-merge-pull-request, ghe-submit-pr-review,
 * ghe-add-pr-comment, ghe-add-review-comment, ghe-reply-to-review-comment,
 * ghe-request-pr-reviewers, ghe-remove-pr-reviewers,
 * ghe-add-pr-labels, ghe-remove-pr-label
 */
import type { Command } from "commander";
import type { ServiceContext } from "../../context-factory.js";
import { outputResult, handleCliError } from "../output.js";

export function registerPrCommands(
  program: Command,
  ctx: ServiceContext
): void {
  const pr = program
    .command("pr")
    .description("Pull request operations");

  // ghe-list-pull-requests -> pr list
  pr
    .command("list")
    .description("List pull requests for a repository")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .option("-s, --state <state>", "PR state: open, closed, all (default: open)", "open")
    .option("-b, --base <base>", "Filter by base branch")
    .option("-H, --head <head>", "Filter by head branch")
    .option("--sort <sort>", "Sort order: created, updated, popularity (default: created)", "created")
    .option("-l, --limit <limit>", "Max results (default: 30)", "30")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const prs = await ctx.pr.listPullRequests(
          opts.repoId,
          opts.state as 'open' | 'closed' | 'all',
          opts.base,
          opts.head,
          opts.sort as 'created' | 'updated' | 'popularity',
          parseInt(opts.limit)
        );
        if (opts.json) {
          outputResult(prs, { json: true });
        } else {
          console.log(`Pull Requests for ${opts.repoId} (${opts.state}): ${prs.length}`);
          for (const p of prs) {
            const state = p.state === "open" ? "[open]" : "[closed]";
            console.log(`  #${p.number} ${state} ${p.title} (${p.user?.login || ""})`);
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-get-pull-request -> pr get
  pr
    .command("get")
    .description("Get detailed information about a specific pull request")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const detail = await ctx.pr.getPullRequest(
          opts.repoId,
          parseInt(opts.prNumber)
        );
        if (opts.json) {
          outputResult(detail, { json: true });
        } else {
          console.log(`PR #${detail.number}: ${detail.title}`);
          console.log(`State: ${detail.state}`);
          console.log(`Author: ${detail.user?.login || ""}`);
          console.log(`Base: ${detail.base?.ref || ""} <- Head: ${detail.head?.ref || ""}`);
          console.log(`Created: ${detail.created_at}`);
          console.log(`Updated: ${detail.updated_at}`);
          if (detail.merged_at) console.log(`Merged: ${detail.merged_at}`);
          if (detail.body) {
            console.log(`\nDescription:\n${detail.body}`);
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-get-pr-files -> pr files
  pr
    .command("files")
    .description("Get files changed in a pull request")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const files = await ctx.pr.getPullRequestFiles(
          opts.repoId,
          parseInt(opts.prNumber)
        );
        if (opts.json) {
          outputResult(files, { json: true });
        } else {
          console.log(`PR #${opts.prNumber} - Files Changed: ${files.length}`);
          for (const f of files) {
            console.log(`  ${f.status} ${f.filename} (+${f.additions}/-${f.deletions})`);
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-list-pr-reviews -> pr reviews
  pr
    .command("reviews")
    .description("List all reviews on a pull request")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const reviews = await ctx.pr.listPrReviews(
          opts.repoId,
          parseInt(opts.prNumber)
        );
        if (opts.json) {
          outputResult(reviews, { json: true });
        } else {
          console.log(`PR #${opts.prNumber} Reviews: ${reviews.length}`);
          for (const r of reviews) {
            console.log(
              `  [${r.state}] ${r.user?.login || ""}: ${(r.body || "(no comment)").split("\n")[0]}`
            );
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-list-pr-comments -> pr comments
  pr
    .command("comments")
    .description("List all comments on a pull request")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const comments = await ctx.pr.listPrComments(
          opts.repoId,
          parseInt(opts.prNumber)
        );
        if (opts.json) {
          outputResult(comments, { json: true });
        } else {
          console.log(`PR #${opts.prNumber} Comments: ${comments.length}`);
          for (const c of comments) {
            const date = c.created_at
              ? new Date(c.created_at).toLocaleDateString()
              : "";
            console.log(
              `  [${date}] ${c.user?.login || ""}: ${(c.body || "").split("\n")[0]}`
            );
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-get-pr-diff -> pr diff
  pr
    .command("diff")
    .description("Get the diff for a pull request in unified diff format")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const diff = await ctx.pr.getPrDiff(
          opts.repoId,
          parseInt(opts.prNumber)
        );
        if (opts.json) {
          outputResult({ repoId: opts.repoId, prNumber: parseInt(opts.prNumber), diff }, { json: true });
        } else {
          console.log(`PR #${opts.prNumber} Diff`);
          console.log(`---`);
          console.log(diff);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-create-pull-request -> pr create
  pr
    .command("create")
    .description("Create a new pull request (requires GHE_ENABLE_CREATE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-t, --title <title>", "PR title")
    .requiredOption("-H, --head <head>", "Source branch (contains your changes)")
    .requiredOption("-b, --base <base>", "Target branch (where to merge)")
    .option("--body <body>", "PR description (supports markdown)")
    .option("--draft", "Create as draft PR")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.pr.createPullRequest(opts.repoId, {
          title: opts.title,
          head: opts.head,
          base: opts.base,
          body: opts.body,
          draft: opts.draft,
        });
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`PR #${result.number} created successfully`);
          console.log(`Title: ${result.title}`);
          console.log(`URL: ${result.html_url || ""}`);
          console.log(`Base: ${opts.base} <- Head: ${opts.head}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-update-pull-request -> pr update
  pr
    .command("update")
    .description("Update a pull request (requires GHE_ENABLE_PR_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .option("-t, --title <title>", "New PR title")
    .option("--body <body>", "New PR description")
    .option("-s, --state <state>", "Change PR state: open, closed")
    .option("-b, --base <base>", "Change target branch")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.pr.updatePullRequest(
          opts.repoId,
          parseInt(opts.prNumber),
          {
            title: opts.title,
            body: opts.body,
            state: opts.state as 'open' | 'closed' | undefined,
            base: opts.base,
          }
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`PR #${opts.prNumber} updated successfully`);
          console.log(`Title: ${result.title}`);
          console.log(`State: ${result.state}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-close-pull-request -> pr close
  pr
    .command("close")
    .description("Close a pull request without merging (requires GHE_ENABLE_PR_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.pr.closePullRequest(
          opts.repoId,
          parseInt(opts.prNumber)
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`PR #${opts.prNumber} closed`);
          console.log(`State: ${result.state}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-merge-pull-request -> pr merge
  pr
    .command("merge")
    .description("Merge a pull request (requires GHE_ENABLE_PR_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .option("-m, --merge-method <method>", "Merge method: merge, squash, rebase (default: merge)", "merge")
    .option("--commit-title <title>", "Title for the merge commit")
    .option("--commit-message <message>", "Message for the merge commit")
    .option("--sha <sha>", "HEAD SHA to ensure PR has not changed")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.pr.mergePullRequest(
          opts.repoId,
          parseInt(opts.prNumber),
          {
            mergeMethod: opts.mergeMethod as 'merge' | 'squash' | 'rebase',
            commitTitle: opts.commitTitle,
            commitMessage: opts.commitMessage,
            sha: opts.sha,
          }
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`PR #${opts.prNumber} merged successfully`);
          console.log(`Method: ${opts.mergeMethod}`);
          if (result.sha) console.log(`Merge commit: ${result.sha}`);
          if (result.message) console.log(`Message: ${result.message}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-submit-pr-review -> pr submit-review
  pr
    .command("submit-review")
    .description("Submit a review on a pull request (requires GHE_ENABLE_PR_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .requiredOption("-e, --event <event>", "Review action: APPROVE, REQUEST_CHANGES, COMMENT")
    .option("--body <body>", "Review comment (required for REQUEST_CHANGES)")
    .option("--commit-id <commitId>", "Specific commit SHA to review")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.pr.submitPrReview(
          opts.repoId,
          parseInt(opts.prNumber),
          {
            event: opts.event as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
            body: opts.body,
            commitId: opts.commitId,
          }
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`Review submitted on PR #${opts.prNumber}`);
          console.log(`Event: ${opts.event}`);
          console.log(`State: ${result.state || ""}`);
          if (result.body) console.log(`Body: ${result.body}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-add-pr-comment -> pr add-comment
  pr
    .command("add-comment")
    .description("Add a general comment to a pull request (requires GHE_ENABLE_PR_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .requiredOption("--body <body>", "Comment body (supports markdown)")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.pr.addPrComment(
          opts.repoId,
          parseInt(opts.prNumber),
          opts.body
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`Comment added to PR #${opts.prNumber}`);
          console.log(`Comment ID: ${result.id}`);
          if (result.html_url) console.log(`URL: ${result.html_url}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-add-review-comment -> pr add-review-comment
  pr
    .command("add-review-comment")
    .description("Add an inline review comment on a specific line (requires GHE_ENABLE_PR_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .requiredOption("--body <body>", "Comment body (supports markdown)")
    .requiredOption("-p, --path <path>", "File path relative to repo root")
    .requiredOption("--commit-id <commitId>", "The SHA of the commit to comment on")
    .option("--line <line>", "Line number in the diff to comment on")
    .option("--side <side>", "Side of the diff: LEFT (old), RIGHT (new)")
    .option("--start-line <startLine>", "Start line for multi-line comment")
    .option("--start-side <startSide>", "Start side for multi-line comment: LEFT, RIGHT")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.pr.addReviewComment(
          opts.repoId,
          parseInt(opts.prNumber),
          {
            body: opts.body,
            commitId: opts.commitId,
            path: opts.path,
            line: opts.line ? parseInt(opts.line) : undefined,
            side: opts.side as 'LEFT' | 'RIGHT' | undefined,
            startLine: opts.startLine ? parseInt(opts.startLine) : undefined,
            startSide: opts.startSide as 'LEFT' | 'RIGHT' | undefined,
          }
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`Review comment added to PR #${opts.prNumber}`);
          console.log(`File: ${opts.path}`);
          console.log(`Comment ID: ${result.id}`);
          if (result.html_url) console.log(`URL: ${result.html_url}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-reply-to-review-comment -> pr reply-comment
  pr
    .command("reply-comment")
    .description("Reply to an existing review comment (requires GHE_ENABLE_PR_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .requiredOption("-c, --comment-id <commentId>", "ID of the comment to reply to")
    .requiredOption("--body <body>", "Reply body (supports markdown)")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.pr.replyToReviewComment(
          opts.repoId,
          parseInt(opts.prNumber),
          parseInt(opts.commentId),
          opts.body
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`Reply added to comment #${opts.commentId} on PR #${opts.prNumber}`);
          console.log(`Comment ID: ${result.id}`);
          if (result.html_url) console.log(`URL: ${result.html_url}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-request-pr-reviewers -> pr request-reviewers
  pr
    .command("request-reviewers")
    .description("Request reviewers for a pull request (requires GHE_ENABLE_PR_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .option("--reviewers <reviewers>", "JSON array of GitHub usernames (e.g. '[\"user1\",\"user2\"]')")
    .option("--team-reviewers <teamReviewers>", "JSON array of team slugs (e.g. '[\"team-a\"]')")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const reviewers = opts.reviewers ? JSON.parse(opts.reviewers) : undefined;
        const teamReviewers = opts.teamReviewers ? JSON.parse(opts.teamReviewers) : undefined;
        const result = await ctx.pr.requestPrReviewers(
          opts.repoId,
          parseInt(opts.prNumber),
          reviewers,
          teamReviewers
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`Reviewers requested for PR #${opts.prNumber}`);
          if (reviewers?.length) console.log(`Users: ${reviewers.join(", ")}`);
          if (teamReviewers?.length) console.log(`Teams: ${teamReviewers.join(", ")}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-remove-pr-reviewers -> pr remove-reviewers
  pr
    .command("remove-reviewers")
    .description("Remove requested reviewers from a pull request (requires GHE_ENABLE_PR_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .option("--reviewers <reviewers>", "JSON array of GitHub usernames to remove")
    .option("--team-reviewers <teamReviewers>", "JSON array of team slugs to remove")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const reviewers = opts.reviewers ? JSON.parse(opts.reviewers) : undefined;
        const teamReviewers = opts.teamReviewers ? JSON.parse(opts.teamReviewers) : undefined;
        await ctx.pr.removePrReviewers(
          opts.repoId,
          parseInt(opts.prNumber),
          reviewers,
          teamReviewers
        );
        if (opts.json) {
          outputResult({ removed: true, reviewers, teamReviewers }, { json: true });
        } else {
          console.log(`Reviewers removed from PR #${opts.prNumber}`);
          if (reviewers?.length) console.log(`Removed users: ${reviewers.join(", ")}`);
          if (teamReviewers?.length) console.log(`Removed teams: ${teamReviewers.join(", ")}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-add-pr-labels -> pr add-labels
  pr
    .command("add-labels")
    .description("Add labels to a pull request (requires GHE_ENABLE_PR_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .requiredOption("--labels <labels>", "JSON array of labels to add (e.g. '[\"bug\",\"priority:high\"]')")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const labels: string[] = JSON.parse(opts.labels);
        const result = await ctx.pr.addPrLabels(
          opts.repoId,
          parseInt(opts.prNumber),
          labels
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`Labels added to PR #${opts.prNumber}`);
          console.log(`Labels: ${labels.join(", ")}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-remove-pr-label -> pr remove-label
  pr
    .command("remove-label")
    .description("Remove a label from a pull request (requires GHE_ENABLE_PR_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-n, --pr-number <prNumber>", "Pull request number")
    .requiredOption("--label <label>", "Label name to remove")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        await ctx.pr.removePrLabel(
          opts.repoId,
          parseInt(opts.prNumber),
          opts.label
        );
        if (opts.json) {
          outputResult({ removed: true, label: opts.label }, { json: true });
        } else {
          console.log(`Label '${opts.label}' removed from PR #${opts.prNumber}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });
}
