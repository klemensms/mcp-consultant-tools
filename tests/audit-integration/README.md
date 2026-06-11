# Audit Integration Tests

End-to-end test suite for the Phase A PII audit logging subsystem (`@mcp-consultant-tools/core` audit module + `@mcp-consultant-tools/powerplatform-data` tool wrappers + `@mcp-consultant-tools/audit-cli`). Drives the real MCP server against `mcptests.crm4.dynamics.com` via stdio and asserts on the resulting JSONL audit records.

## Why this exists

Phase A v1 shipped with 53 unit tests covering individual modules (config loader, chain helpers, rotation, storage, session store, pipeline, emit). Unit tests can't catch:
- Integration-level behaviour (does pp-data actually wire the wrapper?)
- Schema mismatches between tool defs and audit emit
- Real PII leakage in the live response → audit JSONL pipeline
- Tamper-evidence working against records produced by the real pipeline (not synthetic JSONL)
- Refuse-to-start matrix at process level (server actually exits 1)
- Refuse-to-execute (the engagement-unset gate)
- Cross-file rotation continuity

Three real Phase A bugs were caught by this suite during its development:

| Bug | Detection | Fix commit |
|---|---|---|
| Refuse-to-start matrix items D + E (unwritable path / corrupted chain state) only fired on first emit, not at startup | refuse-to-start scenario | `96d7728` |
| **Refuse-to-execute on engagement-unset never enforced — silent audit leak** | refuse-to-execute scenario | `6531ded` |
| Address fields not in default `redactInResponse` for contact/account/lead | pii-audit-matrix scenario | `7364a8d` |

Two structural gaps remain (require design calls — separate from this test pass):
- **Gap 1 (filter-param leak):** `query-records({filter: "firstname eq 'Maria'"})` records `'Maria'` raw in `tool.params.filter` even at full PII protection.
- **Gap 3 (lookup `@OData.Community.Display.V1.FormattedValue` annotation leak):** Custom lookups carry PII via formatted-value annotations that bypass field-name redaction.

## Prerequisites

- `.mcp.json` at repo root contains a working `MCPTest-pp-data` server entry with `POWERPLATFORM_*` credentials. The harness reads creds from this file (gitignored). Without it, every scenario fails at spawn time.
- `npm run build` has run at least once — the harness spawns `packages/powerplatform-data/build/index.js` directly, not via npx.
- Node ≥ 16 (matches package engines).

## Running scenarios

From repo root:

```bash
node tests/audit-integration/runner.mjs <scenario-name>
node tests/audit-integration/runner.mjs --all
```

Scenario names match files under `scenarios/` (without the `.mjs` extension). Files starting with `_` (e.g. `_smoke.mjs`, `_template.mjs`) are utilities and are SKIPPED by `--all`.

Available scenarios:

| Scenario | What it proves |
|---|---|
| `_smoke` | Foundation works: pp-data spawns, set-engagement + query produces 2 records, chain ok |
| `refuse-to-start` | All 5 refuse-to-start matrix cases fire at startup with byte-exact stderr |
| `refuse-to-execute` | Engagement-unset → tool refuses + clear error; recovery via `set-audit-engagement` |
| `tamper-detection` | 5 corruption modes (modify field / delete record / reorder / truncate / modify prevHash) all caught by `walkChain` AND `mcp-audit-cli verify` |
| `quarantine` | Tamper → `mcp-audit-cli quarantine` → sentinel record at original path → fresh chain anchors on sentinel hash → directory verify ok (broken file out-of-band by design) |
| `rotation` | `MCP_AUDIT_ROTATION=size:1KB` produces multiple files, hash chain spans across files, daily-mode filename matches `YYYY-MM-DD.jsonl` |
| `context-switch` | Engagement A → 2 calls → engagement B → 2 calls; `tool.contextChange` carries `{from: A, to: B}`; chain integrity preserved |
| `failed-calls` | Tools that fail (invalid OData / non-existent ID / malformed GUID / unknown action / delete-non-existent) still emit audit records with `result.success: false` and populated `result.error` |
| `all-tools` | Every one of the 14 audit-emitting tool surfaces produces exactly 1 record per call; chain integrity preserved across all 14 |
| `pii-audit-matrix` | 6 PII configurations × 5 representative tools = 30 cells. Per-cell: redaction reports correct, leakage detected/expected per config; aggregate `matrix-report.md` written |
| `leakage-sweep` | Aggregate raw-PII leakage check across all prior scenarios' JSONL output. Generates `leakage-sweep-report.md` |
| `search-cli` | `mcp-audit-cli search` filter × format matrix: 12 filter cases (--client / --operator / --tool / --workItem / --entity / --since / --until / combinations) × 3 formats (table / json / csv) |

## Output

Per scenario run, output lands in `output/<scenario>/<runId>/`:

- `audit-out/` — the per-scenario audit base directory (passed as `MCP_AUDIT_PATH` to spawned pp-data instances). All JSONL files live under this.
- `result.json` — pass/fail status + duration + error stack on failure
- `log.txt` — runner + scenario log lines
- For `pii-audit-matrix`: `matrix-report.md` + `matrix-report.json` with per-cell redaction reports
- For `leakage-sweep`: `leakage-sweep-report.md` summarising leak counts per scenario

`output/` is gitignored.

## MCPTest fixture cleanup

Scenarios that create MCPTest contacts (`pii-audit-matrix`, `all-tools`) push their fixture IDs into `ctx.fixtureIds`. The runner's teardown phase deletes every fixture in that list — including on scenario failure. If a scenario crashes hard (process killed mid-run), orphan fixtures may remain. To clean up manually:

```js
// query for AUDITTEST_ contacts
mcp__MCPTest-pp-data__query-records({
  entityNamePlural: 'contacts',
  filter: "startswith(firstname, 'AUDITTEST_')",
  maxRecords: 50,
})
// then delete each
```

## Test architecture

```
tests/audit-integration/
├── README.md             ← this file
├── runner.mjs            ← CLI entry point, per-scenario isolation, fixture teardown
├── harness/              ← reusable subprocess harness
│   ├── creds.mjs         ← read MCPTest creds from repo-root .mcp.json
│   ├── spawn.mjs         ← startPpDataClient, spawnAndCaptureExit
│   ├── client.mjs        ← typed callTool wrappers
│   ├── __smoke__.mjs     ← bootstrap test: harness can drive pp-data
│   └── __smoke_audit__.mjs
├── assert/               ← assertion library
│   ├── jsonl.mjs         ← readAuditFile, readAuditDir, listAuditFiles
│   ├── chain.mjs         ← walkChain (matches mcp-audit-cli verify logic)
│   ├── leakage.mjs       ← sweepForPii, assertNoLeakage
│   └── __tests__.mjs     ← unit tests for the assertion lib (10 cases, no MCPTest)
├── fixtures/
│   ├── pii-corpus.mjs    ← KNOWN_PII_STRINGS, createPiiFixture, deletePiiFixture
│   └── __smoke__.mjs     ← bootstrap test: fixture create+delete works
├── scenarios/            ← every test scenario lives here
│   ├── _template.mjs     ← copy this when adding new scenarios
│   ├── _smoke.mjs
│   ├── refuse-to-start.mjs
│   ├── refuse-to-execute.mjs
│   ├── tamper-detection.mjs
│   ├── quarantine.mjs
│   ├── rotation.mjs
│   ├── context-switch.mjs
│   ├── failed-calls.mjs
│   ├── all-tools.mjs
│   ├── pii-audit-matrix.mjs
│   ├── leakage-sweep.mjs
│   └── search-cli.mjs
└── output/               ← per-run output (gitignored)
```

## Adding a new scenario

1. Copy `scenarios/_template.mjs` to `scenarios/<your-name>.mjs`.
2. Use `ctx.startClient(envOverrides)` to spawn pp-data instances. The runner registers them for teardown.
3. Use `ctx.fixtureIds.push({entitySetName, id, label?})` for any MCPTest records you create. The runner deletes them at teardown.
4. Read the resulting JSONL via `readAuditDir(path.join(ctx.auditPath, '<MCP_AUDIT_CLIENT>'))`.
5. Throw to fail. The runner records the stack trace in `result.json`.
6. Run via `node tests/audit-integration/runner.mjs <your-name>`.

## What this suite is NOT

- **CI-runnable as-is.** Requires live MCPTest creds in `.mcp.json` at repo root. A CI-runnable variant would need a stub Dataverse + an auth-bypass mode in pp-core.
- **A performance test.** Per-scenario runtime is ~2-30 seconds; the matrix scenario is the longest (~25s). No load tests, no concurrency tests.
- **A coverage tool for non-pp-data MCP servers.** Phase A scope is Dataverse only. azure-devops, azure-sql, etc. need their own audit wrapping (Phase C) before this suite would extend.
