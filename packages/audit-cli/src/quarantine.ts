import type { Command } from 'commander';
import { promises as fs } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { computeRecordHash, captureOperator, ZERO_HASH } from '@mcp-consultant-tools/core';

export function registerQuarantine(program: Command): void {
  program
    .command('quarantine')
    .description('Quarantine a broken audit file: rename it and start a fresh chain with a sentinel record')
    .argument('<file>', 'Path to the broken .jsonl file')
    .requiredOption('--reason <text>', 'Operator-supplied reason for the quarantine (free text)')
    .action(async (file: string, opts: { reason: string }) => {
      const original = await fs.readFile(file, 'utf8').catch(() => null);
      if (original === null) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }

      // Inherit environment from the last parseable record so the sentinel
      // honestly reflects which env the chain belonged to. Fall back to dev
      // (most conservative) if no record parses.
      const inheritedEnv = inheritEnvironment(original);

      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const brokenName = `${basename(file)}.broken-${ts}`;
      const brokenPath = join(dirname(file), brokenName);
      await fs.rename(file, brokenPath);

      const sentinel = {
        v: 1,
        ts: new Date().toISOString(),
        seq: 1,
        prevHash: ZERO_HASH,
        operator: captureOperator(),
        auth: { principalId: null, principalType: 'unknown', userId: null },
        engagement: { client: 'unknown', workItemIds: ['quarantine'], source: 'unset' },
        environment: inheritedEnv,
        tool: { name: 'audit-quarantine-sentinel' },
        result: { success: true, error: null, durationMs: 0 },
        redaction: { input: null, output: null },
        quarantine: { previousFile: brokenName, reason: opts.reason },
      };
      const sentinelHash = computeRecordHash(sentinel);
      await fs.writeFile(file, `${JSON.stringify(sentinel)}\n`, 'utf8');

      const stateFile = join(dirname(file), '.chain-state');
      const newState = {
        v: 1,
        lastSeq: 1,
        lastHash: sentinelHash,
        fileChecksumAtLastWrite: '',
        currentFile: basename(file),
      };
      await fs.writeFile(stateFile, JSON.stringify(newState), 'utf8');

      console.log(`Quarantined: ${file}`);
      console.log(`  Renamed to: ${brokenPath}`);
      console.log(`  Fresh chain started with sentinel (seq=1, hash=${sentinelHash.slice(0, 12)}…)`);
    });
}

function inheritEnvironment(fileContent: string): { type: 'production' | 'uat' | 'dev'; url?: string; auditLevel: 'off' | 'lean' | 'full' } {
  const lines = fileContent.split('\n').filter((l) => l.length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const r = JSON.parse(lines[i]);
      if (r.environment && typeof r.environment.type === 'string') {
        return r.environment;
      }
    } catch {
      // Skip malformed lines.
    }
  }
  return { type: 'dev', auditLevel: 'lean' };
}
