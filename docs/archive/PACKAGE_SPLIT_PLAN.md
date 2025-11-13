# MCP Consultant Tools - Package Split Strategy

**Document Version:** 1.0
**Date:** 2025-01-11
**Status:** Planning Phase

---

## Executive Summary

**Current State:** Monolithic MCP server (28,755 lines of TypeScript, 172 tools, 47 prompts, 9 integrations)

**Target State:** Modular package architecture with 9 independently published npm packages

**Recommended Approach:** **Monorepo with npm workspaces** (single Git repo, multiple npm packages)

**Why Monorepo?**
- Industry standard for multi-package projects (Babel, Jest, React, TypeScript, etc.)
- Much easier to maintain (single clone, shared tooling, atomic commits)
- Simpler CI/CD and cross-package changes
- Each package can still be published independently to npm
- **No need to split into multiple Git repositories**

**Package Structure (9 packages total):**
1. `@mcp-consultant-tools/core` - Shared utilities (audit-logger, MCP helpers)
2. `@mcp-consultant-tools/powerplatform` - PowerPlatform + SharePoint combined (4,480 LOC, 85+ tools, 23 prompts)
3. `@mcp-consultant-tools/azure-devops` (782 LOC, 13 tools, 4 prompts)
4. `@mcp-consultant-tools/figma` (2,409 LOC, 2 tools, 0 prompts)
5. `@mcp-consultant-tools/application-insights` (657 LOC, 10 tools, 5 prompts)
6. `@mcp-consultant-tools/log-analytics` (971 LOC, 10 tools, 5 prompts)
7. `@mcp-consultant-tools/azure-sql` (1,185 LOC, 11 tools, 3 prompts)
8. `@mcp-consultant-tools/service-bus` (1,558 LOC, 8 tools, 5 prompts)
9. `@mcp-consultant-tools/github-enterprise` (1,786 LOC, 22 tools, 5 prompts)

**Backward Compatibility:** The existing `mcp-consultant-tools` becomes a meta-package that depends on all others - **no breaking changes for existing users!**

---

## Codebase Analysis Summary

### Current Structure

```
src/
├── index.ts (11,887 lines) ────────────── Monolithic MCP server entry point
├── *Service.ts (9 files, 9,492 lines) ── Independent service implementations
├── utils/ (10 files, 4,128 lines) ────── Shared and service-specific utilities
├── types/ (3 files, ~25K chars) ──────── Type definitions
└── figma/ (13 files, 2,258 lines) ────── Figma-specific subdirectory

Total TypeScript: 28,755 lines across ~35 files
```

### Service Independence Analysis

| Service | Size (LOC) | Tools | Prompts | Dependencies | Status |
|---------|-----------|-------|---------|--------------|--------|
| **PowerPlatform** | 3,012 | 70+ | 13 | @azure/msal-node, 4 utilities | ✅ Independent |
| **SharePoint** | 1,468 | 15 | 10 | @microsoft/microsoft-graph-client | ⚠️ Validates PP records |
| **GitHub Enterprise** | 1,363 | 22 | 5 | @octokit/rest | ✅ Independent |
| **Azure SQL** | 878 | 11 | 3 | mssql | ✅ Independent |
| **Service Bus** | 874 | 8 | 5 | @azure/service-bus | ✅ Independent |
| **Azure DevOps** | 782 | 13 | 4 | axios (PAT auth) | ✅ Independent |
| **Log Analytics** | 523 | 10 | 5 | @azure/msal-node | ✅ Independent (credential fallback to AppInsights) |
| **Application Insights** | 441 | 10 | 5 | @azure/msal-node | ✅ Independent |
| **Figma** | 151 + 2,258 | 2 | 0 | @figma/rest-api-spec | ✅ Independent |

**Key Finding:** All services are highly decoupled at the service layer. Only SharePoint has a logical dependency on PowerPlatform (validation methods).

### Shared Code Analysis

**Core Shared Utilities (Must Extract):**
- `audit-logger.ts` (368 lines) - Used by 5 services
- MCP server boilerplate patterns - Tool/prompt registration helpers

**Service-Specific Utilities (Keep in Each Package):**
- `appinsights-formatters.ts` (216 lines) → AppInsights package
- `loganalytics-formatters.ts` (448 lines) → LogAnalytics package
- `sql-formatters.ts` (307 lines) → AzureSql package
- `servicebus-formatters.ts` (684 lines) → ServiceBus package
- `sharepoint-formatters.ts` (543 lines) → SharePoint package
- `ghe-formatters.ts` (423 lines) → GitHub Enterprise package
- `rate-limiter.ts` (307 lines) → PowerPlatform package
- `iconManager.ts` (407 lines) → PowerPlatform package
- `bestPractices.ts` (425 lines) → PowerPlatform package

---

## Implementation Phases

### Phase 1: Prepare Monorepo Structure (No Breaking Changes)

**Duration:** 2-4 hours

#### 1.1 Create npm workspace configuration

**Create root package.json:**
```json
{
  "name": "mcp-consultant-tools-monorepo",
  "version": "16.0.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "clean": "npm run clean --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "publish-all": "npm run build && npm publish --workspaces --access public"
  },
  "devDependencies": {
    "typescript": "^5.7.3"
  }
}
```

#### 1.2 Create directory structure

```bash
mkdir -p packages/{core,powerplatform,azure-devops,figma,application-insights,log-analytics,azure-sql,service-bus,github-enterprise,meta}
```

**Final structure:**
```
mcp-consultant-tools/
├── packages/
│   ├── core/
│   ├── powerplatform/
│   ├── azure-devops/
│   ├── figma/
│   ├── application-insights/
│   ├── log-analytics/
│   ├── azure-sql/
│   ├── service-bus/
│   ├── github-enterprise/
│   └── meta/ (backward compatibility)
├── package.json (workspace root)
├── tsconfig.base.json (shared config)
├── .gitignore
└── README.md
```

#### 1.3 Create shared TypeScript config

**tsconfig.base.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

#### 1.4 Update .gitignore

```gitignore
# Workspace
node_modules/
packages/*/node_modules/
packages/*/build/

# Environment
.env
packages/*/.env

# Build artifacts
*.log
*.tsbuildinfo
```

---

### Phase 2: Extract Core Package

**Duration:** 4-6 hours

#### 2.1 Create `packages/core/` structure

```
packages/core/
├── src/
│   ├── index.ts (exports all utilities)
│   ├── utils/
│   │   └── audit-logger.ts (move from root src/utils/)
│   ├── helpers/
│   │   └── mcp-server-helpers.ts (NEW - extracted patterns)
│   └── types/
│       └── common-types.ts (shared types, if any)
├── package.json
├── tsconfig.json (extends ../../tsconfig.base.json)
├── README.md
└── LICENSE (copy from root)
```

#### 2.2 Create package.json

**packages/core/package.json:**
```json
{
  "name": "@mcp-consultant-tools/core",
  "version": "1.0.0",
  "description": "Core utilities for MCP Consultant Tools",
  "main": "./build/index.js",
  "types": "./build/index.d.ts",
  "exports": {
    ".": "./build/index.js",
    "./audit-logger": "./build/utils/audit-logger.js",
    "./mcp-helpers": "./build/helpers/mcp-server-helpers.js"
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf build",
    "prepublishOnly": "npm run build"
  },
  "files": [
    "build",
    "README.md",
    "LICENSE"
  ],
  "keywords": ["mcp", "utilities", "audit"],
  "license": "MIT",
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.7.3"
  }
}
```

#### 2.3 Create tsconfig.json

**packages/core/tsconfig.json:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./build",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

#### 2.4 Move audit-logger.ts

```bash
cp src/utils/audit-logger.ts packages/core/src/utils/
```

#### 2.5 Create MCP Server Helpers (NEW)

**packages/core/src/helpers/mcp-server-helpers.ts:**
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export interface MCP ServerOptions {
  name: string;
  version: string;
  capabilities?: {
    tools?: {};
    prompts?: {};
  };
}

/**
 * Create an MCP server with standard capabilities
 */
export function createMcpServer(options: MCPServerOptions): Server {
  return new Server(
    {
      name: options.name,
      version: options.version
    },
    {
      capabilities: options.capabilities || {
        tools: {},
        prompts: {}
      }
    }
  );
}

/**
 * Helper for consistent error responses
 */
export function createErrorResponse(error: Error | unknown, operation: string) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text",
        text: `Error during ${operation}: ${message}`
      }
    ],
    isError: true
  };
}

/**
 * Helper for consistent success responses
 */
export function createSuccessResponse(data: any) {
  return {
    content: [
      {
        type: "text",
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      }
    ]
  };
}
```

#### 2.6 Create index.ts (exports)

**packages/core/src/index.ts:**
```typescript
// Export utilities
export * from './utils/audit-logger.js';

// Export helpers
export * from './helpers/mcp-server-helpers.js';

// Export types
export * from './types/common-types.js';
```

#### 2.7 Create README

**packages/core/README.md:**
```markdown
# @mcp-consultant-tools/core

Core utilities and helpers for MCP Consultant Tools packages.

## Installation

```bash
npm install @mcp-consultant-tools/core
```

## Usage

### Audit Logger

```typescript
import { auditLogger } from '@mcp-consultant-tools/core/audit-logger';

const timer = auditLogger.startTimer();

// ... perform operation

auditLogger.log({
  operation: 'get-entity-metadata',
  operationType: 'READ',
  componentType: 'Entity',
  componentName: 'account',
  success: true,
  executionTimeMs: timer()
});
```

### MCP Server Helpers

```typescript
import { createMcpServer, createSuccessResponse } from '@mcp-consultant-tools/core/mcp-helpers';

const server = createMcpServer({
  name: 'my-mcp-service',
  version: '1.0.0'
});

// Use helper for responses
return createSuccessResponse(data);
```

## License

MIT
```

#### 2.8 Build and Test

```bash
cd packages/core
npm install
npm run build
```

#### 2.9 Publish Core Package

```bash
cd packages/core
npm publish --access public
```

**Note:** Verify package name `@mcp-consultant-tools/core` is available first. If taken, use alternative like `@mcp-tools/core`.

---

### Phase 3: Extract Service Packages (One-by-One)

**Duration:** 2-3 hours per service × 8 services = 16-24 hours

**Order of extraction (easiest to hardest):**
1. Figma (no dependencies, self-contained subdirectory)
2. Azure DevOps (no shared utilities)
3. Application Insights
4. GitHub Enterprise
5. Azure SQL
6. Service Bus
7. Log Analytics
8. PowerPlatform + SharePoint (combined, most complex)

#### 3.1 Template Structure (Example: azure-sql)

```
packages/azure-sql/
├── src/
│   ├── index.ts (MCP server entry point)
│   ├── AzureSqlService.ts (move from root src/)
│   ├── utils/
│   │   └── sql-formatters.ts (move from root src/utils/)
│   └── types/
│       └── azure-sql-types.ts (if needed)
├── docs/
│   ├── README.md (comprehensive guide)
│   ├── SETUP.md (authentication & configuration)
│   ├── TOOLS.md (tool reference)
│   └── TROUBLESHOOTING.md (common issues)
├── package.json
├── tsconfig.json
├── .env.example
└── LICENSE
```

#### 3.2 Package.json Template

**packages/azure-sql/package.json:**
```json
{
  "name": "@mcp-consultant-tools/azure-sql",
  "version": "1.0.0",
  "description": "Azure SQL Database integration for Model Context Protocol",
  "main": "./build/index.js",
  "types": "./build/index.d.ts",
  "bin": {
    "mcp-azure-sql": "./build/index.js"
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf build",
    "prepublishOnly": "npm run build"
  },
  "files": [
    "build",
    "docs",
    "README.md",
    "LICENSE"
  ],
  "dependencies": {
    "@mcp-consultant-tools/core": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.7.0",
    "mssql": "^11.0.1",
    "dotenv": "^17.2.3",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "@types/node": "^20.0.0"
  },
  "keywords": ["mcp", "azure", "sql", "database", "mssql"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/klemensms/mcp-consultant-tools.git",
    "directory": "packages/azure-sql"
  }
}
```

#### 3.3 Service Entry Point Template

**packages/azure-sql/src/index.ts:**
```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AzureSqlService } from "./AzureSqlService.js";
import { auditLogger } from "@mcp-consultant-tools/core/audit-logger";
import { createSuccessResponse, createErrorResponse } from "@mcp-consultant-tools/core/mcp-helpers";
import * as sqlFormatters from "./utils/sql-formatters.js";
import dotenv from "dotenv";
import { z } from "zod";

// Suppress dotenv output (MCP protocol requirement)
const originalWrite = process.stdout.write;
process.stdout.write = () => true;
dotenv.config();
process.stdout.write = originalWrite;

// Initialize server
const server = new Server(
  { name: "mcp-azure-sql", version: "1.0.0" },
  { capabilities: { tools: {}, prompts: {} } }
);

// Configuration loading (from environment variables)
const AZURE_SQL_CONFIG = {
  resources: process.env.AZURE_SQL_SERVERS
    ? JSON.parse(process.env.AZURE_SQL_SERVERS)
    : [],
  queryTimeout: parseInt(process.env.AZURE_SQL_QUERY_TIMEOUT || "30000"),
  maxResultRows: parseInt(process.env.AZURE_SQL_MAX_RESULT_ROWS || "1000"),
  // ... rest of config
};

// Lazy initialization
let azureSqlService: AzureSqlService | null = null;

function getAzureSqlService(): AzureSqlService {
  if (!azureSqlService) {
    azureSqlService = new AzureSqlService(AZURE_SQL_CONFIG);
    console.error("Azure SQL Database service initialized");
  }
  return azureSqlService;
}

// Register tools (11 tools from current index.ts)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "sql-list-servers",
        description: "List all configured SQL servers with active/inactive status",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      // ... remaining 10 tools
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "sql-list-servers": {
        const service = getAzureSqlService();
        const servers = await service.listServers();
        return createSuccessResponse(servers);
      }
      // ... remaining 10 tool handlers

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return createErrorResponse(error, request.params.name);
  }
});

// Register prompts (3 prompts)
// ... similar pattern

// Cleanup handlers
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

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Azure SQL MCP server running on stdio");
}

main().catch(console.error);
```

#### 3.4 Move Code for Each Service

**For each service (e.g., azure-sql):**

1. **Create package structure:**
   ```bash
   mkdir -p packages/azure-sql/{src,docs}
   ```

2. **Copy service file:**
   ```bash
   cp src/AzureSqlService.ts packages/azure-sql/src/
   ```

3. **Copy service-specific utilities:**
   ```bash
   mkdir -p packages/azure-sql/src/utils
   cp src/utils/sql-formatters.ts packages/azure-sql/src/utils/
   ```

4. **Extract tool/prompt registrations from root index.ts:**
   - Search for all `server.tool("sql-` in root index.ts
   - Copy tool definitions to new index.ts
   - Search for all `server.prompt("sql-` in root index.ts
   - Copy prompt definitions to new index.ts

5. **Update imports:**
   ```typescript
   // OLD (in root)
   import { auditLogger } from './utils/audit-logger.js';

   // NEW (in package)
   import { auditLogger } from '@mcp-consultant-tools/core/audit-logger';
   ```

6. **Copy documentation:**
   ```bash
   cp docs/documentation/AZURE_SQL.md packages/azure-sql/docs/README.md
   ```

7. **Create .env.example:**
   ```bash
   # Extract Azure SQL env vars from root .env.example
   grep "AZURE_SQL" .env.example > packages/azure-sql/.env.example
   ```

8. **Build and test:**
   ```bash
   cd packages/azure-sql
   npm install
   npm run build
   node build/index.js  # Test locally
   ```

9. **Publish:**
   ```bash
   npm publish --access public
   ```

#### 3.5 Service Extraction Checklist

For each of the 8 services, complete this checklist:

- [ ] Create package directory structure
- [ ] Create package.json with correct dependencies
- [ ] Create tsconfig.json extending base
- [ ] Copy service class (e.g., AzureSqlService.ts)
- [ ] Copy service-specific formatters
- [ ] Copy service-specific utilities (if any)
- [ ] Create new index.ts (MCP server entry point)
- [ ] Extract tool registrations from root index.ts
- [ ] Extract prompt registrations from root index.ts
- [ ] Update all imports (use @mcp-consultant-tools/core)
- [ ] Copy documentation from docs/documentation/{SERVICE}.md
- [ ] Create comprehensive README.md
- [ ] Create .env.example with service env vars
- [ ] Copy LICENSE file
- [ ] Build package (npm run build)
- [ ] Test package locally
- [ ] Publish to npm (npm publish --access public)

---

### Phase 4: Handle PowerPlatform + SharePoint

**Duration:** 4-6 hours

#### 4.1 Why Combine PowerPlatform + SharePoint?

**Reasons:**
1. **Hard dependency:** SharePoint validates PowerPlatform document locations
2. **Natural coupling:** Both are Microsoft Power Platform services
3. **Shared use cases:** Users typically need both together
4. **Simplified configuration:** Single package = fewer environment variables

#### 4.2 Package Structure

```
packages/powerplatform/
├── src/
│   ├── index.ts (MCP server entry point)
│   ├── PowerPlatformService.ts (move from root)
│   ├── SharePointService.ts (move from root)
│   ├── utils/
│   │   ├── audit-logger.ts → USE @mcp-consultant-tools/core
│   │   ├── rate-limiter.ts (move from root)
│   │   ├── iconManager.ts (move from root)
│   │   ├── bestPractices.ts (move from root)
│   │   └── sharepoint-formatters.ts (move from root)
│   └── types/
│       └── powerplatform-types.ts
├── docs/
│   ├── README.md (combined overview)
│   ├── POWERPLATFORM.md (detailed PowerPlatform guide)
│   ├── SHAREPOINT.md (detailed SharePoint guide)
│   ├── SETUP.md (authentication for both)
│   ├── TOOLS.md (all 85+ tools)
│   └── TROUBLESHOOTING.md
├── package.json
├── tsconfig.json
├── .env.example
└── LICENSE
```

#### 4.3 Package Configuration

**packages/powerplatform/package.json:**
```json
{
  "name": "@mcp-consultant-tools/powerplatform",
  "version": "1.0.0",
  "description": "Microsoft Power Platform & SharePoint Online integration for Model Context Protocol",
  "main": "./build/index.js",
  "types": "./build/index.d.ts",
  "bin": {
    "mcp-powerplatform": "./build/index.js"
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf build",
    "prepublishOnly": "npm run build"
  },
  "files": [
    "build",
    "docs",
    "README.md",
    "LICENSE"
  ],
  "dependencies": {
    "@mcp-consultant-tools/core": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.7.0",
    "@azure/msal-node": "^3.3.0",
    "@microsoft/microsoft-graph-client": "^3.0.7",
    "axios": "^1.8.3",
    "dotenv": "^17.2.3",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "@types/node": "^20.0.0"
  },
  "keywords": [
    "mcp",
    "powerplatform",
    "dynamics365",
    "dataverse",
    "sharepoint",
    "microsoft"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/klemensms/mcp-consultant-tools.git",
    "directory": "packages/powerplatform"
  }
}
```

#### 4.4 Environment Variables

Both PowerPlatform and SharePoint environment variables in a single `.env.example`:

```bash
# PowerPlatform Configuration
POWERPLATFORM_URL=https://yourenvironment.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=your-client-id
POWERPLATFORM_CLIENT_SECRET=your-client-secret
POWERPLATFORM_TENANT_ID=your-tenant-id

# PowerPlatform Feature Flags
POWERPLATFORM_ENABLE_CUSTOMIZATION=false
POWERPLATFORM_ENABLE_CREATE=false
POWERPLATFORM_ENABLE_UPDATE=false
POWERPLATFORM_ENABLE_DELETE=false
POWERPLATFORM_DEFAULT_SOLUTION=YourSolution

# SharePoint Configuration
SHAREPOINT_TENANT_ID=your-tenant-id  # Can reuse PowerPlatform tenant
SHAREPOINT_CLIENT_ID=your-client-id  # Can reuse PowerPlatform client
SHAREPOINT_CLIENT_SECRET=your-client-secret  # Can reuse PowerPlatform secret
SHAREPOINT_RESOURCES=[{"id":"main","name":"Main Site","hostname":"yourtenant.sharepoint.com","siteId":"site-guid","active":true}]

# SharePoint Options
SHAREPOINT_ENABLE_CACHE=true
SHAREPOINT_CACHE_TTL=300
SHAREPOINT_MAX_SEARCH_RESULTS=100
```

#### 4.5 Combined MCP Server Entry Point

The `index.ts` will initialize both services and register all 85+ tools and 23 prompts.

**Key points:**
- Both services initialized lazily
- SharePoint can call PowerPlatform methods directly (same process)
- Shared Entra ID credentials (same tenant, client ID, secret)

---

### Phase 5: Create Meta-Package (Backward Compatibility)

**Duration:** 2-4 hours

**Goal:** Ensure existing users of `mcp-consultant-tools` continue to work without any changes.

#### 5.1 Meta-Package Structure

```
packages/meta/
├── src/
│   └── index.ts (imports and combines all services)
├── package.json (named "mcp-consultant-tools")
├── tsconfig.json
└── README.md
```

#### 5.2 Meta-Package Configuration

**packages/meta/package.json:**
```json
{
  "name": "mcp-consultant-tools",
  "version": "16.0.0",
  "description": "Complete MCP toolset for Microsoft ecosystem (meta-package combining all integrations)",
  "main": "./build/index.js",
  "types": "./build/index.d.ts",
  "bin": {
    "mcp-consultant-tools": "./build/index.js"
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf build",
    "prepublishOnly": "npm run build"
  },
  "files": [
    "build",
    "README.md",
    "LICENSE"
  ],
  "dependencies": {
    "@mcp-consultant-tools/core": "^1.0.0",
    "@mcp-consultant-tools/powerplatform": "^1.0.0",
    "@mcp-consultant-tools/azure-devops": "^1.0.0",
    "@mcp-consultant-tools/figma": "^1.0.0",
    "@mcp-consultant-tools/application-insights": "^1.0.0",
    "@mcp-consultant-tools/log-analytics": "^1.0.0",
    "@mcp-consultant-tools/azure-sql": "^1.0.0",
    "@mcp-consultant-tools/service-bus": "^1.0.0",
    "@mcp-consultant-tools/github-enterprise": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.7.0",
    "dotenv": "^17.2.3"
  },
  "devDependencies": {
    "typescript": "^5.7.3"
  },
  "keywords": [
    "mcp",
    "microsoft",
    "powerplatform",
    "azure",
    "devops",
    "sharepoint",
    "figma"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/klemensms/mcp-consultant-tools.git",
    "directory": "packages/meta"
  }
}
```

#### 5.3 Meta-Package Implementation Options

**Option 1: Single Process (Current Behavior)**

The meta-package starts a single MCP server that loads all 9 service modules and registers all 172 tools and 47 prompts. This maintains exact backward compatibility.

**packages/meta/src/index.ts:**
```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";

// Suppress dotenv output
const originalWrite = process.stdout.write;
process.stdout.write = () => true;
dotenv.config();
process.stdout.write = originalWrite;

// Import all service entry points (as modules)
// Each service exports its tool/prompt registration logic
import { registerPowerPlatformTools } from "@mcp-consultant-tools/powerplatform";
import { registerAzureDevOpsTools } from "@mcp-consultant-tools/azure-devops";
import { registerFigmaTools } from "@mcp-consultant-tools/figma";
// ... import remaining 5 services

// Initialize single MCP server
const server = new Server(
  { name: "mcp-consultant-tools", version: "16.0.0" },
  { capabilities: { tools: {}, prompts: {} } }
);

// Register all tools from all services
registerPowerPlatformTools(server);
registerAzureDevOpsTools(server);
registerFigmaTools(server);
// ... register remaining 5 services

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Consultant Tools server running (all integrations loaded)");
}

main().catch(console.error);
```

**Note:** This requires each service package to export a `register*Tools()` function for programmatic registration.

**Option 2: Multi-Process Launcher (Advanced)**

The meta-package provides a launcher that starts multiple child MCP servers (one per service). This is more complex but allows true process isolation.

**Not recommended for initial implementation** - adds significant complexity.

#### 5.4 README for Meta-Package

**packages/meta/README.md:**
```markdown
# mcp-consultant-tools

Complete MCP toolset for the Microsoft ecosystem.

## ⚠️ Note: This is a Meta-Package

This package includes **all** integrations (PowerPlatform, Azure DevOps, SharePoint, Azure SQL, Service Bus, Application Insights, Log Analytics, GitHub Enterprise, Figma).

**For production use, we recommend installing only the integrations you need:**

```bash
# Install specific integrations
npm install @mcp-consultant-tools/powerplatform
npm install @mcp-consultant-tools/azure-sql
```

**Benefits of individual packages:**
- ✅ Smaller installation size
- ✅ Fewer dependencies
- ✅ Faster startup time
- ✅ Clearer configuration

## Installation

```bash
npm install mcp-consultant-tools
```

## Usage

Configure in your MCP client settings:

```json
{
  "mcpServers": {
    "consultant-tools": {
      "command": "npx",
      "args": ["mcp-consultant-tools"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "...",
        "AZUREDEVOPS_ORGANIZATION": "...",
        "AZURE_SQL_SERVERS": "[...]",
        // ... all 60+ environment variables
      }
    }
  }
}
```

## Migrating to Modular Packages

See [Migration Guide](../../docs/MIGRATION_GUIDE.md) for how to switch to individual packages.

## Available Integrations

This package includes:
- **PowerPlatform & SharePoint** (85+ tools, 23 prompts)
- **Azure DevOps** (13 tools, 4 prompts)
- **GitHub Enterprise** (22 tools, 5 prompts)
- **Azure SQL Database** (11 tools, 3 prompts)
- **Service Bus** (8 tools, 5 prompts)
- **Application Insights** (10 tools, 5 prompts)
- **Log Analytics** (10 tools, 5 prompts)
- **Figma** (2 tools, 0 prompts)

**Total:** 172 tools, 47 prompts

## License

MIT
```

---

### Phase 6: Update Documentation

**Duration:** 4-6 hours

#### 6.1 Root README.md

**New root README.md:**
```markdown
# MCP Consultant Tools

A collection of Model Context Protocol (MCP) servers for the Microsoft ecosystem and related services.

## 🎯 Choose Your Installation Method

### Option 1: Install Everything (Quick Start)

```bash
npm install mcp-consultant-tools
```

**Includes:** All 9 integrations (172 tools, 47 prompts)
**Use case:** Trying out the tools, development environments

### Option 2: Install Specific Integrations (Recommended for Production)

```bash
# Power Platform & SharePoint
npm install @mcp-consultant-tools/powerplatform

# Azure Services
npm install @mcp-consultant-tools/azure-sql
npm install @mcp-consultant-tools/service-bus
npm install @mcp-consultant-tools/application-insights
npm install @mcp-consultant-tools/log-analytics

# DevOps & Source Control
npm install @mcp-consultant-tools/azure-devops
npm install @mcp-consultant-tools/github-enterprise

# Design
npm install @mcp-consultant-tools/figma
```

**Benefits:**
- ✅ Smaller package sizes (faster installation)
- ✅ Fewer dependencies (reduced attack surface)
- ✅ Clearer configuration (only relevant env vars)
- ✅ Faster startup (only needed services initialized)

## 📦 Available Packages

| Package | Tools | Prompts | Size | Description |
|---------|-------|---------|------|-------------|
| [@mcp-consultant-tools/powerplatform](./packages/powerplatform/) | 85+ | 23 | ~4.5K LOC | Power Platform & SharePoint Online |
| [@mcp-consultant-tools/azure-devops](./packages/azure-devops/) | 13 | 4 | ~780 LOC | Azure DevOps wikis & work items |
| [@mcp-consultant-tools/github-enterprise](./packages/github-enterprise/) | 22 | 5 | ~1.8K LOC | GitHub Enterprise repositories |
| [@mcp-consultant-tools/azure-sql](./packages/azure-sql/) | 11 | 3 | ~1.2K LOC | Azure SQL Database (read-only) |
| [@mcp-consultant-tools/service-bus](./packages/service-bus/) | 8 | 5 | ~1.6K LOC | Azure Service Bus (read-only) |
| [@mcp-consultant-tools/application-insights](./packages/application-insights/) | 10 | 5 | ~660 LOC | Application Insights telemetry |
| [@mcp-consultant-tools/log-analytics](./packages/log-analytics/) | 10 | 5 | ~970 LOC | Log Analytics workspaces |
| [@mcp-consultant-tools/figma](./packages/figma/) | 2 | 0 | ~2.4K LOC | Figma design files |
| [mcp-consultant-tools](./packages/meta/) | 172 | 47 | Meta | All integrations (meta-package) |

## 🚀 Quick Start

### 1. Install Package(s)

```bash
npm install @mcp-consultant-tools/powerplatform
```

### 2. Configure MCP Client

**Claude Desktop (claude_desktop_config.json):**
```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

### 3. Restart Your MCP Client

The tools will be available immediately.

## 📖 Documentation

Each package has comprehensive documentation:

- **Setup Guide** - Authentication, credentials, permissions
- **Tool Reference** - Complete tool and prompt listings
- **Usage Examples** - Real-world workflows
- **Troubleshooting** - Common issues and solutions

See individual package READMEs for details.

## 🔧 Development

This is a monorepo using npm workspaces:

```bash
# Clone repository
git clone https://github.com/klemensms/mcp-consultant-tools.git
cd mcp-consultant-tools

# Install all dependencies
npm install

# Build all packages
npm run build

# Build specific package
cd packages/powerplatform
npm run build
```

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT - See [LICENSE](./LICENSE) for details.

## 🔗 Links

- [GitHub Repository](https://github.com/klemensms/mcp-consultant-tools)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [npm Organization](https://www.npmjs.com/org/mcp-consultant-tools)
```

#### 6.2 Create Migration Guide

**docs/MIGRATION_GUIDE.md:**
```markdown
# Migration Guide: Monolith to Modular Packages

This guide helps existing users migrate from the monolithic `mcp-consultant-tools` package to individual service packages.

## For Existing Users

### Do I Need to Migrate?

**No.** The `mcp-consultant-tools` package continues to work exactly as before. Migration is optional.

**Why migrate?**
- ✅ Smaller installation size
- ✅ Fewer dependencies
- ✅ Faster startup time
- ✅ Clearer configuration

### Current Configuration (Monolith)

```json
{
  "mcpServers": {
    "consultant-tools": {
      "command": "npx",
      "args": ["mcp-consultant-tools"],
      "env": {
        "POWERPLATFORM_URL": "...",
        "AZUREDEVOPS_ORGANIZATION": "...",
        "AZURE_SQL_SERVERS": "[...]",
        "GHE_REPOS": "[...]"
        // ... 60+ environment variables
      }
    }
  }
}
```

### Migrated Configuration (Modular)

```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "...",
        "POWERPLATFORM_CLIENT_ID": "...",
        "POWERPLATFORM_CLIENT_SECRET": "...",
        "POWERPLATFORM_TENANT_ID": "...",
        "SHAREPOINT_RESOURCES": "[...]"
      }
    },
    "azure-sql": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/azure-sql"],
      "env": {
        "AZURE_SQL_SERVERS": "[...]"
      }
    },
    "github-enterprise": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/github-enterprise"],
      "env": {
        "GHE_REPOS": "[...]",
        "GHE_AUTH_METHOD": "pat",
        "GHE_PAT": "..."
      }
    }
  }
}
```

## Step-by-Step Migration

### Step 1: Install New Packages

```bash
# Uninstall monolith (optional)
npm uninstall mcp-consultant-tools

# Install specific packages
npm install @mcp-consultant-tools/powerplatform
npm install @mcp-consultant-tools/azure-sql
npm install @mcp-consultant-tools/github-enterprise
```

### Step 2: Split Configuration

Create separate MCP server entries for each service you use.

**Environment Variable Mapping:**

| Old Monolith Env Var | New Package | New Package Env Var |
|----------------------|-------------|---------------------|
| `POWERPLATFORM_*` | @mcp-consultant-tools/powerplatform | Same |
| `SHAREPOINT_*` | @mcp-consultant-tools/powerplatform | Same (combined package) |
| `AZUREDEVOPS_*` | @mcp-consultant-tools/azure-devops | Same |
| `AZURE_SQL_*` | @mcp-consultant-tools/azure-sql | Same |
| `SERVICEBUS_*` | @mcp-consultant-tools/service-bus | Same |
| `APPINSIGHTS_*` | @mcp-consultant-tools/application-insights | Same |
| `LOGANALYTICS_*` | @mcp-consultant-tools/log-analytics | Same |
| `GHE_*` | @mcp-consultant-tools/github-enterprise | Same |
| `FIGMA_*` | @mcp-consultant-tools/figma | Same |

### Step 3: Update MCP Client Configuration

Replace the single `consultant-tools` entry with multiple service entries.

### Step 4: Restart MCP Client

Restart Claude Desktop (or your MCP client) to load the new configuration.

### Step 5: Verify

Test a few tools from each service to ensure everything works:

```
# PowerPlatform
Get a list of apps in my PowerPlatform environment

# Azure SQL
Show me all tables in the production database

# GitHub Enterprise
Find commits related to work item #1234
```

## Rollback Plan

If you encounter issues, you can easily rollback:

```bash
# Uninstall modular packages
npm uninstall @mcp-consultant-tools/powerplatform
npm uninstall @mcp-consultant-tools/azure-sql
# ... etc

# Reinstall monolith
npm install mcp-consultant-tools
```

Then restore your original configuration.

## FAQ

**Q: Can I use both the monolith and modular packages?**
A: Yes, but it's not recommended. Stick with one approach.

**Q: Will the monolith be deprecated?**
A: Not immediately. We'll evaluate after 6 months based on adoption. Deprecation (if it happens) will be announced well in advance.

**Q: Do I need to reconfigure environment variables?**
A: No, environment variable names remain the same. You just split them across multiple MCP server entries.

**Q: Will I lose any functionality?**
A: No, all 172 tools and 47 prompts are available across the modular packages.

## Support

If you encounter issues during migration:
- Check individual package README files for setup instructions
- Review troubleshooting guides in each package
- Open an issue on GitHub: https://github.com/klemensms/mcp-consultant-tools/issues
```

#### 6.3 Update CLAUDE.md

Add section to CLAUDE.md documenting the monorepo structure:

```markdown
## Monorepo Structure

This project uses npm workspaces to manage multiple packages in a single repository.

### Directory Structure

```
mcp-consultant-tools/
├── packages/
│   ├── core/                  # Shared utilities
│   ├── powerplatform/         # PowerPlatform + SharePoint
│   ├── azure-devops/          # Azure DevOps
│   ├── figma/                 # Figma
│   ├── application-insights/  # Application Insights
│   ├── log-analytics/         # Log Analytics
│   ├── azure-sql/             # Azure SQL Database
│   ├── service-bus/           # Service Bus
│   ├── github-enterprise/     # GitHub Enterprise
│   └── meta/                  # Backward compatibility (mcp-consultant-tools)
├── docs/                      # Shared documentation
├── package.json               # Workspace root
├── tsconfig.base.json         # Shared TypeScript config
└── README.md
```

### Working with the Monorepo

**Build all packages:**
```bash
npm run build --workspaces
```

**Build specific package:**
```bash
cd packages/powerplatform
npm run build
```

**Publish all packages:**
```bash
# Must be done in order: core → services → meta
npm run build
cd packages/core && npm publish --access public
cd ../powerplatform && npm publish --access public
# ... etc
```

### Adding a New Integration

1. Create new package directory: `packages/new-service/`
2. Create package.json with `@mcp-consultant-tools/core` dependency
3. Implement service class and MCP server entry point
4. Add documentation
5. Publish to npm
6. Update meta-package dependencies

### Package Dependencies

```
core (no dependencies)
  ↓
All service packages depend on core
  ↓
meta-package depends on all service packages
```
```

#### 6.4 Create Package-Specific READMEs

Each package needs a comprehensive README. See template in Phase 3.2.

---

### Phase 7: NPM Organization Setup & Publishing

**Duration:** 2-3 hours

#### 7.1 Check NPM Organization Availability

```bash
# Check if organization name is available
npm search @mcp-consultant-tools
```

**Alternative names if taken:**
- `@mcp-tools`
- `@klemensms` (your GitHub username)
- `@consultant-tools`

#### 7.2 Create NPM Organization

**Via npm CLI:**
```bash
npm login
npm org create mcp-consultant-tools
```

**Via npm website:**
1. Go to https://www.npmjs.com
2. Sign in
3. Click avatar → "Add Organization"
4. Enter organization name: `mcp-consultant-tools`
5. Choose plan (free for open source)

#### 7.3 Invite Collaborators (Optional)

```bash
npm org set mcp-consultant-tools <username> developer
```

#### 7.4 Publishing Order

**CRITICAL:** Publish in dependency order:

1. **Core package first** (no dependencies)
2. **Service packages** (depend on core)
3. **Meta-package last** (depends on all services)

**Publishing Script:**

```bash
#!/bin/bash
# publish-all.sh

set -e  # Exit on error

echo "Building all packages..."
npm run build --workspaces

echo "Publishing core..."
cd packages/core
npm publish --access public

echo "Publishing service packages..."
cd ../powerplatform
npm publish --access public

cd ../azure-devops
npm publish --access public

cd ../figma
npm publish --access public

cd ../application-insights
npm publish --access public

cd ../log-analytics
npm publish --access public

cd ../azure-sql
npm publish --access public

cd ../service-bus
npm publish --access public

cd ../github-enterprise
npm publish --access public

echo "Publishing meta-package..."
cd ../meta
npm publish --access public

echo "All packages published successfully!"
```

Make executable:
```bash
chmod +x publish-all.sh
```

#### 7.5 Verify Published Packages

After publishing, verify each package:

```bash
# Check package info
npm info @mcp-consultant-tools/core
npm info @mcp-consultant-tools/powerplatform
npm info mcp-consultant-tools

# Test installation
mkdir test-install
cd test-install
npm install @mcp-consultant-tools/powerplatform
npm install mcp-consultant-tools
```

#### 7.6 Tag Git Release

```bash
git tag -a v16.0.0 -m "Release v16.0.0 - Modular package architecture"
git push origin v16.0.0
```

#### 7.7 Update npm Package Keywords

Ensure good discoverability by using consistent keywords across all packages:

**Common keywords:**
- `mcp`
- `model-context-protocol`
- `ai`
- `llm`
- `claude`

**Service-specific keywords:**
- PowerPlatform: `powerplatform`, `dynamics365`, `dataverse`, `sharepoint`, `microsoft`
- Azure DevOps: `azuredevops`, `devops`, `wiki`, `workitems`
- GitHub: `github`, `github-enterprise`, `git`, `source-control`
- Azure SQL: `azure`, `sql`, `mssql`, `database`
- Service Bus: `azure`, `servicebus`, `messaging`, `queue`
- Application Insights: `azure`, `telemetry`, `monitoring`, `observability`
- Log Analytics: `azure`, `logs`, `monitoring`, `kql`
- Figma: `figma`, `design`, `ui`, `ux`

---

## Timeline & Effort Estimation

| Phase | Task | Duration | Complexity |
|-------|------|----------|------------|
| 1 | Prepare Monorepo Structure | 2-4 hours | Low |
| 2 | Extract Core Package | 4-6 hours | Medium |
| 3.1 | Extract Figma | 2 hours | Low |
| 3.2 | Extract Azure DevOps | 2 hours | Low |
| 3.3 | Extract Application Insights | 2 hours | Low |
| 3.4 | Extract GitHub Enterprise | 3 hours | Medium |
| 3.5 | Extract Azure SQL | 3 hours | Medium |
| 3.6 | Extract Service Bus | 3 hours | Medium |
| 3.7 | Extract Log Analytics | 2 hours | Low |
| 4 | Extract PowerPlatform + SharePoint | 4-6 hours | High |
| 5 | Create Meta-Package | 2-4 hours | Medium |
| 6 | Update Documentation | 4-6 hours | Medium |
| 7 | NPM Organization Setup & Publishing | 2-3 hours | Low |

**Total Estimated Time:** 34-53 hours

**Breakdown:**
- **Setup & Core:** 6-10 hours
- **Service Extraction:** 16-24 hours (8 services × 2-3 hours each)
- **Integration & Documentation:** 10-16 hours
- **Publishing:** 2-3 hours

**Recommended Schedule:**
- **Week 1:** Phases 1-2 (setup, core package)
- **Week 2:** Phase 3 (extract 8 service packages)
- **Week 3:** Phases 4-5 (PowerPlatform+SharePoint, meta-package)
- **Week 4:** Phases 6-7 (documentation, publishing)

---

## Risk Mitigation

### Risk 1: Breaking Existing Users

**Risk Level:** HIGH

**Impact:** Existing users unable to use the tools

**Mitigation:**
- ✅ Maintain `mcp-consultant-tools` as meta-package
- ✅ All environment variables remain the same
- ✅ All tools/prompts remain available
- ✅ Thorough testing before publishing

**Testing:**
- Install meta-package in clean environment
- Test all 172 tools and 47 prompts
- Verify environment variable loading
- Compare behavior to v15.0.0 monolith

### Risk 2: Complex Build Process

**Risk Level:** MEDIUM

**Impact:** Difficult to build and maintain

**Mitigation:**
- ✅ npm workspaces handle this automatically
- ✅ Single `npm run build` command builds all packages
- ✅ Consistent tsconfig across packages (extends tsconfig.base.json)
- ✅ Build order handled by workspace dependencies

**Testing:**
- Clean install: `rm -rf node_modules && npm install`
- Build all: `npm run build --workspaces`
- Verify no build errors

### Risk 3: Publishing Complexity

**Risk Level:** MEDIUM

**Impact:** Packages published in wrong order, dependency issues

**Mitigation:**
- ✅ Document publishing order (core → services → meta)
- ✅ Automated publishing script (`publish-all.sh`)
- ✅ Dry-run testing with `npm publish --dry-run`

**Testing:**
- Publish to test npm registry first (verdaccio)
- Verify dependency resolution
- Test installation from npm

### Risk 4: Cross-Package Dependencies

**Risk Level:** LOW

**Impact:** Services unable to import shared code

**Mitigation:**
- ✅ Only core package is shared
- ✅ PowerPlatform+SharePoint combined (handles hard dependency)
- ✅ Clear documentation of dependency structure

**Testing:**
- Build each package individually
- Verify imports resolve correctly
- Test with `npm link` locally before publishing

### Risk 5: Documentation Sprawl

**Risk Level:** LOW

**Impact:** Users unable to find documentation

**Mitigation:**
- ✅ Each package has its own README
- ✅ Root README links to all packages
- ✅ Migration guide for existing users
- ✅ Consistent documentation structure across packages

**Testing:**
- Review all READMEs for clarity
- Verify all links work
- Test setup instructions on fresh machine

### Risk 6: Version Management Complexity

**Risk Level:** MEDIUM

**Impact:** Version mismatches between packages

**Mitigation:**
- ✅ Use caret (^) dependencies (`^1.0.0`) for flexibility
- ✅ Core package versioned separately from services
- ✅ Meta-package always depends on latest service versions
- ✅ Consider using tools like Lerna for version management (future)

**Testing:**
- Install meta-package and verify all service versions
- Test mixed versions (e.g., core@1.0.0 with powerplatform@1.1.0)

---

## Success Criteria

Before considering the split complete, verify:

### Technical Criteria

- [ ] All 9 packages published to npm
- [ ] All packages build successfully (`npm run build --workspaces`)
- [ ] Core package has no external dependencies (besides dev deps)
- [ ] All service packages depend on `@mcp-consultant-tools/core`
- [ ] Meta-package depends on all service packages
- [ ] TypeScript compilation successful for all packages
- [ ] No circular dependencies

### Functional Criteria

- [ ] All 172 tools functional across modular packages
- [ ] All 47 prompts functional across modular packages
- [ ] Meta-package provides identical behavior to v15.0.0 monolith
- [ ] Each service package can run independently
- [ ] Environment variables load correctly in each package
- [ ] MCP protocol communication works (stdio transport)

### Documentation Criteria

- [ ] Root README.md updated with package list
- [ ] Migration guide created
- [ ] Each package has comprehensive README
- [ ] CLAUDE.md updated with monorepo structure
- [ ] All documentation links verified
- [ ] .env.example files created for each package

### Publishing Criteria

- [ ] NPM organization created and configured
- [ ] All packages published with `--access public`
- [ ] Package names follow naming convention
- [ ] Package versions consistent (1.0.0 for initial release)
- [ ] Git tags created for release
- [ ] GitHub release notes published

### User Experience Criteria

- [ ] Existing users can continue using meta-package without changes
- [ ] New users can install individual packages
- [ ] Installation instructions clear and tested
- [ ] Configuration examples provided for each package
- [ ] Error messages helpful and actionable

---

## Post-Split Considerations

### 1. Monitor Adoption

Track npm download statistics:
- Compare meta-package downloads vs. individual package downloads
- Identify most/least popular integrations
- Gather user feedback

**Tools:**
- npm download statistics: https://www.npmjs.com/package/@mcp-consultant-tools/core
- GitHub Insights: Track repo stars, forks, issues

### 2. Deprecation Timeline (Future)

**6 months after split:**
- Evaluate adoption of modular packages
- If >50% of users migrated, add deprecation notice to meta-package
- Provide 12-month deprecation timeline

**18 months after split:**
- Stop publishing updates to meta-package
- Mark as deprecated on npm
- Redirect users to individual packages

**Important:** Ensure backward compatibility throughout deprecation period.

### 3. Independent Versioning

After initial release, each package can version independently:

**Example:**
- `@mcp-consultant-tools/core@1.0.0`
- `@mcp-consultant-tools/powerplatform@1.2.0` (minor update)
- `@mcp-consultant-tools/azure-sql@1.0.1` (patch)

**Benefits:**
- Faster releases for individual services
- Bug fixes don't require publishing all packages
- Clear change tracking per integration

**Challenges:**
- Version compatibility matrix
- Testing combinations of versions

**Solution:** Use caret dependencies (`^1.0.0`) to allow compatible minor/patch updates.

### 4. Adding New Integrations

With the modular structure, adding new integrations is straightforward:

**Example: Adding Azure Key Vault integration**

1. Create `packages/azure-keyvault/`
2. Implement service and MCP server
3. Add dependency on `@mcp-consultant-tools/core`
4. Document setup and tools
5. Publish to npm as `@mcp-consultant-tools/azure-keyvault`
6. Update root README with new package
7. (Optional) Add to meta-package dependencies

**No impact on existing packages!**

### 5. CI/CD Pipeline

Set up GitHub Actions for automated testing and publishing:

**.github/workflows/build-and-test.yml:**
```yaml
name: Build and Test

on:
  push:
    branches: [main, release/*]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build --workspaces
      - run: npm test --workspaces --if-present
```

**.github/workflows/publish.yml:**
```yaml
name: Publish Packages

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm install
      - run: npm run build --workspaces
      - run: ./publish-all.sh
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 6. Versioning Strategy

**Option A: Synchronized Versioning (Simpler)**
- All packages share the same version number
- Bump all packages together (even if some unchanged)
- Example: v16.0.0 across all packages

**Option B: Independent Versioning (More Complex)**
- Each package versions independently
- Only bump packages with changes
- Requires careful dependency management

**Recommended:** Start with synchronized versioning, move to independent after stabilization.

### 7. Testing Strategy

**Unit Tests:**
- Each package has its own test suite
- Run with `npm test --workspaces`

**Integration Tests:**
- Test service packages against real APIs (with test credentials)
- Mock external services where appropriate

**E2E Tests:**
- Test meta-package installation and execution
- Verify all tools respond correctly

**Regression Tests:**
- Compare meta-package behavior to v15.0.0 monolith
- Ensure no functionality lost

---

## Alternative Approaches Considered

### Alternative 1: Multiple Git Repositories

**Structure:**
```
github.com/klemensms/mcp-consultant-tools-core
github.com/klemensms/mcp-consultant-tools-powerplatform
github.com/klemensms/mcp-consultant-tools-azure-devops
... (9 separate repositories)
```

**Pros:**
- True separation of concerns
- Independent issue tracking per service
- Smaller repository sizes

**Cons:**
- Much harder to maintain (9 repos to clone, update, sync)
- Cross-package changes require PRs across multiple repos
- Difficult to keep in sync
- More complex CI/CD
- Harder for contributors

**Verdict:** ❌ Not recommended. Monorepo is industry standard for good reason.

### Alternative 2: Keep Monolith, Add "Lite" Variants

**Structure:**
- `mcp-consultant-tools` (full monolith)
- `mcp-consultant-tools-lite-powerplatform` (PowerPlatform only)
- `mcp-consultant-tools-lite-azure` (Azure services only)

**Pros:**
- Simpler implementation
- Less refactoring required

**Cons:**
- Code duplication (services copied to multiple packages)
- Inconsistent versioning
- Unclear which package to use
- No shared utilities

**Verdict:** ❌ Not recommended. Doesn't solve the complexity problem.

### Alternative 3: Plugin Architecture

**Structure:**
- `mcp-consultant-tools-core` (MCP server framework)
- `mcp-consultant-tools-plugin-powerplatform` (plugin)
- `mcp-consultant-tools-plugin-azure-devops` (plugin)
- ... (plugins dynamically loaded)

**Pros:**
- Dynamic loading of services
- Extensible architecture
- Single MCP server process

**Cons:**
- Requires significant refactoring
- Complex plugin loading mechanism
- Runtime discovery of plugins
- Debugging complexity

**Verdict:** ❌ Too complex for current needs. Consider for v2.0.

---

## Open Questions & Decisions

### Question 1: npm Organization Name

**Options:**
1. `@mcp-consultant-tools` (matches current package name)
2. `@mcp-tools` (shorter)
3. `@klemensms` (personal namespace)

**Recommendation:** `@mcp-consultant-tools` (consistent branding)

**Decision:** To be confirmed by checking npm availability

---

### Question 2: PowerPlatform + SharePoint Split

**Options:**
1. Combine in single package (recommended in this plan)
2. Separate packages with peer dependency
3. SharePoint optional plugin for PowerPlatform

**Recommendation:** Combine in single package

**Rationale:**
- Natural coupling (validation methods)
- Users typically need both
- Simpler configuration

**Decision:** ✅ Combine

---

### Question 3: Meta-Package Long-Term Strategy

**Options:**
1. Maintain indefinitely (support both monolith and modular)
2. Deprecate after 6-12 months
3. Deprecate immediately (force migration)

**Recommendation:** Maintain for 6-12 months, then evaluate deprecation

**Rationale:**
- Gives users time to migrate
- Maintains backward compatibility
- Low maintenance burden (just dependency updates)

**Decision:** ✅ Maintain with future deprecation evaluation

---

### Question 4: Service Registration Pattern

For the meta-package to work, each service needs to export its registration logic.

**Options:**
1. Each package exports `register*Tools(server)` function
2. Each package provides its own MCP server instance
3. Meta-package directly imports service classes (no registration helpers)

**Recommendation:** Option 1 (export registration functions)

**Rationale:**
- Cleanest API
- Allows programmatic registration
- Reusable pattern

**Example:**
```typescript
// packages/azure-sql/src/index.ts
export function registerAzureSqlTools(server: Server) {
  server.tool("sql-list-servers", ...);
  // ... register remaining tools
}

// packages/meta/src/index.ts
import { registerAzureSqlTools } from "@mcp-consultant-tools/azure-sql";
registerAzureSqlTools(server);
```

**Decision:** ✅ Use registration function pattern

---

## Checklist for Implementation

Use this checklist to track progress:

### Phase 1: Monorepo Setup
- [ ] Create root package.json with workspaces
- [ ] Create tsconfig.base.json
- [ ] Create packages/ directory structure
- [ ] Update .gitignore
- [ ] Test workspace build (`npm run build --workspaces`)

### Phase 2: Core Package
- [ ] Create packages/core/ structure
- [ ] Move audit-logger.ts
- [ ] Create mcp-server-helpers.ts
- [ ] Create package.json
- [ ] Create tsconfig.json
- [ ] Build package
- [ ] Publish to npm

### Phase 3: Service Packages (Repeat for Each)

**Figma:**
- [ ] Create package structure
- [ ] Move FigmaService.ts
- [ ] Move figma/ subdirectory
- [ ] Create MCP server entry point
- [ ] Update imports
- [ ] Create documentation
- [ ] Build and test
- [ ] Publish to npm

**Azure DevOps:**
- [ ] Create package structure
- [ ] Move AzureDevOpsService.ts
- [ ] Create MCP server entry point
- [ ] Update imports
- [ ] Create documentation
- [ ] Build and test
- [ ] Publish to npm

**Application Insights:**
- [ ] Create package structure
- [ ] Move ApplicationInsightsService.ts
- [ ] Move appinsights-formatters.ts
- [ ] Create MCP server entry point
- [ ] Update imports
- [ ] Create documentation
- [ ] Build and test
- [ ] Publish to npm

**GitHub Enterprise:**
- [ ] Create package structure
- [ ] Move GitHubEnterpriseService.ts
- [ ] Move ghe-formatters.ts
- [ ] Create MCP server entry point
- [ ] Update imports
- [ ] Create documentation
- [ ] Build and test
- [ ] Publish to npm

**Azure SQL:**
- [ ] Create package structure
- [ ] Move AzureSqlService.ts
- [ ] Move sql-formatters.ts
- [ ] Create MCP server entry point
- [ ] Update imports
- [ ] Create documentation
- [ ] Build and test
- [ ] Publish to npm

**Service Bus:**
- [ ] Create package structure
- [ ] Move ServiceBusService.ts
- [ ] Move servicebus-formatters.ts
- [ ] Create MCP server entry point
- [ ] Update imports
- [ ] Create documentation
- [ ] Build and test
- [ ] Publish to npm

**Log Analytics:**
- [ ] Create package structure
- [ ] Move LogAnalyticsService.ts
- [ ] Move loganalytics-formatters.ts
- [ ] Create MCP server entry point
- [ ] Update imports
- [ ] Create documentation
- [ ] Build and test
- [ ] Publish to npm

### Phase 4: PowerPlatform + SharePoint
- [ ] Create package structure
- [ ] Move PowerPlatformService.ts
- [ ] Move SharePointService.ts
- [ ] Move rate-limiter.ts
- [ ] Move iconManager.ts
- [ ] Move bestPractices.ts
- [ ] Move sharepoint-formatters.ts
- [ ] Create MCP server entry point
- [ ] Update imports
- [ ] Create documentation
- [ ] Build and test
- [ ] Publish to npm

### Phase 5: Meta-Package
- [ ] Create packages/meta/ structure
- [ ] Create package.json with all dependencies
- [ ] Implement combined MCP server
- [ ] Create README with migration guide
- [ ] Build and test
- [ ] Verify identical behavior to v15.0.0
- [ ] Publish to npm

### Phase 6: Documentation
- [ ] Update root README.md
- [ ] Create MIGRATION_GUIDE.md
- [ ] Update CLAUDE.md
- [ ] Create package-specific READMEs (9 packages)
- [ ] Verify all links work
- [ ] Create CONTRIBUTING.md

### Phase 7: Publishing
- [ ] Check npm organization name availability
- [ ] Create npm organization
- [ ] Create publish-all.sh script
- [ ] Publish core package
- [ ] Publish service packages (8 packages)
- [ ] Publish meta-package
- [ ] Verify all packages on npm
- [ ] Create Git tag (v16.0.0)
- [ ] Create GitHub release

### Post-Launch
- [ ] Monitor npm download statistics
- [ ] Gather user feedback
- [ ] Address issues and bugs
- [ ] Set up CI/CD pipeline
- [ ] Plan deprecation timeline (future)

---

## Resources & References

### npm Workspaces
- [npm Workspaces Documentation](https://docs.npmjs.com/cli/v7/using-npm/workspaces)
- [npm Workspaces Tutorial](https://ruanmartinelli.com/posts/npm-7-workspaces-1)

### Monorepo Examples
- [Babel (JavaScript compiler)](https://github.com/babel/babel)
- [Jest (Testing framework)](https://github.com/facebook/jest)
- [React (UI library)](https://github.com/facebook/react)

### Publishing
- [npm Publishing Guide](https://docs.npmjs.com/cli/v7/commands/npm-publish)
- [npm Organizations](https://docs.npmjs.com/cli/v7/using-npm/orgs)
- [Semantic Versioning](https://semver.org/)

### TypeScript Configuration
- [Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [TypeScript Monorepos](https://www.typescriptlang.org/docs/handbook/project-references.html#guidance-for-monorepos)

---

## Contact & Support

For questions or issues during implementation:
- GitHub Issues: https://github.com/klemensms/mcp-consultant-tools/issues
- GitHub Discussions: https://github.com/klemensms/mcp-consultant-tools/discussions

---

**Document End**
