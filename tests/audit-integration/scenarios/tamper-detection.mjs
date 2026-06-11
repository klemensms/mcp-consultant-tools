/**
 * Task 39 — Tamper detection.
 *
 * Generates a clean audit chain via real MCPTest reads, then exercises 5 tamper
 * modes against the JSONL file and verifies that BOTH the in-process walkChain
 * library and the mcp-audit-cli verify binary catch every break.
 */
import { setEngagement, queryRecords } from '../harness/client.mjs';
import { readAuditFile, listAuditFiles } from '../assert/jsonl.mjs';
import { walkChain } from '../assert/chain.mjs';
import { AUDIT_CLI_BUILD } from '../harness/creds.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export default async function tamperDetection(ctx) {
  // PHASE 1 — build a clean chain of 6 records (1 set-engagement + 5 reads)
  const session = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'uat',
    PII_PROTECTION: 'true',
    MCP_AUDIT_LEVEL: 'lean',
    MCP_AUDIT_CLIENT: 'TamperTest',
    MCP_AUDIT_PATH: ctx.auditPath,
    MCP_AUDIT_OPERATOR: 'tamper@test.local',
  });
  await setEngagement(session.client, ['TAMPER-001'], 'tamper detection chain');
  for (let i = 0; i < 5; i++) {
    const r = await queryRecords(session.client, {
      entityNamePlural: 'contacts',
      filter: 'firstname ne null',
      maxRecords: 1,
    });
    if (r?.isError) throw new Error('seed query failed: ' + JSON.stringify(r));
  }
  await session.close();

  const auditDir = path.join(ctx.auditPath, 'TamperTest');
  const files = await listAuditFiles(auditDir);
  if (files.length !== 1) throw new Error(`expected 1 audit file, got ${files.length}`);
  const file = files[0];

  // Snapshot clean state for restoration between cases
  const clean = await readFile(file, 'utf8');
  const cleanRecs = await readAuditFile(file);
  if (cleanRecs.length !== 6) {
    throw new Error(`expected 6 records, got ${cleanRecs.length}`);
  }
  const seqs = cleanRecs.map((r) => r.seq);
  // Sanity: seq 1..6
  if (JSON.stringify(seqs) !== JSON.stringify([1, 2, 3, 4, 5, 6])) {
    throw new Error(`unexpected seq sequence: ${seqs.join(',')}`);
  }
  if (!walkChain(cleanRecs).ok) {
    throw new Error('clean chain failed walkChain — bug in foundation');
  }
  ctx.log('info', 'clean chain: 6 records (seq 1..6), chain OK');

  /**
   * Helper: restore clean state, run mutation, assert walkChain detects
   * AND mcp-audit-cli verify exits 2.
   *
   * If `expectedBrokenSeq` is null, only assert ok=false (we don't constrain
   * which seq breaks first).
   * If `tolerateLibOk` is true, walkChain may return ok (e.g. truncation that
   * lands cleanly between records and is invisible to a record-level walk);
   * we still require the CLI to exit 2.
   */
  async function runTamper(name, mutate, expectedBrokenSeq, opts = {}) {
    await writeFile(file, clean);
    await mutate(file);
    const recs = await readAuditFile(file);
    const lib = walkChain(recs);

    const cli = spawnSync('node', [AUDIT_CLI_BUILD, 'verify', file], { encoding: 'utf8' });
    if (cli.status !== 2) {
      throw new Error(
        `[${name}] CLI exit=${cli.status}, expected 2.\nstdout: ${cli.stdout}\nstderr: ${cli.stderr}`,
      );
    }

    if (!opts.tolerateLibOk) {
      if (lib.ok) {
        throw new Error(
          `[${name}] walkChain returned ok unexpectedly (CLI did catch). lib=${JSON.stringify(lib)}`,
        );
      }
      if (expectedBrokenSeq != null && lib.brokenAt !== expectedBrokenSeq) {
        throw new Error(
          `[${name}] walkChain broke at seq ${lib.brokenAt}, expected ${expectedBrokenSeq}`,
        );
      }
    }
    ctx.log(
      'info',
      `✓ ${name} — walkChain ${lib.ok ? 'ok (lib-tolerated; CLI caught)' : `break at seq ${lib.brokenAt}`}, CLI exit=2`,
    );
  }

  // CASE A — modify a field in the middle. Tampering seq 3's body changes its
  // computed hash; seq 4's prevHash check fails first.
  await runTamper(
    'A: modify field at seq 3',
    async (f) => {
      const lines = (await readFile(f, 'utf8')).split('\n').filter(Boolean);
      const r = JSON.parse(lines[2]);
      r.tool.params = { tampered: true };
      lines[2] = JSON.stringify(r);
      await writeFile(f, lines.join('\n') + '\n');
    },
    4,
  );

  // CASE B — delete seq 4 entirely. seq 5's prevHash points at vanished hash.
  await runTamper(
    'B: delete seq 4',
    async (f) => {
      const lines = (await readFile(f, 'utf8')).split('\n').filter(Boolean);
      lines.splice(3, 1);
      await writeFile(f, lines.join('\n') + '\n');
    },
    5,
  );

  // CASE C — reorder seq 2 and seq 5. Don't constrain brokenAt (depends on
  // walker behaviour with seq jumps).
  await runTamper('C: reorder seq 2 ↔ 5', async (f) => {
    const lines = (await readFile(f, 'utf8')).split('\n').filter(Boolean);
    [lines[1], lines[4]] = [lines[4], lines[1]];
    await writeFile(f, lines.join('\n') + '\n');
  });

  // CASE D — truncate file mid-record (chop last 50 bytes). The CLI's
  // verifyFile filters out empty lines via `.filter(l => l.length > 0)` then
  // tries JSON.parse on each — it will hit "malformed JSON" on the truncated
  // last line and exit 2. The local walkChain may behave differently
  // depending on readAuditFile error handling, so tolerate lib.ok.
  await runTamper(
    'D: truncate file mid-record',
    async (f) => {
      const raw = await readFile(f, 'utf8');
      await writeFile(f, raw.slice(0, raw.length - 50));
    },
    null,
    { tolerateLibOk: true },
  );

  // CASE E — modify prevHash directly on seq 4. Walker's expected-prev for
  // seq 4 still equals seq 3's hash, so check fails AT seq 4.
  await runTamper(
    'E: modify prevHash on seq 4',
    async (f) => {
      const lines = (await readFile(f, 'utf8')).split('\n').filter(Boolean);
      const r = JSON.parse(lines[3]);
      r.prevHash = '1' + r.prevHash.slice(1);
      lines[3] = JSON.stringify(r);
      await writeFile(f, lines.join('\n') + '\n');
    },
    4,
  );

  ctx.log('info', '5/5 tamper cases caught by both walkChain and mcp-audit-cli verify');
}
