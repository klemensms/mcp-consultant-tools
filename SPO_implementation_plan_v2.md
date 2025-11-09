# SharePoint Online Integration - Implementation Plan v2.0 (REVISED)

**Previous Version**: v1.0 (Initial draft)
**Current Version**: v2.0 (Post-critical review)
**Status**: 📋 Ready for Implementation
**Target Release**: 11.0

**Changes from v1.0**:
- ✅ Added site ID resolution strategy (Critical Issue #1)
- ✅ Clarified Graph Search API usage (Critical Issue #2)
- ✅ Added complex field type handling (Critical Issue #3)
- ✅ Removed audit log use case (Critical Issue #4)
- ✅ Included binary document support in v11.0 (Critical Issue #5)
- ✅ Added full pagination implementation
- ✅ Defined version history limits
- ✅ Simplified cross-service correlation
- ✅ Extended timeline to 4 weeks (realistic)

---

## Overview

Add read-only SharePoint Online (SPO) site, list, library, and document inspection capabilities to the MCP server. This integration enables AI assistants to access organizational knowledge stored in SharePoint, search documents (including Word/PDF/Excel), inspect list data, analyze site structures, and correlate SharePoint content with PowerPlatform solutions and Azure DevOps work items.

**Key Features**:
- 🔍 Document search across sites and libraries
- 📄 Binary document content extraction (Word, PDF, Excel)
- 📊 List data querying with complex field type support
- 🌐 Site structure exploration
- 🔗 Cross-service correlation with PowerPlatform and Azure DevOps

**Target Release**: 11.0
**Timeline**: 4 weeks
**Similar Implementations**: GitHub Enterprise (9.0), Azure DevOps (7.0), Service Bus (10.0)

---

## Use Cases (REVISED)

### Primary Use Cases

1. **Document Search and Retrieval**
   - Search documents across sites and libraries using Microsoft Graph Search API
   - Retrieve document content from Word (.docx), PDF (.pdf), Excel (.xlsx), and text files
   - Access document metadata and properties
   - View version history (last 10 versions by default)

2. **List Data Inspection**
   - Query SharePoint lists with OData filtering
   - Handle complex column types (Lookup, Person/Group, Managed Metadata)
   - Filter and sort list items
   - Access custom columns and calculated fields
   - Inspect list schema and relationships

3. **Site Structure Analysis**
   - Explore site hierarchy (no subsites in v11.0 - Graph API limitation)
   - List available libraries and lists
   - Inspect content types and site columns
   - Review site metadata and settings

4. **Cross-Service Knowledge Correlation**
   - Link SharePoint documentation to PowerPlatform entities via pattern matching
   - Connect SharePoint list items to Azure DevOps work items via "AB#" references
   - Trace requirements from SharePoint to implementation
   - Find related knowledge articles for troubleshooting

### Example Workflows

**Workflow 1**: Finding Requirements Documentation

1. PowerPlatform → Get entity "sic_project"
2. SharePoint → Search for documents containing project ID in content or metadata
3. Get document content → Extract requirements from Word/PDF
4. Generate report → Requirements summary with source documents

**Workflow 2**: Troubleshooting with Knowledge Base

1. Application Insights → Find exception "NullReferenceException in ContactPlugin"
2. SharePoint → Search KB articles for "contact" and "null reference"
3. Get article content → Review troubleshooting steps (extracted from Word/PDF)
4. Generate guide → Contextualized troubleshooting with KB links

**Workflow 3**: Work Item Documentation Lookup

1. Azure DevOps → Get work item #1234
2. SharePoint → Search for "AB#1234" in document content
3. Find related specs → Extract content from requirements.docx
4. Generate report → Work item with full requirements context

**REMOVED**: Audit trail investigation (Graph API limitation)

---

## Architecture (REVISED)

### Service Class: `SharePointService`

**File**: `src/SharePointService.ts`

**Key Components**:
```typescript
export class SharePointService {
  // Microsoft Graph client
  private graphClient: Client | null = null;

  // MSAL authentication
  private msalClient: ConfidentialClientApplication | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  // Site ID resolution cache
  private siteIdCache: Map<string, { siteId: string; expires: number }> = new Map();

  // Metadata cache
  private cache: Map<string, { data: any; expires: number }> = new Map();

  // Configuration
  private config: SharePointConfig;

  // === CORE METHODS ===

  // Site ID Resolution (NEW - addresses Critical Issue #1)
  async resolveSiteId(resourceId: string): Promise<string>

  // Connection & Site Info
  async testConnection(resourceId: string): Promise<ConnectionTestResult>
  async getSiteInfo(resourceId: string): Promise<SiteInfo>

  // Lists & Libraries
  async listLists(resourceId: string): Promise<ListInfo[]>
  async listLibraries(resourceId: string): Promise<LibraryInfo[]>
  async getListSchema(resourceId: string, listId: string): Promise<ListSchema>
  async getListItems(
    resourceId: string,
    listId: string,
    options: ListQueryOptions
  ): Promise<ListItemsResponse>  // Includes pagination

  // Documents
  async searchDocuments(
    resourceId: string,
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]>  // Uses Graph Search API

  async getDocument(
    resourceId: string,
    driveId: string,
    itemId: string
  ): Promise<DocumentInfo>

  async getDocumentContent(
    resourceId: string,
    driveId: string,
    itemId: string
  ): Promise<DocumentContent>  // Supports Word/PDF/Excel

  async getDocumentVersions(
    resourceId: string,
    driveId: string,
    itemId: string,
    maxVersions?: number
  ): Promise<VersionInfo[]>  // Default 10, max 50

  // Site Structure
  async getSiteStructure(resourceId: string): Promise<SiteStructure>

  // === HELPER METHODS ===

  // Field value resolution (NEW - addresses Critical Issue #3)
  private async resolveFieldValue(
    field: any,
    fieldType: string,
    fieldName: string,
    siteId: string
  ): Promise<any>

  // Binary content extraction (NEW - addresses Critical Issue #5)
  private async extractDocumentContent(
    buffer: Buffer,
    extension: string,
    metadata: DocumentInfo
  ): Promise<DocumentContent>

  // Graph client initialization
  private async getGraphClient(): Promise<Client>

  // Caching
  private getCacheKey(...parts: string[]): string
  private getCached<T>(key: string): T | null
  private setCached(key: string, data: any, ttl?: number): void
  clearCache(pattern?: string, resourceId?: string): number

  // Cleanup
  async close(): Promise<void>
}
```

### Site ID Resolution Strategy (NEW)

**Problem**: Users provide site URLs, but Graph API needs site IDs.

**Solution**:
```typescript
async resolveSiteId(resourceId: string): Promise<string> {
  const resource = this.getResourceById(resourceId);

  // Check cache first (TTL: 24 hours)
  const cacheKey = `siteId:${resource.siteUrl}`;
  const cached = this.getCached<string>(cacheKey);
  if (cached) return cached;

  // Parse site URL: https://contoso.sharepoint.com/sites/intranet
  const url = new URL(resource.siteUrl);
  const hostname = url.hostname; // contoso.sharepoint.com
  const sitePath = url.pathname;  // /sites/intranet

  // Convert to Graph API path format
  const graphPath = `${hostname}:${sitePath}:`;

  // Call Graph API to resolve site ID
  const graphClient = await this.getGraphClient();
  const site = await graphClient.api(`/sites/${graphPath}`).get();

  // Cache the site ID (expires in 24 hours)
  const siteId = site.id; // Returns: contoso.sharepoint.com,abc-123,def-456
  this.setCached(cacheKey, siteId, 24 * 60 * 60);

  return siteId;
}
```

**Usage**:
```typescript
// In every tool, resolve site ID first
const siteId = await this.resolveSiteId(resourceId);
const lists = await this.graphClient.api(`/sites/${siteId}/lists`).get();
```

### Complex Field Type Handling (NEW)

**Problem**: SharePoint columns like Lookup, Person/Group, Managed Metadata return complex objects.

**Solution**:
```typescript
private async resolveFieldValue(
  field: any,
  fieldType: string,
  fieldName: string,
  siteId: string
): Promise<any> {
  // Null/undefined → return as-is
  if (field === null || field === undefined) {
    return field;
  }

  switch (fieldType) {
    case 'Lookup':
    case 'LookupMulti':
      // field = { LookupId: 5, LookupValue: "John Doe" }
      // Return the display value
      return field.LookupValue || field.LookupId;

    case 'User':
    case 'UserMulti':
      // field = { Email: "john@contoso.com", LookupValue: "John Doe" }
      // Return email if available, otherwise name
      return field.Email || field.LookupValue;

    case 'TaxonomyFieldType':
    case 'TaxonomyFieldTypeMulti':
      // field = { Label: "Engineering", TermGuid: "abc-123", WssId: 1 }
      // Return the human-readable label
      return field.Label;

    case 'URL':
      // field = { Url: "https://...", Description: "Click here" }
      // Return the URL string
      return field.Url;

    case 'Calculated':
      // Return calculated result (read-only)
      return field;

    case 'Note':
      // Multi-line text (may contain HTML)
      // Strip HTML tags for plain text
      if (typeof field === 'string' && field.includes('<')) {
        return field.replace(/<[^>]*>/g, '');
      }
      return field;

    default:
      // Simple types: Text, Number, DateTime, Boolean, Choice
      return field;
  }
}

// Usage in getListItems:
async getListItems(resourceId, listId, options) {
  const siteId = await this.resolveSiteId(resourceId);

  // Get list schema to know field types
  const schema = await this.getListSchema(resourceId, listId);
  const fieldTypes = new Map(
    schema.fields.map(f => [f.name, f.typeAsString])
  );

  // Query items
  const response = await this.graphClient
    .api(`/sites/${siteId}/lists/${listId}/items`)
    .expand('fields')
    .get();

  // Resolve complex field values
  const items = await Promise.all(
    response.value.map(async (item) => {
      const resolvedFields: any = {};

      for (const [fieldName, fieldValue] of Object.entries(item.fields)) {
        const fieldType = fieldTypes.get(fieldName) || 'Text';
        resolvedFields[fieldName] = await this.resolveFieldValue(
          fieldValue,
          fieldType,
          fieldName,
          siteId
        );
      }

      return {
        id: item.id,
        ...resolvedFields
      };
    })
  );

  return { items, hasMore: false };
}
```

### Binary Document Support (NEW)

**Dependencies**:
```json
{
  "mammoth": "^1.6.0",    // Word → text extraction
  "pdf-parse": "^1.1.1",  // PDF → text extraction
  "xlsx": "^0.18.5"       // Excel → text extraction
}
```

**Implementation**:
```typescript
private async extractDocumentContent(
  buffer: Buffer,
  extension: string,
  metadata: DocumentInfo
): Promise<DocumentContent> {
  // File size check (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (buffer.length > maxSize) {
    return {
      content: null,
      format: 'binary',
      error: `File too large (${(buffer.length / 1024 / 1024).toFixed(2)}MB) - max 10MB`,
      metadata
    };
  }

  switch (extension.toLowerCase()) {
    // Text files
    case 'txt':
    case 'md':
    case 'json':
    case 'xml':
    case 'csv':
    case 'html':
    case 'htm':
      return {
        content: buffer.toString('utf-8'),
        format: 'text',
        metadata
      };

    // Microsoft Word
    case 'docx':
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return {
          content: result.value,
          format: 'text',
          extractedFrom: 'docx',
          metadata
        };
      } catch (error: any) {
        return {
          content: null,
          format: 'binary',
          error: `Word extraction failed: ${error.message}`,
          metadata
        };
      }

    // PDF
    case 'pdf':
      try {
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(buffer);
        return {
          content: pdfData.text,
          format: 'text',
          extractedFrom: 'pdf',
          pageCount: pdfData.numpages,
          metadata
        };
      } catch (error: any) {
        return {
          content: null,
          format: 'binary',
          error: `PDF extraction failed: ${error.message}`,
          metadata
        };
      }

    // Excel
    case 'xlsx':
    case 'xls':
      try {
        const XLSX = require('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        // Extract all sheets as text
        const sheets = workbook.SheetNames.map(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          return `=== Sheet: ${sheetName} ===\n${csv}`;
        });

        return {
          content: sheets.join('\n\n'),
          format: 'text',
          extractedFrom: 'xlsx',
          sheetCount: workbook.SheetNames.length,
          metadata
        };
      } catch (error: any) {
        return {
          content: null,
          format: 'binary',
          error: `Excel extraction failed: ${error.message}`,
          metadata
        };
      }

    // Unsupported binary formats
    default:
      return {
        content: null,
        format: 'binary',
        error: `Unsupported file type: ${extension}`,
        metadata
      };
  }
}
```

### Search Implementation (REVISED)

**Uses Microsoft Graph Search API** (not SharePoint REST API):

```typescript
async searchDocuments(
  resourceId: string,
  query: string,
  options?: {
    libraryId?: string;
    fileType?: string;
    top?: number;
  }
): Promise<SearchResult[]> {
  const siteId = await this.resolveSiteId(resourceId);
  const graphClient = await this.getGraphClient();

  // Build Graph Search API request
  const searchRequest = {
    requests: [
      {
        entityTypes: ['driveItem'],
        query: {
          queryString: query
        },
        from: 0,
        size: Math.min(options?.top || 100, 500),
        // Filter by site
        filters: {
          siteId: siteId
        }
      }
    ]
  };

  // Add file type filter if specified
  if (options?.fileType) {
    searchRequest.requests[0].query.queryString += ` fileExtension:${options.fileType}`;
  }

  // Execute search
  const response = await graphClient
    .api('/search/query')
    .post(searchRequest);

  // Parse results
  const hits = response.value[0]?.hitsContainers[0]?.hits || [];

  return hits.map((hit: any) => ({
    hitId: hit.hitId,
    rank: hit.rank,
    summary: hit.summary,
    resource: {
      id: hit.resource.id,
      name: hit.resource.name,
      webUrl: hit.resource.webUrl,
      size: hit.resource.size,
      lastModifiedDateTime: hit.resource.lastModifiedDateTime,
      lastModifiedBy: hit.resource.lastModifiedBy?.user?.displayName,
      fileExtension: hit.resource.name.split('.').pop()
    }
  }));
}
```

**Limitations** (documented in TOOLS.md):
- Graph Search API doesn't support full KQL syntax
- Simple keyword search only (no complex operators like `AND`, `OR`, `NEAR`)
- File property filters limited to: `fileExtension`, `author`, `lastModifiedTime`
- For advanced search, users can use SharePoint web UI

### Full Pagination Implementation (NEW)

```typescript
interface ListQueryOptions {
  filter?: string;
  select?: string[];
  orderBy?: string;
  top?: number;
  pageSize?: number;
}

interface ListItemsResponse {
  items: any[];
  hasMore: boolean;
  nextLink?: string;
  totalCount?: number;
}

async getListItems(
  resourceId: string,
  listId: string,
  options: ListQueryOptions = {}
): Promise<ListItemsResponse> {
  const siteId = await this.resolveSiteId(resourceId);
  const graphClient = await this.getGraphClient();

  // Get list schema for field type resolution
  const schema = await this.getListSchema(resourceId, listId);
  const fieldTypes = new Map(schema.fields.map(f => [f.name, f.typeAsString]));

  // Pagination settings
  const pageSize = options.pageSize || 100;
  const maxItems = Math.min(options.top || 5000, 5000); // Hard limit: 5000

  let items: any[] = [];
  let nextLink: string | undefined = undefined;

  // Build initial query
  let queryUrl = `/sites/${siteId}/lists/${listId}/items?$expand=fields`;

  if (options.select && options.select.length > 0) {
    queryUrl += `&$select=id,${options.select.join(',')}`;
  }

  if (options.filter) {
    queryUrl += `&$filter=${encodeURIComponent(options.filter)}`;
  }

  if (options.orderBy) {
    queryUrl += `&$orderby=${encodeURIComponent(options.orderBy)}`;
  }

  queryUrl += `&$top=${pageSize}`;

  // Fetch pages until limit reached or no more data
  let currentUrl = queryUrl;

  while (items.length < maxItems) {
    const response = await graphClient.api(currentUrl).get();

    // Resolve field values
    const resolvedItems = await Promise.all(
      response.value.map(async (item: any) => {
        const resolved: any = { id: item.id };

        for (const [fieldName, fieldValue] of Object.entries(item.fields || {})) {
          const fieldType = fieldTypes.get(fieldName) || 'Text';
          resolved[fieldName] = await this.resolveFieldValue(
            fieldValue,
            fieldType,
            fieldName,
            siteId
          );
        }

        return resolved;
      })
    );

    items = items.concat(resolvedItems);

    // Check for more pages
    if (response['@odata.nextLink'] && items.length < maxItems) {
      currentUrl = response['@odata.nextLink'];
    } else {
      nextLink = response['@odata.nextLink'];
      break;
    }
  }

  return {
    items: items.slice(0, maxItems),
    hasMore: !!nextLink,
    nextLink,
    totalCount: items.length
  };
}
```

---

## Implementation Phases (REVISED - 4 Weeks)

### Phase 1: Core Service (Week 1, Days 1-5)

**Tasks**:
1. Create `src/SharePointService.ts` skeleton
2. Implement MSAL authentication with token caching
3. Implement `resolveSiteId()` helper
4. Add configuration parsing (multi-site JSON + single fallback)
5. Implement `testConnection()` and `getSiteInfo()`
6. Add audit logging infrastructure
7. Write unit tests for authentication and site resolution

**Deliverables**:
- ✅ Working Graph API authentication
- ✅ Site ID resolution from URLs
- ✅ `sharepoint-test-connection` tool
- ✅ `sharepoint-list-sites` tool
- ✅ Unit tests passing

---

### Phase 2: Lists & Complex Fields (Week 2, Days 6-10)

**Tasks**:
1. Implement `listLists()`, `listLibraries()`, `getListSchema()`
2. Implement `getListItems()` with complex field type resolution
3. Add pagination support
4. Implement caching for schemas (TTL: 1 hour)
5. Create tools:
   - `sharepoint-list-lists`
   - `sharepoint-list-libraries`
   - `sharepoint-get-list-schema`
   - `sharepoint-get-list-items`
6. Create formatters in `src/utils/sharepoint-formatters.ts`
7. Write integration tests with real SharePoint data

**Deliverables**:
- ✅ List querying with OData filters
- ✅ Complex field type handling (Lookup, Person, Metadata)
- ✅ `sharepoint-site-overview` prompt
- ✅ `sharepoint-list-report` prompt
- ✅ Integration tests

---

### Phase 3: Documents & Search (Week 3, Days 11-15)

**Tasks**:
1. Implement `searchDocuments()` using Graph Search API
2. Implement `getDocument()`, `getDocumentContent()`, `getDocumentVersions()`
3. Add binary document extraction (Word/PDF/Excel)
4. Install dependencies: `mammoth`, `pdf-parse`, `xlsx`
5. Create tools:
   - `sharepoint-search-documents`
   - `sharepoint-get-document`
   - `sharepoint-get-document-content`
   - `sharepoint-get-document-versions`
6. Create prompts:
   - `sharepoint-search-report`
   - `sharepoint-document-details`
7. Add formatters for document results
8. Write integration tests for document operations

**Deliverables**:
- ✅ Document search working
- ✅ Binary content extraction (Word/PDF/Excel)
- ✅ Version history access
- ✅ All 12 tools implemented
- ✅ All 5 prompts implemented

---

### Phase 4: Documentation & Testing (Week 4, Days 16-20)

**Tasks**:
1. Update **README.md**:
   - Add SharePoint to overview
   - Update tool count: 138 → 150 tools
   - Add SharePoint configuration example
2. Update **SETUP.md**:
   - Azure AD app registration (with screenshots)
   - Graph API permissions (Sites.Read.All, Files.Read.All)
   - Troubleshooting section
3. Update **TOOLS.md**:
   - Document all 12 tools
   - Document all 5 prompts
   - Update tool/prompt counts
4. Update **USAGE.md**:
   - 5+ real-world examples
   - Cross-service workflows
5. Update **CLAUDE.md**:
   - SharePoint architecture section
   - Graph API integration details
   - Security considerations
6. Create example scripts in `examples/`
7. Write comprehensive test suite:
   - Unit tests (>80% coverage)
   - Integration tests
   - Load tests (10,000 item lists, 100 concurrent requests)
8. Security review and audit log verification

**Deliverables**:
- ✅ All 5 documentation files updated
- ✅ Test coverage >80%
- ✅ Security review complete
- ✅ Example scripts working
- ✅ Load testing complete

---

## Tools (12 total) - UNCHANGED

[Same as v1.0]

---

## Prompts (5 total) - REVISED

### 1. `sharepoint-site-overview`
   - Shows lists, libraries, recent documents
   - **No subsites** (Graph API limitation)

### 2. `sharepoint-list-report`
   - Shows list schema with field types
   - Includes sample items with **resolved complex fields**

### 3. `sharepoint-search-report`
   - Formatted search results
   - Notes Graph Search API limitations

### 4. `sharepoint-document-details`
   - Document metadata
   - Version history (last 10 versions)
   - **Content preview** for Word/PDF/Excel

### 5. `sharepoint-correlation-report` (SIMPLIFIED)
   - Pattern-based correlation only:
     - PowerPlatform: Match GUIDs in content
     - Azure DevOps: Match "AB#1234" references
   - **No deep integration** in v11.0

---

## Security Considerations - UNCHANGED

[Same as v1.0 - already comprehensive]

---

## Revised Timeline

| Week | Days | Phase | Deliverables |
|------|------|-------|--------------|
| Week 1 | 1-5 | Core Service | Auth, site resolution, connection test |
| Week 2 | 6-10 | Lists & Fields | List queries, complex field handling, pagination |
| Week 3 | 11-15 | Documents & Search | Search, content extraction, binary support |
| Week 4 | 16-20 | Docs & Testing | Documentation (5 files), tests, security review |

**Total Duration**: 20 working days (4 weeks)

---

## Success Criteria - REVISED

### Functional Criteria

- [ ] All 12 tools implemented and tested
- [ ] All 5 prompts implemented and tested
- [ ] Site ID resolution works for all configured sites
- [ ] Complex field types (Lookup, Person, Metadata) handled correctly
- [ ] Binary documents (Word/PDF/Excel) can be searched and content extracted
- [ ] Graph Search API returns relevant results
- [ ] Pagination works for lists with >1000 items
- [ ] Version history accessible (default 10, max 50)
- [ ] Error messages are clear and actionable
- [ ] Cross-service correlation working (pattern matching)

### Performance Criteria

- [ ] Site ID resolution: <1 second (with caching)
- [ ] List query (100 items): <3 seconds
- [ ] List query (5000 items): <30 seconds
- [ ] Document search (100 results): <5 seconds
- [ ] Binary content extraction (1MB Word doc): <3 seconds
- [ ] Binary content extraction (5MB PDF): <10 seconds
- [ ] Cache hit rate for site IDs: >95%
- [ ] Cache hit rate for list schemas: >70%

### Documentation Criteria

- [ ] README.md: SharePoint overview, tool count updated
- [ ] SETUP.md: Azure AD app registration with screenshots
- [ ] TOOLS.md: All 12 tools documented with examples
- [ ] USAGE.md: 5+ real-world workflows
- [ ] CLAUDE.md: Architecture, security, Graph API details

---

## Decisions Made (Post-Review)

### ✅ Site ID Resolution
**Decision**: Implement `resolveSiteId()` helper with 24-hour cache
**Rationale**: Graph API requires site IDs, users know site URLs

### ✅ Search API
**Decision**: Use Microsoft Graph Search API (`POST /search/query`)
**Rationale**: Simpler, consistent with other Graph API calls
**Trade-off**: Limited KQL support (acceptable for v11.0)

### ✅ Complex Field Types
**Decision**: Implement field type resolver for Lookup/Person/Metadata
**Rationale**: Essential for real-world SharePoint lists
**Implementation**: Async resolver, caches field types from schema

### ❌ Audit Logs
**Decision**: Remove audit log use case
**Rationale**: Not supported by Graph API, requires separate Office 365 Management API
**Future**: Consider in v12.0 if requested

### ✅ Binary Documents
**Decision**: Include Word/PDF/Excel support in v11.0
**Rationale**: 90% of SharePoint documents are binary formats
**Dependencies**: mammoth, pdf-parse, xlsx (~4MB total)

### ✅ Version History
**Decision**: Default 10 versions, max 50 versions
**Rationale**: Balance between usefulness and API load

### ✅ Pagination
**Decision**: Full pagination support with hard limit of 5000 items
**Rationale**: Large lists common in SharePoint

### ✅ Cross-Service Correlation
**Decision**: Basic pattern matching only (v11.0)
**Rationale**: Deep integration complex, defer to v12.0

---

## Open Questions - RESOLVED

All questions from v1.0 have been answered:

1. ✅ **Site Discovery**: Manual configuration only
2. ✅ **Document Content**: Binary support included
3. ✅ **Permission Model**: Application permissions (Sites.Read.All)
4. ✅ **List Item Limits**: Default 100, max 5000

---

## Conclusion

This revised plan addresses all critical issues identified in the review and is **ready for implementation**. Key improvements:

1. ✅ Site ID resolution strategy defined
2. ✅ Graph Search API implementation clarified
3. ✅ Complex field type handling added
4. ✅ Audit log use case removed (not supported)
5. ✅ Binary document support included (mammoth/pdf-parse/xlsx)
6. ✅ Full pagination implementation shown
7. ✅ Version history limits defined
8. ✅ Timeline extended to realistic 4 weeks

**Estimated Effort**: 20 working days (4 weeks)
**Target Release**: 11.0.0
**Risk Level**: Low (all critical issues addressed)

**Next Step**: Begin Phase 1 implementation (Core Service)
