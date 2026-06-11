# Azure AD B2C

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/AZURE_B2C_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/azure-b2c`

MCP server for Azure Active Directory B2C user management via Microsoft Graph API. Provides read and write operations for users and groups, with separate feature flags for each write operation category.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

> **PII protection (opt-in):** redaction is off by default. Set `PII_PROTECTION=true` to enable it. See [PII Protection](#pii-protection-v31) below.

```json
{
  "servers": {
    "azure-b2c": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-b2c@beta", "mcp-azure-b2c"],
      "env": {
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "AZURE_B2C_TENANT_ID": "op://Work/AzureB2C-App-Registration/tenantid",
        "AZURE_B2C_CLIENT_ID": "op://Work/AzureB2C-App-Registration/username",
        "AZURE_B2C_CLIENT_SECRET": "op://Work/AzureB2C-App-Registration/password",
        "AZURE_B2C_ENABLE_PASSWORD_RESET": "false",
        "AZURE_B2C_ENABLE_USER_CREATE": "false",
        "AZURE_B2C_ENABLE_USER_UPDATE": "false",
        "AZURE_B2C_ENABLE_USER_DELETE": "false",
        "AZURE_B2C_MAX_RESULTS": "100"
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
    "azure-b2c": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-b2c", "mcp-azure-b2c"],
      "env": {
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "AZURE_B2C_TENANT_ID": "contoso.onmicrosoft.com",
        "AZURE_B2C_CLIENT_ID": "12345678-1234-1234-1234-123456789012",
        "AZURE_B2C_CLIENT_SECRET": "your-client-secret",
        "AZURE_B2C_ENABLE_PASSWORD_RESET": "false",
        "AZURE_B2C_ENABLE_USER_CREATE": "false",
        "AZURE_B2C_ENABLE_USER_UPDATE": "false",
        "AZURE_B2C_ENABLE_USER_DELETE": "false",
        "AZURE_B2C_MAX_RESULTS": "100"
      }
    }
  }
}
```

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "azure-b2c": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

**App registration requires:**
- `User.ReadWrite.All` (or `User.Read.All` for read-only)
- `Directory.ReadWrite.All` for group operations
- **User Administrator** directory role for password reset operations

## Prompts

| Prompt | Description |
|--------|-------------|
| `b2c-user-overview` | Fetches a user's profile and group memberships in one call, formatted as structured markdown |
| `b2c-tenant-summary` | Returns user and group counts, broken down by enabled/disabled and local/federated account types |

## Notable Behavior

- All write operations are **disabled by default**. Each category (password, create, update, delete) has its own flag — enable only what you need.
- Password operations (`b2c-reset-user-password`, `b2c-force-pwd-change`) only work for **local accounts** (email/password sign-in). They fail silently for social or federated accounts.
- `b2c-delete-user` requires both `AZURE_B2C_ENABLE_USER_DELETE=true` and `confirmDeletion: true` in the tool call. Deletion is irreversible.
- `b2c-list-users` and `b2c-get-user` accept `includeAllFields=true` to return all Graph API fields, including `extension_*` custom attributes (e.g., `CrmContactId`, `MemberId`).
- **PII protection is opt-in:** off by default; set `PII_PROTECTION=true` to redact. There is no environment-type gate — the server starts without it. When protection is off, a stderr warning fires if the configured tenant ID (`AZURE_B2C_TENANT_ID`) doesn't look like a non-prod environment.

## PII Protection (v31+)

A 4-layer redaction pipeline runs on every B2C user response (`b2c-list-users`, `b2c-get-user`, `b2c-search-users`, `b2c-create-user`, `b2c-update-user`). Default field rules redact `givenName`, `surname`, `displayName`, `mail`, `otherMails`, `mobilePhone`. The L3 email regex additionally catches `userPrincipalName` (typically email-shaped). Borderline fields (`streetAddress`, `city`, `postalCode`, `country`, `jobTitle`) are NOT in defaults — opt-in via `PII_CONFIG_PATH` if a particular client treats those as PII.

This is one of five packages that performs redaction — the others are `powerplatform-data` (Dataverse query responses), `azure-devops` (work-item fields), `azure-sql` (SQL query rows), and `rest-api` (any HTTP body). See [pii-protection.md](pii-protection.md) for the full surface and layer-by-layer reference.

**PII protection is opt-in and off by default. Set `PII_PROTECTION=true` to enable redaction — there is no environment-type gate, and the server starts normally without it.**

| `PII_PROTECTION` | Behaviour |
|---|---|
| unset / `false` | pipeline off — raw data flows to the LLM (server starts normally) |
| `true` | redaction active on every response |

| Var | Values | Behaviour |
|-----|--------|-----------|
| `PII_PROTECTION` | `true` \| `false` | Off by default. Set `true` to enable redaction; `false`/unset is permitted in any environment. |
| `PII_OBSERVE_MODE` | `true` \| `false` (default `false`) | When `true`, pipeline computes what it would redact but returns original data unchanged. |
| `PII_CONFIG_PATH` | path to JSON file (optional) | Per-layer toggles, per-entity field rules. Use to opt borderline fields (`streetAddress`, `jobTitle`) into the `b2c-user` rule set, or to disable redaction for `displayName` if your tenant uses non-PII display names. |
| `PII_NONPROD_HINTS` | comma-separated substrings (optional) | Override URL-heuristic non-prod hint list. Identifier checked is `AZURE_B2C_TENANT_ID`. |
| `PII_SESSION_SALT` | 64-char hex string (optional, v31.0.0-beta.2+) | Set the **same value** in every MCP server's `env:` block to share salts and enable cross-MCP token correlation (e.g. linking a B2C user's email to a CRM contact's email). Generate with `openssl rand -hex 32`. Rotate per engagement. |

When PII protection is off (`PII_PROTECTION` unset or `false`), the loader checks the configured `AZURE_B2C_TENANT_ID` against the non-prod hint list. If none match, a stderr warning fires at startup. Server still starts.

See [pii-protection.md](pii-protection.md) for config schema and [PII_PROTECTION_TECHNICAL.md](../technical/PII_PROTECTION_TECHNICAL.md) for layer-by-layer reference.

## Coming later (not yet active)

This variable is documented in shared config examples but **not read by this package** — setting it currently has no effect. The environment type is fixed to `production` internally. It is listed here so the intended configuration surface isn't lost:

| Variable | Purpose (planned) |
|----------|-------------------|
| `MCP_ENVIRONMENT_TYPE` | Declare the target environment (`production` \| `uat` \| `dev`). Currently inert for this package — fixed to `production`; not consumed by the server. |
