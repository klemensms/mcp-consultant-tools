#!/usr/bin/env node
/**
 * Sweep for unrecorded fan-out failures (the X2 defect class).
 *
 * X2 as raised was "every command that fans out, in every package". The fan-out contract
 * lives in `packages/core/src/helpers/fan-out.ts` and is applied in `azure-management` and
 * `azure-defender`. The original work-list was
 * `grep -rn "console.error(\`Failed to" packages/*\/src`, which is **exhausted**: it now
 * returns two hits and neither is a collection fan-out. So the remaining scope had to be
 * found by shape rather than by log wording, and this script is that shape, committed so
 * the number is re-runnable rather than a claim in a commit message.
 *
 *   node scripts/sweep-fanout-candidates.mjs           # summary
 *   node scripts/sweep-fanout-candidates.mjs --list    # every candidate with its snippet
 *
 * What it looks for: a `catch` that sits inside an iteration over a collection and neither
 * rethrows nor records the failure anywhere a caller could read. Two swallow shapes:
 *
 *   1. an empty catch, or one whose body is only comments
 *   2. a catch whose body only logs to the console and then continues
 *
 * plus the promise-chain equivalents (`.catch(() => undefined)` and friends).
 *
 * **It reports candidates, not defects.** Every hit still needs reading, because three
 * shapes look identical to a regex and are not the defect:
 *
 *   - a fallback chain, where failing on one candidate IS the loop ("try `op` at each of
 *     four paths", "try the OptionSet nav property then the GlobalOptionSet one"). The
 *     overall failure is reported by the caller.
 *   - a declared default, where the function returns a documented fallback value.
 *   - a per-item outcome the payload already carries as a field, e.g. an access test that
 *     sets `blobServiceAvailable: false`. The gap is visible even though the reason is not.
 *
 * The defect is the fourth shape: an item silently missing from a returned collection, so
 * a partial result is byte-for-byte indistinguishable from a complete one.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = 'packages';
const LIST = process.argv.includes('--list');

/** Iteration markers. A swallow only matters here if it is inside one of these. */
const ITERATION =
  /\b(for\s*\(|for\s+await|\.map\(|\.forEach\(|Promise\.all\(|Promise\.allSettled\(|mapWithConcurrency\()/;

/** Evidence that the failure was recorded somewhere a caller can read. */
const RECORDED =
  /fanOut|FanOutRecorder|failures\.push|errors\.push|recorder\.|Warning\s*=|warnings\.push|scanError/;

/** Promise-chain swallows, which have no catch block to walk. */
const CHAIN_SWALLOWS = [
  /\.catch\(\s*\(\s*\)\s*=>\s*(undefined|null|\[\]|\{\}|void 0)\s*\)/g,
  /\.catch\(\s*\(\s*[^)]*\s*\)\s*=>\s*\{\s*(\/\/[^\n]*\n\s*)*\}\s*\)/g,
];

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'build' || entry === '__tests__') continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(path);
    }
  };
  for (const pkg of readdirSync(PACKAGES)) {
    try {
      walk(join(PACKAGES, pkg, 'src'));
    } catch {
      // Package with no src/ - nothing to sweep.
    }
  }
  return out;
}

/** Balanced body of the catch block whose opening brace is at `braceIndex`. */
function catchBody(source, braceIndex) {
  let depth = 0;
  for (let i = braceIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(braceIndex + 1, i);
    }
  }
  return '';
}

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

/**
 * Is `line` inside an iteration? Looks back 60 lines, which covers every loop body in this
 * repo but is a heuristic - a swallow deeper inside a very long loop would be missed, so
 * treat the count as a floor.
 */
const insideIteration = (lines, line) =>
  ITERATION.test(lines.slice(Math.max(0, line - 61), line).join('\n'));

function sweep() {
  const candidates = [];

  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    const pkg = file.split('/')[1];

    // Catch blocks.
    const catches = /\bcatch\s*(\([^)]*\))?\s*\{/g;
    let match;
    while ((match = catches.exec(source)) !== null) {
      const braceIndex = match.index + match[0].length - 1;
      const body = catchBody(source, braceIndex);
      const code = body
        .split('\n')
        .map((l) => l.replace(/\/\/.*$/, '').trim())
        .filter(Boolean)
        .join(' ');

      const empty = code === '';
      const logsOnly =
        !empty &&
        /console\.(error|warn|log|debug)/.test(code) &&
        !/\b(throw|return|reject)\b/.test(code);

      if (!empty && !logsOnly) continue;
      if (RECORDED.test(code)) continue;

      const line = lineOf(source, match.index);
      if (!insideIteration(lines, line)) continue;

      candidates.push({
        pkg,
        file,
        line,
        shape: empty ? 'empty-catch' : 'logs-and-continues',
        snippet: (lines[line - 1] ?? '').trim().slice(0, 100),
      });
    }

    // Promise-chain swallows.
    for (const pattern of CHAIN_SWALLOWS) {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(source)) !== null) {
        const line = lineOf(source, match.index);
        if (!insideIteration(lines, line)) continue;
        candidates.push({
          pkg,
          file,
          line,
          shape: 'chain-swallow',
          snippet: (lines[line - 1] ?? '').trim().slice(0, 100),
        });
      }
    }
  }

  return candidates;
}

const candidates = sweep();
const byPackage = new Map();
for (const c of candidates) {
  if (!byPackage.has(c.pkg)) byPackage.set(c.pkg, []);
  byPackage.get(c.pkg).push(c);
}

const allPackages = readdirSync(PACKAGES).filter((p) => {
  try {
    return statSync(join(PACKAGES, p, 'src')).isDirectory();
  } catch {
    return false;
  }
});

console.log(`Fan-out candidates (need reading, not defects): ${candidates.length}`);
console.log(`Packages with candidates: ${byPackage.size} of ${allPackages.length}`);
console.log('');

for (const [pkg, rows] of [...byPackage].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${pkg}  (${rows.length})`);
  if (LIST) {
    for (const r of rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      console.log(`  ${r.file}:${r.line}  [${r.shape}]  ${r.snippet}`);
    }
    console.log('');
  }
}

const clean = allPackages.filter((p) => !byPackage.has(p));
console.log('');
console.log(`No candidates: ${clean.join(', ')}`);
