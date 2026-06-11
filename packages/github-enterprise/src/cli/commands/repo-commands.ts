/**
 * Repository CLI Commands
 *
 * Maps to MCP tools: ghe-list-repos, ghe-search-repos, ghe-clear-cache
 */
import type { Command } from "commander";
import type { ServiceContext } from "../../context-factory.js";
import { outputResult, handleCliError } from "../output.js";

export function registerRepoCommands(
  program: Command,
  ctx: ServiceContext
): void {
  // ghe-list-repos
  program
    .command("list-repos")
    .description("List all configured GitHub Enterprise repositories")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const repos = ctx.repo.base.getAllRepos();
        const reposWithUrls = repos.map((r: any) => ({
          ...r,
          url: `${(ctx.repo.base as any)["config"].baseUrl}/${r.owner}/${r.repo}`,
        }));
        if (opts.json) {
          outputResult(reposWithUrls, { json: true });
        } else {
          console.log(`Configured GitHub Enterprise Repositories`);
          console.log(`Total: ${repos.length}`);
          console.log(
            `Active: ${repos.filter((r: any) => r.active).length}\n`
          );
          for (const r of reposWithUrls) {
            console.log(
              `  ${r.active ? "[active]" : "[inactive]"} ${r.id} - ${r.owner}/${r.repo} (${r.url})`
            );
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-search-repos
  program
    .command("search-repos")
    .description("Search repositories by name or description")
    .requiredOption("-q, --query <query>", "Search query")
    .option("-o, --owner <owner>", "Filter by organization/owner")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const results = await ctx.repo.searchRepositories(
          opts.query,
          opts.owner
        );
        if (opts.json) {
          outputResult(results, { json: true });
        } else {
          console.log(
            `Repository Search: ${results.total_count} results for "${opts.query}"`
          );
          for (const item of results.items) {
            console.log(
              `  ${item.full_name} - ${item.description || "(no description)"}`
            );
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-clear-cache
  program
    .command("clear-cache")
    .description("Clear cached GitHub Enterprise API responses")
    .option("-p, --pattern <pattern>", "Clear only cache entries matching pattern")
    .option("-r, --repo-id <repoId>", "Clear cache for specific repository")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const cleared = ctx.repo.base.clearCache(opts.pattern, opts.repoId);
        if (opts.json) {
          outputResult({ cleared }, { json: true });
        } else {
          console.log(
            `Cleared ${cleared} cache entries` +
              (opts.pattern ? ` matching '${opts.pattern}'` : "") +
              (opts.repoId ? ` for repo '${opts.repoId}'` : "")
          );
        }
      } catch (error) {
        handleCliError(error);
      }
    });
}
