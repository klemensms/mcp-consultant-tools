# Tool and Prompt Reference

Complete reference for all tools and prompts provided by the MCP Consultant Tools.

## Table of Contents

- [PowerPlatform Tools](#powerplatform-tools)
- [Azure DevOps Tools](#azure-devops-tools)
- [Figma Tools](#figma-tools)
- [MCP Prompts](#mcp-prompts)

## PowerPlatform Tools

### Entity Metadata & Data Tools

#### get-entity-metadata

Get comprehensive metadata about a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity (e.g., "account", "contact")

**Returns:**
- Entity definition including primary key, display name, description
- Collection status (online/offline)
- Primary identifier and name attributes
- Ownership type

**Example:**
```javascript
await mcpClient.invoke("get-entity-metadata", {
  entityName: "account"
});
```

---

#### get-entity-attributes

Get all attributes/fields of a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Array of all attributes with:
  - Logical name
  - Display name
  - Data type
  - Required/optional status
  - Format information
  - Valid values for option sets

**Example:**
```javascript
await mcpClient.invoke("get-entity-attributes", {
  entityName: "account"
});
```

---

#### get-entity-attribute

Get details for a specific attribute/field of a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `attributeName` (string, required): Logical name of the attribute

**Returns:**
- Detailed attribute information:
  - Data type and format
  - Min/max values or lengths
  - Option set values (if applicable)
  - Lookup target entities
  - Searchability and requirement status

**Example:**
```javascript
await mcpClient.invoke("get-entity-attribute", {
  entityName: "account",
  attributeName: "revenue"
});
```

---

#### get-entity-relationships

Get all relationships for a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- One-to-Many relationships
- Many-to-Many relationships
- Relationship schema names
- Referenced/referencing entity names
- Lookup attribute names

**Example:**
```javascript
await mcpClient.invoke("get-entity-relationships", {
  entityName: "account"
});
```

---

#### get-global-option-set

Get a global option set definition.

**Parameters:**
- `optionSetName` (string, required): Name of the global option set

**Returns:**
- Option set name
- Display name
- All options with values and labels

**Example:**
```javascript
await mcpClient.invoke("get-global-option-set", {
  optionSetName: "industrycode"
});
```

---

#### get-record

Get a specific record by entity name and ID.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `recordId` (string, required): GUID of the record
- `selectAttributes` (string, optional): Comma-separated list of attributes to retrieve

**Returns:**
- Record data with all or selected attributes

**Example:**
```javascript
await mcpClient.invoke("get-record", {
  entityName: "account",
  recordId: "00000000-0000-0000-0000-000000000000",
  selectAttributes: "name,revenue,industrycode"
});
```

---

#### query-records

Query records using OData filter expression.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `filter` (string, optional): OData $filter expression
- `select` (string, optional): Comma-separated list of attributes
- `orderby` (string, optional): Ordering expression
- `top` (number, optional): Maximum number of records to return

**Returns:**
- Array of matching records
- Total count

**Example:**
```javascript
await mcpClient.invoke("query-records", {
  entityName: "account",
  filter: "revenue gt 1000000 and statecode eq 0",
  select: "name,revenue,industrycode",
  orderby: "revenue desc",
  top: 50
});
```

---

### Plugin Registration & Validation Tools

#### get-plugin-assemblies

List all plugin assemblies in the environment.

**Parameters:**
- `includeManaged` (boolean, optional, default: false): Include managed plugin assemblies

**Returns:**
- Total count
- Array of assemblies with:
  - Assembly name
  - Version
  - Isolation mode (Sandbox/None)
  - Modified date and modifier
  - Culture and public key token

**Example:**
```javascript
await mcpClient.invoke("get-plugin-assemblies", {
  includeManaged: false
});
```

---

#### get-plugin-assembly-complete

Get comprehensive plugin assembly information with automatic validation.

**Parameters:**
- `assemblyName` (string, required): Name of the plugin assembly
- `includeDisabled` (boolean, optional, default: false): Include disabled steps

**Returns:**
- Assembly metadata
- All plugin types (classes)
- All registered steps with:
  - Stage, mode, rank
  - Filtering attributes
  - Pre/Post images with attributes
  - SDK message and entity
- **Automatic validation warnings:**
  - Missing filtering attributes
  - Missing images
  - Disabled steps

**Example:**
```javascript
await mcpClient.invoke("get-plugin-assembly-complete", {
  assemblyName: "MyCompany.Plugins",
  includeDisabled: false
});
```

---

#### get-entity-plugin-pipeline

Get all plugins that execute on a specific entity, organized by message and execution order.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `messageFilter` (string, optional): Filter by SDK message (e.g., "Update", "Create", "Delete")

**Returns:**
- Plugins organized by:
  - SDK message type
  - Execution stage
  - Execution rank
- For each step:
  - Assembly name and version
  - Plugin type name
  - Mode (Sync/Async)
  - Filtering attributes
  - Pre/Post images

**Example:**
```javascript
await mcpClient.invoke("get-entity-plugin-pipeline", {
  entityName: "account",
  messageFilter: "Update"
});
```

---

#### get-plugin-trace-logs

Query plugin execution trace logs with filtering and exception parsing.

**Parameters:**
- `entityName` (string, optional): Filter by entity logical name
- `messageName` (string, optional): Filter by SDK message name
- `correlationId` (string, optional): Filter by correlation ID
- `exceptionOnly` (boolean, optional, default: false): Only return logs with exceptions
- `hoursBack` (number, optional, default: 24): How many hours back to search
- `maxRecords` (number, optional, default: 50): Maximum records to return

**Returns:**
- Array of trace logs with:
  - Execution timestamp
  - Entity and message names
  - Performance metrics
  - Parsed exception details:
    - Exception type
    - Message
    - Stack trace
  - Correlation ID

**Example:**
```javascript
await mcpClient.invoke("get-plugin-trace-logs", {
  entityName: "account",
  exceptionOnly: true,
  hoursBack: 24,
  maxRecords: 50
});
```

---

### Workflow & Power Automate Flow Tools

#### get-flows

List all Power Automate cloud flows (category = 5).

**Parameters:**
- `activeOnly` (boolean, optional, default: false): Only return activated flows

**Returns:**
- Array of flows with:
  - Flow name and ID
  - State (Draft/Activated/Suspended)
  - Owner and modifier
  - Primary entity
  - Trigger type
  - Modified date

**Example:**
```javascript
await mcpClient.invoke("get-flows", {
  activeOnly: true
});
```

---

#### get-flow-definition

Get complete flow definition including JSON logic from clientdata field.

**Parameters:**
- `flowName` (string, required): Name of the flow

**Returns:**
- Flow metadata:
  - Name, ID, state
  - Owner and modifier
  - Primary entity
- Complete flow definition (JSON):
  - Triggers
  - Actions
  - Conditions
  - Connections

**Example:**
```javascript
await mcpClient.invoke("get-flow-definition", {
  flowName: "Lead Notification Flow"
});
```

---

#### get-flow-runs

Get flow run history with status, duration, and error details.

**Parameters:**
- `flowName` (string, required): Name of the flow
- `maxRecords` (number, optional, default: 100): Maximum number of runs to return

**Returns:**
- Array of flow runs with:
  - Run ID and timestamp
  - Status (Succeeded/Failed/Running/TimedOut/Cancelled/Faulted)
  - Start time, end time, duration
  - Trigger type
  - Error message and code (if failed)
  - Parsed JSON error details

**Example:**
```javascript
await mcpClient.invoke("get-flow-runs", {
  flowName: "Lead Notification Flow",
  maxRecords: 50
});
```

---

#### get-workflows

List all classic Dynamics workflows (category = 0).

**Parameters:**
- `activeOnly` (boolean, optional, default: false): Only return activated workflows

**Returns:**
- Array of workflows with:
  - Workflow name and ID
  - State (Draft/Activated/Suspended)
  - Mode (Background/Real-time)
  - Trigger events (Create/Update/Delete)
  - Primary entity
  - Owner and modifier

**Example:**
```javascript
await mcpClient.invoke("get-workflows", {
  activeOnly: true
});
```

---

#### get-workflow-definition

Get complete workflow definition including XAML and trigger configuration.

**Parameters:**
- `workflowName` (string, required): Name of the workflow

**Returns:**
- Workflow metadata:
  - Name, ID, state
  - Mode (Background/Real-time)
  - Trigger events
  - Primary entity
- Complete XAML definition
- Trigger attributes
- Filtering attributes

**Example:**
```javascript
await mcpClient.invoke("get-workflow-definition", {
  workflowName: "Account Update Workflow"
});
```

---

## Azure DevOps Tools

### Wiki Tools

#### get-wikis

List all wikis in an Azure DevOps project.

**Parameters:**
- `project` (string, required): Project name

**Returns:**
- Array of wikis with:
  - Wiki ID and name
  - Wiki type (ProjectWiki/CodeWiki)
  - Repository details
  - Mapped path

**Example:**
```javascript
await mcpClient.invoke("get-wikis", {
  project: "MyProject"
});
```

---

#### search-wiki-pages

Full-text search across wiki pages with highlighting.

**Parameters:**
- `searchText` (string, required): Text to search for
- `project` (string, required): Project name
- `maxResults` (number, optional, default: 25): Maximum results to return

**Returns:**
- Total count
- Array of search results with:
  - Page path (wiki format, ready for get-wiki-page)
  - Git path (original format from API)
  - Wiki ID
  - Project name
  - Content highlights (matching snippets)

**Example:**
```javascript
await mcpClient.invoke("search-wiki-pages", {
  searchText: "authentication",
  project: "MyProject",
  maxResults: 10
});
```

**Note:** The returned `path` field is automatically converted to wiki format and can be used directly with `get-wiki-page`.

---

#### get-wiki-page

Get specific wiki page content and metadata.

**Parameters:**
- `project` (string, required): Project name
- `wikiId` (string, required): Wiki identifier
- `pagePath` (string, required): Page path (wiki format or git format - auto-converts)
- `includeContent` (boolean, optional, default: true): Include page content

**Returns:**
- Page metadata:
  - Path (wiki format)
  - Git path
  - Git item path
- Content (if requested)
- Sub-pages array

**Example:**
```javascript
await mcpClient.invoke("get-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Architecture/API Design",
  includeContent: true
});
```

**Note:** Automatically converts git paths (ending in `.md`) to wiki paths if needed.

---

#### create-wiki-page

Create a new wiki page.

**Parameters:**
- `project` (string, required): Project name
- `wikiId` (string, required): Wiki identifier
- `pagePath` (string, required): Path for the new page (wiki format)
- `content` (string, required): Markdown content for the page

**Returns:**
- Created page metadata

**Requires:** `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`

**Example:**
```javascript
await mcpClient.invoke("create-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Architecture/New Design",
  content: "# New Design\n\nThis is the content..."
});
```

---

#### update-wiki-page

Update an existing wiki page.

**Parameters:**
- `project` (string, required): Project name
- `wikiId` (string, required): Wiki identifier
- `pagePath` (string, required): Page path (wiki format)
- `content` (string, required): New markdown content
- `version` (string, required): Current page version (ETag) for optimistic concurrency

**Returns:**
- Updated page metadata

**Requires:** `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`

**Example:**
```javascript
await mcpClient.invoke("update-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Architecture/API Design",
  content: "# Updated content...",
  version: "current-page-version-etag"
});
```

---

### Work Item Tools

#### get-work-item

Get a work item by ID with full details.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID

**Returns:**
- Work item fields:
  - System fields (ID, Title, State, Type, etc.)
  - Custom fields
  - Area/Iteration paths
  - Assigned To, Created By
  - Dates (Created, Changed, Closed)
  - Tags
- Relations (links to other items)
- URL

**Example:**
```javascript
await mcpClient.invoke("get-work-item", {
  project: "MyProject",
  workItemId: 12345
});
```

---

#### query-work-items

Execute WIQL (Work Item Query Language) queries to find work items.

**Parameters:**
- `project` (string, required): Project name
- `wiql` (string, required): WIQL query

**Returns:**
- Array of work items matching the query
- Total count

**Example:**
```javascript
await mcpClient.invoke("query-work-items", {
  project: "MyProject",
  wiql: "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.State] = 'Active' AND [System.AssignedTo] = @me"
});
```

**Common WIQL patterns:** See [USAGE.md](USAGE.md#wiql-query-language)

---

#### get-work-item-comments

Get discussion comments for a work item.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID

**Returns:**
- Array of comments with:
  - Comment text
  - Author
  - Timestamp
  - Modified date
  - Version

**Example:**
```javascript
await mcpClient.invoke("get-work-item-comments", {
  project: "MyProject",
  workItemId: 12345
});
```

---

#### add-work-item-comment

Add a comment to a work item.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID
- `commentText` (string, required): Comment content

**Returns:**
- Created comment metadata

**Requires:** `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`

**Example:**
```javascript
await mcpClient.invoke("add-work-item-comment", {
  project: "MyProject",
  workItemId: 12345,
  commentText: "Investigation complete. Root cause identified."
});
```

---

#### update-work-item

Update work item fields using JSON Patch operations.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID
- `patchOperations` (array, required): Array of JSON Patch operations

**Returns:**
- Updated work item

**Requires:** `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`

**Example:**
```javascript
await mcpClient.invoke("update-work-item", {
  project: "MyProject",
  workItemId: 12345,
  patchOperations: [
    {
      "op": "add",
      "path": "/fields/System.State",
      "value": "Resolved"
    },
    {
      "op": "add",
      "path": "/fields/System.History",
      "value": "Fixed in PR #456"
    }
  ]
});
```

---

#### create-work-item

Create a new work item.

**Parameters:**
- `project` (string, required): Project name
- `workItemType` (string, required): Type (Bug, Task, User Story, etc.)
- `fields` (object, required): Field values (System.Title is required)

**Returns:**
- Created work item

**Requires:** `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`

**Example:**
```javascript
await mcpClient.invoke("create-work-item", {
  project: "MyProject",
  workItemType: "Bug",
  fields: {
    "System.Title": "Login page shows 404",
    "System.Description": "After deploying v2.3...",
    "System.AssignedTo": "john@company.com",
    "System.Tags": "critical; deployment"
  }
});
```

---

#### delete-work-item

Delete a work item.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID

**Returns:**
- Deletion confirmation

**Requires:** `AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true`

**Example:**
```javascript
await mcpClient.invoke("delete-work-item", {
  project: "MyProject",
  workItemId: 12345
});
```

---

## Figma Tools

#### get-figma-data

Get comprehensive Figma design data including layout, text, styles, and components.

**Parameters:**
- `fileKey` (string, required): Figma file key from URL (alphanumeric string)
- `nodeId` (string, optional): Specific node ID(s) to fetch (format: "1:10" or "1:10;2:20" for multiple)
- `depth` (number, optional): Tree traversal depth limit (prevents token overflow on large files)

**Returns:**
- File metadata (name, last modified)
- Simplified node tree with:
  - Layout properties (position, size, constraints)
  - Text content and typography
  - Visual styles (fills, strokes, effects)
  - Component instances and properties
- Component definitions
- Component sets
- Global style dictionary (deduplicated)

**Example:**
```javascript
// Get entire file
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  depth: 3
});

// Get specific nodes
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  nodeId: "1:10;2:20"
});
```

**Output format:** AI-friendly simplified JSON (not raw Figma API format)

---

#### download-figma-images

Placeholder for future image download functionality.

**Status:** Coming in v2

**Planned features:**
- Download node images as PNG/SVG
- Batch image downloads
- Image processing with Sharp

---

## MCP Prompts

Prompts return formatted, human-readable content with context. They use tools internally but add interpretation and formatting.

### PowerPlatform Entity Prompts

#### entity-overview

Comprehensive overview of a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Formatted markdown with:
  - Entity description and purpose
  - Key fields and their meanings
  - Relationship summary
  - Common usage patterns

---

#### attribute-details

Detailed information about a specific entity attribute.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `attributeName` (string, required): Logical name of the attribute

**Returns:**
- Formatted markdown with:
  - Attribute purpose and description
  - Data type with examples
  - Valid values or ranges
  - Usage notes and best practices

---

#### query-template

OData query template for an entity with example filters.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Formatted markdown with:
  - Basic query structure
  - Common filter patterns
  - Ordering and pagination examples
  - Field selection recommendations

---

#### relationship-map

Visual map of entity relationships.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Formatted markdown with:
  - One-to-Many relationships (parent → children)
  - Many-to-Many relationships
  - Related entity purposes
  - Relationship navigation examples

---

### PowerPlatform Plugin Prompts

#### plugin-deployment-report

Comprehensive deployment report for a plugin assembly with validation warnings.

**Parameters:**
- `assemblyName` (string, required): Name of the plugin assembly

**Returns:**
- Formatted markdown report with:
  - Assembly information (version, isolation, modified by)
  - All registered steps organized by entity and message
  - Validation results:
    - ✓ Checkmarks for valid configuration
    - ⚠ Warnings for potential issues
  - Detailed issue descriptions

**Use case:** PR reviews for plugin deployments

---

#### entity-plugin-pipeline-report

Visual execution pipeline showing all plugins for an entity in order.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `messageFilter` (string, optional): Filter by SDK message

**Returns:**
- Formatted markdown with:
  - Plugins grouped by message type
  - Execution order by stage and rank
  - Mode indicators (Sync/Async)
  - Filtering attributes
  - Image configuration
  - Assembly versions

**Use case:** Understanding plugin execution flow

---

### PowerPlatform Workflow & Flow Prompts

#### flows-report

Comprehensive report of all Power Automate flows grouped by state.

**Parameters:** None

**Returns:**
- Formatted markdown with:
  - Flows grouped by state (Activated/Draft/Suspended)
  - Flow names and owners
  - Primary entities
  - Trigger types
  - Last modified dates

---

#### workflows-report

Comprehensive report of all classic Dynamics workflows grouped by state.

**Parameters:** None

**Returns:**
- Formatted markdown with:
  - Workflows grouped by state
  - Execution modes (Background/Real-time)
  - Trigger events
  - Primary entities
  - Owners and modified dates

---

### Azure DevOps Prompts

#### wiki-search-results

Search Azure DevOps wiki pages with formatted results and content snippets.

**Parameters:**
- `searchText` (string, required): Search query
- `project` (string, required): Project name
- `maxResults` (number, optional, default: 25): Maximum results

**Returns:**
- Formatted markdown with:
  - Search summary
  - Results with paths and projects
  - Content highlights (matching snippets)
  - Navigation links

---

#### wiki-page-content

Get a formatted wiki page with navigation context and sub-pages.

**Parameters:**
- `project` (string, required): Project name
- `wikiId` (string, required): Wiki identifier
- `pagePath` (string, required): Page path

**Returns:**
- Formatted markdown with:
  - Page metadata (project, wiki, paths)
  - Sub-pages list
  - Full page content
  - Navigation context

---

#### work-item-summary

Comprehensive summary of a work item with details and comments.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID

**Returns:**
- Formatted markdown with:
  - Work item header (ID, title, type)
  - All field details
  - Description and repro steps
  - Comments thread
  - Related items

---

#### work-items-query-report

Execute a WIQL query and get results grouped by state/type.

**Parameters:**
- `project` (string, required): Project name
- `wiql` (string, required): WIQL query

**Returns:**
- Formatted markdown with:
  - Query summary
  - Results grouped by state
  - Work item details (ID, title, assigned to)
  - Counts by group
