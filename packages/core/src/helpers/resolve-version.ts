import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Resolve the running package's version from its package.json.
 *
 * Walks up from the entry script (`process.argv[1]`) to the nearest
 * package.json and returns its `version`. This keeps `--version` (CLI) and the
 * MCP server's reported version in lockstep with package.json automatically —
 * the release version bump only touches package.json, so a hardcoded version
 * string would (and historically did) go stale across the suite.
 *
 * Falls back to the supplied `fallback` when no package.json can be resolved
 * (e.g. unusual launch contexts or test runners).
 */
export function resolvePackageVersion(fallback: string): string {
  try {
    const entry = process.argv[1];
    if (entry) {
      let dir = dirname(entry);
      for (let i = 0; i < 8; i++) {
        const pkgPath = join(dir, 'package.json');
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
          if (typeof pkg.version === 'string' && pkg.version) return pkg.version;
          break;
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
  } catch {
    // Fall through to the supplied fallback.
  }
  return fallback;
}
