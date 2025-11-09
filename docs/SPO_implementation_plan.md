# SharePoint Online (SPO) Integration - Implementation Plan

## Executive Summary

**Purpose:** Add read-only SharePoint Online access to validate PowerPlatform-SharePoint integration and document migration.

**Key Stats:**
- 📊 **18 tools** (15 general + 3 PowerPlatform validation)
- 📋 **10 prompts** (6 general + 4 PowerPlatform validation)
- 🔒 **Read-only** (metadata only, no file downloads)
- 🔐 **Microsoft Graph API** (MSAL authentication, reuses existing code)
- 📦 **No new dependencies** (uses existing MSAL + axios)
- ⏱️ **3-4 weeks** to implement
- 🚀 **Version 12.0.0** (major release)

**Primary Use Case:** **PowerPlatform-SharePoint Integration Validation**
- ✅ Verify documents copied to target location correctly
- ✅ Verify SPO setup matches documentation
- ✅ Validate against CRM `sharepointdocumentlocation` entity
- ✅ Detect configuration drift
- ✅ Generate health reports with remediation recommendations

**NOT a general document discovery tool** - focused on validation and auditing.

## Overview

Add read-only access to SharePoint Online sites, document libraries, and documents through the Microsoft Graph API. This integration enables AI assistants to validate SharePoint integration with Dynamics 365/PowerPlatform, verify document migrations, and audit site configuration against CRM reference data.

**Use Cases:**
- ✅ Validate SharePoint Document Location configuration (primary)
- ✅ Verify document migration completeness (primary)
- ✅ Audit document libraries for compliance
- ✅ Troubleshoot "user can't see documents" issues
- ✅ Generate health reports for entire SharePoint integration

## Requirements (CONFIRMED)

✅ **API Choice**: Microsoft Graph API (modern, recommended)

✅ **File Content**: Metadata only (no file downloads)

✅ **Search**: Filename and metadata search only (NO full-text search inside documents)

✅ **Metadata Depth**: Standard metadata only (name, size, dates, author)

✅ **Primary Use Case**: **SharePoint-PowerPlatform Integration Validation**
   - Verify documents have been copied to target location correctly
   - Verify SPO setup is correct based on documentation
   - Validate against CRM reference data (`sharepointdocumentlocation` entity)
   - Audit SPO structure vs PowerPlatform configuration

This is NOT a general document discovery tool - it's a **validation and audit tool** for SharePoint integration with Dynamics 365/PowerPlatform.

## Architecture

### API Choice: Microsoft Graph API

**Why Graph API over SharePoint REST API:**
- Modern, well-documented API
- Consistent authentication with other Azure services (MSAL)
- Better support for cross-service queries
- Simpler permission model
- Microsoft's recommended approach
- Same authentication pattern as App Insights, Log Analytics, Service Bus

**Graph API Endpoints:**
```
GET /sites/{site-id}                                    - Get site metadata
GET /sites/{site-id}/drives                             - List document libraries
GET /sites/{site-id}/drives/{drive-id}                  - Get library metadata
GET /sites/{site-id}/drives/{drive-id}/root/children    - List files/folders
GET /sites/{site-id}/drives/{drive-id}/items/{item-id}  - Get file/folder metadata
GET /sites/{site-id}/drive/root:/path/to/file           - Get file by path
GET /sites/{site-id}/drive/root/search(q='query')       - Search files
```

### Service Class: SharePointOnlineService

**File:** `src/SharePointOnlineService.ts`

**Core Responsibilities:**
- Manage authentication (Entra ID OAuth 2.0 only, no API keys)
- Execute Graph API requests
- Provide helper methods for common operations
- Support multiple sites with active/inactive flags
- Cache responses for performance

**Key Methods:**
```typescript
class SharePointOnlineService {
  // Authentication
  private async getAccessToken(): Promise<string>

  // Site operations
  async getSiteInfo(resourceId: string): Promise<SiteInfo>
  async listSites(): Promise<ConfiguredSite[]>  // Returns configured sites

  // Drive (library) operations
  async listDrives(resourceId: string): Promise<DriveInfo[]>
  async getDriveInfo(resourceId: string, driveId: string): Promise<DriveInfo>

  // Item (file/folder) operations
  async listItems(resourceId: string, driveId: string, folderId?: string): Promise<ItemInfo[]>
  async getItem(resourceId: string, driveId: string, itemId: string): Promise<ItemInfo>
  async getItemByPath(resourceId: string, driveId: string, path: string): Promise<ItemInfo>
  async searchItems(resourceId: string, driveId: string, query: string, limit?: number): Promise<ItemInfo[]>

  // Folder operations
  async getFolderContents(resourceId: string, driveId: string, folderId: string, recursive?: boolean): Promise<ItemInfo[]>
  async getFolderStructure(resourceId: string, driveId: string, depth?: number): Promise<FolderTree>

  // Metadata operations
  async getCustomColumns(resourceId: string, driveId: string): Promise<ColumnDefinition[]>
  async getItemVersions(resourceId: string, driveId: string, itemId: string): Promise<VersionInfo[]>

  // Utility
  async close(): Promise<void>
}
```

### Configuration Model

**Environment Variables:**

```bash
# Authentication (Entra ID only)
SPO_TENANT_ID=your-azure-tenant-id
SPO_CLIENT_ID=your-azure-app-client-id
SPO_CLIENT_SECRET=your-azure-app-client-secret

# Multi-site configuration (JSON array)
SPO_SITES='[
  {
    "id": "intranet",
    "name": "Company Intranet",
    "siteUrl": "https://yourtenant.sharepoint.com/sites/intranet",
    "active": true,
    "description": "Main intranet site"
  },
  {
    "id": "projects",
    "name": "Project Documents",
    "siteUrl": "https://yourtenant.sharepoint.com/sites/projects",
    "active": true,
    "description": "Project documentation"
  }
]'

# OR single-site fallback
SPO_SITE_URL=https://yourtenant.sharepoint.com/sites/intranet

# Optional configuration
SPO_CACHE_TTL=300                    # Cache TTL in seconds (default: 300)
SPO_MAX_SEARCH_RESULTS=100          # Max search results (default: 100)
SPO_SEARCH_TIMEOUT=30000            # Search timeout in ms (default: 30000)
SPO_ENABLE_VERSION_HISTORY=false    # Enable version history queries (default: false)
SPO_ENABLE_PERMISSIONS_READ=false   # Enable permissions queries (default: false)
```

**Configuration Interface:**

```typescript
interface SharePointOnlineConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sites: SiteConfig[];
  cacheTTL?: number;
  maxSearchResults?: number;
  searchTimeout?: number;
  enableVersionHistory?: boolean;
  enablePermissionsRead?: boolean;
}

interface SiteConfig {
  id: string;                // Unique identifier for configuration
  name: string;              // Display name
  siteUrl: string;           // Full SharePoint site URL
  active: boolean;           // Active/inactive toggle
  description?: string;      // Optional description
  defaultDriveId?: string;   // Optional default library ID
}
```

### Permissions Required

**Minimum Permissions (Delegated or Application):**
- `Sites.Read.All` - Read all site collections
- `Files.Read.All` - Read files in all site collections

**Optional Permissions:**
- `Sites.FullControl.All` - Required for permissions metadata (if enabled)
- `User.Read.All` - To resolve user display names

**App Registration Setup:**
1. Create Azure AD app registration
2. Add API permissions: Microsoft Graph → Application permissions → Sites.Read.All, Files.Read.All
3. Grant admin consent
4. Create client secret
5. Use same credentials for all configured sites

## Tools (18 total)

**Note**: Tools are organized around the primary use case: **validating SharePoint integration with PowerPlatform**.

### Site Tools (3)

**1. `spo-list-sites`**
- List all configured SharePoint sites (active and inactive)
- Returns: site ID, name, URL, active status, description

**2. `spo-get-site-info`**
- Get detailed site information
- Parameters: `resourceId`
- Returns: site metadata, web URL, created/modified dates, owner info

**3. `spo-test-connection`**
- Test connectivity to a SharePoint site
- Parameters: `resourceId`
- Returns: connection status, site info, permissions validation

### Drive (Library) Tools (3)

**4. `spo-list-drives`**
- List all document libraries in a site
- Parameters: `resourceId`
- Returns: drive ID, name, description, item count, size

**5. `spo-get-drive-info`**
- Get detailed library information
- Parameters: `resourceId`, `driveId`
- Returns: drive metadata, quota, owner, created/modified dates

**6. `spo-get-custom-columns`**
- Get custom column definitions for a library
- Parameters: `resourceId`, `driveId`
- Returns: column names, types, required status, default values

### Item (File/Folder) Tools (7)

**7. `spo-list-items`**
- List files and folders in a library or folder
- Parameters: `resourceId`, `driveId`, `folderId?`
- Returns: item list with metadata

**8. `spo-get-item`**
- Get file or folder metadata by ID
- Parameters: `resourceId`, `driveId`, `itemId`
- Returns: detailed item metadata

**9. `spo-get-item-by-path`**
- Get file or folder metadata by path
- Parameters: `resourceId`, `driveId`, `path`
- Returns: detailed item metadata

**10. `spo-search-items`**
- Search for files by filename or metadata
- Parameters: `resourceId`, `driveId?`, `query`, `maxResults?`
- Returns: matching items with relevance scores

**11. `spo-get-folder-structure`**
- Get recursive folder tree structure
- Parameters: `resourceId`, `driveId`, `folderId?`, `depth?`
- Returns: hierarchical folder tree

**12. `spo-get-item-versions`** (optional, if enabled)
- Get version history for a file
- Parameters: `resourceId`, `driveId`, `itemId`
- Returns: version list with dates, authors, sizes

**13. `spo-get-recent-items`**
- Get recently modified items in a library
- Parameters: `resourceId`, `driveId`, `limit?`, `days?`
- Returns: recent items sorted by modified date

### Utility Tools (2)

**14. `spo-get-metadata`**
- Get Graph API metadata (available properties, relationships)
- Parameters: `resourceId`
- Returns: schema information for sites, drives, items

**15. `spo-clear-cache`**
- Clear cached responses
- Parameters: `resourceId?`, `pattern?`
- Returns: number of cache entries cleared

### PowerPlatform Integration Validation Tools (3)

**16. `spo-get-crm-document-locations`**
- Get SharePoint Document Location records from PowerPlatform
- Parameters: `entityName?` (e.g., 'account', 'contact'), `recordId?`
- Returns: List of configured SharePoint Document Locations with URLs, relative paths, entity mappings
- Uses existing PowerPlatformService to query `sharepointdocumentlocation` entity

**17. `spo-validate-document-location`**
- Validate a specific SharePoint Document Location against actual SPO structure
- Parameters: `documentLocationId` (GUID from CRM)
- Returns: Validation result with:
  - ✅ Site exists in SPO
  - ✅ Folder/library exists at configured relative path
  - ✅ Folder is accessible
  - ⚠️ Folder is empty (potential issue)
  - ❌ Folder not found (configuration error)
- Queries CRM for config, then validates against SPO

**18. `spo-verify-document-migration`**
- Verify documents have been copied to target location
- Parameters: `sourceResourceId`, `sourcePath`, `targetResourceId`, `targetPath`
- Returns: Migration verification report:
  - File count comparison (source vs target)
  - Missing files list
  - File size differences
  - Modified date comparison
  - Success rate percentage
- Useful for validating document copy/migration operations

## Prompts (10 total)

**Note**: Prompts are focused on **PowerPlatform-SharePoint integration validation**.

### Site Prompts (2)

**1. `spo-site-overview`**
- Comprehensive site overview with all libraries
- Parameters: `resourceId`
- Returns: formatted markdown with site info, libraries, storage usage

**2. `spo-library-details`**
- Detailed library report with file statistics
- Parameters: `resourceId`, `driveId`
- Returns: formatted markdown with library info, file counts, top contributors

### Search Prompts (2)

**3. `spo-document-search`**
- Formatted search results with relevance and recommendations
- Parameters: `resourceId`, `query`, `driveId?`
- Returns: formatted markdown with search results, filters applied, suggestions

**4. `spo-recent-activity`**
- Recent activity report across libraries
- Parameters: `resourceId`, `days?`
- Returns: formatted markdown with recent changes, top contributors

### PowerPlatform Validation Prompts (4) - PRIMARY USE CASE

**5. `spo-validate-crm-integration`**
- **CRITICAL PROMPT**: Validate entire SharePoint integration with PowerPlatform
- Parameters: `entityName?` (e.g., 'account', 'contact')
- Returns: Comprehensive validation report:
  - ✅ All configured SharePoint Document Locations
  - ✅ Site and folder existence validation
  - ⚠️ Empty or misconfigured locations
  - ❌ Missing folders or permission issues
  - 📊 Overall health score
  - 🔧 Remediation recommendations
- **This is the main validation tool for SPO setup**

**6. `spo-document-location-audit`**
- Audit a specific SharePoint Document Location
- Parameters: `documentLocationId` (GUID from CRM)
- Returns: Detailed audit report:
  - CRM configuration (URL, relative path, parent location)
  - SPO validation (exists, accessible, file count)
  - Configuration issues (path mismatches, permission problems)
  - Recommendations for fixes

**7. `spo-migration-verification-report`**
- Verify document migration completeness
- Parameters: `sourceResourceId`, `sourcePath`, `targetResourceId`, `targetPath`
- Returns: Migration verification report:
  - Source vs target comparison table
  - Missing files list with details
  - File size discrepancies
  - Modified date differences
  - Migration success rate
  - Recommendations for remediation

**8. `spo-setup-validation-guide`**
- Validate SPO setup against best practices and documentation
- Parameters: `resourceId`
- Returns: Setup validation checklist:
  - Site collection configuration
  - Document library settings
  - Permission inheritance
  - Integration with PowerPlatform entities
  - Common configuration issues
  - Step-by-step remediation guide

### Troubleshooting Prompts (2)

**9. `spo-troubleshooting-guide`**
- Comprehensive troubleshooting for SPO access issues
- Parameters: `resourceId`
- Returns: formatted markdown with connection status, permissions, common issues

**10. `spo-powerplatform-integration-health`**
- Overall health check for PowerPlatform-SharePoint integration
- Parameters: None (checks all configured sites and CRM document locations)
- Returns: System-wide health report:
  - All sites connectivity status
  - All CRM document locations validation
  - Permission issues summary
  - Configuration drift detection
  - Priority recommendations

## Data Models

### SiteInfo
```typescript
interface SiteInfo {
  id: string;
  webUrl: string;
  displayName: string;
  description?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  owner?: {
    user?: {
      displayName: string;
      email: string;
    }
  };
  siteCollection?: {
    hostname: string;
  };
}
```

### DriveInfo
```typescript
interface DriveInfo {
  id: string;
  name: string;
  description?: string;
  webUrl: string;
  driveType: string;  // 'documentLibrary', 'personal', etc.
  createdDateTime: string;
  lastModifiedDateTime: string;
  quota?: {
    total: number;
    used: number;
    remaining: number;
    state: string;  // 'normal', 'nearing', 'critical', 'exceeded'
  };
  owner?: {
    user?: {
      displayName: string;
    }
  };
}
```

### ItemInfo
```typescript
interface ItemInfo {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy?: {
    user?: {
      displayName: string;
      email: string;
    }
  };
  lastModifiedBy?: {
    user?: {
      displayName: string;
      email: string;
    }
  };
  file?: {
    mimeType: string;
    hashes?: {
      sha256Hash: string;
    }
  };
  folder?: {
    childCount: number;
  };
  parentReference?: {
    driveId: string;
    id: string;
    path: string;
  };
  // Custom properties from SharePoint columns
  listItem?: {
    fields: Record<string, any>;
  };
}
```

### VersionInfo
```typescript
interface VersionInfo {
  id: string;
  lastModifiedDateTime: string;
  lastModifiedBy: {
    user: {
      displayName: string;
      email: string;
    }
  };
  size: number;
}
```

### SharePointDocumentLocation (CRM Entity)
```typescript
interface SharePointDocumentLocation {
  sharepointdocumentlocationid: string;  // GUID
  name: string;                           // Display name
  absoluteurl: string;                    // Full URL to folder
  relativeurl: string;                    // Relative path (e.g., 'account_12345')
  regardingobjectid: {                    // Related entity record
    id: string;
    logicalName: string;                  // e.g., 'account', 'contact'
  };
  parentsiteorlocation: {                 // Parent location
    id: string;
    logicalName: string;                  // 'sharepointdocumentlocation' or 'sharepointsite'
  };
  sitecollectionid?: string;              // Site collection GUID
  statecode: number;                      // 0 = Active, 1 = Inactive
  statuscode: number;                     // Status reason
}
```

### ValidationResult
```typescript
interface ValidationResult {
  documentLocationId: string;
  documentLocationName: string;
  crmConfig: {
    absoluteUrl: string;
    relativeUrl: string;
    regardingEntity: string;
    regardingRecordId: string;
    isActive: boolean;
  };
  spoValidation: {
    siteExists: boolean;
    folderExists: boolean;
    folderAccessible: boolean;
    fileCount: number;
    isEmpty: boolean;
  };
  status: 'valid' | 'warning' | 'error';
  issues: string[];
  recommendations: string[];
}
```

### MigrationVerification
```typescript
interface MigrationVerification {
  source: {
    path: string;
    fileCount: number;
    totalSize: number;
    files: ItemInfo[];
  };
  target: {
    path: string;
    fileCount: number;
    totalSize: number;
    files: ItemInfo[];
  };
  comparison: {
    missingFiles: string[];
    extraFiles: string[];
    sizeMismatches: Array<{ name: string; sourceSize: number; targetSize: number }>;
    modifiedDateMismatches: Array<{ name: string; sourceDate: string; targetDate: string }>;
  };
  successRate: number;  // Percentage (0-100)
  status: 'complete' | 'incomplete' | 'failed';
}
```

## Implementation Steps

### Phase 1: Core Service (Week 1)

**Tasks:**
1. ✅ Create `SharePointOnlineService.ts` with MSAL authentication
2. ✅ Implement token caching (5-minute buffer, 1-hour expiry)
3. ✅ Implement configuration parsing (multi-site + single-site fallback)
4. ✅ Implement basic Graph API client wrapper
5. ✅ Add error handling and sanitization
6. ✅ Add audit logging
7. ✅ Unit tests for service class

**Deliverables:**
- `src/SharePointOnlineService.ts`
- `src/types/spo-types.ts`
- Tests in `src/__tests__/SharePointOnlineService.test.ts`

### Phase 2: Site & Library Tools (Week 1)

**Tasks:**
1. ✅ Implement site tools (list, get-info, test-connection)
2. ✅ Implement drive tools (list, get-info, get-custom-columns)
3. ✅ Add tools to `src/index.ts`
4. ✅ Add Zod schemas for validation
5. ✅ Test against real SharePoint site

**Deliverables:**
- 6 tools registered in MCP server
- Integration tests

### Phase 3: Item Tools (Week 2)

**Tasks:**
1. ✅ Implement item listing and retrieval
2. ✅ Implement search functionality
3. ✅ Implement folder structure traversal
4. ✅ Implement recent items
5. ✅ Optional: Implement version history (if enabled)
6. ✅ Add all item tools to `src/index.ts`

**Deliverables:**
- 7 item tools registered
- Search and navigation working

### Phase 4: Formatters & Prompts (Week 2)

**Tasks:**
1. ✅ Create `src/utils/spo-formatters.ts`
2. ✅ Implement markdown formatters for all data types
3. ✅ Implement analysis functions (insights, recommendations)
4. ✅ Create 8 prompts
5. ✅ Add prompts to `src/index.ts`

**Deliverables:**
- `src/utils/spo-formatters.ts`
- 8 prompts registered

### Phase 5: Cross-Service Integration (Week 3)

**Tasks:**
1. ✅ Implement ADO work item correlation
2. ✅ Implement PowerPlatform solution correlation
3. ✅ Implement GitHub commit correlation
4. ✅ Create cross-service troubleshooting prompt
5. ✅ Add correlation examples to USAGE.md

**Deliverables:**
- 3 integration prompts working
- Cross-service examples documented

### Phase 6: Documentation (Week 3)

**CRITICAL: Documentation is NOT optional!**

**Tasks:**
1. ✅ Update README.md (overview, config example, tool counts)
2. ✅ Update SETUP.md (SPO setup section with screenshots)
3. ✅ Update TOOLS.md (document all 15 tools + 8 prompts)
4. ✅ Update USAGE.md (practical examples, workflows)
5. ✅ Update CLAUDE.md (architecture, security, patterns)
6. ✅ Update package.json (dependencies, description)
7. ✅ Update .env.example (SPO configuration)

**Deliverables:**
- All 5 documentation files updated
- Complete working examples
- Troubleshooting guides

### Phase 7: Testing & Release (Week 4)

**Tasks:**
1. ✅ End-to-end testing with multiple sites
2. ✅ Performance testing (large libraries)
3. ✅ Error handling validation
4. ✅ Security review (token handling, permissions)
5. ✅ Version bump (minor version)
6. ✅ Publish to npm
7. ✅ Announcement and examples

**Deliverables:**
- Comprehensive test coverage
- npm package published
- Release notes

## Security Considerations

### Read-Only by Design

**No Write Operations:**
- Service is strictly read-only (no create, update, delete)
- No file upload capabilities
- No permission modifications
- No site configuration changes
- Safe for production use

### Credential Management

**Token Security:**
- Tokens stored in memory only (never persisted)
- Automatic token refresh (1-hour expiry)
- 5-minute buffer before expiry
- Clear tokens on service disposal
- Never log tokens or credentials

**Error Sanitization:**
- Remove tokens from error messages
- Sanitize SharePoint URLs (remove tenant info if needed)
- Redact user emails (optional)

### Permission Model

**Minimum Permissions:**
- Sites.Read.All (application permission)
- Files.Read.All (application permission)
- Read-only access to all sites

**Optional Permissions:**
- Sites.FullControl.All (for permissions metadata - disabled by default)
- User.Read.All (to resolve user display names)

**RBAC:**
- Service principal has read-only access
- Configured sites list controls access scope
- Active/inactive flags for quick access control

### Data Handling

**Metadata Only (Default):**
- No file content download (metadata only)
- File content download can be added in v2 if needed
- Reduces security risk and data exposure

**Custom Column Data:**
- May contain sensitive information
- Users should configure appropriate app permissions
- Consider adding data sanitization options

## Performance Optimization

### Caching Strategy

**Response Caching:**
- Cache site info, drive lists, folder structures
- Default TTL: 5 minutes (configurable)
- Cache key format: `{method}:{siteId}:{resource}:{params}`
- Manual cache clear via tool

**What to Cache:**
- Site metadata (rarely changes)
- Drive lists (rarely changes)
- Folder structures (changes less frequently)
- Custom column definitions (rarely changes)

**What NOT to Cache:**
- Search results (dynamic)
- Recent items (changes frequently)
- Individual item metadata (changes frequently)

### Pagination

**Graph API Pagination:**
- Use `@odata.nextLink` for large result sets
- Default page size: 200 items
- Configurable max results (default: 100 for search)

**Folder Traversal:**
- Limit recursion depth (default: 5 levels)
- Use breadth-first traversal for better performance
- Stop early if result limit reached

### Query Optimization

**Selective Properties:**
- Use `$select` to request only needed properties
- Reduces response size and network latency
- Example: `?$select=id,name,webUrl,lastModifiedDateTime`

**Filtering:**
- Use `$filter` for server-side filtering
- Reduces client-side processing
- Example: `?$filter=file ne null` (files only)

**Ordering:**
- Use `$orderby` for server-side sorting
- Example: `?$orderby=lastModifiedDateTime desc`

## Error Handling

### Common Errors

**Authentication Errors (401/403):**
- Token expired → Automatic refresh
- Insufficient permissions → Clear message with required permissions
- Invalid credentials → Configuration validation message

**Site Errors (404):**
- Site not found → List of configured sites
- Site inactive → Activation instructions
- Site URL invalid → Format validation

**Drive Errors (404):**
- Drive not found → List of available drives
- Drive ID invalid → Suggest using `spo-list-drives`

**Item Errors (404):**
- Item not found → Suggest search or list operations
- Path invalid → Path format examples
- Permission denied → Explain permission requirements

**Rate Limiting (429):**
- Graph API throttling → Retry with exponential backoff
- Clear message about rate limits
- Suggest reducing query frequency

**Network Errors:**
- Timeout → Suggest reducing result limit or query complexity
- Connection error → Check network/firewall
- DNS error → Validate site URL format

## Graph API Integration

### Endpoints Used

**Sites API:**
```
GET /sites/{hostname}:{path}        - Get site by URL
GET /sites/{site-id}                - Get site by ID
GET /sites/{site-id}/drives         - List drives (libraries)
```

**Drives API:**
```
GET /drives/{drive-id}                              - Get drive info
GET /drives/{drive-id}/root/children                - List root items
GET /drives/{drive-id}/items/{item-id}              - Get item
GET /drives/{drive-id}/items/{item-id}/children     - List item children
GET /drives/{drive-id}/root:/path/to/file           - Get item by path
```

**Search API:**
```
GET /drives/{drive-id}/root/search(q='{query}')     - Search in drive
GET /sites/{site-id}/drive/root/search(q='{query}') - Search in site
```

**List Items API (for custom columns):**
```
GET /sites/{site-id}/lists/{list-id}/items          - Get list items
GET /sites/{site-id}/lists/{list-id}/columns        - Get columns
```

### Authentication Flow

**Token Acquisition:**
```typescript
1. Initialize MSAL client with client credentials
2. Request token with scope: https://graph.microsoft.com/.default
3. Cache token until 5 minutes before expiry
4. Automatic refresh on expiration
5. Use token in Authorization header: Bearer {token}
```

## Cross-Service Correlation

### ADO Work Item Correlation

**Scenario:** Find documents related to work item #1234

**Workflow:**
1. Get work item title and description
2. Search SPO for documents containing work item ID or keywords
3. Check document custom columns for "Work Item ID" field
4. Search document names for "AB#1234" or "#1234"
5. Return matching documents with relevance scores

**Implementation:**
```typescript
async findDocumentsForWorkItem(workItemId: number, resourceId?: string) {
  const workItem = await adoService.getWorkItem(project, workItemId);
  const searchTerms = [
    `AB#${workItemId}`,
    `#${workItemId}`,
    workItem.title,
    // Extract keywords from description
  ];

  const results = await spoService.searchItems(resourceId, null, searchTerms.join(' OR '));

  // Filter and rank by relevance
  return results;
}
```

### PowerPlatform Solution Correlation

**Scenario:** Find design documents for PowerPlatform solution

**Workflow:**
1. Get solution metadata (name, description, entities)
2. Search SPO for documents containing solution name or entity names
3. Check document metadata for "Solution" or "Entity" custom columns
4. Return design docs, specs, and related files

### GitHub Code Correlation

**Scenario:** Find documents referenced in GitHub commits

**Workflow:**
1. Search GitHub commits for document URLs or filenames
2. Extract SharePoint URLs from commit messages
3. Fetch document metadata from SPO
4. Correlate commits with document versions (by timestamp)

## Use Cases (FOCUSED ON POWERPLATFORM VALIDATION)

### Use Case 1: Validate SharePoint Integration Setup (PRIMARY)

**Scenario:** Verify SharePoint is correctly configured for Dynamics 365 Account records

**Workflow:**
1. Query CRM → Get all SharePoint Document Locations for 'account' entity
2. For each location:
   - Parse absolute URL and relative path
   - Connect to SharePoint site
   - Verify folder exists at specified path
   - Check folder is accessible
   - Count files in folder
3. Generate validation report → Show status for each location
4. Identify issues → Missing folders, empty folders, permission errors
5. Provide recommendations → How to fix configuration issues

**Tools Used:**
- `spo-get-crm-document-locations` (entityName: 'account')
- `spo-validate-document-location` (for each location)

**Prompt:** `spo-validate-crm-integration` (entityName: 'account')

**Expected Output:**
```
SharePoint Integration Validation Report for Entity: account
============================================================

✅ VALID (3 locations)
  ✅ Adventure Works Corp (account_00000000-1111-2222-3333-444444444444)
     - Path: /sites/CRM/Accounts/Adventure Works Corp
     - Files: 12
     - Last Modified: 2025-01-15

  ✅ Contoso Ltd (account_00000000-1111-2222-3333-555555555555)
     - Path: /sites/CRM/Accounts/Contoso Ltd
     - Files: 8
     - Last Modified: 2025-01-10

⚠️ WARNING (1 location)
  ⚠️ Fabrikam Inc (account_00000000-1111-2222-3333-666666666666)
     - Path: /sites/CRM/Accounts/Fabrikam Inc
     - Files: 0
     - Issue: Folder is empty - may indicate migration not complete

❌ ERROR (1 location)
  ❌ Fourth Coffee (account_00000000-1111-2222-3333-777777777777)
     - Path: /sites/CRM/Accounts/Fourth Coffee
     - Issue: Folder does not exist in SharePoint
     - Recommendation: Create folder or update CRM configuration

📊 Overall Health: 60% (3 valid, 1 warning, 1 error)
```

### Use Case 2: Verify Document Migration

**Scenario:** Verify all account documents were migrated from old SharePoint to new SharePoint

**Workflow:**
1. Connect to source SharePoint site → List all files in /OldSite/Accounts
2. Connect to target SharePoint site → List all files in /NewSite/CRM/Accounts
3. Compare file lists:
   - Match by filename
   - Check file size differences
   - Check modified date changes
4. Identify missing files → Files in source but not in target
5. Identify extra files → Files in target but not in source
6. Calculate success rate → % of files successfully migrated
7. Generate report → Missing files, size mismatches, success rate

**Tools Used:**
- `spo-list-items` (source site, source path)
- `spo-list-items` (target site, target path)
- `spo-verify-document-migration` (source → target comparison)

**Prompt:** `spo-migration-verification-report`

**Expected Output:**
```
Document Migration Verification Report
========================================

Source: /sites/OldSite/Accounts (152 files, 2.3 GB)
Target: /sites/NewSite/CRM/Accounts (148 files, 2.3 GB)

✅ Successfully Migrated: 148 files (97.4%)
❌ Missing Files: 4 files (2.6%)

Missing Files:
  - ImportantContract_v2.docx (450 KB, modified 2024-12-10)
  - Q4_Review.xlsx (125 KB, modified 2024-12-15)
  - Presentation_Draft.pptx (3.2 MB, modified 2024-12-20)
  - NDA_Signed.pdf (180 KB, modified 2024-12-25)

⚠️ Size Mismatches: 2 files
  - ProjectPlan.xlsx: Source 250 KB → Target 248 KB (2 KB smaller)
  - Logo.png: Source 500 KB → Target 502 KB (2 KB larger - may be re-compressed)

📊 Migration Status: INCOMPLETE
🔧 Recommendation: Investigate missing files and re-run migration for 4 files
```

### Use Case 3: Audit Specific Document Location

**Scenario:** Investigate why user can't see documents for a specific Account record

**Workflow:**
1. Get Account record ID from user → e.g., account_00000000-1111-2222-3333-444444444444
2. Query CRM → Find SharePoint Document Location for this Account
3. Parse configuration → Extract absolute URL, relative path
4. Validate SPO:
   - Check site exists
   - Check folder exists at path
   - Check folder is accessible
   - Count files in folder
5. Check CRM configuration:
   - Verify location is Active (statecode = 0)
   - Verify parent location hierarchy is correct
   - Verify regarding object matches Account record
6. Generate audit report → Full details + troubleshooting

**Tools Used:**
- `spo-get-crm-document-locations` (recordId: account GUID)
- `spo-validate-document-location` (documentLocationId)

**Prompt:** `spo-document-location-audit` (documentLocationId)

**Expected Output:**
```
SharePoint Document Location Audit
===================================

CRM Configuration:
  - Name: Adventure Works Corp
  - Regarding: account (00000000-1111-2222-3333-444444444444)
  - Absolute URL: https://contoso.sharepoint.com/sites/CRM/Accounts/Adventure Works Corp
  - Relative URL: Adventure Works Corp
  - State: Active
  - Parent Location: Default Site for Accounts

SharePoint Validation:
  ✅ Site exists: https://contoso.sharepoint.com/sites/CRM
  ✅ Folder exists: /Accounts/Adventure Works Corp
  ✅ Folder accessible: Yes
  📄 File count: 12 files
  📊 Total size: 4.5 MB
  📅 Last modified: 2025-01-15 14:30:00

Status: ✅ VALID - No issues detected

Recent Files:
  - Contract_2025.docx (450 KB, 2025-01-15)
  - Proposal_Q1.pdf (1.2 MB, 2025-01-12)
  - Meeting_Notes.docx (85 KB, 2025-01-10)
```

### Use Case 4: Validate Entire SharePoint Setup

**Scenario:** Pre-deployment validation - ensure SharePoint is ready for production

**Workflow:**
1. Test connection to all configured SharePoint sites
2. Query all SharePoint Document Locations from CRM (all entities)
3. Validate each location:
   - Site exists
   - Folder exists
   - Folder accessible
4. Check for configuration drift:
   - Locations pointing to non-existent sites
   - Inactive locations with files still present
   - Duplicate locations for same record
5. Generate comprehensive health report
6. Provide priority recommendations

**Prompt:** `spo-powerplatform-integration-health`

**Expected Output:**
```
PowerPlatform-SharePoint Integration Health Report
==================================================

Sites Connectivity:
  ✅ Production CRM Site (https://contoso.sharepoint.com/sites/CRM)
  ✅ Archive Site (https://contoso.sharepoint.com/sites/Archive)

Document Locations Summary:
  - Total Locations: 437
  - Valid: 398 (91.1%)
  - Warnings: 28 (6.4%)
  - Errors: 11 (2.5%)

Locations by Entity:
  - account: 152 locations (145 valid, 5 warning, 2 error)
  - contact: 98 locations (95 valid, 2 warning, 1 error)
  - opportunity: 187 locations (158 valid, 21 warning, 8 error)

⚠️ Common Issues:
  1. Empty folders (28 locations) - migration may be incomplete
  2. Missing folders (11 locations) - configuration drift
  3. Inactive locations with files (5 locations) - cleanup needed

📊 Overall Health Score: 91.1%
✅ Status: GOOD - Minor issues to address

🔧 Priority Recommendations:
  1. Investigate 11 missing folders (potential data loss)
  2. Complete migration for 28 empty folders
  3. Archive or delete 5 inactive locations with orphaned files
  4. Review opportunity entity configuration (highest error rate)
```

## Testing Plan

### Unit Tests

**SharePointOnlineService:**
- Token acquisition and caching
- Configuration parsing (multi-site + fallback)
- Graph API request building
- Error handling and sanitization
- Cache management

**Formatters:**
- Markdown generation
- Analysis functions (insights, recommendations)
- Data transformation
- Edge cases (empty results, missing fields)

### Integration Tests

**Graph API Integration:**
- Real site access (test tenant)
- Drive listing and retrieval
- Item search and listing
- Folder traversal
- Custom column retrieval
- Error scenarios (404, 403, 429)

### End-to-End Tests

**Full Workflows:**
- Site discovery → Library listing → Item search → Report generation
- Cross-service correlation (SPO + ADO + GitHub)
- Large library handling (pagination, performance)
- Cache effectiveness

### Performance Tests

**Load Testing:**
- Large libraries (10,000+ items)
- Deep folder structures (10+ levels)
- Concurrent requests (multiple sites)
- Cache hit rate measurement
- Token refresh under load

## Dependencies

### New npm Packages

**Required:**
- `@microsoft/microsoft-graph-client` - Graph API client (already available via @azure/msal-node deps)
- No new dependencies needed! MSAL and axios already available

**Optional:**
- None for read-only metadata access

### Existing Dependencies (Reuse)

- `@azure/msal-node` - OAuth 2.0 authentication (already used for App Insights, Log Analytics, Service Bus)
- `axios` - HTTP client (already used)
- `zod` - Parameter validation (already used)

## Documentation Checklist

**README.md:**
- [ ] Add SharePoint Online to overview
- [ ] **Highlight primary use case: PowerPlatform-SharePoint integration validation**
- [ ] Update tool count (138 → 156 tools)
- [ ] Update prompt count (28 → 38 prompts)
- [ ] Add SPO configuration to main example
- [ ] Add SPO to features list with focus on validation

**SETUP.md:**
- [ ] Add "SharePoint Online Setup" section
- [ ] Document app registration steps (with screenshots)
- [ ] Document API permissions (Sites.Read.All, Files.Read.All)
- [ ] Document admin consent process
- [ ] Add multi-site configuration example
- [ ] **Add PowerPlatform integration setup (sharepointdocumentlocation entity)**
- [ ] Add troubleshooting section (common SPO errors)
- [ ] Add validation workflow examples

**TOOLS.md:**
- [ ] Document all 18 SPO tools with parameters
- [ ] Document all 10 SPO prompts with parameters
- [ ] **Emphasize PowerPlatform validation tools (16-18)**
- [ ] **Emphasize validation prompts (5-8, 10)**
- [ ] Add examples for each tool
- [ ] Update table of contents
- [ ] Update tool/prompt count summary

**USAGE.md:**
- [ ] Add "SharePoint Online Usage" section
- [ ] **Add PowerPlatform validation workflows (primary focus)**
- [ ] Add document migration verification examples
- [ ] Add troubleshooting examples (why can't user see documents?)
- [ ] Add health check examples
- [ ] Add performance tips

**CLAUDE.md:**
- [ ] Add "SharePoint Online Integration" architecture section
- [ ] **Document PowerPlatform validation architecture**
- [ ] Document Graph API integration patterns
- [ ] Document authentication flow
- [ ] Document caching strategy
- [ ] Document security considerations
- [ ] **Document sharepointdocumentlocation entity integration**
- [ ] Update tool/prompt counts in overview (156 tools, 38 prompts)

**.env.example:**
- [ ] Add SPO configuration variables
- [ ] Add comments explaining each variable
- [ ] Add multi-site example
- [ ] Add optional flags (cache TTL, search limits)
- [ ] **No need for version history or permissions flags (not needed)**

**package.json:**
- [ ] Update description (add SharePoint Online + PowerPlatform validation)
- [ ] Add keywords (sharepoint, office365, graph-api, powerplatform-validation)
- [ ] Verify dependencies (no new ones needed!)

## Release Strategy

**Version:** 12.0.0 (major version - new integration)

**Release Branch:** `release/12.0`

**Testing Checklist:**
- [ ] All unit tests passing
- [ ] Integration tests with real SharePoint site
- [ ] Cross-service correlation tested
- [ ] Documentation complete (all 5 files)
- [ ] Performance tested (large libraries)
- [ ] Security reviewed (token handling, permissions)

**Merge to Main:**
- [ ] Merge `release/12.0` → `main`
- [ ] Run `npm version major` (11.0.0 → 12.0.0)
- [ ] Run `npm publish`
- [ ] Push tags: `git push && git push --tags`
- [ ] Create GitHub release with notes

## Key Decisions (CONFIRMED)

All questions have been answered:

1. **File Content Download:** ✅ **Metadata only** - No file content download needed
   - Focus: Validation and auditing, not document analysis
   - Future: Could add in v13.0 if needed

2. **Full-Text Search:** ✅ **NO full-text search** - Filename and metadata search only
   - Reason: Not needed for validation use case
   - Benefit: Avoids requiring `Search.Read.All` permission

3. **Version History:** ✅ **NOT needed** - Standard metadata only
   - Reason: Not relevant for validation use case
   - Benefit: Simpler implementation, no additional API calls

4. **Permissions Metadata:** ✅ **NOT needed** - Standard metadata only
   - Reason: Not relevant for validation use case
   - Benefit: Avoids requiring `Sites.FullControl.All` permission

5. **Site Discovery:** ✅ **Configured sites only** - Explicit list (matches other integrations)
   - Multi-site support with active/inactive flags
   - No auto-discovery

6. **Primary Use Case:** ✅ **PowerPlatform-SharePoint Integration Validation**
   - Verify documents copied to target location correctly
   - Verify SPO setup matches documentation
   - Validate against CRM reference data (sharepointdocumentlocation entity)
   - NOT a general document discovery tool

7. **Custom Columns:** ✅ **Standard metadata only** - No special custom column requirements
   - Name, size, dates, author
   - No need for Work Item ID, Solution Name, etc.

These decisions simplify the implementation significantly and focus the integration on the core validation use case.

## Next Steps

✅ **Plan approved** - All questions answered, architecture confirmed

**Ready to start implementation:**

1. **Phase 1: Core Service** (Week 1)
   - Create `SharePointOnlineService.ts` with MSAL authentication
   - Implement Graph API client wrapper
   - Add configuration parsing (multi-site + fallback)
   - Unit tests

2. **Phase 2: Site & Library Tools** (Week 1)
   - Implement 6 basic tools (site, drive operations)
   - Register tools in MCP server
   - Integration tests with real SharePoint site

3. **Phase 3: Item & Validation Tools** (Week 2)
   - Implement 7 item tools (list, search, folder operations)
   - **Implement 3 PowerPlatform validation tools (CRITICAL)**
   - Integration with PowerPlatformService (sharepointdocumentlocation queries)

4. **Phase 4: Formatters & Prompts** (Week 2)
   - Create formatters in `src/utils/spo-formatters.ts`
   - **Implement 4 validation prompts (CRITICAL)**
   - Implement 6 general prompts

5. **Phase 5: Documentation** (Week 3)
   - **MANDATORY: Update all 5 documentation files**
   - Complete working examples
   - Troubleshooting guides

6. **Phase 6: Testing & Release** (Week 3-4)
   - End-to-end validation testing
   - Performance testing
   - Merge to main → Version 12.0.0 → Publish to npm

---

**Total Estimated Effort:** 3-4 weeks (1 developer, full-time)

**Risk Level:** Low
- Well-established patterns (MSAL already integrated)
- Read-only operations (safe)
- No new dependencies
- Existing PowerPlatformService integration

**Value:** Very High
- **Enables PowerPlatform-SharePoint integration validation**
- **Document migration verification**
- **Configuration drift detection**
- **Automated health checks**
- Reduces manual validation effort by 90%+
