# Dataverse CRUD Implementation Plan

## Executive Summary

This document outlines the plan to extend the PowerPlatform/Dataverse integration with data modification capabilities (Create, Update, Delete operations) while maintaining security, safety, and backward compatibility with existing features.

**Design Principle:** Follow the granular permission pattern established by Azure DevOps and GitHub Enterprise integrations - provide separate environment flags for each operation type to give users precise control.

---

## Current State Analysis

### Existing Read Operations
- **`get-record`** - Retrieve single record by entity name and ID
- **`query-records`** - Query records using OData filters
- Implementation: [PowerPlatformService.ts:275-288](src/PowerPlatformService.ts#L275-L288)

### Existing Write Operations
- **Metadata Operations** - Controlled by `POWERPLATFORM_ENABLE_CUSTOMIZATION`
  - Create/update/delete entities, attributes, relationships
  - Create/update/delete forms, views, web resources
  - Solution management, publishing
  - ~40 tools for customization operations

### Permission Patterns in Other Services

**Azure DevOps:**
```bash
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=false
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=false
AZUREDEVOPS_ENABLE_WIKI_WRITE=false
```

**GitHub Enterprise:**
```bash
GHE_ENABLE_WRITE=false
GHE_ENABLE_CREATE=false
```

**Key Insight:** All services use granular, operation-specific flags that default to `false` for safety.

---

## Proposed Solution

### 1. New Environment Variables

Add three new environment variables with clear separation of concerns:

```bash
# Enable data creation (POST operations)
POWERPLATFORM_ENABLE_CREATE=false

# Enable data updates (PATCH/PUT operations)
POWERPLATFORM_ENABLE_UPDATE=false

# Enable data deletion (DELETE operations)
POWERPLATFORM_ENABLE_DELETE=false
```

**CRITICAL SECURITY REQUIREMENT:**
- **Default Behavior:** If these variables are **NOT SET** in the environment, the code **MUST** treat them as `false`
- **Only `"true"` enables:** The code uses strict equality check (`=== "true"`), so:
  - ✅ Not set (undefined) → `false` (SAFE)
  - ✅ Set to `"false"` → `false` (SAFE)
  - ✅ Set to `"true"` → `true` (ENABLED)
  - ✅ Set to any other value (`"1"`, `"yes"`, `"True"`, etc.) → `false` (SAFE)
- **Purpose:** Prevents accidental data modifications in production if variables are missing from configuration

**Location:** [.env.example](/.env.example) lines 15-18 (after `POWERPLATFORM_ENABLE_CUSTOMIZATION`)

---

### 2. Configuration Updates

#### 2.1 Environment Variable Parsing ([src/index.ts:80-82](src/index.ts#L80-L82))

**Current:**
```typescript
const POWERPLATFORM_CUSTOMIZATION_ENABLED = process.env.POWERPLATFORM_ENABLE_CUSTOMIZATION === "true";
const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
```

**Proposed:**
```typescript
// PowerPlatform Customization Feature Flags (metadata operations)
const POWERPLATFORM_CUSTOMIZATION_ENABLED = process.env.POWERPLATFORM_ENABLE_CUSTOMIZATION === "true";
const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

// PowerPlatform Data CRUD Feature Flags (data operations)
// CRITICAL SECURITY: These MUST default to false if not explicitly set to "true"
// This prevents accidental data modifications in production environments
// Only explicit "true" string enables the operation - all other values (undefined, "false", "1", etc.) = disabled
const POWERPLATFORM_CREATE_ENABLED = process.env.POWERPLATFORM_ENABLE_CREATE === "true";
const POWERPLATFORM_UPDATE_ENABLED = process.env.POWERPLATFORM_ENABLE_UPDATE === "true";
const POWERPLATFORM_DELETE_ENABLED = process.env.POWERPLATFORM_ENABLE_DELETE === "true";

// Log CRUD permission state on startup (helps prevent accidental production modifications)
console.error('PowerPlatform CRUD Permissions:', {
  create: POWERPLATFORM_CREATE_ENABLED,
  update: POWERPLATFORM_UPDATE_ENABLED,
  delete: POWERPLATFORM_DELETE_ENABLED,
  warning: (!POWERPLATFORM_CREATE_ENABLED && !POWERPLATFORM_UPDATE_ENABLED && !POWERPLATFORM_DELETE_ENABLED)
    ? 'All CRUD operations disabled (safe mode)'
    : '⚠️ CRUD operations enabled - ensure this is intended for this environment'
});
```

**Safety Verification:**
- `undefined === "true"` → `false` ✅ (variable not set)
- `"false" === "true"` → `false` ✅ (explicitly disabled)
- `"true" === "true"` → `true` ✅ (explicitly enabled)
- `"1" === "true"` → `false` ✅ (invalid value treated as disabled)
- `"True" === "true"` → `false` ✅ (case-sensitive, treated as disabled)
- `"yes" === "true"` → `false` ✅ (invalid value treated as disabled)

#### 2.2 Pass Flags to Service

**Current Service Initialization Pattern:**
```typescript
function getPowerPlatformService(): PowerPlatformService {
  if (!powerPlatformService) {
    // Validation...
    powerPlatformService = new PowerPlatformService(POWERPLATFORM_CONFIG);
  }
  return powerPlatformService;
}
```

**No changes needed** - Flags will be checked at tool level (following existing pattern for customization tools).

---

### 3. Service Layer Implementation

#### 3.1 New Service Methods ([src/PowerPlatformService.ts](src/PowerPlatformService.ts))

Add three new methods after `queryRecords()` (line 288):

```typescript
/**
 * Create a new record in Dataverse
 * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
 * @param data Record data as JSON object (field names must match logical names)
 * @returns Created record with ID and OData context
 */
async createRecord(entityNamePlural: string, data: Record<string, any>): Promise<any> {
  const timer = auditLogger.startTimer();

  try {
    // Validate data is not empty
    if (!data || Object.keys(data).length === 0) {
      throw new Error('Record data cannot be empty');
    }

    // Make POST request to create record
    const response = await this.makeRequest(
      `api/data/v9.2/${entityNamePlural}`,
      'POST',
      data,
      {
        'Prefer': 'return=representation', // Return the created record
      }
    );

    // Audit logging
    auditLogger.log({
      operation: 'create-record',
      operationType: 'CREATE',
      resourceId: entityNamePlural,
      componentType: 'Record',
      success: true,
      parameters: {
        entityNamePlural,
        fieldCount: Object.keys(data).length,
      },
      executionTimeMs: timer(),
    });

    return response;
  } catch (error: any) {
    // Audit failed operation
    auditLogger.log({
      operation: 'create-record',
      operationType: 'CREATE',
      resourceId: entityNamePlural,
      componentType: 'Record',
      success: false,
      error: error.message,
      parameters: { entityNamePlural },
      executionTimeMs: timer(),
    });
    throw error;
  }
}

/**
 * Update an existing record in Dataverse
 * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
 * @param recordId The GUID of the record to update
 * @param data Partial record data to update (only fields being changed)
 * @returns Updated record (if Prefer header used) or void
 */
async updateRecord(
  entityNamePlural: string,
  recordId: string,
  data: Record<string, any>
): Promise<any> {
  const timer = auditLogger.startTimer();

  try {
    // Validate data is not empty
    if (!data || Object.keys(data).length === 0) {
      throw new Error('Update data cannot be empty');
    }

    // Validate recordId is a valid GUID
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(recordId)) {
      throw new Error(`Invalid record ID format: ${recordId}. Must be a valid GUID.`);
    }

    // Make PATCH request to update record
    const response = await this.makeRequest(
      `api/data/v9.2/${entityNamePlural}(${recordId})`,
      'PATCH',
      data,
      {
        'Prefer': 'return=representation', // Return the updated record
      }
    );

    // Audit logging
    auditLogger.log({
      operation: 'update-record',
      operationType: 'UPDATE',
      resourceId: entityNamePlural,
      componentType: 'Record',
      componentName: recordId,
      success: true,
      parameters: {
        entityNamePlural,
        recordId,
        fieldCount: Object.keys(data).length,
      },
      executionTimeMs: timer(),
    });

    return response;
  } catch (error: any) {
    // Audit failed operation
    auditLogger.log({
      operation: 'update-record',
      operationType: 'UPDATE',
      resourceId: entityNamePlural,
      componentType: 'Record',
      componentName: recordId,
      success: false,
      error: error.message,
      parameters: { entityNamePlural, recordId },
      executionTimeMs: timer(),
    });
    throw error;
  }
}

/**
 * Delete a record from Dataverse
 * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
 * @param recordId The GUID of the record to delete
 * @returns Void (successful deletion returns 204 No Content)
 */
async deleteRecord(entityNamePlural: string, recordId: string): Promise<void> {
  const timer = auditLogger.startTimer();

  try {
    // Validate recordId is a valid GUID
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(recordId)) {
      throw new Error(`Invalid record ID format: ${recordId}. Must be a valid GUID.`);
    }

    // Make DELETE request
    await this.makeRequest(
      `api/data/v9.2/${entityNamePlural}(${recordId})`,
      'DELETE'
    );

    // Audit logging
    auditLogger.log({
      operation: 'delete-record',
      operationType: 'DELETE',
      resourceId: entityNamePlural,
      componentType: 'Record',
      componentName: recordId,
      success: true,
      parameters: { entityNamePlural, recordId },
      executionTimeMs: timer(),
    });
  } catch (error: any) {
    // Audit failed operation
    auditLogger.log({
      operation: 'delete-record',
      operationType: 'DELETE',
      resourceId: entityNamePlural,
      componentType: 'Record',
      componentName: recordId,
      success: false,
      error: error.message,
      parameters: { entityNamePlural, recordId },
      executionTimeMs: timer(),
    });
    throw error;
  }
}
```

**Key Design Decisions:**
- **PATCH vs PUT:** Use PATCH for updates (only send changed fields, not entire record)
- **Prefer Header:** Use `return=representation` to return created/updated record for immediate confirmation
- **GUID Validation:** Validate record IDs before making API calls
- **Audit Logging:** Comprehensive audit trail with operation type, success/failure, execution time
- **Error Handling:** Wrap operations with try/catch for detailed audit logs

---

### 4. Tool Registration ([src/index.ts](src/index.ts))

Add three new tools after `query-records` (around line 2760):

#### 4.1 Create Record Tool

```typescript
// PowerPlatform create record
server.tool(
  "create-record",
  "Create a new record in Dataverse. Requires POWERPLATFORM_ENABLE_CREATE=true.",
  {
    entityNamePlural: z
      .string()
      .describe("The plural name of the entity (e.g., 'accounts', 'contacts', 'sic_applications')"),
    data: z
      .record(z.any())
      .describe(
        "Record data as JSON object. Field names must match logical names (e.g., {'name': 'Acme Corp', 'telephone1': '555-1234'}). " +
        "For lookup fields, use '@odata.bind' syntax: {'parentaccountid@odata.bind': '/accounts(guid)'}. " +
        "For option sets, use integer values."
      ),
  },
  async ({ entityNamePlural, data }) => {
    try {
      // CRITICAL SECURITY CHECK: Verify create operations are explicitly enabled
      // This check happens BEFORE any service initialization or API calls
      // Default behavior (undefined/unset variable) = DISABLED
      if (!POWERPLATFORM_CREATE_ENABLED) {
        console.error('Blocked create-record attempt: POWERPLATFORM_ENABLE_CREATE not set to true');
        return {
          content: [
            {
              type: "text",
              text: "❌ Data creation is **DISABLED**.\n\n" +
                "**Current setting:** `POWERPLATFORM_ENABLE_CREATE` is not set to `true`\n\n" +
                "To enable record creation:\n" +
                "1. Set `POWERPLATFORM_ENABLE_CREATE=true` in your environment configuration\n" +
                "2. Restart the MCP server\n" +
                "3. Verify this is a **non-production** environment or has proper safeguards\n\n" +
                "⚠️  **WARNING:** This allows AI agents to create data in your Dataverse environment. " +
                "Only enable in development/sandbox environments.",
            },
          ],
        };
      }

      // Additional safety check: Verify the flag is exactly true (not just truthy)
      if (POWERPLATFORM_CREATE_ENABLED !== true) {
        console.error('Blocked create-record attempt: Invalid POWERPLATFORM_CREATE_ENABLED value');
        throw new Error('Invalid permission configuration - contact system administrator');
      }

      const service = getPowerPlatformService();
      const result = await service.createRecord(entityNamePlural, data);

      return {
        content: [
          {
            type: "text",
            text: `✅ Record created successfully in ${entityNamePlural}\n\n` +
              `**Record ID:** ${result.id || 'N/A'}\n\n` +
              `**Created Record:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to create record: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);
```

#### 4.2 Update Record Tool

```typescript
// PowerPlatform update record
server.tool(
  "update-record",
  "Update an existing record in Dataverse. Requires POWERPLATFORM_ENABLE_UPDATE=true.",
  {
    entityNamePlural: z
      .string()
      .describe("The plural name of the entity (e.g., 'accounts', 'contacts', 'sic_applications')"),
    recordId: z
      .string()
      .describe("The GUID of the record to update"),
    data: z
      .record(z.any())
      .describe(
        "Partial record data to update (only fields being changed). " +
        "Field names must match logical names. " +
        "Use '@odata.bind' syntax for lookups, integer values for option sets."
      ),
  },
  async ({ entityNamePlural, recordId, data }) => {
    try {
      // CRITICAL SECURITY CHECK: Verify update operations are explicitly enabled
      if (!POWERPLATFORM_UPDATE_ENABLED) {
        console.error('Blocked update-record attempt: POWERPLATFORM_ENABLE_UPDATE not set to true');
        return {
          content: [
            {
              type: "text",
              text: "❌ Data updates are **DISABLED**.\n\n" +
                "**Current setting:** `POWERPLATFORM_ENABLE_UPDATE` is not set to `true`\n\n" +
                "To enable record updates:\n" +
                "1. Set `POWERPLATFORM_ENABLE_UPDATE=true` in your environment configuration\n" +
                "2. Restart the MCP server\n" +
                "3. Verify this is a **non-production** environment or has proper safeguards\n\n" +
                "⚠️  **WARNING:** This allows AI agents to modify data in your Dataverse environment. " +
                "Only enable in development/sandbox environments.",
            },
          ],
        };
      }

      // Additional safety check: Verify the flag is exactly true
      if (POWERPLATFORM_UPDATE_ENABLED !== true) {
        console.error('Blocked update-record attempt: Invalid POWERPLATFORM_UPDATE_ENABLED value');
        throw new Error('Invalid permission configuration - contact system administrator');
      }

      const service = getPowerPlatformService();
      const result = await service.updateRecord(entityNamePlural, recordId, data);

      return {
        content: [
          {
            type: "text",
            text: `✅ Record updated successfully in ${entityNamePlural}\n\n` +
              `**Record ID:** ${recordId}\n\n` +
              `**Updated Record:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to update record: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);
```

#### 4.3 Delete Record Tool

```typescript
// PowerPlatform delete record
server.tool(
  "delete-record",
  "Delete a record from Dataverse. Requires POWERPLATFORM_ENABLE_DELETE=true. WARNING: This operation is permanent and cannot be undone.",
  {
    entityNamePlural: z
      .string()
      .describe("The plural name of the entity (e.g., 'accounts', 'contacts', 'sic_applications')"),
    recordId: z
      .string()
      .describe("The GUID of the record to delete"),
    confirm: z
      .boolean()
      .optional()
      .describe("Confirmation flag - must be true to proceed with deletion (safety check)"),
  },
  async ({ entityNamePlural, recordId, confirm }) => {
    try {
      // CRITICAL SECURITY CHECK: Verify delete operations are explicitly enabled
      if (!POWERPLATFORM_DELETE_ENABLED) {
        console.error('Blocked delete-record attempt: POWERPLATFORM_ENABLE_DELETE not set to true');
        return {
          content: [
            {
              type: "text",
              text: "❌ Data deletion is **DISABLED**.\n\n" +
                "**Current setting:** `POWERPLATFORM_ENABLE_DELETE` is not set to `true`\n\n" +
                "To enable record deletion:\n" +
                "1. Set `POWERPLATFORM_ENABLE_DELETE=true` in your environment configuration\n" +
                "2. Restart the MCP server\n" +
                "3. Verify this is a **non-production** environment or has proper safeguards\n\n" +
                "⚠️  **DANGER:** This allows AI agents to **permanently delete** data from your Dataverse environment. " +
                "Only enable in development/sandbox environments with proper backups.",
            },
          ],
        };
      }

      // Additional safety check: Verify the flag is exactly true
      if (POWERPLATFORM_DELETE_ENABLED !== true) {
        console.error('Blocked delete-record attempt: Invalid POWERPLATFORM_DELETE_ENABLED value');
        throw new Error('Invalid permission configuration - contact system administrator');
      }

      // Require explicit confirmation for deletion
      if (confirm !== true) {
        return {
          content: [
            {
              type: "text",
              text: `⚠️  Delete operation requires explicit confirmation.\n\n` +
                `You are about to delete record **${recordId}** from **${entityNamePlural}**.\n\n` +
                `This operation is **permanent** and **cannot be undone**.\n\n` +
                `To proceed, call this tool again with \`confirm: true\`.`,
            },
          ],
        };
      }

      const service = getPowerPlatformService();
      await service.deleteRecord(entityNamePlural, recordId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Record deleted successfully\n\n` +
              `**Entity:** ${entityNamePlural}\n` +
              `**Record ID:** ${recordId}\n\n` +
              `⚠️  This operation is permanent.`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to delete record: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);
```

**Key Design Decisions:**
- **Permission Checks First:** Check environment flags before service initialization
- **Clear Error Messages:** Inform users how to enable features with warnings
- **Delete Confirmation:** Require `confirm: true` parameter for delete operations (double safety)
- **Formatted Output:** Use markdown formatting for readability
- **JSON Pretty-Print:** Show created/updated records for immediate verification

---

### 5. Documentation Updates

#### 5.1 README.md Updates

**Location:** [README.md:67](README.md#L67)

**Current:**
```markdown
POWERPLATFORM_ENABLE_CUSTOMIZATION
```

**Proposed Addition:**
```markdown
# PowerPlatform/Dataverse Configuration

## Required Settings
- `POWERPLATFORM_URL` - Your environment URL
- `POWERPLATFORM_CLIENT_ID` - Azure AD app client ID
- `POWERPLATFORM_CLIENT_SECRET` - Azure AD app client secret
- `POWERPLATFORM_TENANT_ID` - Azure tenant ID

## Optional Feature Flags

### Metadata Operations (Schema Changes)
- `POWERPLATFORM_ENABLE_CUSTOMIZATION=true` - Enable entity/attribute/form/view creation and modification
- `POWERPLATFORM_DEFAULT_SOLUTION` - Default solution for customizations

### Data Operations (Record CRUD)
⚠️ **WARNING:** These flags allow AI agents to modify data in your Dataverse environment.

- `POWERPLATFORM_ENABLE_CREATE=false` - Enable record creation (default: false)
- `POWERPLATFORM_ENABLE_UPDATE=false` - Enable record updates (default: false)
- `POWERPLATFORM_ENABLE_DELETE=false` - Enable record deletion (default: false)

**Best Practices:**
- Only enable in development/sandbox environments
- Use role-based security to limit which entities can be modified
- Monitor audit logs for all data modifications
- Consider using a separate Azure AD app with limited permissions for data operations
```

**Tool Count Update:**
```markdown
## Available Tools

### PowerPlatform/Dataverse (164 total)
- **Metadata Tools (7):** Entity exploration, attributes, relationships, option sets
- **Record Tools (5):** Query records, get record, create, update, delete  ← UPDATE THIS
- **Plugin Tools (4):** Assembly inspection, pipeline analysis, trace logs
- **Workflow Tools (5):** Flows, workflows, business rules
- **Customization Tools (40+):** Entity/attribute/form/view/solution management (requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true)
- **Data CRUD Tools (3):** Create, update, delete records (requires respective feature flags)  ← ADD THIS
```

#### 5.2 CLAUDE.md Updates

**Location:** [CLAUDE.md](CLAUDE.md) - Architecture section

**Add new section after "MCP Tools vs Prompts":**

```markdown
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
```

#### 5.3 .env.example Updates

**Location:** [.env.example:15-18](.env.example#L15-L18)

**Current:**
```bash
# Enable customization tools (create entities, attributes, etc.)
# WARNING: These make permanent changes to your CRM. Use with caution.
POWERPLATFORM_ENABLE_CUSTOMIZATION=true

# Default solution to add customizations to (optional)
POWERPLATFORM_DEFAULT_SOLUTION=YourSolutionName
```

**Proposed:**
```bash
# =============================================================================
# PowerPlatform Feature Flags
# =============================================================================

# Enable metadata customization tools (create entities, attributes, forms, views, etc.)
# WARNING: These make permanent schema changes to your Dataverse environment.
POWERPLATFORM_ENABLE_CUSTOMIZATION=true

# Default solution to add customizations to (optional)
POWERPLATFORM_DEFAULT_SOLUTION=YourSolutionName

# Enable data CRUD operations (create, update, delete records)
# WARNING: These allow AI agents to modify data in your Dataverse environment.
# Only enable in development/sandbox environments or with proper safeguards.
# Default: false for all

# Enable record creation (POST operations)
POWERPLATFORM_ENABLE_CREATE=false

# Enable record updates (PATCH operations)
POWERPLATFORM_ENABLE_UPDATE=false

# Enable record deletion (DELETE operations - permanent and irreversible)
POWERPLATFORM_ENABLE_DELETE=false
```

---

### 6. Testing Strategy

#### 6.1 Unit Tests (Future Enhancement)

**Location:** Create `src/__tests__/PowerPlatformService.crud.test.ts`

Test coverage:
- ✅ Create record with valid data
- ✅ Create record with empty data (should fail)
- ✅ Create record with lookup syntax
- ✅ Update record with valid GUID
- ✅ Update record with invalid GUID (should fail)
- ✅ Update record with empty data (should fail)
- ✅ Delete record with valid GUID
- ✅ Delete record with invalid GUID (should fail)
- ✅ Permission checks (all operations disabled by default)

#### 6.2 Manual Testing Plan

**Prerequisites:**
1. Development Dataverse environment
2. Azure AD app with appropriate permissions
3. Test entity with simple schema (e.g., custom entity `sic_testrecord`)

**Test Cases:**

**TC1: Create Record (Permission Disabled)**
```bash
# Environment: POWERPLATFORM_ENABLE_CREATE=false
# Expected: Error message about disabled feature
Tool: create-record
Parameters: {
  entityNamePlural: 'accounts',
  data: { name: 'Test Account' }
}
Expected Result: ❌ "Data creation is disabled" message
```

**TC2: Create Record (Permission Enabled)**
```bash
# Environment: POWERPLATFORM_ENABLE_CREATE=true
Tool: create-record
Parameters: {
  entityNamePlural: 'accounts',
  data: {
    name: 'Test Account',
    telephone1: '555-1234',
    websiteurl: 'https://test.com'
  }
}
Expected Result: ✅ Record created with GUID returned
Verification: Query record to confirm creation
```

**TC3: Update Record (Permission Disabled)**
```bash
# Environment: POWERPLATFORM_ENABLE_UPDATE=false
Tool: update-record
Parameters: {
  entityNamePlural: 'accounts',
  recordId: '<guid>',
  data: { telephone1: '555-5678' }
}
Expected Result: ❌ "Data updates are disabled" message
```

**TC4: Update Record (Permission Enabled)**
```bash
# Environment: POWERPLATFORM_ENABLE_UPDATE=true
Tool: update-record
Parameters: {
  entityNamePlural: 'accounts',
  recordId: '<valid-guid>',
  data: { telephone1: '555-9999' }
}
Expected Result: ✅ Record updated
Verification: Query record to confirm update
```

**TC5: Delete Record (No Confirmation)**
```bash
# Environment: POWERPLATFORM_ENABLE_DELETE=true
Tool: delete-record
Parameters: {
  entityNamePlural: 'accounts',
  recordId: '<guid>',
  confirm: false
}
Expected Result: ⚠️ Confirmation required message
```

**TC6: Delete Record (With Confirmation)**
```bash
# Environment: POWERPLATFORM_ENABLE_DELETE=true
Tool: delete-record
Parameters: {
  entityNamePlural: 'accounts',
  recordId: '<valid-guid>',
  confirm: true
}
Expected Result: ✅ Record deleted
Verification: Query record (should return 404)
```

**TC7: Invalid GUID Handling**
```bash
Tool: update-record
Parameters: {
  entityNamePlural: 'accounts',
  recordId: 'not-a-guid',
  data: { name: 'Updated' }
}
Expected Result: ❌ "Invalid record ID format" error
```

**TC8: Lookup Field Creation**
```bash
Tool: create-record
Parameters: {
  entityNamePlural: 'contacts',
  data: {
    firstname: 'John',
    lastname: 'Doe',
    'parentcustomerid@odata.bind': '/accounts(<parent-account-guid>)'
  }
}
Expected Result: ✅ Contact created with parent account linked
```

---

### 7. Security & Compliance

#### 7.1 Audit Logging

All CRUD operations are logged via the existing audit logger:

```typescript
auditLogger.log({
  operation: 'create-record',
  operationType: 'CREATE',  // CREATE, UPDATE, DELETE
  resourceId: entityNamePlural,
  componentType: 'Record',
  componentName: recordId,  // For update/delete
  success: true,
  parameters: {
    entityNamePlural,
    recordId,
    fieldCount: Object.keys(data).length,
  },
  executionTimeMs: timer(),
});
```

**Audit Trail Includes:**
- Operation type (CREATE/UPDATE/DELETE)
- Entity name
- Record ID (for update/delete)
- Field count (for create/update)
- Success/failure status
- Error messages
- Execution time
- Timestamp

#### 7.2 Permission Model

**Recommended Azure AD App Permissions:**

For **read-only operations:**
- `user_impersonation` (delegated)
- OR `Dynamics CRM.Read` (application)

For **data CRUD operations:**
- `user_impersonation` (delegated) with appropriate Dataverse security roles
- OR `Dynamics CRM.ReadWrite` (application) - **use with extreme caution**

**Best Practice:** Use separate Azure AD apps:
- One for read-only operations (metadata, queries)
- One for customization (if needed)
- One for data CRUD (if needed, with minimal permissions)

#### 7.3 Rate Limiting

Leverage existing rate limiter ([src/utils/rate-limiter.ts](src/utils/rate-limiter.ts)):

```typescript
// In service methods (optional enhancement)
await rateLimiter.checkLimit('powerplatform-write', 10); // 10 requests per minute
```

**Recommended Limits:**
- Read operations: 60/minute
- Write operations (create/update): 10/minute
- Delete operations: 5/minute

---

### 8. Backward Compatibility Analysis

#### 8.1 No Breaking Changes

✅ **Existing Tools Unchanged:**
- `get-record` - No changes
- `query-records` - No changes
- All customization tools - No changes

✅ **Configuration Backward Compatible:**
- New environment variables are optional
- Default to `false` (safe)
- Existing configurations work without modification

✅ **Service Layer:**
- New methods added (non-breaking)
- Existing methods unchanged

#### 8.2 Migration Path

**For existing users:**
1. No action required - CRUD disabled by default
2. Opt-in by setting environment variables
3. No changes to existing tools or prompts

**For new users:**
1. Follow updated documentation
2. Enable features as needed
3. Start with read-only, progressively enable write operations

---

### 9. Implementation Checklist

#### Phase 1: Core Implementation
- [ ] Add environment variable parsing in `src/index.ts` (lines 80-82)
- [ ] Add `createRecord()` method in `PowerPlatformService.ts` (after line 288)
- [ ] Add `updateRecord()` method in `PowerPlatformService.ts`
- [ ] Add `deleteRecord()` method in `PowerPlatformService.ts`
- [ ] Add `create-record` tool in `src/index.ts` (after line 2760)
- [ ] Add `update-record` tool in `src/index.ts`
- [ ] Add `delete-record` tool in `src/index.ts`

#### Phase 2: Documentation
- [ ] Update `.env.example` with new variables and warnings
- [ ] Update `README.md` - Tool count and feature flags section
- [ ] Update `CLAUDE.md` - Add "Data CRUD Operations" section
- [ ] Create detailed examples in documentation

#### Phase 3: Testing
- [ ] Manual testing: Create record (permission disabled)
- [ ] Manual testing: Create record (permission enabled)
- [ ] Manual testing: Update record (permission disabled)
- [ ] Manual testing: Update record (permission enabled)
- [ ] Manual testing: Delete record (no confirmation)
- [ ] Manual testing: Delete record (with confirmation)
- [ ] Manual testing: Invalid GUID handling
- [ ] Manual testing: Lookup field creation
- [ ] Manual testing: Audit log verification
- [ ] End-to-end testing: Real-world scenario (create -> update -> delete)

#### Phase 4: Release
- [ ] Build project: `npm run build`
- [ ] Version bump: `npm version minor` (new features)
- [ ] Update `package.json` description if needed
- [ ] Commit changes with detailed commit message
- [ ] Create PR with comprehensive description
- [ ] Merge to main after review
- [ ] Publish to npm: `npm publish`
- [ ] Create GitHub release with release notes

---

### 10. Risk Analysis

#### 10.1 Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Accidental data deletion** | HIGH | • Default to `false`<br>• Require `confirm: true` for deletes<br>• Clear warning messages<br>• Audit logging |
| **Unauthorized data modification** | HIGH | • Environment flags per operation<br>• Azure AD RBAC<br>• Audit trail |
| **API rate limiting** | MEDIUM | • Use existing rate limiter<br>• Implement retry logic<br>• Document limits |
| **Invalid data causing errors** | MEDIUM | • Input validation<br>• GUID format checks<br>• Empty data checks<br>• Clear error messages |
| **Performance impact on large datasets** | LOW | • Use PATCH (not PUT) for updates<br>• No bulk operations (intentional)<br>• Leverage Dataverse API efficiency |
| **Breaking existing functionality** | LOW | • No changes to existing tools<br>• Comprehensive testing<br>• Backward compatible configuration |

#### 10.2 Security Considerations

**Input Validation:**
- ✅ GUID format validation
- ✅ Empty data checks
- ✅ Entity name validation (via API)
- ⚠️  **Future Enhancement:** Schema validation against entity metadata

**Output Sanitization:**
- ✅ Error messages sanitized (no sensitive data)
- ✅ Audit logs exclude sensitive field values
- ⚠️  **Future Enhancement:** Configurable field redaction for PII

**Access Control:**
- ✅ Environment-based feature flags
- ✅ Azure AD authentication
- ⚠️  **User Responsibility:** Configure proper Dataverse security roles

---

### 11. Future Enhancements

#### 11.1 Batch Operations (v2)
```typescript
async batchCreateRecords(entityNamePlural: string, records: Array<Record<string, any>>): Promise<any[]>
async batchUpdateRecords(entityNamePlural: string, updates: Array<{id: string, data: any}>): Promise<any[]>
async batchDeleteRecords(entityNamePlural: string, recordIds: string[]): Promise<void>
```

**Benefits:**
- More efficient for bulk operations
- Single API call for multiple records
- Reduced network overhead

**Risks:**
- Higher impact if errors occur
- More complex rollback scenarios

#### 11.2 Schema Validation (v2)
```typescript
async validateDataAgainstSchema(entityNamePlural: string, data: Record<string, any>): Promise<ValidationResult>
```

**Benefits:**
- Catch errors before API calls
- Better error messages
- Prevent invalid data submissions

**Implementation:**
- Fetch entity metadata
- Validate field names
- Validate data types
- Check required fields

#### 11.3 Associate/Disassociate Tools (v2)
```typescript
async associateRecords(entityNamePlural: string, recordId: string, relationshipName: string, relatedRecordIds: string[]): Promise<void>
async disassociateRecords(entityNamePlural: string, recordId: string, relationshipName: string, relatedRecordIds: string[]): Promise<void>
```

**Use Cases:**
- Manage many-to-many relationships
- Link contacts to accounts
- Add members to teams

#### 11.4 Upsert Operations (v2)
```typescript
async upsertRecord(entityNamePlural: string, alternateKey: Record<string, any>, data: Record<string, any>): Promise<any>
```

**Benefits:**
- Create or update based on alternate key
- Idempotent operations
- Simplify integration scenarios

---

### 12. Documentation Examples

#### 12.1 Create Record Examples

**Simple Account Creation:**
```json
{
  "tool": "create-record",
  "parameters": {
    "entityNamePlural": "accounts",
    "data": {
      "name": "Contoso Corporation",
      "telephone1": "425-555-0100",
      "websiteurl": "https://contoso.com",
      "address1_city": "Redmond",
      "address1_stateorprovince": "WA",
      "address1_country": "USA"
    }
  }
}
```

**Contact with Lookup to Account:**
```json
{
  "tool": "create-record",
  "parameters": {
    "entityNamePlural": "contacts",
    "data": {
      "firstname": "Jane",
      "lastname": "Doe",
      "emailaddress1": "jane.doe@contoso.com",
      "parentcustomerid@odata.bind": "/accounts(12345678-1234-1234-1234-123456789012)"
    }
  }
}
```

**Custom Entity with Option Set:**
```json
{
  "tool": "create-record",
  "parameters": {
    "entityNamePlural": "sic_applications",
    "data": {
      "sic_name": "Summer 2025 Application",
      "sic_status": 157430000,
      "sic_applicationdate": "2025-01-15",
      "sic_estimatedbudget": 50000.00
    }
  }
}
```

#### 12.2 Update Record Examples

**Update Single Field:**
```json
{
  "tool": "update-record",
  "parameters": {
    "entityNamePlural": "accounts",
    "recordId": "12345678-1234-1234-1234-123456789012",
    "data": {
      "telephone1": "425-555-0101"
    }
  }
}
```

**Update Multiple Fields:**
```json
{
  "tool": "update-record",
  "parameters": {
    "entityNamePlural": "contacts",
    "recordId": "87654321-4321-4321-4321-210987654321",
    "data": {
      "emailaddress1": "jane.doe.new@contoso.com",
      "mobilephone": "206-555-0100",
      "jobtitle": "Senior Manager"
    }
  }
}
```

**Change Status (Option Set):**
```json
{
  "tool": "update-record",
  "parameters": {
    "entityNamePlural": "sic_applications",
    "recordId": "abcdef12-3456-7890-abcd-ef1234567890",
    "data": {
      "statecode": 1,
      "statuscode": 2
    }
  }
}
```

#### 12.3 Delete Record Examples

**Delete Account (with confirmation):**
```json
{
  "tool": "delete-record",
  "parameters": {
    "entityNamePlural": "accounts",
    "recordId": "12345678-1234-1234-1234-123456789012",
    "confirm": true
  }
}
```

---

### 13. Success Criteria

#### 13.1 Functional Requirements
- ✅ Create records with simple data types (text, number, date)
- ✅ Create records with lookup fields (@odata.bind syntax)
- ✅ Create records with option set values
- ✅ Update records (partial updates, not full replacement)
- ✅ Delete records with explicit confirmation
- ✅ All operations disabled by default
- ✅ Granular permission control per operation type
- ✅ Clear error messages for missing permissions
- ✅ Comprehensive audit logging

#### 13.2 Non-Functional Requirements
- ✅ Backward compatible with existing tools
- ✅ No breaking changes to existing configurations
- ✅ Documentation complete and accurate
- ✅ Examples provided for common scenarios
- ✅ Security warnings clearly communicated
- ✅ Performance acceptable (< 5 seconds per operation)

#### 13.3 Quality Gates
- ✅ All manual test cases pass
- ✅ Audit logs verified for all operations
- ✅ Error handling verified (invalid GUIDs, empty data, etc.)
- ✅ Permission checks verified (all defaults to false)
- ✅ Code review completed
- ✅ Documentation reviewed for accuracy
- ✅ No console.log statements (MCP protocol requirement)

---

## Appendix

### A. Security-First Configuration Validation

**Startup Validation Logic:**

When the MCP server starts, it logs the current CRUD permission state to help prevent accidental production modifications:

```typescript
// Logged to stderr (safe for MCP protocol)
console.error('PowerPlatform CRUD Permissions:', {
  create: POWERPLATFORM_CREATE_ENABLED,
  update: POWERPLATFORM_UPDATE_ENABLED,
  delete: POWERPLATFORM_DELETE_ENABLED,
  warning: (!POWERPLATFORM_CREATE_ENABLED && !POWERPLATFORM_UPDATE_ENABLED && !POWERPLATFORM_DELETE_ENABLED)
    ? 'All CRUD operations disabled (safe mode)'
    : '⚠️ CRUD operations enabled - ensure this is intended for this environment'
});
```

**Example Output (Safe Mode):**
```
PowerPlatform CRUD Permissions: {
  create: false,
  update: false,
  delete: false,
  warning: 'All CRUD operations disabled (safe mode)'
}
```

**Example Output (Production Warning):**
```
PowerPlatform CRUD Permissions: {
  create: true,
  update: true,
  delete: false,
  warning: '⚠️ CRUD operations enabled - ensure this is intended for this environment'
}
```

**Runtime Validation:**

Every tool call includes **TWO** security checks:

1. **First Check:** Verify flag is set (not undefined/false)
```typescript
if (!POWERPLATFORM_CREATE_ENABLED) {
  // Return error message, do not proceed
}
```

2. **Second Check:** Verify flag is exactly `true` (not just truthy)
```typescript
if (POWERPLATFORM_CREATE_ENABLED !== true) {
  // This catches corrupted configuration or programming errors
  throw new Error('Invalid permission configuration');
}
```

This **defense-in-depth** approach ensures that even if the code is modified incorrectly, data modifications cannot occur without explicit `=== true` permission.

### B. OData v4 Syntax Reference

**Create Record (POST):**
```http
POST https://org.crm.dynamics.com/api/data/v9.2/accounts
Content-Type: application/json
Prefer: return=representation

{
  "name": "Sample Account",
  "telephone1": "555-1234"
}
```

**Update Record (PATCH):**
```http
PATCH https://org.crm.dynamics.com/api/data/v9.2/accounts(guid)
Content-Type: application/json
Prefer: return=representation

{
  "telephone1": "555-5678"
}
```

**Delete Record (DELETE):**
```http
DELETE https://org.crm.dynamics.com/api/data/v9.2/accounts(guid)
```

**Lookup Field Binding:**
```json
{
  "parentcustomerid@odata.bind": "/accounts(guid)"
}
```

### C. Common Field Types

| Field Type | Dataverse Type | Example Value | Notes |
|------------|----------------|---------------|-------|
| Text | String | `"Sample text"` | Max length varies |
| Whole Number | Integer | `42` | 32-bit integer |
| Decimal | Decimal | `1234.56` | Precision varies |
| Money | Money | `1000000.00` | Currency symbol not included |
| Date Only | DateOnly | `"2025-01-15"` | ISO 8601 date format |
| Date Time | DateTime | `"2025-01-15T10:30:00Z"` | ISO 8601 with timezone |
| Lookup | EntityReference | `{"@odata.bind": "/entity(guid)"}` | Use @odata.bind syntax |
| Option Set | OptionSet | `157430000` | Integer value |
| Multi-Select | MultiSelectOptionSet | `"157430000,157430001"` | Comma-separated string |
| Boolean | Boolean | `true` or `false` | Lowercase |
| GUID | UniqueIdentifier | `"12345678-1234-..."` | Hyphenated GUID string |

### D. Common Error Codes

| Error Code | Description | Solution |
|------------|-------------|----------|
| 401 | Unauthorized | Check Azure AD credentials |
| 403 | Forbidden | Check Dataverse security roles |
| 404 | Record not found | Verify GUID is correct |
| 400 | Bad request | Check data format and field names |
| 412 | Precondition failed | Check If-Match headers (concurrency) |
| 429 | Too many requests | Implement rate limiting |
| 500 | Internal server error | Check Dataverse service health |

### E. Useful Resources

- **Dataverse Web API Reference:** https://docs.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference
- **OData v4 Specification:** https://www.odata.org/documentation/
- **Azure AD App Permissions:** https://docs.microsoft.com/en-us/power-apps/developer/data-platform/authenticate-oauth
- **Security Roles:** https://docs.microsoft.com/en-us/power-platform/admin/security-roles-privileges

---

## Conclusion

This implementation plan provides a comprehensive, secure, and backward-compatible approach to adding CRUD operations to the PowerPlatform integration. By following the granular permission pattern established in other services, providing clear documentation, and implementing robust safety measures, we can enable powerful data modification capabilities while maintaining security and control.

**Key Principles:**
1. **Safety First:** All operations disabled by default
2. **Granular Control:** Separate flags for create, update, delete
3. **Backward Compatible:** No breaking changes to existing functionality
4. **Well Documented:** Clear examples and warnings
5. **Fully Audited:** Comprehensive logging for compliance
6. **User Control:** Users choose exactly which operations to enable

**Estimated Implementation Time:** 4-6 hours
- Core implementation: 2-3 hours
- Documentation: 1-2 hours
- Testing: 1-2 hours

**Next Steps:**
1. Review and approve this plan
2. Begin Phase 1: Core Implementation
3. Complete Phase 2: Documentation
4. Execute Phase 3: Testing
5. Proceed to Phase 4: Release
