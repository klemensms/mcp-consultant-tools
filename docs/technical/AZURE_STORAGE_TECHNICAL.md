# Azure Storage - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/AZURE_STORAGE.md -->

<overview>

The Azure Storage integration provides access to all four Azure Storage services — Blob, File Shares, Queue, and Table — through 47 tools and 8 prompts. It supports multi-account configuration with both Entra ID and connection string authentication. Read operations are always available; write and delete operations require feature flags.

**Package:** `@mcp-consultant-tools/azure-storage`
**Binaries:** MCP `mcp-storage` / CLI `mcp-storage-cli`
**Source:** `packages/azure-storage/src/`

</overview>

<architecture>

<service-classes>

**Main orchestrator:** `AzureStorageService` (`src/AzureStorageService.ts`)
- Manages authentication (Entra ID OAuth or connection string)
- Provides lazy client initialization and caching per account ID
- Delegates all storage operations to typed sub-services
- Supports multiple storage accounts with active/inactive flags

**Sub-services** (one per storage type):
- `BlobService` (`src/services/BlobService.ts`) — containers and blobs
- `QueueService` (`src/services/QueueService.ts`) — queues and messages
- `TableService` (`src/services/TableService.ts`) — tables and entities
- `FileService` (`src/services/FileService.ts`) — file shares, directories, and files

**ServiceContext** (`src/types.ts`):
```typescript
export interface ServiceContext {
  readonly storage: AzureStorageService;
}
```

The context exposes one getter (`storage`) which lazily initializes `AzureStorageService` on first use. Tools call `ctx.storage.getBlobService(accountId)` etc. to get sub-services.

</service-classes>

<authentication>

Two authentication methods are supported, selected via `AZURE_STORAGE_AUTH_METHOD`.

<auth-method name="entra-id" priority="high">

**Microsoft Entra ID (recommended for production)**

- Token-based via `@azure/identity` `ClientSecretCredential`
- If `tenantId`, `clientId`, and `clientSecret` are all set, uses `ClientSecretCredential`
- If any of those are missing, falls back to `DefaultAzureCredential` (environment variables, managed identity, etc.)
- Requires RBAC roles on the storage account (see role table below)
- Tokens are cached by the Azure SDK with automatic refresh

Required RBAC roles per service:

| Service | Read-Only Role | Read-Write Role |
|---------|----------------|-----------------|
| Blob | Storage Blob Data Reader | Storage Blob Data Contributor |
| Queue | Storage Queue Data Reader | Storage Queue Data Contributor |
| Table | Storage Table Data Reader | Storage Table Data Contributor |
| Files | Storage File Data SMB Share Reader | Storage File Data SMB Share Contributor |

Assign via Azure CLI:
```bash
APP_ID="your-app-client-id"
STORAGE_ACCOUNT="/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Storage/storageAccounts/{account}"

az role assignment create --role "Storage Blob Data Contributor" --assignee $APP_ID --scope $STORAGE_ACCOUNT
az role assignment create --role "Storage Queue Data Contributor" --assignee $APP_ID --scope $STORAGE_ACCOUNT
az role assignment create --role "Storage Table Data Contributor" --assignee $APP_ID --scope $STORAGE_ACCOUNT
az role assignment create --role "Storage File Data SMB Share Contributor" --assignee $APP_ID --scope $STORAGE_ACCOUNT
```

</auth-method>

<auth-method name="connection-string">

**Connection String (per-account fallback)**

- Stored in the `connectionString` field of each account config object
- Simple setup, broad permissions, less secure
- Set `AZURE_STORAGE_AUTH_METHOD=connection-string` OR include `connectionString` in individual account objects (overrides global Entra ID for that account)

</auth-method>

</authentication>

<configuration>

<env-vars>

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `AZURE_STORAGE_AUTH_METHOD` | `entra-id` | No | `entra-id` or `connection-string` |
| `AZURE_STORAGE_TENANT_ID` | — | For Entra ID | Azure tenant ID |
| `AZURE_STORAGE_CLIENT_ID` | — | For Entra ID | App registration client ID |
| `AZURE_STORAGE_CLIENT_SECRET` | — | For Entra ID | App registration client secret |
| `AZURE_STORAGE_ACCOUNTS` | `[]` | Yes (or fallback) | JSON array of account config objects |
| `AZURE_STORAGE_ACCOUNT_NAME` | — | Fallback only | Single account name (creates a default account with id `"default"`) |
| `AZURE_STORAGE_CONNECTION_STRING` | — | Fallback only | Connection string for single account fallback |
| `AZURE_STORAGE_MAX_BLOB_SIZE_MB` | `100` | No | Max blob upload size in MB; upload rejected if exceeded |
| `AZURE_STORAGE_MAX_LIST_RESULTS` | `1000` | No | Max items returned by list operations |
| `AZURE_STORAGE_ENABLE_WRITE` | `false` | No | Feature flag: enables create, upload, copy, set-metadata/tags (19 tools) |
| `AZURE_STORAGE_ENABLE_DELETE` | `false` | No | Feature flag: enables delete and clear operations (10 tools) |

</env-vars>

<account-config>

`AZURE_STORAGE_ACCOUNTS` is a JSON array of account config objects. Each object:

```json
[
  {
    "id": "prod",
    "name": "Production Storage",
    "accountName": "prodstorageaccount",
    "active": true,
    "connectionString": "optional — overrides global Entra ID for this account"
  },
  {
    "id": "dev",
    "name": "Development Storage",
    "accountName": "devstorageaccount",
    "active": false
  }
]
```

- `id` — used in every tool call as `accountId`
- `accountName` — actual Azure storage account name (used to construct service URLs)
- `active` — set to `false` to disable without removing config
- `connectionString` — optional per-account override

If `AZURE_STORAGE_ACCOUNTS` is not set, the service falls back to `AZURE_STORAGE_ACCOUNT_NAME` + optional `AZURE_STORAGE_CONNECTION_STRING`, creating a synthetic account with `id: "default"`.

</account-config>

</configuration>

<feature-flags>

Tools guarded by feature flags are always visible in the MCP tool list but return an error with a clear message if called without the flag enabled.

**Write-protected tools (require `AZURE_STORAGE_ENABLE_WRITE=true`):**
`blob-create-container`, `blob-upload-blob`, `blob-copy-blob`, `blob-set-metadata`, `blob-set-tags`, `file-create-share`, `file-create-directory`, `file-upload-file`, `file-copy-file`, `queue-create-queue`, `queue-send-message`, `queue-receive-messages`, `queue-update-message`, `table-create-table`, `table-insert-entity`, `table-update-entity`, `table-upsert-entity`, `table-batch-operation` (write ops)

**Delete-protected tools (require `AZURE_STORAGE_ENABLE_DELETE=true`):**
`blob-delete-container`, `blob-delete-blob`, `file-delete-share`, `file-delete-directory`, `file-delete-file`, `queue-delete-queue`, `queue-delete-message`, `queue-clear-messages`, `table-delete-table`, `table-delete-entity`, `table-batch-operation` (delete ops)

**Always available (read-only, 18 tools):**
All list, get, download, peek, search, and test-connection tools.

Error message pattern:
- Write: `"Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable."`
- Delete: `"Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable."`

</feature-flags>

</architecture>

<tool-reference>

<tool-group name="blob-storage">

47 total tools across all four storage types.

**Blob Storage — 15 tools**

| Tool | Write Flag | Delete Flag | Description |
|------|-----------|------------|-------------|
| `blob-list-accounts` | — | — | List all configured storage accounts |
| `blob-test-connection` | — | — | Test connectivity and verify permissions for all storage services on an account |
| `blob-list-containers` | — | — | List containers with metadata; supports prefix filter and maxResults |
| `blob-get-container` | — | — | Get container properties and metadata |
| `blob-create-container` | Yes | — | Create new container |
| `blob-delete-container` | — | Yes | Delete container and all contents |
| `blob-list-blobs` | — | — | List blobs in a container; supports prefix filter and maxResults |
| `blob-get-blob` | — | — | Get blob properties, metadata, and index tags |
| `blob-download-blob` | — | — | Download blob content as text or base64 |
| `blob-upload-blob` | Yes | — | Upload content to blob; size limit enforced via `MAX_BLOB_SIZE_MB` |
| `blob-delete-blob` | — | Yes | Delete a blob |
| `blob-copy-blob` | Yes | — | Copy blob within or between containers in the same account |
| `blob-set-metadata` | Yes | — | Set or update blob metadata (key-value pairs, not indexed) |
| `blob-set-tags` | Yes | — | Set or update blob index tags (indexed, searchable) |
| `blob-search-tags` | — | — | Search blobs across all containers using OData tag filter |

</tool-group>

<tool-group name="file-shares">

**File Shares — 12 tools**

| Tool | Write Flag | Delete Flag | Description |
|------|-----------|------------|-------------|
| `file-list-shares` | — | — | List file shares |
| `file-get-share` | — | — | Get share properties and quota usage |
| `file-create-share` | Yes | — | Create a file share with optional quota (GB) |
| `file-delete-share` | — | Yes | Delete a file share |
| `file-list-items` | — | — | List files and directories in a path |
| `file-create-directory` | Yes | — | Create a directory |
| `file-delete-directory` | — | Yes | Delete a directory |
| `file-get-file` | — | — | Get file properties |
| `file-download-file` | — | — | Download file content |
| `file-upload-file` | Yes | — | Upload file content |
| `file-delete-file` | — | Yes | Delete a file |
| `file-copy-file` | Yes | — | Copy a file within the same share |

</tool-group>

<tool-group name="queue-storage">

**Queue Storage — 10 tools**

| Tool | Write Flag | Delete Flag | Description |
|------|-----------|------------|-------------|
| `queue-list-queues` | — | — | List queues |
| `queue-get-queue` | — | — | Get queue properties and approximate message count |
| `queue-create-queue` | Yes | — | Create a queue |
| `queue-delete-queue` | — | Yes | Delete a queue |
| `queue-send-message` | Yes | — | Send a message to a queue |
| `queue-peek-messages` | — | — | Read messages without affecting visibility (non-destructive) |
| `queue-receive-messages` | Yes | — | Receive messages and hide them for a visibility timeout; caller must delete after processing |
| `queue-delete-message` | — | Yes | Delete a message after successful processing (requires `messageId` + `popReceipt`) |
| `queue-update-message` | Yes | — | Update message content or visibility timeout |
| `queue-clear-messages` | — | Yes | Clear all messages from a queue |

</tool-group>

<tool-group name="table-storage">

**Table Storage — 10 tools**

| Tool | Write Flag | Delete Flag | Description |
|------|-----------|------------|-------------|
| `table-list-tables` | — | — | List tables |
| `table-create-table` | Yes | — | Create a table |
| `table-delete-table` | — | Yes | Delete a table |
| `table-get-entity` | — | — | Get an entity by `PartitionKey` and `RowKey` |
| `table-query-entities` | — | — | Query entities with OData filter; supports `select` projection |
| `table-insert-entity` | Yes | — | Insert a new entity |
| `table-update-entity` | Yes | — | Update or replace an entity (merge or replace mode) |
| `table-upsert-entity` | Yes | — | Insert or update an entity |
| `table-delete-entity` | — | Yes | Delete an entity by `PartitionKey` and `RowKey` |
| `table-batch-operation` | Yes | Yes | Execute multiple operations in a single transaction (same partition key required) |

</tool-group>

</tool-reference>

<prompts>

8 prompts generate formatted markdown reports from Azure Storage data.

| Prompt | What it generates |
|--------|------------------|
| `storage-account-overview` | Full account summary: container count, queue count, table count, file share usage |
| `blob-container-analysis` | Container statistics: blob count, sizes, access tiers, tag distribution |
| `blob-search-guide` | Guided workflow for locating blobs by prefix, metadata, or index tags |
| `queue-health-check` | Queue health report: message counts, approximate age, poison queue detection |
| `table-schema-discovery` | Entity structure analysis: property types, partition key patterns, sample entities |
| `file-share-audit` | File share audit: directory structure, file sizes, quota usage |
| `storage-migration-verification` | Side-by-side container/blob count comparison between source and destination accounts |
| `storage-troubleshooting-guide` | Authentication checks, network diagnostics, and common error resolutions |

Prompts use formatting utilities in `src/utils/storage-formatters.ts`:
- `formatAccountOverviewAsMarkdown()`
- `formatContainerAnalysisAsMarkdown()`
- `formatQueueHealthAsMarkdown()`
- `formatTableSchemaAsMarkdown()`
- `formatFileShareAuditAsMarkdown()`
- `formatMigrationVerificationAsMarkdown()`
- `formatTroubleshootingGuideAsMarkdown()`

</prompts>

<service-implementation>

<lazy-initialization>

All SDK clients and sub-services are created on-demand and cached per `accountId`:

```typescript
getBlobClient(accountId: string): BlobServiceClient {
  const account = this.getAccountById(accountId);

  if (!this.blobClients.has(accountId)) {
    let client: BlobServiceClient;

    if (account.connectionString) {
      client = BlobServiceClient.fromConnectionString(account.connectionString);
    } else if (this.credential) {
      const url = `https://${account.accountName}.blob.core.windows.net`;
      client = new BlobServiceClient(url, this.credential);
    } else {
      throw new Error(`No authentication configured for account '${accountId}'`);
    }

    this.blobClients.set(accountId, client);
  }

  return this.blobClients.get(accountId)!;
}

getBlobService(accountId: string): BlobService {
  if (!this.blobServices.has(accountId)) {
    const client = this.getBlobClient(accountId);
    this.blobServices.set(
      accountId,
      new BlobService(client, accountId, this.config.maxBlobSizeMB, this.config.maxListResults)
    );
  }
  return this.blobServices.get(accountId)!;
}
```

The same pattern applies to queue, table, and file clients/services. `TableService` additionally caches `TableClient` instances per table name.

</lazy-initialization>

<sub-service-signatures>

```typescript
// BlobService
async listContainers(prefix?: string, maxResults?: number): Promise<ListResult<ContainerInfo>>
async getContainer(containerName: string): Promise<ContainerInfo>
async createContainer(containerName: string, options?: CreateContainerOptions): Promise<OperationResult>
async deleteContainer(containerName: string): Promise<OperationResult>
async listBlobs(containerName: string, options?: ListBlobsOptions): Promise<ListResult<BlobInfo>>
async getBlob(containerName: string, blobName: string): Promise<BlobInfo>
async downloadBlob(containerName: string, blobName: string): Promise<BlobContent>
async uploadBlob(containerName: string, blobName: string, content: string | Buffer, options?: UploadBlobOptions): Promise<OperationResult>
async deleteBlob(containerName: string, blobName: string): Promise<OperationResult>
async copyBlob(sourceContainer: string, sourceBlob: string, destContainer: string, destBlob: string): Promise<OperationResult>
async setMetadata(containerName: string, blobName: string, metadata: Record<string, string>): Promise<OperationResult>
async setTags(containerName: string, blobName: string, tags: Record<string, string>): Promise<OperationResult>
async searchByTags(tagFilter: string, maxResults?: number): Promise<ListResult<BlobInfo>>

// QueueService
async listQueues(maxResults?: number): Promise<ListResult<QueueInfo>>
async getQueue(queueName: string): Promise<QueueInfo>
async createQueue(queueName: string): Promise<OperationResult>
async deleteQueue(queueName: string): Promise<OperationResult>
async sendMessage(queueName: string, messageText: string, options?: SendMessageOptions): Promise<OperationResult>
async peekMessages(queueName: string, maxMessages?: number): Promise<QueueMessage[]>
async receiveMessages(queueName: string, maxMessages?: number, visibilityTimeout?: number): Promise<QueueMessage[]>
async deleteMessage(queueName: string, messageId: string, popReceipt: string): Promise<OperationResult>
async updateMessage(queueName: string, messageId: string, popReceipt: string, messageText: string, visibilityTimeout?: number): Promise<OperationResult>
async clearMessages(queueName: string): Promise<OperationResult>

// TableService
async listTables(maxResults?: number): Promise<ListResult<TableInfo>>
async createTable(tableName: string): Promise<OperationResult>
async deleteTable(tableName: string): Promise<OperationResult>
async getEntity(tableName: string, partitionKey: string, rowKey: string): Promise<TableEntity>
async queryEntities(tableName: string, options?: QueryEntitiesOptions): Promise<ListResult<TableEntity>>
async insertEntity(tableName: string, entity: TableEntity): Promise<OperationResult>
async updateEntity(tableName: string, entity: TableEntity, mode?: 'merge' | 'replace'): Promise<OperationResult>
async upsertEntity(tableName: string, entity: TableEntity, mode?: 'merge' | 'replace'): Promise<OperationResult>
async deleteEntity(tableName: string, partitionKey: string, rowKey: string): Promise<OperationResult>
async batchOperation(tableName: string, operations: BatchOperationItem[]): Promise<OperationResult>

// FileService
async listShares(maxResults?: number): Promise<ListResult<FileShareInfo>>
async getShare(shareName: string): Promise<FileShareInfo>
async createShare(shareName: string, quotaInGB?: number): Promise<OperationResult>
async deleteShare(shareName: string): Promise<OperationResult>
async listItems(shareName: string, directoryPath?: string, maxResults?: number): Promise<ListResult<FileItemInfo>>
async createDirectory(shareName: string, directoryPath: string): Promise<OperationResult>
async deleteDirectory(shareName: string, directoryPath: string): Promise<OperationResult>
async getFile(shareName: string, filePath: string): Promise<FileInfo>
async downloadFile(shareName: string, filePath: string): Promise<FileContent>
async uploadFile(shareName: string, filePath: string, content: string | Buffer): Promise<OperationResult>
async deleteFile(shareName: string, filePath: string): Promise<OperationResult>
async copyFile(shareName: string, sourceFilePath: string, destFilePath: string): Promise<OperationResult>
```

</sub-service-signatures>

<audit-logging>

All operations are logged via `auditLogger` from `@mcp-consultant-tools/core`:

```typescript
auditLogger.log({
  operation: 'upload-blob',
  operationType: 'CREATE',
  componentType: 'Blob',
  componentName: blobName,
  parameters: { accountId, containerName, size: content.length },
  success: true,
  executionTimeMs: timer()
});
```

Valid `operationType` values: `'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'PUBLISH'`

</audit-logging>

</service-implementation>

<usage-examples>

<example name="blob-tag-search">

Search blobs across all containers by index tags:

```
Use blob-search-tags with:
- accountId: "prod"
- tagFilter: "\"Department\"='Finance' AND \"Year\"='2024'"
```

Tag filter syntax uses OData: `"TagName"='value'`. Multiple conditions with `AND`/`OR`.

Common tag filter patterns:
```
"Department"='Finance'
"Year"='2024'
"Year"='2024' AND "Type"='Report'
"Status"='Archived'
```

Note: `blob-search-tags` searches across all containers. `blob-set-tags` sets tags; `blob-set-metadata` sets non-indexed metadata.

</example>

<example name="table-odata-query">

Query table entities with OData filter:

```
Use table-query-entities with:
- accountId: "prod"
- tableName: "Orders"
- filter: "Status eq 'Pending' and Amount gt 1000"
```

OData operators: `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `and`, `or`, `not`

Value formatting rules:
- Strings: `Name eq 'John'` (single quotes)
- Numbers: `Age gt 30` (no quotes)
- Datetimes: `Timestamp ge datetime'2024-01-01T00:00:00Z'`
- Combined: `PartitionKey eq 'Sales' and Amount gt 1000`

Use `select` for projection to reduce data transfer on large entities.

</example>

<example name="queue-message-processing">

Standard queue processing pattern (receive → process → delete):

```
1. queue-receive-messages: accountId="prod", queueName="order-processing", maxMessages=5
   → Returns messages with messageId and popReceipt; messages become invisible
2. Process each message in your application
3. queue-delete-message: accountId="prod", queueName="order-processing",
   messageId=<from step 1>, popReceipt=<from step 1>
```

If processing fails: do nothing — message reappears after visibility timeout expires.
If `popReceipt` mismatch error: the receipt is stale (timeout expired); re-receive to get fresh receipt.

</example>

<example name="table-batch-operation">

Batch multiple table operations in one transaction:

```
Use table-batch-operation with:
- accountId: "prod"
- tableName: "Events"
- operations: [
    {"operation": "create", "entity": {"partitionKey": "2024", "rowKey": "001", "name": "Event 1"}},
    {"operation": "create", "entity": {"partitionKey": "2024", "rowKey": "002", "name": "Event 2"}}
  ]
```

Constraint: all entities in a batch must share the same `partitionKey`. Max 100 operations per batch.

</example>

<example name="blob-copy">

Copy blob between containers:

```
Use blob-copy-blob with:
- accountId: "prod"
- sourceContainer: "staging"
- sourceBlob: "data/file.csv"
- destinationContainer: "production"
- destinationBlob: "imports/file.csv"
```

Cross-account copy is not supported — copy is within the same storage account only.

</example>

</usage-examples>

<error-handling>

<error-cases>

**Authentication errors:**
- `"No authentication configured for account '{id}'"` — account has no connection string and no Entra ID credential was created. Check `AZURE_STORAGE_AUTH_METHOD` and credential env vars.
- `"AuthorizationPermissionMismatch"` — app registration missing required RBAC role. Assign the appropriate role on the storage account.

**Configuration errors:**
- `"Failed to parse AZURE_STORAGE_ACCOUNTS JSON"` — invalid JSON in accounts env var
- `"Missing Azure Storage configuration: AZURE_STORAGE_ACCOUNTS or AZURE_STORAGE_ACCOUNT_NAME"` — neither account configuration path is set
- `"Storage account not found"` — `accountId` not in configuration, or account has `active: false`

**Network errors:**
- `"getaddrinfo ENOTFOUND {accountName}.blob.core.windows.net"` — wrong account name or network connectivity issue. Verify `accountName` and DNS.

**Resource errors:**
- `"ContainerNotFound"` — container doesn't exist; use `blob-list-containers` to see available containers
- `"BlobNotFound"` — blob path is wrong or doesn't exist; use `blob-list-blobs` with prefix to locate
- `"TableNotFound"` — table doesn't exist; use `table-list-tables` to see available tables
- `"InvalidInput"` in OData filter — malformed filter syntax; check value quoting and operator usage
- `"PopReceipt mismatch"` — queue message receipt is stale (visibility timeout expired); re-receive to get fresh `popReceipt`

**Operation errors:**
- Blob size limit exceeded: upload rejected with configured max size in error message
- Batch constraint violation: all batch entities must have same `partitionKey`

All tool handlers return `isError: true` in the MCP response when errors occur.

</error-cases>

</error-handling>

<security>

- Prefer Entra ID over connection strings; connection strings grant broad access with no RBAC scoping
- Assign the minimum required RBAC role per service (Reader vs Contributor)
- Rotate client secrets before expiration
- Enable storage account firewall rules and restrict to known IPs
- Use private endpoints for VNet-bound scenarios
- Enable soft delete on blob containers for accidental deletion protection
- Never log blob content, message bodies, or entity data in error messages (enforced in service implementations)
- All SDK connections use HTTPS (enforced by Azure Storage SDK)

</security>

<performance>

- **List operations:** Configurable `maxListResults` (default 1000) prevents over-fetching; `hasMore` indicator signals pagination
- **Blob uploads:** Size checked against `maxBlobSizeMB` before upload to prevent large transfers
- **Table queries:** Use `select` projection to reduce transferred fields; always include `PartitionKey` for targeted queries (avoids full table scan)
- **Batch operations:** Up to 100 entities per batch; all must share partition key; use for bulk inserts/deletes in same partition
- **Client caching:** SDK clients cached per account ID; sub-services cached per account ID; `TableClient` instances cached per table name within `TableService`
- **Queue operations:** `queue-peek-messages` for monitoring; `queue-receive-messages` only when processing (hides messages and requires explicit delete)

</performance>

<cli-architecture>

The CLI reuses the same `ServiceContext` and service classes as the MCP server.

<file-structure>

```
packages/azure-storage/src/
  cli.ts                        # Entry point (Commander.js program)
  context-factory.ts            # Shared createServiceContext() for CLI
  cli/
    output.ts                   # Cache dir: .mcp-storage-cache
    commands/
      index.ts                  # registerAllCommands() aggregator
      blob-commands.ts          # 16 blob commands
      file-commands.ts          # 12 file share commands
      queue-commands.ts         # 10 queue commands
      table-commands.ts         # 10 table commands
```

</file-structure>

<command-groups>

| Group | Description | Maps to tool prefix |
|-------|-------------|-------------------|
| `blob` | Blob container and blob operations | `blob-*` |
| `file` | File share, directory, and file operations | `file-*` |
| `queue` | Queue and message operations | `queue-*` |
| `table` | Table and entity operations | `table-*` |

Command mapping convention:
- Required Zod parameters → positional arguments: `<accountId>`
- Optional Zod parameters → option flags: `--prefix <value>`
- `z.number().optional()` options parsed with `parseInt`
- `z.object()` parameters passed as JSON strings and parsed with `JSON.parse()`

</command-groups>

<global-flags>

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of summary |
| `--no-cache` | Skip writing JSON cache files |
| `--env-file <path>` | Load environment from a custom `.env` file |

</global-flags>

<cli-examples>

```bash
# Run via npx
npx --package=@mcp-consultant-tools/azure-storage mcp-storage-cli --help

# List configured storage accounts
mcp-storage-cli blob list-accounts

# List containers
mcp-storage-cli blob list-containers prod

# List containers with prefix filter
mcp-storage-cli blob list-containers prod --prefix "logs-"

# List blobs in container with prefix
mcp-storage-cli blob list prod my-container --prefix "reports/"

# Search blobs by index tags
mcp-storage-cli blob search-tags prod "\"Department\"='Finance'"

# Download blob content
mcp-storage-cli blob download prod my-container path/to/file.csv

# Peek queue messages
mcp-storage-cli queue peek prod my-queue

# Query table entities
mcp-storage-cli table query prod Orders --filter "Status eq 'Pending'"

# JSON output
mcp-storage-cli --json table query prod Orders --filter "Status eq 'Pending'"
```

</cli-examples>

<command-to-tool-mapping>

| CLI Command | MCP Tool |
|-------------|----------|
| `blob list-accounts` | `blob-list-accounts` |
| `blob test-connection <accountId>` | `blob-test-connection` |
| `blob list-containers <accountId>` | `blob-list-containers` |
| `blob get-container <accountId> <containerName>` | `blob-get-container` |
| `blob create-container <accountId> <containerName>` | `blob-create-container` |
| `blob delete-container <accountId> <containerName>` | `blob-delete-container` |
| `blob list <accountId> <containerName>` | `blob-list-blobs` |
| `blob get <accountId> <containerName> <blobName>` | `blob-get-blob` |
| `blob download <accountId> <containerName> <blobName>` | `blob-download-blob` |
| `blob upload <accountId> <containerName> <blobName>` | `blob-upload-blob` |
| `blob delete <accountId> <containerName> <blobName>` | `blob-delete-blob` |
| `blob copy <accountId> <srcContainer> <srcBlob> <dstContainer> <dstBlob>` | `blob-copy-blob` |
| `blob set-metadata <accountId> <containerName> <blobName>` | `blob-set-metadata` |
| `blob set-tags <accountId> <containerName> <blobName>` | `blob-set-tags` |
| `blob search-tags <accountId> <tagFilter>` | `blob-search-tags` |
| `file list-shares <accountId>` | `file-list-shares` |
| `file get-share <accountId> <shareName>` | `file-get-share` |
| `file create-share <accountId> <shareName>` | `file-create-share` |
| `file delete-share <accountId> <shareName>` | `file-delete-share` |
| `file list-items <accountId> <shareName>` | `file-list-items` |
| `file create-dir <accountId> <shareName> <dirPath>` | `file-create-directory` |
| `file delete-dir <accountId> <shareName> <dirPath>` | `file-delete-directory` |
| `file get-file <accountId> <shareName> <filePath>` | `file-get-file` |
| `file download <accountId> <shareName> <filePath>` | `file-download-file` |
| `file upload <accountId> <shareName> <filePath>` | `file-upload-file` |
| `file delete <accountId> <shareName> <filePath>` | `file-delete-file` |
| `file copy <accountId> <shareName> <srcPath> <dstPath>` | `file-copy-file` |
| `queue list <accountId>` | `queue-list-queues` |
| `queue get <accountId> <queueName>` | `queue-get-queue` |
| `queue create <accountId> <queueName>` | `queue-create-queue` |
| `queue delete <accountId> <queueName>` | `queue-delete-queue` |
| `queue send <accountId> <queueName> <message>` | `queue-send-message` |
| `queue peek <accountId> <queueName>` | `queue-peek-messages` |
| `queue receive <accountId> <queueName>` | `queue-receive-messages` |
| `queue delete-msg <accountId> <queueName> <messageId> <popReceipt>` | `queue-delete-message` |
| `queue update <accountId> <queueName> <messageId> <popReceipt>` | `queue-update-message` |
| `queue clear <accountId> <queueName>` | `queue-clear-messages` |
| `table list <accountId>` | `table-list-tables` |
| `table create <accountId> <tableName>` | `table-create-table` |
| `table delete <accountId> <tableName>` | `table-delete-table` |
| `table get-entity <accountId> <tableName> <partitionKey> <rowKey>` | `table-get-entity` |
| `table query <accountId> <tableName>` | `table-query-entities` |
| `table insert <accountId> <tableName>` | `table-insert-entity` |
| `table update <accountId> <tableName>` | `table-update-entity` |
| `table upsert <accountId> <tableName>` | `table-upsert-entity` |
| `table delete-entity <accountId> <tableName> <partitionKey> <rowKey>` | `table-delete-entity` |
| `table batch <accountId> <tableName>` | `table-batch-operation` |

</command-to-tool-mapping>

</cli-architecture>

<best-practices>

**Blob storage:**
- Use blob index tags (`blob-set-tags`) for searchable attributes; use metadata (`blob-set-metadata`) for non-searchable key-value data
- Organize blobs with virtual directory prefixes (e.g., `2024/01/invoices/`) for efficient prefix filtering
- Set appropriate access tiers (Hot, Cool, Archive) for cost optimization

**Queue storage:**
- Always delete messages after successful processing; never leave processed messages to expire
- Set visibility timeout appropriate for expected processing duration
- Use `queue-peek-messages` for monitoring without affecting message visibility
- Design poison queue handling for repeatedly failing messages

**Table storage:**
- Design partition keys around query patterns, not just data grouping
- Always include `PartitionKey` in queries to avoid full table scans
- Use `select` projection to reduce data transfer on wide entities
- Use batch operations for multiple entities in the same partition (up to 100 per batch)

**File shares:**
- Set quotas on file shares to prevent runaway storage costs
- Use directory structure for organized file management

</best-practices>
