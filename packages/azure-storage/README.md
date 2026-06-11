# @mcp-consultant-tools/azure-storage

MCP server for Azure Storage - comprehensive access to Blob, Files, Queues, and Tables.

## Features

- **47 tools** for storage operations
- **8 prompts** for analysis and troubleshooting
- Multi-account support
- Entra ID and connection string authentication
- Blob index tag search
- Table OData queries
- Queue message management

## Installation

```bash
npm install @mcp-consultant-tools/azure-storage
```

Or use directly with npx:

```bash
npx @mcp-consultant-tools/azure-storage
```

## Quick Start

### 1. Create Azure App Registration

1. Go to Azure Portal > Microsoft Entra ID > App registrations
2. Create a new registration
3. Note the Application (client) ID and Directory (tenant) ID
4. Create a client secret under Certificates & secrets

### 2. Assign Storage Roles

On your storage account, assign roles to the app:

| Service | Role |
|---------|------|
| Blob | Storage Blob Data Contributor |
| Queue | Storage Queue Data Contributor |
| Table | Storage Table Data Contributor |
| Files | Storage File Data SMB Share Contributor |

### 3. Configure MCP Client

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "azure-storage": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-storage", "mcp-storage"],
      "env": {
        "AZURE_STORAGE_AUTH_METHOD": "entra-id",
        "AZURE_STORAGE_TENANT_ID": "your-tenant-id",
        "AZURE_STORAGE_CLIENT_ID": "your-client-id",
        "AZURE_STORAGE_CLIENT_SECRET": "your-client-secret",
        "AZURE_STORAGE_ACCOUNTS": "[{\"id\":\"prod\",\"name\":\"Production\",\"accountName\":\"mystorageaccount\",\"active\":true}]"
      }
    }
  }
}
```

## Environment Variables

### Authentication

| Variable | Description |
|----------|-------------|
| `AZURE_STORAGE_AUTH_METHOD` | `entra-id` (recommended) or `connection-string` |
| `AZURE_STORAGE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_STORAGE_CLIENT_ID` | App registration client ID |
| `AZURE_STORAGE_CLIENT_SECRET` | App registration secret |

### Account Configuration

| Variable | Description |
|----------|-------------|
| `AZURE_STORAGE_ACCOUNTS` | JSON array of account configs |
| `AZURE_STORAGE_ACCOUNT_NAME` | Single account fallback |
| `AZURE_STORAGE_CONNECTION_STRING` | Connection string fallback |

### Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `AZURE_STORAGE_MAX_BLOB_SIZE_MB` | 100 | Max blob upload size |
| `AZURE_STORAGE_MAX_LIST_RESULTS` | 1000 | Max items in list operations |

## Tools

### Blob Storage (15 tools)

| Tool | Description |
|------|-------------|
| `blob-list-accounts` | List configured storage accounts |
| `blob-test-connection` | Test connectivity and permissions |
| `blob-list-containers` | List containers with metadata |
| `blob-get-container` | Get container properties |
| `blob-create-container` | Create container |
| `blob-delete-container` | Delete container |
| `blob-list-blobs` | List blobs with prefix filter |
| `blob-get-blob` | Get blob properties/metadata/tags |
| `blob-download-blob` | Download blob content |
| `blob-upload-blob` | Upload content |
| `blob-delete-blob` | Delete blob |
| `blob-copy-blob` | Copy blob |
| `blob-set-metadata` | Set blob metadata |
| `blob-set-tags` | Set index tags |
| `blob-search-tags` | Search by tags |

### File Shares (12 tools)

| Tool | Description |
|------|-------------|
| `file-list-shares` | List file shares |
| `file-get-share` | Get share properties |
| `file-create-share` | Create share |
| `file-delete-share` | Delete share |
| `file-list-items` | List files/directories |
| `file-create-directory` | Create directory |
| `file-delete-directory` | Delete directory |
| `file-get-file` | Get file properties |
| `file-download-file` | Download content |
| `file-upload-file` | Upload content |
| `file-delete-file` | Delete file |
| `file-copy-file` | Copy file |

### Queue Storage (10 tools)

| Tool | Description |
|------|-------------|
| `queue-list-queues` | List queues |
| `queue-get-queue` | Get queue properties |
| `queue-create-queue` | Create queue |
| `queue-delete-queue` | Delete queue |
| `queue-send-message` | Send message |
| `queue-peek-messages` | Peek messages (read-only) |
| `queue-receive-messages` | Receive and hide messages |
| `queue-delete-message` | Delete message |
| `queue-update-message` | Update message |
| `queue-clear-messages` | Clear all messages |

### Table Storage (10 tools)

| Tool | Description |
|------|-------------|
| `table-list-tables` | List tables |
| `table-create-table` | Create table |
| `table-delete-table` | Delete table |
| `table-get-entity` | Get entity by keys |
| `table-query-entities` | Query with OData filter |
| `table-insert-entity` | Insert entity |
| `table-update-entity` | Update entity |
| `table-upsert-entity` | Upsert entity |
| `table-delete-entity` | Delete entity |
| `table-batch-operation` | Batch operations |

## Prompts

| Prompt | Description |
|--------|-------------|
| `storage-account-overview` | Complete account overview |
| `blob-container-analysis` | Container analysis |
| `blob-search-guide` | How to find blobs |
| `queue-health-check` | Queue health analysis |
| `table-schema-discovery` | Discover entity structure |
| `file-share-audit` | Audit share contents |
| `storage-migration-verification` | Verify migration |
| `storage-troubleshooting-guide` | Troubleshooting guide |

## Examples

### Search blobs by tags

```
Use blob-search-tags with accountId="prod" and tagFilter="\"Department\"='Finance' AND \"Year\"='2024'"
```

### Query table entities

```
Use table-query-entities with accountId="prod", tableName="Orders", filter="Status eq 'Pending' and Amount gt 1000"
```

### Process queue messages

```
1. Use queue-receive-messages to get messages
2. Process each message
3. Use queue-delete-message with messageId and popReceipt
```

## License

MIT
