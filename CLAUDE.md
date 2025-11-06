# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides intelligent access to Microsoft PowerPlatform/Dataverse entities, Azure DevOps wikis/work items, and Figma designs through an MCP-compatible interface. It enables AI assistants to explore entity metadata, query records, inspect plugin configurations, analyze workflows, search documentation, manage work items, and extract design data for context-aware assistance across the development lifecycle.

## Build and Development Commands

Build the project:
```bash
npm run build
```

The build compiles TypeScript files from `src/` to `build/` using the TypeScript compiler.

Run the server locally:
```bash
npm start
```

Or run directly with npx (without installing):
```bash
npx mcp-consultant-tools
```

## Architecture

### Two-Layer Architecture

1. **MCP Server Layer** ([src/index.ts](src/index.ts))
   - Initializes the MCP server using `@modelcontextprotocol/sdk`
   - Registers 28 tools and 13 prompts across PowerPlatform, Azure DevOps, and Figma integrations
   - Handles environment configuration and lazy-initialization of services (PowerPlatformService, AzureDevOpsService, FigmaService)
   - Uses Zod schemas for parameter validation
   - Communicates via stdio transport (StdioServerTransport)

2. **Service Layer**
   - **PowerPlatformService** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts))
     - Manages authentication to PowerPlatform using Azure MSAL (ConfidentialClientApplication)
     - Handles token acquisition and automatic refresh (5-minute buffer before expiry)
     - Makes authenticated OData API requests to PowerPlatform/Dataverse Web API (v9.2)
     - Implements filtering logic to exclude certain system attributes and relationships (e.g., yominame fields, msdyn_/adx_ entities)

   - **AzureDevOpsService** ([src/AzureDevOpsService.ts](src/AzureDevOpsService.ts))
     - Manages authentication using Personal Access Tokens (PAT)
     - Provides access to Azure DevOps wikis and work items
     - Implements wiki path conversion (git paths ↔ wiki paths)
     - Supports WIQL queries for work item filtering

   - **FigmaService** ([src/FigmaService.ts](src/FigmaService.ts))
     - Manages authentication using Personal Access Tokens (PAT) or OAuth
     - Fetches Figma design files and nodes via REST API
     - Transforms complex Figma data into simplified, AI-friendly format
     - Supports design extraction with depth limiting and node filtering

### Key Design Patterns

- **Lazy Initialization**: All services (PowerPlatform, AzureDevOps, Figma) are created on-demand only when their respective tools/prompts are first invoked
- **Token Caching**: Access tokens are cached and reused until near expiration to minimize authentication calls
- **Prompt Templates**: Pre-defined prompt templates with placeholder replacement for consistent, formatted responses
- **Dual Interface**: Functionality exposed both as MCP tools (for raw data) and prompts (for formatted, context-rich output)
- **Stdout Suppression for dotenv**: The server temporarily suppresses stdout during dotenv initialization to prevent non-JSON output from corrupting the MCP JSON protocol (which requires clean JSON-only stdout)
- **Optional Integrations**: All integrations are optional - users can configure only PowerPlatform, only Azure DevOps, only Figma, or any combination

### ⚠️ CRITICAL: MCP Protocol Requirements

**NEVER use `console.log()` or write to stdout in the codebase!**

The Model Context Protocol (MCP) uses stdio transport and requires **clean JSON-only output on stdout**. Any text written to stdout corrupts the JSON protocol and causes parsing errors in MCP clients.

**❌ FORBIDDEN (writes to stdout):**
```typescript
console.log('Querying apps...');        // ❌ Breaks MCP protocol - writes to stdout
console.info('Processing...');          // ❌ Breaks MCP protocol - writes to stdout
process.stdout.write('...');            // ❌ Breaks MCP protocol - writes to stdout
```

**✅ ALLOWED (writes to stderr):**
```typescript
// console.error and console.warn write to stderr - safe for MCP
console.error('API error:', error);     // ✅ OK - writes to stderr
console.warn('Solution not found');     // ✅ OK - writes to stderr
process.stderr.write('Debug: ...\n');  // ✅ OK - writes to stderr

// Use audit logger for important events
auditLogger.log({...});                 // ✅ OK - internal logging

// Include debug info in return values/errors
throw new Error('Details: ' + JSON.stringify(data));  // ✅ OK - error messages
```

**Key Points:**
- `console.log()` and `console.info()` → **stdout** → ❌ FORBIDDEN
- `console.error()` and `console.warn()` → **stderr** → ✅ ALLOWED
- Always prefer `console.error()` for error logging (existing pattern in codebase)
- Never use `console.log()` for debugging or informational messages

**Symptoms of stdout corruption:**
- MCP client errors: "Unexpected token 'X', '...' is not valid JSON"
- Protocol failures with cryptic JSON parsing errors
- Tools fail silently or with protocol errors

**Testing for stdout issues:**
1. Run the server: `node build/index.js`
2. Send a valid JSON-RPC request to stdin
3. Verify stdout contains ONLY valid JSON (no debug messages, no console output)

If you see any console.log/warn/error statements in code review or debugging, **remove them immediately**.

### Environment Configuration

Environment variables are loaded from `.env` file or set in the MCP client configuration. All integrations are optional.

**PowerPlatform Configuration (Optional):**
- `POWERPLATFORM_URL`: PowerPlatform environment URL (e.g., https://yourenvironment.crm.dynamics.com)
- `POWERPLATFORM_CLIENT_ID`: Azure AD app registration client ID
- `POWERPLATFORM_CLIENT_SECRET`: Azure AD app registration client secret
- `POWERPLATFORM_TENANT_ID`: Azure tenant ID

**Azure DevOps Configuration (Optional):**
- `AZUREDEVOPS_ORGANIZATION`: Organization name
- `AZUREDEVOPS_PAT`: Personal Access Token
- `AZUREDEVOPS_PROJECTS`: Comma-separated list of allowed projects
- `AZUREDEVOPS_API_VERSION`: API version (default: "7.1")
- `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE`: Enable work item write operations (default: "false")
- `AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE`: Enable work item delete operations (default: "false")
- `AZUREDEVOPS_ENABLE_WIKI_WRITE`: Enable wiki write operations (default: "false")

**Figma Configuration (Optional):**
- `FIGMA_API_KEY`: Figma Personal Access Token (PAT)
- `FIGMA_OAUTH_TOKEN`: Alternative OAuth token
- `FIGMA_USE_OAUTH`: Set to "true" if using OAuth (default: "false")

The server validates configuration on first use of each service and throws an error if any required variables for that service are missing.

### MCP Tools vs Prompts

**Tools**: Return raw JSON data from PowerPlatform API

*Entity & Metadata Tools (Read):*
- `get-entity-metadata`: Entity definition metadata
- `get-entity-attributes`: All attributes/fields for an entity
- `get-entity-attribute`: Specific attribute details
- `get-entity-relationships`: One-to-many and many-to-many relationships
- `get-global-option-set`: Global option set definitions
- `get-record`: Single record by entity name and ID
- `query-records`: OData-filtered record queries

*Entity Customization Tools (Write - requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true):*
- `update-entity-icon`: Set entity icon using Fluent UI System Icons

*Plugin Tools:*
- `get-plugin-assemblies`: List all plugin assemblies in the environment
- `get-plugin-assembly-complete`: Complete assembly details with validation
- `get-entity-plugin-pipeline`: All plugins executing on an entity
- `get-plugin-trace-logs`: Query plugin execution logs with filtering

*Workflow & Flow Tools:*
- `get-flows`: List all Power Automate cloud flows
- `get-flow-definition`: Get complete flow definition with logic (JSON)
- `get-flow-runs`: Get flow run history with success/failure status
- `get-workflows`: List all classic Dynamics workflows
- `get-workflow-definition`: Get complete workflow definition with XAML

*Business Rules Tools (Read-Only):*
- `get-business-rules`: List all business rules (for troubleshooting)
- `get-business-rule`: Get business rule definition with XAML (for troubleshooting)

*Azure DevOps Tools:*
- `get-wikis`: List all wikis in a project
- `search-wiki-pages`: Search wiki content with highlighting
- `get-wiki-page`: Get specific wiki page content
- `create-wiki-page`: Create new wiki page (requires write permission)
- `update-wiki-page`: Update existing wiki page (requires write permission)
- `get-work-item`: Get work item by ID with details
- `query-work-items`: Execute WIQL queries
- `get-work-item-comments`: Get discussion comments
- `add-work-item-comment`: Add comment (requires write permission)
- `update-work-item`: Update work item fields (requires write permission)
- `create-work-item`: Create new work item (requires write permission)
- `delete-work-item`: Delete work item (requires delete permission)

*Figma Tools:*
- `get-figma-data`: Get comprehensive Figma design data (layout, text, styles, components)
- `download-figma-images`: Placeholder for future image download functionality (v2)

**Prompts** (13 total): Return formatted, human-readable context with metadata

*Entity Prompts:*
- `entity-overview`: Comprehensive entity overview with key fields and relationships
- `attribute-details`: Detailed attribute information with usage notes
- `query-template`: OData query examples and filter patterns
- `relationship-map`: Visual relationship mapping

*Plugin Prompts:*
- `plugin-deployment-report`: Comprehensive deployment report for PR reviews
- `entity-plugin-pipeline-report`: Visual pipeline showing execution order

*Workflow & Flow Prompts:*
- `flows-report`: Comprehensive report of all Power Automate flows
- `workflows-report`: Comprehensive report of all classic workflows

*Business Rules Prompts (Read-Only):*
- `business-rules-report`: Comprehensive report of all business rules (for troubleshooting)

*Azure DevOps Prompts:*
- `wiki-search-results`: Search wiki pages with formatted results
- `wiki-page-content`: Get formatted wiki page with navigation context
- `work-item-summary`: Comprehensive work item summary with details and comments
- `work-items-query-report`: Execute WIQL query and get formatted results

### API Integration

- Uses PowerPlatform Web API v9.2 with OData 4.0
- All requests include proper headers: `OData-MaxVersion`, `OData-Version`, `Authorization`
- Endpoints follow pattern: `{organizationUrl}/api/data/v9.2/{resource}`
- Implements filtering to exclude virtual attributes and certain system entity relationships

### Data Filtering Logic

The service implements business logic to clean up API responses:
- Removes `Privileges` property from entity metadata
- Filters out attributes ending in `yominame` (Japanese phonetic names)
- Removes redundant `*name` attributes when base attribute exists (e.g., keeps `ownerid`, removes `ownername`)
- Excludes one-to-many relationships with `regardingobjectid` attribute
- Excludes relationships to entities starting with `msdyn_` or `adx_` (Dynamics system entities)

## Plugin Registration & Validation Architecture

### Plugin Discovery & Validation Tools

The server includes 4 specialized tools for plugin inspection and validation:

1. **get-plugin-assemblies** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:270))
   - Lists all plugin assemblies in the environment
   - Filters managed vs. unmanaged assemblies
   - Returns formatted assembly information with isolation mode, version, modified by

2. **get-plugin-assembly-complete** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:302))
   - Retrieves full assembly details: types, steps, images
   - Queries multiple API endpoints and joins data
   - **Optimized queries** use `$select` clauses to limit response size (excludes metadata fields like introducedversion, overwritetime, componentstate, etc.)
   - **Automatic validation logic** detects common issues:
     - Update/Delete steps without filtering attributes
     - Steps missing pre/post images
     - Disabled steps
   - Returns structured validation results with potential issues flagged

3. **get-entity-plugin-pipeline** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:350))
   - Shows all plugins executing on an entity
   - Organizes by message type (Create, Update, Delete) and stage
   - Orders by execution rank
   - Includes filtering attributes and image configuration
   - **Optimized queries** use `$select` clauses to minimize response size

4. **get-plugin-trace-logs** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:442))
   - Queries plugin execution logs with filtering
   - Parses exception details (type, message, stack trace)
   - Supports filtering by entity, message, correlation ID, time range

### Prompts for Human-Readable Reports

Two prompts generate formatted markdown reports from tool data:

1. **plugin-deployment-report** ([src/index.ts](src/index.ts:354))
   - Comprehensive deployment report for PR reviews
   - Shows assembly info, all steps, and validation warnings
   - Formats as markdown with checkmarks and warning symbols

2. **entity-plugin-pipeline-report** ([src/index.ts](src/index.ts:464))
   - Visual pipeline showing execution order by stage
   - Grouped by message type
   - Shows rank, mode (sync/async), filtering, images

### Validation Logic

**Automatic checks** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:321-333)):
- Identifies Update/Delete steps without `filteringattributes` (performance concern)
- Detects Update/Delete steps without images (potential runtime errors)
- Flags disabled steps
- Counts sync vs. async steps
- Generates `potentialIssues` array with human-readable warnings

### PR Review Workflow

Intended usage for code reviews:
1. Developer submits plugin PR
2. AI agent uses `get-plugin-assemblies` to discover deployment
3. AI agent uses `get-plugin-assembly-complete` to validate configuration
4. AI agent compares code against Dataverse configuration
5. AI generates report using `plugin-deployment-report` prompt
6. Human reviewer sees validation warnings and configuration details

### Data Filtering for Plugin Queries

The service filters out certain noisy data:
- Managed assemblies (by default)
- Hidden assemblies
- System plugins (when appropriate)
- Plugin types are queried first, then steps are queried by plugin type IDs (to avoid complex OData filters)

### Query Optimization

To handle large plugin assemblies (25000+ tokens), the plugin tools use aggressive field selection:

**Steps queries** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:341)):
- Uses `$select` to request only essential fields: `sdkmessageprocessingstepid`, `name`, `stage`, `mode`, `rank`, `statuscode`, `filteringattributes`, `supporteddeployment`, etc.
- Excludes unnecessary metadata: `introducedversion`, `overwritetime`, `solutionid`, `componentstate`, `versionnumber`, `createdon`, `modifiedon`, etc.
- Expands navigation properties with their own `$select` clauses

**Image queries** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:354)):
- Selects only used fields: `name`, `imagetype`, `attributes`, `entityalias`, `messagepropertyname`
- Omits all metadata fields

**Result**: Response size typically reduced by 70-80% compared to unfiltered queries, making large assemblies manageable within token limits.

## Workflow & Power Automate Flow Architecture

### Workflow Entity Overview

Both Power Automate cloud flows and classic Dynamics workflows are stored in the `workflow` entity in Dataverse. The server distinguishes between them using the `category` field:

**Category Values:**
- `0`: Classic Workflow (background/real-time workflows)
- `5`: Modern Flow (Power Automate cloud flows)
- Other values: Business Rules (2), Actions (3), Business Process Flows (4), Desktop Flows (6)

**State Values:**
- `0`: Draft
- `1`: Activated
- `2`: Suspended

### Flow Run Entity Overview

Flow execution history is stored in the `flowruns` entity in Dataverse. Each record represents a single execution instance of a flow.

**Status Values (string):**
- `Succeeded`: Flow completed successfully
- `Failed`: Flow failed with error
- `Faulted`: Flow encountered a fault
- `TimedOut`: Flow exceeded timeout limit
- `Cancelled`: Flow was manually cancelled
- `Running`: Flow is currently executing
- `Waiting`: Flow is waiting for input/approval

**Key Fields:**
- `flowrunid`: Unique identifier for the run
- `_workflow_value`: Links to the workflow (flow) entity
- `status`: Current status of the run (string, not code)
- `starttime`: Timestamp when the run started
- `endtime`: Timestamp when the run completed
- `duration`: Run duration in seconds
- `errormessage`: Detailed error message if the run failed (may be JSON)
- `errorcode`: Error code if the run failed
- `triggertype`: How the flow was triggered (e.g., "Automated")

### Workflow & Flow Tools

The server includes 5 specialized tools for workflow and flow inspection:

1. **get-flows** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:590))
   - Lists all Power Automate cloud flows (category = 5)
   - Filters by active/inactive status
   - Returns formatted flow information with owner, modified date, primary entity

2. **get-flow-definition** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:629))
   - Retrieves complete flow definition including JSON logic
   - Parses `clientdata` field which contains the flow definition
   - Returns structured flow information with state, triggers, and actions

3. **get-flow-runs** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:671))
   - Retrieves flow run history for a specific flow
   - Queries `flowruns` entity for execution records
   - Returns run status (Succeeded/Failed/Running/etc.), start/end times, duration, error details
   - Parses JSON error messages automatically
   - Includes trigger type information
   - Supports filtering by max records (default: 100)

4. **get-workflows** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:733))
   - Lists all classic Dynamics workflows (category = 0)
   - Shows mode (background/real-time), triggers (create/delete/update)
   - Returns formatted workflow information

5. **get-workflow-definition** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:776))
   - Retrieves complete workflow definition including XAML
   - Shows trigger configuration and filtering attributes
   - Returns structured workflow information with execution mode

### Prompts for Human-Readable Reports

Two prompts generate formatted markdown reports from workflow/flow data:

1. **flows-report** ([src/index.ts](src/index.ts:577))
   - Comprehensive report of all flows grouped by state
   - Shows active, draft, and suspended flows
   - Formatted as markdown with flow details

2. **workflows-report** ([src/index.ts](src/index.ts:661))
   - Comprehensive report of all classic workflows grouped by state
   - Shows triggers, execution mode, and entity binding
   - Formatted as markdown with workflow details

### Use Cases

**Flow Analysis:**
- Identify all active/inactive flows in an environment
- Inspect flow definitions to understand automation logic
- Audit flow ownership and modification history
- Review flow triggers and associated entities
- **Monitor flow execution history and success rates**
- **Troubleshoot flow failures with detailed error messages**
- **Analyze flow performance with duration metrics**
- **Track flow run patterns over time**

**Workflow Analysis:**
- List all classic workflows (background and real-time)
- Inspect workflow XAML for logic review
- Identify workflows triggered on specific events
- Review workflow execution modes (sync vs async)

### Data Formatting

The service formats workflow/flow responses to include human-readable values:
- Converts `statecode` (0/1/2) to "Draft"/"Activated"/"Suspended"
- Converts `mode` (0/1) to "Background"/"Real-time" for workflows
- Converts `type` (1/2/3) to "Definition"/"Activation"/"Template"
- Parses trigger attributes for workflows (create/delete/update)
- Parses JSON flow definitions from `clientdata` field
- Flow run status is already human-readable (string): "Succeeded", "Failed", "Faulted", "TimedOut", etc.
- Parses JSON-encoded error messages from `errormessage` field automatically
- Duration is provided directly by the `flowruns` entity in seconds

## Azure DevOps Wiki Integration

### Wiki Path Conversion Issue & Fix

**Problem:** Azure DevOps search API returns **git paths** (file paths in the repository) but the get-page API expects **wiki paths** (user-facing page paths). These formats are incompatible:

| Format | Example |
|--------|---------|
| Git Path (from search) | `/Release-Notes/Page-Name.md` |
| Wiki Path (for get-page) | `/Release Notes/Page Name` |

**Solution:** The service automatically converts between formats using a two-pronged approach:

1. **Search Results Enhancement** ([src/AzureDevOpsService.ts](src/AzureDevOpsService.ts:182))
   - `searchWikiPages()` returns both `gitPath` (original) and `path` (converted wiki path)
   - Clients can use the `path` field directly with `getWikiPage()`
   - Backward compatible - existing code continues to work

2. **Auto-Conversion Fallback** ([src/AzureDevOpsService.ts](src/AzureDevOpsService.ts:207))
   - `getWikiPage()` detects git paths (ending with `.md`) and auto-converts them
   - Accepts both wiki paths and git paths for maximum compatibility
   - Logs conversion for debugging

**Conversion Logic:**
```typescript
private convertGitPathToWikiPath(gitPath: string): string {
  return gitPath
    .replace(/\.md$/, '')      // Remove .md extension
    .replace(/-/g, ' ')         // Replace dashes with spaces
    .replace(/%2D/gi, '-');     // Decode %2D back to -
}
```

**Testing:** See [docs/WIKI_PATH_FIX_SUMMARY.md](docs/WIKI_PATH_FIX_SUMMARY.md) for detailed testing results and [docs/WIKI_PATH_ISSUE.md](docs/WIKI_PATH_ISSUE.md) for issue analysis.

### Wiki Tools

The Azure DevOps service provides wiki search and retrieval capabilities:

- `get-wikis`: List all wikis in a project
- `search-wiki-pages`: Full-text search across wiki pages with highlighting
- `get-wiki-page`: Retrieve page content using wiki paths (auto-converts git paths)

**Usage Example:**
```javascript
// Search for pages
const results = await searchWikiPages("Release_002", "RTPI");

// Use the path directly (already converted to wiki path)
const page = await getWikiPage("RTPI", results.results[0].wikiId, results.results[0].path, true);

// Extract content
const items = page.content.matchAll(/\|\s*#(\d+)\s*\|/g);
```

## Figma Integration

### Figma Architecture Overview

The Figma integration extracts design data from Figma files and transforms it into a simplified, AI-friendly format. It uses a multi-stage pipeline to process complex Figma API responses.

### Figma Service ([src/FigmaService.ts](src/FigmaService.ts))

**Authentication:**
- Supports Personal Access Token (PAT) authentication: `X-Figma-Token` header
- Supports OAuth authentication: `Authorization: Bearer` header
- Token type configured via `FIGMA_USE_OAUTH` environment variable

**Core Methods:**
- `getFigmaData(fileKey, nodeId?, depth?)` - Main method for extracting design data
- `getFigmaFile(fileKey)` - Fetch complete Figma file via REST API
- `getFigmaNodes(fileKey, nodeIds)` - Fetch specific nodes by ID
- `getAuthHeaders()` - Returns appropriate authentication headers

**Features:**
- Depth limiting for large files (prevents token overflow)
- Node filtering (fetch specific nodes instead of entire file)
- Automatic retry logic with corporate proxy fallback
- JSON output format

### Data Transformation Pipeline

The Figma integration uses a sophisticated extraction and transformation pipeline:

```
Figma API Response (Complex)
    ↓
Node Walker (Tree Traversal)
  - Depth-first traversal
  - Depth limiting
  - Context propagation
    ↓
Extractors (Data Extraction)
  - layoutExtractor: position, size, constraints
  - textExtractor: text content, typography
  - visualsExtractor: fills, strokes, effects, opacity
  - componentExtractor: component instances, properties
    ↓
Transformers (Simplification)
  - Layout properties
  - Text styles
  - Fill/stroke definitions
  - Effects (shadows, blurs)
    ↓
Style Deduplication
  - Hash style objects
  - Store in globalVars.styles
  - Return reference IDs
    ↓
Simplified Design (AI-Friendly JSON)
```

### Figma Extractors ([src/figma/extractors/](src/figma/extractors/))

**Design Extractor** ([design-extractor.ts](src/figma/extractors/design-extractor.ts)):
- Top-level orchestration of extraction process
- Coordinates node walking and data extraction
- Manages global style deduplication

**Node Walker** ([node-walker.ts](src/figma/extractors/node-walker.ts)):
- Depth-first tree traversal
- Supports depth limiting
- Provides beforeChildren and afterChildren hooks for extractors

**Built-in Extractors** ([built-in.ts](src/figma/extractors/built-in.ts)):
- `layoutExtractor`: Extracts position, size, constraints, and layout properties
- `textExtractor`: Extracts text content and typography
- `visualsExtractor`: Extracts fills, strokes, effects, opacity, border radius
- `componentExtractor`: Extracts component instances and properties
- `collapseSvgContainers`: Optimizes SVG nodes (afterChildren hook)

### Figma Transformers ([src/figma/transformers/](src/figma/transformers/))

Transform complex Figma API data into simplified structures:

- **layout.ts**: Layout calculations (position, size, constraints, auto-layout)
- **text.ts**: Text style parsing (font, size, weight, alignment)
- **style.ts**: Fill and stroke parsing (solid colors, gradients, images)
- **effects.ts**: Shadow and blur effect parsing
- **component.ts**: Component metadata extraction

### Figma Tools

**get-figma-data** ([src/index.ts](src/index.ts:2221)):
- Fetches comprehensive Figma design data
- Returns simplified, AI-friendly JSON format
- Supports entire file or specific node fetching
- Supports depth limiting for large files
- Automatic style deduplication

**Parameters:**
- `fileKey` (required): Figma file key from URL (alphanumeric)
- `nodeId` (optional): Specific node ID(s) to fetch (format: `1:10` or `1:10;2:20`)
- `depth` (optional): Tree traversal depth limit

**Output Structure:**
```typescript
{
  metadata: {
    name: string;
    // file metadata
  },
  nodes: SimplifiedNode[],
  components: { [id: string]: ComponentDefinition },
  componentSets: { [id: string]: ComponentSetDefinition },
  globalVars: {
    styles: { [id: string]: StyleObject }
  }
}
```

**download-figma-images** ([src/index.ts](src/index.ts:2274)):
- Placeholder for future image download functionality
- Planned for v2 release
- Will support PNG/SVG downloads with Sharp-based processing

### Figma API Integration

**Endpoints Used:**

1. **Get File**
   ```
   GET https://api.figma.com/v1/files/{fileKey}?depth={depth}
   ```
   Returns complete file structure with all nodes

2. **Get Specific Nodes**
   ```
   GET https://api.figma.com/v1/files/{fileKey}/nodes?ids={nodeId1},{nodeId2}
   ```
   Returns only specified nodes

**Rate Limits:**
- Figma API has rate limits (varies by plan)
- Implements retry logic with exponential backoff
- Uses fetch-with-retry for corporate proxy support

### Use Cases

**Design System Documentation:**
- Extract component definitions and properties
- Document typography scales and color palettes
- Map design tokens to code variables

**Design QA:**
- Verify consistency across design files
- Check for style drift
- Identify unused components

**Design-to-Code:**
- Extract layout properties for code generation
- Map Figma components to code components
- Generate CSS from Figma styles

**AI-Assisted Design Review:**
- Provide design context to AI assistants
- Enable natural language queries about designs
- Facilitate design discussions with structured data

### Error Handling

Common Figma API errors and solutions:

**Missing Authentication:**
```
Error: Missing required Figma configuration: FIGMA_API_KEY or FIGMA_OAUTH_TOKEN
```
Solution: Set credentials in environment variables

**Invalid File Key:**
```
Error: 404 - File not found
```
Solution: Verify file key from URL, check access permissions

**Expired OAuth Token:**
```
Error: 401 - Unauthorized
```
Solution: Refresh OAuth token

**Rate Limit Exceeded:**
```
Error: 429 - Too Many Requests
```
Solution: Reduce request frequency, implement backoff

## Icon Management with Fluent UI System Icons

### Overview

The MCP server includes comprehensive icon management capabilities using Microsoft's official Fluent UI System Icons. This enables programmatic assignment of icons to custom entities, improving UI consistency and developer productivity.

### Icon Manager Utility ([src/utils/iconManager.ts](src/utils/iconManager.ts))

The `IconManager` class provides:

**Core Functionality:**
- Icon suggestion based on entity name/type
- SVG fetching from Fluent UI GitHub repository
- SVG validation (size, content, security checks)
- Web resource name generation
- Icon vector name generation for entity metadata
- Icon search and categorization

**Icon Source:**
- Repository: https://github.com/microsoft/fluentui-system-icons
- 2,100+ professional icons
- Multiple sizes: 16, 20, 24, 28, 32, 48px
- Two styles: Regular and Filled
- SVG format, optimized for web
- MIT License (free, open source)

### Update Entity Icon Tool

**Tool:** `update-entity-icon`

**Purpose:** Set or update entity icons programmatically using Fluent UI System Icons

**Parameters:**
```typescript
{
  entityLogicalName: string;    // e.g., 'sic_strikeaction'
  iconFileName: string;          // e.g., 'people_community_24_filled.svg'
  solutionUniqueName?: string;  // optional solution context
}
```

**Implementation Flow ([src/PowerPlatformService.ts](src/PowerPlatformService.ts:1648)):**

1. **Fetch Entity Metadata**: Retrieve schema name and metadata ID
2. **Download SVG**: Fetch icon from Fluent UI GitHub repository
3. **Validate SVG**: Check format, size (<100KB), and security (no script tags)
4. **Convert to Base64**: Encode SVG for web resource
5. **Create Web Resource**: Upload as SVG web resource (type 11)
6. **Update Entity Metadata**: Set `IconVectorName` property with `$webresource:` directive
7. **Add to Solution**: Include web resource in specified solution
8. **Publish Web Resource**: Automatically publish the web resource (component type 61)
9. **Publish Entity**: Automatically publish the entity metadata (component type 1)
10. **Audit Logging**: Log operation with details

**Example Usage:**
```typescript
await mcpClient.invoke("update-entity-icon", {
  entityLogicalName: "sic_strikeaction",
  iconFileName: "people_community_24_filled.svg",
  solutionUniqueName: "MCPTestCore"
});
```

**Icon Suggestions:**

The IconManager provides intelligent icon suggestions based on entity names:
- **Strike Action** → `people_community_24_filled.svg` (group/collective action)
- **Strike Action Period** → `calendar_24_filled.svg` (date ranges)
- **Contact** → `person_24_filled.svg` (individual person)
- **Account** → `building_24_filled.svg` (organization)
- **Case/Incident** → `alert_24_filled.svg` (alerts/warnings)
- **Project** → `briefcase_24_filled.svg` (work/projects)

### Icon Naming Convention

Fluent UI icon file names follow this pattern:
```
{iconName}_{size}_{style}.svg
```

Examples:
- `people_community_24_filled.svg`
- `calendar_clock_24_regular.svg`
- `document_text_28_filled.svg`

### Security & Validation

The IconManager implements security checks:
- **Size limit**: Maximum 100KB per SVG
- **Content validation**: Must contain `<svg>` tag
- **Security scan**: Rejects SVGs with `<script>` tags
- **Format check**: Validates SVG structure

### Web Resource Management

**Web Resource Naming:**
```typescript
generateWebResourceName(entitySchemaName, iconName)
// Example: "sic_strikeaction_icon_people_community_24_filled"
```

**Icon Vector Name:**
```typescript
generateIconVectorName(webResourceName)
// Example: "$webresource:sic_strikeaction_icon_people_community_24_filled"
// Uses $webresource: directive (Dynamics 365 standard syntax)
// Creates solution dependency and enables web resource lookup by name
```

**Web Resource Properties:**
- **Type**: 11 (SVG)
- **Content**: Base64-encoded SVG
- **Display Name**: "Icon for {Entity Display Name}"
- **Description**: "Fluent UI icon ({fileName}) for {logicalName} entity"

### Use Cases

**Entity Branding:**
- Assign consistent, professional icons to custom entities
- Improve entity recognition in Model-Driven App navigation
- Enhance user experience with visual identifiers

**Automated Entity Creation:**
- Set icons programmatically during entity creation workflows
- Standardize icon usage across development teams
- Reduce manual configuration in Power Apps maker portal

**Design System Consistency:**
- Use Microsoft's official design language
- Align with Microsoft 365 and Power Platform aesthetics
- Future-proof with actively maintained icon library

### Error Handling

Common errors and solutions:

**Invalid Icon File Name:**
```
Error: Failed to fetch icon: 404 Not Found
```
Solution: Verify icon name at https://github.com/microsoft/fluentui-system-icons

**SVG Too Large:**
```
Error: Invalid SVG: SVG file is too large (max 100KB)
```
Solution: Use standard Fluent UI icons (always under 100KB)

**Missing Entity:**
```
Error: Could not find MetadataId for entity 'entityname'
```
Solution: Verify entity logical name exists

### Publishing Requirement

After updating entity icons, customizations must be published:
```typescript
await mcpClient.invoke("publish-customizations", {});
```

Icons will only appear in the UI after publishing.

## Publishing

The package is published to npm as `mcp-consultant-tools`:
- `npm run prepublishOnly` automatically runs build before publishing
- Published files: `build/`, `README.md` (defined in package.json files array)
- Binary: `mcp-consultant-tools` command points to `build/index.js`

### Publishing Strategy & Branch Workflow

**IMPORTANT**: The `main` branch is the source of truth for npm publishing. Whatever is in `main` gets published to npm.

**Branch Strategy:**

- **`release/*` branches**: Active development and local testing
  - This is where you work on new features and fixes
  - Test locally using the local node command (see below)
  - Do NOT publish to npm from release branches
  - The latest `release/*` branch contains work-in-progress code

- **`main` branch**: Production-ready code that is published to npm
  - Only merge to `main` when you're ready to publish
  - Publishing workflow:
    1. Merge `release/*` branch to `main`
    2. Update version on `main`: `npm version patch|minor|major`
    3. Publish: `npm publish`
    4. Push to GitHub: `git push && git push --tags`
  - Everything in `main` should be tested and ready for public use

**Version Bumping:**
- `npm version patch`: Bug fixes (2.0.0 → 2.0.1)
- `npm version minor`: New features (2.0.0 → 2.1.0)
- `npm version major`: Breaking changes (2.0.0 → 3.0.0)

**Local Testing Configuration:**
Test from your `release/*` branch using the local development configuration:
```json
{
  "command": "node",
  "args": ["/absolute/path/to/mcp-consultant-tools/build/index.js"],
  "env": {
    "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
    "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
    "POWERPLATFORM_CLIENT_SECRET": "your-azure-app-client-secret",
    "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id",

    "AZUREDEVOPS_ORGANIZATION": "your-organization-name",
    "AZUREDEVOPS_PAT": "your-personal-access-token",
    "AZUREDEVOPS_PROJECTS": "Project1,Project2",
    "AZUREDEVOPS_API_VERSION": "7.1",
    "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
    "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
    "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false",

    "FIGMA_API_KEY": "your-figma-personal-access-token",
    "FIGMA_OAUTH_TOKEN": "",
    "FIGMA_USE_OAUTH": "false"
  }
}
```

**Workflow Summary:**
1. Work on `release/*` branch → Test locally with `node` command
2. When ready → Merge to `main` → Bump version → Publish to npm
3. Start new `release/*` branch for next iteration

## TypeScript Configuration

- Target: ES2022
- Module: Node16 with Node16 module resolution
- Strict mode enabled
- Output directory: `./build`
- Source directory: `./src`
