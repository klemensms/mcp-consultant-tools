# Audit Logging — User Guide

> **For agentic workers:** comprehensive technical reference at `docs/technical/AUDIT_LOGGING_TECHNICAL.md`. This page is the user-facing summary.

## What is this?

PII audit logging is the GDPR-defensible record of every Dataverse MCP tool call against client environments. Each call writes a tamper-evident, hash-chained JSONL record capturing operator identity, engagement (the ADO work item being investigated), tool, parameters, and what the PII pipeline redacted. This satisfies GDPR Art 5(2) accountability ("demonstrate compliance"), Art 30 records of processing, Art 32 security of processing, and Art 33–34 breach notification — without an audit log, the consultant cannot prove the redaction layer actually ran when a regulator or client asks.

## Quick Start

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code

```json
{
  "servers": {
    "powerplatform-data": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-data@beta", "mcp-pp-data"],
      "env": {
        "MCP_ENVIRONMENT_TYPE": "production",
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "MCP_AUDIT_LEVEL": "full",
        "MCP_AUDIT_CLIENT": "Acme",
        "MCP_AUDIT_OPERATOR": "jdoe@example.com",
        "MCP_AUDIT_PATH": "~/.mcp-audit",
        "MCP_AUDIT_ROTATION": "monthly",
        "POWERPLATFORM_URL": "https://client.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "op://Work/PP-App-Registration/username",
        "POWERPLATFORM_TENANT_ID": "op://Work/PP-App-Registration/tenantid",
        "POWERPLATFORM_CLIENT_SECRET": "op://Work/PP-App-Registration/password",
        "POWERPLATFORM_ENABLE_CREATE": "false",
        "POWERPLATFORM_ENABLE_UPDATE": "false",
        "POWERPLATFORM_ENABLE_DELETE": "false",
        "POWERPLATFORM_ENABLE_ACTIONS": "false"
      }
    }
  }
}
```

Env var reference:

| Var | Values | Notes |
|-----|--------|-------|
| `MCP_ENVIRONMENT_TYPE` | `production` \| `uat` \| `dev` | Advisory only — **currently unused at runtime** (read by neither the PII pipeline nor the audit subsystem; internal type is fixed to `production`). |
| `PII_PROTECTION` | `true` \| `false` | PII switch — off by default; set `true` to redact. |
| `PII_OBSERVE_MODE` | `true` \| `false` | Report what would be redacted, return originals. |
| `MCP_AUDIT_LEVEL` | `off` \| `lean` \| `full` | Default `off`; set `lean`/`full` to enable audit. |
| `MCP_AUDIT_CLIENT` | free-text | Client id. **Required when level ≠ `off`.** |
| `MCP_AUDIT_OPERATOR` | email | Optional; falls back to `os-user@hostname`. |
| `MCP_AUDIT_PATH` | path | Optional override; default `~/.mcp-audit/{client}/`. |
| `MCP_AUDIT_ROTATION` | `monthly` \| `weekly` \| `daily` \| `size:N{KB\|MB\|GB}` | When to roll the log file. |

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "powerplatform-data": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Audit Levels

| Level  | What's logged                                                                                                                   | When to use                                                                                       |
|--------|---------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| `off`  | Nothing.                                                                                                                        | Default. Audit stays off and the server starts normally — drop-in v30 behaviour.                  |
| `lean` | Metadata: timestamp, operator, engagement, tool name, success/error, duration, redaction counts. **No payloads.**               | UAT against pseudonymised data; production where storage is constrained and counts suffice.       |
| `full` | Same as `lean` plus the **post-redaction** tool input + response body.                                                          | Recommended for production / live client data — the GDPR-defensible default.                      |

## Recommended environment mapping

The `MCP_ENVIRONMENT_TYPE` column below is **advisory and has no runtime effect today** — nothing reads it (internal type is fixed to `production`). It is documented as the intended convention so configs are already shaped correctly when the value is wired in. Only the `MCP_AUDIT_LEVEL` column actually changes behaviour.

| Environment                          | `MCP_ENVIRONMENT_TYPE` | `MCP_AUDIT_LEVEL` |
|--------------------------------------|------------------------|-------------------|
| dev (training, prototyping)          | `dev`                  | `off`             |
| UAT (anonymised data)                | `dev`                  | `off`             |
| UAT (pseudonymised data)             | `uat`                  | `lean`            |
| Production / live client data        | `production`           | `full`            |

## Engagement workflow

Audit records anchor to an **engagement** — the ADO work item(s) the operator is investigating. Set this with the `set-audit-engagement` tool at the start of every session and whenever focus shifts to a different work item.

- **Single item:** `set-audit-engagement(workItemIds=["Acme-1234"], reason="reproducing customer report")`.
- **Multi-item:** `set-audit-engagement(workItemIds=["Acme-1234", "Acme-1240"])` when work spans related tickets — preferred over picking one arbitrarily.
- **`'exploration'` sentinel:** `set-audit-engagement(workItemIds=["exploration"], reason="...")` is a last-resort escape valve for genuine pre-ticket investigation. Compliance review will challenge any session that uses it without a strong justification — prefer creating a discovery ticket first.
- **Re-call when focus shifts:** every conversation pivot to a new ticket needs a fresh `set-audit-engagement` call so subsequent records anchor correctly.

## Failure-mode table

| Trigger                                                                                  | Behaviour                                                                                                                            |
|------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `MCP_AUDIT_LEVEL` unset or `off`                                                         | Audit subsystem stays off. Server starts normally; tool calls run un-audited and no engagement is required. (Default — drop-in v30 behaviour.) |
| `MCP_AUDIT_LEVEL` set to an invalid value                                                | Refuse-to-start. `AuditRefuseToStartError` to stderr; exit code 1.                                                                   |
| `MCP_AUDIT_LEVEL=lean` or `full` AND `MCP_AUDIT_CLIENT` unset                            | Refuse-to-start.                                                                                                                     |
| Audit enabled (`lean`/`full`) AND tool call without prior `set-audit-engagement`         | Refuse-to-execute. Tool returns `AuditEngagementUnsetError` to the agent — no Dataverse call is made.                                |
| Audit emit fails (disk full, EACCES, etc.)                                               | **Tool result returns normally.** Audit error is logged to stderr. Phase A guarantee: audit failure never blocks tool execution.     |

## Operator responsibility — filter parameters and PII

The PII redaction pipeline runs against **response bodies** returned from Dataverse. It does not parse or scan **request parameters** that the operator/agent constructs locally — most notably the `filter` argument to `query-records` and `count-records`.

This means:

- **The audit log records `tool.params.filter` raw.** An OData filter like `firstname eq 'Maria Schmidt'` is written verbatim into both `tool.params.filter` and (at `MCP_AUDIT_LEVEL=full`) `payload.input.filter`.
- **L1/L2/L3/L4 do not engage on filter content.** L1 acts on `$select`. L2 redacts values whose *field name* is on a known-PII list — the JSON property `filter` is not one of those names. L3 regex covers email/phone/date-of-birth shapes; a name like `Maria Schmidt` does not match. L4 NER scans response bodies, not request strings.
- **It is the operator's / agent's responsibility not to inline raw PII into filter strings.** Use the GUID, an opaque tokenised identifier, or a server-side preset filter. If you have a name in the user request, look the contact up first (in dev/UAT, or via a non-audited lookup), get the GUID, then build the production filter from the GUID.

This is consistent with GDPR client-data-handling expectations: the audit subsystem is the GDPR-defensible record of what the operator and agent did. If the operator chooses to inline PII into a query parameter, that is recorded faithfully — the audit log is not a redaction layer of last resort.

> **Why no platform fix?** A platform fix would need either (a) NER over every filter string (cost: latency on every call, false-positive risk that breaks legitimate filters), or (b) an OData filter parser to extract literals (cost: new dependency surface, same false-positive risk). Both were considered and rejected for the realistic threat model — the dominant source of PII-in-filters is an agent reading a name out of an ADO bug body and pasting it into a query. The planned ADO-side PII redaction closes that source upstream, which is a stronger control than detect-and-redact downstream. See `docs/programmes/pii-and-audit/pending/known-gaps.md` "Gap 1" for the full design call.

## Recovery via `mcp-audit-cli quarantine`

If the chain breaks (manual edit, disk corruption, partial write), `mcp-audit-cli verify` will report it and `mcp-audit-cli quarantine` resets the chain with a sentinel record so the audit pipeline can keep emitting.

```bash
$ mcp-audit-cli verify ~/.mcp-audit/Acme/2026-05.jsonl
BROKEN: 2026-05.jsonl line 47 (seq 47): hash mismatch — expected a3f4..., got 9c12...

$ mcp-audit-cli quarantine ~/.mcp-audit/Acme/2026-05.jsonl --reason "manual corruption test"
Renamed: 2026-05.jsonl → 2026-05.jsonl.broken-2026-05-02T14-30-12Z
Wrote sentinel record at: 2026-05.jsonl (seq=1, prevHash=ZERO_HASH)
.chain-state reset.

$ mcp-audit-cli verify ~/.mcp-audit/Acme/2026-05.jsonl
OK: 2026-05.jsonl (1 record)
```

The broken file is preserved alongside the new chain so compliance can correlate the sentinel's `quarantine.previousFile` field to investigate the original break.

## CLAUDE.md guidance (copy-paste)

Drop this block into the per-client repo's `CLAUDE.md` so consultants and agents both treat audit-engagement as a session-opening ritual:

```
<audit-engagement>
Set the audit engagement context at the start of every session and whenever
focus shifts to a new work item. Call `set-audit-engagement(workItemIds,
reason?)` with the ADO ticket(s) you're investigating; pass `["exploration"]`
only as a last resort for genuine pre-ticket investigation. Multi-anchor
(`["Acme-1", "Acme-2"]`) is preferred over picking one arbitrarily when work
spans related items.

Subsequent Dataverse tool calls (`query-records`, `create-record`,
`update-record`, `delete-record`, `execute-action`, etc.) will not run until
the engagement is set, and every call writes a tamper-evident audit record
under that engagement.
</audit-engagement>
```

### Entity key — singular vs plural

The entity key is the **singular logical name** (`contact`, `account`, `lead`,
`b2c-user`, custom entities like `new_membership`). The plural entity-set name
(`contacts`, `accounts`, etc.) is also accepted as a synonym for backwards
compatibility, but singular is the documented standard.

You write each entity's rule **once**, under whichever form you prefer. The
loader registers it under both forms internally, so every PII pipeline call
finds the same rule regardless of which form the call site happens to pass.

If you write the same entity under both forms with **identical** field lists,
the loader silently dedups (no warning, no behaviour change). If you write
both forms with **divergent** lists, the server refuses to start and prints
a message naming the entity and the diff. Reconcile to a single key.

Field names inside `redactInResponse` and `excludeFromSelect` are matched
case-insensitively (`firstname`, `FirstName`, `FIRSTNAME` all match the same
field). Lowercase is the recommended canonical form.

See also: [pii-protection.md](pii-protection.md) for the redaction layer that runs before audit recording, and [AUDIT_LOGGING_TECHNICAL.md](../technical/AUDIT_LOGGING_TECHNICAL.md) for the full schema, refuse-to-start matrix, and CLI reference.
