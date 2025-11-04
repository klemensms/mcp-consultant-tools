# MCP Consultant Tools

A Model Context Protocol (MCP) server providing intelligent access to PowerPlatform/Dataverse, Azure DevOps, and Figma through an AI-friendly interface.

## Overview

This MCP server enables AI assistants to:
- **PowerPlatform/Dataverse**: Explore entity metadata, query records, inspect plugins, analyze workflows and flows
- **Azure DevOps**: Search wikis, manage work items, execute WIQL queries
- **Figma**: Extract design data in simplified, AI-friendly format

All integrations are **optional** - configure only the services you need.

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

        "AZUREDEVOPS_ORGANIZATION": "your-org",
        "AZUREDEVOPS_PAT": "your-pat",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false",

        "FIGMA_API_KEY": "your-figma-token",
        "FIGMA_OAUTH_TOKEN": "",
        "FIGMA_USE_OAUTH": "false"
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

        "AZUREDEVOPS_ORGANIZATION": "your-org",
        "AZUREDEVOPS_PAT": "your-pat",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false",

        "FIGMA_API_KEY": "your-figma-token",
        "FIGMA_OAUTH_TOKEN": "",
        "FIGMA_USE_OAUTH": "false"
      }
    }
  }
}
```

Reload VS Code window after saving.

**Note:** Omit credentials for integrations you don't need. See [SETUP.md](SETUP.md) for complete configuration options.

## Available Tools

### PowerPlatform/Dataverse (15 tools)

**Entity & Data:**
- `get-entity-metadata` - Get entity metadata
- `get-entity-attributes` - Get entity fields/attributes
- `get-entity-attribute` - Get specific attribute details
- `get-entity-relationships` - Get entity relationships
- `get-global-option-set` - Get option set definitions
- `get-record` - Get a specific record
- `query-records` - Query records with OData filters

**Plugins:**
- `get-plugin-assemblies` - List plugin assemblies
- `get-plugin-assembly-complete` - Full assembly details with validation
- `get-entity-plugin-pipeline` - Plugin execution order for entity
- `get-plugin-trace-logs` - Query plugin execution logs

**Workflows & Flows:**
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

## Available Prompts

The server includes **12 prompts** that provide formatted, context-rich output:

**PowerPlatform:**
- `entity-overview` - Comprehensive entity overview
- `attribute-details` - Detailed attribute information
- `query-template` - OData query examples
- `relationship-map` - Visual relationship mapping
- `plugin-deployment-report` - Plugin validation for PR reviews
- `entity-plugin-pipeline-report` - Visual plugin execution pipeline
- `flows-report` - Power Automate flows report
- `workflows-report` - Classic workflows report

**Azure DevOps:**
- `wiki-search-results` - Formatted wiki search results
- `wiki-page-content` - Formatted wiki page with navigation
- `work-item-summary` - Comprehensive work item summary
- `work-items-query-report` - Formatted WIQL query results

## Documentation

- **[SETUP.md](SETUP.md)** - Complete setup guide with credentials, troubleshooting, and security
- **[TOOLS.md](TOOLS.md)** - Full reference for all 30 tools and 12 prompts
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

**Azure DevOps:**
- Requires Personal Access Token (PAT)
- Write operations disabled by default (enable with environment variables)
- Project access controlled via `AZUREDEVOPS_PROJECTS`

**Figma:**
- Requires Personal Access Token or OAuth
- Read-only access to design files

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
