import { setEngagement, queryRecords } from '../harness/client.mjs';
import { readAuditFile, listAuditFiles } from '../assert/jsonl.mjs';
import { walkChain } from '../assert/chain.mjs';
import { AUDIT_CLI_BUILD } from '../harness/creds.mjs';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

async function listAllAuditArtefacts(dir) {
  // Includes both .jsonl and quarantined .jsonl.broken-<ts> files. Excludes
  // hidden files like .chain-state.
  const entries = await readdir(dir);
  return entries
    .filter(e => !e.startsWith('.'))
    .sort()
    .map(e => path.join(dir, e));
}

export default async function quarantine(ctx) {
  // PHASE 1 — clean chain via real MCPTest reads
  const session1 = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'uat',
    PII_PROTECTION: 'true',
    MCP_AUDIT_LEVEL: 'lean',
    MCP_AUDIT_CLIENT: 'QuarantineTest',
    MCP_AUDIT_PATH: ctx.auditPath,
    MCP_AUDIT_OPERATOR: 'q@test.local',
  });
  await setEngagement(session1.client, ['Q-001'], 'quarantine test');
  for (let i = 0; i < 5; i++) {
    await queryRecords(session1.client, {
      entityNamePlural: 'contacts',
      filter: 'firstname ne null',
      maxRecords: 1,
    });
  }
  await session1.close();

  const auditDir = path.join(ctx.auditPath, 'QuarantineTest');
  const filesBefore = await listAuditFiles(auditDir);
  if (filesBefore.length !== 1) throw new Error(`expected 1 file, got ${filesBefore.length}`);
  const originalFile = filesBefore[0];
  const cleanRecs = await readAuditFile(originalFile);
  if (cleanRecs.length !== 6) throw new Error(`expected 6 clean records, got ${cleanRecs.length}`);
  if (!walkChain(cleanRecs).ok) throw new Error('clean chain failed walkChain');
  ctx.log('info', `✓ clean chain: ${cleanRecs.length} records`);

  // PHASE 2 — tamper a mid-chain record
  const lines = (await readFile(originalFile, 'utf8')).split('\n').filter(Boolean);
  const r3 = JSON.parse(lines[2]);
  r3.tool.params = { tampered: 'yes' };
  lines[2] = JSON.stringify(r3);
  await writeFile(originalFile, lines.join('\n') + '\n');

  const tamperedRecs = await readAuditFile(originalFile);
  const lib = walkChain(tamperedRecs);
  if (lib.ok) throw new Error('tamper check failed (chain unexpectedly ok)');
  ctx.log('info', `✓ tamper detected at seq ${lib.brokenAt}`);

  // PHASE 3 — quarantine CLI
  const cli = spawnSync(
    'node',
    [AUDIT_CLI_BUILD, 'quarantine', originalFile, '--reason', 'integration test'],
    { encoding: 'utf8' },
  );
  if (cli.status !== 0) {
    throw new Error(`quarantine CLI exit=${cli.status}, stdout=${cli.stdout}, stderr=${cli.stderr}`);
  }
  ctx.log('info', `quarantine CLI: ${cli.stdout.trim().split('\n')[0]}`);

  // PHASE 4 — inspect aftermath. Use the permissive lister because the
  // renamed broken file ends with a timestamp suffix, not `.jsonl`, so
  // `listAuditFiles` won't see it.
  const filesAfter = await listAllAuditArtefacts(auditDir);
  if (filesAfter.length !== 2) {
    throw new Error(`expected 2 files after quarantine, got ${filesAfter.length}: ${filesAfter.map(f=>path.basename(f)).join(', ')}`);
  }
  const sentinelFile = filesAfter.find(f => path.basename(f) === path.basename(originalFile));
  const renamedFile = filesAfter.find(f => f !== sentinelFile);
  if (!sentinelFile) throw new Error(`sentinel file (same name as original) not found`);
  if (!renamedFile) throw new Error(`renamed broken file not found`);
  if (!path.basename(renamedFile).includes('.broken-')) {
    throw new Error(`renamed file missing .broken- suffix: ${path.basename(renamedFile)}`);
  }
  ctx.log('info', `✓ files after quarantine: ${path.basename(sentinelFile)} (sentinel), ${path.basename(renamedFile)} (broken)`);

  const sentinelRecs = await readAuditFile(sentinelFile);
  if (sentinelRecs.length !== 1) {
    throw new Error(`sentinel file should have exactly 1 record, got ${sentinelRecs.length}`);
  }
  const sentinel = sentinelRecs[0];
  if (!sentinel.quarantine) throw new Error('sentinel record missing .quarantine block');
  if (sentinel.quarantine.reason !== 'integration test') {
    throw new Error(`sentinel reason mismatch: ${sentinel.quarantine.reason}`);
  }
  if (!sentinel.quarantine.previousFile || !sentinel.quarantine.previousFile.includes('.broken-')) {
    throw new Error(`sentinel.quarantine.previousFile invalid: ${sentinel.quarantine.previousFile}`);
  }
  if (sentinel.prevHash !== '0'.repeat(64)) {
    throw new Error(`sentinel prevHash should be zero, got ${sentinel.prevHash}`);
  }
  if (sentinel.tool?.name !== 'audit-quarantine-sentinel') {
    throw new Error(`sentinel tool.name should be audit-quarantine-sentinel, got ${sentinel.tool?.name}`);
  }
  if (sentinel.seq !== 1) {
    throw new Error(`sentinel seq should be 1, got ${sentinel.seq}`);
  }
  ctx.log('info', '✓ sentinel: prevHash=zero, seq=1, reason embedded, previousFile recorded');

  // PHASE 5 — fresh session writes new chain anchored on sentinel
  const session2 = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'uat',
    PII_PROTECTION: 'true',
    MCP_AUDIT_LEVEL: 'lean',
    MCP_AUDIT_CLIENT: 'QuarantineTest',
    MCP_AUDIT_PATH: ctx.auditPath,
    MCP_AUDIT_OPERATOR: 'q@test.local',
  });
  await setEngagement(session2.client, ['Q-002'], 'post-quarantine');
  for (let i = 0; i < 3; i++) {
    await queryRecords(session2.client, {
      entityNamePlural: 'contacts',
      filter: 'firstname ne null',
      maxRecords: 1,
    });
  }
  await session2.close();

  // PHASE 6 — walk new chain (sentinel + 4 new records: set-engagement + 3 queries)
  const newChainRecs = await readAuditFile(sentinelFile);
  if (newChainRecs.length !== 5) {
    throw new Error(`expected sentinel + 4 new records (=5), got ${newChainRecs.length}`);
  }
  const newChainResult = walkChain(newChainRecs);
  if (!newChainResult.ok) {
    throw new Error(`new chain broken: ${JSON.stringify(newChainResult)}`);
  }
  // Confirm sequence numbers are 1..5 (sentinel=1, new records 2..5)
  for (let i = 0; i < newChainRecs.length; i++) {
    if (newChainRecs[i].seq !== i + 1) {
      throw new Error(`record at index ${i} has seq=${newChainRecs[i].seq}, expected ${i + 1}`);
    }
  }
  ctx.log('info', `✓ new chain: ${newChainRecs.length} records, seqs 1..5, walkChain ok`);

  // PHASE 7 — verify CLI on the sentinel file alone (clean chain)
  const verifyNewOnly = spawnSync('node', [AUDIT_CLI_BUILD, 'verify', sentinelFile], {
    encoding: 'utf8',
  });
  if (verifyNewOnly.status !== 0) {
    throw new Error(
      `verify on sentinel file alone should be exit 0, got ${verifyNewOnly.status}. stdout=${verifyNewOnly.stdout} stderr=${verifyNewOnly.stderr}`,
    );
  }
  ctx.log('info', `✓ verify <sentinel-file> alone → exit 0 (clean chain)`);

  // PHASE 8 — verify CLI on the renamed broken file alone (still broken from tamper)
  const verifyBrokenOnly = spawnSync('node', [AUDIT_CLI_BUILD, 'verify', renamedFile], {
    encoding: 'utf8',
  });
  if (verifyBrokenOnly.status !== 2) {
    throw new Error(
      `verify on broken file alone should be exit 2, got ${verifyBrokenOnly.status}. stdout=${verifyBrokenOnly.stdout} stderr=${verifyBrokenOnly.stderr}`,
    );
  }
  ctx.log('info', `✓ verify <broken-file> alone → exit 2 (tamper still detected)`);

  // PHASE 9 — verify CLI on the directory.
  // Verify threads prev across files in alphabetical order. Files sort as:
  //   <original>.jsonl                     (sentinel + new chain)
  //   <original>.jsonl.broken-<ts>         (broken file, prev chain — OUT OF BAND)
  // The .broken-<ts> suffix means the file no longer matches the *.jsonl pattern that
  // mcp-audit-cli verify uses to enumerate files in a directory. This is intentional:
  // quarantined files are deliberately out-of-band so they don't pollute future verify
  // runs. The sentinel record points back at the broken file via .quarantine.previousFile
  // for forensic tracking. Operators who want to inspect a quarantined file pass it
  // directly: `mcp-audit-cli verify <broken-file>` — which we asserted above returns 2.
  const verifyDir = spawnSync('node', [AUDIT_CLI_BUILD, 'verify', auditDir], { encoding: 'utf8' });
  if (verifyDir.status !== 0) {
    throw new Error(
      `verify <dir> should be exit 0 (broken file is out-of-band, only sentinel + new chain in scope), got ${verifyDir.status}. stdout=${verifyDir.stdout} stderr=${verifyDir.stderr}`,
    );
  }
  ctx.log('info', `✓ verify <dir> → exit 0 (broken file out-of-band by design; .jsonl scan sees only the new chain)`);

  ctx.log('info', '✓ quarantine round-trip complete (9 phases)');
}
