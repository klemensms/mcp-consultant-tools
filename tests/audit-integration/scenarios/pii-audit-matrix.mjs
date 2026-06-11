/**
 * Task 37 — PII × audit configuration matrix.
 *
 * For each PII configuration × representative tool, spawn pp-data with
 * MCP_AUDIT_LEVEL=full, run the tool against a known-PII fixture record,
 * read the resulting audit JSONL, and:
 *
 *  1. Assert chain integrity per cell.
 *  2. Sweep for known-PII fixture strings across all records.
 *  3. Capture per-cell redaction report (input + output).
 *  4. Hard-fail the scenario if the full-stack ("all-defaults") config
 *     leakage diverges from EXPECTED_HARD_FAIL_LEAKAGE (currently 2:
 *     both from Gap 1 — documented as operator responsibility, NOT
 *     patched. Gap 3 was resolved on 2026-05-04 — see
 *     docs/programmes/pii-and-audit/pending/known-gaps.md). Any
 *     divergence — fewer or more — is treated as a regression and must
 *     be explicitly acknowledged by updating the constant in the same
 *     commit. Other configs are descriptive — leakage profile is
 *     reported but does not fail the scenario, since a single-layer
 *     config is expected to leave some categories uncovered.
 *
 * After all cells complete, write matrix-report.json + matrix-report.md
 * to the scenario output dir.
 */
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  setEngagement,
  queryRecords,
  countRecords,
  getRecord,
  updateRecord,
  executeAction,
} from '../harness/client.mjs';
import { startPpDataClient } from '../harness/spawn.mjs';
import { createPiiFixture, KNOWN_PII_STRINGS } from '../fixtures/pii-corpus.mjs';
import { readAuditDir } from '../assert/jsonl.mjs';
import { walkChain } from '../assert/chain.mjs';
import { sweepForPii } from '../assert/leakage.mjs';

const SHARED_FIXTURE_LABEL = 'matrix-shared';

// -------------------- Configurations --------------------

/**
 * Returns env overrides for a given config. Some configs need a JSON config
 * file written to disk (for layer toggles); the function returns extra
 * MCP_AUDIT_PATH-relative file path to write.
 */
function configEnvBuilder(name, configDir) {
  const audit = {
    MCP_AUDIT_LEVEL: 'full',
    MCP_AUDIT_OPERATOR: 'matrix@test.local',
  };
  switch (name) {
    case 'no-protection':
      return {
        env: {
          MCP_ENVIRONMENT_TYPE: 'dev',
          PII_PROTECTION: 'false',
          ...audit,
        },
      };
    case 'all-defaults':
      return {
        env: {
          MCP_ENVIRONMENT_TYPE: 'uat',
          PII_PROTECTION: 'true',
          ...audit,
        },
      };
    case 'l1-only':
      return {
        env: {
          MCP_ENVIRONMENT_TYPE: 'uat',
          PII_CONFIG_PATH: path.join(
            configDir,
            'l1-only.json',
          ),
          ...audit,
        },
        configFile: {
          path: 'l1-only.json',
          content: { enabled: true, layers: { l1: true, l2: false, l3: false, l4: false } },
        },
      };
    case 'l2-only':
      return {
        env: {
          MCP_ENVIRONMENT_TYPE: 'uat',
          PII_CONFIG_PATH: path.join(
            configDir,
            'l2-only.json',
          ),
          ...audit,
        },
        configFile: {
          path: 'l2-only.json',
          content: { enabled: true, layers: { l1: false, l2: true, l3: false, l4: false } },
        },
      };
    case 'l3-only':
      return {
        env: {
          MCP_ENVIRONMENT_TYPE: 'uat',
          PII_CONFIG_PATH: path.join(
            configDir,
            'l3-only.json',
          ),
          ...audit,
        },
        configFile: {
          path: 'l3-only.json',
          content: { enabled: true, layers: { l1: false, l2: false, l3: true, l4: false } },
        },
      };
    case 'observe-mode':
      return {
        env: {
          MCP_ENVIRONMENT_TYPE: 'uat',
          PII_PROTECTION: 'true',
          PII_OBSERVE_MODE: 'true',
          ...audit,
        },
      };
    case 'singular-only-contact':
      return {
        env: {
          MCP_ENVIRONMENT_TYPE: 'uat',
          PII_CONFIG_PATH: path.join(configDir, 'singular-only-contact.json'),
          ...audit,
        },
        configFile: {
          path: 'singular-only-contact.json',
          content: {
            enabled: true,
            fieldRules: {
              contact: {
                excludeFromSelect: [],
                redactInResponse: [
                  'firstname',
                  'lastname',
                  'fullname',
                  'emailaddress1',
                  'mobilephone',
                  'telephone1',
                  'birthdate',
                  'address1_line1',
                  'address1_city',
                  'address1_postalcode',
                ],
              },
            },
          },
        },
      };
    case 'plural-only-contacts':
      return {
        env: {
          MCP_ENVIRONMENT_TYPE: 'uat',
          PII_CONFIG_PATH: path.join(configDir, 'plural-only-contacts.json'),
          ...audit,
        },
        configFile: {
          path: 'plural-only-contacts.json',
          content: {
            enabled: true,
            fieldRules: {
              contacts: {
                excludeFromSelect: [],
                redactInResponse: [
                  'firstname',
                  'lastname',
                  'fullname',
                  'emailaddress1',
                  'mobilephone',
                  'telephone1',
                  'birthdate',
                  'address1_line1',
                  'address1_city',
                  'address1_postalcode',
                ],
              },
            },
          },
        },
      };
    default:
      throw new Error(`Unknown config: ${name}`);
  }
}

const CONFIGS = [
  { name: 'no-protection', expectedRedaction: 'NONE — leakage expected baseline' },
  { name: 'all-defaults', expectedRedaction: 'L1+L2+L3+L4 — should fully redact known PII' },
  { name: 'l1-only', expectedRedaction: 'L1 only (excludeFromSelect) — affects $select queries; response unredacted' },
  { name: 'l2-only', expectedRedaction: 'L2 only (field rules) — name/email/phone fields redacted; description not in field rules' },
  { name: 'l3-only', expectedRedaction: 'L3 only (regex) — emails/phones/dob globally redacted; names + addresses untouched' },
  { name: 'observe-mode', expectedRedaction: 'Counts redactions but does not transform — leakage expected' },
  { name: 'singular-only-contact', expectedRedaction: 'L1+L2+L3+L4 with per-tenant config keyed under SINGULAR contact only — must match plural-only-contacts' },
  { name: 'plural-only-contacts',  expectedRedaction: 'L1+L2+L3+L4 with per-tenant config keyed under PLURAL contacts only — must match singular-only-contact' },
];

// HARD-FAIL CONFIG: the canonical "production safe" stack. We assert that
// leakage in this config matches the *expected baseline* below. Any divergence
// (more OR fewer leaks) is a regression — fewer leaks means a quietly-changed
// redaction behaviour that the author should explicitly acknowledge.
const HARD_FAIL_CONFIG = 'all-defaults';

// Expected leakage in the all-defaults config.
//
// This is currently 2 — composed of:
//   • 2 leaks from filter-inlined PII in `query-records` (firstname appears in
//     `tool.params.filter` and `payload.input.filter`). Gap 1 is intentionally
//     documented as operator responsibility, NOT patched — see
//     docs/programmes/pii-and-audit/pending/known-gaps.md "Gap 1 — Resolved as".
//
// Gap 3 (3 leaks via `*@OData.Community.Display.V1.FormattedValue` annotations
// on custom lookups) was resolved on 2026-05-04 by adding default-on
// keyword-based redaction in `packages/core/src/pii/field-redaction.ts`
// (Option A + C combined). Bringing those three leaks to zero dropped the
// expected baseline from 5 to 2.
const EXPECTED_HARD_FAIL_LEAKAGE = 2;

// -------------------- Tools --------------------

function buildToolSpecs(fixture) {
  return [
    {
      name: 'query-records',
      // PII in the filter param — exercises L2/L3 on input redaction
      invoke: (client) =>
        queryRecords(client, {
          entityNamePlural: 'contacts',
          filter: `firstname eq '${KNOWN_PII_STRINGS.firstname}'`,
          maxRecords: 1,
        }),
    },
    {
      name: 'count-records',
      invoke: (client) =>
        countRecords(client, {
          entityNamePlural: 'contacts',
          filter: `emailaddress1 eq '${KNOWN_PII_STRINGS.emailaddress1}'`,
        }),
    },
    {
      name: 'get-record',
      // No PII in input args, but response carries PII (output redaction path)
      invoke: (client) =>
        getRecord(client, {
          entityNamePlural: 'contacts',
          recordId: fixture.id,
        }),
    },
    {
      name: 'update-record',
      // PII in update payload body
      invoke: (client) =>
        updateRecord(client, {
          entityNamePlural: 'contacts',
          recordId: fixture.id,
          data: {
            description: `${KNOWN_PII_STRINGS.description} — updated ${Date.now()}`,
          },
        }),
    },
    {
      name: 'execute-action',
      // WhoAmI is a standard Dataverse action with no PII — exercises the
      // execute-action audit code path without any redaction expectations.
      invoke: (client) =>
        executeAction(client, {
          actionName: 'WhoAmI',
          parameters: {},
        }),
    },
  ];
}

// -------------------- Cell runner --------------------

async function runCell(ctx, configName, configDir, toolSpec, fixture, cellOutputRoot) {
  const cellName = `${configName}_${toolSpec.name}`;
  const cellAuditPath = path.join(cellOutputRoot, cellName);
  const auditClient = `MATRIX_${configName.replace(/-/g, '_')}_${toolSpec.name.replace(/-/g, '_')}`;
  await mkdir(cellAuditPath, { recursive: true });

  const builder = configEnvBuilder(configName, configDir);
  const env = {
    ...builder.env,
    MCP_AUDIT_CLIENT: auditClient,
    MCP_AUDIT_PATH: cellAuditPath,
  };

  let session;
  let toolError;
  try {
    session = await startPpDataClient({ env });
    await setEngagement(session.client, [`MATRIX-${configName.toUpperCase()}`], `${configName} × ${toolSpec.name}`);
    const result = await toolSpec.invoke(session.client);
    if (result?.isError) {
      toolError = result.content?.[0]?.text ?? 'isError without text';
    }
  } catch (err) {
    toolError = err.message;
  } finally {
    if (session) await session.close().catch(() => {});
  }

  const records = await readAuditDir(path.join(cellAuditPath, auditClient));
  const chainResult = walkChain(records);
  const sweep = sweepForPii(records, [fixture]);

  // Pull redaction reports from the most recent tool record (skip set-engagement at seq 1)
  const toolRecord = records.find((r) => r.tool?.name === toolSpec.name);

  return {
    config: configName,
    tool: toolSpec.name,
    cellAuditPath,
    auditClient,
    recordsTotal: records.length,
    chain: chainResult,
    leakageCount: sweep.leaked.length,
    leakage: sweep.leaked,
    redaction: toolRecord?.redaction ?? null,
    toolResultSuccess: toolRecord?.result?.success ?? null,
    toolResultError: toolRecord?.result?.error ?? null,
    toolError,
  };
}

// -------------------- Reporting --------------------

function buildReportMd(cells, fixture, headline) {
  const lines = [];
  lines.push('# PII × Audit Configuration Matrix Report');
  lines.push('');
  lines.push(`**Run timestamp:** ${new Date().toISOString()}`);
  lines.push(`**Fixture:** contact ${fixture.id} (${Object.keys(fixture.knownStrings).length} known-PII fields)`);
  lines.push(`**Audit level:** full (payload.input + payload.output captured)`);
  lines.push(`**Hard-fail config:** \`${HARD_FAIL_CONFIG}\` — ${headline.hardFailVerdict}`);
  lines.push('');
  lines.push('## Headline');
  lines.push('');
  lines.push(`- Cells run: ${cells.length}`);
  lines.push(`- Cells with audit chain integrity OK: ${cells.filter((c) => c.chain.ok).length}`);
  lines.push(`- Cells where any known-PII string leaked: ${cells.filter((c) => c.leakageCount > 0).length}`);
  lines.push('');
  lines.push('## Per-cell results');
  lines.push('');
  lines.push('| Config | Tool | Records | Chain | Leakage | Input redacted | Output redacted | Tool ok |');
  lines.push('|--------|------|---------|-------|---------|----------------|-----------------|---------|');
  for (const c of cells) {
    const inRed = c.redaction?.input?.totalRedactions ?? 0;
    const outRed = c.redaction?.output?.totalRedactions ?? 0;
    const chainTag = c.chain.ok ? 'ok' : `BROKEN@${c.chain.brokenAt}`;
    const toolOk = c.toolError ? '❌ ' + c.toolError.slice(0, 40) : c.toolResultSuccess === true ? 'ok' : c.toolResultSuccess === false ? `fail: ${c.toolResultError?.slice(0, 30) ?? ''}` : '?';
    lines.push(`| ${c.config} | ${c.tool} | ${c.recordsTotal} | ${chainTag} | ${c.leakageCount} | ${inRed} | ${outRed} | ${toolOk} |`);
  }
  lines.push('');
  lines.push('## Per-config notes');
  lines.push('');
  for (const cfg of CONFIGS) {
    lines.push(`### \`${cfg.name}\``);
    lines.push('');
    lines.push(`**Spec:** ${cfg.expectedRedaction}`);
    const cellSet = cells.filter((c) => c.config === cfg.name);
    const totalLeakage = cellSet.reduce((sum, c) => sum + c.leakageCount, 0);
    lines.push(`**Total leakage across ${cellSet.length} cells:** ${totalLeakage} occurrences`);
    if (totalLeakage > 0) {
      const sample = cellSet
        .flatMap((c) => c.leakage.map((l) => `${c.tool}: ${l.fixturePath} → ${l.foundIn}`))
        .slice(0, 5);
      lines.push('**Sample leaked fields:**');
      for (const s of sample) lines.push(`- ${s}`);
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

// -------------------- Scenario entry point --------------------

export default async function piiAuditMatrix(ctx) {
  ctx.log('info', 'creating fixture on MCPTest…');
  const fixtureSession = await startPpDataClient({
    env: {
      MCP_ENVIRONMENT_TYPE: 'dev',
      PII_PROTECTION: 'false',
      MCP_AUDIT_LEVEL: 'off',
    },
  });
  let fixture;
  try {
    fixture = await createPiiFixture(fixtureSession.client, SHARED_FIXTURE_LABEL);
    ctx.fixtureIds.push({ entitySetName: 'contacts', id: fixture.id, label: SHARED_FIXTURE_LABEL });
    ctx.log('info', `fixture id=${fixture.id}`);
  } finally {
    await fixtureSession.close().catch(() => {});
  }

  // Write per-config JSON files for layer toggles
  const configDir = path.join(ctx.outputDir, 'pii-configs');
  await mkdir(configDir, { recursive: true });
  for (const cfg of CONFIGS) {
    const built = configEnvBuilder(cfg.name, configDir);
    if (built.configFile) {
      await writeFile(
        path.join(configDir, built.configFile.path),
        JSON.stringify(built.configFile.content, null, 2),
      );
    }
  }

  const tools = buildToolSpecs(fixture);
  const cellOutputRoot = path.join(ctx.outputDir, 'cells');
  await mkdir(cellOutputRoot, { recursive: true });

  const cells = [];
  let cellIdx = 0;
  for (const cfg of CONFIGS) {
    for (const tool of tools) {
      cellIdx++;
      ctx.log('info', `[${cellIdx}/${CONFIGS.length * tools.length}] ${cfg.name} × ${tool.name}…`);
      try {
        const result = await runCell(ctx, cfg.name, configDir, tool, fixture, cellOutputRoot);
        cells.push(result);
        const tag = result.chain.ok ? 'ok' : `chain BROKEN@${result.chain.brokenAt}`;
        ctx.log(
          'info',
          `   → records=${result.recordsTotal} chain=${tag} leakage=${result.leakageCount}` +
            ` inRed=${result.redaction?.input?.totalRedactions ?? 0}` +
            ` outRed=${result.redaction?.output?.totalRedactions ?? 0}`,
        );
      } catch (err) {
        ctx.log('error', `   FAIL: ${err.message}`);
        cells.push({
          config: cfg.name,
          tool: tool.name,
          recordsTotal: 0,
          chain: { ok: false, error: err.message },
          leakageCount: 0,
          leakage: [],
          redaction: null,
          toolError: err.message,
        });
      }
    }
  }

  // Build reports
  const hardFailCells = cells.filter((c) => c.config === HARD_FAIL_CONFIG);
  const hardFailLeakage = hardFailCells.reduce((sum, c) => sum + c.leakageCount, 0);
  const headline = {
    hardFailVerdict:
      hardFailLeakage === EXPECTED_HARD_FAIL_LEAKAGE
        ? `✓ leakage matches expected baseline (${EXPECTED_HARD_FAIL_LEAKAGE}) across ${hardFailCells.length} cells — Gap 1 (2, documented; Gap 3 resolved 2026-05-04)`
        : `✗ leakage ${hardFailLeakage} ≠ expected ${EXPECTED_HARD_FAIL_LEAKAGE} across ${hardFailCells.length} cells — REGRESSION (any divergence is unexpected; investigate)`,
  };

  const reportMd = buildReportMd(cells, fixture, headline);
  const reportJson = {
    runAt: new Date().toISOString(),
    fixture: { id: fixture.id, knownStrings: fixture.knownStrings },
    configs: CONFIGS,
    cells,
    summary: {
      cellCount: cells.length,
      chainOkCount: cells.filter((c) => c.chain.ok).length,
      cellsWithLeakage: cells.filter((c) => c.leakageCount > 0).length,
      hardFailLeakage,
    },
  };

  await writeFile(path.join(ctx.outputDir, 'matrix-report.md'), reportMd);
  await writeFile(path.join(ctx.outputDir, 'matrix-report.json'), JSON.stringify(reportJson, null, 2));
  ctx.log('info', `wrote matrix-report.md + matrix-report.json to ${ctx.outputDir}`);

  // Hard assertions
  for (const c of cells) {
    if (!c.chain.ok && !c.toolError) {
      throw new Error(`chain integrity broken in ${c.config} × ${c.tool}: ${JSON.stringify(c.chain)}`);
    }
  }
  if (hardFailLeakage !== EXPECTED_HARD_FAIL_LEAKAGE) {
    const sample = hardFailCells
      .flatMap((c) => c.leakage.map((l) => `${c.tool}: ${l.fixturePath} → ${l.foundIn}`))
      .slice(0, 10);
    throw new Error(
      `[REGRESSION] config "${HARD_FAIL_CONFIG}" leaked ${hardFailLeakage} known-PII strings; ` +
        `expected baseline is ${EXPECTED_HARD_FAIL_LEAKAGE} (Gap 1 documented; Gap 3 resolved 2026-05-04). ` +
        `Any divergence — including fewer leaks — must be explicitly acknowledged: ` +
        `update EXPECTED_HARD_FAIL_LEAKAGE in the same commit that changes redaction behaviour.\n  ` +
        sample.join('\n  '),
    );
  }
  ctx.log(
    'info',
    `✓ ${HARD_FAIL_CONFIG} matches expected baseline (${EXPECTED_HARD_FAIL_LEAKAGE} leaks) across ${hardFailCells.length} cells — Gap 1 documented; Gap 3 resolved 2026-05-04`,
  );

  // Parity check: singular-only-contact and plural-only-contacts must produce
  // identical leak counts per tool. The loader's key-expansion makes both
  // keys resolve to the same rule; this is the matrix-level proof. If a future
  // change to the loader breaks expansion in either direction, this fires.
  const singularCells = cells.filter((c) => c.config === 'singular-only-contact');
  const pluralCells = cells.filter((c) => c.config === 'plural-only-contacts');
  if (singularCells.length === 0 || pluralCells.length === 0) {
    throw new Error(
      `[PARITY-FAIL] expected both singular-only-contact and plural-only-contacts to produce cells; got singular=${singularCells.length}, plural=${pluralCells.length} — check CONFIGS entries`,
    );
  }
  const parityFailures = [];
  for (const sCell of singularCells) {
    const pCell = pluralCells.find((c) => c.tool === sCell.tool);
    if (!pCell) {
      parityFailures.push(
        `Tool '${sCell.tool}': singular cell present, plural cell missing`,
      );
      continue;
    }
    if (sCell.leakageCount !== pCell.leakageCount) {
      parityFailures.push(
        `Tool '${sCell.tool}': singular-only=${sCell.leakageCount}, plural-only=${pCell.leakageCount} — must be equal`,
      );
    }
  }
  for (const pCell of pluralCells) {
    if (!singularCells.find((c) => c.tool === pCell.tool)) {
      parityFailures.push(
        `Tool '${pCell.tool}': plural cell present, singular cell missing`,
      );
    }
  }
  if (parityFailures.length > 0) {
    throw new Error(
      `[PARITY-FAIL] singular-only-contact / plural-only-contacts leak counts diverge — loader expansion is broken:\n  ${parityFailures.join('\n  ')}`,
    );
  }
  ctx.log(
    'info',
    `✓ singular-only-contact / plural-only-contacts parity OK across ${singularCells.length} tools`,
  );
}
