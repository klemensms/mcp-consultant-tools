import { setEngagement, queryRecords } from '../harness/client.mjs';
import { readAuditFile, listAuditFiles, readAuditDir } from '../assert/jsonl.mjs';
import { walkChain } from '../assert/chain.mjs';
import { AUDIT_CLI_BUILD } from '../harness/creds.mjs';
import { spawnSync } from 'node:child_process';
import { computeRecordHash } from '@mcp-consultant-tools/core';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripMeta(r) {
  const { _file, _line, _parseError, _raw, ...rest } = r;
  return rest;
}

export default async function rotation(ctx) {
  // ===========================================================
  // PHASE 1 — Force size-based rotation. NOTE: implementation
  // detail discovered during this test — `size:1KB` rotation in
  // packages/core/src/audit/rotation.ts uses second-of-day to
  // pick a filename and does NOT enforce a byte threshold; the
  // effect is per-second rotation. To reliably get multiple
  // files we sleep ~1.1s between batches of calls.
  // ===========================================================
  const session = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'uat',
    PII_PROTECTION: 'true',
    MCP_AUDIT_LEVEL: 'lean',
    MCP_AUDIT_CLIENT: 'RotationTest',
    MCP_AUDIT_PATH: ctx.auditPath,
    MCP_AUDIT_OPERATOR: 'rotation@test.local',
    MCP_AUDIT_ROTATION: 'size:1KB',
  });
  await setEngagement(session.client, ['ROTATE-001'], 'rotation test');

  // 4 batches × 2 calls separated by ~1.1s → expect ≥3 files
  // (engagement record + first batch lands in file A; subsequent
  //  batches each land in their own per-second file)
  const BATCHES = 4;
  const CALLS_PER_BATCH = 2;
  const TOTAL_CALLS = BATCHES * CALLS_PER_BATCH;
  for (let b = 0; b < BATCHES; b++) {
    if (b > 0) await sleep(1100);
    for (let i = 0; i < CALLS_PER_BATCH; i++) {
      await queryRecords(session.client, {
        entityNamePlural: 'contacts',
        filter: 'firstname ne null',
        maxRecords: 1,
      });
    }
  }
  await session.close();

  const auditDir = path.join(ctx.auditPath, 'RotationTest');
  const files = await listAuditFiles(auditDir);
  ctx.log('info', `rotation produced ${files.length} files: ${files.map((f) => path.basename(f)).join(', ')}`);

  if (files.length < 2) {
    throw new Error(`expected ≥2 files for size:1KB rotation with timed batches, got ${files.length}`);
  }

  // ===========================================================
  // PHASE 2 — readAuditDir + walkChain across all files
  // ===========================================================
  const allRecords = await readAuditDir(auditDir);
  const expectedTotal = TOTAL_CALLS + 1; // +1 for set-audit-engagement
  ctx.log('info', `total records: ${allRecords.length} (expected ${expectedTotal})`);

  if (allRecords.length !== expectedTotal) {
    throw new Error(`expected ${expectedTotal} records, got ${allRecords.length}`);
  }

  const chain = walkChain(allRecords);
  if (!chain.ok) {
    throw new Error(`cross-file chain broken: ${JSON.stringify(chain)}`);
  }
  ctx.log('info', '✓ cross-file chain walks ok');

  // ===========================================================
  // PHASE 3 — verify each cross-file boundary explicitly
  // ===========================================================
  for (let i = 0; i < files.length - 1; i++) {
    const recsA = await readAuditFile(files[i]);
    const recsB = await readAuditFile(files[i + 1]);
    if (recsA.length === 0 || recsB.length === 0) continue;
    const lastA = stripMeta(recsA[recsA.length - 1]);
    const firstB = recsB[0];
    const lastAHash = computeRecordHash(lastA);
    if (firstB.prevHash !== lastAHash) {
      throw new Error(
        `boundary broken between ${path.basename(files[i])} and ${path.basename(files[i + 1])}: ` +
          `expected prevHash ${lastAHash}, got ${firstB.prevHash}`,
      );
    }
    ctx.log('info', `✓ boundary OK: ${path.basename(files[i])} → ${path.basename(files[i + 1])}`);
  }

  // ===========================================================
  // PHASE 4 — mcp-audit-cli verify across the directory
  // ===========================================================
  const cli = spawnSync('node', [AUDIT_CLI_BUILD, 'verify', auditDir], { encoding: 'utf8' });
  if (cli.status !== 0) {
    throw new Error(`mcp-audit-cli verify exit=${cli.status}, stdout=${cli.stdout}, stderr=${cli.stderr}`);
  }
  ctx.log('info', `✓ CLI verify reported OK across ${files.length} files`);

  // ===========================================================
  // PHASE 5 — daily filename derivation correctness
  // ===========================================================
  const dailySession = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'uat',
    PII_PROTECTION: 'true',
    MCP_AUDIT_LEVEL: 'lean',
    MCP_AUDIT_CLIENT: 'DailyTest',
    MCP_AUDIT_PATH: ctx.auditPath,
    MCP_AUDIT_OPERATOR: 'daily@test.local',
    MCP_AUDIT_ROTATION: 'daily',
  });
  await setEngagement(dailySession.client, ['DAILY-001'], 'daily filename test');
  await queryRecords(dailySession.client, {
    entityNamePlural: 'contacts',
    filter: 'firstname ne null',
    maxRecords: 1,
  });
  await dailySession.close();

  const dailyDir = path.join(ctx.auditPath, 'DailyTest');
  const dailyFiles = await listAuditFiles(dailyDir);
  if (dailyFiles.length !== 1) throw new Error(`daily produced ${dailyFiles.length} files, expected 1`);
  const dailyName = path.basename(dailyFiles[0]);
  if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(dailyName)) {
    throw new Error(`daily filename '${dailyName}' doesn't match YYYY-MM-DD.jsonl pattern`);
  }
  ctx.log('info', `✓ daily filename: ${dailyName}`);

  ctx.log('info', '✓ rotation scenario complete');
}
