/**
 * Branch CLI Commands
 *
 * Maps to MCP tools: ghe-list-branches, ghe-get-default-branch,
 * ghe-compare-branches, ghe-get-branch-details, ghe-create-branch
 */
import type { Command } from "commander";
import type { ServiceContext } from "../../context-factory.js";
import { outputResult, handleCliError } from "../output.js";

export function registerBranchCommands(
  program: Command,
  ctx: ServiceContext
): void {
  // ghe-list-branches
  program
    .command("list-branches")
    .description("List all branches for a repository")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID")
    .option("--protected-only", "Show only protected branches")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const branches = await ctx.repo.listBranches(
          opts.repoId,
          opts.protectedOnly
        );
        if (opts.json) {
          outputResult(branches, { json: true });
        } else {
          console.log(`Branches for ${opts.repoId}: ${branches.length} total`);
          for (const b of branches) {
            const prot = b.protected ? " [protected]" : "";
            console.log(`  ${b.name}${prot}`);
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-get-default-branch
  program
    .command("get-default-branch")
    .description("Auto-detect the default branch for a repository")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID")
    .option("-u, --user-specified <branch>", "User-specified branch name")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.repo.getDefaultBranch(
          opts.repoId,
          opts.userSpecified
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`Default branch: ${result.branch}`);
          console.log(`Reason: ${result.reason}`);
          console.log(`Confidence: ${result.confidence}`);
          if (result.alternatives && result.alternatives.length > 0) {
            console.log(
              `Alternatives: ${result.alternatives.slice(0, 5).join(", ")}`
            );
          }
          if (result.message) {
            console.log(`Note: ${result.message}`);
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-compare-branches
  program
    .command("compare-branches")
    .description("Compare two branches and show differences")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID")
    .requiredOption("-b, --base <base>", "Base branch name")
    .requiredOption("-H, --head <head>", "Head branch name")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const comparison = await ctx.repo.compareBranches(
          opts.repoId,
          opts.base,
          opts.head
        );
        if (opts.json) {
          outputResult(comparison, { json: true });
        } else {
          console.log(`Branch Comparison: ${opts.base} <- ${opts.head}`);
          console.log(`Status: ${comparison.status}`);
          console.log(`Ahead by: ${comparison.ahead_by}`);
          console.log(`Behind by: ${comparison.behind_by}`);
          console.log(`Commits: ${comparison.commits?.length || 0}`);
          console.log(`Files changed: ${comparison.files?.length || 0}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-get-branch-details
  program
    .command("get-branch-details")
    .description("Get detailed information about a specific branch")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID")
    .requiredOption("-b, --branch <branch>", "Branch name")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const branchInfo = await ctx.repo.getBranchDetails(
          opts.repoId,
          opts.branch
        );
        if (opts.json) {
          outputResult(branchInfo, { json: true });
        } else {
          console.log(`Branch: ${opts.branch}`);
          console.log(`Protected: ${branchInfo.protected ? "Yes" : "No"}`);
          console.log(
            `Last commit: ${branchInfo.commit.sha.substring(0, 7)}`
          );
          console.log(
            `Message: ${branchInfo.commit.commit.message.split("\n")[0]}`
          );
          console.log(`Author: ${branchInfo.commit.commit.author.name}`);
          console.log(
            `Date: ${new Date(branchInfo.commit.commit.author.date).toLocaleString()}`
          );
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-create-branch
  program
    .command("create-branch")
    .description("Create a new branch (requires GHE_ENABLE_CREATE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID")
    .requiredOption("-n, --branch-name <name>", "New branch name")
    .option("-f, --from-branch <branch>", "Source branch (default: auto-detected)")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.repo.createBranch(
          opts.repoId,
          opts.branchName,
          opts.fromBranch
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`Branch '${opts.branchName}' created successfully`);
          outputResult(result);
        }
      } catch (error) {
        handleCliError(error);
      }
    });
}
