/**
 * Commit CLI Commands
 *
 * Maps to MCP tools: ghe-get-commits, ghe-get-commit-details,
 * ghe-search-commits, ghe-get-commit-diff
 */
import type { Command } from "commander";
import type { ServiceContext } from "../../context-factory.js";
import { outputResult, handleCliError } from "../output.js";

export function registerCommitCommands(
  program: Command,
  ctx: ServiceContext
): void {
  const commit = program
    .command("commit")
    .description("Commit operations");

  // ghe-get-commits -> commit list
  commit
    .command("list")
    .description("Get commit history for a branch")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .option("-b, --branch <branch>", "Branch name (default: auto-detected)")
    .option("-p, --path <path>", "Filter by file path")
    .option("--since <since>", "ISO 8601 date (e.g. 2025-01-01T00:00:00Z)")
    .option("--until <until>", "ISO 8601 date")
    .option("--author <author>", "Filter by author")
    .option("-l, --limit <limit>", "Max commits (default: 50)", "50")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const commits = await ctx.repo.getCommits(
          opts.repoId,
          opts.branch,
          opts.since,
          opts.until,
          opts.author,
          opts.path,
          parseInt(opts.limit)
        );
        if (opts.json) {
          outputResult(commits, { json: true });
        } else {
          console.log(`Commit History for ${opts.repoId}: ${commits.length} commits`);
          for (const c of commits) {
            const sha = (c.sha || "").substring(0, 7);
            const msg = c.commit?.message?.split("\n")[0] || "";
            const author = c.commit?.author?.name || "";
            const date = c.commit?.author?.date
              ? new Date(c.commit.author.date).toLocaleDateString()
              : "";
            console.log(`  ${sha} ${msg} (${author}, ${date})`);
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-get-commit-details -> commit get
  commit
    .command("get")
    .description("Get detailed information about a specific commit")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-s, --sha <sha>", "Commit SHA")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const detail = await ctx.repo.getCommitDetails(opts.repoId, opts.sha);
        if (opts.json) {
          outputResult(detail, { json: true });
        } else {
          const msg = detail.commit?.message?.split("\n")[0] || "";
          const author = detail.commit?.author?.name || "";
          const date = detail.commit?.author?.date
            ? new Date(detail.commit.author.date).toLocaleString()
            : "";
          console.log(`Commit: ${detail.sha}`);
          console.log(`Message: ${msg}`);
          console.log(`Author: ${author}`);
          console.log(`Date: ${date}`);
          console.log(`Files changed: ${detail.files?.length || 0}`);
          console.log(`Additions: ${detail.stats?.additions || 0}`);
          console.log(`Deletions: ${detail.stats?.deletions || 0}`);
          if (detail.files && detail.files.length > 0) {
            console.log(`\nChanged files:`);
            for (const f of detail.files) {
              console.log(`  ${f.status} ${f.filename} (+${f.additions}/-${f.deletions})`);
            }
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-search-commits -> commit search
  commit
    .command("search")
    .description("Search commits by message or hash")
    .requiredOption("-q, --query <query>", "Search query (e.g. '#1234', 'fix bug')")
    .option("-r, --repo-id <repoId>", "Limit to specific repository")
    .option("--author <author>", "Filter by author")
    .option("--since <since>", "ISO 8601 date")
    .option("--until <until>", "ISO 8601 date")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const results = await ctx.repo.searchCommits(
          opts.query,
          opts.repoId,
          opts.author,
          opts.since,
          opts.until
        );
        if (opts.json) {
          outputResult(results, { json: true });
        } else {
          console.log(
            `Commit Search: ${results.total_count} results for "${opts.query}"`
          );
          for (const item of results.items || []) {
            const sha = (item.sha || "").substring(0, 7);
            const msg = item.commit?.message?.split("\n")[0] || "";
            const author = item.commit?.author?.name || "";
            console.log(`  ${sha} ${msg} (${author})`);
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-get-commit-diff -> commit diff
  commit
    .command("diff")
    .description("Get detailed diff for a commit in unified format")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID from configuration")
    .requiredOption("-s, --sha <sha>", "Commit SHA")
    .option("-f, --format <format>", "Format: 'diff' or 'patch' (default: diff)", "diff")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const diff = await ctx.repo.getCommitDiff(
          opts.repoId,
          opts.sha,
          opts.format as 'diff' | 'patch'
        );
        if (opts.json) {
          outputResult({ repoId: opts.repoId, sha: opts.sha, format: opts.format, diff }, { json: true });
        } else {
          console.log(`Commit Diff: ${opts.sha}`);
          console.log(`Format: ${opts.format}`);
          console.log(`---`);
          console.log(diff);
        }
      } catch (error) {
        handleCliError(error);
      }
    });
}
