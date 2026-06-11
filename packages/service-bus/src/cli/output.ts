/**
 * CLI output helper for service-bus package.
 * Thin wrapper setting the package-specific cache directory.
 */

import { outputResult as coreOutputResult, type GlobalFlags } from '@mcp-consultant-tools/core';

const CACHE_DIR = '.mcp-sb-cache';

export function outputResult(
  opts: { fileName: string; data: unknown; summary: string },
  flags: GlobalFlags
): void {
  coreOutputResult({ ...opts, cacheDir: CACHE_DIR }, flags);
}
