# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides intelligent access to Microsoft PowerPlatform/Dataverse entities, Azure DevOps wikis/work items, Figma designs, Azure Application Insights telemetry, Log Analytics workspaces, Azure SQL databases, and GitHub Enterprise repositories through an MCP-compatible interface. It enables AI assistants to explore entity metadata, query records, inspect plugin configurations, analyze workflows, search documentation, manage work items, extract design data, troubleshoot application issues using telemetry data, query databases, and correlate source code changes across the development and operations lifecycle.

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

## Monorepo Architecture (v15)

### Overview

**v15.0.0** introduced a modular monorepo architecture with 11 independently published packages:

```
mcp-consultant-tools/
├── packages/
│   ├── core/                  # Shared utilities, MCP helpers, audit logging
│   ├── powerplatform/         # PowerPlatform/Dataverse (65 tools, 12 prompts)
│   ├── azure-devops/          # Azure DevOps (18 tools, 6 prompts)
│   ├── figma/                 # Figma (2 tools, 0 prompts)
│   ├── application-insights/  # Application Insights (10 tools, 5 prompts)
│   ├── log-analytics/         # Log Analytics (10 tools, 5 prompts)
│   ├── azure-sql/             # Azure SQL Database (11 tools, 3 prompts)
│   ├── service-bus/           # Azure Service Bus (8 tools, 5 prompts)
│   ├── sharepoint/            # SharePoint Online (15 tools, 5 prompts)
│   ├── github-enterprise/     # GitHub Enterprise (22 tools, 5 prompts)
│   └── meta/                  # Complete package (all integrations)
├── package.json               # Workspace root
└── tsconfig.base.json         # Shared TypeScript config
```

### npm Workspaces Configuration

The monorepo uses npm workspaces for dependency management:

**Root package.json:**
```json
{
  "name": "mcp-consultant-tools-monorepo",
  "version": "15.0.0",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "clean": "npm run clean --workspaces --if-present"
  }
}
```

**Benefits:**
- Single `node_modules/` at root
- Shared dependencies across packages
- Simplified dependency management
- Fast `npm install` with package linking

### TypeScript Project References

The monorepo uses TypeScript composite builds for incremental compilation:

**tsconfig.base.json** (shared configuration):
```json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

**Package-level tsconfig.json** (example: powerplatform):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./build",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"],
  "references": [
    { "path": "../core" }
  ]
}
```

**Meta-package tsconfig.json** (aggregates all):
```json
{
  "extends": "../../tsconfig.base.json",
  "references": [
    { "path": "../core" },
    { "path": "../application-insights" },
    { "path": "../azure-devops" },
    { "path": "../azure-sql" },
    { "path": "../figma" },
    { "path": "../github-enterprise" },
    { "path": "../log-analytics" },
    { "path": "../powerplatform" },
    { "path": "../service-bus" },
    { "path": "../sharepoint" }
  ]
}
```

**Benefits:**
- Incremental builds (only changed packages rebuild)
- Type-checking across package boundaries
- Faster development iteration
- Clear dependency graph

### Package Structure Pattern

Each service package follows a consistent structure:

```
packages/{service}/
├── src/
│   ├── index.ts              # Entry point + registerXxxTools()
│   ├── {Service}Service.ts   # Service implementation
│   ├── types/                # TypeScript types
│   └── utils/                # Service-specific utilities
├── build/                    # Compiled output (gitignored)
├── package.json              # Package metadata + dependencies
├── tsconfig.json             # TypeScript configuration
└── README.md                 # Package documentation
```

**Example: packages/powerplatform/src/index.ts**
```typescript
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { PowerPlatformService } from "./PowerPlatformService.js";

/**
 * Register all PowerPlatform tools with an MCP server
 * @param server - MCP server instance
 * @param service - Optional pre-initialized PowerPlatformService (for testing)
 */
export function registerPowerPlatformTools(server: any, service?: PowerPlatformService) {
  // TODO: Register 65 tools + 12 prompts
  // Tool extraction from main index.ts pending (incremental approach)
  console.error("PowerPlatform tools registered (tool extraction pending)");
}

// CLI entry point (standalone execution)
if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv(); // Suppresses dotenv stdout for MCP protocol compliance

  const server = createMcpServer({
    name: "mcp-powerplatform",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });

  registerPowerPlatformTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start PowerPlatform MCP server:", error);
    process.exit(1);
  });

  console.error("PowerPlatform MCP server running");
}
```

### Dual-Export Pattern

Every service package exports:

1. **`registerXxxTools(server, service?)`** - Function for composable registration
2. **Standalone CLI** - Direct execution via `npx @mcp-consultant-tools/{service}`

**Usage patterns:**

**Pattern 1: Complete package (meta)**
```typescript
import { registerAllTools } from 'mcp-consultant-tools';
const server = createMcpServer({...});
registerAllTools(server); // Registers all 172 tools + 47 prompts
```

**Pattern 2: Individual packages**
```typescript
import { registerPowerPlatformTools } from '@mcp-consultant-tools/powerplatform';
import { registerAzureDevOpsTools } from '@mcp-consultant-tools/azure-devops';
const server = createMcpServer({...});
registerPowerPlatformTools(server); // 65 tools + 12 prompts
registerAzureDevOpsTools(server);   // 18 tools + 6 prompts
```

**Pattern 3: Direct service access**
```typescript
import { PowerPlatformService } from '@mcp-consultant-tools/powerplatform';
const service = new PowerPlatformService({...});
const entities = await service.getEntityMetadata('account');
```

### Core Package (@mcp-consultant-tools/core)

The core package provides shared utilities for all service packages:

**Exports:**
- `createMcpServer(config)` - Create configured MCP server
- `createEnvLoader()` - Environment loader with stdout suppression
- `auditLogger` - Centralized audit logging utility

**Key implementation: createEnvLoader()**
```typescript
export function createEnvLoader() {
  return () => {
    // CRITICAL: Suppress stdout during dotenv loading
    // MCP protocol requires clean JSON-only stdout
    const originalWrite = process.stdout.write;
    process.stdout.write = () => true;

    dotenv.config();

    process.stdout.write = originalWrite;
  };
}
```

**Why stdout suppression matters:**
- MCP uses stdio transport (JSON-RPC over stdin/stdout)
- dotenv writes "Using .env file" to stdout
- Any non-JSON stdout corrupts MCP protocol
- All services must use `createEnvLoader()` for MCP compliance

**Audit logger usage:**
```typescript
import { auditLogger } from '@mcp-consultant-tools/core';

auditLogger.log({
  operation: 'get-entity-metadata',
  operationType: 'READ',
  resourceId: 'account',
  componentType: 'Entity',
  success: true,
  parameters: { entityName: 'account' },
  executionTimeMs: 156
});
```

### Package Dependencies

**Dependency order for publishing:**
```
1. core (no dependencies)
2. service packages (depend on core)
   - application-insights
   - azure-devops
   - azure-sql
   - figma
   - github-enterprise
   - log-analytics
   - powerplatform
   - service-bus
   - sharepoint
3. meta (depends on all services + core)
```

**Example: packages/powerplatform/package.json**
```json
{
  "name": "@mcp-consultant-tools/powerplatform",
  "version": "1.0.0",
  "dependencies": {
    "@azure/msal-node": "^3.3.0",
    "@mcp-consultant-tools/core": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.0.4",
    "axios": "^1.8.3",
    "zod": "^3.24.1"
  }
}
```

**Note:** Each service package includes only the dependencies it needs, not all dependencies from the monolithic v14 package.

### Build Process

**Build all packages:**
```bash
npm run build
# Runs: npm run build --workspaces --if-present
# Output: packages/*/build/ directories
```

**Build individual package:**
```bash
cd packages/powerplatform
npm run build
# Output: packages/powerplatform/build/
```

**TypeScript build order:**
- TypeScript automatically follows project references
- Builds core first, then service packages, then meta
- Incremental builds only recompile changed packages

**Build output verification:**
```bash
# Check all build outputs
find packages -name 'build' -type d -exec ls -lh {} \;

# Verify TypeScript declarations generated
find packages -name '*.d.ts' | head -10
```

### Publishing Workflow

**Publishing to npm (automated):**

```bash
# 1. Publish core package first
cd packages/core
npm version patch
npm publish --access public

# 2. Publish service packages (parallel)
for pkg in application-insights azure-devops azure-sql figma github-enterprise log-analytics powerplatform service-bus sharepoint; do
  cd packages/$pkg
  npm version patch
  npm publish --access public
done

# 3. Publish meta-package last
cd packages/meta
npm version patch
npm publish --access public
```

**Version bumping strategy:**
- Core package: Bump when shared utilities change
- Service packages: Independent versioning per service
- Meta-package: Tracks overall release version (v15.0.0, v15.1.0, etc.)

**Publishing script (scripts/publish-all.sh):**
```bash
#!/bin/bash
set -e

# Publish in dependency order
packages=(
  "core"
  "application-insights"
  "azure-devops"
  "azure-sql"
  "figma"
  "github-enterprise"
  "log-analytics"
  "powerplatform"
  "service-bus"
  "sharepoint"
  "meta"
)

for pkg in "${packages[@]}"; do
  echo "Publishing @mcp-consultant-tools/$pkg..."
  cd packages/$pkg
  npm publish --access public
  cd ../..
done

echo "All packages published successfully!"
```

### Development Workflow

**Initial setup:**
```bash
git clone https://github.com/klemensms/mcp-consultant-tools.git
cd mcp-consultant-tools
npm install  # Installs all workspace dependencies
npm run build  # Builds all packages
```

**Working on a single service:**
```bash
cd packages/powerplatform
npm run build  # Build only this package
npm run clean  # Clean build outputs
```

**Adding a dependency to a service:**
```bash
cd packages/powerplatform
npm install axios  # Adds to powerplatform package only
cd ../..
npm install  # Update root lockfile
```

**Testing a service locally:**
```bash
cd packages/powerplatform
npm run build
node build/index.js  # Run standalone MCP server
```

**Testing complete package locally:**
```bash
cd packages/meta
npm run build
node build/index.js  # Runs aggregated server
```

### Migration from v14

**v14 (monolithic):**
- Single package: `mcp-consultant-tools`
- 28,755 LOC in single codebase
- All dependencies bundled
- Tool registrations in single `src/index.ts`

**v15 (modular):**
- 11 packages: 1 core + 9 services + 1 meta
- Code split into packages
- Dependencies per service
- Tool registrations in service packages (pending extraction)

**Import path changes:**
```typescript
// v14
import { PowerPlatformService } from 'mcp-consultant-tools';

// v15
import { PowerPlatformService } from '@mcp-consultant-tools/powerplatform';
```

**Configuration changes:**
- None! Environment variables remain identical
- Tool names remain identical
- Prompt names remain identical
- Full backward compatibility via meta-package

See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for complete migration instructions.

### Incremental Tool Extraction Strategy

**Current state (Phase 5 complete):**
- ✅ All 11 packages created and building
- ✅ All service files moved to packages
- ✅ All dependencies resolved
- ⏳ Tool registrations stubbed (extraction pending)

**Main index.ts analysis:**
- 11,887 total lines
- Lines 2524-11012: Tool registrations (~8,500 lines)
- 172 tools + 47 prompts to extract

**Extraction approach (deferred to post-publishing):**

Instead of extracting all tools before v15 publishing, we use a phased approach:

**Phase 1 (Completed): Infrastructure**
- Create all 11 packages
- Move service implementations
- Set up TypeScript project references
- Establish build process

**Phase 2 (Current): Documentation & Publishing**
- Update documentation (README, CLAUDE.md, MIGRATION_GUIDE)
- Create CI/CD workflows
- Publish packages to npm with stub implementations

**Phase 3 (Post-publishing): Incremental Tool Extraction**
- Extract tools one service at a time
- Verify each service's tools work correctly
- Publish patch releases for each service
- Meta-package auto-updates via dependency ranges

**Rationale:**
- Enables publishing v15 architecture immediately
- Tools continue working via main index.ts (v14 compatibility)
- Gradual migration reduces risk
- Each service can be tested independently

**Example: Extracting PowerPlatform tools**
```typescript
// Before (stub in packages/powerplatform/src/index.ts)
export function registerPowerPlatformTools(server: any) {
  console.error("PowerPlatform tools registered (tool extraction pending)");
}

// After (extracted from main index.ts)
export function registerPowerPlatformTools(server: any, service?: PowerPlatformService) {
  let ppService: PowerPlatformService | null = service || null;

  function getService(): PowerPlatformService {
    if (!ppService) {
      ppService = new PowerPlatformService({...});
    }
    return ppService;
  }

  // Tool: get-entity-metadata
  server.tool(
    "get-entity-metadata",
    "Get comprehensive metadata for a PowerPlatform entity",
    {
      entityName: z.string().describe("Entity logical name")
    },
    async ({ entityName }: { entityName: string }) => {
      const service = getService();
      const metadata = await service.getEntityMetadata(entityName);
      return { content: [{ type: "text", text: JSON.stringify(metadata, null, 2) }] };
    }
  );

  // ... 64 more tools + 12 prompts
}
```

## Documentation Structure

### ⚠️ CRITICAL: DOCUMENTATION IS MANDATORY FOR ALL NEW FEATURES ⚠️

This project uses a **streamlined documentation approach**:

### Documentation Files

1. **[README.md](README.md)** - Brief project overview
   - Quick start guide
   - Tool/prompt counts
   - Basic configuration example
   - Links to detailed integration docs

2. **[CLAUDE.md](CLAUDE.md)** (this file) - Development guidance
   - Architecture overview
   - Design patterns and best practices
   - MCP protocol requirements
   - Build and development commands

3. **Integration-Specific Documentation** - `docs/documentation/{integration}/`
   - Each integration has its own comprehensive documentation folder
   - Contains: setup guide, tool reference, usage examples, troubleshooting
   - Examples:
     - `docs/documentation/powerplatform/`
     - `docs/documentation/azure-devops/`
     - `docs/documentation/sharepoint/`
     - etc.

### Adding a New Integration

When adding a new integration (e.g., SharePoint Online):

1. ✅ Write the code (service, tools, prompts)
2. ✅ Update package.json (dependencies, description, keywords)
3. ✅ Update .env.example (configuration variables)
4. ✅ **Update README.md** (add to overview, update tool counts)
5. ✅ **Create `docs/documentation/{integration}/` folder** with:
   - `setup.md` - Detailed setup instructions, credentials, permissions
   - `tools.md` - Complete tool and prompt reference
   - `usage.md` - Real-world examples and workflows
   - `troubleshooting.md` - Common issues and solutions
6. ✅ **Update CLAUDE.md** - Add architecture section for the service

**Implementation is NOT complete until all documentation is created.**

### ⚠️ CRITICAL: Adding Features to Existing Integrations ⚠️

When adding new features to an **existing** integration (e.g., adding CRUD operations to PowerPlatform):

**MANDATORY CHECKLIST - ALL STEPS REQUIRED:**

1. ✅ **Write the code**
   - Service methods in the service file (e.g., [src/PowerPlatformService.ts](src/PowerPlatformService.ts))
   - Tool registrations in [src/index.ts](src/index.ts)
   - Environment variables and permission helpers in [src/index.ts](src/index.ts)

2. ✅ **Update [.env.example](.env.example)**
   - Add new environment variables with clear descriptions
   - Include security warnings for dangerous operations

3. ✅ **Update [README.md](README.md)**
   - Update tool/prompt counts in the overview
   - Add new configuration examples
   - Update feature lists

4. ✅ **Update [CLAUDE.md](CLAUDE.md)** (this file)
   - Add technical documentation to the relevant architecture section
   - Include code examples and design patterns
   - Document security considerations

5. ✅ **⚠️ MOST COMMONLY FORGOTTEN: Update `docs/documentation/{integration}.md`**
   - **This is the user-facing documentation that users actually read**
   - Update tool counts in table of contents
   - Add new environment variables to configuration section
   - Add comprehensive tool documentation with examples
   - Include security warnings and use cases
   - **DO NOT skip this step - it is CRITICAL for users**

**Why this matters:**
- `docs/documentation/` contains the **primary user-facing documentation**
- Users rely on these files to understand how to use the tools
- Missing documentation leads to confusion and support issues
- This is the **most commonly forgotten step** in the implementation process

**Verification:**
Before considering implementation complete, verify that ALL five documentation files have been updated:
- [ ] Service code updated
- [ ] .env.example updated
- [ ] README.md updated
- [ ] CLAUDE.md updated
- [ ] **docs/documentation/{integration}.md updated** ← Check this twice!

## Architecture

### Two-Layer Architecture

1. **MCP Server Layer** ([src/index.ts](src/index.ts))
   - Initializes the MCP server using `@modelcontextprotocol/sdk`
   - Registers 161 tools and 43 prompts across PowerPlatform, Azure DevOps, Figma, Application Insights, Log Analytics, Azure SQL Database, Azure Service Bus, SharePoint Online, and GitHub Enterprise integrations
   - Handles environment configuration and lazy-initialization of services (PowerPlatformService, AzureDevOpsService, FigmaService, ApplicationInsightsService, LogAnalyticsService, AzureSqlService, ServiceBusService, SharePointService, GitHubEnterpriseService)
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

   - **ApplicationInsightsService** ([src/ApplicationInsightsService.ts](src/ApplicationInsightsService.ts))
     - Manages authentication using Entra ID (OAuth 2.0) or API Keys
     - Executes KQL queries via Application Insights Query API
     - Provides helper methods for common troubleshooting scenarios (exceptions, performance, dependencies)
     - Supports multiple Application Insights resources with active/inactive flags

   - **LogAnalyticsService** ([src/LogAnalyticsService.ts](src/LogAnalyticsService.ts))
     - Manages authentication using Entra ID (OAuth 2.0) or API Keys
     - Executes KQL queries via Log Analytics Query API
     - Provides helper methods for Azure Functions troubleshooting (logs, errors, stats, invocations)
     - Supports multiple Log Analytics workspaces with active/inactive flags
     - Implements shared credential fallback to Application Insights credentials

   - **AzureSqlService** ([src/AzureSqlService.ts](src/AzureSqlService.ts))
     - Manages database connections with connection pooling
     - Provides read-only SQL query execution with comprehensive security controls
     - Implements query validation and safety mechanisms
     - Supports SQL Authentication and Azure AD Authentication

   - **ServiceBusService** ([src/ServiceBusService.ts](src/ServiceBusService.ts))
     - Manages authentication using Entra ID (OAuth 2.0) or Connection String
     - Provides read-only message inspection (peek only, no receive/delete)
     - Implements dual client architecture (ServiceBusClient + ServiceBusAdministrationClient)
     - Supports queue health monitoring and dead letter queue analysis
     - Supports multiple Service Bus namespaces with active/inactive flags

   - **SharePointService** ([src/SharePointService.ts](src/SharePointService.ts))
     - Manages authentication using Entra ID (OAuth 2.0) via Microsoft Graph API
     - Provides access to SharePoint sites, document libraries, and files
     - Implements PowerPlatform validation methods (document location validation, migration verification)
     - Supports multiple SharePoint sites with active/inactive flags
     - Implements caching with configurable TTL (5-minute default)

### Key Design Patterns

- **Lazy Initialization**: All services (PowerPlatform, AzureDevOps, Figma, ApplicationInsights, LogAnalytics, AzureSql, ServiceBus, SharePoint, GitHubEnterprise) are created on-demand only when their respective tools/prompts are first invoked
- **Token Caching**: Access tokens are cached and reused until near expiration to minimize authentication calls
- **Prompt Templates**: Pre-defined prompt templates with placeholder replacement for consistent, formatted responses
- **Dual Interface**: Functionality exposed both as MCP tools (for raw data) and prompts (for formatted, context-rich output)
- **Stdout Suppression for dotenv**: The server temporarily suppresses stdout during dotenv initialization to prevent non-JSON output from corrupting the MCP JSON protocol (which requires clean JSON-only stdout)
- **Optional Integrations**: All integrations are optional - users can configure any combination of PowerPlatform, Azure DevOps, Figma, Application Insights, Log Analytics, Azure SQL Database, Azure Service Bus, SharePoint Online, and GitHub Enterprise
- **Shared Credentials**: Log Analytics can automatically reuse Application Insights credentials, reducing configuration complexity
- **Cross-Service Integration**: SharePoint validates PowerPlatform document locations; Service Bus correlates with Application Insights/Log Analytics

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

### Data CRUD Operations

**IMPORTANT:** Data modification operations are disabled by default and must be explicitly enabled via environment variables.

**Service Methods** ([src/PowerPlatformService.ts](src/PowerPlatformService.ts)):
- `createRecord(entityNamePlural, data)` - Create new record
- `updateRecord(entityNamePlural, recordId, data)` - Update existing record (PATCH)
- `deleteRecord(entityNamePlural, recordId)` - Delete record (permanent)

**Tools:**
1. **create-record** - Create new Dataverse records
   - Requires `POWERPLATFORM_ENABLE_CREATE=true`
   - Parameters: entityNamePlural, data (JSON object)
   - Returns: Created record with ID

2. **update-record** - Update existing Dataverse records
   - Requires `POWERPLATFORM_ENABLE_UPDATE=true`
   - Parameters: entityNamePlural, recordId, data (partial JSON)
   - Returns: Updated record

3. **delete-record** - Delete Dataverse records (permanent)
   - Requires `POWERPLATFORM_ENABLE_DELETE=true`
   - Parameters: entityNamePlural, recordId, confirm (boolean)
   - Requires explicit `confirm: true` for safety
   - Returns: Success confirmation

**Data Format:**
- **Field Names:** Use logical names (e.g., `name`, `emailaddress1`, `telephone1`)
- **Lookups:** Use `@odata.bind` syntax: `{"parentaccountid@odata.bind": "/accounts(guid)"}`
- **Option Sets:** Use integer values: `{"statecode": 0, "statuscode": 1}`
- **Money:** Use decimal values: `{"revenue": 1000000.00}`
- **Dates:** Use ISO 8601 format: `{"birthdate": "1990-01-15"}`

**Security Considerations:**
- All operations are audited via audit-logger
- GUID validation for record IDs
- Empty data validation
- Delete operations require explicit confirmation
- Follow principle of least privilege - only enable needed operations
- Use separate Azure AD apps with limited permissions for production

**Error Handling:**
- Clear error messages for missing permissions
- Detailed API error responses from Dataverse
- Audit logs for both success and failure
- Validation errors before API calls

**Example Usage:**
```typescript
// Create account
await createRecord('accounts', {
  name: 'Acme Corporation',
  telephone1: '555-1234',
  websiteurl: 'https://acme.com'
});

// Update account
await updateRecord('accounts', 'guid-here', {
  telephone1: '555-5678'
});

// Delete account (requires confirmation)
await deleteRecord('accounts', 'guid-here', true);
```

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
- `create-wiki-page`: Create new wiki pages (requires `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`)
- `update-wiki-page`: Update existing wiki pages (requires `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`)
- `azuredevops-str-replace-wiki-page`: Efficiently replace strings in wiki pages (requires `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`)

**Usage Example:**
```javascript
// Search for pages
const results = await searchWikiPages("Release_002", "RTPI");

// Use the path directly (already converted to wiki path)
const page = await getWikiPage("RTPI", results.results[0].wikiId, results.results[0].path, true);

// Extract content
const items = page.content.matchAll(/\|\s*#(\d+)\s*\|/g);
```

### Wiki String Replacement Tool

The `azuredevops-str-replace-wiki-page` tool enables efficient wiki updates by replacing specific strings without rewriting the entire page content. This provides ~98% token savings for common update scenarios.

**Implementation:** [src/AzureDevOpsService.ts](src/AzureDevOpsService.ts:461)

**Key Features:**
- **Uniqueness Enforcement**: By default, old_str must be unique in the page (prevents accidental bulk replacements)
- **Replace All Option**: Set `replace_all=true` to replace multiple occurrences
- **Version Conflict Handling**: Automatically retries with fresh content if concurrent edit detected
- **Unified Diff Output**: Shows exactly what changed (line numbers and before/after)
- **Match Location Preview**: Shows line numbers when multiple matches found

**Algorithm:**

```typescript
async strReplaceWikiPage(
  project: string,
  wikiId: string,
  pagePath: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean = false,
  description?: string
): Promise<any> {
  // 1. Validate write permission
  if (!this.config.enableWikiWrite) {
    throw new Error('Wiki write operations are disabled');
  }

  // 2. Fetch current page content and version
  const currentPage = await this.getWikiPage(project, wikiId, pagePath, true);

  // 3. Count occurrences of old_str
  const occurrences = this.countOccurrences(currentPage.content, oldStr);

  // 4. Enforce uniqueness (error if multiple matches and replaceAll=false)
  if (occurrences === 0) {
    throw new Error(`String not found: "${oldStr}"`);
  }
  if (occurrences > 1 && !replaceAll) {
    throw new Error(`String appears ${occurrences} times. Use replace_all=true or make old_str unique.`);
  }

  // 5. Perform replacement
  const newContent = currentPage.content.replace(
    new RegExp(this.escapeRegExp(oldStr), replaceAll ? 'g' : ''),
    newStr
  );

  // 6. Update with version conflict retry
  try {
    updateResult = await this.updateWikiPage(project, wikiId, pagePath, newContent, currentPage.version);
  } catch (error) {
    if (error.message.includes('version') || error.message.includes('conflict')) {
      // Retry with fresh version
      const freshPage = await this.getWikiPage(project, wikiId, pagePath, true);
      const freshNewContent = freshPage.content.replace(...);
      updateResult = await this.updateWikiPage(project, wikiId, pagePath, freshNewContent, freshPage.version);
    }
  }

  // 7. Generate unified diff
  const diff = this.generateUnifiedDiff(currentPage.content, newContent, oldStr, newStr);

  // 8. Return result with diff and metadata
  return { success: true, diff, occurrences, version, message };
}
```

**Helper Methods:**
- `countOccurrences()`: Count string matches using regex
- `getMatchLocations()`: Find line numbers of matches (up to 10 displayed)
- `generateUnifiedDiff()`: Create unified diff output showing changes
- `escapeRegExp()`: Escape special regex characters for safe matching
- `truncate()`: Truncate strings for display in error messages

**Use Cases:**

1. **Cross-Environment Updates** (DEV/UAT/PROD):
```javascript
// Update verification date across all environments
const environments = ['DEV', 'UAT', 'PROD'];
for (const env of environments) {
  await strReplaceWikiPage(
    'RTPI',
    'RTPI.Crm.wiki',
    `/SharePoint-Online/04-${env}-Configuration`,
    'Last Verified: November 5, 2025',
    'Last Verified: November 10, 2025'
  );
}

// Token savings: ~30,000 → ~450 tokens (98.5% reduction)
```

2. **Multi-line Replacement**:
```javascript
await strReplaceWikiPage(
  'RTPI',
  'RTPI.Crm.wiki',
  '/SharePoint-Online/04-DEV-Configuration',
  `## Document Libraries
- Forms
- Templates`,
  `## Document Libraries
- Forms
- Templates
- Archives`
);
```

3. **Replace All Occurrences**:
```javascript
await strReplaceWikiPage(
  'RTPI',
  'RTPI.Crm.wiki',
  '/SharePoint-Online/04-DEV-Configuration',
  'TODO',
  'DONE',
  true  // replace_all=true
);
```

**Error Handling:**

- **String Not Found**: Shows page excerpt to help locate the issue
- **Multiple Matches**: Lists all matching line numbers with context
- **Version Conflict**: Automatically retries with fresh content (1 retry max)
- **Write Permission**: Clear message about environment flag requirement

**Benefits:**
- **98% Token Reduction**: For typical date/version updates
- **Safety**: Uniqueness enforcement prevents unintended replacements
- **Auditability**: Diff output shows exactly what changed
- **Reliability**: Automatic version conflict handling

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

## Application Insights Integration

### Overview

The Application Insights integration enables AI assistants to query and analyze application telemetry data, including exceptions, performance metrics, dependencies, traces, and availability results. The integration supports multiple Application Insights resources with active/inactive toggles for quick configuration changes.

### Architecture

The Application Insights integration provides access to Azure Application Insights telemetry through the Application Insights Query API using KQL (Kusto Query Language).

**Service Class:** `ApplicationInsightsService` ([src/ApplicationInsightsService.ts](src/ApplicationInsightsService.ts))
- Manages authentication (Entra ID OAuth or API Key)
- Executes KQL queries via Application Insights Query API
- Provides helper methods for common troubleshooting scenarios
- Supports multiple Application Insights resources with active/inactive flags

**Authentication Methods:**
1. **Microsoft Entra ID (OAuth 2.0)** - Recommended for production
   - Higher rate limits (60 requests/minute per user)
   - No daily cap
   - Better security (token-based, automatic expiry)
   - Uses `@azure/msal-node` (same pattern as PowerPlatform)
   - Requires "Monitoring Reader" role on Application Insights resources

2. **API Key Authentication** - Simpler for single resources
   - Lower rate limits (15 requests/minute per key)
   - Daily cap of 1,500 requests per key
   - Requires "Read telemetry" permission

**Configuration:**
Supports two configuration modes:
1. Multi-resource (JSON array in `APPINSIGHTS_RESOURCES`)
2. Single-resource fallback (`APPINSIGHTS_APP_ID`)

Each resource has an `active` flag for quick toggling without removing configuration.

### Available Tools (10 total)

1. **`appinsights-list-resources`** - List configured resources (active and inactive)
2. **`appinsights-get-metadata`** - Get schema metadata (tables and columns)
3. **`appinsights-execute-query`** - Execute custom KQL queries
4. **`appinsights-get-exceptions`** - Get recent exceptions with types and messages
5. **`appinsights-get-slow-requests`** - Get slow HTTP requests (configurable threshold)
6. **`appinsights-get-operation-performance`** - Get performance summary (count, avg, p50/p95/p99)
7. **`appinsights-get-failed-dependencies`** - Get failed external calls (APIs, databases)
8. **`appinsights-get-traces`** - Get diagnostic traces filtered by severity (0-4)
9. **`appinsights-get-availability`** - Get availability test results and uptime stats
10. **`appinsights-get-custom-events`** - Get custom application events

### Available Prompts (5 total)

1. **`appinsights-exception-summary`** - Exception summary report with insights and recommendations
2. **`appinsights-performance-report`** - Performance analysis with slowest operations and recommendations
3. **`appinsights-dependency-health`** - Dependency health with success rates and recommendations
4. **`appinsights-availability-report`** - Availability and uptime report with test results
5. **`appinsights-troubleshooting-guide`** - Comprehensive troubleshooting combining all telemetry sources

### Telemetry Tables

Application Insights stores data in the following tables:

| Table | Description | Common Queries |
|-------|-------------|----------------|
| `requests` | Incoming HTTP requests | Performance, error rates |
| `dependencies` | Outbound calls (APIs, DBs) | External service issues, latency |
| `exceptions` | Application exceptions | Error troubleshooting, stability |
| `traces` | Diagnostic logs | Debug output, informational logs |
| `customEvents` | Custom events | Feature usage, business events |
| `customMetrics` | Custom metrics | Business KPIs, counters |
| `pageViews` | Client page views | User behavior, frontend perf |
| `browserTimings` | Client performance | Frontend load times |
| `availabilityResults` | Availability tests | Uptime monitoring |
| `performanceCounters` | System performance | CPU, memory, disk |

### Service Integration

**Configuration Parsing** ([src/index.ts](src/index.ts)):
```typescript
// Multi-resource configuration
APPINSIGHTS_RESOURCES=[{"id":"prod-api","name":"Production API","appId":"xxx","active":true}]

// Or single-resource fallback
APPINSIGHTS_APP_ID=xxx
APPINSIGHTS_API_KEY=xxx
```

**Lazy Initialization Pattern:**
- Service initialized on first tool/prompt invocation
- Validates configuration before initialization
- Caches access tokens with automatic refresh (5-minute buffer)

**Helper Methods:**
All helper methods are in `ApplicationInsightsService`:
- `getRecentExceptions()` - Recent exceptions by timestamp
- `getSlowRequests()` - Requests above duration threshold
- `getFailedDependencies()` - Failed external calls
- `getOperationPerformance()` - Performance aggregates by operation
- `getTracesBySeverity()` - Traces filtered by severity level
- `getAvailabilityResults()` - Availability test summaries
- `getCustomEvents()` - Custom event queries

**Formatting Utilities** ([src/utils/appinsights-formatters.ts](src/utils/appinsights-formatters.ts)):
- `formatTableAsMarkdown()` - Convert query results to markdown tables
- `analyzeExceptions()` - Extract insights from exception data
- `analyzePerformance()` - Extract insights from performance data
- `analyzeDependencies()` - Extract insights from dependency data

### Use Cases

**Exception Analysis:**
- Recent exceptions by type and frequency
- Exception stack traces and messages
- Exception trends over time
- Operation-level exception analysis

**Performance Analysis:**
- Slowest operations (requests and dependencies)
- Request duration percentiles (p50, p95, p99)
- Operations by call count
- Performance regression detection

**Dependency Monitoring:**
- Failed dependency calls with targets
- Slow external dependencies
- Dependency success rates
- External service health verification

**Troubleshooting:**
- Comprehensive troubleshooting guides
- Operation-level analysis using operation_Id correlation
- Timeline analysis for deployment correlation
- Multi-source telemetry correlation

**Availability Monitoring:**
- Availability test results
- Uptime percentage calculation
- Failed test analysis
- Geographic availability patterns

### Error Handling

The service implements comprehensive error handling:

**Authentication Errors (401/403):**
- Clear messages about missing credentials
- Permission requirements (Monitoring Reader role)
- Configuration validation

**Rate Limiting (429):**
- Retry-after header parsing
- Clear messages about current limits
- Recommendations for auth method upgrade

**Query Errors:**
- KQL syntax error detection with hints
- Semantic error detection (invalid columns/tables)
- Timeout handling (30-second default)
- Network error detection

**Resource Errors:**
- Resource not found with available resources list
- Inactive resource detection with activation instructions
- Configuration validation

### Security Considerations

**Credential Management:**
- Never log credentials
- Store tokens in memory only (never persist)
- Clear tokens on service disposal
- Support for `.env` files for local development

**Query Safety:**
- Read-only operations only (no write/update/delete)
- Query size limits (max 10KB)
- Result size limits (max 10,000 rows)
- No dangerous KQL keywords allowed

**Data Sanitization:**
- Sanitize error messages (remove connection strings, API keys)
- Redact sensitive data in query results (optional)
- Truncate large results automatically

**RBAC and Permissions:**
For Entra ID authentication, the service principal must have:
- "Monitoring Reader" or "Reader" role on Application Insights resource
- Role can be assigned at resource or resource group level

For API Key authentication:
- API key must have "Read telemetry" permission
- Keys can be scoped to specific resources

### Query Optimization

**Timespan Conversion:**
The service converts ISO 8601 durations (PT1H, P1D) to KQL format (1h, 1d) automatically.

**Common Timespan Presets:**
- `PT15M` → 15 minutes
- `PT1H` → 1 hour
- `PT12H` → 12 hours
- `P1D` → 1 day
- `P7D` → 7 days

**Query Best Practices:**
- Use `summarize` and `top` operators to limit result sizes
- Set reasonable time ranges
- Cache metadata queries
- Use `take` to limit row counts

## Azure Log Analytics Workspace Integration

### Overview

The Azure Log Analytics Workspace integration provides powerful log querying capabilities for Azure Functions, App Services, and other Azure resources using KQL (Kusto Query Language). The integration is designed for troubleshooting, performance analysis, and security monitoring with comprehensive support for Azure Functions diagnostics.

### Architecture

The Log Analytics integration provides access to Azure Log Analytics workspaces through the Log Analytics Query API using KQL.

**Service Class:** `LogAnalyticsService` ([src/LogAnalyticsService.ts](src/LogAnalyticsService.ts))
- Manages authentication (Entra ID OAuth or API Key)
- Executes KQL queries via Log Analytics Query API
- Provides helper methods for Azure Functions troubleshooting
- Supports multiple workspaces with active/inactive flags
- Implements shared credential fallback to Application Insights credentials

**Authentication Methods:**
1. **Microsoft Entra ID (OAuth 2.0)** - Recommended for production
   - Higher rate limits (60 requests/minute per user)
   - No daily cap
   - Better security (token-based, automatic expiry)
   - Uses `@azure/msal-node` (same pattern as Application Insights)
   - Requires "Log Analytics Reader" role on workspaces

2. **API Key Authentication** - Simpler for single workspaces
   - Lower rate limits (15 requests/minute per key)
   - Daily cap of 1,500 requests per key
   - Deprecated by Microsoft - use Entra ID for new implementations
   - Requires "Read" permission

**Configuration:**
Supports two configuration modes:
1. Multi-workspace (JSON array in `LOGANALYTICS_RESOURCES`)
2. Single-workspace fallback (`LOGANALYTICS_WORKSPACE_ID`)

Each workspace has an `active` flag for quick toggling without removing configuration.

**Shared Credentials:**
The service implements automatic fallback to Application Insights credentials:
```typescript
const LOGANALYTICS_CONFIG: LogAnalyticsConfig = {
  // Falls back to APPINSIGHTS_* if LOGANALYTICS_* not provided
  tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
  clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
  clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
};
```

This allows users with both integrations to use a single Azure AD app registration.

### Available Tools (10 total)

1. **`loganalytics-list-workspaces`** - List configured workspaces (active and inactive)
2. **`loganalytics-get-metadata`** - Get workspace schema (tables and columns)
3. **`loganalytics-execute-query`** - Execute custom KQL queries
4. **`loganalytics-get-function-logs`** - Get Azure Function logs with filtering
5. **`loganalytics-get-function-errors`** - Get function error logs (ExceptionDetails present)
6. **`loganalytics-get-function-stats`** - Get execution statistics (count, success rate)
7. **`loganalytics-get-function-invocations`** - Get function invocation records
8. **`loganalytics-get-recent-events`** - Get recent events from any table (generic)
9. **`loganalytics-search-logs`** - Search logs across tables (cross-table search)
10. **`loganalytics-test-workspace-access`** (BONUS) - Validate workspace access

### Available Prompts (5 total)

1. **`loganalytics-workspace-summary`** - Workspace health overview with all functions
2. **`loganalytics-function-troubleshooting`** - Comprehensive function troubleshooting
3. **`loganalytics-function-performance-report`** - Performance analysis with recommendations
4. **`loganalytics-security-analysis`** (BONUS) - Security event analysis and compliance
5. **`loganalytics-logs-report`** - Formatted logs with insights for any table

### Service Implementation ([src/LogAnalyticsService.ts](src/LogAnalyticsService.ts))

**Core Architecture:**

```typescript
class LogAnalyticsService {
  // Private MSAL client for token acquisition
  private msalClient: ConfidentialClientApplication | null = null;

  // Token caching (5-minute buffer before expiry)
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  // Configuration
  private config: LogAnalyticsConfig;
  private readonly baseUrl = 'https://api.loganalytics.io/v1';

  // Core methods
  async executeQuery(resourceId, query, timespan?): Promise<QueryResult>
  async getMetadata(resourceId): Promise<MetadataResult>
  async testWorkspaceAccess(resourceId): Promise<TestResult>

  // Azure Functions helpers
  async getFunctionLogs(resourceId, functionName?, timespan?, severityLevel?, limit?)
  async getFunctionErrors(resourceId, functionName?, timespan?, limit?)
  async getFunctionStats(resourceId, functionName?, timespan?)
  async getFunctionInvocations(resourceId, functionName?, timespan?, limit?)

  // Generic helpers
  async getRecentEvents(resourceId, tableName, timespan?, limit?)
  async searchLogs(resourceId, searchText, tableName?, timespan?, limit?)

  // Utility methods
  convertTimespanToKQL(iso8601Duration): string
  validateQuery(query): { valid: boolean; error?: string }
}
```

**Token Management:**
- Uses MSAL for OAuth 2.0 authentication with scope `https://api.loganalytics.io/.default`
- Implements token caching with 5-minute buffer before expiry
- Automatic token refresh on expiration

**KQL Query Execution:**
```typescript
async executeQuery(resourceId: string, query: string, timespan?: string): Promise<QueryResult> {
  const resource = this.getResourceById(resourceId);
  const headers = await this.getAuthHeaders(resource);
  const url = `${this.baseUrl}/workspaces/${resource.workspaceId}/query`;

  const requestBody: any = { query };
  if (timespan) requestBody.timespan = timespan;

  const response = await axios.post(url, requestBody, {
    headers,
    timeout: 30000
  });

  return response.data;
}
```

### Service Integration ([src/index.ts](src/index.ts))

**Configuration Parsing:**
```typescript
const LOGANALYTICS_CONFIG: LogAnalyticsConfig = {
  resources: [], // Parsed from JSON
  authMethod: (process.env.LOGANALYTICS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
  tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
  clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
  clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
};

// Parse multi-workspace configuration
if (process.env.LOGANALYTICS_RESOURCES) {
  LOGANALYTICS_CONFIG.resources = JSON.parse(process.env.LOGANALYTICS_RESOURCES);
}
// Fallback to single-workspace configuration
else if (process.env.LOGANALYTICS_WORKSPACE_ID) {
  LOGANALYTICS_CONFIG.resources = [{
    id: 'default',
    name: 'Default Workspace',
    workspaceId: process.env.LOGANALYTICS_WORKSPACE_ID,
    active: true,
    apiKey: process.env.LOGANALYTICS_API_KEY
  }];
}
```

**Lazy Initialization Pattern:**
```typescript
let logAnalyticsService: LogAnalyticsService | null = null;

function getLogAnalyticsService(): LogAnalyticsService {
  if (!logAnalyticsService) {
    // Validate required configuration
    const missingConfig: string[] = [];
    if (LOGANALYTICS_CONFIG.resources.length === 0) {
      missingConfig.push("LOGANALYTICS_RESOURCES or LOGANALYTICS_WORKSPACE_ID");
    }
    // ... more validation

    if (missingConfig.length > 0) {
      throw new Error(`Missing required Log Analytics configuration: ${missingConfig.join(", ")}`);
    }

    logAnalyticsService = new LogAnalyticsService(LOGANALYTICS_CONFIG);
    console.error("Log Analytics Workspace service initialized");
  }
  return logAnalyticsService;
}
```

### Formatting Utilities ([src/utils/loganalytics-formatters.ts](src/utils/loganalytics-formatters.ts))

The Log Analytics formatters transform raw query results into human-readable analysis:

**Key Formatters:**
- `formatTableAsMarkdown()` - Convert query results to markdown tables
- `formatTableAsCSV()` - Convert results to CSV format
- `analyzeLogs()` - Generic log analysis with severity distribution
- `analyzeFunctionLogs()` - Azure Function-specific log analysis
- `analyzeFunctionErrors()` - Error pattern detection and exception analysis
- `analyzeFunctionStats()` - Statistics analysis with success rates
- `generateRecommendations()` - AI-driven recommendations based on analysis
- `sanitizeErrorMessage()` - Security sanitization (removes credentials)
- `parseTimespan()` - ISO 8601 duration validation
- `getTimespanPresets()` - Common timespan presets

**Example Analysis Output:**
```typescript
analyzeFunctionLogs(logsTable) => {
  insights: [
    "- Total function log entries: 125",
    "- Unique functions: 3",
    "- Error count: 8",
    "- Success rate: 93.6%",
    "- Severity distribution:",
    "  - Information: 80",
    "  - Warning: 12",
    "  - Error: 8"
  ]
}

generateRecommendations({ errorCount: 8, successRate: 93.6 }) => [
  "⚠️ Success rate below 95% - consider implementing retry logic",
  "🔍 Investigate error patterns to identify root causes"
]
```

### Log Analytics Tables

When configuring Log Analytics for Azure Functions, users typically query these tables:

| Table | Description | Common Queries |
|-------|-------------|----------------|
| `FunctionAppLogs` | Azure Function execution logs | Error analysis, troubleshooting |
| `requests` | Incoming HTTP requests | HTTP-triggered function monitoring |
| `dependencies` | Outbound calls (APIs, DBs) | External dependency failures |
| `traces` | Diagnostic traces | Debug output |
| `exceptions` | Application exceptions | Exception troubleshooting |
| `customEvents` | Custom events | Feature usage tracking |

### Use Cases

**Azure Functions Troubleshooting:**
- Recent error analysis by function
- Exception pattern detection
- Function execution statistics
- Performance monitoring

**KQL Query Execution:**
- Custom queries against any table
- Multi-table joins and aggregations
- Trend analysis over time

**Cross-Service Correlation:**
- Correlate Application Insights telemetry with Log Analytics logs
- Combine function logs with dependency failures
- Timeline analysis across multiple data sources

**Security Monitoring:**
- Authentication failure detection
- Suspicious pattern identification
- Security event analysis
- Compliance reporting

### Error Handling

The service implements comprehensive error handling:

**Authentication Errors (401/403):**
- Clear messages about missing credentials
- Permission requirements (Log Analytics Reader role)
- Configuration validation
- Shared credential fallback

**Rate Limiting (429):**
- Retry-after header parsing
- Clear messages about current limits
- Recommendations for auth method upgrade (API key → Entra ID)

**Query Errors:**
- KQL syntax error detection with hints
- Semantic error detection (invalid columns/tables)
- Timeout handling (30-second default)
- Network error detection
- Suggestions to use `loganalytics-get-metadata` for schema discovery

**Workspace Errors:**
- Workspace not found with available workspaces list
- Inactive workspace detection with activation instructions
- Configuration validation
- Workspace ID format validation (GUID)

### Security Considerations

**Credential Management:**
- Never log credentials or tokens
- Store tokens in memory only (never persist)
- Clear tokens on service disposal
- Support for `.env` files for local development
- Shared credential pattern with Application Insights

**Query Safety:**
- Read-only operations only (no write/update/delete)
- Query size limits (max 10KB recommended)
- Result size limits (max 10,000 rows per query)
- No dangerous KQL keywords allowed (invoke, execute, evaluate)
- Validation before execution

**Data Sanitization:**
- Sanitize error messages (remove connection strings, API keys, workspace IDs)
- Redact sensitive data in query results (optional)
- Truncate large results automatically

**RBAC and Permissions:**
For Entra ID authentication, the service principal must have:
- "Log Analytics Reader" or "Reader" role on Log Analytics workspace
- Role can be assigned at workspace or resource group level

For API Key authentication (deprecated):
- API key must have "Read" permission
- Keys can be scoped to specific workspaces

### Query Optimization

**Timespan Conversion:**
The service automatically converts ISO 8601 durations to KQL format:
```typescript
convertTimespanToKQL('PT1H') // → '1h'
convertTimespanToKQL('P1D')  // → '1d'
convertTimespanToKQL('PT30M') // → '30m'
```

**Common Timespan Presets:**
- `PT15M` → 15 minutes
- `PT1H` → 1 hour
- `PT12H` → 12 hours
- `P1D` → 1 day
- `P7D` → 7 days
- `P30D` → 30 days

**Query Best Practices:**
- Use `summarize` and `top` operators to limit result sizes
- Set reasonable time ranges
- Cache metadata queries
- Use `take` to limit row counts
- Use `where` clauses early in query pipeline
- Avoid `select *` - specify needed columns

**FunctionAppLogs Table Schema:**
```kql
FunctionAppLogs
| getschema

// Common columns:
TimeGenerated: datetime
FunctionName: string
Message: string
SeverityLevel: int  // 0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical
ExceptionDetails: string
HostInstanceId: string
```

### Design Patterns

**Lazy Initialization:**
- Service initialized on first tool/prompt invocation
- Validates configuration before initialization
- Caches access tokens with automatic refresh

**Shared Credentials:**
- Automatic fallback from LOGANALYTICS_* to APPINSIGHTS_* environment variables
- Single app registration supports both integrations
- Reduces configuration complexity

**Multi-Workspace Support:**
- JSON array configuration with active/inactive flags
- Quick toggle without removing configuration
- Resource-based query routing

**Helper Methods:**
All helper methods wrap KQL queries:
- `getFunctionLogs()` → `FunctionAppLogs | where ...`
- `getFunctionErrors()` → `FunctionAppLogs | where ExceptionDetails != ""`
- `getFunctionStats()` → `FunctionAppLogs | summarize ...`
- `searchLogs()` → `* | where * contains "text"`

**Audit Logging:**
All queries are logged with execution time:
```typescript
auditLogger.log({
  operation: 'execute-query',
  operationType: 'READ',
  resourceId: resource.id,
  componentType: 'Query',
  success: true,
  parameters: { query: query.substring(0, 500), timespan },
  executionTimeMs: timer()
});
```

## Azure SQL Database Integration

### Overview

The Azure SQL Database integration provides read-only access to SQL databases for schema exploration, data investigation, and ad-hoc querying. The integration is designed with comprehensive security controls and is read-only by design to prevent accidental data modifications.

### Architecture

The Azure SQL Database integration provides read-only access to Azure SQL Database and SQL Server through the `mssql` library with comprehensive security controls.

**Service Class:** `AzureSqlService` ([src/AzureSqlService.ts](src/AzureSqlService.ts))
- Manages database connections with connection pooling
- Implements query validation and security controls
- Provides schema exploration methods
- Executes safe SELECT queries with result limiting

**Authentication Methods:**
1. **SQL Authentication (Username/Password)** - Simpler for getting started
   - Standard SQL Server authentication
   - Username and password configured via environment variables
   - Suitable for development and testing

2. **Azure AD Authentication (Service Principal)** - Recommended for production
   - Token-based authentication using Azure AD
   - No stored passwords (uses client credentials flow)
   - Better security with token refresh
   - Uses `mssql` library's built-in Azure AD support

**Configuration:**
Supports two configuration modes:
1. **Multi-server configuration** (RECOMMENDED) - JSON array with per-server settings:
   - Multiple SQL servers with individual credentials per server
   - Multiple databases per server with active/inactive flags
   - Empty databases[] array enables access to all databases on that server
   - Per-server authentication (SQL or Azure AD)
2. **Legacy single-server** - Backward compatible with existing environment variables

**Multi-Server Architecture:**
- Connection pooling: `Map<"serverId:database", ConnectionPool>` for isolated per-database connections
- Per-server credentials: Each server can use different authentication methods
- Database discovery: Empty databases[] triggers `sys.databases` query
- Active/inactive flags: Quick toggle at server and database levels

Each connection is validated on first use and maintains a health-checked connection pool.

### Service Implementation ([src/AzureSqlService.ts](src/AzureSqlService.ts))

**Core Architecture:**

```typescript
export interface AzureSqlDatabaseConfig {
  name: string;
  active: boolean;
  description?: string;
}

export interface AzureSqlServerResource {
  id: string;                          // Unique server identifier
  name: string;                        // Display name
  server: string;                      // Server hostname
  port: number;                        // SQL Server port
  active: boolean;                     // Server active flag
  databases: AzureSqlDatabaseConfig[]; // Databases (empty = all)

  // SQL Authentication
  username?: string;
  password?: string;

  // Azure AD Authentication
  useAzureAd?: boolean;
  azureAdClientId?: string;
  azureAdClientSecret?: string;
  azureAdTenantId?: string;

  description?: string;
}

export interface AzureSqlConfig {
  resources: AzureSqlServerResource[];

  // Global settings (apply to all servers)
  queryTimeout?: number;
  maxResultRows?: number;
  connectionTimeout?: number;
  poolMin?: number;
  poolMax?: number;
}

class AzureSqlService {
  // Multi-pool connection management
  private pools: Map<string, ConnectionPool> = new Map();

  // Configuration
  private config: AzureSqlConfig;

  // Helper methods
  private getServerById(serverId: string): AzureSqlServerResource
  private getDatabaseConfig(server, database): AzureSqlDatabaseConfig

  // Connection pool management (per database)
  private async getPool(serverId, database): Promise<ConnectionPool>

  // Security and execution
  private sanitizeErrorMessage(error: Error): string
  private async executeQuery<T>(serverId, database, query): Promise<IResult<T>>

  // Public API methods (all require serverId and database)
  async listServers(): Promise<ServerInfo[]>
  async listDatabases(serverId): Promise<DatabaseInfo[]>
  async testConnection(serverId, database): Promise<ConnectionTestResult>
  async listTables(serverId, database): Promise<TableInfo[]>
  async listViews(serverId, database): Promise<ViewInfo[]>
  async listStoredProcedures(serverId, database): Promise<StoredProcedureInfo[]>
  async listTriggers(serverId, database): Promise<TriggerInfo[]>
  async listFunctions(serverId, database): Promise<FunctionInfo[]>
  async getTableSchema(serverId, database, schema, table): Promise<TableSchema>
  async getObjectDefinition(serverId, database, schema, name, type): Promise<ObjectDefinition>
  async executeSelectQuery(serverId, database, query): Promise<SqlApiCollectionResponse>
  async close(): Promise<void>
}
```

**Connection Pooling:**
- Uses `mssql` library's built-in connection pooling
- **Multi-pool architecture**: Separate connection pool per `serverId:database` combination
- Pool key format: `"prod-sql:AppDB"`, `"dev-sql:TestDB"`, etc.
- Default pool: 0 min connections, 10 max connections per database (configurable)
- Automatic connection health checks and reconnection
- Graceful pool disposal on service shutdown (closes all pools)

**Enhanced Query Validation ([src/AzureSqlService.ts](src/AzureSqlService.ts:338)):**

The service implements multi-layer security for query execution:

```typescript
async executeSelectQuery(query: string): Promise<SqlApiCollectionResponse<any>> {
  const timer = auditLogger.startTimer();

  // Layer 1: Remove SQL comments (prevents comment-hiding attacks)
  let cleanQuery = query
    .replace(/--.*$/gm, '')           // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\s+/g, ' ')              // Normalize whitespace
    .trim()
    .toLowerCase();

  // Layer 2: Validate SELECT-only
  if (!cleanQuery.startsWith('select')) {
    throw new Error('Only SELECT queries are permitted');
  }

  // Layer 3: Dangerous keyword detection with word boundaries
  const dangerousPatterns = [
    { pattern: /\b(insert|update|delete|merge)\b/i, name: 'write operations' },
    { pattern: /\b(drop|create|alter|truncate)\b/i, name: 'schema modifications' },
    { pattern: /\b(exec|execute|sp_|xp_)\b/i, name: 'procedure execution' },
    { pattern: /\binto\b/i, name: 'data insertion' },
    // ... more patterns
  ];

  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(cleanQuery)) {
      auditLogger.log({
        operation: 'execute-select-query',
        operationType: 'READ',
        componentType: 'Query',
        success: false,
        error: `Blocked ${name}`,
        parameters: { query: query.substring(0, 500) },
        executionTimeMs: timer()
      });
      throw new Error(`Invalid query: ${name} detected`);
    }
  }

  // Execute with safety limits
  const result = await this.executeQuery(query);

  // Audit logging
  auditLogger.log({
    operation: 'execute-select-query',
    operationType: 'READ',
    componentType: 'Query',
    success: true,
    parameters: {
      query: query.substring(0, 500),
      rowCount: result.rowCount
    },
    executionTimeMs: timer()
  });

  return result;
}
```

**Result Size Protection ([src/AzureSqlService.ts](src/AzureSqlService.ts:266)):**

```typescript
private async executeQuery<T>(query: string): Promise<IResult<T>> {
  const pool = await this.getPool();
  const request = pool.request();

  // Set query timeout (default: 30 seconds)
  request.timeout = this.config.queryTimeout || 30000;

  const result = await request.query<T>(query);

  // Enforce row limit (default: 1000 rows)
  const maxRows = this.config.maxResultRows || 1000;
  if (result.recordset && result.recordset.length > maxRows) {
    result.recordset = result.recordset.slice(0, maxRows);
    result.rowsAffected = [maxRows];
  }

  // Enforce response size limit (10MB)
  const responseSize = JSON.stringify(result).length;
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (responseSize > maxSize) {
    throw new Error(`Query result too large (${responseSize} bytes, max ${maxSize})`);
  }

  return result;
}
```

**Credential Sanitization ([src/AzureSqlService.ts](src/AzureSqlService.ts:232)):**

All error messages are sanitized to remove credentials:

```typescript
private sanitizeErrorMessage(error: Error): string {
  let message = error.message;

  // Remove connection strings
  message = message.replace(/Server=[^;]+/gi, 'Server=***');
  message = message.replace(/Password=[^;]+/gi, 'Password=***');
  message = message.replace(/User ID=[^;]+/gi, 'User ID=***');

  // Remove IP addresses
  message = message.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '***.***.***.***');

  return message;
}
```

### Available Tools (11 total)

**Server & Database Discovery Tools:**
1. **`sql-list-servers`** - List all configured SQL servers with active/inactive status
2. **`sql-list-databases`** - List databases on a server (configured or discovered via sys.databases)

**Schema Exploration Tools:**
3. **`sql-test-connection`** - Test database connectivity and server information
4. **`sql-list-tables`** - List all tables with row counts and sizes
5. **`sql-list-views`** - List all views with definitions
6. **`sql-list-stored-procedures`** - List all stored procedures
7. **`sql-list-triggers`** - List all triggers with event types
8. **`sql-list-functions`** - List all user-defined functions
9. **`sql-get-table-schema`** - Get complete table schema (columns, indexes, foreign keys)
10. **`sql-get-object-definition`** - Get SQL definition for views, procedures, functions, triggers

**Query Execution Tools:**
11. **`sql-execute-query`** - Execute SELECT queries safely with validation

### Available Prompts (3 total)

1. **`sql-database-overview`** - Comprehensive database overview with all objects
2. **`sql-table-details`** - Detailed table report with schema information
3. **`sql-query-results`** - Formatted query results as markdown tables

### Service Integration ([src/index.ts](src/index.ts))

**Configuration Parsing:**
```typescript
const AZURE_SQL_CONFIG: AzureSqlConfig = {
  resources: [],
  queryTimeout: parseInt(process.env.AZURE_SQL_QUERY_TIMEOUT || "30000"),
  maxResultRows: parseInt(process.env.AZURE_SQL_MAX_RESULT_ROWS || "1000"),
  connectionTimeout: parseInt(process.env.AZURE_SQL_CONNECTION_TIMEOUT || "15000"),
  poolMin: parseInt(process.env.AZURE_SQL_POOL_MIN || "0"),
  poolMax: parseInt(process.env.AZURE_SQL_POOL_MAX || "10"),
};

// Multi-server configuration (RECOMMENDED)
if (process.env.AZURE_SQL_SERVERS) {
  try {
    AZURE_SQL_CONFIG.resources = JSON.parse(process.env.AZURE_SQL_SERVERS);
  } catch (error) {
    console.error('Failed to parse AZURE_SQL_SERVERS:', error);
  }
}
// Legacy single-server configuration (backward compatibility)
else if (process.env.AZURE_SQL_SERVER && process.env.AZURE_SQL_DATABASE) {
  AZURE_SQL_CONFIG.resources = [
    {
      id: 'default',
      name: 'Default SQL Server',
      server: process.env.AZURE_SQL_SERVER,
      port: parseInt(process.env.AZURE_SQL_PORT || "1433"),
      active: true,
      databases: [
        {
          name: process.env.AZURE_SQL_DATABASE,
          active: true,
          description: 'Default database',
        },
      ],
      username: process.env.AZURE_SQL_USERNAME || '',
      password: process.env.AZURE_SQL_PASSWORD || '',
      useAzureAd: process.env.AZURE_SQL_USE_AZURE_AD === "true",
      azureAdClientId: process.env.AZURE_SQL_CLIENT_ID || '',
      azureAdClientSecret: process.env.AZURE_SQL_CLIENT_SECRET || '',
      azureAdTenantId: process.env.AZURE_SQL_TENANT_ID || '',
      description: 'Migrated from single-server configuration',
    },
  ];
}
```

**Lazy Initialization Pattern:**
```typescript
let azureSqlService: AzureSqlService | null = null;

function getAzureSqlService(): AzureSqlService {
  if (!azureSqlService) {
    // Validate required configuration
    const missingConfig: string[] = [];

    if (!AZURE_SQL_CONFIG.resources || AZURE_SQL_CONFIG.resources.length === 0) {
      missingConfig.push("AZURE_SQL_SERVERS or AZURE_SQL_SERVER/AZURE_SQL_DATABASE");
    }

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing Azure SQL Database configuration: ${missingConfig.join(", ")}. ` +
        `Configure via AZURE_SQL_SERVERS JSON array or legacy AZURE_SQL_SERVER/AZURE_SQL_DATABASE variables.`
      );
    }

    azureSqlService = new AzureSqlService(AZURE_SQL_CONFIG);
    console.error("Azure SQL Database service initialized");
  }
  return azureSqlService;
}
```

**Cleanup Handlers ([src/index.ts](src/index.ts:6970)):**
```typescript
process.on('SIGINT', async () => {
  console.error('Shutting down gracefully (SIGINT)...');
  if (azureSqlService) {
    await azureSqlService.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down gracefully (SIGTERM)...');
  if (azureSqlService) {
    await azureSqlService.close();
  }
  process.exit(0);
});
```

### Formatting Utilities ([src/utils/sql-formatters.ts](src/utils/sql-formatters.ts))

The SQL formatters transform raw query results into human-readable markdown:

**Key Formatters:**
- `formatSqlResultsAsMarkdown()` - Convert query results to markdown tables
- `formatTableList()` - Format table listings with row counts and sizes
- `formatViewList()` - Format view listings
- `formatProcedureList()` - Format stored procedure listings
- `formatTriggerList()` - Format trigger listings with status
- `formatFunctionList()` - Format function listings
- `formatTableSchemaAsMarkdown()` - Comprehensive table schema with columns, indexes, FKs
- `formatDatabaseOverview()` - Complete database overview with all objects

**Example Output:**
```markdown
## Database Tables (45 total)

| Schema | Table Name    | Rows    | Total Size | Data Size | Index Size |
|--------|---------------|---------|------------|-----------|------------|
| dbo    | OrderHistory  | 1.2M    | 450 MB     | 380 MB    | 70 MB      |
| dbo    | Users         | 250K    | 180 MB     | 150 MB    | 30 MB      |
| dbo    | Products      | 150K    | 95 MB      | 78 MB     | 17 MB      |
```

### Use Cases

**Database Investigation:**
- Explore unknown database schema
- Document database structure for new team members
- Investigate data issues without write access
- Review database objects (tables, views, procedures, triggers, functions)

**Data Analysis:**
- Ad-hoc queries for data investigation
- Verify data quality
- Extract data for reporting
- Troubleshoot application issues

**Schema Documentation:**
- Generate comprehensive database documentation
- Map table relationships
- Document indexes and constraints
- Review stored procedure logic

**Read-Only Operations:**
- Safe database access for non-DBA users
- Prevent accidental data modifications
- Audit all query operations
- Enforce row and size limits

### Security Considerations

**Query Safety:**
- **Read-only enforcement** - Only SELECT queries permitted
- **Keyword blacklist** - Blocks INSERT, UPDATE, DELETE, DROP, EXEC, and more
- **Comment removal** - Prevents comment-hiding attacks
- **Word boundary detection** - Uses regex `\b` to catch keyword variations
- **Query size limits** - 10MB response max, 1000 row max (configurable)
- **Timeout protection** - 30-second query timeout (configurable)
- **Audit logging** - All queries logged with execution time

**Credential Management:**
- **Never logged** - Credentials never appear in logs or errors
- **Sanitized errors** - Connection strings and passwords removed from error messages
- **Environment variables** - Credentials stored in environment, not code
- **Token-based auth** - Azure AD uses tokens, not stored passwords
- **Separate accounts** - Use dedicated read-only accounts, not admin accounts

**Database Permissions:**
For read-only access, the user/service principal needs:
```sql
ALTER ROLE db_datareader ADD MEMBER [mcp_readonly];
GRANT VIEW DEFINITION TO [mcp_readonly];
```

**Connection Security:**
- **SSL/TLS encryption** - All connections encrypted by default
- **Firewall rules** - Azure SQL firewall controls IP access
- **Connection pooling** - Limits concurrent connections (max 10 default)
- **Health checks** - Automatic connection validation and reconnection

### Error Handling

The service implements comprehensive error handling:

**Connection Errors:**
- Clear messages about server/database not found
- Firewall rule suggestions
- Authentication failure details (sanitized)
- Connection timeout handling

**Query Errors:**
- **Syntax errors** - Clear SQL syntax error messages
- **Permission errors** - Explains missing VIEW DEFINITION permission
- **Timeout errors** - Suggests query optimization
- **Result too large** - Provides row/size limit information

**Validation Errors:**
- **Write operation detected** - Explains read-only restriction
- **Dangerous keyword** - Identifies blocked keyword and category
- **Invalid query** - Suggests SELECT query format

### Performance Optimization

**Connection Pooling:**
- Reuses connections for multiple queries
- Configurable pool size (default: 0-10 connections)
- Automatic connection health checks
- Graceful connection disposal

**Query Optimization:**
- 30-second timeout encourages efficient queries
- Row limit (1000 default) prevents large result sets
- Response size limit (10MB) prevents memory issues
- Recommends using TOP, WHERE, and ORDER BY clauses

**Result Formatting:**
- Markdown formatting is client-side only
- No additional server load
- Efficient string building
- Minimal memory overhead

## Azure Service Bus Integration

### Overview

The Azure Service Bus integration enables read-only inspection of Service Bus queues and dead letter queues for troubleshooting, monitoring, and message investigation. It provides comprehensive queue health monitoring, dead letter analysis, and cross-service correlation with Application Insights and Log Analytics.

### Architecture

The Azure Service Bus integration provides access to Service Bus namespaces through the Azure Service Bus SDK using a dual client architecture.

**Service Class:** `ServiceBusService` ([src/ServiceBusService.ts](src/ServiceBusService.ts))
- Manages authentication (Entra ID OAuth or connection string)
- Provides read-only message inspection using `peekMessages()` only
- Implements dual client architecture (ServiceBusClient + ServiceBusAdministrationClient)
- Supports queue health monitoring and dead letter analysis
- Supports multiple namespaces with active/inactive flags

**Authentication Methods:**
1. **Microsoft Entra ID (OAuth 2.0)** - Recommended for production
   - Token-based authentication with automatic refresh
   - Uses `@azure/identity` ClientSecretCredential
   - Requires "Azure Service Bus Data Receiver" role
   - Better security and RBAC-based access control

2. **Connection String** - Simpler for testing
   - Direct connection string authentication
   - Requires SharedAccessKey with Listen permissions
   - Less secure than Entra ID (stored secrets)

**Configuration:**
Supports two configuration modes:
1. Multi-namespace (JSON array in `SERVICEBUS_RESOURCES`)
2. Single-namespace fallback (`SERVICEBUS_NAMESPACE`)

Each namespace has an `active` flag for quick toggling without removing configuration.

### Dual Client Architecture

The service uses two separate clients for different operations:

**ServiceBusClient** - Message operations:
- `peekMessages()` - Peek messages in queue (read-only)
- Session support with `sessionId` parameter
- Message search by correlation ID, message ID, or body content

**ServiceBusAdministrationClient** - Management operations:
- `getQueueRuntimeProperties()` - Queue properties (message counts, size)
- `getNamespaceProperties()` - Namespace-level info (tier, capacity)
- List queues with metadata

This separation ensures:
- Clean separation of concerns (data vs. management)
- Better error handling (different authentication scopes)
- Compliance with Azure SDK best practices

### Available Tools (8 total)

1. **`servicebus-list-namespaces`** - List configured namespaces (active and inactive)
2. **`servicebus-test-connection`** - Test connectivity and return namespace info
3. **`servicebus-list-queues`** - List all queues with metadata and health status
4. **`servicebus-peek-messages`** - Peek messages without removal (max 100)
5. **`servicebus-peek-deadletter`** - Peek dead letter queue messages
6. **`servicebus-get-queue-properties`** - Get queue properties and configuration
7. **`servicebus-search-messages`** - Search messages by criteria (max 500)
8. **`servicebus-get-namespace-properties`** - Get namespace properties (tier, capacity)

### Available Prompts (5 total)

1. **`servicebus-namespace-overview`** - Comprehensive namespace overview with all queues
2. **`servicebus-queue-health`** - Detailed queue health report with recommendations
3. **`servicebus-deadletter-analysis`** - DLQ investigation with pattern detection
4. **`servicebus-message-inspection`** - Single message inspection with cross-service recommendations
5. **`servicebus-cross-service-troubleshooting`** - Multi-service correlation report

### Service Implementation ([src/ServiceBusService.ts](src/ServiceBusService.ts))

**Core Architecture:**

```typescript
import {
  ServiceBusClient,
  ServiceBusAdministrationClient,
  ServiceBusReceivedMessage,
} from '@azure/service-bus';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { ClientSecretCredential } from '@azure/identity';

export class ServiceBusService {
  // Dual client architecture
  private clients: Map<string, ServiceBusClient> = new Map();
  private adminClients: Map<string, ServiceBusAdministrationClient> = new Map();

  // Token management (Entra ID)
  private msalClient: ConfidentialClientApplication | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  // Queue list caching (5-minute TTL)
  private queueListCache: Map<string, { data: QueueInfo[]; expires: number }> = new Map();

  // Core methods
  async testConnection(resourceId: string): Promise<ConnectionTestResult>
  async listQueues(resourceId: string): Promise<QueueInfo[]>
  async peekMessages(resourceId: string, queueName: string, maxMessages?: number, sessionId?: string)
  async peekDeadLetterMessages(resourceId: string, queueName: string, maxMessages?: number, sessionId?: string)
  async getQueueProperties(resourceId: string, queueName: string)
  async searchMessages(resourceId: string, queueName: string, criteria: SearchCriteria, maxMessages?: number)
  async getNamespaceProperties(resourceId: string)
  async close(): Promise<void>
}
```

**Token Management:**
- Uses MSAL for OAuth 2.0 authentication with scope `https://servicebus.azure.net/.default`
- Implements token caching with 5-minute buffer before 1-hour expiry
- Automatic token refresh on expiration
- Connection string mode bypasses token management

**Queue List Caching:**
```typescript
// Cache queue list for 5 minutes (configurable)
private queueListCache: Map<string, { data: QueueInfo[]; expires: number }> = new Map();

async listQueues(resourceId: string): Promise<QueueInfo[]> {
  const cacheKey = `${resourceId}:queues`;
  const cached = this.queueListCache.get(cacheKey);

  if (cached && Date.now() < cached.expires) {
    return cached.data; // Return cached data
  }

  // Fetch fresh queue list
  const queues = await this.fetchQueuesFromServiceBus(resourceId);

  // Cache for TTL (default: 300 seconds)
  const ttl = this.config.cacheQueueListTTL || 300;
  this.queueListCache.set(cacheKey, {
    data: queues,
    expires: Date.now() + (ttl * 1000)
  });

  return queues;
}
```

**Read-Only Message Inspection:**
```typescript
async peekMessages(
  resourceId: string,
  queueName: string,
  maxMessages?: number,
  sessionId?: string
): Promise<ServiceBusReceivedMessage[]> {
  const timer = auditLogger.startTimer();
  const limit = Math.min(maxMessages || 10, this.config.maxPeekMessages || 100);

  const client = await this.getServiceBusClient(resourceId);
  const receiver = sessionId
    ? client.acceptSession(queueName, sessionId)
    : client.createReceiver(queueName);

  try {
    // CRITICAL: Use peekMessages() only - never receiveMessages()
    const messages = await receiver.peekMessages(limit, {
      timeout: this.config.peekTimeout || 30000
    });

    // Optional: Sanitize messages (default: OFF)
    const sanitized = this.config.sanitizeMessages
      ? messages.map(m => this.sanitizeMessage(m))
      : messages;

    auditLogger.log({
      operation: 'peek-messages',
      operationType: 'READ',
      resourceId,
      componentType: 'Queue',
      componentName: queueName,
      success: true,
      parameters: { maxMessages: limit, sessionId },
      executionTimeMs: timer()
    });

    return sanitized;
  } finally {
    await receiver.close();
  }
}
```

**Dead Letter Queue Inspection:**
```typescript
async peekDeadLetterMessages(
  resourceId: string,
  queueName: string,
  maxMessages?: number,
  sessionId?: string
): Promise<ServiceBusReceivedMessage[]> {
  // Dead letter queue path: queueName/$DeadLetterQueue
  const dlqPath = `${queueName}/$DeadLetterQueue`;

  const client = await this.getServiceBusClient(resourceId);
  const receiver = sessionId
    ? client.acceptSession(dlqPath, sessionId)
    : client.createReceiver(dlqPath);

  try {
    const messages = await receiver.peekMessages(
      Math.min(maxMessages || 10, this.config.maxPeekMessages || 100)
    );

    return this.config.sanitizeMessages
      ? messages.map(m => this.sanitizeMessage(m))
      : messages;
  } finally {
    await receiver.close();
  }
}
```

**Message Search:**
```typescript
async searchMessages(
  resourceId: string,
  queueName: string,
  criteria: SearchCriteria,
  maxMessages?: number
): Promise<ServiceBusReceivedMessage[]> {
  const limit = Math.min(maxMessages || 100, this.config.maxSearchMessages || 500);
  const client = await this.getServiceBusClient(resourceId);
  const receiver = client.createReceiver(queueName);

  try {
    const results: ServiceBusReceivedMessage[] = [];
    let peekedCount = 0;

    // Peek messages in batches until limit reached or no more messages
    while (results.length < limit && peekedCount < limit * 2) {
      const batchSize = Math.min(100, limit - results.length);
      const batch = await receiver.peekMessages(batchSize);

      if (batch.length === 0) break;

      peekedCount += batch.length;

      // Client-side filtering
      for (const msg of batch) {
        if (this.matchesCriteria(msg, criteria)) {
          results.push(msg);
          if (results.length >= limit) break;
        }
      }
    }

    return results;
  } finally {
    await receiver.close();
  }
}

private matchesCriteria(msg: ServiceBusReceivedMessage, criteria: SearchCriteria): boolean {
  if (criteria.correlationId && msg.correlationId !== criteria.correlationId) return false;
  if (criteria.messageId && msg.messageId !== criteria.messageId) return false;
  if (criteria.sessionId && msg.sessionId !== criteria.sessionId) return false;

  if (criteria.bodyContains) {
    const bodyStr = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);
    if (!bodyStr.includes(criteria.bodyContains)) return false;
  }

  if (criteria.propertyKey && criteria.propertyValue) {
    const propValue = msg.applicationProperties?.[criteria.propertyKey];
    if (propValue !== criteria.propertyValue) return false;
  }

  return true;
}
```

**Queue Properties:**
```typescript
async getQueueProperties(resourceId: string, queueName: string) {
  const adminClient = await this.getAdminClient(resourceId);

  // Get runtime properties (message counts, size)
  const runtimeProps = await adminClient.getQueueRuntimeProperties(queueName);

  // Get queue properties (configuration)
  const queueProps = await adminClient.getQueue(queueName);

  return {
    name: queueName,
    activeMessageCount: runtimeProps.activeMessageCount,
    deadLetterMessageCount: runtimeProps.deadLetterMessageCount,
    scheduledMessageCount: runtimeProps.scheduledMessageCount,
    sizeInBytes: runtimeProps.sizeInBytes,
    maxSizeInMegabytes: queueProps.maxSizeInMegabytes,
    lockDuration: queueProps.lockDuration,
    maxDeliveryCount: queueProps.maxDeliveryCount,
    requiresDuplicateDetection: queueProps.requiresDuplicateDetection,
    requiresSession: queueProps.requiresSession,
    enablePartitioning: queueProps.enablePartitioning,
    status: queueProps.status,
    // ... more properties
  };
}
```

### Service Integration ([src/index.ts](src/index.ts))

**Configuration Parsing:**
```typescript
const SERVICEBUS_CONFIG: ServiceBusConfig = {
  resources: [],
  authMethod: (process.env.SERVICEBUS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'connection-string',
  tenantId: process.env.SERVICEBUS_TENANT_ID || '',
  clientId: process.env.SERVICEBUS_CLIENT_ID || '',
  clientSecret: process.env.SERVICEBUS_CLIENT_SECRET || '',
  sanitizeMessages: process.env.SERVICEBUS_SANITIZE_MESSAGES === 'true',
  maxPeekMessages: parseInt(process.env.SERVICEBUS_MAX_PEEK_MESSAGES || '100'),
  maxSearchMessages: parseInt(process.env.SERVICEBUS_MAX_SEARCH_MESSAGES || '500'),
  peekTimeout: parseInt(process.env.SERVICEBUS_PEEK_TIMEOUT || '30000'),
  retryMaxAttempts: parseInt(process.env.SERVICEBUS_RETRY_MAX_ATTEMPTS || '3'),
  retryDelay: parseInt(process.env.SERVICEBUS_RETRY_DELAY || '1000'),
  cacheQueueListTTL: parseInt(process.env.SERVICEBUS_CACHE_QUEUE_LIST_TTL || '300'),
};

// Multi-namespace configuration (JSON array)
if (process.env.SERVICEBUS_RESOURCES) {
  SERVICEBUS_CONFIG.resources = JSON.parse(process.env.SERVICEBUS_RESOURCES);
}
// Single-namespace fallback
else if (process.env.SERVICEBUS_NAMESPACE) {
  SERVICEBUS_CONFIG.resources = [{
    id: 'default',
    name: 'Default Service Bus',
    namespace: process.env.SERVICEBUS_NAMESPACE,
    active: true,
    connectionString: process.env.SERVICEBUS_CONNECTION_STRING || '',
    description: 'Default Service Bus namespace',
  }];
}
```

**Lazy Initialization Pattern:**
```typescript
let serviceBusService: ServiceBusService | null = null;

function getServiceBusService(): ServiceBusService {
  if (!serviceBusService) {
    const missingConfig: string[] = [];

    if (!SERVICEBUS_CONFIG.resources || SERVICEBUS_CONFIG.resources.length === 0) {
      missingConfig.push('SERVICEBUS_RESOURCES or SERVICEBUS_NAMESPACE');
    }

    if (SERVICEBUS_CONFIG.authMethod === 'entra-id') {
      if (!SERVICEBUS_CONFIG.tenantId) missingConfig.push('SERVICEBUS_TENANT_ID');
      if (!SERVICEBUS_CONFIG.clientId) missingConfig.push('SERVICEBUS_CLIENT_ID');
      if (!SERVICEBUS_CONFIG.clientSecret) missingConfig.push('SERVICEBUS_CLIENT_SECRET');
    }

    if (missingConfig.length > 0) {
      throw new Error(`Missing Service Bus configuration: ${missingConfig.join(', ')}`);
    }

    serviceBusService = new ServiceBusService(SERVICEBUS_CONFIG);
    console.error('Service Bus service initialized');
  }

  return serviceBusService;
}
```

**Cleanup Handlers ([src/index.ts](src/index.ts)):**
```typescript
process.on('SIGINT', async () => {
  console.error('Shutting down gracefully (SIGINT)...');
  if (azureSqlService) {
    await azureSqlService.close();
  }
  if (serviceBusService) {
    await serviceBusService.close(); // Close all clients
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down gracefully (SIGTERM)...');
  if (azureSqlService) {
    await azureSqlService.close();
  }
  if (serviceBusService) {
    await serviceBusService.close(); // Close all clients
  }
  process.exit(0);
});
```

### Formatting Utilities ([src/utils/servicebus-formatters.ts](src/utils/servicebus-formatters.ts))

The Service Bus formatters transform raw message data into human-readable analysis:

**Key Formatters:**
- `formatQueueListAsMarkdown()` - Queue table with health status indicators
- `formatMessagesAsMarkdown()` - Message list with metadata
- `formatMessageInspectionAsMarkdown()` - Detailed single message inspection
- `analyzeDeadLetterMessages()` - Pattern detection and failure analysis
- `formatDeadLetterAnalysisAsMarkdown()` - DLQ report with insights
- `formatNamespaceOverviewAsMarkdown()` - Complete namespace overview
- `detectMessageFormat()` - Detect message format (JSON/XML/text/binary)
- `generateServiceBusTroubleshootingGuide()` - Comprehensive troubleshooting report
- `generateCrossServiceReport()` - Multi-service correlation report
- `getQueueHealthStatus()` - Health status calculation (healthy/warning/critical)

**Queue Health Status:**
```typescript
export function getQueueHealthStatus(queue: QueueInfo): {
  status: 'healthy' | 'warning' | 'critical';
  icon: string;
  reason: string;
} {
  const dlqCount = queue.deadLetterMessageCount || 0;
  const activeCount = queue.activeMessageCount || 0;
  const size = queue.sizeInBytes || 0;
  const maxSize = (queue.maxSizeInMegabytes || 0) * 1024 * 1024;

  // Critical: DLQ has messages or queue is nearly full
  if (dlqCount > 0) {
    return {
      status: 'critical',
      icon: '🔴',
      reason: `${dlqCount} messages in dead letter queue`
    };
  }

  if (size > maxSize * 0.9) {
    return {
      status: 'critical',
      icon: '🔴',
      reason: `Queue is ${Math.round((size / maxSize) * 100)}% full`
    };
  }

  // Warning: High message backlog
  if (activeCount > 1000) {
    return {
      status: 'warning',
      icon: '⚠️',
      reason: `High message backlog (${activeCount} messages)`
    };
  }

  // Healthy
  return {
    status: 'healthy',
    icon: '✅',
    reason: 'Queue is operating normally'
  };
}
```

**Dead Letter Analysis:**
```typescript
export function analyzeDeadLetterMessages(messages: ServiceBusReceivedMessage[]): {
  insights: string[];
  recommendations: string[];
  reasonSummary: Array<{ reason: string; count: number }>;
  timeline: Array<{ hour: string; count: number }>;
} {
  // Group by dead letter reason
  const reasonCounts = new Map<string, number>();
  messages.forEach(msg => {
    const reason = msg.deadLetterReason || 'Unknown';
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
  });

  // Build insights
  const insights: string[] = [
    `- Total dead letter messages: ${messages.length}`,
    `- Unique failure reasons: ${reasonCounts.size}`
  ];

  // Top reasons
  const sortedReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  sortedReasons.forEach(([reason, count]) => {
    insights.push(`- ${count} messages failed due to ${reason}`);
  });

  // Timeline analysis (hourly)
  const hourCounts = new Map<string, number>();
  messages.forEach(msg => {
    const hour = new Date(msg.enqueuedTimeUtc).toISOString().substring(0, 13);
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  });

  // Recommendations
  const recommendations: string[] = [];
  if (reasonCounts.has('MaxDeliveryCountExceeded')) {
    recommendations.push('⚠️ Review message processing logic - messages failing after max retries');
    recommendations.push('🔍 Consider increasing max delivery count or implementing retry with backoff');
  }
  if (reasonCounts.has('MessageLockLostException')) {
    recommendations.push('⚠️ Processing taking too long - increase lock duration or optimize processing');
  }

  return {
    insights,
    recommendations,
    reasonSummary: sortedReasons.map(([reason, count]) => ({ reason, count })),
    timeline: Array.from(hourCounts.entries()).map(([hour, count]) => ({ hour, count }))
  };
}
```

**Message Format Detection:**
```typescript
export function detectMessageFormat(message: ServiceBusReceivedMessage): {
  format: 'json' | 'xml' | 'text' | 'binary' | 'unknown';
  isValid: boolean;
  error?: string;
} {
  const body = message.body;
  const contentType = message.contentType;

  // Check content type hint
  if (contentType?.includes('json')) {
    try {
      JSON.parse(typeof body === 'string' ? body : JSON.stringify(body));
      return { format: 'json', isValid: true };
    } catch (e: any) {
      return { format: 'json', isValid: false, error: e.message };
    }
  }

  if (contentType?.includes('xml')) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    if (bodyStr.trim().startsWith('<')) {
      return { format: 'xml', isValid: true };
    }
  }

  // Auto-detect
  if (typeof body === 'object') {
    return { format: 'json', isValid: true };
  }

  if (typeof body === 'string') {
    // Try JSON
    if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
      try {
        JSON.parse(body);
        return { format: 'json', isValid: true };
      } catch {
        return { format: 'text', isValid: true };
      }
    }

    // Try XML
    if (body.trim().startsWith('<')) {
      return { format: 'xml', isValid: true };
    }

    // Plain text
    return { format: 'text', isValid: true };
  }

  // Binary
  if (Buffer.isBuffer(body) || body instanceof ArrayBuffer) {
    return { format: 'binary', isValid: true };
  }

  return { format: 'unknown', isValid: false };
}
```

### Use Cases

**Queue Health Monitoring:**
- Monitor all queues for backlog and failures
- Track dead letter queue growth
- Identify queues approaching size limits
- Generate health reports with actionable recommendations

**Dead Letter Queue Investigation:**
- Analyze failure patterns and reasons
- Identify common error scenarios
- Track failure timeline
- Generate recommendations for fixes

**Message Tracing:**
- Search messages by correlation ID
- Trace message flow across queues
- Correlate with Application Insights and Log Analytics
- Investigate specific order/transaction

**Cross-Service Troubleshooting:**
- Combine Service Bus, Application Insights, and Log Analytics data
- Correlation by correlation ID
- Timeline analysis across services
- Root cause identification

**Session-Enabled Queue Management:**
- Inspect messages by session ID
- FIFO ordering verification
- Session-specific troubleshooting

### Security Considerations

**Read-Only by Design:**
- Uses `peekMessages()` only - never `receiveMessages()`
- Messages remain in queue after inspection
- No message deletion or modification
- Safe for production troubleshooting

**Credential Management:**
- Never log tokens or connection strings
- Store tokens in memory only (never persist)
- Clear tokens on service disposal
- Automatic token refresh (Entra ID)

**Data Sanitization (Optional):**
- Disabled by default (`SERVICEBUS_SANITIZE_MESSAGES=false`)
- When enabled, redacts:
  - Message bodies containing potential PII
  - Application properties matching sensitive patterns
  - Connection strings in error messages
- Use when sharing message data externally

**RBAC and Permissions:**
For Entra ID authentication, the service principal must have:
- "Azure Service Bus Data Receiver" role on namespace
- Role can be assigned at namespace or resource group level
- Read-only access only (no send/delete permissions)

### Design Patterns

**Dual Client Architecture:**
- ServiceBusClient for message operations
- ServiceBusAdministrationClient for management operations
- Separation of concerns (data vs. config)
- Independent error handling

**Lazy Initialization:**
- Service initialized on first tool/prompt invocation
- Validates configuration before initialization
- Caches clients for reuse

**Queue List Caching:**
- 5-minute TTL cache (configurable)
- Reduces API calls to Service Bus
- Automatic invalidation on errors

**Message Sanitization:**
- Optional feature (OFF by default)
- Client-side sanitization after peek
- Configurable via environment variable

**Session Support:**
- Optional `sessionId` parameter
- Automatic session acceptance
- FIFO ordering within session

**Audit Logging:**
All operations are logged with execution time:
```typescript
auditLogger.log({
  operation: 'peek-messages',
  operationType: 'READ',
  resourceId: 'prod',
  componentType: 'Queue',
  componentName: 'orders-queue',
  success: true,
  parameters: { maxMessages: 10, sessionId: null },
  executionTimeMs: 156
});
```

### Error Handling

The service implements comprehensive error handling:

**Authentication Errors (401/403):**
- Clear messages about missing/invalid credentials
- Token expiration detection with refresh retry
- Permission requirements (Data Receiver role)

**Connection Errors:**
- Network connectivity detection
- Firewall rule suggestions
- Namespace validation
- Queue not found with queue list

**Peek Errors:**
- Timeout handling (30-second default)
- Empty queue detection
- Session ID validation
- Lock lost exceptions

**Queue Errors:**
- Queue not found with available queues
- Session-enabled queue without session ID
- Message lock lost (processing too slow)
- Queue disabled or inactive

### Performance Optimization

**Caching:**
- Queue list cached for 5 minutes
- Reduces API calls by 95%+
- Configurable TTL via `SERVICEBUS_CACHE_QUEUE_LIST_TTL`

**Batching:**
- Peek operations use batching internally
- Search operations peek in batches (100 at a time)
- Reduces network round-trips

**Limits:**
- Default peek limit: 10 messages (max: 100)
- Default search limit: 100 messages (max: 500)
- Configurable via environment variables
- Prevents large response sizes

**Client Reuse:**
- Clients cached per namespace
- Automatic client creation on first use
- Graceful client disposal on shutdown

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

## GitHub Enterprise Cloud Integration

### Overview

The GitHub Enterprise Cloud integration enables AI-assisted bug troubleshooting by correlating source code in GitHub with deployed PowerPlatform plugins and Azure DevOps work items. It provides comprehensive access to repositories, branches, commits, pull requests, and code search.

**Primary Use Case:** Investigate bugs by finding source code related to ADO work items, analyzing recent changes, and correlating with deployed plugins.

### Architecture

The GitHub Enterprise integration provides access to GitHub Enterprise Cloud repositories through the GitHub REST API v3.

**Service Class:** `GitHubEnterpriseService` ([src/GitHubEnterpriseService.ts](src/GitHubEnterpriseService.ts))
- Manages authentication (PAT or GitHub App)
- Executes API requests via Octokit client
- Implements branch auto-detection with typo handling
- Provides response caching with configurable TTL
- Supports multiple repositories with active/inactive flags

**Authentication Methods:**
1. **Personal Access Token (PAT)** - Recommended for individual use
   - Simpler configuration
   - Single token for all repositories
   - Scopes: `repo` (required), `read:org` (optional)
   - No expiration (unless revoked)

2. **GitHub App** - Advanced for organization-wide deployments
   - Higher API rate limits
   - Installation-level access control
   - Automatic token refresh (1-hour expiry)
   - Requires app registration and private key

**Configuration:**
Supports multi-repository configuration with JSON array:
```json
GHE_REPOS=[{
  "id": "plugin-core",
  "owner": "myorg",
  "repo": "PluginCore",
  "defaultBranch": "release/9.0",
  "active": true,
  "description": "Core plugins"
}]
```

### Available Tools (22 total)

**Repository Management:**
1. **`ghe-list-repos`** - List configured repositories with status
2. **`ghe-clear-cache`** - Clear cached responses (pattern/repo-based)

**Branch Operations:**
3. **`ghe-list-branches`** - List branches with protection status filter
4. **`ghe-get-default-branch`** - Auto-detect branch with typo handling
5. **`ghe-get-branch-details`** - Branch metadata and commit info
6. **`ghe-compare-branches`** - Compare branches with file changes
7. **`ghe-create-branch`** - Create branch (requires `GHE_ENABLE_CREATE=true`)

**File Operations:**
8. **`ghe-get-file`** - Get file content with auto-branch detection
9. **`ghe-list-files`** - List directory contents
10. **`ghe-get-directory-structure`** - Recursive directory tree
11. **`ghe-get-file-history`** - File commit history
12. **`ghe-update-file`** - Update file (requires `GHE_ENABLE_WRITE=true`)
13. **`ghe-create-file`** - Create file (requires `GHE_ENABLE_CREATE=true`)

**Commit Operations:**
14. **`ghe-get-commits`** - Commit history with filters (author, path, date range)
15. **`ghe-get-commit-details`** - Detailed commit info with file changes
16. **`ghe-get-commit-diff`** - Unified diff format for commit
17. **`ghe-search-commits`** - Search by message/hash (supports #1234 work item refs)

**Pull Request Operations:**
18. **`ghe-list-pull-requests`** - List PRs with state/branch filters
19. **`ghe-get-pull-request`** - PR details with metadata
20. **`ghe-get-pr-files`** - Files changed in PR

**Search Operations:**
21. **`ghe-search-code`** - Search code across repos with path/extension filters
22. **`ghe-search-repos`** - Search repositories by name/description

### Available Prompts (5 total)

1. **`ghe-repo-overview`** - Repository overview with branch analysis and recent commits
2. **`ghe-code-search-report`** - Formatted code search results with relevance scoring
3. **`ghe-branch-comparison-report`** - Branch comparison with deployment checklist
4. **`ghe-troubleshooting-guide`** - Bug troubleshooting with cross-service correlation
5. **`ghe-deployment-report`** - Deployment-ready report with rollback plan

### Service Implementation

**Core Architecture:**
```typescript
export class GitHubEnterpriseService {
  private config: GitHubEnterpriseConfig;
  private octokit: Octokit | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;
  private cache: Map<string, { data: any; expires: number }> = new Map();

  // Authentication
  private async initializeOctokit(): Promise<void>
  private async getAccessToken(): Promise<string>

  // Caching
  private getCacheKey(method, repo, resource, params?): string
  private getCached<T>(key: string): T | null
  private setCached(key: string, data: any): void
  clearCache(pattern?: string, repoId?: string): number

  // Core methods
  async getDefaultBranch(repoId, userSpecified?): Promise<BranchSelection>
  async listBranches(repoId, protectedOnly?): Promise<any[]>
  async getFile(repoId, path, branch?): Promise<any>
  async searchCode(query, repoId?, path?, extension?): Promise<any>
  async getCommits(repoId, branch?, since?, until?, author?, path?, limit?): Promise<any[]>
  async compareBranches(repoId, base, head): Promise<any>
  // ... 15 more methods
}
```

**Token Management:**
- PAT: Direct token usage (no expiration logic)
- GitHub App: Token caching with 5-minute buffer before 1-hour expiry
- Automatic token refresh on expiration

### Branch Auto-Detection with Typo Handling

One of the key features is intelligent branch detection:

**Algorithm:**
1. **User-specified branch** (highest priority) - Use if provided
2. **Configured default** - Use `defaultBranch` from repo config
3. **Auto-detect release branch** - Find highest version `release/X.Y` branch
   - Case-insensitive matching (`Release/`, `RELEASE/`, `release/`)
   - Version parsing and comparison (9.0 > 8.0)
   - Graceful fallback if no release branches
4. **Repository default** - Query GitHub API for default branch
5. **Fallback to main/master** - If all else fails

**Example:**
```typescript
const branchInfo = await service.getDefaultBranch('plugin-core', 'release/9.0');
// Returns:
{
  branch: 'release/9.0',
  reason: 'User-specified branch',
  confidence: 'high',
  alternatives: ['release/8.0', 'main']
}
```

**Typo Handling:**
If user specifies `relase/9.0` (typo), the service:
1. Attempts exact match (fails)
2. Tries case-insensitive match
3. Suggests similar branch names
4. Falls back to auto-detection
5. Returns selected branch with `confidence: 'medium'`

### Caching Strategy

**Response Caching:**
```typescript
// Cache key format: {method}:{owner}/{repo}:{resource}:{params}
"GET:myorg/PluginCore:branches:{}"
"GET:myorg/PluginCore:file:src/Plugins/ContactPlugin.cs"
```

**Cache Configuration:**
- `GHE_ENABLE_CACHE=true` - Enable/disable caching
- `GHE_CACHE_TTL=300` - Time-to-live in seconds (default: 5 minutes)

**Cache Clearing:**
```typescript
// Clear all cache
await service.clearCache();

// Clear cache for specific repo
await service.clearCache({ repoId: 'plugin-core' });

// Clear cache for specific file pattern
await service.clearCache({ pattern: 'ContactPlugin.cs' });
```

**Developer Workflow:**
1. Make code changes and push to GitHub
2. Clear cache: `ghe-clear-cache` tool
3. Query updated code: `ghe-get-file` or `ghe-search-code`

### Formatters ([src/utils/ghe-formatters.ts](src/utils/ghe-formatters.ts))

Markdown formatters transform GitHub API responses:

- `formatBranchListAsMarkdown()` - Branch table with commit info
- `formatCommitHistoryAsMarkdown()` - Commit timeline
- `formatCodeSearchResultsAsMarkdown()` - Search results with relevance
- `formatPullRequestsAsMarkdown()` - PR table with state icons
- `formatFileTreeAsMarkdown()` - Directory tree visualization
- `formatDirectoryContentsAsMarkdown()` - File listing table
- `analyzeBranchComparison()` - Extract insights from branch diff
- `generateDeploymentChecklist()` - Auto-generate deployment tasks
- `formatCommitDetailsAsMarkdown()` - Commit details with file table
- `formatPullRequestDetailsAsMarkdown()` - PR details with stats
- `formatRepositoryOverviewAsMarkdown()` - Comprehensive repo report
- `sanitizeErrorMessage()` - Remove sensitive tokens from errors

### Use Cases

**Bug Troubleshooting (Cross-Service):**
1. User reports bug via ADO work item #1234
2. Query ADO: `get-work-item` → Get bug description
3. Search commits: `ghe-search-commits` with "AB#1234" → Find related commits
4. Get commit details: `ghe-get-commit-details` → See code changes
5. Get current code: `ghe-get-file` → Verify current implementation
6. Check deployed plugin: `get-plugin-assembly-complete` → Verify deployment
7. Analyze logs: `appinsights-get-exceptions` → Check for runtime errors
8. Generate report: `ghe-troubleshooting-guide` prompt

**Deployment Analysis:**
1. Compare branches: `ghe-compare-branches` (release/9.0 vs main)
2. Review file changes: Analyze modified plugins
3. Generate checklist: `ghe-deployment-report` prompt
4. Verify build: Check plugin DLLs in artifacts
5. Deploy to PowerPlatform: `update-plugin-assembly`
6. Merge to main: `git merge` after successful deployment

**Code Review Workflow:**
1. List PRs: `ghe-list-pull-requests` with state=open
2. Get PR details: `ghe-get-pull-request`
3. Get PR files: `ghe-get-pr-files` → See changes
4. Review commits: `ghe-get-commits` in PR branch
5. Generate report: `ghe-branch-comparison-report` prompt

### Error Handling

The service implements comprehensive error handling:

**Authentication Errors (401/403):**
- Clear messages about missing/invalid credentials
- Token expiration detection with refresh retry
- Permission requirements (repo scope)

**Rate Limiting (429):**
- Retry-after header parsing
- Clear messages about current limits
- Recommendations for auth method upgrade (PAT → GitHub App)

**Branch Errors:**
- Branch not found with similar suggestions
- Default branch auto-detection fallback
- Typo-tolerant branch matching

**File Errors:**
- File not found with directory listing
- File too large (exceeds `GHE_MAX_FILE_SIZE`)
- Binary file detection

**Search Errors:**
- Empty results with query suggestions
- Invalid query syntax with examples
- Search scope too broad warnings

### Security Considerations

**Credential Management:**
- Never log tokens or credentials
- Store tokens in memory only (never persist)
- Clear tokens on service disposal
- Support for `.env` files for local development

**Write Operations Safety:**
- Write operations disabled by default
- Require explicit environment flags:
  - `GHE_ENABLE_WRITE=true` for updates
  - `GHE_ENABLE_CREATE=true` for creates
- No delete operations (too dangerous)
- Commit messages include user context

**Repository Access:**
- Only configured repositories accessible
- Active/inactive toggle for quick access control
- Repository-level permissions enforced by GitHub

**Token Sanitization:**
- Sanitize error messages (remove `ghp_*` tokens)
- Remove sensitive data from logs
- Truncate long responses automatically

### Integration Patterns

**PowerPlatform Correlation:**
```typescript
// Find plugin source code
const plugin = await getPluginAssemblyComplete('PluginCore');
const sourceFile = await gheService.getFile('plugin-core', 'src/Plugins/ContactPlugin.cs');
// Compare deployed vs source
```

**Azure DevOps Correlation:**
```typescript
// Find work item code changes
const workItem = await getWorkItem('Project', 1234);
const commits = await gheService.searchCommits('plugin-core', 'AB#1234');
// Trace work item to code changes
```

**Application Insights Correlation:**
```typescript
// Investigate exception
const exceptions = await appInsightsService.getRecentExceptions('prod-api');
const code = await gheService.searchCode(exceptions[0].type, 'plugin-core');
// Find source of exception
```

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
