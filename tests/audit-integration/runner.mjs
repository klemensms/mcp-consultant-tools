#!/usr/bin/env node
/**
 * Scenario runner for audit-integration test pass.
 *
 * Usage:
 *   node tests/audit-integration/runner.mjs <scenario-name>
 *   node tests/audit-integration/runner.mjs --all
 *
 * Each scenario is a module under scenarios/<name>.mjs that default-exports
 * an async function taking ctx = {auditPath, outputDir, spawn, fixtureIds, log}.
 *
 * The runner:
 *   - creates output/<name>/{audit-out,logs} per scenario
 *   - passes auditPath = output/<name>/audit-out to the scenario
 *   - on completion (or failure), tears down: kills any subprocess, deletes
 *     any MCPTest fixture records the scenario registered in ctx.fixtureIds
 *   - writes output/<name>/result.json with pass/fail + duration + error
 */
import { mkdir, rm, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPpDataClient } from './harness/spawn.mjs';
import { deleteRecord } from './harness/client.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = path.join(HERE, 'output');
const SCENARIOS_DIR = path.join(HERE, 'scenarios');

function tsLabel() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function listScenarios() {
  const entries = await readdir(SCENARIOS_DIR);
  return entries
    .filter((e) => e.endsWith('.mjs') && !e.startsWith('_'))
    .map((e) => e.replace(/\.mjs$/, ''));
}

async function runOne(name) {
  const scenarioPath = path.join(SCENARIOS_DIR, `${name}.mjs`);
  let scenario;
  try {
    scenario = await import(scenarioPath);
  } catch (err) {
    console.error(`[runner] FATAL: cannot import scenarios/${name}.mjs:`, err.message);
    return { name, ok: false, error: 'import-failed: ' + err.message };
  }
  if (typeof scenario.default !== 'function') {
    return { name, ok: false, error: `scenarios/${name}.mjs has no default export function` };
  }

  const runId = `${name}-${tsLabel()}`;
  const outputDir = path.join(OUTPUT_ROOT, name, runId);
  const auditPath = path.join(outputDir, 'audit-out');
  await mkdir(auditPath, { recursive: true });

  const fixtureIds = []; // [{entitySetName, id, label?}]
  const subprocesses = []; // [{close: () => Promise}]
  const logs = [];
  const log = (level, ...args) => {
    const line = `[${new Date().toISOString()}] ${level} ${args.map(String).join(' ')}`;
    logs.push(line);
    console.error(line);
  };

  const ctx = {
    name,
    auditPath,
    outputDir,
    fixtureIds,
    subprocesses,
    log,
    startClient: async (envOverrides) => {
      const session = await startPpDataClient({ env: envOverrides });
      subprocesses.push(session);
      return session;
    },
  };

  const start = Date.now();
  let result;
  try {
    log('info', `→ scenario start: ${name}`);
    await scenario.default(ctx);
    log('info', `← scenario pass: ${name} (${Date.now() - start}ms)`);
    result = { name, runId, ok: true, durationMs: Date.now() - start };
  } catch (err) {
    log('error', `× scenario fail: ${name} — ${err.message}`);
    result = {
      name,
      runId,
      ok: false,
      durationMs: Date.now() - start,
      error: err.message,
      stack: err.stack,
    };
  }

  // Teardown subprocesses
  for (const sp of subprocesses) {
    try {
      await sp.close();
    } catch (err) {
      log('warn', `subprocess close failed: ${err.message}`);
    }
  }

  // Teardown MCPTest fixtures (best-effort)
  if (fixtureIds.length > 0) {
    log('info', `tearing down ${fixtureIds.length} MCPTest fixtures…`);
    let cleanup;
    try {
      cleanup = await startPpDataClient({
        env: {
          MCP_ENVIRONMENT_TYPE: 'dev',
          PII_PROTECTION: 'false',
          MCP_AUDIT_LEVEL: 'off',
        },
      });
      for (const f of fixtureIds) {
        try {
          await deleteRecord(cleanup.client, {
            entityNamePlural: f.entitySetName,
            recordId: f.id,
            confirm: true,
          });
          log('info', `  - deleted ${f.entitySetName}(${f.id})${f.label ? ` [${f.label}]` : ''}`);
        } catch (err) {
          log('warn', `  - delete failed ${f.entitySetName}(${f.id}): ${err.message}`);
        }
      }
    } catch (err) {
      log('warn', `cleanup client failed: ${err.message}`);
    } finally {
      if (cleanup) {
        await cleanup.close().catch(() => {});
      }
    }
  }

  // Persist result + logs
  await writeFile(path.join(outputDir, 'result.json'), JSON.stringify(result, null, 2));
  await writeFile(path.join(outputDir, 'log.txt'), logs.join('\n') + '\n');
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node tests/audit-integration/runner.mjs <name>|--all');
    process.exit(1);
  }

  await mkdir(OUTPUT_ROOT, { recursive: true });

  let names;
  if (args[0] === '--all') {
    names = await listScenarios();
    names.sort();
  } else {
    names = args;
  }

  console.error(`[runner] running ${names.length} scenario(s): ${names.join(', ')}`);
  const results = [];
  for (const n of names) {
    results.push(await runOne(n));
  }

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.error(`\n[runner] SUMMARY: ${passed} passed, ${failed} failed (of ${results.length})`);
  for (const r of results) {
    const tag = r.ok ? '✓' : '✗';
    console.error(`  ${tag} ${r.name} ${r.durationMs ? `(${r.durationMs}ms)` : ''}${r.error ? ` — ${r.error}` : ''}`);
  }

  await writeFile(
    path.join(OUTPUT_ROOT, `summary-${tsLabel()}.json`),
    JSON.stringify(results, null, 2),
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[runner] FATAL:', err);
  process.exit(2);
});
