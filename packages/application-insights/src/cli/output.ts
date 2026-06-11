/**
 * CLI output helper for application-insights package.
 * Thin wrapper setting the package-specific cache directory.
 */

import { outputResult as coreOutputResult, type GlobalFlags } from '@mcp-consultant-tools/core';

const CACHE_DIR = '.mcp-appins-cache';

export function outputResult(
  opts: { fileName: string; data: unknown; summary: string },
  flags: GlobalFlags
): void {
  coreOutputResult({ ...opts, cacheDir: CACHE_DIR }, flags);
}
