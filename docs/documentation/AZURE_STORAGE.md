# Azure Storage

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/AZURE_STORAGE_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/azure-storage`

MCP server providing read and write access to all four Azure Storage services — Blob, File Shares, Queue, and Table — across multiple storage accounts. Read-only by default; write and delete operations are behind feature flags.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "azure-storage": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-storage@beta", "mcp-storage"],
      "env": {
        "AZURE_STORAGE_AUTH_METHOD": "entra-id",
        "AZURE_STORAGE_TENANT_ID": "op://Work/AzureStorage-App-Registration/tenantid",
        "AZURE_STORAGE_CLIENT_ID": "op://Work/AzureStorage-App-Registration/username",
        "AZURE_STORAGE_CLIENT_SECRET": "op://Work/AzureStorage-App-Registration/password",
        "AZURE_STORAGE_ACCOUNTS": "[{\"id\":\"prod\",\"name\":\"Production\",\"accountName\":\"mystorageaccount\",\"active\":true}]",
        "AZURE_STORAGE_ACCOUNT_NAME": "",
        "AZURE_STORAGE_CONNECTION_STRING": "op://Work/AzureStorage-ConnectionString/password",
        "AZURE_STORAGE_MAX_BLOB_SIZE_MB": "100",
        "AZURE_STORAGE_MAX_LIST_RESULTS": "1000",
        "AZURE_STORAGE_ENABLE_WRITE": "false",
        "AZURE_STORAGE_ENABLE_DELETE": "false"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "azure-storage": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-storage", "mcp-storage"],
      "env": {
        "AZURE_STORAGE_AUTH_METHOD": "entra-id",
        "AZURE_STORAGE_TENANT_ID": "your-tenant-id",
        "AZURE_STORAGE_CLIENT_ID": "your-client-id",
        "AZURE_STORAGE_CLIENT_SECRET": "your-client-secret",
        "AZURE_STORAGE_ACCOUNTS": "[{\"id\":\"prod\",\"name\":\"Production\",\"accountName\":\"mystorageaccount\",\"active\":true}]",
        "AZURE_STORAGE_ACCOUNT_NAME": "",
        "AZURE_STORAGE_CONNECTION_STRING": "",
        "AZURE_STORAGE_MAX_BLOB_SIZE_MB": "100",
        "AZURE_STORAGE_MAX_LIST_RESULTS": "1000",
        "AZURE_STORAGE_ENABLE_WRITE": "false",
        "AZURE_STORAGE_ENABLE_DELETE": "false"
      }
    }
  }
}
```

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "azure-storage": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `storage-account-overview` | Complete account overview: containers, queues, tables, file shares |
| `blob-container-analysis` | Container statistics with blob types, sizes, access tiers, and tag distribution |
| `blob-search-guide` | Guided workflow for finding blobs by prefix, metadata, or index tags |
| `queue-health-check` | Queue health report: message counts, approximate age, poison queue status |
| `table-schema-discovery` | Discover entity structure, partition key patterns, and sample entities |
| `file-share-audit` | File share audit: directory structure, file sizes, quota usage |
| `storage-migration-verification` | Compare source and destination containers for migration completeness |
| `storage-troubleshooting-guide` | Authentication checks, network diagnostics, and common error resolutions |

## Notable Behavior

- **Read-only by default.** 19 write tools and 10 delete tools are gated behind `AZURE_STORAGE_ENABLE_WRITE=true` and `AZURE_STORAGE_ENABLE_DELETE=true`. Tools are always visible in MCP but return a clear error if called without the required flag.
- **Multi-account.** Configure multiple accounts in `AZURE_STORAGE_ACCOUNTS` as a JSON array. Each account has an `id` used in every tool call. Accounts can be toggled active/inactive without removing config.
- **Blob index tags vs metadata.** Tags (`blob-set-tags`) are indexed and searchable across containers with `blob-search-tags`. Metadata (`blob-set-metadata`) is not indexed and cannot be searched.
- **Queue receive vs peek.** `queue-receive-messages` hides messages for a visibility timeout period — callers must delete messages with `queue-delete-message` after processing or they reappear. `queue-peek-messages` is read-only and does not affect visibility.
