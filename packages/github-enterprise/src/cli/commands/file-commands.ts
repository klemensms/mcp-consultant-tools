/**
 * File CLI Commands
 *
 * Maps to MCP tools: ghe-get-file, ghe-list-files, ghe-get-dir-structure,
 * ghe-get-file-history, ghe-search-code, ghe-update-file, ghe-create-file
 */
import type { Command } from "commander";
import type { ServiceContext } from "../../context-factory.js";
import { outputResult, handleCliError } from "../output.js";

export function registerFileCommands(
  program: Command,
  ctx: ServiceContext
): void {
  // ghe-get-file
  program
    .command("get-file")
    .description("Get file content from a repository")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID")
    .requiredOption("-p, --path <path>", "File path")
    .option("-b, --branch <branch>", "Branch name (default: auto-detected)")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const file = await ctx.repo.getFile(
          opts.repoId,
          opts.path,
          opts.branch
        );
        if (opts.json) {
          outputResult(file, { json: true });
        } else {
          console.log(`File: ${opts.path}`);
          console.log(`Branch: ${file.branch}`);
          console.log(`Size: ${file.size} bytes`);
          console.log(`SHA: ${file.sha}`);
          console.log(`---`);
          console.log(file.decodedContent);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-list-files
  program
    .command("list-files")
    .description("List files in a directory")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID")
    .option("-p, --path <path>", "Directory path (default: root)")
    .option("-b, --branch <branch>", "Branch name (default: auto-detected)")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.repo.listFiles(
          opts.repoId,
          opts.path,
          opts.branch
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`Directory: ${opts.path || "/"}`);
          console.log(`Branch: ${result.branch}\n`);
          for (const item of result.contents) {
            const prefix = item.type === "dir" ? "[dir] " : "      ";
            console.log(`  ${prefix}${item.name}`);
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-get-dir-structure
  program
    .command("get-dir-structure")
    .description("Get recursive directory tree structure")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID")
    .option("-p, --path <path>", "Directory path (default: root)")
    .option("-b, --branch <branch>", "Branch name (default: auto-detected)")
    .option("-d, --depth <depth>", "Recursion depth limit (default: 3)", "3")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.repo.getDirectoryStructure(
          opts.repoId,
          opts.path,
          opts.branch,
          parseInt(opts.depth)
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`Directory Structure: ${opts.path || "/"}`);
          console.log(`Branch: ${result.branch}`);
          console.log(`Max Depth: ${opts.depth}\n`);
          printTree(result.tree, "");
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-get-file-history
  program
    .command("get-file-history")
    .description("Get commit history for a specific file")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID")
    .requiredOption("-p, --path <path>", "File path")
    .option("-b, --branch <branch>", "Branch name (default: auto-detected)")
    .option("-l, --limit <limit>", "Max commits (default: 50)", "50")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const commits = await ctx.repo.getFileHistory(
          opts.repoId,
          opts.path,
          opts.branch,
          parseInt(opts.limit)
        );
        if (opts.json) {
          outputResult(commits, { json: true });
        } else {
          console.log(`File History: ${opts.path}`);
          console.log(`Commits: ${commits.length}\n`);
          for (const c of commits) {
            const sha = (c.sha || "").substring(0, 7);
            const msg =
              c.commit?.message?.split("\n")[0] || c.message || "";
            const author = c.commit?.author?.name || c.author || "";
            console.log(`  ${sha} ${msg} (${author})`);
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-search-code
  program
    .command("search-code")
    .description("Search code across repositories")
    .requiredOption("-q, --query <query>", "Search query")
    .option("-r, --repo-id <repoId>", "Limit to specific repository")
    .option("-p, --path <path>", "Filter by file path pattern")
    .option("-e, --extension <ext>", "Filter by file extension (e.g. cs, js)")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const results = await ctx.repo.searchCode(
          opts.query,
          opts.repoId,
          opts.path,
          opts.extension
        );
        if (opts.json) {
          outputResult(results, { json: true });
        } else {
          console.log(
            `Code Search: ${results.total_count} results for "${opts.query}"`
          );
          for (const item of results.items || []) {
            console.log(
              `  ${item.repository?.full_name || ""}:${item.path} (score: ${item.score})`
            );
          }
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-update-file
  program
    .command("update-file")
    .description("Update file content (requires GHE_ENABLE_WRITE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID")
    .requiredOption("-p, --path <path>", "File path")
    .requiredOption("-c, --content <content>", "New file content")
    .requiredOption("-m, --message <message>", "Commit message")
    .requiredOption("-b, --branch <branch>", "Branch name")
    .requiredOption("-s, --sha <sha>", "Current file SHA (for conflict detection)")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.repo.updateFile(
          opts.repoId,
          opts.path,
          opts.content,
          opts.message,
          opts.branch,
          opts.sha
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`File '${opts.path}' updated successfully`);
          console.log(`Commit SHA: ${result.commit.sha}`);
          console.log(`Branch: ${opts.branch}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });

  // ghe-create-file
  program
    .command("create-file")
    .description("Create a new file (requires GHE_ENABLE_CREATE=true)")
    .requiredOption("-r, --repo-id <repoId>", "Repository ID")
    .requiredOption("-p, --path <path>", "File path")
    .requiredOption("-c, --content <content>", "File content")
    .requiredOption("-m, --message <message>", "Commit message")
    .requiredOption("-b, --branch <branch>", "Branch name")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const result = await ctx.repo.createFile(
          opts.repoId,
          opts.path,
          opts.content,
          opts.message,
          opts.branch
        );
        if (opts.json) {
          outputResult(result, { json: true });
        } else {
          console.log(`File '${opts.path}' created successfully`);
          console.log(`Commit SHA: ${result.commit.sha}`);
          console.log(`Branch: ${opts.branch}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });
}

/**
 * Print a tree structure recursively
 */
function printTree(tree: any[], indent: string): void {
  for (const node of tree) {
    if (node.type === "tree" || node.type === "dir") {
      console.log(`${indent}${node.path || node.name}/`);
      if (node.children) {
        printTree(node.children, indent + "  ");
      }
    } else {
      console.log(`${indent}${node.path || node.name}`);
    }
  }
}
