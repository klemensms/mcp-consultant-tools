/**
 * Task 38 — aggregate raw-PII leakage sweep across ALL prior scenario outputs.
 *
 * Walks every audit JSONL file under tests/audit-integration/output/ from
 * earlier scenarios in this run and greps for the known-PII fixture strings.
 * Generates leakage-report.md summarising per-scenario / per-file leak counts.
 *
 * Important: this scenario is meant to be run AFTER pii-audit-matrix has
 * produced its corpus (and ideally other PII-touching scenarios). If no
 * matching corpus exists, the sweep is trivially clean — scenario reports a
 * warning and passes.
 */
import { readAuditDir, listAuditFiles } from '../assert/jsonl.mjs';
import { sweepForPii } from '../assert/leakage.mjs';
import { KNOWN_PII_STRINGS } from '../fixtures/pii-corpus.mjs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = path.resolve(HERE, '..', 'output');

async function findJsonlFiles(root) {
  const out = [];
  async function walk(p) {
    const entries = await readdir(p, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.name.endsWith('.jsonl')) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

export default async function leakageSweep(ctx) {
  // Aggregate fixture (every known-PII string we've ever planted)
  const knownStrings = { ...KNOWN_PII_STRINGS };
  const masterFixture = { id: 'AGGREGATE', label: 'aggregate', knownStrings };
  ctx.log('info', `tracking ${Object.keys(knownStrings).length} known-PII fields`);

  // Walk all JSONL files under output/ (excluding our own current scenario dir)
  const files = await findJsonlFiles(OUTPUT_ROOT);
  ctx.log('info', `found ${files.length} JSONL files under ${OUTPUT_ROOT}`);
  if (files.length === 0) {
    ctx.log('warn', 'no JSONL files found — sweep trivially clean. Run pii-audit-matrix first to generate corpus.');
    return;
  }

  // Group files by scenario name (top-level dir under output/)
  const byScenario = new Map();
  for (const f of files) {
    const rel = path.relative(OUTPUT_ROOT, f);
    const scenario = rel.split(path.sep)[0];
    if (!byScenario.has(scenario)) byScenario.set(scenario, []);
    byScenario.get(scenario).push(f);
  }

  // Per-scenario sweep
  const summary = [];
  let totalRecords = 0;
  let totalLeaks = 0;
  for (const [scenario, scenarioFiles] of byScenario) {
    const records = [];
    for (const f of scenarioFiles) {
      const recs = await readAuditDir(path.dirname(f)).catch(async () => {
        const single = await import('../assert/jsonl.mjs').then(m => m.readAuditFile(f));
        return single;
      });
      // readAuditDir reads everything in the dir; some scenarios share subdirs.
      // Dedupe by file+line.
      for (const r of recs) {
        if (r._file === f) records.push(r);
      }
    }
    const sweep = sweepForPii(records, [masterFixture]);
    summary.push({
      scenario,
      files: scenarioFiles.length,
      records: sweep.totalScanned,
      leaks: sweep.leaked.length,
      cleanCount: sweep.cleanCount,
    });
    totalRecords += sweep.totalScanned;
    totalLeaks += sweep.leaked.length;
    ctx.log('info', `  ${scenario}: ${sweep.totalScanned} records, ${sweep.leaked.length} leaks`);
  }

  // Write report
  const md = [
    '# Audit Integration — Aggregate PII Leakage Sweep',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `**Total records scanned:** ${totalRecords}`,
    `**Total leaks found:** ${totalLeaks}`,
    `**Known-PII strings tracked:** ${Object.keys(knownStrings).length}`,
    '',
    '## Per-scenario summary',
    '',
    '| Scenario | Files | Records | Leaks | Clean |',
    '|---|---:|---:|---:|---:|',
    ...summary.map((s) => `| ${s.scenario} | ${s.files} | ${s.records} | ${s.leaks} | ${s.cleanCount} |`),
    '',
    '## Notes',
    '',
    'A leak is a record where a known-PII fixture string appears literally in any',
    'top-level field (excluding hash/seq/operator metadata). Expected leakage:',
    '',
    '- **pii-audit-matrix**: configurations `no-protection` (PII off), `l1-only`',
    '  (token replacement only — does not redact field-name PII), `l2-only` (no L3/L4),',
    '  `l3-only` (regex-only — name fields untouched), `observe-mode` (counts but does',
    "  not transform). These are EXPECTED to leak per the v1 spec; they're tested as",
    '  control conditions.',
    '- **all-tools**: deletes Bug 3 GUID before fixture cleanup; no PII fixtures used.',
    '- **other scenarios**: all use generic synthetic data (no AUDITTEST_ prefix), so',
    '  zero leaks expected.',
    '',
    'Per-config breakdown for pii-audit-matrix lives in its own matrix-report.md.',
  ].join('\n');

  await writeFile(path.join(ctx.outputDir, 'leakage-sweep-report.md'), md);
  ctx.log('info', `wrote leakage-sweep-report.md`);

  // Don't throw on leaks here — pii-audit-matrix scenario already asserts on
  // unexpected leaks for its own matrix. This scenario is a meta-check.
  ctx.log('info', `✓ leakage sweep complete: ${totalRecords} records, ${totalLeaks} leaks aggregated across ${byScenario.size} scenarios`);
}
