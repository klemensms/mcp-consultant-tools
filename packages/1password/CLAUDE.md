# 1Password Package

## Package Notes

- **Purpose:** Full CRUD access to 1Password vaults and items
- **Tools:** 21 tools, 0 prompts
- **Production-Safe:** NO — operational use; write, delete, and admin operations require explicit feature flags
- **Auth backends:** CLI mode (default, via `op` CLI + desktop app) or SDK mode (via `@1password/sdk` Service Account token)
- **SDK:** `@1password/sdk` (pinned to `~0.4.0`); v0.x — minor version changes may be breaking

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OP_SERVICE_ACCOUNT_TOKEN` | No | — | Service Account JWT token. If set → SDK mode. If unset → CLI mode |
| `OP_ALLOWED_VAULTS` | No | `*` | Comma-separated vault names or IDs. `*` = all accessible vaults |
| `OP_ENABLE_WRITE` | No | `false` | Enable create, update, archive operations |
| `OP_ENABLE_DELETE` | No | `false` | Enable delete operations (including batch delete) |
| `OP_ENABLE_VAULT_ADMIN` | No | `false` | Enable vault permission management (grant/update/revoke) |

**Auth mode auto-detection:** If `OP_SERVICE_ACCOUNT_TOKEN` is set, the server uses SDK mode. If not, it falls back to CLI mode using the `op` binary integrated with the 1Password desktop app.

**Vault filtering:** `OP_ALLOWED_VAULTS` accepts both vault names and UUIDs. Works in both auth modes. The client resolves names to IDs on first use and caches the mapping.

## Authentication Modes

### CLI Mode (Default)
When `OP_SERVICE_ACCOUNT_TOKEN` is NOT set, the server uses the `op` CLI integrated with the 1Password desktop app.

**Requirements:**
1. 1Password CLI installed (`brew install --cask 1password-cli`)
2. 1Password desktop app running and unlocked
3. "Integrate with 1Password CLI" enabled in Settings > Developer

**Advantages:** No service account setup, uses existing user session, biometric auth, no API limits.

**Known limitations:**
- Batch operations run sequentially (CLI has no native batch)
- `get-vault` with `includeAccessors` is not supported
- No optimistic concurrency on item updates (last write wins)

### SDK Mode (Service Account)
When `OP_SERVICE_ACCOUNT_TOKEN` is set, the server uses the `@1password/sdk` with a Service Account token.

**When to use:** Automated/unattended scenarios, CI/CD, shared MCP servers where biometric auth isn't possible.

## Key Tools by Tier

### Read (always enabled)
- `list-vaults` — List accessible vaults (filtered by `OP_ALLOWED_VAULTS`)
- `get-vault` — Get vault details, optionally including accessor (group) info
- `list-items` — List items in a vault with title/tag/state filtering (client-side)
- `get-item` — Get full item with all fields including concealed values
- `batch-get-items` — Get up to 50 items at once
- `search-items` — Search across all allowed vaults by title/tag
- `resolve-secret` — Resolve an `op://vault/item/field` reference to its value
- `resolve-secrets` — Resolve multiple references in one call (per-reference results)
- `generate-password` — Generate random, memorable, or PIN passwords

### Write (require `OP_ENABLE_WRITE=true`)
- `create-item` — Create item with category, fields, notes, tags, websites
- `update-item` — Update existing item (get-merge-put with optimistic concurrency)
- `archive-item` — Soft-remove an item
- `create-vault` — Create a new vault
- `update-vault` — Update vault name/description
- `batch-create-items` — Create up to 100 items at once

### Delete (require `OP_ENABLE_DELETE=true`)
- `delete-item` — Permanently delete an item (cannot be undone)
- `delete-vault` — Permanently delete a vault and all its items (cannot be undone)
- `batch-delete-items` — Delete multiple items at once (cannot be undone)

### Vault Admin (require `OP_ENABLE_VAULT_ADMIN=true`)
- `grant-vault-permissions` — Grant group(s) access to a vault
- `update-vault-permissions` — Update group permissions (each entry specifies its own vaultId)
- `revoke-vault-permissions` — Remove group(s) access from a vault

## Permissions Model

Tools accept human-readable permission names: `read`, `create`, `update`, `delete`, `share`, `manage`. The service layer converts these to the SDK's numeric bitmask internally.

## Update Pattern

`update-item` uses **get-merge-put**: the service fetches the current item, merges the caller's changes, then puts the full object back. The item's `version` field is used for optimistic concurrency — concurrent edits will be detected and an error returned suggesting a retry.

## CLI Usage

Binary: `mcp-op-cli`

```bash
# Vault operations
mcp-op-cli vault list
mcp-op-cli vault get <vaultId> --include-accessors
mcp-op-cli vault create "My Vault" --description "Description here"
mcp-op-cli vault update <vaultId> --name "New Name"
mcp-op-cli vault delete <vaultId>
mcp-op-cli vault grant <vaultId> --group <groupId> --permissions read,create,update
mcp-op-cli vault update-permissions --group <groupId> --vault <vaultId> --permissions read,create,update,delete
mcp-op-cli vault revoke <vaultId> --groups <groupId1>,<groupId2>

# Item operations
mcp-op-cli item list <vaultId> --title "search" --tag "azure" --state active
mcp-op-cli item get <vaultId> <itemId>
mcp-op-cli item batch-get <vaultId> --ids <id1>,<id2>,<id3>
mcp-op-cli item search --title "search" --tag "azure"
mcp-op-cli item create <vaultId> --category Login --title "My Login" --fields '{"username":"admin","password":"secret"}' --notes "Created by agent"
mcp-op-cli item update <vaultId> <itemId> --title "New Title" --tags "azure,prod"
mcp-op-cli item archive <vaultId> <itemId>
mcp-op-cli item delete <vaultId> <itemId>
mcp-op-cli item batch-create <vaultId> --file items.json
mcp-op-cli item batch-delete <vaultId> --ids <id1>,<id2>

# Secret operations
mcp-op-cli secret resolve "op://MyVault/MyItem/password"
mcp-op-cli secret resolve-all "op://MyVault/MyItem/username" "op://MyVault/MyItem/password"
mcp-op-cli secret generate-password --type random --length 32 --include-symbols --include-digits
mcp-op-cli secret generate-password --type memorable --word-count 4 --separator digits
mcp-op-cli secret generate-password --type pin --length 8
```

Output: summary to stdout, full JSON cached to `.context/.mcp-op-cache/`.
