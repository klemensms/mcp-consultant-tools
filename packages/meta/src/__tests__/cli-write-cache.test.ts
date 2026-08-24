/**
 * CLI write-cache guard
 *
 * A CLI **read** command caches its full JSON to `.context/.mcp-{abbrev}-cache/`
 * so an agent can grep it instead of re-running the call. A **write** command
 * must pass `persist: false`: its payload is only an echo of the arguments, so
 * the file has nothing worth grepping, and creating a `.context/` directory
 * wherever the command happened to be run is a surprise - on a real machine one
 * appeared inside a cloud-synced folder and then synced.
 *
 * v35 beta.12 applied that convention across the suite by matching command
 * names against a verb-prefix regex, and the regex missed a batch:
 * `batch-create`, `push`, `str-replace`, `vote`, `copy`, `insert`, `upsert`,
 * `receive`, `unassign`, `queue`, `drop`, `archive`, `disassociate`. Guessing
 * intent from a name was the wrong instrument. The rule below reads the repo's
 * own documentation instead:
 *
 *   A command whose own `.description()` tells the user to set an
 *   `ENABLE_*_WRITE=true` / `ENABLE_*_DELETE=true` flag is, by that sentence, a
 *   write.
 *
 * It needs no judgement, and it gets right the one case verb-matching must get
 * wrong: `azure-storage queue receive` reads like a read, but receiving hides
 * the message and changes its visibility - which is why it sits behind the write
 * flag to begin with.
 *
 * Two deliberate limits:
 *
 * - Keyed on the command's **own** `.description()` string, not on the whole
 *   command block. Testing the block yields false positives (`azure-devops
 *   diff`, `azure-management logs`) where some other text in the block mentions
 *   a write flag; both are genuine reads that must keep caching.
 * - Only packages whose CLI `outputResult` actually supports `persist` are
 *   scanned. `github-enterprise` and `powerplatform-customization` have bespoke
 *   helpers that `console.log` and never cache anything, so there is nothing to
 *   suppress. That exclusion is derived from the helper source, not a hardcoded
 *   list, so it corrects itself if either package adopts the caching helper.
 *
 * Commands that mutate without naming a flag in their text (`azure-sql crud
 * insert`, `azure-devops-admin pipeline queue`) are outside what this can prove
 * and are marked by hand.
 *
 * Lives in `meta` because meta aggregates the whole suite - same reason as
 * `entrypoint-versions.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const PACKAGES_DIR = resolve(__dirname, '../../..');

/** Env-flag mentions that make a command a write by the repo's own docs. */
const WRITE_FLAG = /_(?:WRITE|DELETE)\s*=\s*true/;

interface CliCommand {
  /** `packages/x/src/cli/commands/y.ts:123`, for a failure message you can click. */
  label: string;
  name: string;
  description: string;
  hasPersistFalse: boolean;
}

/** Every `.ts` under a directory, minus build output and tests. */
function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'build' && entry.name !== '__tests__') tsFiles(p, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Packages whose CLI `outputResult` honours a `persist` option. The ones that
 * don't cache at all have nothing for this guard to check.
 */
function cachingPackages(): string[] {
  return readdirSync(PACKAGES_DIR).filter((pkg) => {
    const helper = join(PACKAGES_DIR, pkg, 'src', 'cli', 'output.ts');
    return existsSync(helper) && /persist/.test(readFileSync(helper, 'utf8'));
  });
}

/**
 * Every registered CLI command, sliced from its own `.command(` to the next
 * one. A fixed-size window would spill into the following command's block and
 * report its `persist: false` as this command's.
 */
function cliCommands(): CliCommand[] {
  const out: CliCommand[] = [];
  for (const pkg of cachingPackages()) {
    const cliDir = join(PACKAGES_DIR, pkg, 'src', 'cli');
    if (!existsSync(cliDir) || !statSync(cliDir).isDirectory()) continue;

    for (const file of tsFiles(cliDir)) {
      const src = readFileSync(file, 'utf8');
      const starts: Array<{ name: string; index: number }> = [];
      const re = /\.command\(\s*['"`]([^'"`]+)['"`]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        starts.push({ name: m[1].split(/\s+/)[0], index: m.index });
      }

      for (let i = 0; i < starts.length; i++) {
        const slice = src.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : src.length);
        if (!/outputResult\s*\(/.test(slice)) continue;

        const desc = slice.match(/\.description\(\s*(['"`])([\s\S]*?)\1\s*\)/);
        const line = src.slice(0, starts[i].index).split('\n').length;
        out.push({
          label: `${relative(resolve(PACKAGES_DIR, '..'), file)}:${line} (${starts[i].name})`,
          name: starts[i].name,
          description: desc ? desc[2] : '',
          hasPersistFalse: /persist:\s*false/.test(slice),
        });
      }
    }
  }
  return out;
}

describe('CLI write-cache convention', () => {
  it('finds the suite CLI commands, so an empty sweep cannot pass vacuously', () => {
    expect(cliCommands().length).toBeGreaterThan(500);
  });

  it('finds commands documented as writes, so the rule cannot match nothing', () => {
    const writes = cliCommands().filter((c) => WRITE_FLAG.test(c.description));
    expect(writes.length).toBeGreaterThan(50);
  });

  it('never caches a command its own description documents as a write', () => {
    const offenders = cliCommands()
      .filter((c) => WRITE_FLAG.test(c.description))
      .filter((c) => !c.hasPersistFalse)
      .map((c) => c.label);

    expect(offenders).toEqual([]);
  });
});
