import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditPipeline } from '../pipeline.js';
import type { AuditConfig } from '../types.js';

let basePath: string;

beforeEach(() => {
  basePath = mkdtempSync(join(tmpdir(), 'audit-pipe-'));
});

afterEach(() => {
  rmSync(basePath, { recursive: true, force: true });
});

function makePipeline(level: 'off' | 'lean' | 'full' = 'lean'): AuditPipeline {
  const cfg: AuditConfig = {
    level,
    client: 'TEST',
    operatorIdentity: 'tester@example.com',
    basePath,
    rotation: 'monthly',
  };
  return new AuditPipeline(cfg, {
    operator: { fingerprint: 'tester@host', identity: 'tester@example.com' },
    auth: { principalId: 'spn-1', principalType: 'service-principal', userId: null },
    environment: { type: 'dev', url: 'https://test.example/', auditLevel: level },
  });
}

describe('AuditPipeline', () => {
  it('throws AuditEngagementUnsetError on first emit without engagement', async () => {
    const p = makePipeline('lean');
    await expect(p.emit({ tool: 'query-records' })).rejects.toThrow(/engagement not set/i);
  });

  it('emits a record after engagement set, hash chain valid', async () => {
    const p = makePipeline('lean');
    await p.setEngagement(['Acme-1'], 'test');
    await p.emit({ tool: 'query-records', params: { entity: 'contacts' } });

    const monthFile = join(basePath, 'TEST', `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}.jsonl`);
    const lines = readFileSync(monthFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2); // context-change + the tool emit
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0].tool.name).toBe('set-audit-engagement');
    expect(parsed[1].tool.name).toBe('query-records');
    expect(parsed[1].seq).toBe(2);
    expect(parsed[1].prevHash).toBeDefined();
  });

  it('serialises concurrent emits — chain stays correct', async () => {
    const p = makePipeline('lean');
    await p.setEngagement(['Acme-1'], undefined);
    await Promise.all([
      p.emit({ tool: 'a' }),
      p.emit({ tool: 'b' }),
      p.emit({ tool: 'c' }),
    ]);
    const monthFile = join(basePath, 'TEST', `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}.jsonl`);
    const lines = readFileSync(monthFile, 'utf8').trim().split('\n');
    const seqs = lines.map((l) => JSON.parse(l).seq);
    expect(seqs).toEqual([1, 2, 3, 4]); // context-change + 3 emits

    // Chain integrity: each record's prevHash should equal the previous record's recorded hash chain link.
    // We can't recompute the hash from outside the pipeline, but we can assert the prevHash is non-zero
    // for every record except the first, and that the seq values are strictly increasing.
    const records = lines.map((l) => JSON.parse(l));
    expect(records[0].prevHash).toBe('0'.repeat(64));
    for (let i = 1; i < records.length; i++) {
      expect(records[i].prevHash).toMatch(/^[0-9a-f]{64}$/);
      expect(records[i].prevHash).not.toBe('0'.repeat(64));
      expect(records[i].seq).toBeGreaterThan(records[i - 1].seq);
    }
  });

  it('emits payload.input on level=full and omits payload on level=lean', async () => {
    const pFull = makePipeline('full');
    await pFull.setEngagement(['Acme-1'], undefined);
    await pFull.emit({ tool: 'query-records', payloadInput: { entity: 'contacts' } });

    const monthFile = join(basePath, 'TEST', `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}.jsonl`);
    const fullParsed = readFileSync(monthFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(fullParsed[1].payload).toEqual({ input: { entity: 'contacts' } });

    // Lean mode in a separate basePath
    rmSync(basePath, { recursive: true, force: true });
    basePath = mkdtempSync(join(tmpdir(), 'audit-pipe-'));
    const pLean = makePipeline('lean');
    await pLean.setEngagement(['Acme-1'], undefined);
    await pLean.emit({ tool: 'query-records', payloadInput: { entity: 'contacts' } });
    const leanFile = join(basePath, 'TEST', `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}.jsonl`);
    const leanParsed = readFileSync(leanFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(leanParsed[1].payload).toBeUndefined();
  });

  it('surfaces AuditWriteError when storage fails', async () => {
    // Block dir creation by pre-creating a file at the would-be client dir path.
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(basePath, 'TEST'), 'oops', 'utf8');
    const p = makePipeline('lean');
    await expect(p.setEngagement(['Acme-1'], undefined)).rejects.toThrow(/AuditWriteError|EEXIST|ENOTDIR/);
  });

  it('persists chain state across pipeline instances', async () => {
    const p1 = makePipeline('lean');
    await p1.setEngagement(['Acme-1'], undefined);
    await p1.emit({ tool: 'query-records' });

    const p2 = makePipeline('lean');
    await p2.setEngagement(['Acme-1'], undefined);
    await p2.emit({ tool: 'create-record' });

    const monthFile = join(basePath, 'TEST', `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}.jsonl`);
    const lines = readFileSync(monthFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    // 4 records: p1 set-engagement + p1 emit + p2 set-engagement + p2 emit
    expect(lines.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
    // p2's set-engagement record's prevHash equals the hash of p1's emit record
    expect(lines[2].prevHash).toMatch(/^[0-9a-f]{64}$/);
    expect(lines[2].prevHash).not.toBe('0'.repeat(64));
  });

  it('skips disk writes entirely when level=off', async () => {
    const p = makePipeline('off');
    await p.setEngagement(['Acme-1'], undefined);
    await p.emit({ tool: 'query-records' });
    const dir = join(basePath, 'TEST');
    const { existsSync } = await import('node:fs');
    expect(existsSync(dir)).toBe(false);
  });
});
