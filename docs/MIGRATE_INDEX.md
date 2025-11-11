# MCP Server Migration: Monolithic → Multiple Packages

## Migration Status: 🔴 BLOCKED

**Current Phase:** Option C - Tool Extraction
**Blocker:** Build failures due to malformed extracted code
**Last Updated:** 2025-11-11

---

## Executive Summary

**Goal:** Split monolithic `src/index.ts` (11,887 lines, 172 tools, 47 prompts) into 9 independent MCP server packages.

**Progress:**
- ✅ 9 package structures created with service files
- ✅ Meta package configured to call all `registerXxxTools()` functions
- 🔴 Tool/prompt extraction BLOCKED on build errors
- ⏳ Documentation updates pending (Option A)

**Current Approach:** Extracting line ranges using `sed` has proven fragile and error-prone. Need alternative strategy.

---

## Package Structure Overview

### 9 Target Packages

| Package | Service File | Tools | Prompts | Status |
|---------|-------------|-------|---------|--------|
| `@mcp-consultant-tools/powerplatform` | ✅ PowerPlatformService.ts (104KB) | 65 | 12 | 🔴 Extraction blocked |
| `@mcp-consultant-tools/azure-devops` | ✅ AzureDevOpsService.ts (25KB) | 18 | 6 | 🔴 Extraction blocked |
| `@mcp-consultant-tools/figma` | ✅ FigmaService.ts | 2 | 0 | 🔴 Extraction blocked |
| `@mcp-consultant-tools/application-insights` | ✅ ApplicationInsightsService.ts | 10 | 5 | 🔴 Extraction blocked |
| `@mcp-consultant-tools/log-analytics` | ✅ LogAnalyticsService.ts | 10 | 5 | 🔴 Extraction blocked |
| `@mcp-consultant-tools/azure-sql` | ✅ AzureSqlService.ts | 11 | 3 | 🔴 Extraction blocked |
| `@mcp-consultant-tools/service-bus` | ✅ ServiceBusService.ts | 8 | 5 | 🔴 Extraction blocked |
| `@mcp-consultant-tools/sharepoint` | ✅ SharePointService.ts (46KB) | 15 | 5 | 🔴 Extraction blocked |
| `@mcp-consultant-tools/github-enterprise` | ✅ GitHubEnterpriseService.ts | 22 | 5 | 🔴 Extraction blocked |
| **Meta Package** | - | - | - | ✅ Already configured |

**Total:** 172 tools, 47 prompts across 9 services

---

## Source File Line Ranges (src/index.ts)

### 1. PowerPlatform
- **Prompts:** Lines 1380-1498 (12 prompts)
- **Tools:** Lines 3382-7557 (65 tools)
  - Model-Driven App Tools: 3382-4170
  - Customization Tools: 4255-7557

### 2. Azure DevOps
- **Prompts:** Lines 1499-1805 (6 prompts)
- **Tools:** Lines 3657-4170 (18 tools)
  - Wiki Tools: 3657-3902
  - Work Item Tools: 3903-4170

### 3. Figma
- **Tools Only:** Lines 4172-4254 (2 tools)
- **No Prompts**

### 4. Application Insights
- **Prompts:** Lines 1807-2149 (5 prompts)
- **Tools:** Lines 7071-7567 (10 tools)

### 5. Log Analytics
- **Prompts:** Lines 2162-4170 (5 prompts)
- **Tools:** Lines 7559-8054 (10 tools)

### 6. Azure SQL
- **Prompts:** Lines 8527-9537 (3 prompts)
- **Tools:** Lines 8055-8526 (11 tools)

### 7. Service Bus
- **Prompts:** Lines 10150-10497 (5 prompts)
- **Tools:** Lines 9541-10146 (8 tools)

### 8. GitHub Enterprise
- **Prompts:** Lines 9837-10148 (5 prompts)
- **Tools:** Lines 8644-9539 (22 tools)

### 9. SharePoint
- **Prompts:** Lines 11055-11844 (5 prompts)
- **Tools:** Lines 10501-11053 (15 tools)

---

## Outstanding Tasks

### 🔴 PHASE 1: Complete Tool Extraction (Option C) - BLOCKED

**Current Status:** Multiple failed attempts using `sed` line-range extraction

**Problems Encountered:**
1. ✗ Stray comment closers (`*/`) from partial doc comment extraction
2. ✗ Leaked sections from adjacent integrations bleeding into extracted files
3. ✗ Multiple cleanup scripts created additional syntax errors
4. ✗ Build fails with TypeScript compilation errors

**Attempted Fixes:**
- `/tmp/fix-stray-comment-closers.sh` - Removed legitimate closers
- `/tmp/remove-leaked-sections.sh` - awk pattern matching issues
- `/tmp/final-cleanup.sh` - Created more broken syntax

**Root Cause:** Line-range extraction with `sed` is too fragile for code with nested comment blocks

**Recommended Solution:** Choose ONE of the following approaches:

#### Option 1: Manual Extraction (SAFEST)
- Manually copy/paste each section into package files
- Verify syntax after each extraction
- Time-consuming but reliable

#### Option 2: Git-Based Extraction
```bash
# For each package:
# 1. Create feature branch
# 2. Delete everything EXCEPT the target integration's tools/prompts
# 3. Extract to package file
# 4. Restore main branch
```

#### Option 3: AST-Based Extraction (MOST ROBUST)
- Use TypeScript compiler API or Babel to parse AST
- Extract tool/prompt registration calls programmatically
- Regenerate valid TypeScript code
- More complex but handles edge cases correctly

#### Option 4: Start Fresh with Working Package (PRAGMATIC)
- Copy `packages/figma/src/index.ts` as template (already working)
- For each package:
  1. Copy figma template
  2. Update imports and config
  3. Manually paste tools/prompts from src/index.ts
  4. Build and verify
  5. Move to next package

**Deliverables:**
- [ ] All 9 `packages/*/src/index.ts` files with extracted tools/prompts
- [ ] All packages build successfully (`npm run build`)
- [ ] No TypeScript compilation errors
- [ ] Each package runs standalone with `node build/index.js`

---

### ⏳ PHASE 2: Update Documentation (Option A) - PENDING

**Prerequisites:** Phase 1 must be complete and building

**Files to Update:**

#### 1. Integration Documentation (9 files)
- [ ] `docs/documentation/powerplatform.md` - Update tool/prompt counts, examples
- [ ] `docs/documentation/azure-devops.md` - Update tool/prompt counts, examples
- [ ] `docs/documentation/figma.md` - Update tool/prompt counts, examples
- [ ] `docs/documentation/application-insights.md` - Update tool/prompt counts, examples
- [ ] `docs/documentation/log-analytics.md` - Update tool/prompt counts, examples
- [ ] `docs/documentation/azure-sql.md` - Update tool/prompt counts, examples
- [ ] `docs/documentation/service-bus.md` - Update tool/prompt counts, examples
- [ ] `docs/documentation/sharepoint.md` - Update tool/prompt counts, examples
- [ ] `docs/documentation/github-enterprise.md` - Update tool/prompt counts, examples

**Documentation Updates Needed:**
- Update package installation instructions (from `mcp-consultant-tools` to `@mcp-consultant-tools/xxx`)
- Update `npx` commands for individual packages
- Update configuration examples
- Verify tool/prompt counts are accurate
- Update code examples to use new package structure

#### 2. CLAUDE.md Architecture Documentation
- [ ] Update architecture section to reflect multi-package structure
- [ ] Add section on package organization and selection
- [ ] Update build and development commands
- [ ] Document how to work with individual packages vs meta package
- [ ] Update "Adding a New Integration" section with package-first approach

#### 3. README.md
- [ ] Update installation instructions (meta package vs individual packages)
- [ ] Add section on package selection
- [ ] Update tool/prompt counts (verify they still total 172/47)
- [ ] Update quick start examples
- [ ] Add comparison table: Meta vs Individual packages

---

### ⏳ PHASE 3: Testing & Validation - PENDING

**Prerequisites:** Phases 1 and 2 must be complete

**Test Checklist:**

#### Build Tests
- [ ] `npm run build` succeeds for all packages
- [ ] No TypeScript compilation errors
- [ ] All `build/` directories contain compiled JavaScript
- [ ] All packages have correct exports in `build/index.js`

#### Runtime Tests
- [ ] Each individual package runs standalone: `node packages/xxx/build/index.js`
- [ ] Meta package runs with all integrations: `node packages/meta/build/index.js`
- [ ] Environment variable validation works for each package
- [ ] Error messages are clear when config is missing

#### Integration Tests
- [ ] Each package can register tools with MCP server
- [ ] Tool counts match documentation (172 total)
- [ ] Prompt counts match documentation (47 total)
- [ ] No duplicate tool names across packages
- [ ] All imports resolve correctly

#### Package Tests
- [ ] `npm pack` succeeds for each package
- [ ] Published package.json has correct dependencies
- [ ] Package can be installed via npm
- [ ] Binary commands work after installation

---

### ⏳ PHASE 4: Deprecation & Migration - PENDING

**Prerequisites:** Phase 3 must be complete

**Tasks:**

#### 1. Deprecate Monolithic Package
- [ ] Add deprecation notice to main `package.json`
- [ ] Update `README.md` with migration guide
- [ ] Add `npm deprecate` message pointing to new packages
- [ ] Keep monolithic package published for 1-2 major versions

#### 2. Create Migration Guide
- [ ] Document migration from `mcp-consultant-tools` → `@mcp-consultant-tools/xxx`
- [ ] Provide configuration file migration examples
- [ ] Create automated migration script (optional)
- [ ] Document breaking changes (if any)

#### 3. Update npm Registry
- [ ] Publish all 10 new packages to npm (@mcp-consultant-tools org)
- [ ] Verify all packages are installable
- [ ] Test `npx @mcp-consultant-tools/figma` commands
- [ ] Update GitHub releases with new package structure

---

## Package Structure Template

Each package should follow this structure:

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { z } from "zod";
import { XxxService, XxxConfig } from "./XxxService.js";

// 1. Configuration
const XXX_CONFIG: XxxConfig = {
  // Parse environment variables
};

// 2. Register function
export function registerXxxTools(server: any, service?: XxxService) {
  let xxxService: XxxService | null = service || null;

  function getXxxService(): XxxService {
    if (!xxxService) {
      // Validate config
      // Initialize service
    }
    return xxxService;
  }

  // PROMPTS (if any)
  server.prompt(...);

  // TOOLS
  server.tool(...);

  console.error("Xxx tools registered successfully (N tools, M prompts)");
}

// 3. Exports
export { XxxService } from "./XxxService.js";
export type { XxxConfig } from "./XxxService.js";

// 4. CLI Entry Point
if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "@mcp-consultant-tools/xxx",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerXxxTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Xxx server:", error);
    process.exit(1);
  });
  console.error("@mcp-consultant-tools/xxx server running with N tools and M prompts");
}
```

---

## Risk Assessment

### High Risk Items
1. 🔴 **Build failures blocking all progress** - Need working extraction approach
2. 🟡 **Line range overlaps** - Some prompts/tools sections overlap in src/index.ts
3. 🟡 **Import dependencies** - Each package must have correct imports from @mcp-consultant-tools/core

### Medium Risk Items
1. 🟡 **Documentation drift** - Tool counts may not match after extraction
2. 🟡 **Breaking changes** - Users will need to update their configuration
3. 🟡 **Testing coverage** - Need comprehensive tests for all 10 packages

### Low Risk Items
1. 🟢 **Service files already exist** - All XxxService.ts files are complete
2. 🟢 **Meta package configured** - Already calls all registerXxxTools()
3. 🟢 **Core package stable** - Shared utilities are working

---

## Decision Points

### Decision 1: Extraction Strategy
**Options:** Manual, Git-based, AST-based, Template-based (see Phase 1)
**Recommendation:** **Option 4 (Template-based)** - Copy working figma template, paste tools/prompts manually
**Rationale:** Most pragmatic, easiest to verify, lowest risk of syntax errors

### Decision 2: Monolithic Package Deprecation
**Options:** Immediate removal, 1-version deprecation, 2-version deprecation
**Recommendation:** **2-version deprecation** - Keep for backward compatibility
**Rationale:** Give users time to migrate, reduce support burden

### Decision 3: Package Publishing Order
**Options:** All at once, Incremental (one at a time), Phased (groups)
**Recommendation:** **Phased** - Publish in groups (Core+Meta, High-use services, Niche services)
**Rationale:** Reduces risk, easier to rollback if issues found

---

## Success Criteria

### Phase 1 (Tool Extraction)
✅ All 9 packages have complete `index.ts` files
✅ `npm run build` succeeds with zero errors
✅ Each package can run standalone
✅ Tool/prompt counts match source file

### Phase 2 (Documentation)
✅ All 9 integration docs updated
✅ CLAUDE.md reflects new architecture
✅ README.md has migration guide
✅ No broken links or outdated examples

### Phase 3 (Testing)
✅ All packages build and run
✅ Integration tests pass
✅ No duplicate tool names
✅ All imports resolve correctly

### Phase 4 (Deployment)
✅ All packages published to npm
✅ Meta package pulls correct versions
✅ Deprecation notice on old package
✅ Migration guide published

---

## Next Steps (Immediate)

1. **Choose extraction strategy** - Decision needed from team/lead
2. **Execute extraction for 1 package** - Test chosen approach with smallest package (Figma)
3. **Verify build success** - Ensure chosen approach produces working code
4. **Scale to remaining 8 packages** - Repeat successful pattern
5. **Update documentation** - Only after all packages build successfully

---

## Questions for Resolution

1. **Which extraction approach should we use?** (Manual, Git, AST, Template)
2. **Should we keep backward compatibility layer?** (Yes/No, how long?)
3. **Package versioning strategy?** (All 1.0.0, or stagger versions?)
4. **Publishing order?** (All at once, incremental, phased?)
5. **Testing requirements?** (Unit tests for each package, or integration tests only?)

---

## Resources

### Related Files
- `/tmp/integration_summary.json` - Complete line range mapping
- `/tmp/extract-all-packages.sh` - Latest extraction script (problematic)
- `packages/figma/src/index.ts` - Working package template (121 lines)
- `packages/meta/src/index.ts` - Meta package (already configured)

### Documentation
- `CLAUDE.md` - Architecture documentation (needs update)
- `README.md` - User-facing docs (needs update)
- `docs/documentation/*.md` - Integration-specific docs (all need updates)

### Commands
```bash
# Build all packages
npm run build

# Build specific package
npm run build -w @mcp-consultant-tools/figma

# Test specific package
node packages/figma/build/index.js

# Check line ranges
sed -n '4172,4254p' src/index.ts
```

---

**Last Updated:** 2025-11-11
**Status:** 🔴 BLOCKED on Phase 1 extraction
**Next Action:** Choose extraction strategy and test with Figma package
