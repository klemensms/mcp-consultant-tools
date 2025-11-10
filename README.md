# MCP Consultant Tools

A Model Context Protocol (MCP) server providing intelligent access to PowerPlatform/Dataverse, Azure DevOps, Figma, Azure Application Insights, Azure Log Analytics, Azure SQL Database, Azure Service Bus, SharePoint Online, and GitHub Enterprise through an AI-friendly interface.

## Overview

This MCP server enables AI assistants to:
- **PowerPlatform/Dataverse** (70+ tools):
  - **READ**: Explore entity metadata, query records, inspect plugins, analyze workflows and flows
  - **WRITE** *(Optional, Feature-Flagged)*:
    - Entities & attributes (all 11 user-creatable types)
    - Global option sets, forms, views
    - Business rules, web resources
    - Solutions, publishers, import/export
    - Publishing & validation
- **Azure DevOps** (13 tools): Search wikis, manage work items, execute WIQL queries
- **Figma** (2 tools): Extract design data in simplified, AI-friendly format
- **Application Insights** (10 tools): Query telemetry, analyze exceptions, monitor performance, troubleshoot issues
- **Log Analytics** (10 tools): Query Azure Functions logs, analyze errors, monitor function performance, search workspace logs
- **Azure SQL Database** (9 tools): Explore database schema, query tables safely with read-only access, investigate database structure
- **Azure Service Bus** (8 tools): Inspect queues and dead letter queues, analyze message failures, monitor queue health, search messages by correlation ID
- **SharePoint Online** (15 tools + 10 prompts): Access sites, document libraries, files; validate PowerPlatform document location configurations; verify document migrations
- **GitHub Enterprise** (22 tools): Access source code, commits, branches, pull requests, correlate with deployed plugins and ADO work items

All integrations are **optional** - configure only the services you need.

**Total: 161 MCP tools & 43 prompts** providing comprehensive access to your development and operations lifecycle.

## Known limitations
- Cannot create Model-Driven-Apps
- Cannot add Customer fields
- Adds icon to solution, but does not update the table correctly. Icon name: 'Icon for {table name}'

## Quick Start

### Installation

Run directly with npx (no installation needed):

```bash
npx mcp-consultant-tools@latest
```

Or install globally:

```bash
npm install -g mcp-consultant-tools
```

### Configuration

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["-y", "mcp-consultant-tools@latest"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",
        "POWERPLATFORM_ENABLE_CUSTOMIZATION": "false",
        "POWERPLATFORM_DEFAULT_SOLUTION": "",
        "POWERPLATFORM_ENABLE_CREATE": "false",
        "POWERPLATFORM_ENABLE_UPDATE": "false",
        "POWERPLATFORM_ENABLE_DELETE": "false",

        "AZUREDEVOPS_ORGANIZATION": "your-org",
        "AZUREDEVOPS_PAT": "your-pat",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false",

        "FIGMA_API_KEY": "your-figma-token",
        "FIGMA_OAUTH_TOKEN": "",
        "FIGMA_USE_OAUTH": "false",

        "APPINSIGHTS_AUTH_METHOD": "entra-id",
        "APPINSIGHTS_TENANT_ID": "your-tenant-id",
        "APPINSIGHTS_CLIENT_ID": "your-client-id",
        "APPINSIGHTS_CLIENT_SECRET": "your-client-secret",
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod-api\",\"name\":\"Production API\",\"appId\":\"your-app-id\",\"active\":true}]",

        "LOGANALYTICS_AUTH_METHOD": "entra-id",
        "LOGANALYTICS_TENANT_ID": "your-tenant-id",
        "LOGANALYTICS_CLIENT_ID": "your-client-id",
        "LOGANALYTICS_CLIENT_SECRET": "your-client-secret",
        "LOGANALYTICS_RESOURCES": "[{\"id\":\"prod-functions\",\"name\":\"Production Functions\",\"workspaceId\":\"your-workspace-id\",\"active\":true}]",

        "AZURE_SQL_SERVER": "yourserver.database.windows.net",
        "AZURE_SQL_DATABASE": "yourdatabase",
        "AZURE_SQL_USERNAME": "your-username",
        "AZURE_SQL_PASSWORD": "your-password",
        "AZURE_SQL_USE_AZURE_AD": "false",

        "SERVICEBUS_AUTH_METHOD": "entra-id",
        "SERVICEBUS_TENANT_ID": "your-tenant-id",
        "SERVICEBUS_CLIENT_ID": "your-client-id",
        "SERVICEBUS_CLIENT_SECRET": "your-client-secret",
        "SERVICEBUS_RESOURCES": "[{\"id\":\"prod\",\"name\":\"Production Service Bus\",\"namespace\":\"prod-namespace.servicebus.windows.net\",\"active\":true}]",

        "SHAREPOINT_TENANT_ID": "your-tenant-id",
        "SHAREPOINT_CLIENT_ID": "your-client-id",
        "SHAREPOINT_CLIENT_SECRET": "your-client-secret",
        "SHAREPOINT_SITES": "[{\"id\":\"main\",\"name\":\"Main Site\",\"siteUrl\":\"https://yourtenant.sharepoint.com/sites/main\",\"active\":true}]",

        "GHE_URL": "https://github.yourcompany.com",
        "GHE_PAT": "ghp_your_personal_access_token",
        "GHE_AUTH_METHOD": "pat",
        "GHE_REPOS": "[{\"id\":\"plugin-core\",\"owner\":\"yourorg\",\"repo\":\"PluginCore\",\"defaultBranch\":\"release/9.0\",\"active\":true}]",
        "GHE_ENABLE_CACHE": "true",
        "GHE_CACHE_TTL": "300",
        "GHE_ENABLE_WRITE": "false",
        "GHE_ENABLE_CREATE": "false"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

#### VS Code (Claude Code)

Create `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["-y", "mcp-consultant-tools@latest"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",
        "POWERPLATFORM_ENABLE_CUSTOMIZATION": "false",
        "POWERPLATFORM_DEFAULT_SOLUTION": "",
        "POWERPLATFORM_ENABLE_CREATE": "false",
        "POWERPLATFORM_ENABLE_UPDATE": "false",
        "POWERPLATFORM_ENABLE_DELETE": "false",

        "AZUREDEVOPS_ORGANIZATION": "your-org",
        "AZUREDEVOPS_PAT": "your-pat",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false",

        "FIGMA_API_KEY": "your-figma-token",
        "FIGMA_OAUTH_TOKEN": "",
        "FIGMA_USE_OAUTH": "false",

        "APPINSIGHTS_AUTH_METHOD": "entra-id",
        "APPINSIGHTS_TENANT_ID": "your-tenant-id",
        "APPINSIGHTS_CLIENT_ID": "your-client-id",
        "APPINSIGHTS_CLIENT_SECRET": "your-client-secret",
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod-api\",\"name\":\"Production API\",\"appId\":\"your-app-id\",\"active\":true}]",

        "LOGANALYTICS_AUTH_METHOD": "entra-id",
        "LOGANALYTICS_TENANT_ID": "your-tenant-id",
        "LOGANALYTICS_CLIENT_ID": "your-client-id",
        "LOGANALYTICS_CLIENT_SECRET": "your-client-secret",
        "LOGANALYTICS_RESOURCES": "[{\"id\":\"prod-functions\",\"name\":\"Production Functions\",\"workspaceId\":\"your-workspace-id\",\"active\":true}]",

        "AZURE_SQL_SERVER": "yourserver.database.windows.net",
        "AZURE_SQL_DATABASE": "yourdatabase",
        "AZURE_SQL_USERNAME": "your-username",
        "AZURE_SQL_PASSWORD": "your-password",
        "AZURE_SQL_USE_AZURE_AD": "false",

        "SERVICEBUS_AUTH_METHOD": "entra-id",
        "SERVICEBUS_TENANT_ID": "your-tenant-id",
        "SERVICEBUS_CLIENT_ID": "your-client-id",
        "SERVICEBUS_CLIENT_SECRET": "your-client-secret",
        "SERVICEBUS_RESOURCES": "[{\"id\":\"prod\",\"name\":\"Production Service Bus\",\"namespace\":\"prod-namespace.servicebus.windows.net\",\"active\":true}]",

        "GHE_URL": "https://github.yourcompany.com",
        "GHE_PAT": "ghp_your_personal_access_token",
        "GHE_AUTH_METHOD": "pat",
        "GHE_REPOS": "[{\"id\":\"plugin-core\",\"owner\":\"yourorg\",\"repo\":\"PluginCore\",\"defaultBranch\":\"release/9.0\",\"active\":true}]",
        "GHE_ENABLE_CACHE": "true",
        "GHE_CACHE_TTL": "300",
        "GHE_ENABLE_WRITE": "false",
        "GHE_ENABLE_CREATE": "false"
      }
    }
  }
}
```

Reload VS Code window after saving.

**Note:** Omit credentials for integrations you don't need. See [SETUP.md](SETUP.md) for complete configuration options.

## Available Tools

### PowerPlatform/Dataverse (75 tools)

**Entity & Data (Read - 7 tools):**
- `get-entity-metadata` - Get entity metadata
- `get-entity-attributes` - Get entity fields/attributes
- `get-entity-attribute` - Get specific attribute details
- `get-entity-relationships` - Get entity relationships
- `get-global-option-set` - Get option set definitions
- `get-record` - Get a specific record
- `query-records` - Query records with OData filters

**Data CRUD Operations (Write - 3 tools) - Requires respective feature flags:**
- `create-record` - Create new record (requires POWERPLATFORM_ENABLE_CREATE=true)
- `update-record` - Update existing record (requires POWERPLATFORM_ENABLE_UPDATE=true)
- `delete-record` - Delete record permanently (requires POWERPLATFORM_ENABLE_DELETE=true and confirmation)

**Entity Management (Write - 8 tools) - Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true:**
- `create-entity` - Create new custom entity (table)
- `update-entity` - Update entity metadata
- `update-entity-icon` - Set entity icon using Fluent UI System Icons
- `delete-entity` - Delete custom entity
- `create-attribute` - Create new attribute (column) - supports all 11 user-creatable types
- `update-attribute` - Update attribute metadata
- `delete-attribute` - Delete attribute
- `create-global-optionset-attribute` - Create attribute using global option set

**Relationships (Write - 4 tools) - Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true:**
- `create-one-to-many-relationship` - Create 1:N relationship
- `create-many-to-many-relationship` - Create N:N relationship
- `update-relationship` - Update relationship metadata
- `delete-relationship` - Delete relationship

**Global Option Sets (Write - 5 tools) - Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true:**
- `update-global-optionset` - Update option set metadata
- `add-optionset-value` - Add new value to option set
- `update-optionset-value` - Update existing value
- `delete-optionset-value` - Delete value
- `reorder-optionset-values` - Reorder values

**Forms (Write - 6 tools) - Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true:**
- `create-form` - Create new form (Main, QuickCreate, QuickView, Card)
- `update-form` - Update form XML and metadata
- `delete-form` - Delete form
- `activate-form` - Activate form
- `deactivate-form` - Deactivate form
- `get-forms` - Get all forms for entity

**Views (Write - 6 tools) - Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true:**
- `create-view` - Create new view with FetchXML
- `update-view` - Update view query and layout
- `delete-view` - Delete view
- `set-default-view` - Set view as default
- `get-view-fetchxml` - Get view FetchXML
- `get-views` - Get all views for entity

**Business Rules (Read-only - 2 tools):**
- `get-business-rules` - List all business rules (for troubleshooting)
- `get-business-rule` - Get business rule definition (for troubleshooting)

**Web Resources (Write - 6 tools) - Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true:**
- `create-web-resource` - Create web resource (JS, CSS, HTML, images)
- `update-web-resource` - Update web resource content
- `delete-web-resource` - Delete web resource
- `get-web-resource` - Get web resource by ID
- `get-web-resources` - Get web resources by name pattern
- `get-webresource-dependencies` - Get web resource dependencies

**Solution Management (Write - 7 tools) - Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true:**
- `create-publisher` - Create new solution publisher
- `get-publishers` - Get all publishers
- `create-solution` - Create new solution
- `add-solution-component` - Add component to solution
- `remove-solution-component` - Remove component from solution
- `export-solution` - Export solution (managed/unmanaged)
- `import-solution` - Import solution from base64 zip

**Publishing & Validation (Write - 8 tools) - Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true:**
- `publish-customizations` - Publish all pending customizations
- `publish-entity` - Publish specific entity
- `check-dependencies` - Check component dependencies
- `check-entity-dependencies` - Check entity dependencies
- `check-delete-eligibility` - Check if component can be deleted
- `get-entity-customization-info` - Check if entity is customizable
- `validate-schema-name` - Validate schema name against rules
- `preview-unpublished-changes` - Preview unpublished customizations
- `validate-solution-integrity` - Validate solution for missing dependencies

**Plugins (Read - 4 tools):**
- `get-plugin-assemblies` - List plugin assemblies
- `get-plugin-assembly-complete` - Full assembly details with validation
- `get-entity-plugin-pipeline` - Plugin execution order for entity
- `get-plugin-trace-logs` - Query plugin execution logs

**Workflows & Flows (Read - 5 tools):**
- `get-flows` - List Power Automate flows
- `get-flow-definition` - Get flow definition and logic
- `get-flow-runs` - Get flow run history
- `get-workflows` - List classic workflows
- `get-workflow-definition` - Get workflow definition

### Azure DevOps (13 tools)

**Wikis:**
- `get-wikis` - List wikis in project
- `search-wiki-pages` - Full-text search across wikis
- `get-wiki-page` - Get wiki page content
- `create-wiki-page` - Create new wiki page (requires write permission)
- `update-wiki-page` - Update wiki page (requires write permission)
- `azuredevops-str-replace-wiki-page` - Replace string in wiki page efficiently (requires write permission)

**Work Items:**
- `get-work-item` - Get work item by ID
- `query-work-items` - Execute WIQL queries
- `get-work-item-comments` - Get work item comments
- `add-work-item-comment` - Add comment (requires write permission)
- `update-work-item` - Update work item fields (requires write permission)
- `create-work-item` - Create new work item (requires write permission)
- `delete-work-item` - Delete work item (requires delete permission)

### Figma (2 tools)

- `get-figma-data` - Get design data (layout, text, styles, components)
- `download-figma-images` - Download images (coming in v2)

### Application Insights (10 tools)

- `appinsights-list-resources` - List all configured Application Insights resources
- `appinsights-get-metadata` - Get schema metadata (tables and columns)
- `appinsights-execute-query` - Execute custom KQL queries
- `appinsights-get-exceptions` - Get recent exceptions with details
- `appinsights-get-slow-requests` - Get slow HTTP requests (configurable threshold)
- `appinsights-get-operation-performance` - Get operation performance summary (count, avg, percentiles)
- `appinsights-get-failed-dependencies` - Get failed external API/database calls
- `appinsights-get-traces` - Get diagnostic traces filtered by severity
- `appinsights-get-availability` - Get availability test results and uptime stats
- `appinsights-get-custom-events` - Get custom application events

### Log Analytics (10 tools)

- `loganalytics-list-workspaces` - List all configured Log Analytics workspaces
- `loganalytics-get-metadata` - Get workspace schema (tables and columns)
- `loganalytics-execute-query` - Execute custom KQL queries
- `loganalytics-get-function-logs` - Get Azure Function logs with filtering
- `loganalytics-get-function-errors` - Get function error logs with exception details
- `loganalytics-get-function-stats` - Get execution statistics (count, success rate)
- `loganalytics-get-function-invocations` - Get function invocation records
- `loganalytics-get-recent-events` - Get recent events from any table
- `loganalytics-search-logs` - Search logs across tables
- `loganalytics-test-workspace-access` - Validate workspace access

### Azure SQL Database (9 tools)

- `sql-test-connection` - Test database connectivity
- `sql-list-tables` - List all tables with row counts and sizes
- `sql-list-views` - List all views
- `sql-list-stored-procedures` - List all stored procedures
- `sql-list-triggers` - List all triggers
- `sql-list-functions` - List all user-defined functions
- `sql-get-table-schema` - Get complete table schema (columns, indexes, FKs)
- `sql-get-object-definition` - Get SQL definition for views, procedures, functions, triggers
- `sql-execute-query` - Execute SELECT queries safely with validation

### GitHub Enterprise (22 tools)

**Repository & Branch Management:**
- `ghe-list-repos` - List all configured repositories
- `ghe-list-branches` - List all branches for a repository
- `ghe-get-default-branch` - Auto-detect default branch with typo handling
- `ghe-get-branch-details` - Get detailed branch information
- `ghe-compare-branches` - Compare two branches and show differences
- `ghe-search-repos` - Search repositories by name or description

**File Operations:**
- `ghe-get-file` - Get file content from a specific branch
- `ghe-search-code` - Search code across repositories
- `ghe-list-files` - List files in a directory
- `ghe-get-directory-structure` - Get recursive directory tree structure
- `ghe-get-file-history` - Get commit history for a specific file

**Commit & History:**
- `ghe-get-commits` - Get commit history for a branch
- `ghe-get-commit-details` - Get detailed information about a specific commit
- `ghe-search-commits` - Search commits by message or hash (supports #1234 work item refs)
- `ghe-get-commit-diff` - Get detailed diff for a commit

**Pull Requests:**
- `ghe-list-pull-requests` - List pull requests for a repository
- `ghe-get-pull-request` - Get detailed pull request information
- `ghe-get-pr-files` - Get files changed in a pull request

**Write Operations (disabled by default):**
- `ghe-create-branch` - Create a new branch (requires GHE_ENABLE_CREATE=true)
- `ghe-update-file` - Update file content (requires GHE_ENABLE_WRITE=true)
- `ghe-create-file` - Create a new file (requires GHE_ENABLE_CREATE=true)

**Cache Management:**
- `ghe-clear-cache` - Clear cached GitHub API responses

## Available Prompts

The server includes **28 prompts** that provide formatted, context-rich output:

**PowerPlatform:**
- `entity-overview` - Comprehensive entity overview
- `attribute-details` - Detailed attribute information
- `query-template` - OData query examples
- `relationship-map` - Visual relationship mapping
- `plugin-deployment-report` - Plugin validation for PR reviews
- `entity-plugin-pipeline-report` - Visual plugin execution pipeline
- `flows-report` - Power Automate flows report
- `workflows-report` - Classic workflows report
- `business-rules-report` - Business rules report (read-only)

**Azure DevOps:**
- `wiki-search-results` - Formatted wiki search results
- `wiki-page-content` - Formatted wiki page with navigation
- `work-item-summary` - Comprehensive work item summary
- `work-items-query-report` - Formatted WIQL query results

**Application Insights:**
- `appinsights-exception-summary` - Exception summary report with insights
- `appinsights-performance-report` - Performance analysis with recommendations
- `appinsights-dependency-health` - Dependency health report with success rates
- `appinsights-availability-report` - Availability and uptime report
- `appinsights-troubleshooting-guide` - Comprehensive troubleshooting guide combining all telemetry

**Log Analytics:**
- `loganalytics-workspace-summary` - Workspace health overview with all functions
- `loganalytics-function-troubleshooting` - Comprehensive function troubleshooting report
- `loganalytics-function-performance-report` - Performance analysis with recommendations
- `loganalytics-logs-report` - Formatted logs with insights for any table

**Azure SQL Database:**
- `sql-database-overview` - Comprehensive database schema overview with all objects
- `sql-table-details` - Detailed table report with columns, indexes, and relationships
- `sql-query-results` - Formatted query results with column headers

**GitHub Enterprise:**
- `ghe-repo-overview` - Repository overview with branch analysis and recent commits
- `ghe-code-search-report` - Formatted code search results with relevance scoring
- `ghe-branch-comparison-report` - Branch comparison with deployment checklist
- `ghe-troubleshooting-guide` - Bug troubleshooting with cross-service correlation (ADO + GHE + PowerPlatform)
- `ghe-deployment-report` - Deployment-ready report with rollback plan

## Documentation

### Per-Integration Documentation

Comprehensive documentation for each integration with setup, tools, prompts, examples, best practices, and troubleshooting:

- **[PowerPlatform/Dataverse](docs/documentation/POWERPLATFORM.md)** - 76 tools, 9 prompts (entity metadata, plugins, workflows, customization API)
- **[Azure DevOps](docs/documentation/AZURE_DEVOPS.md)** - 13 tools, 4 prompts (wikis, work items, WIQL queries)
- **[Figma](docs/documentation/FIGMA.md)** - 2 tools (design data extraction, AI-friendly format)
- **[Application Insights](docs/documentation/APPLICATION_INSIGHTS.md)** - 10 tools, 5 prompts (telemetry, exceptions, performance, dependencies)
- **[Log Analytics](docs/documentation/LOG_ANALYTICS.md)** - 10 tools, 5 prompts (Azure Functions logs, KQL queries, function diagnostics)
- **[Azure SQL Database](docs/documentation/AZURE_SQL.md)** - 9 tools, 3 prompts (schema exploration, read-only querying)
- **[GitHub Enterprise](docs/documentation/GITHUB_ENTERPRISE.md)** - 22 tools, 5 prompts (source code, commits, branches, PRs, code correlation)

### General Documentation

- **[SETUP.md](SETUP.md)** - Complete setup guide with credentials, troubleshooting, and security
- **[TOOLS.md](TOOLS.md)** - Full reference for all 138 tools and 28 prompts
- **[USAGE.md](USAGE.md)** - Examples and use cases for all integrations
- **[CLAUDE.md](CLAUDE.md)** - Architecture details and development guide

## Key Features

### PowerPlatform Plugin Validation

Automatically validate plugin deployments for PR reviews:

```javascript
// Get complete validation report
await mcpClient.callPrompt("plugin-deployment-report", {
  assemblyName: "MyCompany.Plugins"
});
```

Returns:
- Assembly information
- All registered steps
- **Automatic validation warnings** for missing filtering attributes, images, disabled steps

### Azure DevOps Integration

Search documentation and manage work items:

```javascript
// Search wiki
await mcpClient.callPrompt("wiki-search-results", {
  searchText: "authentication",
  project: "MyProject"
});

// Query work items
await mcpClient.callPrompt("work-items-query-report", {
  project: "MyProject",
  wiql: "SELECT * FROM WorkItems WHERE [State] = 'Active' AND [Assigned To] = @me"
});
```

### Figma Design Extraction

Extract design specifications in AI-friendly format:

```javascript
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  depth: 3  // Limit depth for large files
});
```

Returns simplified JSON with:
- Layout properties
- Text and typography
- Colors, fills, strokes
- Component definitions
- Deduplicated styles

## Security & Permissions

All integrations are optional and can be configured independently:

**PowerPlatform:**
- Requires Azure AD app registration
- Uses OAuth authentication with automatic token refresh
- **Customization tools** (optional, opt-in):
  - Set `POWERPLATFORM_ENABLE_CUSTOMIZATION=true` to enable write operations
  - Create entities, attributes, and publish customizations
  - Specify `POWERPLATFORM_DEFAULT_SOLUTION` to auto-add customizations to a solution
  - **WARNING:** These tools make permanent changes to your CRM environment. Use with caution.

**Azure DevOps:**
- Requires Personal Access Token (PAT)
- Write operations disabled by default (enable with environment variables)
- Project access controlled via `AZUREDEVOPS_PROJECTS`

**Figma:**
- Requires Personal Access Token or OAuth
- Read-only access to design files

**Azure SQL Database:**
- Supports SQL Authentication or Azure AD authentication
- **Read-only access by design** - only SELECT queries permitted
- Safety mechanisms:
  - Query validation blocks INSERT, UPDATE, DELETE, DROP, EXEC, and other write operations
  - 10MB response size limit to prevent memory exhaustion
  - 1000 row result limit (configurable)
  - 30-second query timeout protection
  - Connection pooling with health checks (max 10 connections)
  - Credential sanitization in error messages
  - Audit logging for all user queries
- Recommended database permissions:
  ```sql
  ALTER ROLE db_datareader ADD MEMBER [mcp_readonly];
  GRANT VIEW DEFINITION TO [mcp_readonly];
  ```

**Application Insights:**
- Supports Entra ID (OAuth) or API Key authentication
- Read-only access to telemetry data
- Entra ID recommended for production (higher rate limits)

**Log Analytics:**
- Supports Entra ID (OAuth) or API Key authentication
- Read-only access to workspace logs
- Can share credentials with Application Insights (automatic fallback)
- Entra ID recommended for production (higher rate limits)

**GitHub Enterprise:**
- Supports Personal Access Token (PAT) or GitHub App authentication
- PAT authentication is simpler (recommended for individual use)
- GitHub App authentication for organization-wide deployments (higher rate limits)
- Write operations disabled by default (enable with environment flags)
- Response caching with configurable TTL (default: 5 minutes)
- Required scopes for PAT: `repo` (required), `read:org` (optional)

See [SETUP.md](SETUP.md#security-best-practices) for security best practices.

## Examples

### Ask about PowerPlatform entities

```
User: "Tell me about the Account entity"
AI: [uses entity-overview prompt]
Returns comprehensive overview with key fields and relationships
```

### Build OData queries

```
User: "Help me query active accounts with revenue over $1M"
AI: [uses query-template prompt]
Returns formatted OData query with filters
```

### Plugin PR reviews

```
User: "Validate the deployment of MyCompany.Plugins"
AI: [uses plugin-deployment-report prompt]
Returns validation report with warnings
```

### Search Azure DevOps wikis

```
User: "Search our wiki for OAuth documentation"
AI: [uses wiki-search-results prompt]
Returns formatted search results with snippets
```

### Investigate SQL Database schema

```
User: "Show me the database schema overview"
AI: [uses sql-database-overview prompt]
Returns formatted overview with tables, views, procedures, and statistics
```

```
User: "Query the Users table for active accounts"
AI: [uses sql-execute-query tool with "SELECT TOP 10 * FROM dbo.Users WHERE IsActive = 1"]
Returns formatted query results with column headers
```

### Troubleshoot bugs with GitHub Enterprise cross-service correlation

```
User: "Investigate bug reported in ADO work item #1234"
AI: [uses ghe-troubleshooting-guide prompt]
1. Gets work item details from Azure DevOps
2. Searches GitHub commits for "AB#1234" references
3. Retrieves changed code files
4. Checks deployed plugin assembly in PowerPlatform
5. Analyzes Application Insights exceptions
Returns comprehensive troubleshooting report with code changes, deployment status, and runtime errors
```

```
User: "Search GitHub for ContactPlugin implementation"
AI: [uses ghe-search-code tool]
Returns code search results with file paths and line numbers
```

```
User: "Compare release/9.0 and main branches"
AI: [uses ghe-branch-comparison-report prompt]
Returns formatted comparison with deployment checklist
```

See [USAGE.md](USAGE.md) for more examples.

## Development

### Local Development Setup

```bash
# Clone repository
git clone <repository-url>
cd mcp-consultant-tools

# Install dependencies
npm install

# Build
npm run build

# Run locally
node build/index.js
```

### Branch Strategy

- **`main`** - Production code (published to npm)
- **`release/*`** - Testing before merge to main
- **`feature/*`** - Active development

**Publishing workflow:**
1. Merge to `main`
2. `npm version patch|minor|major`
3. `npm publish`
4. `git push && git push --tags`

See [CLAUDE.md](CLAUDE.md) for detailed architecture and development guide.

## Updates

### Ensuring Latest Version

**Using npx (recommended):**

Always use `@latest` in your configuration:

```json
{
  "args": ["-y", "mcp-consultant-tools@latest"]
}
```

**Using global install:**

```bash
npm update -g mcp-consultant-tools
```

## License

MIT

## Support

- **Issues**: Report bugs or request features in the GitHub repository
- **Documentation**: See docs above for complete guides
- **Architecture**: See [CLAUDE.md](CLAUDE.md) for technical details
