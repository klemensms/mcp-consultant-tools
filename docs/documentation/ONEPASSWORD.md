# 1Password

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/ONEPASSWORD_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/1password`

MCP server for full CRUD access to 1Password vaults and items. Read operations are always enabled. Write, delete, and vault admin operations are disabled by default and require explicit feature flags.

## Prerequisites (One-Time Setup)

By default, this MCP server authenticates through the 1Password desktop app on your machine. Before using it, complete these steps once:

**1. Install the 1Password CLI**

```bash
brew install --cask 1password-cli
```

**2. Enable CLI integration in the 1Password desktop app**

Open **1Password** > **Settings** > **Developer** > tick **"Integrate with 1Password CLI"**.

This allows the `op` CLI to use the desktop app's session — no separate login or Service Account token needed. The desktop app must be running and unlocked when the MCP server is used.

> **Alternative: Service Account mode** — If you need unattended/automated access (CI/CD, shared servers) where biometric auth isn't possible, you can use a Service Account token instead. See [SDK Mode](#sdk-mode-service-account) below.

## Quick Start (CLI Mode)

No token needed — just install the CLI and enable integration above, then add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code

```json
{
  "servers": {
    "1password": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/1password", "mcp-op"],
      "env": {
        "OP_ACCOUNT": "",
        "OP_ALLOWED_VAULTS": "*",
        "OP_ENABLE_WRITE": "false",
        "OP_ENABLE_DELETE": "false",
        "OP_ENABLE_VAULT_ADMIN": "false"
      }
    }
  }
}
```

**`OP_ACCOUNT`** — Required if you have multiple 1Password accounts (personal + team). Set to the account URL shorthand (e.g., `my.1password.com` for personal, `mycompany.1password.eu` for team). Find yours with: `op account list`

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "1password": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## SDK Mode (Service Account)

For automated/unattended scenarios where the desktop app is not available, set `OP_SERVICE_ACCOUNT_TOKEN`. When this token is present, the server uses the `@1password/sdk` instead of the CLI.

### VS Code

```json
{
  "servers": {
    "1password": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/1password", "mcp-op"],
      "env": {
        "OP_SERVICE_ACCOUNT_TOKEN": "<your-service-account-token>",
        "OP_ALLOWED_VAULTS": "*",
        "OP_ENABLE_WRITE": "false",
        "OP_ENABLE_DELETE": "false",
        "OP_ENABLE_VAULT_ADMIN": "false"
      }
    }
  }
}
```

For **Claude Desktop**, wrap the same `env` block in `mcpServers` in `claude_desktop_config.json`.

Create a Service Account at: https://my.1password.com/developer-tools/infrastructure-secrets/serviceaccount/

## Feature Flags

All write operations are **disabled by default**. Enable only the tiers you need:

| Flag | Default | Enables |
|------|---------|---------|
| `OP_ENABLE_WRITE` | `false` | `create-item`, `update-item`, `archive-item`, `create-vault`, `update-vault`, `batch-create-items` |
| `OP_ENABLE_DELETE` | `false` | `delete-item`, `delete-vault`, `batch-delete-items` |
| `OP_ENABLE_VAULT_ADMIN` | `false` | `grant-vault-permissions`, `update-vault-permissions`, `revoke-vault-permissions` |

Read tools (`list-vaults`, `get-vault`, `list-items`, `get-item`, `batch-get-items`, `search-items`, `resolve-secret`, `resolve-secrets`, `generate-password`) are always available regardless of flags.

## Notable Behavior

- **Auth auto-detection:** If `OP_SERVICE_ACCOUNT_TOKEN` is set → SDK mode. If not → CLI mode (desktop app integration). No explicit mode toggle needed.
- **Vault filtering:** `OP_ALLOWED_VAULTS` accepts vault names or UUIDs (comma-separated). `*` allows all accessible vaults. Works in both auth modes.
- **Concealed fields are always returned by `get-item`:** Both backends return concealed field values (passwords, secrets) in full. The caller is responsible for handling sensitive values appropriately.
- **`update-item` uses get-merge-put:** The service fetches the current item, merges changes, and writes back the full object. In SDK mode, optimistic concurrency via the item's `version` field detects conflicts. In CLI mode, last write wins.
- **`delete-item` and `delete-vault` are permanent:** There is no recycle bin or undo for delete operations. Prefer `archive-item` for soft removal.
- **CLI mode batch operations:** Batch operations (batch-get, batch-create, batch-delete) run sequentially in CLI mode since the `op` CLI has no native batch support. Slightly slower for large sets.
- **Rate limits (SDK mode only):** ~10,000 requests/day per Service Account, ~50,000/day per 1Password Business account. CLI mode has no API rate limits (runs locally).
