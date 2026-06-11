import type { Command } from 'commander';
import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';
import { computeRecordHash, ZERO_HASH } from '@mcp-consultant-tools/core';

export function registerVerify(program: Command): void {
  program
    .command('verify')
    .description('Verify the SHA-256 hash chain of an audit JSONL file or directory')
    .argument('<path>', 'Path to a .jsonl file or a directory containing them')
    .option('--quiet', 'Suppress per-file OK output')
    .action(async (path: string, opts: { quiet?: boolean }) => {
      const stat = await fs.stat(path);
      const files = stat.isDirectory()
        ? (await fs.readdir(path)).filter((f) => f.endsWith('.jsonl')).sort().map((f) => join(path, f))
        : [path];

      let prev = ZERO_HASH;
      let totalRecords = 0;
      for (const file of files) {
        const result = await verifyFile(file, prev);
        if (result.ok) {
          if (!opts.quiet) {
            const range = result.firstTs && result.lastTs ? `range=[${result.firstTs} .. ${result.lastTs}]` : 'empty';
            console.log(`OK  ${basename(file)}  records=${result.records}  ${range}`);
          }
          prev = result.lastHash;
          totalRecords += result.records;
        } else {
          console.error(`BROKEN  ${basename(file)}  ${result.reason}  at line ${result.line} (seq ${result.seq})`);
          process.exit(2);
        }
      }
      if (!opts.quiet) console.log(`Total: ${totalRecords} records verified across ${files.length} file(s)`);
    });
}

interface VerifyOk { ok: true; lastHash: string; records: number; firstTs: string; lastTs: string }
interface VerifyBroken { ok: false; reason: string; line: number; seq: number }

async function verifyFile(file: string, expectedPrev: string): Promise<VerifyOk | VerifyBroken> {
  const content = await fs.readFile(file, 'utf8');
  const lines = content.split('\n').filter((l) => l.length > 0);
  let prev = expectedPrev;
  let firstTs = '';
  let lastTs = '';
  for (let i = 0; i < lines.length; i++) {
    let r: any;
    try {
      r = JSON.parse(lines[i]);
    } catch {
      return { ok: false, reason: 'malformed JSON', line: i + 1, seq: -1 };
    }
    if (r.prevHash !== prev) {
      return { ok: false, reason: `prevHash mismatch (expected ${prev.slice(0, 8)}…, got ${(r.prevHash ?? '').slice(0, 8)}…)`, line: i + 1, seq: r.seq ?? -1 };
    }
    prev = computeRecordHash(r);
    if (!firstTs) firstTs = r.ts;
    lastTs = r.ts;
  }
  return { ok: true, lastHash: prev, records: lines.length, firstTs, lastTs };
}
