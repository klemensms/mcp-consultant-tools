# PowerPlatform Package Split Plan

## Overview

The PowerPlatform package currently contains 81 tools that provide read, write, and customization capabilities for Microsoft Dynamics 365 / Dataverse. This document outlines a plan to split it into 3 security-focused packages.

## Rationale

**Security & Safety**: Different environments require different access levels:
- **Production**: Read-only access is safe and sufficient for most operations
- **Development**: Customization tools are needed for schema changes
- **Operations**: Data CRUD tools are needed for data management

By splitting into 3 packages, users can:
- Install only what they need
- Reduce security risk in production
- Follow principle of least privilege
- Enable safer AI agent operations

## Proposed Package Structure

### 1. @mcp-consultant-tools/powerplatform (Read-Only - 38 tools)

**Description**: Safe read-only access to Dataverse metadata and data. Production-safe.

**Tools (38)**:
- `get-entity-metadata` - Entity schema information
- `get-entity-attributes` - Field definitions
- `get-entity-relationships` - Relationships
- `get-record` - Read single record
- `query-records` - Query multiple records
- `get-plugin-assemblies` - Plugin discovery
- `get-plugin-assembly-complete` - Plugin details
- `get-entity-plugin-pipeline` - Plugin execution order
- `get-plugin-trace-logs` - Plugin logs
- `get-flows` - Power Automate flows
- `get-flow-definition` - Flow logic
- `get-flow-runs` - Flow execution history
- `get-workflows` - Classic workflows
- `get-workflow-definition` - Workflow XAML
- `get-business-rules` - Business rules
- `get-business-rule` - Business rule definition
- `get-apps` - Model-driven apps
- `get-app` - App details
- `get-app-components` - App components
- `get-app-sitemap` - App navigation
- `get-forms` - Forms list
- `get-views` - Views list
- `get-view-fetchxml` - View query
- `get-web-resource` - Web resource details
- `get-web-resources` - All web resources
- `get-webresource-dependencies` - Web resource deps
- `get-global-option-set` - Option set values
- `get-publishers` - Solution publishers
- `get-solutions` - Solutions list
- `get-relationship-details` - Relationship info
- `get-entity-customization-info` - Customization metadata
- `validate-schema-name` - Name validation
- `check-delete-eligibility` - Delete safety check
- `check-entity-dependencies` - Dependency checker
- `check-dependencies` - Solution dependencies
- `preview-unpublished-changes` - Pending changes
- `validate-solution-integrity` - Solution validation

**Prompts (10)**: All read-only prompts would stay here
- `entity-overview`
- `attribute-details`
- `query-template`
- `relationship-map`
- `plugin-deployment-report`
- `entity-plugin-pipeline-report`
- `flows-report`
- `workflows-report`
- `business-rules-report`
- `app-overview`

**Environment Variables**:
```bash
POWERPLATFORM_URL=https://org.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=xxx
POWERPLATFORM_CLIENT_SECRET=xxx
POWERPLATFORM_TENANT_ID=xxx
```

**Use Cases**:
- Production monitoring
- Documentation generation
- Code reviews
- Safe exploration

---

### 2. @mcp-consultant-tools/powerplatform-customization (Schema Changes - 40 tools)

**Description**: Tools for modifying Dataverse schema (entities, attributes, forms, views, solutions). Development/configuration use only.

**Tools (40)**:
- **Entities**: `create-entity`, `update-entity`, `delete-entity`, `publish-entity`
- **Attributes**: `create-attribute`, `update-attribute`, `delete-attribute`
- **Relationships**: `create-one-to-many-relationship`, `create-many-to-many-relationship`, `update-relationship`, `delete-relationship`
- **Option Sets**: `create-global-optionset-attribute`, `update-global-optionset`, `add-optionset-value`, `update-optionset-value`, `delete-optionset-value`, `reorder-optionset-values`
- **Forms**: `create-form`, `update-form`, `delete-form`, `activate-form`, `deactivate-form`
- **Views**: `create-view`, `update-view`, `delete-view`, `set-default-view`
- **Web Resources**: `create-web-resource`, `update-web-resource`, `delete-web-resource`
- **Solutions**: `create-publisher`, `create-solution`, `add-solution-component`, `remove-solution-component`, `export-solution`, `import-solution`
- **Publishing**: `publish-customizations`
- **Apps**: `add-entities-to-app`, `validate-app`, `publish-app`
- **Misc**: `update-entity-icon`

**Environment Variables**:
```bash
POWERPLATFORM_URL=https://org.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=xxx
POWERPLATFORM_CLIENT_SECRET=xxx
POWERPLATFORM_TENANT_ID=xxx
POWERPLATFORM_ENABLE_CUSTOMIZATION=true  # Required to enable
```

**Use Cases**:
- Schema development
- Solution management
- ALM processes
- Configuration changes

---

### 3. @mcp-consultant-tools/powerplatform-data (CRUD Operations - 3 tools)

**Description**: Create, update, and delete record data. Operational use with appropriate permissions.

**Tools (3)**:
- `create-record` - Create new records
- `update-record` - Modify existing records
- `delete-record` - Delete records (with confirmation)

**Environment Variables**:
```bash
POWERPLATFORM_URL=https://org.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=xxx
POWERPLATFORM_CLIENT_SECRET=xxx
POWERPLATFORM_TENANT_ID=xxx
POWERPLATFORM_ENABLE_CREATE=true   # Enable create
POWERPLATFORM_ENABLE_UPDATE=true   # Enable update
POWERPLATFORM_ENABLE_DELETE=true   # Enable delete (dangerous)
```

**Use Cases**:
- Data migrations
- Bulk updates
- Data cleanup
- Integration workflows

---

## Implementation Steps

### Phase 1: Package Structure
1. Create `packages/powerplatform-customization/` directory
2. Create `packages/powerplatform-data/` directory
3. Copy service files and utilities to both packages
4. Create package.json and tsconfig.json for each

### Phase 2: Tool Extraction
1. Extract customization tools from current PowerPlatform index.ts
2. Extract data CRUD tools from current PowerPlatform index.ts
3. Remove extracted tools from base PowerPlatform index.ts
4. Verify all 81 tools are accounted for

### Phase 3: Service Sharing
Options:
- **Option A**: Copy PowerPlatformService to each package (simple, some duplication)
- **Option B**: Extract service to shared package (cleaner, more complex)
- **Option C**: Have customization/data depend on base powerplatform package

Recommendation: **Option A** for simplicity in initial implementation

### Phase 4: Testing & Documentation
1. Build all 3 packages
2. Test standalone execution
3. Update README with security guidance
4. Document migration path for existing users

### Phase 5: Main Index Update
Update `src/index.ts` to import all 3 packages:
```typescript
import { registerPowerPlatformTools } from "@mcp-consultant-tools/powerplatform";
import { registerPowerPlatformCustomizationTools } from "@mcp-consultant-tools/powerplatform-customization";
import { registerPowerPlatformDataTools } from "@mcp-consultant-tools/powerplatform-data";
```

---

## Migration Guide for Users

### Before (Single Package):
```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform"]
    }
  }
}
```

### After (Selective Packages):

**Production (Read-Only)**:
```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform"]
    }
  }
}
```

**Development (Read + Customization)**:
```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform"]
    },
    "powerplatform-customization": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform-customization"],
      "env": {
        "POWERPLATFORM_ENABLE_CUSTOMIZATION": "true"
      }
    }
  }
}
```

**Operations (Read + Data CRUD)**:
```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform"]
    },
    "powerplatform-data": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform-data"],
      "env": {
        "POWERPLATFORM_ENABLE_CREATE": "true",
        "POWERPLATFORM_ENABLE_UPDATE": "true"
      }
    }
  }
}
```

---

## Benefits

✅ **Security**: Production environments can use read-only package safely
✅ **Flexibility**: Users choose what capabilities they need
✅ **Safety**: Reduces accidental schema changes or data modifications
✅ **Compliance**: Easier to audit and approve specific capabilities
✅ **Granular Control**: Environment variables control individual operations

---

## Tool Categorization Reference

See `scripts/split-powerplatform.sh` for complete tool categorization arrays.

**Summary**:
- Read-Only: 38 tools (safe for production)
- Customization: 40 tools (dev/config environments)
- Data CRUD: 3 tools (operational, with guards)
- **Total**: 81 tools

---

## Status

**Current**: Single `@mcp-consultant-tools/powerplatform` package with all 81 tools
**Planned**: Split into 3 security-focused packages
**Timeline**: Post Phase 2 migration completion
**Priority**: Medium (enhancement, not blocker)

---

## Related Documents

- [MIGRATE_INDEX.md](MIGRATE_INDEX.md) - Main migration plan
- [CLAUDE.md](CLAUDE.md) - Architecture documentation
- `scripts/split-powerplatform.sh` - Tool categorization script
