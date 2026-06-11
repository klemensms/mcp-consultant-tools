# PowerPlatform Data

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/POWERPLATFORM_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/powerplatform-data`

MCP server for Dataverse record operations: query records, get records, create, update, delete, execute actions, and manage record associations. Write operations are disabled by default and require explicit feature flags. Not production-safe without proper access controls and approval workflows.

> **Going to production?** Read [powerplatform-data-production-use.md](powerplatform-data-production-use.md) first. Pre-flight, schema-investigation workflow, PII-config generation, operator sign-off, multi-environment `.mcp.json` strategy. Do not connect to a client production environment without walking that doc.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

> **PII protection (opt-in):** redaction is off by default. Set `PII_PROTECTION=true` to enable it. See [PII Protection](#pii-protection-v31) below.
>
> **Audit logging (opt-in):** off by default. Set `MCP_AUDIT_LEVEL=lean|full` (plus `MCP_AUDIT_CLIENT`) to enable. See [audit-logging.md](audit-logging.md).

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "powerplatform-data": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-data@beta", "mcp-pp-data"],
      "env": {
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "PII_SESSION_SALT": "<paste 64-hex-char salt — openssl rand -hex 32>",
        "MCP_AUDIT_LEVEL": "full",
        "MCP_AUDIT_CLIENT": "Acme",
        "MCP_AUDIT_OPERATOR": "jdoe@example.com",
        "MCP_AUDIT_PATH": "~/.mcp-audit",
        "MCP_AUDIT_ROTATION": "monthly",
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
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

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "powerplatform-data": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-data", "mcp-pp-data"],
      "env": {
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "PII_SESSION_SALT": "<paste 64-hex-char salt — openssl rand -hex 32>",
        "MCP_AUDIT_LEVEL": "full",
        "MCP_AUDIT_CLIENT": "Acme",
        "MCP_AUDIT_OPERATOR": "jdoe@example.com",
        "MCP_AUDIT_PATH": "~/.mcp-audit",
        "MCP_AUDIT_ROTATION": "monthly",
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_ENABLE_CREATE": "false",
        "POWERPLATFORM_ENABLE_UPDATE": "false",
        "POWERPLATFORM_ENABLE_DELETE": "false",
        "POWERPLATFORM_ENABLE_ACTIONS": "false"
      }
    }
  }
}
```

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "powerplatform-data": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

**Authentication:** Same as the read-only package. Omit `POWERPLATFORM_CLIENT_SECRET` for interactive (SSO) auth.

## Feature Flags

All write operations are **disabled by default**. Enable only the operations you need:

| Flag | Default | Enables |
|------|---------|---------|
| `POWERPLATFORM_ENABLE_CREATE` | `false` | `create-record`, `associate-records` |
| `POWERPLATFORM_ENABLE_UPDATE` | `false` | `update-record` |
| `POWERPLATFORM_ENABLE_DELETE` | `false` | `delete-record`, `disassociate-records` |
| `POWERPLATFORM_ENABLE_ACTIONS` | `false` | `execute-action` |

Read-only tools (`query-records`, `get-record`, `get-entity-metadata`, `get-lookup-target`, `get-flow-runs`, `get-flow-run-details`) are always available regardless of flags.

## PII Protection (v31+)

A 4-layer redaction pipeline runs on every `query-records` response (via `DataService.queryRecords`). This is one of three packages that performs redaction — the others are `azure-devops` (work item fields and identity objects) and `azure-sql` (query result rows). See [pii-protection.md](pii-protection.md) for the full surface and layer-by-layer reference.

**PII protection is opt-in and off by default. Set `PII_PROTECTION=true` to enable redaction — there is no environment-type gate, and the server starts normally without it.**

| `PII_PROTECTION` | Behaviour |
|---|---|
| unset / `false` | pipeline off — raw data flows to the LLM (server starts normally) |
| `true` | redaction active on every response |

`MCP_ENVIRONMENT_TYPE` has no runtime effect today — see [Coming later (not yet active)](#coming-later-not-yet-active). The server fixes the PII environment type to `production` internally and does not read the variable. (Earlier v31 betas made PII flags mandatory with a refuse-to-start gate; v32 relaxed that to pure opt-in.)

| Var | Values | Behaviour |
|-----|--------|-----------|
| `PII_PROTECTION` | `true` \| `false` | Off by default. Set `true` to enable redaction; `false`/unset is permitted in any environment. |
| `PII_OBSERVE_MODE` | `true` \| `false` (default `false`) | When `true`, pipeline computes what it would redact but returns original data unchanged. Footer reports `(observe-mode — values not changed)`. |
| `PII_SESSION_SALT` | 64-hex-char string (optional) | Cross-MCP correlation salt read by core PII. Set the same value across servers so identical input values tokenise identically (enables cross-server validation without exposing raw PII). Unset, empty, or whitespace falls back to a per-process random salt. If set, it must be exactly 64 hex characters or the server refuses to start. Generate with `openssl rand -hex 32`. |
| `PII_CONFIG_PATH` | path to JSON file (optional) | Per-layer toggles, per-entity field rules, regex patterns, NER scan-fields. See [pii-protection.md](pii-protection.md) for the schema. |
| `PII_NONPROD_HINTS` | comma-separated substrings (optional) | Override the URL-heuristic non-prod hint list (defaults: `dev,uat,training,support,migration,sandbox,test`). |

When PII protection is off (`PII_PROTECTION` unset or `false`), a heuristic check compares `POWERPLATFORM_URL` against the non-prod hint list to flag the "consultant copy-pasted a dev config and swapped the URL to prod" failure mode. This is the intended safety net, but it is currently NOT wired into startup — no warning fires today, and the server always starts. Treat "PII off in production" as a policy expectation the operator enforces, not something the server blocks.

See [pii-protection.md](pii-protection.md) for config schema and [PII_PROTECTION_TECHNICAL.md](../technical/PII_PROTECTION_TECHNICAL.md) for layer-by-layer reference.

## Notable Behavior

- **`delete-record` requires double confirmation:** Both `POWERPLATFORM_ENABLE_DELETE=true` and the `confirm: true` parameter must be set. Deletion is permanent and cannot be undone.
- **`associate-records` uses `ENABLE_CREATE`:** For N:N relationships, use `associate-records` instead of `create-record` — intersect entities do not support the Create message directly (error `0x80040800`).
- **Lookup fields use `@odata.bind` syntax:** `"parentaccountid@odata.bind": "/accounts(<guid>)"`. Use `get-lookup-target` to discover the correct plural entity name and syntax for a given lookup field.
- **`get-entity-metadata` returns `EntitySetName`:** Required to know the correct plural entity name for all data tools (e.g., `accounts`, `contacts`). Use this before performing CRUD operations on unfamiliar entities.
- **All write operations are audit-logged:** Create, update, delete, and action executions are logged with timestamps, parameters, and execution time.
- **PII protection is opt-in:** off by default; set `PII_PROTECTION=true` to redact. There is no environment-type gate — the server starts without it. Keeping PII protection on in production is a policy expectation the operator enforces; the "looks unprotected" heuristic exists in code but is not currently wired into startup, so the server does not warn or block.

## Coming later (not yet active)

| Variable | Status |
|----------|--------|
| `MCP_ENVIRONMENT_TYPE` | **Currently inert — has no runtime effect.** The server fixes the PII environment type to `production` internally and does not read this variable. It survives only inside a stderr warning string (and that warning is itself not yet wired into startup). Documented here so the intended configuration surface isn't lost; setting it today does nothing. |

## Related Packages

- [POWERPLATFORM.md](POWERPLATFORM.md) - Read-only metadata, validation, and audit tools
- [POWERPLATFORM_CUSTOMIZATION.md](POWERPLATFORM_CUSTOMIZATION.md) - Schema modifications

## Related Docs

- [powerplatform-data-production-use.md](powerplatform-data-production-use.md) - Production-use playbook (pre-flight, schema investigation, PII-config generation, sign-off)
- [pii-protection.md](pii-protection.md) - PII pipeline reference
- [audit-logging.md](audit-logging.md) - Audit subsystem reference
