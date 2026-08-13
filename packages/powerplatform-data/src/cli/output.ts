/**
 * CLI output helper for powerplatform-data package.
 * Thin wrapper setting the package-specific cache directory.
 */

import { outputResult as coreOutputResult, type GlobalFlags } from '@mcp-consultant-tools/core';

const CACHE_DIR = '.mcp-pp-data-cache';

export function outputResult(
  opts: {
    fileName: string;
    data: unknown;
    summary: string;
    /**
     * Whether to write the response cache under `.context/` in the caller's
     * working directory. Reads default to true - the cached JSON is the point,
     * since an agent greps it instead of re-running the call. Writes pass
     * false: their payload is only an echo of the arguments, so the file has
     * no value to grep, and creating `.context/` wherever the command happened
     * to be run is a surprise (a cloud-synced folder, say).
     */
    persist?: boolean;
  },
  flags: GlobalFlags
): void {
  const { persist = true, ...rest } = opts;

  coreOutputResult(
    { ...rest, cacheDir: CACHE_DIR },
    persist ? flags : { ...flags, cache: false }
  );
}
