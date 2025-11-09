# SharePoint Online Integration - Implementation Plan

## Overview

Add read-only SharePoint Online (SPO) site, list, library, and document inspection capabilities to the MCP server. This integration enables AI assistants to access organizational knowledge stored in SharePoint, search documents, inspect list data, analyze site structures, and correlate SharePoint content with PowerPlatform solutions, Azure DevOps work items, and deployed applications.

**Status**: 📋 Planning Phase

**Target Release**: 11.0

**Similar Implementation**: GitHub Enterprise integration (release 9.0), Azure DevOps integration (release 7.0)

---

## Use Cases

### Primary Use Cases

1. **Document Search and Retrieval**
   - Search documents across sites and libraries
   - Retrieve document content and metadata
   - Access version history
   - Download attachments from lists
   - Export document properties for analysis

2. **List Data Inspection**
   - Query SharePoint lists (similar to database tables)
   - Filter and sort list items
   - Access custom columns and metadata
   - Inspect lookup relationships between lists
   - Analyze list permissions and settings

3. **Site Structure Analysis**
   - Explore site hierarchy and subsites
   - List available libraries and lists
   - Inspect content types and site columns
   - Review site templates and features
   - Map information architecture

4. **Cross-Service Knowledge Correlation**
   - Link SharePoint documentation to PowerPlatform solutions
   - Connect SharePoint lists to Azure DevOps work items
   - Correlate SharePoint data with deployed applications
   - Trace requirements from SharePoint to implementation
   - Find related knowledge articles for troubleshooting

### Example Workflows

**Workflow 1**: Finding Requirements Documentation for a PowerPlatform Solution

1. Query PowerPlatform → Get entity "sic_project"
2. Search SharePoint → Find project documentation by project ID
3. Get document content → Extract requirements and specifications
4. Search Azure DevOps → Find related work items linking to SharePoint
5. Generate report → Requirements traceability matrix

**Workflow 2**: Troubleshooting with Knowledge Base Articles

1. Application Insights → Find exception "NullReferenceException in ContactPlugin"
2. Search SharePoint → Find knowledge base articles about contact processing
3. Get article content → Review troubleshooting steps
4. GitHub Enterprise → Search code for related implementations
5. Generate guide → Contextualized troubleshooting instructions

**Workflow 3**: Audit Trail Investigation

1. PowerPlatform → User reports missing data
2. SharePoint Audit Logs → Check who modified/deleted items
3. Get list version history → Review previous versions
4. Correlate with Azure DevOps → Find related deployment that caused issue
5. Generate report → Root cause analysis with timeline

---

## Architecture

### Service Class: `SharePointService`

**File**: `src/SharePointService.ts`

**Responsibilities**:
- Manage authentication to SharePoint Online via Microsoft Graph API
- Provide read-only access to sites, lists, libraries, and documents
- Search documents and list items
- Retrieve document content and metadata
- List site structures and taxonomies
- Handle pagination for large result sets
- Cache frequently accessed metadata (sites, lists)

**Authentication Method**:

**Microsoft Graph API (OAuth 2.0)** - Primary approach
- Uses `@microsoft/microsoft-graph-client` with MSAL authentication
- Requires **Microsoft Graph API permissions**:
  - **Sites.Read.All** - Read sites, lists, and items (application permission)
  - **Files.Read.All** - Read files in all site collections (application permission)
  - **User.Read.All** (optional) - Resolve user IDs to names
- Uses `@azure/msal-node` (already in use for PowerPlatform, App Insights)
- Token caching with automatic refresh
- Supports service principal authentication

**Alternative (Not Recommended)**: SharePoint REST API
- Legacy API, more complex authentication
- Limited compared to Graph API
- Consider only if Graph API doesn't meet needs

### Dependencies

**New npm packages**:
```json
{
  "@microsoft/microsoft-graph-client": "^3.0.7",
  "@azure/msal-node": "^2.6.0"  // Already installed
}
```

### Configuration

**Multi-Site Configuration** (JSON array):
```json
SHAREPOINT_RESOURCES=[
  {
    "id": "main-intranet",
    "name": "Main Intranet",
    "siteUrl": "https://contoso.sharepoint.com/sites/intranet",
    "active": true,
    "description": "Company intranet with policies and procedures",
    "defaultLibrary": "Documents"
  },
  {
    "id": "project-docs",
    "name": "Project Documentation",
    "siteUrl": "https://contoso.sharepoint.com/sites/projects",
    "active": true,
    "description": "Project requirements and specifications"
  }
]
```

**Single-Site Fallback**:
```bash
SHAREPOINT_SITE_URL=https://contoso.sharepoint.com/sites/intranet
```

**Authentication Configuration**:
```bash
# Microsoft Graph Authentication (Entra ID)
SHAREPOINT_TENANT_ID=your-tenant-id
SHAREPOINT_CLIENT_ID=your-azure-app-client-id
SHAREPOINT_CLIENT_SECRET=your-azure-app-secret

# Optional: SharePoint-specific settings
SHAREPOINT_API_VERSION=v1.0  # Default: v1.0 (stable), can use beta for advanced features
SHAREPOINT_MAX_SEARCH_RESULTS=500  # Default: 500
SHAREPOINT_ENABLE_CACHE=true  # Default: true
SHAREPOINT_CACHE_TTL=600  # Default: 600 seconds (10 minutes)
```

### Service Implementation Architecture

```typescript
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

export class SharePointService {
  // Microsoft Graph client
  private graphClient: Client | null = null;

  // Token management (similar to ApplicationInsightsService)
  private msalClient: ConfidentialClientApplication | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  // Cache for site/list metadata
  private cache: Map<string, { data: any; expires: number }> = new Map();

  // Configuration
  private config: SharePointConfig;

  // Core methods
  async testConnection(siteId: string): Promise<ConnectionTestResult>
  async getSiteInfo(siteId: string): Promise<SiteInfo>
  async listLists(siteId: string): Promise<ListInfo[]>
  async listLibraries(siteId: string): Promise<LibraryInfo[]>
  async getListItems(siteId: string, listId: string, filter?: string, select?: string[], top?: number): Promise<any[]>
  async searchDocuments(siteId: string, query: string, libraryId?: string): Promise<SearchResult[]>
  async getDocument(siteId: string, driveId: string, itemId: string): Promise<DocumentInfo>
  async getDocumentContent(siteId: string, driveId: string, itemId: string): Promise<Buffer>
  async getDocumentVersions(siteId: string, driveId: string, itemId: string): Promise<VersionInfo[]>
  async getSiteStructure(siteId: string): Promise<SiteStructure>

  // Utility methods
  private async getGraphClient(): Promise<Client>
  private getCacheKey(method: string, siteId: string, resource: string, params?: any): string
  private getCached<T>(key: string): T | null
  private setCached(key: string, data: any): void
  clearCache(pattern?: string, siteId?: string): number
}
```

---

## Tools (12 total)

### Site Management Tools (3)

1. **`sharepoint-list-sites`**
   - **Description**: List all configured SharePoint sites with status
   - **Parameters**: None
   - **Returns**: Array of site configurations (id, name, siteUrl, active, description)
   - **Use Case**: Discover available sites before querying

2. **`sharepoint-test-connection`**
   - **Description**: Test connectivity and permissions for a SharePoint site
   - **Parameters**:
     - `siteId` (required): Site identifier from configuration
   - **Returns**: Connection status, site title, web URL, permissions
   - **Use Case**: Validate configuration and troubleshoot access issues

3. **`sharepoint-get-site-structure`**
   - **Description**: Get complete site structure including lists, libraries, and subsites
   - **Parameters**:
     - `siteId` (required): Site identifier
   - **Returns**: Hierarchical site structure with all lists, libraries, content types
   - **Use Case**: Explore site information architecture

### List and Library Tools (4)

4. **`sharepoint-list-lists`**
   - **Description**: List all lists in a SharePoint site
   - **Parameters**:
     - `siteId` (required): Site identifier
   - **Returns**: Array of lists with metadata (id, name, itemCount, lastModified)
   - **Use Case**: Discover available data sources

5. **`sharepoint-list-libraries`**
   - **Description**: List all document libraries in a SharePoint site
   - **Parameters**:
     - `siteId` (required): Site identifier
   - **Returns**: Array of libraries with metadata (id, name, documentCount, size)
   - **Use Case**: Find document repositories

6. **`sharepoint-get-list-items`**
   - **Description**: Query items from a SharePoint list with filtering
   - **Parameters**:
     - `siteId` (required): Site identifier
     - `listId` (required): List identifier (name or GUID)
     - `filter` (optional): OData filter expression (e.g., "Status eq 'Active'")
     - `select` (optional): Array of column names to return
     - `orderBy` (optional): Sort expression
     - `top` (optional): Max items to return (default: 100, max: 5000)
   - **Returns**: Array of list items with field values
   - **Use Case**: Query structured data from SharePoint lists

7. **`sharepoint-get-list-schema`**
   - **Description**: Get list schema including all columns and field types
   - **Parameters**:
     - `siteId` (required): Site identifier
     - `listId` (required): List identifier
   - **Returns**: List schema with columns, types, required fields, relationships
   - **Use Case**: Understand list structure before querying

### Document Tools (4)

8. **`sharepoint-search-documents`**
   - **Description**: Search documents across libraries using full-text search
   - **Parameters**:
     - `siteId` (required): Site identifier
     - `query` (required): Search query (supports KQL syntax)
     - `libraryId` (optional): Limit search to specific library
     - `fileType` (optional): Filter by file extension (e.g., "docx", "pdf")
     - `top` (optional): Max results (default: 100, max: 500)
   - **Returns**: Search results with snippets, relevance scores, metadata
   - **Use Case**: Find documents by content or properties

9. **`sharepoint-get-document`**
   - **Description**: Get document metadata and properties
   - **Parameters**:
     - `siteId` (required): Site identifier
     - `driveId` (required): Drive/library identifier
     - `itemId` (required): Document item ID
   - **Returns**: Document metadata (name, size, modified, author, custom properties)
   - **Use Case**: Inspect document details

10. **`sharepoint-get-document-content`**
    - **Description**: Download document content (text-based files only: txt, md, json, xml, csv)
    - **Parameters**:
      - `siteId` (required): Site identifier
      - `driveId` (required): Drive identifier
      - `itemId` (required): Document item ID
    - **Returns**: Document content as text
    - **Use Case**: Read document content for analysis
    - **Note**: Binary files (docx, pdf, xlsx) not supported in v11.0 - returns metadata only

11. **`sharepoint-get-document-versions`**
    - **Description**: Get version history for a document
    - **Parameters**:
      - `siteId` (required): Site identifier
      - `driveId` (required): Drive identifier
      - `itemId` (required): Document item ID
    - **Returns**: Array of versions with timestamps, authors, comments
    - **Use Case**: Track document changes over time

### Utility Tools (1)

12. **`sharepoint-clear-cache`**
    - **Description**: Clear cached site/list metadata
    - **Parameters**:
      - `pattern` (optional): Clear cache matching pattern
      - `siteId` (optional): Clear cache for specific site
    - **Returns**: Number of cache entries cleared
    - **Use Case**: Force refresh after SharePoint changes

---

## Prompts (5 total)

### Site Overview Prompts (2)

1. **`sharepoint-site-overview`**
   - **Description**: Comprehensive site overview with lists, libraries, and recent activity
   - **Arguments**:
     - `siteId` (required): Site identifier
   - **Output**: Markdown report with:
     - Site info (title, URL, description)
     - Lists table (name, item count, last modified)
     - Libraries table (name, document count, size)
     - Recent documents
     - Insights and recommendations
   - **Use Case**: Understand site structure and content

2. **`sharepoint-list-report`**
   - **Description**: Detailed list report with schema and sample data
   - **Arguments**:
     - `siteId` (required): Site identifier
     - `listId` (required): List identifier
   - **Output**: Markdown report with:
     - List properties
     - Column schema table
     - Sample items (first 10)
     - Statistics (item count, growth rate)
   - **Use Case**: Document list structure

### Search and Discovery Prompts (2)

3. **`sharepoint-search-report`**
   - **Description**: Formatted search results with relevance scoring
   - **Arguments**:
     - `siteId` (required): Site identifier
     - `query` (required): Search query
   - **Output**: Markdown report with:
     - Search summary (query, result count)
     - Results table (title, snippet, relevance, modified)
     - Recommendations for refining search
   - **Use Case**: Find relevant documents

4. **`sharepoint-document-details`**
   - **Description**: Detailed document report with metadata and version history
   - **Arguments**:
     - `siteId` (required): Site identifier
     - `driveId` (required): Drive identifier
     - `itemId` (required): Document item ID
   - **Output**: Markdown report with:
     - Document properties table
     - Version history
     - Related documents
     - Recommendations
   - **Use Case**: Investigate document details

### Cross-Service Prompts (1)

5. **`sharepoint-correlation-report`**
   - **Description**: Cross-service correlation connecting SharePoint with PowerPlatform, ADO, GitHub
   - **Arguments**:
     - `siteId` (required): Site identifier
     - `entityType` (required): "document" | "list-item" | "site"
     - `entityId` (required): Entity identifier
   - **Output**: Markdown report with:
     - SharePoint entity details
     - Related PowerPlatform records (if any)
     - Related ADO work items (if references found)
     - Related GitHub commits (if references found)
     - Correlation timeline
     - Insights and recommendations
   - **Use Case**: Trace SharePoint content to development artifacts

---

## Implementation Phases

### Phase 1: Core Service and Authentication (Week 1)

**Tasks**:
1. Create `src/SharePointService.ts` with Graph API client
2. Implement MSAL authentication with token caching
3. Add configuration parsing (multi-site JSON + fallback)
4. Implement connection testing
5. Add audit logging

**Deliverables**:
- Working authentication to SharePoint via Graph API
- `sharepoint-test-connection` tool
- `sharepoint-list-sites` tool
- Unit tests for authentication

### Phase 2: Site and List Tools (Week 1-2)

**Tasks**:
1. Implement `getSiteInfo()`, `listLists()`, `listLibraries()`
2. Implement `getListItems()` with OData filtering
3. Implement `getListSchema()`
4. Add caching for site/list metadata
5. Create tools:
   - `sharepoint-get-site-structure`
   - `sharepoint-list-lists`
   - `sharepoint-list-libraries`
   - `sharepoint-get-list-items`
   - `sharepoint-get-list-schema`

**Deliverables**:
- Site and list inspection tools
- `sharepoint-site-overview` prompt
- `sharepoint-list-report` prompt
- Integration tests

### Phase 3: Document Tools (Week 2)

**Tasks**:
1. Implement `searchDocuments()` with Graph search API
2. Implement `getDocument()`, `getDocumentContent()`, `getDocumentVersions()`
3. Add file type filtering and content extraction (text files only)
4. Create tools:
   - `sharepoint-search-documents`
   - `sharepoint-get-document`
   - `sharepoint-get-document-content`
   - `sharepoint-get-document-versions`
5. Create formatters in `src/utils/sharepoint-formatters.ts`

**Deliverables**:
- Document search and retrieval tools
- `sharepoint-search-report` prompt
- `sharepoint-document-details` prompt
- Content extraction for text-based files

### Phase 4: Documentation (Week 2-3)

**Tasks**:
1. Update `README.md`:
   - Add SharePoint to overview
   - Update tool count (150 tools total)
   - Add SharePoint configuration example
2. Update `SETUP.md`:
   - Add SharePoint setup instructions
   - Document Azure AD app registration (Graph API permissions)
   - Add troubleshooting section
3. Update `TOOLS.md`:
   - Document all 12 tools with parameters and examples
   - Document all 5 prompts
   - Update tool count summary
4. Update `USAGE.md`:
   - Add 5+ real-world examples
   - Show cross-service workflows
5. Update `CLAUDE.md`:
   - Add SharePoint architecture section
   - Document Graph API integration
   - Add security considerations

**Deliverables**:
- Complete documentation across all 5 files
- Configuration examples
- Troubleshooting guide

### Phase 5: Testing and Polish (Week 3)

**Tasks**:
1. Write comprehensive integration tests
2. Test with various SharePoint configurations
3. Performance testing with large sites
4. Error handling improvements
5. Security review
6. Create example scripts in `examples/`

**Deliverables**:
- Test suite with >80% coverage
- Performance benchmarks
- Security audit report
- Example scripts

---

## Security Considerations

### Read-Only Access

**Enforcement**:
- All Graph API calls use read-only methods (GET only)
- No POST/PATCH/DELETE operations implemented
- No write permissions requested in Azure AD app registration
- Service validates all operations are read-only

### Credential Management

**Best Practices**:
- Never log credentials or tokens
- Store tokens in memory only (never persist to disk)
- Clear tokens on service disposal
- Use `.env` files for local development (gitignored)
- Rotate client secrets regularly (recommended: 90 days)

### Data Sanitization

**Configurable Sanitization** (optional, disabled by default):
```bash
SHAREPOINT_SANITIZE_CONTENT=false  # Default: false
```

When enabled:
- Redact email addresses from content
- Remove phone numbers
- Sanitize connection strings in error messages
- Truncate large responses

### Permissions (Azure AD App Registration)

**Required Application Permissions**:
- `Sites.Read.All` - Read sites, lists, items
- `Files.Read.All` - Read files in document libraries

**Optional Permissions**:
- `User.Read.All` - Resolve user IDs to display names

**NOT Required** (read-only approach):
- ❌ `Sites.ReadWrite.All`
- ❌ `Files.ReadWrite.All`
- ❌ `Sites.Manage.All`

### Rate Limiting

**Graph API Limits**:
- 10,000 requests per 10 minutes per app
- Monitor via `RateLimit-*` response headers
- Implement exponential backoff on 429 errors

### Audit Logging

All operations logged with:
- Operation type (READ)
- Site ID and resource
- Success/failure status
- Execution time
- User context (service principal)

---

## Error Handling

### Authentication Errors (401/403)

**Common Issues**:
1. Invalid credentials → Check SHAREPOINT_CLIENT_ID/SECRET
2. Expired token → Auto-refresh implemented
3. Missing permissions → Verify Sites.Read.All and Files.Read.All granted
4. Tenant not found → Check SHAREPOINT_TENANT_ID

**Error Messages**:
```
Error: Missing required SharePoint configuration: SHAREPOINT_TENANT_ID
Error: Failed to authenticate to Microsoft Graph: invalid_client
Error: Insufficient permissions - Sites.Read.All required
```

### Site Errors (404)

**Common Issues**:
1. Site URL incorrect → Verify `siteUrl` in configuration
2. Site doesn't exist → Check SharePoint admin center
3. Access denied → Verify app permissions granted to site

**Error Messages**:
```
Error: Site not found: https://contoso.sharepoint.com/sites/invalid
Error: Access denied to site 'main-intranet' - verify permissions
```

### List/Library Errors

**Common Issues**:
1. List not found → Use `sharepoint-list-lists` to discover lists
2. Invalid filter expression → Check OData syntax
3. Column doesn't exist → Use `sharepoint-get-list-schema` first

**Error Messages**:
```
Error: List 'Customers' not found in site 'main-intranet'
Error: Invalid OData filter: 'Status = Active' (use 'eq' not '=')
Error: Column 'CustomField' does not exist - available columns: [...]
```

### Document Errors

**Common Issues**:
1. Document not found → Verify driveId and itemId
2. Binary file requested → Only text files supported in v11.0
3. File too large → Limit: 10MB for content download

**Error Messages**:
```
Error: Document not found: driveId={id}, itemId={id}
Error: Binary file type 'docx' not supported - metadata only
Error: Document too large (25MB) - max 10MB for content download
```

### Rate Limiting (429)

**Handling**:
- Parse `Retry-After` header
- Implement exponential backoff (1s, 2s, 4s, 8s)
- Cache frequently accessed data
- Batch requests where possible

**Error Messages**:
```
Error: Rate limit exceeded - retry after 60 seconds
Error: Too many requests to Microsoft Graph - reduce query frequency
```

---

## Testing Strategy

### Unit Tests

**Coverage Target**: >80%

**Test Files**:
- `tests/SharePointService.test.ts` - Service class methods
- `tests/sharepoint-formatters.test.ts` - Formatter utilities
- `tests/sharepoint-tools.test.ts` - Tool parameter validation

**Mock Strategy**:
- Mock `@microsoft/microsoft-graph-client` responses
- Mock MSAL token acquisition
- Test error handling with various Graph API errors

### Integration Tests

**Test Scenarios**:
1. Authentication flow (Entra ID)
2. Site discovery and structure retrieval
3. List querying with OData filters
4. Document search and content retrieval
5. Caching behavior
6. Multi-site configuration handling

**Test Data**:
- Real SharePoint test tenant
- Sample documents (txt, md, json)
- Sample lists with various column types

### Manual Testing Checklist

**Configuration Testing**:
- [ ] Multi-site JSON configuration
- [ ] Single-site fallback configuration
- [ ] Invalid configuration handling
- [ ] Missing permission handling

**Tool Testing**:
- [ ] Test each of 12 tools with valid inputs
- [ ] Test error cases (invalid site, list not found, etc.)
- [ ] Test pagination for large result sets
- [ ] Test caching and cache clearing

**Cross-Service Testing**:
- [ ] SharePoint + PowerPlatform correlation
- [ ] SharePoint + Azure DevOps correlation
- [ ] SharePoint + GitHub correlation
- [ ] `sharepoint-correlation-report` prompt

---

## Performance Considerations

### Caching Strategy

**What to Cache**:
- Site metadata (title, URL, ID) - TTL: 10 minutes
- List schemas - TTL: 10 minutes
- Library structures - TTL: 10 minutes

**What NOT to Cache**:
- List items (data changes frequently)
- Document content
- Search results

### Pagination

**Large Result Sets**:
- Use Graph API `@odata.nextLink` for pagination
- Default page size: 100 items
- Max page size: 1000 items (Graph API limit)
- Client-side limit: 5000 items max per query

### Query Optimization

**Best Practices**:
- Use `$select` to request only needed columns
- Use `$filter` to reduce result sets
- Use `$top` to limit results
- Avoid `$expand` unless necessary (slow)
- Cache frequently accessed schemas

**Example Optimized Query**:
```
GET /sites/{site-id}/lists/{list-id}/items
  ?$select=id,fields/Title,fields/Status,fields/Modified
  &$filter=fields/Status eq 'Active'
  &$top=100
```

### Batch Requests

**Graph API Batching** (Future Enhancement):
- Combine multiple GET requests into single batch
- Reduce network round-trips
- Max 20 requests per batch
- Not implemented in v11.0 (future optimization)

---

## Future Enhancements (Not in v11.0)

### Advanced Document Support

**Binary Document Processing**:
- Extract text from Word documents (.docx) using `mammoth` library
- Extract text from PDFs using `pdf-parse`
- Extract text from Excel (.xlsx) using `xlsx` library
- Image OCR for scanned documents

### Advanced Search

**Search Enhancements**:
- Saved search queries
- Search across multiple sites
- Advanced KQL query builder
- Search result ranking and filtering

### List Write Operations

**Write Tools** (requires separate permission model):
- `sharepoint-create-list-item`
- `sharepoint-update-list-item`
- `sharepoint-upload-document`

**Required Permissions**:
- `Sites.ReadWrite.All`
- Separate environment flag: `SHAREPOINT_ENABLE_WRITE=true`

### Workflow Integration

**Power Automate Correlation**:
- Detect flows triggered by SharePoint events
- Show flow runs related to documents/items
- Correlate with flow execution logs

### Taxonomy and Metadata

**Managed Metadata**:
- Access term store
- List term sets
- Query items by managed metadata tags
- Build taxonomy reports

---

## Dependencies Update

### package.json Changes

**Add**:
```json
{
  "dependencies": {
    "@microsoft/microsoft-graph-client": "^3.0.7"
  }
}
```

**Update Description**:
```json
{
  "description": "MCP server providing intelligent access to Microsoft PowerPlatform, Azure DevOps, Figma, Application Insights, Log Analytics, Azure SQL Database, Azure Service Bus, GitHub Enterprise, and SharePoint Online through an MCP-compatible interface."
}
```

**Update Tool Count**:
```json
{
  "keywords": [
    "mcp",
    "powerplatform",
    "dynamics365",
    "azuredevops",
    "figma",
    "application-insights",
    "log-analytics",
    "azure-sql",
    "service-bus",
    "github-enterprise",
    "sharepoint-online",
    "150-tools"
  ]
}
```

---

## Open Questions / Decisions Needed

### Question 1: Site Discovery vs. Configuration

**Options**:
1. **Manual Configuration Only** (Recommended for v11.0)
   - Users explicitly configure sites in JSON
   - Simpler, more secure
   - Prevents accidental access to sensitive sites

2. **Auto-Discovery**
   - Service discovers all accessible sites
   - Convenient but potentially overwhelming
   - Security concern: too much access

**Decision**: Manual configuration only for v11.0. Auto-discovery in future version if requested.

### Question 2: Document Content Extraction

**Options**:
1. **Text Files Only** (Recommended for v11.0)
   - Support .txt, .md, .json, .xml, .csv
   - Return metadata for binary files (.docx, .pdf, .xlsx)
   - Simpler implementation
   - No dependency on binary parsers

2. **Full Binary Support**
   - Extract text from Word, PDF, Excel
   - Requires additional npm packages (mammoth, pdf-parse, xlsx)
   - Larger bundle size
   - More complex error handling

**Decision**: Text files only for v11.0. Binary extraction in v12.0 if needed.

### Question 3: Permission Model

**Options**:
1. **Application Permissions** (Recommended)
   - `Sites.Read.All` - Access all sites
   - Simpler configuration
   - No user context needed

2. **Delegated Permissions**
   - User-specific access
   - Respects SharePoint permissions
   - Requires user sign-in flow (complex for MCP server)

**Decision**: Application permissions for v11.0. Service principal has read-only access to configured sites.

### Question 4: List Item Limits

**Options**:
1. **Conservative Limit** (Recommended)
   - Default: 100 items
   - Max: 5000 items
   - Prevents large responses

2. **No Limit**
   - Allow unlimited pagination
   - Risk of timeout/memory issues

**Decision**: Default 100, max 5000 for v11.0. Users can increase if needed.

---

## Risk Assessment

### High Risks

**Risk 1: Graph API Rate Limiting**
- **Impact**: Service becomes unusable during heavy usage
- **Mitigation**:
  - Implement caching (10-minute TTL)
  - Add exponential backoff
  - Monitor rate limit headers
  - Document rate limits in SETUP.md

**Risk 2: Large Document Content**
- **Impact**: Memory issues, slow responses
- **Mitigation**:
  - Limit to text files only (v11.0)
  - Max 10MB file size for content download
  - Stream content instead of loading in memory
  - Return metadata only for large files

**Risk 3: Permission Configuration Errors**
- **Impact**: Users can't access SharePoint, unclear error messages
- **Mitigation**:
  - Clear error messages with remediation steps
  - `sharepoint-test-connection` tool validates permissions
  - Comprehensive SETUP.md with screenshots
  - Example Azure AD app registration script

### Medium Risks

**Risk 4: Complex OData Filter Syntax**
- **Impact**: Users struggle to query lists effectively
- **Mitigation**:
  - Provide filter examples in TOOLS.md
  - Validate filter syntax before sending to Graph API
  - Clear error messages with corrected syntax
  - `sharepoint-list-report` prompt shows sample filters

**Risk 5: Multi-Tenant Support**
- **Impact**: Service doesn't work across multiple Microsoft 365 tenants
- **Mitigation**:
  - Not a concern for v11.0 (single tenant per configuration)
  - Document multi-tenant limitation in SETUP.md
  - Consider for v12.0 if requested

### Low Risks

**Risk 6: SharePoint Site Redesigns**
- **Impact**: Microsoft changes Graph API or SharePoint structure
- **Mitigation**:
  - Use stable Graph API v1.0 (not beta)
  - Monitor Microsoft Graph changelog
  - Version pinning for @microsoft/microsoft-graph-client

---

## Success Criteria

### Functional Criteria

- [ ] All 12 tools implemented and tested
- [ ] All 5 prompts implemented and tested
- [ ] Authentication works with Entra ID (service principal)
- [ ] Site structure can be explored (lists, libraries)
- [ ] List items can be queried with OData filters
- [ ] Documents can be searched and retrieved
- [ ] Text file content can be extracted
- [ ] Version history can be accessed
- [ ] Caching reduces API calls by >70%
- [ ] Error messages are clear and actionable

### Documentation Criteria

- [ ] README.md updated with SharePoint overview
- [ ] SETUP.md has complete setup guide with screenshots
- [ ] TOOLS.md documents all 12 tools with examples
- [ ] USAGE.md has 5+ real-world workflows
- [ ] CLAUDE.md has SharePoint architecture section
- [ ] All 5 documentation files updated

### Performance Criteria

- [ ] Site structure retrieval: <2 seconds
- [ ] List query (100 items): <3 seconds
- [ ] Document search (100 results): <5 seconds
- [ ] Content extraction (1MB file): <2 seconds
- [ ] Cache hit rate: >70% for metadata queries

### Security Criteria

- [ ] No write operations possible
- [ ] Credentials never logged
- [ ] Tokens expire and refresh automatically
- [ ] Error messages don't expose secrets
- [ ] Audit logging covers all operations
- [ ] Permission validation on startup

---

## Timeline

**Total Duration**: 3 weeks (15 working days)

| Week | Phase | Deliverables |
|------|-------|--------------|
| Week 1 (Days 1-5) | Phase 1 & 2 | Authentication, site tools, list tools |
| Week 2 (Days 6-10) | Phase 3 | Document tools, formatters, prompts |
| Week 3 (Days 11-15) | Phase 4 & 5 | Documentation, testing, polish |

**Target Release Date**: End of Week 3

**Release Version**: 11.0.0

---

## Conclusion

This SharePoint Online integration will provide comprehensive read-only access to SharePoint sites, lists, and documents through the Microsoft Graph API. The implementation follows established patterns from existing integrations (GitHub Enterprise, Azure DevOps) and prioritizes security, performance, and developer experience.

Key design decisions:
- **Manual site configuration** (no auto-discovery)
- **Text files only** for content extraction (binary support in v12.0)
- **Application permissions** (service principal access)
- **Conservative limits** (100 default, 5000 max for list queries)

The integration will enable powerful cross-service workflows connecting SharePoint knowledge with PowerPlatform solutions, Azure DevOps work items, GitHub code, and application telemetry.

**Next Steps**:
1. Review and approve this implementation plan
2. Set up Azure AD app registration with Graph API permissions
3. Begin Phase 1 implementation
4. Schedule weekly progress check-ins
