# SharePoint - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/SHAREPOINT.md -->

<overview>

SharePoint Online integration via Microsoft Graph API. Provides tools for site metadata, document library browsing, file access, file management (with feature flags), and PowerPlatform document location validation.

**Package:** `@mcp-consultant-tools/sharepoint`
**MCP binary:** `mcp-spo`
**CLI binary:** `mcp-spo-cli`
**Tool count:** 16 read tools (always available) + 5 write tools (SHAREPOINT_ENABLE_WRITE=true) + 1 delete tool (SHAREPOINT_ENABLE_DELETE=true) = 16–22 tools
**Prompts:** 10

</overview>

<architecture>

<service-layers>

| Layer | File | Responsibility |
|-------|------|----------------|
| Entry point | `src/index.ts` | ServiceContext factory, MCP server startup, backward-compatible exports |
| Core service | `src/services/sharepoint-service.ts` | MSAL auth, token caching, site/drive Graph calls, cache management, error handling |
| List service | `src/services/list-service.ts` | Item listing, search, folder tree, PowerPlatform document location validation |
| File operations | `src/services/file-operations-service.ts` | Download, upload, create folder, delete, move, copy, rename |
| Read tools | `src/tools/read-tools.ts` | 16 MCP read tool registrations |
| Write tools | `src/tools/write-tools.ts` | 6 MCP write/delete tool registrations |
| Prompts | `src/prompts/templates.ts` | 10 MCP prompt registrations |
| CLI read commands | `src/cli/commands/read-commands.ts` | CLI wrappers for all 16 read tools |
| CLI write commands | `src/cli/commands/write-commands.ts` | CLI wrappers for all 6 write/delete tools (under `write` subcommand) |
| Types | `src/types/sharepoint-types.ts` | All TypeScript interfaces |
| ServiceContext | `src/types.ts` | Interface: `sharepoint`, `lists`, `files`, `getPowerPlatformService`, `checkWriteEnabled`, `checkDeleteEnabled` |
| Formatters | `src/utils/sharepoint-formatters.ts` | Markdown formatters used by prompts |

</service-layers>

<service-context>

```typescript
export interface ServiceContext {
  readonly sharepoint: SharePointService;
  readonly lists: ListService;
  readonly files: FileOperationsService;
  readonly getPowerPlatformService: () => any;
  readonly checkWriteEnabled: () => void;
  readonly checkDeleteEnabled: () => void;
}
```

All services use lazy initialization in `createServiceContext()`. `SharePointService` is initialized on first use of any SharePoint tool; `ListService` and `FileOperationsService` initialize on first use of their respective tools.

</service-context>

</architecture>

<authentication>

Authentication uses Entra ID client credentials flow via `@azure/msal-node`.

**Required Graph API permissions (Application permissions, admin consent required):**

| Permission | Used for |
|------------|----------|
| `Sites.Read.All` | Read site metadata, drives, items |
| `Files.Read.All` | Download file content |
| `Sites.ReadWrite.All` | Required if `SHAREPOINT_ENABLE_WRITE=true` |
| `Files.ReadWrite.All` | Required if `SHAREPOINT_ENABLE_WRITE=true` or `SHAREPOINT_ENABLE_DELETE=true` |

**Token caching:** Tokens are cached in memory with a 5-minute buffer before the actual expiry. The token is re-acquired automatically. If `expiresOn` is absent, a 55-minute TTL is assumed.

**MSAL config:**
```
authority: https://login.microsoftonline.com/{tenantId}
scopes: ["https://graph.microsoft.com/.default"]
```

**Site ID resolution:** Site URLs are translated to Graph API site IDs via `GET /sites/{hostname}:{pathname}`. Resolved IDs are cached in a separate `siteIdCache` map for the lifetime of the service instance.

</authentication>

<environment-variables>

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SHAREPOINT_TENANT_ID` | Yes | — | Azure tenant ID |
| `SHAREPOINT_CLIENT_ID` | Yes | — | App registration client ID |
| `SHAREPOINT_CLIENT_SECRET` | Yes | — | App registration client secret |
| `SHAREPOINT_SITES` | One of these two | — | JSON array of site configs (see format below) |
| `SHAREPOINT_SITE_URL` | One of these two | — | Single site URL; auto-creates `{id: 'default', name: 'Default SharePoint Site', active: true}` |
| `SHAREPOINT_MAX_DOWNLOAD_SIZE_MB` | No | `50` | Max file download size in MB |
| `SHAREPOINT_MAX_UPLOAD_SIZE_MB` | No | `100` | Max file upload size in MB |
| `SHAREPOINT_MAX_SEARCH_RESULTS` | No | `100` | Max search results returned |
| `SHAREPOINT_CACHE_TTL` | No | `300` | Cache TTL in seconds |
| `SHAREPOINT_ENABLE_WRITE` | No | `false` | Enables upload, create-folder, move, copy, rename |
| `SHAREPOINT_ENABLE_DELETE` | No | `false` | Enables delete (separate from write for extra safety) |

<site-config-format>

`SHAREPOINT_SITES` JSON array format:

```json
[
  {
    "id": "intranet",
    "name": "Company Intranet",
    "siteUrl": "https://tenant.sharepoint.com/sites/intranet",
    "active": true
  },
  {
    "id": "projects",
    "name": "Projects Site",
    "siteUrl": "https://tenant.sharepoint.com/sites/projects",
    "active": true
  }
]
```

- `id`: User-friendly identifier used in all tool parameters as `siteId`
- `name`: Display name for logging/formatting
- `siteUrl`: Full SharePoint site URL
- `active`: Only active sites are accessible via tools; inactive sites appear in `spo-list-sites` but throw an error if used in other tools

</site-config-format>

</environment-variables>

<tool-reference>

<tool-group name="site-and-drive">

## Site and Drive Tools

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `spo-list-sites` | List all configured sites (active and inactive) | — | — |
| `spo-get-site-info` | Site metadata: displayName, webUrl, dates, siteCollection | `siteId` | — |
| `spo-test-connection` | Test site connectivity and verify permissions | `siteId` | — |
| `spo-list-drives` | List all document libraries with quota, owner, dates | `siteId` | — |
| `spo-get-drive-info` | Detailed library info including quota and owner | `siteId`, `driveId` | — |
| `spo-clear-cache` | Clear in-memory cached responses | — | `siteId`, `pattern` |

**`spo-clear-cache` behavior:**
- No parameters: clears all cache entries and the site ID resolution cache
- `siteId` only: clears entries with that site ID in the cache key, plus site ID resolution entries for that site
- `pattern`: clears entries whose cache key contains the pattern string
- Returns count of cleared entries

</tool-group>

<tool-group name="item-operations">

## Item Operations

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `spo-list-items` | List files and folders in a library or folder | `siteId`, `driveId` | `folderId` (defaults to root) |
| `spo-get-item` | File/folder metadata by item ID | `siteId`, `driveId`, `itemId` | — |
| `spo-get-item-by-path` | File/folder metadata by path relative to drive root | `siteId`, `driveId`, `path` | — |
| `spo-search-items` | Search by filename/metadata (not full-text) | `siteId`, `query` | `driveId`, `limit` |
| `spo-get-recent-items` | Recently modified items in a library | `siteId`, `driveId` | `limit` (default: 20, max: 100), `days` (default: 30) |
| `spo-get-folder-structure` | Recursive folder tree | `siteId`, `driveId` | `folderId` (default: drive root), `depth` (default: 3, max: 10) |

**Search scope:** When `driveId` is provided, search is scoped to that drive's root using `/drives/{driveId}/root/search(q='...')`. Without `driveId`, search uses the site's default drive: `/sites/{graphSiteId}/drive/root/search(q='...')`.

**Path format for `spo-get-item-by-path`:** Path relative to drive root. Leading slash is added automatically if missing. Examples: `/Documents/Report.docx`, `Projects/2024/Plan.xlsx`.

**Folder structure build:** `getFolderStructure` recursively builds a `FolderTree` object. Only folders are expanded at each level (files are excluded from children); files appear in the parent's item listing. Parallel `Promise.all` is used at each depth level.

</tool-group>

<tool-group name="download">

## File Download

**Tool:** `spo-download-file`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID from configuration |
| `driveId` | string | Yes | Drive ID |
| `itemId` | string | No | Item ID — use this OR `path`, not both |
| `path` | string | No | File path relative to drive root — use this OR `itemId`, not both |

**Encoding logic (automatic, based on MIME type):**

Text MIME prefixes (returned as UTF-8 string):
- `text/` (all text/* types)
- `application/json`
- `application/xml`
- `application/javascript`
- `application/typescript`
- `application/csv`
- `application/x-yaml`
- `application/yaml`
- `application/sql`

All other MIME types (e.g., `application/pdf`, Office formats) are returned as base64-encoded string.

**Response fields:** `fileName`, `mimeType`, `encoding` (`utf-8` or `base64`), `size` (bytes), `itemId`, `webUrl`, `content`.

**Size limit:** Enforced against `SHAREPOINT_MAX_DOWNLOAD_SIZE_MB` (default 50 MB). Error message includes the actual size and how to increase the limit.

**Error if folder:** If the resolved item is a folder (no `file` property in Graph response), returns an error directing to use `spo-list-items`.

</tool-group>

<tool-group name="write-tools" priority="high">

## Write Tools (requires SHAREPOINT_ENABLE_WRITE=true)

<guard-behavior>

`checkWriteEnabled()` is called at the start of every write tool handler. If `SHAREPOINT_ENABLE_WRITE !== 'true'`, it throws: `"Write operations are disabled. Set SHAREPOINT_ENABLE_WRITE=true to enable."` This causes the tool to return `isError: true`.

</guard-behavior>

### spo-upload-file

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID |
| `driveId` | string | Yes | Drive ID |
| `path` | string | Yes | Target path including filename, relative to drive root |
| `content` | string | Yes | File content (UTF-8 string or base64-encoded binary) |
| `encoding` | `'utf-8'` \| `'base64'` | No | Default: `'utf-8'` |
| `overwrite` | boolean | No | Default: `false` (fails if file exists) |

**Upload strategy:**
- Files ≤ 4 MB: simple PUT to `/drives/{driveId}/root:{path}:/content`
- Files > 4 MB: chunked upload session via `/drives/{driveId}/root:{path}:/createUploadSession`, with 3.2 MB chunks (multiple of 320 KB as required by Graph API)
- `conflictBehavior`: `'replace'` if `overwrite=true`, `'fail'` otherwise

### spo-create-folder

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID |
| `driveId` | string | Yes | Drive ID |
| `parentPath` | string | Yes | Parent folder path; use `'/'` for drive root |
| `folderName` | string | Yes | New folder name |

Conflict behavior is `'fail'` (error if folder already exists).

### spo-move-item

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID |
| `driveId` | string | Yes | Source drive ID |
| `itemId` | string | Yes | Item to move |
| `targetDriveId` | string | Yes | Target drive ID (can be same as source) |
| `targetParentPath` | string | Yes | Target parent folder path (use `'/'` for root) |

Uses Graph PATCH on `parentReference` to move. Target parent folder ID is resolved first via a separate GET.

### spo-copy-item

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID |
| `driveId` | string | Yes | Source drive ID |
| `itemId` | string | Yes | Item to copy |
| `targetDriveId` | string | Yes | Target drive ID |
| `targetParentPath` | string | Yes | Target parent folder path |
| `newName` | string | No | New name for the copy (defaults to original name) |

Copy is asynchronous via Graph API POST to `/items/{itemId}/copy`. The response confirms the copy was initiated, not completed. Large files may take additional time.

### spo-rename-item

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID |
| `driveId` | string | Yes | Drive ID |
| `itemId` | string | Yes | Item to rename |
| `newName` | string | Yes | New name (include file extension for files) |

Uses Graph PATCH with `{ name: newName }`.

</tool-group>

<tool-group name="delete-tool" priority="high">

## Delete Tool (requires SHAREPOINT_ENABLE_DELETE=true)

### spo-delete-item

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID |
| `driveId` | string | Yes | Drive ID |
| `itemId` | string | Yes | Item to delete |
| `confirm` | boolean | Yes | Must be `true` to proceed; safety mechanism |

**Two-layer safety:**
1. `checkDeleteEnabled()` throws if `SHAREPOINT_ENABLE_DELETE !== 'true'`
2. `confirm` must be `true` at call time; if `false`, returns `isError: true` without deleting

**Behavior:** Item is moved to the site recycle bin (not permanently deleted). The item name is retrieved before deletion and included in the success response.

**CLI equivalent:** `mcp-spo-cli write delete --site-id ... --drive-id ... --item-id ... --confirm`

</tool-group>

<tool-group name="powerplatform-integration">

## PowerPlatform Integration Tools

These tools require a `powerPlatformService` obtained via `ctx.getPowerPlatformService()`. In the standalone `mcp-spo` server, this always throws: `"PowerPlatform integration not available in standalone SharePoint package. Use the complete @mcp-consultant-tools package for cross-service validation."` They only work in the meta package where PowerPlatform credentials are also configured.

### spo-get-crm-doc-locs

Queries the `sharepointdocumentlocations` Dataverse entity (filtered to `statecode eq 0`, i.e., active records).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `entityName` | string | No | Filter by entity logical name (e.g., `'account'`) |
| `recordId` | string | No | Filter by specific record GUID |

Filtering logic:
- Both provided: OData filter `statecode eq 0 and _regardingobjectid_value eq {recordId}`; `entityName` is not used in OData (it's client-side filtered afterward by `regardingobjectid.logicalName`)
- `entityName` only: all active locations, then client-side filter by `regardingobjectid.logicalName === entityName`
- `recordId` only: OData filter includes record ID
- Neither: all active document locations (up to 1000)

### spo-validate-doc-loc

Validates that a Dataverse `sharepointdocumentlocation` record corresponds to a real, accessible SharePoint folder.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documentLocationId` | string | Yes | GUID of the sharepointdocumentlocation record |

**Validation steps:**
1. Fetch CRM record; fail if not found
2. Parse `absoluteurl` to extract `siteUrl` and `folderPath`
3. Resolve site via Graph API; fail if inaccessible
4. Check site is in `SHAREPOINT_SITES` config; return `warning` if not
5. List drives and find the document library by name; return `warning` if not found
6. Attempt to access the folder by path; return `error` if inaccessible
7. Count items in folder; return `warning` if empty, `valid` if files present

**Response status values:** `'valid'` | `'warning'` | `'error'`

**Response shape:**
```json
{
  "documentLocationId": "...",
  "documentLocationName": "...",
  "crmConfig": { "absoluteUrl", "relativeUrl", "regardingEntity", "regardingRecordId", "isActive" },
  "spoValidation": { "siteExists", "folderExists", "folderAccessible", "fileCount", "isEmpty" },
  "status": "valid|warning|error",
  "issues": ["..."],
  "recommendations": ["..."]
}
```

### spo-verify-doc-mig

Compares source and target SharePoint folders to verify document migration completeness.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sourceSiteId` | string | Yes | Source site ID (configured ID) |
| `sourcePath` | string | Yes | Source folder path (e.g., `/Documents/Archive`) |
| `targetSiteId` | string | Yes | Target site ID |
| `targetPath` | string | Yes | Target folder path |

**Comparison logic:**
- Finds drive by extracting first path segment as library name
- Compares file names, sizes, and lastModifiedDateTime between source and target
- Calculates `successRate` as: `(targetFiles - extraFiles) / sourceFiles * 100`
- Status: `'complete'` (no missing/size mismatches), `'incomplete'` (successRate ≥ 50%), `'failed'` (successRate < 50%)

**Response includes:** `source` (path, fileCount, totalSize, files), `target`, `comparison` (missingFiles, extraFiles, sizeMismatches, modifiedDateMismatches), `successRate`, `status`.

</tool-group>

</tool-reference>

<prompts-reference>

| Prompt | Parameters | What it does |
|--------|------------|--------------|
| `spo-site-overview` | `siteId` | Calls `getSiteInfo` + `listDrives`; returns site metadata and drives table as markdown |
| `spo-library-details` | `siteId`, `driveId` | Calls `getDriveInfo` + `getRecentItems(10, 30)`; returns drive details + last 30 days activity |
| `spo-document-search` | `siteId`, `driveId`, `query` | Calls `searchItems`; returns formatted results |
| `spo-recent-activity` | `siteId`, `driveId`, `days` (optional, default: 7) | Calls `getRecentItems(50, days)`; returns recent changes |
| `spo-validate-crm-integration` | `documentLocationId` | Calls `validateDocumentLocation`; returns formatted validation report |
| `spo-document-location-audit` | `entityName` (optional), `recordId` (optional) | Calls `getCrmDocumentLocations` + `analyzeCrmDocumentLocations`; returns audit with insights and recommendations |
| `spo-migration-verification-report` | `sourceSiteId`, `sourcePath`, `targetSiteId`, `targetPath` | Calls `verifyDocumentMigration` + `analyzeMigrationVerification`; returns full migration report |
| `spo-setup-validation-guide` | — | Returns static setup checklist (Azure AD, permissions, site access, env vars) and testing steps |
| `spo-troubleshooting-guide` | `errorType` (optional) | Returns static troubleshooting guide for 6 common error scenarios: access denied, site not found, auth failed, token acquisition, folder not found, doc location validation |
| `spo-powerplatform-integration-health` | `entityName` (optional) | Calls `getCrmDocumentLocations` + `analyzeCrmDocumentLocations`; returns health summary with recommendations |

</prompts-reference>

<caching>

**In-memory cache** on `SharePointService`. Two separate maps:
- `cache: Map<string, CacheEntry<any>>` — general response cache (site info, drives)
- `siteIdCache: Map<string, string>` — siteUrl → Graph API site ID

**Cache key format:** `{method}:{siteId}:{resource}:{JSON.stringify(params)}`

**TTL:** Set by `SHAREPOINT_CACHE_TTL` (default 300 seconds). Checked on every read; expired entries are deleted on access.

**`spo-clear-cache` scenarios:**

| Call | Effect |
|------|--------|
| No params | Clears both `cache` and `siteIdCache` entirely |
| `siteId` | Clears cache entries containing `:${siteId}:`, plus siteIdCache entries mapping to that siteId |
| `pattern` | Clears cache entries whose key contains the pattern string |

Item-level operations (`listItems`, `getItem`, etc.) do not use the cache — only site-level data (site info, drives) is cached.

</caching>

<error-handling>

<error-map>

`SharePointService.handleError()` maps HTTP status codes to user-friendly messages:

| Status | Message |
|--------|---------|
| 401 | `"Authentication failed. Check credentials and permissions."` |
| 403 | `"Access denied. Ensure service principal has Sites.Read.All and Files.Read.All permissions."` |
| 404 | `"Resource not found. Check site URL or item path."` |
| 429 | `"Rate limit exceeded. Reduce request frequency."` + retry-after header if present |
| ENOTFOUND / ECONNREFUSED | `"Network error: Unable to reach SharePoint/Graph API."` |
| ETIMEDOUT | `"Request timeout. Try again later."` |

</error-map>

**Error sanitization:** `sanitizeErrorMessage()` strips Bearer tokens and GUIDs before logging/returning errors.

**All tool catch blocks** return `{ content: [{ type: "text", text: "..." }], isError: true }` and log to `console.error`.

**Audit logging:** All service operations log to `auditLogger` (from `@mcp-consultant-tools/core`) with `operation`, `operationType` (READ/CREATE/UPDATE/DELETE), `componentType`, `componentName`, `success`, `error`, `parameters`, and `executionTimeMs`.

</error-handling>

<cli-architecture>

**Binary:** `mcp-spo-cli`

CLI uses the same `ServiceContext` via `context-factory.ts`. All commands output a human-readable summary to stdout; full JSON is cached to `.context/.mcp-spo-cache/`.

<command-groups>

| Command group | Commands |
|--------------|----------|
| (root) | `list-sites`, `get-site-info`, `test-connection`, `list-drives`, `get-drive-info`, `clear-cache`, `list-items`, `get-item`, `get-item-by-path`, `search-items`, `get-recent-items`, `get-folder-structure`, `get-crm-doc-locs`, `validate-doc-loc`, `verify-doc-mig`, `download-file` |
| `write` | `upload`, `create-folder`, `move`, `copy`, `rename`, `delete` |

</command-groups>

<cli-examples>

```bash
# List all configured sites
mcp-spo-cli list-sites

# Get site metadata
mcp-spo-cli get-site-info --site-id intranet

# Test connection
mcp-spo-cli test-connection --site-id intranet

# List document libraries
mcp-spo-cli list-drives --site-id intranet

# List files in root of a library
mcp-spo-cli list-items --site-id intranet --drive-id b!abc123...

# List files in a subfolder
mcp-spo-cli list-items --site-id intranet --drive-id b!abc123... --folder-id folder-item-id

# Get item by path
mcp-spo-cli get-item-by-path --site-id intranet --drive-id b!abc123... --path "/Documents/Report.docx"

# Search for files
mcp-spo-cli search-items --site-id intranet --query "annual report" --limit 50

# Get recent changes (last 14 days)
mcp-spo-cli get-recent-items --site-id intranet --drive-id b!abc123... --days 14

# Get folder tree (depth 4)
mcp-spo-cli get-folder-structure --site-id intranet --drive-id b!abc123... --depth 4

# Download a file
mcp-spo-cli download-file --site-id intranet --drive-id b!abc123... --path "/Documents/Report.xlsx"
mcp-spo-cli download-file --site-id intranet --drive-id b!abc123... --item-id item-id-here

# Upload a file (requires SHAREPOINT_ENABLE_WRITE=true)
mcp-spo-cli write upload --site-id intranet --drive-id b!abc123... --path "/Documents/new-file.txt" --content "Hello World"
mcp-spo-cli write upload --site-id intranet --drive-id b!abc123... --path "/Documents/file.pdf" --content "base64data..." --encoding base64

# Create a folder
mcp-spo-cli write create-folder --site-id intranet --drive-id b!abc123... --parent-path "/" --folder-name "NewFolder"

# Move an item
mcp-spo-cli write move --site-id intranet --drive-id b!src123... --item-id item-id-here --target-drive-id b!dst123... --target-parent-path "/Archive"

# Copy an item
mcp-spo-cli write copy --site-id intranet --drive-id b!abc123... --item-id item-id-here --target-drive-id b!abc123... --target-parent-path "/Backup" --new-name "backup-copy.docx"

# Rename an item
mcp-spo-cli write rename --site-id intranet --drive-id b!abc123... --item-id item-id-here --new-name "renamed-file.docx"

# Delete an item (requires SHAREPOINT_ENABLE_DELETE=true)
mcp-spo-cli write delete --site-id intranet --drive-id b!abc123... --item-id item-id-here --confirm
```

</cli-examples>

</cli-architecture>

<security>

- **Write operations are disabled by default.** No environment variable = no write access.
- **Delete is gated separately** from write (two independent flags) to reduce blast radius.
- **Delete requires double confirmation:** env flag + `confirm: true` parameter.
- **Error messages are sanitized** before returning to clients (tokens and GUIDs stripped).
- **No write operations use full-text search** — Graph API search is filename/metadata only, preventing unintended data exposure via search.
- **App registration should use least-privilege:** `Sites.Read.All` + `Files.Read.All` for read-only deployments. Add `Sites.ReadWrite.All` + `Files.ReadWrite.All` only if write features are needed.

</security>

<multi-site-configuration>

Multiple sites are supported via the `SHAREPOINT_SITES` JSON array. Each tool that operates on a site accepts a `siteId` parameter that maps to the `id` field in the config.

**Site lookup:**
- `spo-list-sites`: returns all sites including inactive
- All other tools: call `getSiteById()` which throws if site is not found or is inactive

**Site ID resolution:** Each site's `siteUrl` is resolved to a Graph API site ID on first use and cached. The resolution uses `GET /sites/{hostname}:{pathname}`. This means the service principal must have `Sites.Read.All` on all configured sites.

**Cache scoping:** Cache keys include the `siteId`, so clearing cache for one site does not affect other sites.

</multi-site-configuration>
