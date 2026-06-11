/**
 * Refuse-to-start matrix — Task 35 (Phase 15).
 *
 * Spawns pp-data subprocess with deliberately-bad config and asserts:
 *   - exit code === 1
 *   - stderr contains the spec-mandated text
 *
 * Each case is independent. PII_PROTECTION is set explicitly per case so that
 * the PII pipeline's own refuse-to-start matrix doesn't fire BEFORE audit's.
 */
import { spawnAndCaptureExit } from '../harness/spawn.mjs';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function tempDir(prefix) {
  return mkdtemp(path.join(os.tmpdir(), `audit-${prefix}-`));
}

async function safeChmodAndRemove(dir) {
  try {
    await chmod(dir, 0o755);
  } catch {
    /* ignore */
  }
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export default async function refuseToStart(ctx) {
  const cases = [
    {
      name: 'production + MCP_AUDIT_LEVEL unset → exit 1',
      env: {
        MCP_ENVIRONMENT_TYPE: 'production',
        PII_PROTECTION: 'true',
        // MCP_AUDIT_LEVEL deliberately unset
      },
      stderrMatcher: /MCP_AUDIT_LEVEL must be set explicitly/,
    },
    {
      name: 'production + MCP_AUDIT_LEVEL=off → exit 1',
      env: {
        MCP_ENVIRONMENT_TYPE: 'production',
        PII_PROTECTION: 'true',
        MCP_AUDIT_LEVEL: 'off',
      },
      stderrMatcher: /MCP_ENVIRONMENT_TYPE=production rejects MCP_AUDIT_LEVEL=off/,
    },
    {
      name: 'lean + MCP_AUDIT_CLIENT unset → exit 1',
      env: {
        MCP_ENVIRONMENT_TYPE: 'uat',
        PII_PROTECTION: 'true',
        MCP_AUDIT_LEVEL: 'lean',
        // MCP_AUDIT_CLIENT deliberately unset
      },
      stderrMatcher: /MCP_AUDIT_CLIENT is required/,
    },
  ];

  // Case 4 — audit base directory unwritable.
  // Allocate a temp dir, chmod 000, point MCP_AUDIT_PATH at it.
  const unwritableDir = await tempDir('unwritable');
  await chmod(unwritableDir, 0o000);
  cases.push({
    name: 'lean + audit base directory unwritable → exit 1',
    env: {
      MCP_ENVIRONMENT_TYPE: 'uat',
      PII_PROTECTION: 'true',
      MCP_AUDIT_LEVEL: 'lean',
      MCP_AUDIT_CLIENT: 'TestUnwritable',
      MCP_AUDIT_PATH: unwritableDir,
    },
    stderrMatcher: /(unwritable|permission|EACCES|EPERM|cannot.*write|access denied)/i,
    cleanup: async () => safeChmodAndRemove(unwritableDir),
  });

  // Case 5 — corrupted .chain-state file.
  // Pre-stage a directory at MCP_AUDIT_PATH/<client>/.chain-state with garbage.
  const corruptDir = await tempDir('corrupt-state');
  const clientDir = path.join(corruptDir, 'TestCorrupt');
  await writeFile(path.join(corruptDir, '__placeholder__'), '');  // ensure mkdtemp dir exists
  // create the per-client dir + corrupted state file
  await (await import('node:fs/promises')).mkdir(clientDir, { recursive: true });
  await writeFile(path.join(clientDir, '.chain-state'), '{garbage', 'utf8');
  cases.push({
    name: 'lean + corrupted .chain-state → exit 1',
    env: {
      MCP_ENVIRONMENT_TYPE: 'uat',
      PII_PROTECTION: 'true',
      MCP_AUDIT_LEVEL: 'lean',
      MCP_AUDIT_CLIENT: 'TestCorrupt',
      MCP_AUDIT_PATH: corruptDir,
    },
    stderrMatcher: /(quarantine|chain.*state|corrupt|invalid.*JSON|SyntaxError)/i,
    cleanup: async () => safeChmodAndRemove(corruptDir),
  });

  let pass = 0;
  let fail = 0;
  const results = [];

  try {
    for (const c of cases) {
      ctx.log('info', `→ ${c.name}`);
      let r;
      try {
        r = await spawnAndCaptureExit(c.env, 8000);
      } catch (err) {
        // Timeout means the server kept running — did NOT refuse.
        fail++;
        const detail = `did NOT exit within 8s (no refuse). err=${err.message}`;
        ctx.log('error', `✗ ${c.name} — ${detail}`);
        results.push({ name: c.name, ok: false, detail });
        continue;
      }
      const exitOk = r.exitCode === 1;
      const stderrOk = c.stderrMatcher.test(r.stderr);
      const ok = exitOk && stderrOk;
      if (ok) {
        pass++;
        ctx.log('info', `✓ ${c.name}`);
        results.push({ name: c.name, ok: true });
      } else {
        fail++;
        const detail = `exitCode=${r.exitCode} stderr.match=${stderrOk} stderr=${r.stderr.slice(0, 400).replace(/\n/g, ' / ')}`;
        ctx.log('error', `✗ ${c.name} — ${detail}`);
        results.push({ name: c.name, ok: false, detail });
      }
    }
  } finally {
    for (const c of cases) {
      if (c.cleanup) {
        try { await c.cleanup(); } catch (err) { ctx.log('warn', `cleanup: ${err.message}`); }
      }
    }
  }

  ctx.log('info', `refuse-to-start summary: ${pass}/${cases.length} passed`);

  if (fail > 0) {
    const detail = results.filter((r) => !r.ok).map((r) => `  - ${r.name}: ${r.detail}`).join('\n');
    throw new Error(`${fail}/${cases.length} refuse-to-start cases failed:\n${detail}`);
  }
}
