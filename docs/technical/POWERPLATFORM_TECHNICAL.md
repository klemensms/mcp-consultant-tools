# PowerPlatform Technical Implementation Guide

This document contains detailed technical implementation information for the PowerPlatform integration. For high-level architecture and usage information, see [CLAUDE.md](../../CLAUDE.md) and [PowerPlatform Documentation](../documentation/POWERPLATFORM.md).

## Table of Contents
- [Data CRUD Operations](#data-crud-operations)
- [Plugin Registration & Validation](#plugin-registration--validation)
- [Plugin Deployment](#plugin-deployment)
- [Workflows & Power Automate Flows](#workflows--power-automate-flows)
- [Best Practices Validation](#best-practices-validation)
- [Icon Management](#icon-management)

## Data CRUD Operations

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

## Plugin Registration & Validation

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

## Plugin Deployment

### Overview

The PowerPlatform Customization package (`@mcp-consultant-tools/powerplatform-customization`) provides **5 specialized tools** for automated plugin deployment to Dynamics 365/Dataverse environments. These tools enable AI-assisted deployment workflows, eliminating the need for manual Plugin Registration Tool operations.

**Key Capabilities:**
- Upload compiled .NET DLLs from local file system
- Automatic assembly version extraction from PE headers
- Polling mechanism for plugin type discovery (15 attempts × 2 seconds)
- Plugin step registration on SDK messages with stage/mode configuration
- Pre/Post image registration for plugin context
- Orchestration tool for end-to-end deployment

**Security Model:**
- Requires `POWERPLATFORM_ENABLE_CUSTOMIZATION=true` environment flag
- All operations require System Customizer or System Administrator role
- Plugins deployed with Sandbox isolation mode (isolationmode: 2)
- All operations audited with assembly names and timestamps
- 16MB assembly size limit enforced

### Plugin Deployment Tools

**Location:** `packages/powerplatform-customization/src/index.ts` (tools) and `packages/powerplatform-customization/src/PowerPlatformService.ts` (service methods)

1. **create-plugin-assembly** - Upload and register new plugin assembly
   - Reads DLL from local file system using dynamic `fs/promises` import
   - Validates MZ header (PE file signature) to ensure valid .NET assembly
   - Encodes DLL to base64 for Dataverse Web API transfer
   - Extracts assembly version from PE header via `extractAssemblyVersion()` helper
   - POSTs to `/api/data/v9.2/pluginassemblies` with content, name, version, culture, public key token
   - Polls for plugin types (15 attempts, 2-second intervals, 30-second max timeout)
   - Adds assembly to solution if `solutionUniqueName` provided
   - Returns assembly ID, discovered plugin types, and deployment summary

2. **update-plugin-assembly** - Update existing assembly with new DLL
   - Reads updated DLL from file system
   - Extracts new version number from PE header
   - PATCHes to `/api/data/v9.2/pluginassemblies({id})` with updated content and version
   - Existing step registrations automatically use new code (no re-registration needed)
   - Adds to solution if specified

3. **register-plugin-step** - Register plugin step on SDK message
   - Resolves SDK message and filter IDs using `resolveSdkMessageAndFilter()` helper
   - Maps enum values: PreValidation (10), PreOperation (20), PostOperation (40)
   - Maps execution mode: Synchronous (0), Asynchronous (1)
   - POSTs to `/api/data/v9.2/sdkmessageprocessingsteps` with configuration
   - Supports filtering attributes for Update/Delete steps (performance optimization)
   - Adds step to solution if specified
   - Returns step ID for image registration

4. **register-plugin-image** - Register pre/post image for plugin step
   - Maps image type enum: PreImage (0), PostImage (1), Both (2)
   - POSTs to `/api/data/v9.2/sdkmessageprocessingstepimages` with configuration
   - Configures attributes to include in image snapshot
   - Sets entity alias for plugin code access (e.g., "PreImage", "PostImage")
   - Returns image ID

5. **deploy-plugin-complete** - **Orchestration tool** for end-to-end deployment
   - Uploads or updates assembly based on `updateExisting` flag
   - Iterates through `stepConfigurations` array to register all steps
   - For each step, registers associated images from nested `images` array
   - Automatically publishes customizations if `publishAfterDeployment=true` (default)
   - Returns comprehensive deployment summary with assembly ID, plugin types, step IDs, image IDs, and publishing status
   - **Recommended approach** for complete plugin deployments

### Service Implementation

**File:** `packages/powerplatform-customization/src/PowerPlatformService.ts`

**Core Helper Methods:**

1. **extractAssemblyVersion()** - Parses PE header to extract .NET assembly version (fallback: "1.0.0.0")
2. **resolveSdkMessageAndFilter()** - Queries SDK message and filter IDs for plugin step registration

**Core Service Methods:**

3. **createPluginAssembly()** - Uploads DLL (base64), validates (MZ header, 16MB limit), extracts version, POSTs to `/pluginassemblies`, polls for plugin types (15×2s), adds to solution
4. **updatePluginAssembly()** - PATCHes existing assembly with new DLL content and version (steps auto-update)
5. **registerPluginStep()** - Resolves message/filter IDs, POSTs to `/sdkmessageprocessingsteps` with stage/mode/rank, adds to solution
6. **registerPluginImage()** - POSTs to `/sdkmessageprocessingstepimages` with imageType (0=Pre, 1=Post, 2=Both), attributes, entityAlias

### Tool Implementation Patterns

Common patterns: Dynamic fs imports (ESM/CJS compatibility), base64 encoding for binary transfer, MZ header validation, enum mapping (PreValidation=10, PreOperation=20, PostOperation=40), audit logging for all writes.

### Workflow Examples

1. **deploy-plugin-complete** - Single orchestration call with stepConfigurations array (multiple steps + images), publishes automatically
2. **update-plugin-assembly** - Update DLL + version, steps auto-update, publish required
3. **Step-by-step** - create-plugin-assembly → register-plugin-step → register-plugin-image → publish-customizations

### Design Considerations

Windows-only (.NET Framework 4.6.2), polling for plugin types (15×2s, async parsing), base64 encoding (Dataverse API requirement), helper methods (extractAssemblyVersion, resolveSdkMessageAndFilter), orchestration tool (80% common case).

### Error Handling

Common errors: Plugin types not found, assembly >16MB (ILMerge selectively), invalid SDK message, DLL path not found, step registration missing required fields.

### Security Audit

All operations audited: operation type, component type/name/ID, assembly path (truncated), version, success/failure, execution time. Enables tracking, rollback support, compliance, and security investigation.

## Workflows & Power Automate Flows

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

## Best Practices Validation

### Overview

The Best Practices Validation feature provides automated validation of Dataverse entities against internal best practices for column naming, prefixes, and configuration. This enables AI agents and developers to quickly identify non-compliant entities and receive actionable recommendations for remediation.

### Available Tools (1 total)

1. **`validate-dataverse-best-practices`** - Validate entities against best practices rules

### Available Prompts (1 total)

1. **`dataverse-best-practices-report`** - Generate formatted markdown report from validation results

### Validation Rules

The validation service implements 6 configurable rules:

1. **Publisher Prefix Check** (MUST) - All custom columns must have the correct publisher prefix (e.g., `sic_`)
2. **Schema Name Lowercase** (MUST) - Schema names (LogicalName) must be all lowercase
3. **Lookup Naming Convention** (MUST) - Lookup columns must end with "id" (e.g., `sic_contactid`)
4. **Option Set Scope** (MUST) - All option sets (picklists) MUST be global, not local - validates that every option set uses global option sets for reusability and maintainability
5. **Required Column Existence** (MUST) - Non-RefData tables must have required columns. **⭐ NEW v20.1**: Customizable via `requiredColumns` parameter (default: `["{prefix}updatedbyprocess"]`). Use case: enforce SQL timestamp columns for bi-directional sync: `["{prefix}sqlcreatedon", "{prefix}sqlmodifiedon"]`
6. **Entity Icon** (SHOULD) - Custom entities should have icons assigned (improves UX in Model-Driven Apps)

### Service Implementation

**File:** [packages/powerplatform/src/PowerPlatformService.ts](packages/powerplatform/src/PowerPlatformService.ts)

**Method Signature:**
```typescript
async validateBestPractices(
  solutionUniqueName: string | undefined,
  entityLogicalNames: string[] | undefined,
  publisherPrefix: string,
  recentDays: number = 30,
  includeRefDataTables: boolean = true,
  rules: string[] = ['prefix', 'lowercase', 'lookup', 'optionset', 'required-column', 'entity-icon'],
  maxEntities: number = 0,
  requiredColumns: string[] = ['{prefix}updatedbyprocess']  // ⭐ NEW v20.1
): Promise<BestPracticesValidationResult>
```

**Two Validation Modes:**

1. **Solution-based** - Validate all entities in a solution:
   ```typescript
   const result = await service.validateBestPractices(
     'RTPICore',      // solutionUniqueName
     undefined,       // entityLogicalNames
     'sic_',          // publisherPrefix
     30,              // recentDays
     true,            // includeRefDataTables
     ['prefix', 'lowercase', 'lookup'], // rules
     0                // maxEntities (unlimited)
   );
   ```

2. **Entity-based** - Validate specific entities:
   ```typescript
   const result = await service.validateBestPractices(
     undefined,                              // solutionUniqueName
     ['sic_strikeaction', 'sic_application'], // entityLogicalNames
     'sic_',                                  // publisherPrefix
     0                                        // recentDays (all columns)
   );
   ```

3. **Custom Required Columns** - Validate SQL timestamp columns (NEW v20.1):
   ```typescript
   const result = await service.validateBestPractices(
     'RTPICore',                              // solutionUniqueName
     undefined,                               // entityLogicalNames
     'sic_',                                  // publisherPrefix
     0,                                       // recentDays (all columns)
     true,                                    // includeRefDataTables
     ['required-column'],                     // rules (only check required columns)
     0,                                       // maxEntities (unlimited)
     ['{prefix}sqlcreatedon', '{prefix}sqlmodifiedon', '{prefix}updatedbyprocess']  // requiredColumns
   );

   // Report which entities are missing SQL timestamp columns
   for (const entity of result.entities) {
     const missingColumns = entity.violations.filter(v => v.rule === 'Required Column Existence');
     if (missingColumns.length > 0) {
       console.log(`${entity.logicalName}: Missing ${missingColumns.length} required columns`);
     }
   }
   ```

**Key Features:**

- **Date Filtering**: Only validate columns created in last N days (configurable, 0 = all)
- **System Column Exclusion**: Automatically excludes system columns (createdon, modifiedon, etc.)
- **RefData Handling**: Skips required column checks for RefData tables (schema starts with `{prefix}ref_`)
- **Rule Selection**: Choose which rules to validate (performance optimization)
- **Safety Limits**: `maxEntities` parameter prevents timeout on large solutions
- **Audit Logging**: All operations logged with execution time and violation count
- **⭐ NEW v20.1 - Customizable Required Columns**: Specify which columns must exist on all non-RefData tables via `requiredColumns` parameter. Use `{prefix}` placeholder which gets replaced with `publisherPrefix` at runtime. Default: `["{prefix}updatedbyprocess"]`. Common use case: enforce SQL timestamp columns for bi-directional sync: `["{prefix}sqlcreatedon", "{prefix}sqlmodifiedon"]`

### JSON Response Structure

The `validate-dataverse-best-practices` tool returns a comprehensive JSON object with the following structure:

```typescript
{
  metadata: {
    generatedAt: string;           // ISO timestamp
    solutionName?: string;          // Solution display name
    solutionUniqueName?: string;    // Solution unique name
    publisherPrefix: string;        // e.g., "sic_"
    recentDays: number;             // Date filter (30 = last 30 days)
    executionTimeMs: number;        // Execution time in milliseconds
  },
  summary: {
    entitiesChecked: number;        // Total entities validated
    attributesChecked: number;      // Total columns validated
    totalViolations: number;        // Total violations found
    criticalViolations: number;     // MUST-level violations
    warnings: number;               // SHOULD-level violations
    compliantEntities: number;      // Entities with no violations
  },
  violationsSummary: [              // ⭐ NEW: Complete lists grouped by rule
    {
      rule: string;                 // e.g., "Required Column Existence"
      severity: "MUST" | "SHOULD";  // Violation severity
      totalCount: number;           // Total violations for this rule
      affectedEntities: string[];   // Complete list of entity logical names
      affectedColumns: string[];    // Complete list of "entity.column" pairs
      action: string;               // Recommended action
      recommendation?: string;      // Explanation (optional)
    }
  ],
  entities: [                       // Per-entity detailed breakdown
    {
      logicalName: string;
      schemaName: string;
      displayName: string;
      isRefData: boolean;
      attributesChecked: number;
      violations: [...];            // Individual violations
      isCompliant: boolean;
    }
  ],
  statistics: {
    systemColumnsExcluded: number;  // System columns skipped
    oldColumnsExcluded: number;     // Columns older than date filter
    refDataTablesSkipped: number;   // RefData tables skipped
  }
}
```

**Key Feature: `violationsSummary` Field**

The `violationsSummary` field provides **complete lists of all affected tables and columns** grouped by rule type. This is critical for:

1. **Quick Scanning**: See all 41 entities missing `updatedbyprocess` without reading per-entity details
2. **Bulk Operations**: Copy-paste entity names for bulk fixes
3. **AI Summarization**: AI assistants can accurately report complete lists without parsing individual violations
4. **Reporting**: Generate executive summaries showing complete affected entity lists

**Example:**
```json
{
  "violationsSummary": [
    {
      "rule": "Required Column Existence",
      "severity": "MUST",
      "totalCount": 41,
      "affectedEntities": [
        "sic_strikeaction",
        "sic_application",
        "sic_project",
        // ... 38 more entities
      ],
      "affectedColumns": [],
      "action": "Create column with Display Name \"Updated by process\"...",
      "recommendation": "This field is required for audit tracking..."
    }
  ]
}
```

### Formatter Utilities

**File:** [packages/powerplatform/src/utils/best-practices-formatters.ts](packages/powerplatform/src/utils/best-practices-formatters.ts)

**Available Formatters:**
- `formatBestPracticesReport()` - Main markdown report generator
- `formatViolationsBySeverity()` - Group violations by MUST/SHOULD
- `formatCompliantEntities()` - List compliant entities
- `formatExecutionStats()` - Execution statistics and performance metrics
- `formatQuickSummary()` - CLI-friendly one-line summary

**Report Structure:**
```markdown
# Dataverse Best Practice Validation Report

**Solution**: RTPI Core (RTPICore)
**Generated**: 2025-11-13 10:30 AM
**Publisher Prefix**: sic_
**Time Filter**: Columns created in last 30 days

## Summary
| Metric | Count |
|--------|-------|
| Entities Checked | 15 |
| Attributes Checked | 127 |
| Total Violations | 8 |
| Critical (MUST) | 5 |
| Warnings (SHOULD) | 3 |

---

## 📋 Violations Summary (Complete Lists)
_This section provides complete lists of ALL affected tables and columns grouped by violation type._

### 🔴 Required Column Existence (MUST)
**Affected Items**: 3
**Affected Tables**: `sic_strikeaction`, `sic_application`, `sic_project`
**Recommended Action**: Create column with Display Name "Updated by process", Schema Name "sic_updatedbyprocess"...
**Why**: This field is required for audit tracking...

### 🔴 Schema Name Lowercase (MUST)
**Affected Items**: 2
**Affected Columns**: `sic_strikeaction.sic_ContactId`, `sic_application.sic_AccountId`
**Recommended Action**: Rename column to use all lowercase...

### ⚠️ Entity Icon (SHOULD)
**Affected Items**: 5
**Affected Tables**: `sic_strikeaction`, `sic_application`, `sic_project`, `sic_task`, `sic_milestone`
**Recommended Action**: Assign a Fluent UI icon using the update-entity-icon tool...
**Why**: Custom icons improve entity recognition in Model-Driven Apps...

---

## 🔴 Critical Violations (MUST Fix)
[Per-entity detailed breakdown...]

## ⚠️ Warnings (SHOULD Fix)
[Per-entity detailed breakdown...]

## ✅ Compliant Entities
...
```

### Use Cases

**Pre-Commit Validation:**
- Run before solution export to catch issues early
- Integrate with CI/CD pipelines
- Fail builds if critical violations found

**Code Review:**
- Generate reports for PR reviews
- Track compliance over time
- Identify technical debt

**New Developer Onboarding:**
- Validate entities created by new developers
- Provide immediate feedback with actionable recommendations
- Enforce coding standards automatically

**Solution Health Checks:**
- Periodic validation of entire solutions
- Identify drift from best practices
- Generate compliance reports for management

### Example Usage

**Validate Entire Solution:**
```bash
# Using MCP tool
validate-dataverse-best-practices {
  "solutionUniqueName": "RTPICore",
  "publisherPrefix": "sic_",
  "recentDays": 30
}

# Generate report
dataverse-best-practices-report {
  "validationResult": "<json from above>"
}
```

**Validate Specific Entities:**
```bash
validate-dataverse-best-practices {
  "entityLogicalNames": ["sic_strikeaction", "sic_application"],
  "publisherPrefix": "sic_",
  "recentDays": 0
}
```

**Quick Scan (Only Critical Rules):**
```bash
validate-dataverse-best-practices {
  "solutionUniqueName": "RTPICore",
  "publisherPrefix": "sic_",
  "rules": ["prefix", "lowercase", "lookup"]
}
```

### Performance Optimization

- **Query Optimization**: Uses `$select` clauses to limit response size
- **Parallel Processing**: Validates entities sequentially but optimizes API calls
- **Date Filtering**: Reduces validation scope with `recentDays` parameter
- **Rule Selection**: Skip expensive rules (e.g., option set scope check) when not needed
- **Safety Limits**: `maxEntities` parameter prevents timeout on very large solutions

**Typical Performance:**
- 20 entities: < 2 minutes
- 50 entities: < 5 minutes
- 100+ entities: Use `maxEntities` limit or focus on recent changes

### Integration with Existing Tools

The validation service leverages existing infrastructure:
- Uses existing `makeRequest()` method for API calls
- Follows existing audit logging pattern
- Compatible with existing PowerPlatform service architecture
- No additional environment configuration required (read-only)

## Icon Management

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
