# 1Password - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/ONEPASSWORD.md -->

<overview>

The 1Password integration provides full CRUD access to 1Password vaults and items via the `@1password/sdk` Service Account SDK. Read operations are always available. Write, delete, and vault admin operations are gated behind separate feature flags, all disabled by default (fail-closed).

**Package:** `@mcp-consultant-tools/1password`
**MCP binary:** `mcp-op`
**CLI binary:** `mcp-op-cli`
**Total tools:** 21 (9 read-only + 6 write + 3 delete + 3 vault admin)
**Prompts:** 0

</overview>

<architecture>

## Architecture

**Service classes:**
- `OnePasswordClient` — SDK wrapper with lazy init, vault name-to-ID resolution, and allowlist enforcement
- `ItemService` — Item CRUD, search, and batch operations
- `VaultService` — Vault CRUD and permission management
- `SecretService` — Secret reference resolution and password generation

**ServiceContext** (`types.ts`):
```typescript
interface ServiceContext {
  readonly client: OnePasswordClient;
  readonly items: ItemService;
  readonly vaults: VaultService;
  readonly secrets: SecretService;
  checkWriteEnabled(): void;
  checkDeleteEnabled(): void;
  checkVaultAdminEnabled(): void;
}
```

**Source layout:**
```
packages/1password/src/
  index.ts                    # MCP server entry + registerOnePasswordTools()
  onepassword-client.ts       # SDK wrapper (lazy init, vault filtering, name→ID resolution)
  types.ts                    # ServiceContext, OnePasswordConfig interfaces
  tool-examples.ts            # descWithExamples helper + domain examples
  context-factory.ts          # Shared createServiceContext() for MCP + CLI
  cli.ts                      # CLI entry point
  models/
    index.ts
    api-types.ts              # Item, Vault, Field types; permission constants
  services/
    index.ts
    item-service.ts           # Item CRUD + search + batch (~250-350 lines)
    vault-service.ts          # Vault CRUD + permissions (~200-250 lines)
    secret-service.ts         # Secret resolution + password generation (~100-150 lines)
  tools/
    index.ts                  # registerAllTools() aggregator
    item-tools.ts             # 10 item tools
    vault-tools.ts            # 8 vault tools
    secret-tools.ts           # 3 secret tools
  cli/
    output.ts                 # Cache dir: .mcp-op-cache
    commands/
      index.ts
      item-commands.ts
      vault-commands.ts
      secret-commands.ts
```

</architecture>

<configuration>

## Configuration

<environment-variables>

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OP_SERVICE_ACCOUNT_TOKEN` | Yes | — | Service Account JWT token from 1Password |
| `OP_ALLOWED_VAULTS` | No | `*` | Comma-separated vault names or IDs. `*` = all vaults accessible to the SA |
| `OP_ENABLE_WRITE` | No | `false` | Enable create, update, and archive operations |
| `OP_ENABLE_DELETE` | No | `false` | Enable delete operations (item, vault, batch delete) |
| `OP_ENABLE_VAULT_ADMIN` | No | `false` | Enable vault permission management (grant/update/revoke) |

**Vault filtering details:**
- `OP_ALLOWED_VAULTS=*` — no secondary filter; SA permissions are the only constraint
- `OP_ALLOWED_VAULTS=MyVault,TeamVault` — accept only these two vaults by name
- `OP_ALLOWED_VAULTS=abc123,def456` — accept only these vault UUIDs
- Mixed names and UUIDs are supported in the same list
- The client resolves names to IDs on first use and caches the mapping for the session
- SA vault permissions are immutable after SA creation; `OP_ALLOWED_VAULTS` provides a flexible secondary control

</environment-variables>

<sdk-version>

### SDK Version

**`@1password/sdk`** is pinned to `~0.4.0`. This is a v0.x SDK — patch versions are safe; minor versions may introduce breaking changes. Before upgrading beyond the pinned range, review the SDK changelog.

The SDK authenticates via `OP_SERVICE_ACCOUNT_TOKEN` (Service Account JWT). Service Accounts are created in the 1Password admin console and granted vault-level permissions at creation time.

</sdk-version>

</configuration>

<feature-flags>

## Feature Flags

Feature flag guards are implemented as methods on `ServiceContext`. They throw with the exact env var name needed:

```
"Write operations are disabled. Set OP_ENABLE_WRITE=true to enable."
"Delete operations are disabled. Set OP_ENABLE_DELETE=true to enable."
"Vault admin operations are disabled. Set OP_ENABLE_VAULT_ADMIN=true to enable."
```

Unlike some other packages, all tools are always registered in the MCP tool list regardless of flag state. The guard is enforced at call time, not at registration time.

| Flag | Default | Gated Tools |
|------|---------|-------------|
| `OP_ENABLE_WRITE` | `false` | `create-item`, `update-item`, `archive-item`, `create-vault`, `update-vault`, `batch-create-items` |
| `OP_ENABLE_DELETE` | `false` | `delete-item`, `delete-vault`, `batch-delete-items` |
| `OP_ENABLE_VAULT_ADMIN` | `false` | `grant-vault-permissions`, `update-vault-permissions`, `revoke-vault-permissions` |

</feature-flags>

<tool-reference>

## Tool Reference

### Vault Tools

<tool name="list-vaults">

**`list-vaults`** — List accessible 1Password vaults, filtered by `OP_ALLOWED_VAULTS`. Always enabled. Takes no parameters.

Returns: array of vault objects with `id`, `name`, `description`, `type`, `createdAt`, `updatedAt`.

</tool>

<tool name="get-vault">

**`get-vault`** — Get vault details by name or ID. Always enabled.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `includeAccessors` | boolean | No | Include groups with access to this vault |

Returns: vault object. When `includeAccessors: true`, includes `accessors` array with group IDs and permission bitmasks.

</tool>

<tool name="create-vault">

**`create-vault`** — Create a new 1Password vault. Requires `OP_ENABLE_WRITE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Vault name |
| `description` | string | No | Vault description |

Returns: created vault object with `id`, `name`, `description`.

</tool>

<tool name="update-vault">

**`update-vault`** — Update vault name or description. Requires `OP_ENABLE_WRITE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `name` | string | No | New vault name |
| `description` | string | No | New vault description |

</tool>

<tool name="delete-vault">

**`delete-vault`** — Permanently delete a vault and all its items. This cannot be undone. Requires `OP_ENABLE_DELETE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |

</tool>

<tool name="grant-vault-permissions">

**`grant-vault-permissions`** — Grant group(s) access to a vault. Requires `OP_ENABLE_VAULT_ADMIN=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `groupPermissions` | array | Yes | Array of `{ groupId: string, permissions: string[] }` |

`permissions` accepts: `"read"`, `"create"`, `"update"`, `"delete"`, `"share"`, `"manage"`. The service converts to the SDK's numeric bitmask.

</tool>

<tool name="update-vault-permissions">

**`update-vault-permissions`** — Update group vault permissions. Each entry in the array includes its own `vaultId`, allowing cross-vault updates in one call. Requires `OP_ENABLE_VAULT_ADMIN=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `groupPermissions` | array | Yes | Array of `{ vaultId: string, groupId: string, permissions: string[] }` |

</tool>

<tool name="revoke-vault-permissions">

**`revoke-vault-permissions`** — Remove group(s) access from a vault. Requires `OP_ENABLE_VAULT_ADMIN=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `groupIds` | string[] | Yes | Array of group UUIDs to revoke |

</tool>

### Item Tools

<tool name="list-items">

**`list-items`** — List items in a vault with optional filtering. Filtering is client-side (the SDK only supports state filtering natively). Always enabled.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `title` | string | No | Filter by title (substring match, case-insensitive) |
| `tag` | string | No | Filter by tag (exact match, case-insensitive) |
| `state` | `"active"` \| `"archived"` | No | Filter by item state (default: all) |

Returns: array of `ItemOverview` objects (summary, not full field data). Use `get-item` for full field values.

</tool>

<tool name="get-item">

**`get-item`** — Get full item details including all field values. Concealed fields (passwords, secrets) are returned in full by the SDK — callers are responsible for handling sensitive values. Always enabled.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `itemId` | string | Yes | Item UUID |

Returns: full `Item` object including `id`, `vaultId`, `category`, `title`, `fields`, `notes`, `tags`, `websites`, `version`.

</tool>

<tool name="batch-get-items">

**`batch-get-items`** — Get up to 50 items at once from a vault. Uses SDK `items.getAll()`. Always enabled.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `itemIds` | string[] | Yes | Array of item UUIDs (max 50) |

Returns partial results if some IDs are not found — see error handling section.

</tool>

<tool name="search-items">

**`search-items`** — Search items across all allowed vaults by title and/or tag. Iterates each allowed vault and aggregates matching items. Always enabled.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | No | Filter by title (substring match, case-insensitive) |
| `tag` | string | No | Filter by tag (exact match, case-insensitive) |

Returns: array of `ItemOverview` objects with an additional `vaultId` field indicating which vault each item came from.

</tool>

<tool name="create-item">

**`create-item`** — Create a new item in a 1Password vault. Requires `OP_ENABLE_WRITE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `category` | string | Yes | Item category (see supported categories below) |
| `title` | string | Yes | Item title |
| `fields` | array | No | Item fields (see field structure below) |
| `notes` | string | No | Item notes — top-level property, not a field |
| `tags` | string[] | No | Item tags for categorization |
| `websites` | array | No | Website entries for autofill (Login/Password items) |

**Supported categories:** Login, SecureNote, CreditCard, CryptoWallet, Identity, Password, Document, ApiCredentials, BankAccount, Database, DriverLicense, Email, MedicalRecord, Membership, OutdoorLicense, Passport, Rewards, Router, Server, SshKey, SocialSecurityNumber, SoftwareLicense, Person

**Field structure:**
```json
{
  "id": "username",
  "title": "Username",
  "fieldType": "Text",
  "value": "admin@example.com"
}
```

**Supported field types:** Address, Concealed, CreditCardNumber, CreditCardType, Date, Email, Menu, MonthYear, Phone, Reference, Text, Totp, Url, SSHKey

**Notes are a top-level property**, not an `ItemField`. Pass them via the `notes` parameter, not inside `fields[]`.

Returns: created item object with assigned `id`.

</tool>

<tool name="update-item">

**`update-item`** — Update an existing item using get-merge-put. Only include fields to change. Requires `OP_ENABLE_WRITE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `itemId` | string | Yes | Item UUID |
| `title` | string | No | New title |
| `fields` | array | No | Fields to update (matched by `id` or `title`) |
| `notes` | string | No | New notes (replaces existing) |
| `tags` | string[] | No | New tags (replaces existing) |

**Implementation:** The service fetches the current item (`items.get()`), merges the caller's changes, then writes the full object back (`items.put()`). The item `version` field is used for optimistic concurrency — if the item was modified between get and put, the SDK rejects the operation and the service returns an error suggesting a retry.

</tool>

<tool name="archive-item">

**`archive-item`** — Archive an item (soft removal). Item is hidden from default views but can be restored. Requires `OP_ENABLE_WRITE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `itemId` | string | Yes | Item UUID |

Uses SDK `items.archive()` — this is a dedicated SDK method, not a state update via `put`.

</tool>

<tool name="batch-create-items">

**`batch-create-items`** — Create up to 100 items at once using SDK `items.createAll()`. Requires `OP_ENABLE_WRITE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `items` | array | Yes | Array of item objects to create (max 100) |

Each item in the array follows the same structure as `create-item` parameters. Returns per-item success/error results (partial success is surfaced, not atomic failure).

</tool>

<tool name="delete-item">

**`delete-item`** — Permanently delete an item. This cannot be undone. Consider `archive-item` for soft removal. Requires `OP_ENABLE_DELETE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `itemId` | string | Yes | Item UUID |

</tool>

<tool name="batch-delete-items">

**`batch-delete-items`** — Delete multiple items at once. This cannot be undone. Uses SDK `items.deleteAll()`. Requires `OP_ENABLE_DELETE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultId` | string | Yes | Vault name or UUID |
| `itemIds` | string[] | Yes | Array of item UUIDs |

Returns per-item results — partial failure is surfaced with details on which items succeeded and which failed.

</tool>

### Secret Tools

<tool name="resolve-secret">

**`resolve-secret`** — Resolve a single 1Password secret reference URI to its value. Always enabled.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reference` | string | Yes | Secret reference in `op://vault/item/field` format |

Examples:
- `op://MyVault/MyItem/password`
- `op://Infrastructure/DB Server/credentials/password`
- `op://ab1c2de3fg4hi5jk6lm7no8p/abc123def456/username`

Returns: the resolved secret value as a plain string.

</tool>

<tool name="resolve-secrets">

**`resolve-secrets`** — Resolve multiple secret references in one call. Uses SDK `secrets.resolveAll()`. Always enabled.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `references` | string[] | Yes | Array of `op://` reference URIs |

Returns: per-reference results array. Each entry has either `value` (on success) or `error` (on failure). Partial failures are surfaced individually — a single failed reference does not fail the whole call.

</tool>

<tool name="generate-password">

**`generate-password`** — Generate a password or passphrase using 1Password's generator. Uses the SDK static method `Secrets.generatePassword(recipe)`. Always enabled.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | `"random"` \| `"memorable"` \| `"pin"` | Yes | Password type |
| `length` | number | No | Length (random: default 32; pin: default 6; not used for memorable) |
| `includeDigits` | boolean | No | Include digits (random only, default true) |
| `includeSymbols` | boolean | No | Include symbols (random only, default true) |
| `includeUppercase` | boolean | No | Include uppercase (random only, default true) |
| `includeLowercase` | boolean | No | Include lowercase (random only, default true) |
| `wordCount` | number | No | Number of words (memorable only, default 4) |
| `separator` | string | No | Word separator type (memorable only: `digits`, `symbols`, `spaces`, `none`) |
| `capitalize` | boolean | No | Capitalize words (memorable only, default true) |

Returns: generated password/passphrase as a plain string.

</tool>

</tool-reference>

<vault-permissions>

## Vault Permission Model

The SDK uses a numeric bitmask for permissions. The service layer accepts human-readable strings and converts internally:

| Human-Readable | SDK Constant | Description |
|----------------|-------------|-------------|
| `"read"` | `READ_ITEMS` | View items in the vault |
| `"create"` | `CREATE_ITEMS` | Create new items |
| `"update"` | `UPDATE_ITEMS` | Modify existing items |
| `"delete"` | `DELETE_ITEMS` | Delete items |
| `"share"` | `SHARE_ITEMS` | Share items externally |
| `"manage"` | `MANAGE_VAULT` | Manage vault settings |

Example usage:
```json
{
  "vaultId": "Infrastructure",
  "groupPermissions": [
    { "groupId": "abc123", "permissions": ["read", "create", "update"] },
    { "groupId": "def456", "permissions": ["read"] }
  ]
}
```

</vault-permissions>

<error-handling>

## Error Handling

All tool handlers catch errors and return `isError: true` with a descriptive message. The service layer does not throw unhandled exceptions to the MCP transport.

| Error Condition | Response |
|----------------|---------|
| Vault/item not found | `isError: true` with the ID that was not found |
| Vault not in `OP_ALLOWED_VAULTS` | `isError: true` listing the allowed vaults |
| Feature flag disabled | `isError: true` with the exact env var to set |
| Invalid/expired SA token | `isError: true` with hint to check `OP_SERVICE_ACCOUNT_TOKEN` |
| Optimistic concurrency conflict on `update-item` | `isError: true` suggesting caller re-fetch and retry |
| Batch partial failure | Per-item success/error details; not an atomic failure |
| Rate limit | `isError: true` with retry-after hint if provided by SDK |

**Feature flag error messages (exact text):**
- `"Write operations are disabled. Set OP_ENABLE_WRITE=true to enable."`
- `"Delete operations are disabled. Set OP_ENABLE_DELETE=true to enable."`
- `"Vault admin operations are disabled. Set OP_ENABLE_VAULT_ADMIN=true to enable."`

</error-handling>

<security>

## Security Considerations

- **Service Account token** must be stored as an environment variable and never committed to source control. Rotate immediately if exposed.
- **Vault filtering** (`OP_ALLOWED_VAULTS`) provides defense-in-depth. SA permissions are the primary control; `OP_ALLOWED_VAULTS` is a configurable secondary filter.
- **Feature flags default to disabled** — fail-closed. The safest state is the default state.
- **Delete vs. archive:** Delete is permanent and cannot be undone. Prefer `archive-item` for workflows that may need reversal.
- **`OP_ENABLE_DELETE` is separate from `OP_ENABLE_WRITE`** — delete is the most destructive operation and requires its own explicit opt-in.
- **`OP_ENABLE_VAULT_ADMIN` is the highest privilege tier** — vault permission changes affect all users with access. Requires its own separate opt-in.
- **Concealed fields are returned in full** — `get-item` returns password/secret field values. This is SDK behavior. The caller is responsible for not logging or persisting these values inappropriately.
- **MCP protocol compliance:** All logging uses `console.error()` (stderr). `console.log()` (stdout) is never used — stdout is reserved for the MCP JSON protocol.
- **Optimistic concurrency on updates** — the `version` field prevents silent overwrites when multiple agents or users modify the same item concurrently.
- **Rate limits:** ~10,000 requests/day per SA token; ~50,000/day per 1Password Business account. Use batch tools (`batch-get-items`, `batch-create-items`, `batch-delete-items`, `resolve-secrets`) to stay within limits.

</security>

<cli-architecture>

## CLI Architecture

**Binary:** `mcp-op-cli`

The CLI shares the same `ServiceContext` as the MCP server via `context-factory.ts`. All business logic lives in the service layer — CLI commands are thin wrappers.

### Command Groups

| Group | Commands |
|-------|---------|
| `vault` | `list`, `get`, `create`, `update`, `delete`, `grant`, `update-permissions`, `revoke` |
| `item` | `list`, `get`, `batch-get`, `search`, `create`, `update`, `archive`, `delete`, `batch-create`, `batch-delete` |
| `secret` | `resolve`, `resolve-all`, `generate-password` |

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of formatted summary |
| `--no-cache` | Skip writing output to cache directory |
| `--env-file <path>` | Load env from a specific file (default: `.env`) |

### Cache Directory

Output JSON is cached to `.context/.mcp-op-cache/` for retrieval without re-fetching.

### Example Commands

```bash
# List all vaults
mcp-op-cli vault list

# Get vault with group accessor details
mcp-op-cli vault get "Infrastructure" --include-accessors

# Search items across all vaults
mcp-op-cli item search --title "azure" --tag "prod"

# Resolve a secret reference
mcp-op-cli secret resolve "op://Infrastructure/DB Server/password"

# Resolve multiple references
mcp-op-cli secret resolve-all \
  "op://Infrastructure/DB Server/username" \
  "op://Infrastructure/DB Server/password"

# Generate a memorable passphrase
mcp-op-cli secret generate-password --type memorable --word-count 4 --separator digits

# Create a Login item
mcp-op-cli item create "MyVault" \
  --category Login \
  --title "My API Account" \
  --fields '{"username":"admin@example.com","password":"s3cr3t"}' \
  --notes "Created by provisioning agent"

# Batch delete (requires OP_ENABLE_DELETE=true)
mcp-op-cli item batch-delete "MyVault" --ids "abc123,def456,ghi789"

# Grant vault access to groups (requires OP_ENABLE_VAULT_ADMIN=true)
mcp-op-cli vault grant "Infrastructure" \
  --group "group-uuid-here" \
  --permissions "read,create,update"
```

</cli-architecture>

