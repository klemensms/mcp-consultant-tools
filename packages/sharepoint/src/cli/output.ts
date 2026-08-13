/**
 * CLI Output Helper
 *
 * Saves full JSON responses to `.context/.mcp-spo-cache/` and prints
 * a concise summary to stdout.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CACHE_DIR = '.mcp-spo-cache';

export interface OutputOptions {
  /** Base filename (without extension) for the cached JSON file */
  fileName: string;
  /** Full data object to persist */
  data: unknown;
  /** Human-readable summary printed to stdout */
  summary: string;
  /**
   * Whether to write the response cache under `.context/` in the caller's
   * working directory. Reads default to true - the cached JSON is the point,
   * since an agent greps it instead of re-running the call. Writes pass false:
   * their payload is only an echo of the arguments, so the file has no value to
   * grep, and creating `.context/` wherever the command happened to be run is a
   * surprise (a cloud-synced folder, say).
   */
  persist?: boolean;
}

/**
 * Write full JSON to cache directory and print summary to stdout.
 */
export function outputResult({ fileName, data, summary, persist = true }: OutputOptions): void {
  if (!persist) {
    console.log(summary);
    return;
  }

  // Resolve cache under .context/ at repo root (always gitignored)
  const cacheBase = resolve(process.cwd(), '.context', CACHE_DIR);
  if (!existsSync(cacheBase)) {
    mkdirSync(cacheBase, { recursive: true });
  }

  const filePath = join(cacheBase, `${fileName}.json`);
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

  console.log(summary);
  console.log(`\nFull output: ${filePath}`);
}

/**
 * Print an error message to stderr and exit with code 1.
 */
export function handleCliError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
}
