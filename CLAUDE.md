# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides intelligent access to Microsoft PowerPlatform/Dataverse entities, records, plugins, workflows, and Power Automate flows through an MCP-compatible interface. It enables AI assistants to explore entity metadata, query records, inspect plugin configurations, analyze workflows, and provide context-aware assistance for PowerPlatform development.

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
   - Registers 16 tools and 8 prompts for PowerPlatform interaction
   - Handles environment configuration and lazy-initialization of the PowerPlatformService
   - Uses Zod schemas for parameter validation
   - Communicates via stdio transport (StdioServerTransport)

2. **Service Layer** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts))
   - Manages authentication to PowerPlatform using Azure MSAL (ConfidentialClientApplication)
   - Handles token acquisition and automatic refresh (5-minute buffer before expiry)
   - Makes authenticated OData API requests to PowerPlatform/Dataverse Web API (v9.2)
   - Implements filtering logic to exclude certain system attributes and relationships (e.g., yominame fields, msdyn_/adx_ entities)

### Key Design Patterns

- **Lazy Initialization**: PowerPlatformService is created on-demand via `getPowerPlatformService()`, only when first tool/prompt is invoked
- **Token Caching**: Access tokens are cached and reused until near expiration to minimize authentication calls
- **Prompt Templates**: Pre-defined prompt templates with placeholder replacement for consistent, formatted responses
- **Dual Interface**: Functionality exposed both as MCP tools (for raw data) and prompts (for formatted, context-rich output)
- **Stdout Suppression for dotenv**: The server temporarily suppresses stdout during dotenv initialization to prevent non-JSON output from corrupting the MCP JSON protocol (which requires clean JSON-only stdout)

### Environment Configuration

Required environment variables (must be set before running):
- `POWERPLATFORM_URL`: PowerPlatform environment URL (e.g., https://yourenvironment.crm.dynamics.com)
- `POWERPLATFORM_CLIENT_ID`: Azure AD app registration client ID
- `POWERPLATFORM_CLIENT_SECRET`: Azure AD app registration client secret
- `POWERPLATFORM_TENANT_ID`: Azure tenant ID

The server validates configuration on first use and throws an error if any required variables are missing.

### MCP Tools vs Prompts

**Tools**: Return raw JSON data from PowerPlatform API

*Entity & Metadata Tools:*
- `get-entity-metadata`: Entity definition metadata
- `get-entity-attributes`: All attributes/fields for an entity
- `get-entity-attribute`: Specific attribute details
- `get-entity-relationships`: One-to-many and many-to-many relationships
- `get-global-option-set`: Global option set definitions
- `get-record`: Single record by entity name and ID
- `query-records`: OData-filtered record queries

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

**Prompts** (8 total): Return formatted, human-readable context with metadata

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

## Publishing

The package is published to npm as `mcp-consultant-tools`:
- `npm run prepublishOnly` automatically runs build before publishing
- Published files: `build/`, `README.md` (defined in package.json files array)
- Binary: `mcp-consultant-tools` command points to `build/index.js`

### Publishing Strategy & Branch Workflow

**IMPORTANT**: Only publish to npm from the `main` branch after merging feature/release branches.

**Branch Strategy:**
- **`feature/*` branches**: Active development of new features
  - Develop and test locally
  - Do NOT publish to npm
  - Use local node command for testing: `node /path/to/build/index.js`

- **`release/*` branches**: Testing versions before release
  - Validate and test changes before merging to main
  - Do NOT publish to npm
  - Use local node command for testing

- **`main` branch**: Production-ready code
  - **ONLY** publish to npm when main is updated
  - Publishing workflow:
    1. Ensure you're on `main` branch
    2. Merge feature/release branch to `main`
    3. Update version: `npm version patch|minor|major`
    4. Publish: `npm publish`
    5. Push to GitHub: `git push && git push --tags`

**Version Bumping:**
- `npm version patch`: Bug fixes (0.4.6 → 0.4.7)
- `npm version minor`: New features (0.4.6 → 0.5.0)
- `npm version major`: Breaking changes (0.4.6 → 1.0.0)

**Testing Before Publishing:**
Always test locally using the local development configuration before publishing:
```json
{
  "command": "node",
  "args": ["/absolute/path/to/mcp-consultant-tools/build/index.js"]
}
```

## TypeScript Configuration

- Target: ES2022
- Module: Node16 with Node16 module resolution
- Strict mode enabled
- Output directory: `./build`
- Source directory: `./src`
