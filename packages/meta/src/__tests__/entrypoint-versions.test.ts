/**
 * Entrypoint version guard
 *
 * Every MCP server and CLI in the suite must report its real version, read from
 * its own package.json, rather than a string literal.
 *
 * This exists because literals go stale silently and nothing fails when they
 * do. Before v35 beta.13, 19 CLIs reported versions as old as `27.0.0` and
 * *every* server reported `1.0.0` (meta said `15.0.0`) in the MCP initialize
 * handshake — which is the version an MCP client displays. Nobody noticed for
 * eight major releases, because a wrong version breaks nothing; it just
 * misinforms.
 *
 * `core`'s `resolvePackageVersion()` fallback does not save you here: it walks
 * up from `process.argv[1]`, which resolves correctly when a build is run
 * directly but NOT under `npx`, where the bin shim lives in a different tree.
 * Under npx the hardcoded fallback is exactly what the user sees — the way
 * these packages are actually consumed.
 *
 * Lives in `meta` because meta is the package that aggregates the whole suite.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PACKAGES_DIR = resolve(__dirname, '../../..');

/** Every `src/index.ts` and `src/cli.ts` in the monorepo, as [label, source]. */
function entrypoints(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const pkg of readdirSync(PACKAGES_DIR)) {
    for (const entry of ['index.ts', 'cli.ts']) {
      const p = join(PACKAGES_DIR, pkg, 'src', entry);
      if (existsSync(p)) out.push([`${pkg}/src/${entry}`, readFileSync(p, 'utf8')]);
    }
  }
  return out;
}

/**
 * The `version:` value passed to createMcpServer/createCliProgram, if that call
 * is present. Returns null when the file registers neither.
 */
function declaredVersion(src: string): string | null {
  for (const fn of ['createMcpServer', 'createCliProgram']) {
    const call = src.indexOf(`${fn}(`);
    if (call === -1) continue;
    const re = /version:\s*([^,\n]+)/g;
    re.lastIndex = call;
    const m = re.exec(src);
    if (m && m.index - call < 600) return m[1].trim();
  }
  return null;
}

describe('entrypoint versions', () => {
  it('finds the suite entrypoints, so an empty sweep cannot pass vacuously', () => {
    expect(entrypoints().length).toBeGreaterThan(20);
  });

  it('never hardcodes a version literal in a server or CLI entrypoint', () => {
    const offenders = entrypoints()
      .map(([label, src]) => [label, declaredVersion(src)] as const)
      .filter(([, version]) => version !== null && /^['"]/.test(version))
      .map(([label, version]) => `${label}: ${version}`);

    expect(offenders).toEqual([]);
  });

  it('reads the version from the package\'s own package.json', () => {
    const wrong = entrypoints()
      .map(([label, src]) => [label, declaredVersion(src), src] as const)
      .filter(([, version]) => version !== null)
      .filter(([, , src]) => !src.includes("require('../package.json')"))
      .map(([label]) => label);

    expect(wrong).toEqual([]);
  });
});
