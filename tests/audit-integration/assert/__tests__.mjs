/**
 * Synthetic-data tests for the assertion library. No MCPTest, no subprocess.
 * Run with: node tests/audit-integration/assert/__tests__.mjs
 */
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { computeRecordHash, ZERO_HASH } from '@mcp-consultant-tools/core';
import { readAuditFile, readAuditDir } from './jsonl.mjs';
import { walkChain } from './chain.mjs';
import { sweepForPii, assertNoLeakage } from './leakage.mjs';

let pass = 0;
let fail = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.error('  ✓', name);
      pass++;
    })
    .catch((err) => {
      console.error('  ✗', name, '—', err.message);
      fail++;
    });
}

function makeRecord(seq, prevHash, params) {
  return {
    v: 1,
    ts: '2026-05-03T00:00:00.000Z',
    seq,
    prevHash,
    operator: { fingerprint: 'fp1', identity: 'op@test' },
    auth: { principalId: null, principalType: 'unknown', userId: null },
    engagement: { client: 'TEST', workItemIds: ['T-1'], source: 'agent-explicit' },
    environment: { type: 'dev', auditLevel: 'lean' },
    tool: { name: 'query-records', params },
    result: { success: true, error: null, durationMs: 5 },
    redaction: { input: null, output: null },
  };
}

async function chainOfN(dir, n, paramsFn = (i) => ({ filter: `i eq ${i}` })) {
  const file = path.join(dir, '2026-05.jsonl');
  let prev = ZERO_HASH;
  const records = [];
  for (let i = 1; i <= n; i++) {
    const r = makeRecord(i, prev, paramsFn(i));
    records.push(r);
    prev = computeRecordHash(r);
  }
  await writeFile(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return file;
}

async function main() {
  console.error('== assertion library tests ==');

  await test('readAuditFile parses N records with line numbers', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'assert-tests-'));
    await chainOfN(dir, 3);
    const recs = await readAuditFile(path.join(dir, '2026-05.jsonl'));
    if (recs.length !== 3) throw new Error(`expected 3, got ${recs.length}`);
    if (recs[0]._line !== 1) throw new Error('line nums wrong');
  });

  await test('readAuditFile tolerates trailing newline', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'assert-tests-'));
    const file = path.join(dir, '2026-05.jsonl');
    await writeFile(file, '{"v":1,"seq":1}\n\n');
    const recs = await readAuditFile(file);
    if (recs.length !== 1) throw new Error(`trailing newline broke parser, got ${recs.length}`);
  });

  await test('readAuditFile records parse errors instead of throwing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'assert-tests-'));
    const file = path.join(dir, '2026-05.jsonl');
    await writeFile(file, '{"v":1,"seq":1}\nNOT JSON\n');
    const recs = await readAuditFile(file);
    if (recs.length !== 2) throw new Error(`expected 2, got ${recs.length}`);
    if (!recs[1]._parseError) throw new Error('expected parse error on line 2');
  });

  await test('readAuditDir walks files in lexical order', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'assert-tests-'));
    await writeFile(path.join(dir, '2026-04.jsonl'), '{"seq":1}\n');
    await writeFile(path.join(dir, '2026-05.jsonl'), '{"seq":2}\n');
    const all = await readAuditDir(dir);
    if (all[0].seq !== 1 || all[1].seq !== 2) throw new Error('order wrong');
  });

  await test('walkChain returns ok for clean chain', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'assert-tests-'));
    await chainOfN(dir, 5);
    const recs = await readAuditFile(path.join(dir, '2026-05.jsonl'));
    const r = walkChain(recs);
    if (!r.ok) throw new Error('expected ok, got ' + JSON.stringify(r));
  });

  await test('walkChain detects edited prevHash', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'assert-tests-'));
    const file = await chainOfN(dir, 3);
    let raw = (await import('node:fs/promises')).readFile(file, 'utf8').then((s) => s);
    raw = await raw;
    const lines = raw.split('\n').filter(Boolean);
    const r2 = JSON.parse(lines[1]);
    r2.prevHash = ZERO_HASH;
    lines[1] = JSON.stringify(r2);
    await writeFile(file, lines.join('\n') + '\n');
    const recs = await readAuditFile(file);
    const result = walkChain(recs);
    if (result.ok) throw new Error('expected break');
    if (result.brokenAt !== 2) throw new Error(`expected break at 2, got ${result.brokenAt}`);
  });

  await test('walkChain detects modified record body', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'assert-tests-'));
    const file = await chainOfN(dir, 3);
    let raw = await (await import('node:fs/promises')).readFile(file, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const r1 = JSON.parse(lines[0]);
    r1.tool.params.filter = 'TAMPERED';
    lines[0] = JSON.stringify(r1);
    await writeFile(file, lines.join('\n') + '\n');
    const recs = await readAuditFile(file);
    const result = walkChain(recs);
    if (result.ok) throw new Error('expected break (tamper on seq 1 should break seq 2 prevHash check)');
    if (result.brokenAt !== 2) throw new Error(`expected break at 2, got ${result.brokenAt}`);
  });

  await test('sweepForPii detects leaked fixture string', () => {
    const records = [
      makeRecord(1, ZERO_HASH, { filter: "firstname eq 'AUDITTEST_Maria'" }),
    ];
    const fixtures = [
      { id: 'fixture-1', knownStrings: { firstname: 'AUDITTEST_Maria' } },
    ];
    const r = sweepForPii(records, fixtures);
    if (r.leaked.length !== 1) throw new Error(`expected 1 leak, got ${r.leaked.length}`);
    if (r.leaked[0].seq !== 1) throw new Error('wrong seq');
    if (r.leaked[0].fixtureValue !== 'AUDITTEST_Maria') throw new Error('wrong value');
  });

  await test('sweepForPii reports clean when redacted', () => {
    const records = [
      makeRecord(1, ZERO_HASH, { filter: "firstname eq '[REDACTED:name:abc]'" }),
    ];
    const fixtures = [
      { id: 'fixture-1', knownStrings: { firstname: 'AUDITTEST_Maria' } },
    ];
    const r = sweepForPii(records, fixtures);
    if (r.leaked.length !== 0) throw new Error('false positive');
    if (r.cleanCount !== 1) throw new Error(`expected 1 clean, got ${r.cleanCount}`);
  });

  await test('assertNoLeakage throws on leak', () => {
    const records = [makeRecord(1, ZERO_HASH, { filter: 'AUDITTEST_Maria' })];
    const fixtures = [{ id: 'f1', knownStrings: { firstname: 'AUDITTEST_Maria' } }];
    let threw = false;
    try {
      assertNoLeakage(records, fixtures);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('assertNoLeakage failed to throw on leak');
  });

  console.error(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
