/**
 * CLI output helper for the todoist package.
 */
import { outputResult as coreOutputResult, type GlobalFlags } from '@mcp-consultant-tools/core';

const CACHE_DIR = '.mcp-todoist-cache';

export function outputResult(
  opts: { fileName: string; data: unknown; summary: string },
  flags: GlobalFlags
): void {
  coreOutputResult({ ...opts, cacheDir: CACHE_DIR }, flags);
}
