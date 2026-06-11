# Azure SQL Database

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/AZURE_SQL_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/azure-sql`

MCP server providing read-only access to Azure SQL Database and SQL Server for schema exploration, data investigation, and ad-hoc querying. Write operations (view management, stored procedure management, and DML) are available behind per-operation feature flags.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

> **PII protection (opt-in):** redaction is off by default. Set `PII_PROTECTION=true` to enable it. See [PII Protection](#pii-protection-v31) below.

```json
{
  "servers": {
    "azure-sql": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-sql@beta", "mcp-sql"],
      "env": {
        "MCP_ENVIRONMENT_TYPE": "production",
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "AZURE_SQL_SERVERS": "[{\"id\":\"prod\",\"name\":\"Production\",\"server\":\"prod.database.windows.net\",\"port\":1433,\"active\":true,\"databases\":[{\"name\":\"AppDB\",\"active\":true}],\"username\":\"mcp_readonly\",\"password\":\"...\"}]",
        "AZURE_SQL_SERVER": "your-server.database.windows.net",
        "AZURE_SQL_DATABASE": "your-database-name",
        "AZURE_SQL_USERNAME": "your-username",
        "AZURE_SQL_PASSWORD": "op://Work/AzureSQL-Server/password",
        "AZURE_SQL_PORT": "1433",
        "AZURE_SQL_QUERY_TIMEOUT": "30000",
        "AZURE_SQL_MAX_RESULT_ROWS": "1000",
        "AZURE_SQL_MAX_RESPONSE_SIZE_MB": "10",
        "SQL_ENABLE_VIEW_MANAGE": "false",
        "SQL_ENABLE_VIEW_DROP": "false",
        "SQL_ENABLE_SPROC_MANAGE": "false",
        "SQL_ENABLE_SPROC_DROP": "false",
        "SQL_ENABLE_SPROC_EXECUTE": "false",
        "SQL_ENABLE_INSERT": "false",
        "SQL_ENABLE_UPDATE": "false",
        "SQL_ENABLE_DELETE": "false",
        "SQL_ENABLE_UNRESTRICTED": "false"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

> **PII protection (opt-in):** redaction is off by default. Set `PII_PROTECTION=true` to enable it.

```json
{
  "servers": {
    "azure-sql": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-sql", "mcp-sql"],
      "env": {
        "MCP_ENVIRONMENT_TYPE": "production",
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "AZURE_SQL_SERVERS": "[{\"id\":\"prod\",\"name\":\"Production\",\"server\":\"prod.database.windows.net\",\"port\":1433,\"active\":true,\"databases\":[{\"name\":\"AppDB\",\"active\":true}],\"username\":\"mcp_readonly\",\"password\":\"...\"}]",
        "AZURE_SQL_SERVER": "your-server.database.windows.net",
        "AZURE_SQL_DATABASE": "your-database-name",
        "AZURE_SQL_USERNAME": "your-username",
        "AZURE_SQL_PASSWORD": "your-password",
        "AZURE_SQL_PORT": "1433",
        "AZURE_SQL_QUERY_TIMEOUT": "30000",
        "AZURE_SQL_MAX_RESULT_ROWS": "1000",
        "AZURE_SQL_MAX_RESPONSE_SIZE_MB": "10",
        "SQL_ENABLE_VIEW_MANAGE": "false",
        "SQL_ENABLE_VIEW_DROP": "false",
        "SQL_ENABLE_SPROC_MANAGE": "false",
        "SQL_ENABLE_SPROC_DROP": "false",
        "SQL_ENABLE_SPROC_EXECUTE": "false",
        "SQL_ENABLE_INSERT": "false",
        "SQL_ENABLE_UPDATE": "false",
        "SQL_ENABLE_DELETE": "false",
        "SQL_ENABLE_UNRESTRICTED": "false"
      }
    }
  }
}
```

**Connection options:** provide either `AZURE_SQL_SERVERS` (a JSON array — recommended, multi-server) **or** the single-server quartet `AZURE_SQL_SERVER` / `AZURE_SQL_DATABASE` / `AZURE_SQL_USERNAME` / `AZURE_SQL_PASSWORD`. `AZURE_SQL_PORT` (default `1433`) applies to the single-server form.

**Azure AD authentication** is configured **per server, inside the `AZURE_SQL_SERVERS` JSON array** — not via top-level env vars. Add `useAzureAd` plus the three `azureAd*` fields to a server entry:

```json
"AZURE_SQL_SERVERS": "[{\"id\":\"prod\",\"name\":\"Production\",\"server\":\"prod.database.windows.net\",\"port\":1433,\"active\":true,\"databases\":[{\"name\":\"AppDB\",\"active\":true}],\"useAzureAd\":true,\"azureAdClientId\":\"<client-id>\",\"azureAdClientSecret\":\"<client-secret>\",\"azureAdTenantId\":\"<tenant-id>\"}]"
```

When `useAzureAd` is `true`, `username`/`password` are not used for that server. Leave `useAzureAd` off (or omit it) to use SQL authentication.

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "azure-sql": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `sql-database-overview` | Comprehensive overview of all database objects (tables, views, procedures, triggers, functions) |
| `sql-table-details` | Detailed table report including columns, indexes, and foreign key relationships |
| `sql-query-results` | Execute a SELECT query and return formatted results as a markdown table |

## Notable Behavior

- **Multi-server configuration** (`AZURE_SQL_SERVERS` JSON array) is the recommended approach for production. It supports multiple servers with per-server credentials, multiple databases per server, and database discovery mode (empty `databases[]` array queries `sys.databases`). Per-server Azure AD auth lives inside this array (`useAzureAd` + `azureAd*` fields).
- **`sql-execute-query` is read-only.** Only SELECT statements are accepted; write keywords are blocked at validation time.
- **DELETE requires a WHERE clause.** `sql-delete-records` will reject any DELETE statement without a WHERE clause to prevent accidental full-table deletion.
- **Each write tool is independently gated.** Enabling `SQL_ENABLE_INSERT` does not enable `SQL_ENABLE_DELETE`; each flag controls its own tool.
- **`sql-execute-unrestricted` is conditionally registered.** Unlike other write tools (which are always visible but throw when called with the flag off), this tool does not appear in the MCP tool list at all unless `SQL_ENABLE_UNRESTRICTED=true`. Use it as a break-glass for incident response or environment resets — it accepts any T-SQL including DDL, multi-statement batches, and `GO` separators.
- **PII protection is opt-in:** off by default; set `PII_PROTECTION=true` to redact. There is no environment-type gate — the server starts without it. When protection is off, a stderr warning fires if the configured `AZURE_SQL_SERVER` doesn't look like a non-prod environment.

## PII Protection (v31+)

A 4-layer redaction pipeline runs on every `sql-execute-query` result row (via `QueryService.executeQuery`). This is one of three packages that performs redaction — the others are `powerplatform-data` (Dataverse query responses) and `azure-devops` (work item fields and identity objects). See [pii-protection.md](pii-protection.md) for the full surface and layer-by-layer reference.

SQL has no per-column rules — Layers 3 (regex) and 4 (NER) do the work on every row's string values, catching emails, phones, ISO-format dates, and person names regardless of column name.

**PII protection is opt-in and off by default. Set `PII_PROTECTION=true` to enable redaction — there is no environment-type gate, and the server starts normally without it.**

| `PII_PROTECTION` | Behaviour |
|---|---|
| unset / `false` | pipeline off — raw data flows to the LLM (server starts normally) |
| `true` | redaction active on every response |

`MCP_ENVIRONMENT_TYPE` is advisory only in v32 — it no longer gates startup; it only feeds the "looks unprotected" stderr warning below. (Earlier v31 betas made both flags mandatory with a refuse-to-start gate; v32 relaxed that to pure opt-in.)

| Var | Values | Behaviour |
|-----|--------|-----------|
| `MCP_ENVIRONMENT_TYPE` | `production` \| `uat` \| `dev` | Optional, advisory only. Not a gate in v32; feeds the "looks unprotected" warning. |
| `PII_PROTECTION` | `true` \| `false` | Off by default. Set `true` to enable redaction; `false`/unset is permitted in any environment. |
| `PII_OBSERVE_MODE` | `true` \| `false` (default `false`) | When `true`, pipeline computes what it would redact but returns original data unchanged. Footer reports `(observe-mode — values not changed)`. |
| `PII_CONFIG_PATH` | path to JSON file (optional) | Per-layer toggles, per-entity field rules, regex patterns, NER scan-fields. See [pii-protection.md](pii-protection.md) for the schema. |
| `PII_NONPROD_HINTS` | comma-separated substrings (optional) | Override the URL-heuristic non-prod hint list (defaults: `dev,uat,training,support,migration,sandbox,test`). Identifier checked is `AZURE_SQL_SERVER` (or first server in `AZURE_SQL_SERVERS`). |

When PII protection is off (`PII_PROTECTION` unset or `false`), the loader checks the configured SQL server name against the non-prod hint list. If none match, a stderr warning fires at startup. Server still starts.

See [pii-protection.md](pii-protection.md) for config schema and [PII_PROTECTION_TECHNICAL.md](../technical/PII_PROTECTION_TECHNICAL.md) for layer-by-layer reference.

## Coming later (not yet active)

These connection-pool and timeout knobs are documented in earlier config examples but are **not read from the environment** — the server currently uses fixed built-in values. They are listed here so the intended configuration surface isn't lost:

| Variable | Purpose (planned) | Current fixed behaviour |
|----------|-------------------|-------------------------|
| `AZURE_SQL_CONNECTION_TIMEOUT` | Connection establishment timeout (ms) | Built-in default, not env-configurable |
| `AZURE_SQL_POOL_MIN` | Minimum pooled connections | Built-in default, not env-configurable |
| `AZURE_SQL_POOL_MAX` | Maximum pooled connections | Built-in default, not env-configurable |
