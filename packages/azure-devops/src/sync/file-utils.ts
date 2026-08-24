/**
 * File System Utilities for Work Item Sync
 *
 * Handles file operations: reading, writing, path resolution, and folder scanning.
 */

import { FanOutRecorder, type FanOutInfo } from '@mcp-consultant-tools/core';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseWorkItemMarkdown, ParsedWorkItemFile } from './markdown-serializer.js';

// Default sync folder relative to cwd
const DEFAULT_SYNC_FOLDER = 'docs/user-stories';

/**
 * Sync configuration from environment
 */
export interface SyncConfig {
  folder: string;          // Resolved absolute path
  autoCommit: boolean;     // Whether to auto-commit pulled files
}

/**
 * Get sync configuration from environment variables
 */
export function getSyncConfig(folderOverride?: string): SyncConfig {
  const envFolder = process.env.AZUREDEVOPS_SYNC_FOLDER || DEFAULT_SYNC_FOLDER;
  const folder = folderOverride || envFolder;

  // Resolve to absolute path
  const resolvedFolder = path.isAbsolute(folder)
    ? folder
    : path.resolve(process.cwd(), folder);

  const autoCommit = process.env.AZUREDEVOPS_SYNC_AUTO_COMMIT === 'true';

  return {
    folder: resolvedFolder,
    autoCommit,
  };
}

/**
 * Ensure a folder exists, creating it if necessary
 */
export async function ensureFolderExists(folderPath: string): Promise<void> {
  try {
    await fs.mkdir(folderPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw new Error(`Failed to create folder '${folderPath}': ${error.message}`);
    }
  }
}

/**
 * Get the file path for a work item markdown file
 */
export function getWorkItemFilePath(folder: string, workItemId: number): string {
  return path.join(folder, `${workItemId}.md`);
}

/**
 * Get the file path for a work item comments file
 */
export function getCommentsFilePath(folder: string, workItemId: number): string {
  return path.join(folder, `${workItemId}-comments.md`);
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write content to a file (creates parent directories if needed)
 */
export async function writeWorkItemFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureFolderExists(dir);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read a work item file and parse it
 */
export async function readWorkItemFile(filePath: string): Promise<ParsedWorkItemFile> {
  const content = await fs.readFile(filePath, 'utf-8');
  return parseWorkItemMarkdown(content);
}

/**
 * Read raw content from a file
 */
export async function readFileContent(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

/**
 * List synced work item files in a folder
 * Returns list of parsed frontmatter from each file, plus what could not be read.
 *
 * A file that will not parse used to be skipped with a stderr warning, so the list - and
 * the `count` the sync tools print from it - was silently short. `fanOut` names each one,
 * because a folder with a corrupt file is not a folder with one fewer work item.
 */
export async function listSyncedWorkItems(folder: string): Promise<{
  workItems: {
    id: number;
    title: string;
    state: string;
    revision: number;
    hasComments: boolean;
    filePath: string;
  }[];
  fanOut: FanOutInfo;
}> {
  const config = getSyncConfig(folder);
  const reads = new FanOutRecorder();

  // Check if folder exists
  if (!await fileExists(config.folder)) {
    return { workItems: [], fanOut: reads.result() };
  }

  // List all .md files
  const files = await fs.readdir(config.folder);

  const workItems: {
    id: number;
    title: string;
    state: string;
    revision: number;
    hasComments: boolean;
    filePath: string;
  }[] = [];

  for (const file of files) {
    // Skip comments files and non-markdown files
    if (file.endsWith('-comments.md') || !file.endsWith('.md')) {
      continue;
    }

    // Check if filename is a valid work item ID
    const idMatch = file.match(/^(\d+)\.md$/);
    if (!idMatch) {
      continue;
    }

    const id = parseInt(idMatch[1], 10);
    const filePath = path.join(config.folder, file);

    const entry = await reads.run(filePath, 'parse work-item file', async () => {
      const parsed = await readWorkItemFile(filePath);
      const commentsPath = getCommentsFilePath(config.folder, id);
      const hasComments = await fileExists(commentsPath);

      return {
        id,
        title: parsed.frontmatter.title,
        state: parsed.frontmatter.state,
        revision: parsed.frontmatter.lastSyncedRevision,
        hasComments,
        filePath,
      };
    });

    if (entry !== null) workItems.push(entry);
  }

  // Sort by ID
  return {
    workItems: workItems.sort((a, b) => a.id - b.id),
    fanOut: reads.result(),
  };
}

/**
 * Validate a folder path for security (prevent path traversal)
 */
export function validateFolderPath(folderPath: string): void {
  const resolved = path.resolve(folderPath);
  const cwd = process.cwd();

  // Ensure the path doesn't escape the current working directory
  // (unless it's an absolute path intentionally set)
  if (!path.isAbsolute(folderPath) && !resolved.startsWith(cwd)) {
    throw new Error(`Invalid folder path: '${folderPath}' - path traversal detected`);
  }

  // Block obvious dangerous paths
  const dangerous = ['/etc', '/usr', '/bin', '/var', '/sys', '/proc'];
  for (const dir of dangerous) {
    if (resolved.startsWith(dir)) {
      throw new Error(`Invalid folder path: '${folderPath}' - cannot use system directories`);
    }
  }
}

// ===========================================================================
// NEW WORK ITEM FILE UTILITIES
// Functions for handling new_*.md files (work items not yet created in ADO)
// ===========================================================================

/**
 * Get the file path for a new work item file
 * Format: new_{parentId}_{index}.md (with parent) or new_{index}.md (standalone)
 */
export function getNewWorkItemFilePath(folder: string, parentId: number | undefined, index: number): string {
  if (parentId !== undefined) {
    return path.join(folder, `new_${parentId}_${index}.md`);
  }
  return path.join(folder, `new_${index}.md`);
}

/**
 * Find the next available index for a new work item file
 * When parentId is provided, scans for new_{parentId}_*.md files
 * When parentId is undefined, scans for new_*.md (standalone) files
 */
export async function findNextNewFileIndex(folder: string, parentId?: number): Promise<number> {
  const config = getSyncConfig(folder);

  // Check if folder exists
  if (!await fileExists(config.folder)) {
    return 1; // First file
  }

  // List all .md files
  const files = await fs.readdir(config.folder);

  // Match pattern based on whether we have a parent
  const pattern = parentId !== undefined
    ? new RegExp(`^new_${parentId}_(\\d+)\\.md$`)
    : /^new_(\d+)\.md$/;
  let maxIndex = 0;

  for (const file of files) {
    const match = file.match(pattern);
    if (match) {
      const index = parseInt(match[1], 10);
      if (index > maxIndex) {
        maxIndex = index;
      }
    }
  }

  return maxIndex + 1;
}

/**
 * Find all new work item files in a folder
 * Returns paths to all new_*.md files
 */
export async function findNewWorkItemFiles(folder: string): Promise<string[]> {
  const config = getSyncConfig(folder);

  // Check if folder exists
  if (!await fileExists(config.folder)) {
    return [];
  }

  // List all .md files
  const files = await fs.readdir(config.folder);

  // Find new_*.md files (excluding task files)
  // Two patterns: new_{parentId}_{seq}.md (with parent) and new_{seq}.md (standalone)
  const newFiles: string[] = [];
  const withParentPattern = /^new_\d+_\d+\.md$/;
  const standalonePattern = /^new_\d+\.md$/;

  for (const file of files) {
    if (withParentPattern.test(file) || standalonePattern.test(file)) {
      newFiles.push(path.join(config.folder, file));
    }
  }

  // Sort by filename for consistent processing order
  return newFiles.sort();
}

/**
 * Rename a file (used for renaming new_*.md to {id}.md after creation)
 */
export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  await fs.rename(oldPath, newPath);
}

/**
 * Extract parent ID from a new work item filename
 * e.g., "new_12345_1.md" -> 12345
 * e.g., "new_1.md" -> null (standalone, no parent)
 */
export function extractParentIdFromNewFilename(filename: string): number | null {
  const match = filename.match(/^new_(\d+)_\d+\.md$/);
  return match ? parseInt(match[1], 10) : null;
}
