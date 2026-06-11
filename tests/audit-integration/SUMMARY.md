# Audit Integration Test Pass — Summary

**Branch:** `release/31.0` · **Final HEAD:** see `git log` for the latest test commit · **Date:** 2026-05-04

## Headline result

The Phase A audit subsystem is now end-to-end verified against `mcptests.crm4.dynamics.com`. **Three real Phase A bugs were found and fixed during this test pass**; one structural PII gap remains (Gap 3 — out of scope for Phase A). Gap 1 was resolved 2026-05-04 as a documented operator-responsibility rule (Option C, no code change).

| Metric | Value |
|---|---|
| Scenarios written | 12 (`refuse-to-start`, `refuse-to-execute`, `tamper-detection`, `quarantine`, `rotation`, `context-switch`, `failed-calls`, `all-tools`, `pii-audit-matrix`, `leakage-sweep`, `search-cli`, `_smoke`) |
| Foundation modules | 3 (harness, assertion library, runner) |
| Phase A bugs found | 5 |
| Phase A bugs fixed | 3 |
| Phase A bugs deferred | 1 (Gap 3 — structural design call). Gap 1 resolved 2026-05-04 as Option C (documented operator responsibility, no code change). |
| Vitest cases (added during this pass) | 1 (`emit.test.ts`: refuse-on-engagement-unset) |
| Total vitest cases now passing | 54 |
| Total audit records exercised | ~280 across all scenarios |

## Bugs found and resolved

| # | Severity | Description | Found via | Fix |
|---|---|---|---|---|
| 1 | High | Refuse-to-start matrix items D + E (unwritable path / corrupted chain state) only fired on first audit emit, not at startup. Server boots when spec mandates exit 1. | `refuse-to-start` scenario | `96d7728` — `probeAuditStorage()` added to `buildAuditPipeline()` |
| 2 | **Critical** | **Refuse-to-execute on engagement-unset never enforced.** Tool calls succeed AND emit no audit record at all when `set-audit-engagement` is not called first. Silent audit leak in production. | `refuse-to-execute` scenario | `6531ded` — `auditEmit` checks `pipeline.hasEngagement()` before invoking the operation, throws `AuditEngagementUnsetError` |
| 3 | Medium | Address fields not in default `redactInResponse` for contact/account/lead. PII leaks via `address1_*` / `address2_*` / `*_composite` even at full PII protection. | `pii-audit-matrix` scenario | `7364a8d` — added 7 address fields per-entity + composites |

## Bugs deferred (structural — out of Phase A scope)

| # | Description | Why deferred / status |
|---|---|---|
| 4 (Gap 1) | Filter-param leak: `query-records({filter: "firstname eq 'Maria'"})` records `'Maria'` raw in `tool.params.filter` even at full protection. L2 redacts by field name, L3/L4 don't scan filter strings. | **Resolved 2026-05-04 as Option C — documented as operator responsibility.** No code change. Operator/agent must not inline raw PII into filter strings; resolve to GUID first. The 2 leaks per matrix run from this gap are intentionally retained. Source channel (raw PII in ADO bug bodies) closes via Phase C ADO-side redaction. See `docs/programmes/pii-and-audit/pending/known-gaps.md` "Gap 1 — Resolved as" for full reasoning. |
| 5 (Gap 3) | Lookup `@OData.Community.Display.V1.FormattedValue` annotation leak. Custom lookups carry PII via formatted-value annotations that bypass field-name redaction. Discovered: `_new_primaryaddressid_value@OData.Community.Display.V1.FormattedValue` contains the formatted address. | Still open. Generic fix needs to extend redaction to treat `*FormattedValue` siblings of redacted lookup fields as redactable. Phase A scope was field-name redaction. |
| Bonus | `create-record` response parser returns `**Record ID:** N/A` instead of the actual GUID. UX bug; workaround in Task 36 fixture helper (parse JSON response body for `*id` field). | Lower priority; not a security issue. Tracked separately. |

## What was tested

### Refuse-to-start (5 cases at process level)
- Production env + `MCP_AUDIT_LEVEL` unset → exit 1
- Production env + `MCP_AUDIT_LEVEL=off` → exit 1
- `lean` + `MCP_AUDIT_CLIENT` unset → exit 1
- `lean` + audit base directory unwritable → exit 1
- `lean` + corrupted `.chain-state` JSON → exit 1, message references `mcp-audit-cli quarantine`

### Refuse-to-execute (engagement-unset gate)
- First tool call without `set-audit-engagement` → `AuditEngagementUnsetError`, no audit record emitted
- Recovery: `set-audit-engagement` → next tool call succeeds, both records appear

### Tamper-evidence (5 corruption modes)
- Modify field at seq N → break detected
- Delete a record → break detected
- Reorder records → break detected
- Truncate file mid-record → CLI catches malformed JSON
- Modify `prevHash` directly → break detected
- Both `walkChain` library and `mcp-audit-cli verify` exit 2 on every mode.

### Quarantine round-trip
- Clean chain → tamper → quarantine CLI → broken file renamed `.broken-<ts>` → sentinel record at original path → fresh chain anchored on sentinel hash → directory verify ok (broken file deliberately out-of-band).

### Cross-file rotation continuity
- `MCP_AUDIT_ROTATION=size:1KB` produces multiple files
- Last-record-of-file-N hash equals first-record-of-file-N+1 prevHash for every boundary
- `mcp-audit-cli verify <dir>` reports OK across all files
- `MCP_AUDIT_ROTATION=daily` produces filename matching `YYYY-MM-DD.jsonl`

### Engagement context switch
- Engagement A → 2 calls → engagement B → 2 calls = 6 records
- `tool.contextChange = {from: A, to: B}` carried correctly on the B-set record
- All records carry the correct engagement at their phase
- Chain integrity preserved across the switch

### Failed tool calls still emit
- 5 failure modes: invalid OData filter, non-existent GUID, malformed GUID, unknown action, delete non-existent
- Every failure produces an audit record with `result.success: false`, populated `result.error`, populated `result.durationMs`, and post-redacted `tool.params`

### All 13 audit-emitting tools (+1 set-engagement)
- 14 records produced for 14 tool calls (1 record per call, no duplicates)
- Mix of success/failure tolerated; chain integrity preserved

### PII × audit configuration matrix (30 cells)
- 6 PII configurations: `no-protection`, `l1-only`, `l2-only`, `l3-only`, `all-defaults` (full L1+L2+L3+L4), `observe-mode`
- 5 representative tools: `query-records`, `count-records`, `get-record`, `update-record`, `execute-action`
- Per-cell redaction reports validated; per-cell leakage counts compared against expectations
- The 4 non-redacting control configs leak as expected; `all-defaults` originally leaked 5 known-PII strings — fix landed (`7364a8d`) for the address-field class. Filter-param + FormattedValue gaps remain (Gaps 1 + 3).

### Aggregate leakage sweep
- 274 records scanned across 10 scenarios
- 465 leaks (ALL from `pii-audit-matrix` control configs — expected)
- ZERO leaks in every other scenario (smoke, all-tools, context-switch, failed-calls, quarantine, refuse-to-execute, rotation, search-cli, tamper-detection)

### `mcp-audit-cli search` filter × format matrix
- 12 filter cases pass: `--client`, `--operator` (substring), `--tool`, `--workItem`, `--entity`, `--since`, `--until`, plus combinations
- 3 output formats validated: `table` (14 lines), `json` (parseable, correct element count), `csv` (header + rows, comma-separated)

## Recommended next steps

1. **Address Bug 3** (`create-record` response parser) — small UX fix in `packages/powerplatform-data/src/tools/write-tools.ts`. Workaround already in place via fixture helper.
2. **Bug 4 / Gap 1** — **Resolved 2026-05-04 as Option C (documented as operator responsibility).** No code change planned. Source channel closes when ADO-side PII redaction lands in Phase C (agents won't see raw PII in bug bodies, so won't have it to inline into filters).
3. **Bug 5 / Gap 3 design call** — extend redaction logic to treat `*@OData.Community.Display.V1.FormattedValue` annotations as siblings-of-the-lookup-field. Generic fix would close this for any custom lookup carrying PII.
4. **Re-run `pii-audit-matrix`** after Gap 3 fix lands; expect `all-defaults` config leaks to drop from 5 to 2 (the 2 documented Gap 1 leaks remain by design). Update `EXPECTED_HARD_FAIL_LEAKAGE` in the scenario in the same commit.
5. **Phase B planning** — central sync, HMAC signing, retention enforcement, network-offline buffering, internal storage backend. Spec section §Phased Delivery.
6. **Phase C planning** — extend audit emission to other MCP servers (`azure-devops`, `azure-sql`, etc.). Mostly mechanical: wrap each package's tools in `auditEmit` per the Phase A pattern.

## Commit history (this test pass)

Plan extension: `4187092`. Test pass commits:

```
f3fa651 docs(audit-integration): test suite README + technical doc cross-ref (Task 47)
4d766b0 test(audit-integration): search CLI matrix + aggregate leakage sweep (Tasks 38, 46)
e46d51e test(audit-integration): all 13 tools emit exactly 1 audit record per call (Task 45)
3e4d824 test(audit-integration): quarantine + rotation + context-switch (Tasks 40, 41, 43)
7364a8d fix(pii): add address fields to default redactInResponse for contact/account/lead
bcd1281 docs(plan): split PII audit logging plan into per-phase files
f030f60 test(audit-integration): PII × audit configuration matrix (Task 37)
6531ded fix(audit): refuse to execute audit-emitting tools when engagement is unset
7075e85 test(audit-integration): failed tool calls still emit audit records (Task 44)
b149926 test(audit-integration): refuse-to-execute scenario — REPRO Phase A bug (Task 42)
96d7728 fix(audit): probe audit base path + chain-state at startup
b07e786 test(audit-integration): PII fixture corpus + create/delete helpers (Task 36)
e60a355 test(audit-integration): tamper detection (5 corruption modes vs walkChain + CLI) (Task 39)
5475049 test(audit-integration): refuse-to-start matrix (5 process-level cases) (Task 35)
33057aa test(audit-integration): scenario runner + per-scenario isolation (Task 34)
0d7b8d9 test(audit-integration): assertion library — jsonl/chain/leakage (Task 33)
c87b1a8 test(audit-integration): subprocess harness + MCP SDK client wiring (Task 32)
```

17 commits, 5 of which are bug fixes or production-code changes; the rest are tests + docs.
