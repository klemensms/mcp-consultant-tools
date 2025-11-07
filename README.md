# MCP Consultant Tools

A Model Context Protocol (MCP) server providing intelligent access to PowerPlatform/Dataverse, Azure DevOps, Figma, Azure Application Insights, and Azure SQL Database through an AI-friendly interface.

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
- **Azure DevOps** (12 tools): Search wikis, manage work items, execute WIQL queries
- **Figma** (2 tools): Extract design data in simplified, AI-friendly format
- **Application Insights** (10 tools): Query telemetry, analyze exceptions, monitor performance, troubleshoot issues
- **Azure SQL Database** (9 tools): Explore database schema, query tables safely with read-only access, investigate database structure

All integrations are **optional** - configure only the services you need.

**Total: 105+ MCP tools & 21 prompts** providing comprehensive access to your development and operations lifecycle.

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

        "AZURE_SQL_SERVER": "yourserver.database.windows.net",
        "AZURE_SQL_DATABASE": "yourdatabase",
        "AZURE_SQL_USERNAME": "your-username",
        "AZURE_SQL_PASSWORD": "your-password",
        "AZURE_SQL_USE_AZURE_AD": "false"
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

        "AZURE_SQL_SERVER": "yourserver.database.windows.net",
        "AZURE_SQL_DATABASE": "yourdatabase",
        "AZURE_SQL_USERNAME": "your-username",
        "AZURE_SQL_PASSWORD": "your-password",
        "AZURE_SQL_USE_AZURE_AD": "false"
      }
    }
  }
}
```

Reload VS Code window after saving.

**Note:** Omit credentials for integrations you don't need. See [SETUP.md](SETUP.md) for complete configuration options.

## Available Tools

### PowerPlatform/Dataverse (72 tools)

**Entity & Data (Read - 7 tools):**
- `get-entity-metadata` - Get entity metadata
- `get-entity-attributes` - Get entity fields/attributes
- `get-entity-attribute` - Get specific attribute details
- `get-entity-relationships` - Get entity relationships
- `get-global-option-set` - Get option set definitions
- `get-record` - Get a specific record
- `query-records` - Query records with OData filters

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

### Azure DevOps (12 tools)

**Wikis:**
- `get-wikis` - List wikis in project
- `search-wiki-pages` - Full-text search across wikis
- `get-wiki-page` - Get wiki page content
- `create-wiki-page` - Create new wiki page (requires write permission)
- `update-wiki-page` - Update wiki page (requires write permission)

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

## Available Prompts

The server includes **18 prompts** that provide formatted, context-rich output:

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

**Azure SQL Database:**
- `sql-database-overview` - Comprehensive database schema overview with all objects
- `sql-table-details` - Detailed table report with columns, indexes, and relationships
- `sql-query-results` - Formatted query results with column headers

## Documentation

- **[SETUP.md](SETUP.md)** - Complete setup guide with credentials, troubleshooting, and security
- **[TOOLS.md](TOOLS.md)** - Full reference for all 105+ tools and 21 prompts
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
