# Azure Storage Package Guide

## Overview

Azure Storage integration for Blob, Files, Queues, and Tables.

- **Tools:** 47 tools, 8 prompts
- **Authentication:** Entra ID (recommended) or Connection String
- **Services:** Blob Storage, File Shares, Queue Storage, Table Storage

## Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `AZURE_STORAGE_ENABLE_WRITE` | `false` | Enable create, upload, copy, update, set-metadata/tags operations |
| `AZURE_STORAGE_ENABLE_DELETE` | `false` | Enable delete and clear operations |

**Write-protected tools (19):** `blob-create-container`, `blob-upload-blob`, `blob-copy-blob`, `blob-set-metadata`, `blob-set-tags`, `file-create-share`, `file-create-directory`, `file-upload-file`, `file-copy-file`, `queue-create-queue`, `queue-send-message`, `queue-receive-messages`, `queue-update-message`, `table-create-table`, `table-insert-entity`, `table-update-entity`, `table-upsert-entity`, `table-batch-operation` (write ops)

**Delete-protected tools (10):** `blob-delete-container`, `blob-delete-blob`, `file-delete-share`, `file-delete-directory`, `file-delete-file`, `queue-delete-queue`, `queue-delete-message`, `queue-clear-messages`, `table-delete-table`, `table-delete-entity`, `table-batch-operation` (delete ops)

**Read-only tools (18):** Always available, no flag needed.

## Environment Configuration

```bash
# Authentication method
AZURE_STORAGE_AUTH_METHOD=entra-id  # or 'connection-string'

# Entra ID authentication (recommended)
AZURE_STORAGE_TENANT_ID=your-azure-tenant-id
AZURE_STORAGE_CLIENT_ID=your-azure-app-client-id
AZURE_STORAGE_CLIENT_SECRET=your-azure-app-client-secret

# Multi-account configuration (JSON array)
AZURE_STORAGE_ACCOUNTS='[
  {"id":"prod","name":"Production","accountName":"prodstorageacct","active":true},
  {"id":"dev","name":"Development","accountName":"devstorageacct","active":true}
]'

# Single account fallback
AZURE_STORAGE_ACCOUNT_NAME=mystorageaccount
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...

# Safety limits
AZURE_STORAGE_MAX_BLOB_SIZE_MB=100
AZURE_STORAGE_MAX_LIST_RESULTS=1000
```

## Required Azure RBAC Roles

For Entra ID authentication, the app registration needs these roles on the storage account:

| Service | Read-Only Role | Read-Write Role |
|---------|----------------|-----------------|
| Blob | Storage Blob Data Reader | Storage Blob Data Contributor |
| Queue | Storage Queue Data Reader | Storage Queue Data Contributor |
| Table | Storage Table Data Reader | Storage Table Data Contributor |
| Files | Storage File Data SMB Share Reader | Storage File Data SMB Share Contributor |

## Key Tools

### Blob Storage (15 tools)
- `blob-list-accounts` - List configured accounts
- `blob-test-connection` - Verify connectivity and permissions
- `blob-list-containers` - List containers
- `blob-list-blobs` - List blobs with prefix filter
- `blob-get-blob` - Get blob properties/metadata/tags
- `blob-download-blob` - Download blob content
- `blob-upload-blob` - Upload content
- `blob-copy-blob` - Copy blob
- `blob-set-tags` - Set index tags
- `blob-search-tags` - Search by tags (OData filter)

### File Shares (12 tools)
- `file-list-shares` - List file shares
- `file-list-items` - List files/directories
- `file-download-file` - Download file content
- `file-upload-file` - Upload file content
- `file-create-directory` - Create directory

### Queue Storage (10 tools)
- `queue-list-queues` - List queues
- `queue-get-queue` - Get queue properties
- `queue-send-message` - Send message
- `queue-peek-messages` - Peek messages (read-only)
- `queue-receive-messages` - Receive and hide messages
- `queue-delete-message` - Delete processed message

### Table Storage (10 tools)
- `table-list-tables` - List tables
- `table-query-entities` - Query with OData filter
- `table-get-entity` - Get by PartitionKey/RowKey
- `table-insert-entity` - Insert entity
- `table-upsert-entity` - Insert or update
- `table-batch-operation` - Batch operations (same partition)

## Prompts

- `storage-account-overview` - Complete account overview
- `blob-container-analysis` - Container statistics and distribution
- `blob-search-guide` - How to find blobs
- `queue-health-check` - Queue health analysis
- `table-schema-discovery` - Discover entity structure
- `file-share-audit` - Audit file share contents
- `storage-migration-verification` - Verify migration completeness
- `storage-troubleshooting-guide` - Common issues and solutions

## Tag Search Examples

Blob index tags enable powerful search across containers:

```
# By department
"Department"='Finance'

# By year
"Year"='2024'

# Combined
"Year"='2024' AND "Type"='Report'

# By status
"Status"='Archived'
```

## Table Query Examples

OData filters for table queries:

```
# By partition
PartitionKey eq 'US-West'

# By property
Status eq 'Active'

# Date range
Timestamp ge datetime'2024-01-01'

# Combined
PartitionKey eq 'Sales' and Amount gt 1000
```

## Reference

See `docs/technical/AZURE_STORAGE_TECHNICAL.md` for detailed implementation.

## CLI Usage

Binary: `mcp-storage-cli`

```bash
# List containers
mcp-storage-cli blob list-containers prod

# List blobs
mcp-storage-cli blob list prod my-container --prefix "reports/"

# Peek queue messages
mcp-storage-cli queue peek prod my-queue
```
