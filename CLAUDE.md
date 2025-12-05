# CLAUDE.md

⚠️ **CRITICAL SIZE LIMIT WARNING** ⚠️

**This file MUST remain under 40,000 characters to maintain Claude Code performance.**

**Current approach**: This file contains high-level architecture and universal guidelines. Integration-specific technical details are in `docs/technical/{INTEGRATION}_TECHNICAL.md` files.

**Before adding content**: Check character count with `wc -c CLAUDE.md`. If approaching 40k, move content to appropriate technical guide instead.

---

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

**v15.0.0** introduced a modular monorepo architecture with **14 independently published packages** (including 3 security-isolated PowerPlatform packages):

```
mcp-consultant-tools/
├── packages/
│   ├── core/                           # Shared utilities, MCP helpers, audit logging
│   ├── powerplatform/                  # PowerPlatform read-only (40 tools, 11 prompts) ✅ PRODUCTION-SAFE
│   ├── powerplatform-customization/    # PowerPlatform schema changes (40 tools, 2 prompts) ⚠️ DEV/CONFIG ONLY
│   ├── powerplatform-data/             # PowerPlatform data CRUD (3 tools, 0 prompts) ⚠️ OPERATIONAL USE
│   ├── azure-devops/                   # Azure DevOps (18 tools, 6 prompts)
│   ├── figma/                          # Figma (2 tools, 0 prompts)
│   ├── application-insights/           # Application Insights (10 tools, 5 prompts)
│   ├── log-analytics/                  # Log Analytics (10 tools, 5 prompts)
│   ├── azure-sql/                      # Azure SQL Database (11 tools, 3 prompts)
│   ├── service-bus/                    # Azure Service Bus (8 tools, 5 prompts)
│   ├── sharepoint/                     # SharePoint Online (15 tools, 5 prompts)
│   ├── github-enterprise/              # GitHub Enterprise (22 tools, 5 prompts)
│   ├── azure-b2c/                      # Azure AD B2C (11 tools, 2 prompts)
│   └── meta/                           # Complete package (all integrations)
├── package.json               # Workspace root
└── tsconfig.base.json         # Shared TypeScript config
```

### PowerPlatform Security-Focused Split (v16)

**NEW in v16.0.0:** The PowerPlatform integration is split into **3 security-isolated packages** following the principle of least privilege:

| Package | Purpose | Tools | Prompts | Production-Safe? |
|---------|---------|-------|---------|------------------|
| **powerplatform** | Read-only access | 38 | 10 | ✅ **YES** - Install in production |
| **powerplatform-customization** | Schema changes | 40 | 2 | ⚠️ **NO** - Dev/config only |
| **powerplatform-data** | Data CRUD operations | 3 | 0 | ⚠️ **NO** - Operational use |

**Rationale:**

The split isolates dangerous operations into separate packages, allowing users to:
1. **Production environments**: Install only `powerplatform` (read-only) for zero risk
2. **Development environments**: Add `powerplatform-customization` for schema changes
3. **Operational environments**: Add `powerplatform-data` for data management

**Key Benefits:**
- **Security**: Read-only package cannot modify system or data
- **Compliance**: Clear separation enables audit trails per capability
- **Flexibility**: Install only what you need
- **Safety**: Package selection prevents accidental operations

**Usage Patterns:**

```typescript
// Pattern 1: Production (read-only only)
import { registerPowerPlatformTools } from '@mcp-consultant-tools/powerplatform';
registerPowerPlatformTools(server); // 38 read-only tools

// Pattern 2: Development (read + customization)
import { registerPowerPlatformTools } from '@mcp-consultant-tools/powerplatform';
import { registerPowerplatformCustomizationTools } from '@mcp-consultant-tools/powerplatform-customization';
registerPowerPlatformTools(server);
registerPowerplatformCustomizationTools(server); // No flags needed - package installation = explicit intent

// Pattern 3: Operational (read + data CRUD)
import { registerPowerPlatformTools } from '@mcp-consultant-tools/powerplatform';
import { registerPowerplatformDataTools } from '@mcp-consultant-tools/powerplatform-data';
registerPowerPlatformTools(server);
registerPowerplatformDataTools(server); // No flags needed - package installation = explicit intent

// Pattern 4: Complete access (all 3 packages)
import { registerPowerPlatformTools } from '@mcp-consultant-tools/powerplatform';
import { registerPowerplatformCustomizationTools } from '@mcp-consultant-tools/powerplatform-customization';
import { registerPowerplatformDataTools } from '@mcp-consultant-tools/powerplatform-data';
registerPowerPlatformTools(server);
registerPowerplatformCustomizationTools(server);
registerPowerplatformDataTools(server);
```

**Security Model (v21+):**

Starting in v21.0.0, security is enforced solely through package selection:
1. **Production environments**: Install only `powerplatform` (read-only) for zero risk
2. **Development environments**: Add `powerplatform-customization` for schema changes
3. **Operational environments**: Add `powerplatform-data` for data CRUD

**No environment flags required.** Installing a package grants immediate access to its operations.

### Core Package (@mcp-consultant-tools/core)

Provides shared utilities: `createMcpServer()`, `createEnvLoader()` (suppresses dotenv stdout for MCP protocol compliance), and `auditLogger` for centralized operation logging. All services must use `createEnvLoader()` to prevent stdout corruption in MCP stdio transport.

### Package Dependencies & Build

**Publishing order:** core → service packages (including powerplatform base, then powerplatform-customization/data) → meta

**Build:** `npm run build` builds all packages via workspaces. TypeScript follows project references for incremental builds (core → services → meta).

### Development Workflow

**Setup:** `git clone` → `npm install` → `npm run build`
**Per-service work:** `cd packages/{service}` → `npm run build`
**Local testing:** `node build/index.js` in package directory

See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for v14→v15 migration details (import path changes, backward compatibility via meta-package).

## Integration Technical Documentation

Detailed technical implementation guides for each integration are available in separate files:

- **[PowerPlatform Technical Guide](docs/technical/POWERPLATFORM_TECHNICAL.md)** - Plugin deployment, workflows, data CRUD, best practices validation, icon management
- **[Azure DevOps Technical Guide](docs/technical/AZURE_DEVOPS_TECHNICAL.md)** - Wiki integration, path conversion, string replacement tool, work items
- **[Figma Technical Guide](docs/technical/FIGMA_TECHNICAL.md)** - Architecture, extractors, transformers, data pipeline
- **[Application Insights Technical Guide](docs/technical/APPLICATION_INSIGHTS_TECHNICAL.md)** - Service implementation, KQL queries, telemetry tables
- **[Log Analytics Technical Guide](docs/technical/LOG_ANALYTICS_TECHNICAL.md)** - Service implementation, Azure Functions troubleshooting, shared credentials
- **[Azure SQL Technical Guide](docs/technical/AZURE_SQL_TECHNICAL.md)** - Multi-server architecture, query validation, security, connection pooling
- **[Service Bus Technical Guide](docs/technical/SERVICE_BUS_TECHNICAL.md)** - Dual client architecture, message inspection, DLQ analysis, queue health
- **[GitHub Enterprise Technical Guide](docs/technical/GITHUB_ENTERPRISE_TECHNICAL.md)** - Branch detection, caching, cross-service correlation
- **[Azure B2C Technical Guide](docs/technical/AZURE_B2C_TECHNICAL.md)** - User management, password reset, Graph API integration

These guides contain detailed implementation specifics, code examples, and API details that are too large for this file.

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

4. **Technical Implementation Guides** - `docs/technical/{INTEGRATION}_TECHNICAL.md`
   - Deep technical implementation details
   - Service architecture and code examples
   - API integration specifics
   - Not for end users - for developers and Claude Code

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
6. ✅ **Update CLAUDE.md** - Add brief architecture overview (2-3 lines)
7. ✅ **Create `docs/technical/{INTEGRATION}_TECHNICAL.md`** - Detailed implementation guide

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
   - Update brief service description if needed
   - Update tool counts in monorepo section
   - DO NOT add detailed implementation - use technical guide instead

5. ✅ **Update `docs/technical/{INTEGRATION}_TECHNICAL.md`**
   - Add detailed technical documentation
   - Include code examples and design patterns
   - Document security considerations

6. ✅ **⚠️ MOST COMMONLY FORGOTTEN: Update `docs/documentation/{integration}.md`**
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
Before considering implementation complete, verify that ALL documentation files have been updated:
- [ ] Service code updated
- [ ] .env.example updated
- [ ] README.md updated
- [ ] CLAUDE.md updated (brief overview only)
- [ ] docs/technical/{INTEGRATION}_TECHNICAL.md updated (detailed implementation)
- [ ] **docs/documentation/{integration}.md updated** ← Check this twice!
- [ ] **Release notes updated (if in beta or approaching release)** ← Keep current!

### ⚠️ CRITICAL: Keep Release Notes Current During Development ⚠️

**Problem:** Features get added during development but aren't documented in release notes until release time, causing important changes to be forgotten or poorly described.

**Solution:** Treat release notes as a living document throughout the development cycle.

**When to Update Release Notes:**

1. **Starting a new release cycle** (e.g., v20.0):
   - Create `docs/release_notes/vX.Y.Z-beta.1.md` immediately
   - Initialize with template structure (Breaking Changes, New Features, Changes)
   - Commit to the release branch

2. **Adding a new feature:**
   - **IMMEDIATELY** add it to the release notes under "New Features"
   - Include: what it does, key parameters, why it's useful
   - Include beta testing configuration if it's a new integration
   - Commit release notes WITH the feature code

3. **Making breaking changes:**
   - **IMMEDIATELY** add to "Breaking Changes" section
   - Document what broke, how to migrate, example of new approach
   - Include OLD vs NEW comparison

4. **Improving existing features:**
   - **IMMEDIATELY** add to "Changes to Existing Features"
   - Describe what improved and user-visible impact

**Example Workflow:**

```bash
# Day 1: Start release/20.0 branch
git checkout -b release/20.0
# Create release notes
cat > docs/release_notes/v20.0.0-beta.1.md << EOF
# Release v20.0.0-beta.1
## Breaking Changes
None
## New Features
TBD
## Changes to Existing Features
TBD
EOF
git add docs/release_notes/v20.0.0-beta.1.md
git commit -m "docs: initialize v20.0.0-beta.1 release notes"

# Day 3: Add best practices validation tool
# 1. Write the code
# 2. IMMEDIATELY update release notes
cat >> docs/release_notes/v20.0.0-beta.1.md << EOF
### PowerPlatform: Dataverse Best Practices Validation
Added validate-dataverse-best-practices tool...
EOF
git add packages/powerplatform/src/* docs/release_notes/v20.0.0-beta.1.md
git commit -m "feat: add dataverse best practices validation tool"

# Day 5: Improve error messages
cat >> docs/release_notes/v20.0.0-beta.1.md << EOF
- Improved error messages for authentication failures
EOF
git commit -am "fix: improve auth error messages"
```

**Why This Matters:**
- **No forgotten features**: Everything gets documented as it's built
- **Better descriptions**: Context is fresh, details are accurate
- **Faster releases**: Release notes are ready when beta publishes
- **Test checklist ready**: Testers know what to test from day 1
- **Historical record**: Git history shows feature + documentation together

**Enforcement:**
Release notes must be current before publishing beta. If release notes say "TBD" or are obviously incomplete, **DO NOT** proceed with beta publishing until they're updated.

## Architecture

### Two-Layer Architecture

1. **MCP Server Layer** ([src/index.ts](src/index.ts))
   - Initializes the MCP server using `@modelcontextprotocol/sdk`
   - Registers 161 tools and 43 prompts across all integrations
   - Handles environment configuration and lazy-initialization of services
   - Uses Zod schemas for parameter validation
   - Communicates via stdio transport (StdioServerTransport)

2. **Service Layer**
   - **PowerPlatformService** - Azure MSAL authentication, OData API requests, entity metadata, plugin inspection, workflows
   - **AzureDevOpsService** - PAT authentication, wiki access, work items, WIQL queries, path conversion
   - **FigmaService** - PAT/OAuth authentication, design extraction, data transformation pipeline
   - **ApplicationInsightsService** - Entra ID/API Key auth, KQL queries, telemetry analysis, exception tracking
   - **LogAnalyticsService** - Entra ID/API Key auth, KQL queries, Azure Functions troubleshooting, shared credentials
   - **AzureSqlService** - SQL/Azure AD auth, connection pooling, read-only queries, security validation
   - **ServiceBusService** - Entra ID/Connection String auth, read-only message inspection, DLQ analysis
   - **SharePointService** - Entra ID auth via Graph API, site/library/file access, PowerPlatform validation, caching
   - **GitHubEnterpriseService** - PAT/GitHub App auth, repository access, branch detection, caching, cross-service correlation
   - **AzureB2CService** - Entra ID auth via Graph API, user management, password reset, group operations

### Key Design Patterns

- **Lazy Initialization**: All services are created on-demand only when their respective tools/prompts are first invoked
- **Token Caching**: Access tokens are cached and reused until near expiration to minimize authentication calls
- **Prompt Templates**: Pre-defined prompt templates with placeholder replacement for consistent, formatted responses
- **Dual Interface**: Functionality exposed both as MCP tools (for raw data) and prompts (for formatted, context-rich output)
- **Stdout Suppression for dotenv**: The server temporarily suppresses stdout during dotenv initialization to prevent non-JSON output from corrupting the MCP JSON protocol (which requires clean JSON-only stdout)
- **Optional Integrations**: All integrations are optional - users can configure any combination
- **Shared Credentials**: Log Analytics can automatically reuse Application Insights credentials, reducing configuration complexity
- **Cross-Service Integration**: Services can correlate data across platforms (e.g., SharePoint validates PowerPlatform document locations)

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

## ⚠️ DOCUMENTATION UPDATE CHECKLIST ⚠️

### BEFORE YOU COMPLETE ANY TASK - READ THIS SECTION FIRST

**🚨 THIS IS THE MOST COMMONLY SKIPPED STEP 🚨**

Whenever you make ANY changes to the codebase - whether adding features, fixing bugs, updating integrations, or modifying behavior - you MUST update ALL relevant documentation files. Missing documentation updates is the #1 cause of user confusion and support issues.

### Mandatory Documentation Files to Check

**EVERY change requires checking these files:**

1. **Service Code** - The actual implementation
   - Files: `src/*Service.ts`, `src/index.ts`, `packages/*/src/`
   - What: Service methods, tool registrations, types

2. **[.env.example](.env.example)** - Environment variable template
   - Add new configuration variables
   - Include security warnings for dangerous operations
   - Provide example values and descriptions
   - **Users copy this file - keep it current**

3. **[README.md](README.md)** - Project overview (user's first stop)
   - Update tool/prompt counts in overview tables
   - Add new integrations to feature list
   - Update configuration examples
   - Add new environment variables to quickstart
   - **This is what users see on GitHub/npm**

4. **[CLAUDE.md](CLAUDE.md)** - Development guidance (this file)
   - Keep brief - only high-level architecture
   - Update tool counts in monorepo section
   - Update service layer descriptions (2-3 lines max)
   - **DO NOT add detailed implementation - use technical guide instead**
   - **Check character count: `wc -c CLAUDE.md` must be < 40,000**

5. **docs/technical/{INTEGRATION}_TECHNICAL.md** - Technical implementation guide
   - Add detailed technical documentation
   - Include code examples and design patterns
   - Document service methods and API integration
   - Security considerations and error handling
   - **This is where detailed implementation goes**

6. **docs/documentation/{integration}.md** - User-facing guides
   - **⚠️ MOST COMMONLY FORGOTTEN ⚠️**
   - Update tool/prompt counts in table of contents
   - Add comprehensive tool documentation with parameters
   - Include real-world usage examples
   - Add security warnings and best practices
   - Update configuration sections
   - **This is the PRIMARY documentation users read**

### Pre-Completion Verification Checklist

Before marking any task as complete, verify EVERY item:

```
Documentation Update Checklist:
□ Service code updated and tested
□ .env.example updated with new variables
□ README.md tool counts updated
□ README.md configuration examples updated
□ CLAUDE.md updated (brief overview only, < 40k characters)
□ docs/technical/{INTEGRATION}_TECHNICAL.md updated (detailed implementation)
□ docs/documentation/{integration}.md tool reference updated
□ docs/documentation/{integration}.md configuration updated
□ docs/documentation/{integration}.md examples added
□ All documentation files reviewed (not just 1 or 2)
```

### Why Documentation Matters

- **Users discover features through docs** - If it's not documented, users won't find it
- **Documentation = feature completeness** - A feature without docs is incomplete
- **Prevents support overhead** - Good docs = fewer questions and issues
- **Enables self-service** - Users can solve problems without asking
- **Professional appearance** - Complete docs signal quality and care

### Common Mistakes to Avoid

❌ **"I'll document it later"** - You won't. Document NOW.
❌ **"The code is self-documenting"** - It's not. Users need examples.
❌ **"I updated README.md, that's enough"** - No. Check all files.
❌ **"I forgot about docs/documentation/"** - This is the #1 mistake. Don't make it.
❌ **"I added everything to CLAUDE.md"** - Wrong. Use technical guides for details to keep CLAUDE.md under 40k.
❌ **"I published directly to latest"** - Wrong. Always use beta tag first.
❌ **"The docs are mostly accurate"** - Inaccurate docs are worse than no docs.

### Examples of Complete Documentation Updates

**Example 1: Adding a new tool**
```
1. ✅ Add tool implementation to src/index.ts
2. ✅ Add to .env.example if needs configuration
3. ✅ Update README.md tool count (e.g., "Azure DevOps (18 tools)" → "Azure DevOps (19 tools)")
4. ✅ Update CLAUDE.md tool count in monorepo section (brief)
5. ✅ Add to docs/technical/{INTEGRATION}_TECHNICAL.md with implementation details
6. ✅ Add to docs/documentation/{integration}.md:
   - Update tool count in header
   - Add tool to "Available Tools" section with full parameter docs
   - Add usage example in "Usage Examples" section
```

**Example 2: Adding a new environment variable**
```
1. ✅ Add to service configuration parsing in src/index.ts
2. ✅ Add to .env.example with description and example value
3. ✅ Add to README.md configuration section
4. ✅ Update CLAUDE.md environment configuration section (if major change)
5. ✅ Add to docs/technical/{INTEGRATION}_TECHNICAL.md with implementation details
6. ✅ Add to docs/documentation/{integration}.md:
   - Configuration section
   - Setup instructions
   - Security considerations if applicable
```

**Example 3: Fixing a bug**
```
1. ✅ Fix code in src/*Service.ts
2. ✅ Check if .env.example needs updates (usually no)
3. ✅ Update README.md only if behavior changed significantly
4. ✅ CLAUDE.md usually doesn't need updates for bug fixes
5. ✅ Update docs/technical/{INTEGRATION}_TECHNICAL.md if architecture changed
6. ✅ Update docs/documentation/{integration}.md:
   - Fix any incorrect examples
   - Update troubleshooting section if relevant
   - Clarify usage if bug revealed confusion
```

### Enforcement

**Implementation is NOT complete until ALL documentation is updated.** Claude Code will be instructed to reject any task completion that doesn't include documentation updates for ALL applicable files.

---

## Publishing

The package is published to npm as `mcp-consultant-tools`:
- `npm run prepublishOnly` automatically runs build before publishing
- Published files: `build/`, `README.md` (defined in package.json files array)
- Binary: `mcp-consultant-tools` command points to `build/index.js`

### Safe Release Workflow

**Core Principle:** Never publish directly to `latest` without beta testing. Use npm dist tags for safe releases.

**1. Local Development & Testing**
```bash
# Build and test locally
npm run build
node build/index.js  # Test with absolute path in MCP client config
```

**2. Package Validation (Pre-Publish Check)**
```bash
npm pack                    # Creates .tgz file
npx ./package-name.tgz      # Test exact npm package structure
```

**3. Beta Release (External Testing)**
```bash
npm version prerelease --preid=beta  # 1.0.0 → 1.0.0-beta.1
npm publish --tag beta               # Doesn't affect 'latest' tag
git push && git push --tags
```

**4. Create Release Notes (Test Checklist)**

Immediately after beta publishing, create release notes in `docs/release_notes/vX.Y.Z-beta.md`:

```markdown
# Release vX.Y.Z-beta.1

## Breaking Changes
- List any breaking changes that require user action

## New Features
- List new capabilities and integrations

**Beta Testing Configuration:**
```json
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["mcp-consultant-tools@beta"],
      "env": {
        "INTEGRATION_VAR": "your-value"
      }
    }
  }
}
```

## Changes to Existing Features
- List modifications to existing functionality
```

**Purpose:** Release notes serve as a test checklist. Include beta config for updated integrations.

**🛑 HARD STOP - USER TESTING REQUIRED 🛑**

At this point, Claude Code must STOP and handover to the user for manual testing:

1. **User must review release notes:** `docs/release_notes/vX.Y.Z-beta.md`

2. **User must test the beta release using provided config:**
   ```bash
   npx mcp-consultant-tools@beta
   ```

3. **User must verify all features from release notes:**
   - All integrations load correctly
   - Environment variables are read properly
   - Tools and prompts work as expected
   - No breaking changes or regressions
   - Test each feature listed in release notes

4. **If issues found:** User will report back → iterate on beta.X releases (update release notes)

5. **If validation succeeds:** User confirms → finalize release notes → proceed to production

**5. Iterate on Beta (if issues found)**

**Default Approach: Selective Package Publishing (Faster)**

When iterating on beta releases, publish ONLY the affected packages to speed up the feedback loop:

```bash
# Option A: Publish only affected package (RECOMMENDED for beta iterations)
# Example: Fix found in powerplatform package only
cd packages/powerplatform
# Edit package.json manually: version "20.0.0-beta.2" → "20.0.0-beta.3"
npm run build
npm publish --tag beta

# Or from workspace root:
npm publish --tag beta --workspace @mcp-consultant-tools/powerplatform

# Update release notes: add fixes, update version in filename
```

**Why selective publishing during beta:**
- ✅ **Much faster** (1 package vs 13 packages = 30 seconds vs 5 minutes)
- ✅ **Rapid iteration** for quick bug fixes
- ✅ **Users can test immediately** with `@mcp-consultant-tools/package@beta`
- ⚠️ **Trade-off:** Version misalignment (some packages at beta.2, others at beta.3)
- ✅ **Fixed before production:** All versions aligned when promoting to `latest`

**Alternative: Publish all packages (use for major changes)**

```bash
# Option B: Publish all packages (slower, maintains version alignment)
npm version prerelease --preid=beta --workspaces --no-git-tag-version  # beta.1 → beta.2
git add packages/*/package.json
git commit -m "chore: bump version to X.Y.Z-beta.2"
./scripts/publish-all.sh --skip-build --tag beta
```

**When to use each approach:**
- **Selective (Option A):** Small fixes, single package changes, rapid iteration (DEFAULT for beta)
- **All packages (Option B):** Major changes, breaking changes, final beta before production

**6. Finalize Release Notes (after validation)**
```bash
# Rename: vX.Y.Z-beta.md → vX.Y.Z.md
# Remove beta references and beta config section
# Add release date
```

**7. Production Release (after beta validation)**
```bash
# Merge to main first
git checkout main
git merge release/X.Y

# Option A: Promote existing beta
npm dist-tag add @mcp-consultant-tools/powerplatform@1.0.0-beta.2 latest

# Option B: Publish as final version
npm version patch  # 1.0.0-beta.2 → 1.0.0
npm publish        # Publishes to 'latest' (default)

git push && git push --tags
```

### Version Bumping
- `npm version prerelease --preid=beta`: Create/increment beta (1.0.0 → 1.0.0-beta.1)
- `npm version patch`: Bug fixes (1.0.0 → 1.0.1)
- `npm version minor`: New features (1.0.0 → 1.1.0)
- `npm version major`: Breaking changes (1.0.0 → 2.0.0)

### Emergency Rollback
```bash
# Deprecate broken version
npm deprecate @mcp-consultant-tools/powerplatform@1.0.5 "Broken - use 1.0.4"

# Rollback 'latest' tag to last good version
npm dist-tag add @mcp-consultant-tools/powerplatform@1.0.4 latest
```

### Quick Reference
```bash
# Check published versions and tags
npm dist-tag ls @mcp-consultant-tools/powerplatform

# View package details
npm view @mcp-consultant-tools/powerplatform

# Local testing with absolute path in MCP client config
{
  "command": "node",
  "args": ["/absolute/path/to/mcp-consultant-tools/build/index.js"]
}
```

### Key Principles
1. ✅ Always test with `npm pack` before publishing
2. ✅ Always publish to `beta` tag first for external testing
3. ✅ Create release notes with beta config immediately after beta publishing
4. ✅ **HARD STOP** - user must test manually using release notes as checklist
5. ✅ Iterate on beta releases until validated (update release notes each time)
6. ✅ Finalize release notes (remove beta references) before production
7. ✅ Never publish directly to `latest` without beta validation
8. ✅ Use `scripts/publish-all.sh` for coordinated monorepo releases

**Full details:** See [RELEASE_PROCESS.md](docs/documentation/RELEASE_PROCESS.md) for comprehensive testing strategies, monorepo publishing, and troubleshooting

## TypeScript Configuration

- Target: ES2022
- Module: Node16 with Node16 module resolution
- Strict mode enabled
- Output directory: `./build`
- Source directory: `./src`

---

⚠️ **REMEMBER: 40,000 CHARACTER LIMIT** ⚠️

Before adding content to this file:
1. Check current size: `wc -c CLAUDE.md` (must be < 40,000 characters)
2. Consider if content belongs in an integration technical guide (`docs/technical/`)
3. Keep this file focused on high-level architecture and universal guidelines
4. Move integration-specific details to appropriate technical guide

**Why this matters**: Large CLAUDE.md files impact Claude Code performance and cause parsing issues.
