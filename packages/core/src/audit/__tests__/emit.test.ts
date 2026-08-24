import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditPipeline } from '../pipeline.js';
import { auditEmit } from '../emit.js';
import type { AuditConfig } from '../types.js';

let basePath: string;
let pipeline: AuditPipeline;

beforeEach(async () => {
  basePath = mkdtempSync(join(tmpdir(), 'audit-emit-'));
  const cfg: AuditConfig = {
    level: 'lean', client: 'TEST', basePath, rotation: 'monthly',
  };
  pipeline = new AuditPipeline(cfg, {
    operator: { fingerprint: 'x@y' },
    auth: { principalId: null, principalType: 'unknown', userId: null },
    environment: { type: 'dev', auditLevel: 'lean' },
  });
  await pipeline.setEngagement(['Acme-1'], 'test');
});

afterEach(() => rmSync(basePath, { recursive: true, force: true }));

describe('auditEmit', () => {
  it('returns the wrapped function result', async () => {
    const r = await auditEmit(pipeline, { tool: 'query-records' }, async () => ({ count: 42 }));
    expect(r).toEqual({ count: 42 });
  });

  it('emits success=true on successful call', async () => {
    await auditEmit(pipeline, { tool: 'query-records' }, async () => ({ count: 1 }));
    const file = monthFile(basePath, 'TEST');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.tool.name).toBe('query-records');
    expect(last.result.success).toBe(true);
    expect(typeof last.result.durationMs).toBe('number');
  });

  it('emits success=false and rethrows on error', async () => {
    await expect(
      auditEmit(pipeline, { tool: 'query-records' }, async () => {
        throw new Error('odata fail');
      })
    ).rejects.toThrow('odata fail');
    const file = monthFile(basePath, 'TEST');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.result.success).toBe(false);
    expect(last.result.error).toBe('odata fail');
  });

  it('does not block tool execution when audit emit fails', async () => {
    // Force the audit pipeline's emitResolved to reject regardless of state, so the
    // failure mode is independent of filesystem semantics.
    const emitSpy = vi.spyOn(pipeline, 'emitResolved').mockRejectedValue(new Error('forced audit failure'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      // Tool succeeds; audit emit fails. Wrapper must return the tool result and log the audit error.
      const r = await auditEmit(pipeline, { tool: 'query-records' }, async () => ({ count: 1 }));
      expect(r).toEqual({ count: 1 });
      expect(emitSpy).toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalled();
      const calls = errSpy.mock.calls.map((c) => c.join(' '));
      expect(calls.some((s) => /\[audit\] failed to emit record for tool "query-records": forced audit failure/.test(s))).toBe(true);

      // Tool fails; audit emit fails. Wrapper must rethrow the ORIGINAL tool error and log the audit error.
      errSpy.mockClear();
      await expect(
        auditEmit(pipeline, { tool: 'query-records' }, async () => {
          throw new Error('original tool failure');
        })
      ).rejects.toThrow('original tool failure');
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      emitSpy.mockRestore();
    }
  });

  it('short-circuits to fn() without auditing when pipeline is disabled', async () => {
    const offBasePath = mkdtempSync(join(tmpdir(), 'audit-emit-off-'));
    const offCfg: AuditConfig = {
      level: 'off', client: 'OFF', basePath: offBasePath, rotation: 'monthly',
    };
    const offPipeline = new AuditPipeline(offCfg, {
      operator: { fingerprint: 'x@y' },
      auth: { principalId: null, principalType: 'unknown', userId: null },
      environment: { type: 'dev', auditLevel: 'off' },
    });
    // No engagement set - should still work because isEnabled=false bypasses everything.

    const emitSpy = vi.spyOn(offPipeline, 'emitResolved');
    try {
      const r = await auditEmit(offPipeline, { tool: 'query-records' }, async () => 'tool-result');
      expect(r).toBe('tool-result');
      expect(emitSpy).not.toHaveBeenCalled();
      // No audit dir should be created either
      const { existsSync } = await import('node:fs');
      expect(existsSync(join(offBasePath, 'OFF'))).toBe(false);
    } finally {
      emitSpy.mockRestore();
      rmSync(offBasePath, { recursive: true, force: true });
    }
  });

  it('refuses to execute when engagement is unset (lean/full)', async () => {
    const noEngagementBase = mkdtempSync(join(tmpdir(), 'audit-emit-noeng-'));
    const cfg: AuditConfig = {
      level: 'lean', client: 'NOENG', basePath: noEngagementBase, rotation: 'monthly',
    };
    const noEngPipeline = new AuditPipeline(cfg, {
      operator: { fingerprint: 'x@y' },
      auth: { principalId: null, principalType: 'unknown', userId: null },
      environment: { type: 'uat', auditLevel: 'lean' },
    });
    // No setEngagement call - pipeline is enabled but unset.
    let fnCalled = false;
    const promise = auditEmit(noEngPipeline, { tool: 'query-records' }, async () => {
      fnCalled = true;
      return 'should-never-run';
    });
    await expect(promise).rejects.toThrow(/Audit engagement not set/);
    await expect(promise).rejects.toMatchObject({ name: 'AuditEngagementUnsetError' });
    expect(fnCalled).toBe(false);
    rmSync(noEngagementBase, { recursive: true, force: true });
  });

  it('captures non-Error throws via String(err) and rethrows the original value', async () => {
    await expect(
      auditEmit(pipeline, { tool: 'query-records' }, async () => {
        throw 'string error literal';
      })
    ).rejects.toBe('string error literal');

    const file = monthFile(basePath, 'TEST');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.result.success).toBe(false);
    expect(last.result.error).toBe('string error literal');
  });
});

function monthFile(base: string, client: string): string {
  const d = new Date();
  return join(base, client, `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.jsonl`);
}
