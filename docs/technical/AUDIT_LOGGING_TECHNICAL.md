# Audit Logging — Technical Reference

> Comprehensive reference for the Phase A PII audit logging subsystem in `@mcp-consultant-tools/core` and `@mcp-consultant-tools/powerplatform-data`. User-facing summary at [audit-logging.md](../documentation/audit-logging.md).

## Overview

The audit subsystem produces a tamper-evident, hash-chained record of every Dataverse MCP tool call. It is the demonstrable evidence layer that pairs with the PII redaction pipeline: the pipeline is the *technical mitigation*, the audit log is the *GDPR-defensible record* that the mitigation actually ran. Phase A scope is local-file-only, single Dataverse server. Phase B (multi-target sync, HMAC layer, additional servers) is out of scope here — see `<phase-b-roadmap>` below.

<architecture>
  Per-MCP-server-process AuditPipeline. The pipeline is constructed at server
  startup from `createAuditConfigFromEnv()` (which validates the audit env
  vars, refusing to start only when audit is enabled) and held as a singleton
  in the ServiceContext. Every tool registers
  its own `auditEmit(pipeline, opts, fn)` wrapper around the underlying service
  call.

  Hash-chain SHA-256 over canonical JSON: each record's `prevHash` is the
  SHA-256 of the canonical JSON of the prior record. The first record in a
  chain uses ZERO_HASH ('0' * 64). Canonical JSON sorts object keys
  recursively and omits `undefined`; circular references are rejected.

  JSONL append-only files at `{basePath}/{client}/{rotation-key}.jsonl`. Each
  line is one record terminated by `\n`. Concurrent writes from a single
  process are serialised through a Promise-chained write queue (the queue is
  per-pipeline-instance, so per-process). Cross-process writes are NOT
  supported in Phase A — one MCP server per client per machine.

  In-memory chain state cached after first read on pipeline startup; persisted
  via atomic tmp+rename to `{basePath}/{client}/.chain-state` after every
  write. The chain-state file holds `lastSeq`, `lastHash`, `currentFile`, and
  a placeholder `fileChecksumAtLastWrite` (Phase A: empty string; Phase B
  will populate for cross-target sync verification).

  Refuse-to-execute on engagement-unset: `pipeline.emit()` throws
  `AuditEngagementUnsetError` if `setEngagement()` was never called. The tool
  wrapper catches this BEFORE invoking the underlying service call, so no
  Dataverse traffic is generated for an un-anchored session. The agent
  receives the error and is expected to call `set-audit-engagement` then
  retry.

  Refuse-to-start applies at config load (server boot) ONLY when audit is
  enabled (`MCP_AUDIT_LEVEL=lean|full`): the server exits with code 1 and an
  explicit stderr message naming the missing var (`MCP_AUDIT_CLIENT`), or on an
  invalid `MCP_AUDIT_LEVEL` / malformed `MCP_AUDIT_ROTATION`. With
  `MCP_AUDIT_LEVEL` unset/`off` the subsystem stays off and the server starts
  normally — `off` is an explicit, valid state, not a silent degradation. There
  is no `MCP_ENVIRONMENT_TYPE` gate.
</architecture>

<env-vars>
  | Var                    | Required             | Values                              | Default                          | Notes |
  |------------------------|----------------------|-------------------------------------|----------------------------------|-------|
  | `MCP_AUDIT_LEVEL`      | no (default `off`)   | `off` \| `lean` \| `full`           | `off`                            | Off by default; set `lean`/`full` to enable audit. Invalid value → refuse-to-start. |
  | `MCP_AUDIT_CLIENT`     | when level≠off       | free text                           | none                             | Folder name + record field. Refuse-to-start if missing when level≠off. |
  | `MCP_AUDIT_OPERATOR`   | no                   | string                              | OS-fingerprint (`os-user@hostname`) | Override for the operator's directory identity. |
  | `MCP_AUDIT_PATH`       | no                   | path                                | `~/.mcp-audit`                   | Files land at `{path}/{client}/`. |
  | `MCP_AUDIT_ROTATION`   | no                   | `monthly` \| `weekly` \| `daily` \| `size:NMB` \| `size:NGB` | `monthly` | Malformed → refuse-to-start. |
  | `MCP_ENVIRONMENT_TYPE` | no (advisory only)   | `production` \| `uat` \| `dev`      | none                             | v32: not read by audit or PII config; not a gate. Feeds the PII "looks unprotected" warning only. |
</env-vars>

<tools>
  <tool name="set-audit-engagement">
    Inputs:
      - `workItemIds`: string[] (required, max 50 items, each max 200 chars)
      - `reason`: string (optional, max 2000 chars)

    Behaviour:
      1. Validates inputs. Empty array → `AuditEngagementInvalidError`.
      2. Writes a context-change audit record with `tool.name='set-audit-engagement'`
         and `tool.contextChange={from, to}` capturing the prior + new engagement.
      3. Updates the in-memory engagement on the pipeline. Subsequent `emit()`
         calls anchor to this engagement until the next `set-audit-engagement`
         call.

    Sentinel: `workItemIds=['exploration']` is allowed but flagged as
    `engagement.source='exploration'`. Compliance review will challenge any
    session that anchors records to `exploration` without a strong reason — it
    exists for genuine pre-ticket investigation, not as a default.

    Source values:
      - `'agent-explicit'` — `set-audit-engagement` was called with one or more
        real work item IDs.
      - `'exploration'` — `set-audit-engagement` was called with the literal
        `['exploration']` sentinel.
      - `'unset'` — appears only on the context-change record itself when the
        prior engagement was never set.
  </tool>
</tools>

<schema>
  <record>
    Every emitted record conforms to this shape. Field order in the canonical
    JSON is alphabetical (canonicalize.ts sorts keys recursively).

    ```json
    {
      "v": 1,
      "ts": "2026-05-02T14:30:12.456Z",
      "seq": 47,
      "prevHash": "a3f4...64-hex-chars",
      "operator": {
        "fingerprint": "jdoe@laptop-01",
        "identity": "jdoe@example.com"
      },
      "auth": {
        "principalId": "00000000-1111-2222-3333-444444444444",
        "principalType": "service-principal",
        "userId": null
      },
      "engagement": {
        "client": "Acme",
        "workItemIds": ["Acme-1234"],
        "reason": "reproducing customer report",
        "source": "agent-explicit"
      },
      "environment": {
        "type": "production",
        "url": "https://acme.crm.dynamics.com",
        "auditLevel": "full"
      },
      "tool": {
        "name": "query-records",
        "params": { "entityName": "contact", "select": ["fullname"], "top": 10 },
        "contextChange": null
      },
      "result": {
        "success": true,
        "error": null,
        "durationMs": 142,
        "recordCount": 10
      },
      "redaction": {
        "input": null,
        "output": {
          "layers": { "l1": 0, "l2": 8, "l3": 2, "l4": 0 },
          "byType": { "name": 8, "email": 2 },
          "totalRedacted": 10
        }
      }
    }
    ```

    Notes:
    - `auth.principalType` ∈ `'service-principal' | 'user-impersonation' | 'user-interactive' | 'unknown'`
    - `engagement.source` ∈ `'agent-explicit' | 'exploration' | 'unset'`
    - `environment.type` ∈ `'production' | 'uat' | 'dev'`
    - `redaction.input` / `redaction.output` are `PipelineReport | null`. `null` when the
      tool didn't run that side of the pipeline (e.g. read-only tool has no input redaction).
    - `payload` block (below) is only present at `auditLevel='full'`.
    - `quarantine` block (below) is only present on quarantine sentinel records.
  </record>

  <record-full-with-payload>
    At `MCP_AUDIT_LEVEL=full`, the same record carries an additional `payload`
    block holding the **post-redaction** tool input + response body:

    ```json
    {
      "v": 1,
      "ts": "2026-05-02T14:35:01.012Z",
      "seq": 48,
      "prevHash": "9c12...64-hex-chars",
      "operator": { "fingerprint": "jdoe@laptop-01", "identity": "jdoe@example.com" },
      "auth": { "principalId": "00000000-1111-2222-3333-444444444444", "principalType": "service-principal", "userId": null },
      "engagement": { "client": "Acme", "workItemIds": ["Acme-1234"], "source": "agent-explicit" },
      "environment": { "type": "production", "url": "https://acme.crm.dynamics.com", "auditLevel": "full" },
      "tool": {
        "name": "create-record",
        "params": { "entityName": "contact" },
        "contextChange": null
      },
      "result": { "success": true, "error": null, "durationMs": 287 },
      "redaction": {
        "input":  { "layers": { "l1": 0, "l2": 3, "l3": 0, "l4": 0 }, "byType": { "name": 2, "email": 1 }, "totalRedacted": 3 },
        "output": { "layers": { "l1": 0, "l2": 0, "l3": 0, "l4": 0 }, "byType": {}, "totalRedacted": 0 }
      },
      "payload": {
        "input":  { "firstname": "[REDACTED:name:a3f4c2]", "lastname": "[REDACTED:name:9c12be]", "emailaddress1": "[REDACTED:email:51d802]" },
        "output": { "contactid": "00000000-aaaa-bbbb-cccc-000000000001" }
      }
    }
    ```

    The payload is captured **after** the PII pipeline has run, so audit files
    never contain raw PII even at `full` level. Redaction tokens preserve
    cross-call correlation for the same operator session.
  </record-full-with-payload>

  <record-quarantine-sentinel>
    Written by `mcp-audit-cli quarantine` after a chain break. Resets the chain
    with `seq=1`, `prevHash=ZERO_HASH`, and a `quarantine` block linking back
    to the renamed broken file:

    ```json
    {
      "v": 1,
      "ts": "2026-05-02T14:40:00.000Z",
      "seq": 1,
      "prevHash": "0000000000000000000000000000000000000000000000000000000000000000",
      "operator": { "fingerprint": "audit-cli", "identity": null },
      "auth": { "principalId": null, "principalType": "unknown", "userId": null },
      "engagement": { "client": "Acme", "workItemIds": [], "source": "unset" },
      "environment": { "type": "production", "auditLevel": "full" },
      "tool": { "name": "audit-quarantine-sentinel" },
      "result": { "success": true, "error": null, "durationMs": 0 },
      "redaction": { "input": null, "output": null },
      "quarantine": {
        "previousFile": "2026-05.jsonl.broken-2026-05-02T14-30-12Z",
        "reason": "manual corruption test"
      }
    }
    ```
  </record-quarantine-sentinel>

  <chain-state>
    File: `{basePath}/{client}/.chain-state`. Atomic tmp+rename write after every
    record. Read once at pipeline construction; subsequently held in memory.

    ```json
    {
      "v": 1,
      "lastSeq": 48,
      "lastHash": "5b4f...64-hex-chars",
      "fileChecksumAtLastWrite": "",
      "currentFile": "2026-05.jsonl"
    }
    ```

    `fileChecksumAtLastWrite` is a Phase A placeholder (always empty string).
    Phase B will populate it with the SHA-256 of the file at write time so a
    central sync target can detect drift between local and remote copies.
  </chain-state>
</schema>

<refuse-to-start-matrix>
  Applied at server boot in `createAuditConfigFromEnv()`. Each row throws
  `AuditRefuseToStartError` with an explicit stderr message; process exits 1.
  In v32 audit is **opt-in** — these only fire once you have engaged audit (or
  supplied a malformed value). `MCP_ENVIRONMENT_TYPE` is NOT consulted.

  | Trigger                                                                  | Behaviour at config load     |
  |--------------------------------------------------------------------------|------------------------------|
  | `MCP_AUDIT_LEVEL` set to a value other than `off`/`lean`/`full`          | `AuditRefuseToStartError`    |
  | `MCP_AUDIT_LEVEL ∈ {lean, full}` AND `MCP_AUDIT_CLIENT` unset            | `AuditRefuseToStartError`    |
  | `MCP_AUDIT_ROTATION` malformed (e.g. `size:` with no number, unknown key)| `AuditRefuseToStartError`    |

  Not a refusal: `MCP_AUDIT_LEVEL` unset or `off` → audit subsystem stays off
  and the server starts normally (drop-in v30 behaviour). There is no
  environment-type gate and no cross-cut with the PII config.
</refuse-to-start-matrix>

<refuse-to-execute-matrix>
  Applied at runtime by the tool wrapper / pipeline.

  | Trigger                                              | Behaviour                                                                                                                                          |
  |------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
  | `pipeline.emit()` before `pipeline.setEngagement()`  | `AuditEngagementUnsetError` thrown to caller; the agent receives the error in the tool result. **No Dataverse call made.**                        |
  | `appendRecordLine` fails (EACCES, ENOSPC, etc.)      | `AuditWriteError` thrown internally. `auditEmit`'s safeEmit catches it, logs to stderr, and returns the tool result anyway. **Tool never blocked.**|
  | `canonicalize` encounters a circular reference       | `safeEmit` catches; logs to stderr; tool execution continues normally.                                                                             |
  | `MCP_AUDIT_LEVEL=off`                                | `auditEmit` is a no-op (early return). The wrapper still invokes `fn`. No engagement check. No file writes.                                        |
</refuse-to-execute-matrix>

<chain>
  Each record's `prevHash` equals the SHA-256 of the canonical JSON of the
  PRIOR record. The first record in a chain uses
  `ZERO_HASH = '0'.repeat(64)`.

  Hash-of-self computation:
  1. Assemble the full record object including its own `prevHash`.
  2. `canonicalize(record)` produces a stable byte sequence (sorted keys,
     omitted `undefined`, no whitespace).
  3. `sha256(canonicalize(record))` is the value used as `prevHash` of the
     NEXT record. The current record itself does NOT carry its own hash on
     disk — verifiers recompute it during the walk.

  Verifier algorithm (`mcp-audit-cli verify`):
  1. Open each `.jsonl` file in lexicographic filename order across
     rotations.
  2. For the very first record encountered: assert `prevHash === ZERO_HASH`.
  3. For every subsequent record: parse, canonicalize, hash; compare to the
     NEXT record's `prevHash`. Mismatch → BROKEN at file F, line L, seq S.
  4. Threading: chain state persists across rotation boundaries — the last
     record of `2026-04.jsonl` chains into the first record of
     `2026-05.jsonl`.

  Any byte change anywhere in the chain breaks all subsequent hashes.
  Quarantine sentinels (above) deliberately reset the chain — they are the
  only mechanism for re-establishing forward progress after a confirmed
  break.
</chain>

<rotation>
  Rotation key derived from the record timestamp at write time.

  | Strategy        | Filename pattern                          | Notes                                                                                              |
  |-----------------|-------------------------------------------|----------------------------------------------------------------------------------------------------|
  | `monthly` (default) | `{YYYY}-{MM}.jsonl`                   | E.g. `2026-05.jsonl`.                                                                              |
  | `weekly`        | `{ISO-week-year}-W{ww}.jsonl`             | **ISO week-year, not calendar year** — late December / early January edge cases differ from `YYYY`.|
  | `daily`         | `{YYYY}-{MM}-{DD}.jsonl`                  | E.g. `2026-05-02.jsonl`.                                                                           |
  | `size:NMB|GB`   | `{YYYY}-{MM}-{DD}.jsonl` + `-{secondsPastMidnight}` suffix when threshold crossed | Daily filename plus seconds-since-midnight when current file ≥ threshold. |

  Rotation never breaks the chain — the new file's first record's `prevHash`
  is the hash of the last record of the previous file.
</rotation>

<recovery>
  When `mcp-audit-cli verify` reports BROKEN at file F, line L (seq S):

  1. **Inspect line L of F** to see the corruption. Common causes: manual
     edit, partial write during crash, disk corruption, file copied without
     `.chain-state`.
  2. **Run `mcp-audit-cli quarantine F --reason "<text>"`** with a
     descriptive reason (audit trail).
  3. The broken file is renamed to `F.broken-{ISO-ts-with-dashes}` (e.g.
     `2026-05.jsonl.broken-2026-05-02T14-30-12Z`).
  4. A fresh sentinel record is written at `F` with `prevHash=ZERO_HASH`,
     `seq=1`, `tool.name='audit-quarantine-sentinel'`, and a `quarantine`
     block holding `previousFile` + `reason`.
  5. `.chain-state` is reset to track the sentinel
     (`lastSeq=1, lastHash=hash(sentinel), currentFile=F`).
  6. Subsequent emits append after the sentinel. Compliance can correlate
     the sentinel's `quarantine.previousFile` to investigate the original
     break — the broken file is preserved alongside the new chain.

  Quarantine inherits `environment.type` from the last parseable record in
  the broken file (falls back to `dev` if the file is unparseable from the
  start). `--reason` is required to prevent silent quarantines.
</recovery>

<cli-tools>
  Distributed as `@mcp-consultant-tools/audit-cli` (binary: `mcp-audit-cli`).

  <tool name="mcp-audit-cli verify">
    Usage: `mcp-audit-cli verify <path> [--quiet]`

    Path may be a single `.jsonl` file or a directory. When directory,
    verifies all `.jsonl` files in lexicographic order, threading the chain
    across rotations.

    Exit 0 on success. Exit 2 on chain-broken. `--quiet` suppresses per-file
    OK lines (still prints BROKEN on failure).
  </tool>

  <tool name="mcp-audit-cli quarantine">
    Usage: `mcp-audit-cli quarantine <file> --reason <text>`

    Renames the broken file, writes the sentinel record, resets
    `.chain-state`. Inherits `environment.type` from the last parseable
    record in the broken file (falls back to `dev`). Requires `--reason`
    for the audit trail.
  </tool>

  <tool name="mcp-audit-cli search">
    Usage:
    ```
    mcp-audit-cli search [--client <name>] [--operator <substring>]
                         [--since <iso>] [--until <iso>]
                         [--tool <exact>] [--entity <substring>]
                         [--workItem <id>] [--base <path>]
                         [--format table|json|csv]
    ```

    Walks all client folders under `--base` (default `~/.mcp-audit`) or
    just one when `--client` is given. Filter logic:
    - `--operator` / `--entity`: case-insensitive substring match.
    - `--since` / `--until`: lexicographic ISO-8601 comparison on `ts`.
    - `--tool`: exact match on `tool.name`.
    - `--workItem`: membership in `engagement.workItemIds` (exact).

    Output formats: `table` (default, human-readable), `json` (one record
    per line, full record payload), `csv` (flattened columns).
  </tool>
</cli-tools>

<phase-b-roadmap>
  Phase A scope (this release):
  - Dataverse only (`@mcp-consultant-tools/powerplatform-data`).
  - Local file only (`{MCP_AUDIT_PATH}/{client}/`).
  - Single operator process (per-process write queue; no cross-process locking).
  - Operator identity from OS fingerprint or `MCP_AUDIT_OPERATOR`.

  Phase B (out of scope, separate v1.x deliverables):
  - Audit on Azure DevOps / Azure SQL / Azure B2C / REST API MCP servers.
  - Multi-target sync: local + internal + client-target. Each
    target gets the same canonical record; HMAC layer chains them
    cross-target so tampering on any one target is detectable.
  - Azure Storage UK provisioning for client-target (data-residency
    requirement for client-held copies).
  - Layer 5 local-LLM safety net for the redaction stack — runs over the
    audit payload before write to catch anything the regex/NER layers
    missed.
  - Cross-process write coordination (file-locking or central agent) for
    multi-MCP-server-per-machine scenarios.
</phase-b-roadmap>

## Verified-via integration tests

The behaviours documented above are exercised end-to-end by the integration test suite at [`tests/audit-integration/`](../../tests/audit-integration/README.md). Each scenario drives a real `pp-data` MCP server subprocess against `mcptests.crm4.dynamics.com` and asserts on the resulting audit JSONL. Scenarios:

- `refuse-to-start` — 5 process-level subprocess invocations validate the refuse-to-start matrix (server exits 1 with byte-exact stderr).
- `refuse-to-execute` — verifies engagement-unset gate on every audit-emitting tool.
- `tamper-detection` — 5 corruption modes against live records, both `walkChain` library and `mcp-audit-cli verify` exit 2.
- `quarantine` — full round-trip from clean chain → tamper → quarantine → fresh chain anchored on sentinel.
- `rotation` — `size:1KB` produces multiple files; cross-file hash continuity verified per boundary.
- `context-switch` — `tool.contextChange` correctly tracks A → B engagement transitions.
- `failed-calls` — failed tool calls still emit records with `result.success: false`.
- `all-tools` — every one of the 14 audit-emitting tool surfaces produces exactly 1 record per call.
- `pii-audit-matrix` — 6 PII configurations × 5 representative tools = 30 cells; per-cell redaction reports + raw-PII leakage assertions.
- `leakage-sweep` — aggregate PII leakage check across all scenario outputs.
- `search-cli` — every `mcp-audit-cli search` filter × format combination.

## Related

- [audit-logging.md](../documentation/audit-logging.md) — user-facing summary, env mapping, copy-paste CLAUDE.md block.
- [pii-protection.md](../documentation/pii-protection.md) — the redaction layer that runs before audit recording.
- [PII_PROTECTION_TECHNICAL.md](PII_PROTECTION_TECHNICAL.md) — full PII pipeline reference.
- [`tests/audit-integration/`](../../tests/audit-integration/README.md) — end-to-end integration test suite.
