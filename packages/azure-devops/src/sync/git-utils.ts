/**
 * Git Utilities for Work Item Sync
 *
 * Handles git operations for auto-commit functionality.
 * All git operations are optional and fail gracefully.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execAsync = promisify(exec);

/**
 * Check if the current directory is a git repository
 */
export async function isGitRepo(cwd?: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --is-inside-work-tree', {
      cwd: cwd || process.cwd(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Git add a file
 */
async function gitAdd(filePath: string, cwd?: string): Promise<void> {
  await execAsync(`git add "${filePath}"`, {
    cwd: cwd || process.cwd(),
  });
}

/**
 * Git commit with a message
 */
async function gitCommit(message: string, cwd?: string): Promise<string> {
  const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
    cwd: cwd || process.cwd(),
  });
  return stdout;
}

/**
 * Result of a git commit attempt
 */
export interface GitCommitResult {
  committed: boolean;
  error?: string;
  message?: string;
}

/**
 * Auto-commit a work item file after pull
 * Returns result indicating success or failure (non-blocking)
 */
export async function autoCommitPulledFile(
  filePath: string,
  workItemId: number,
  revision: number,
  cwd?: string
): Promise<GitCommitResult> {
  try {
    // Check if we're in a git repo
    if (!await isGitRepo(cwd)) {
      return {
        committed: false,
        error: 'Not a git repository',
      };
    }

    // Get relative path for cleaner commit message
    const workingDir = cwd || process.cwd();
    const relativePath = path.relative(workingDir, filePath);

    // Add the file
    await gitAdd(filePath, workingDir);

    // Commit with descriptive message
    const commitMessage = `Pull user story #${workItemId} from ADO (rev ${revision})`;
    await gitCommit(commitMessage, workingDir);

    return {
      committed: true,
      message: commitMessage,
    };
  } catch (error: any) {
    // Git failures are non-blocking - log and continue
    console.error(`Git auto-commit failed for work item #${workItemId}: ${error.message}`);
    return {
      committed: false,
      error: error.message,
    };
  }
}

/**
 * Auto-commit multiple work item files in a single commit
 */
export async function autoCommitMultipleFiles(
  files: { filePath: string; workItemId: number }[],
  revision: string,
  cwd?: string
): Promise<GitCommitResult> {
  if (files.length === 0) {
    return { committed: false, error: 'No files to commit' };
  }

  try {
    // Check if we're in a git repo
    if (!await isGitRepo(cwd)) {
      return {
        committed: false,
        error: 'Not a git repository',
      };
    }

    const workingDir = cwd || process.cwd();

    // Add all files
    for (const file of files) {
      await gitAdd(file.filePath, workingDir);
    }

    // Build commit message
    const ids = files.map(f => `#${f.workItemId}`).join(', ');
    const commitMessage = files.length === 1
      ? `Pull user story ${ids} from ADO`
      : `Pull user stories ${ids} from ADO`;

    await gitCommit(commitMessage, workingDir);

    return {
      committed: true,
      message: commitMessage,
    };
  } catch (error: any) {
    console.error(`Git auto-commit failed: ${error.message}`);
    return {
      committed: false,
      error: error.message,
    };
  }
}
