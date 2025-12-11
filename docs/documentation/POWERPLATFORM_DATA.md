# Microsoft PowerPlatform / Dynamics 365 Data CRUD Integration

**📦 Package:** `@mcp-consultant-tools/powerplatform-data`
**⚠️ Security:** NOT production-safe (data modifications, record creation/updates/deletions)

Complete guide to using the PowerPlatform Data CRUD integration with MCP Consultant Tools.

---

## 🚨 IMPORTANT: Security Warning

This package enables **data modification operations** that can permanently change or delete records in your Dataverse environment. It should be used with **EXTREME CAUTION** and proper:
- Access controls
- Approval workflows
- Audit logging
- Backup procedures

**Recommended Use Cases:**
- Operational data management with human oversight
- Automated data workflows with approval gates
- Development and testing environments

**DO NOT use this package with unrestricted AI agents in production environments.**

---

## 🔒 Package Split Information

As of **v16.0.0**, the PowerPlatform integration is split into **3 security-isolated packages**:

| Package | Purpose | Tools | Prompts | Production-Safe? |
|---------|---------|-------|---------|------------------|
| **[@mcp-consultant-tools/powerplatform](POWERPLATFORM.md)** | Read-only access | 38 | 10 | ✅ **YES** |
| **[@mcp-consultant-tools/powerplatform-customization](POWERPLATFORM_CUSTOMIZATION.md)** | Schema changes | 40 | 2 | ⚠️ **NO** - Dev/config only |
| **[@mcp-consultant-tools/powerplatform-data](POWERPLATFORM_DATA.md)** (This Package) | Data Query + CRUD + Actions | 6 | 0 | ⚠️ **NO** - Operational use |

**This documentation covers the data CRUD package only.** For read-only access or schema customization, see the respective package documentation.

---

## ⚡ Quick Start

### MCP Client Configuration

Get started quickly with this minimal configuration. Just replace the placeholder values with your actual credentials:

#### For VS Code

Add this to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "powerplatform-data": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-data", "mcp-pp-data"],
      "env": {
        // Required - PowerPlatform Authentication
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",

        // Optional - Data CRUD Operations (all default to "false")
        // ⚠️ WARNING: These enable data modifications - use with caution
        "POWERPLATFORM_ENABLE_CREATE": "true",  // Optional - enables create-record tool
        "POWERPLATFORM_ENABLE_UPDATE": "true",  // Optional - enables update-record tool
        "POWERPLATFORM_ENABLE_DELETE": "true"   // Optional - enables delete-record tool
      }
    }
  }
}
```

#### For Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "powerplatform-data": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-data", "mcp-pp-data"],
      "env": {
        // Required - PowerPlatform Authentication
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",

        // Optional - Data CRUD Operations (all default to "false")
        // ⚠️ WARNING: These enable data modifications - use with caution
        "POWERPLATFORM_ENABLE_CREATE": "true",  // Optional - enables create-record tool
        "POWERPLATFORM_ENABLE_UPDATE": "true",  // Optional - enables update-record tool
        "POWERPLATFORM_ENABLE_DELETE": "true"   // Optional - enables delete-record tool
      }
    }
  }
}
```

#### Test Your Setup

After configuring, test the connection by creating a test record in a development environment:

```javascript
// Ask Claude: "Create a test account record with name 'Test Company'"
// Or use the create-record tool directly:
await mcpClient.invoke("create-record", {
  entityNamePlural: "accounts",
  data: {
    name: "Test Company"
  }
});
```

**⚠️ Production Warning:** For production environments, **do NOT install this package**. Use the base read-only package (`@mcp-consultant-tools/powerplatform`) instead. If data operations are required in production, implement proper approval workflows and access controls. See [Security Model](#security-model) for recommendations.

**Need credentials?** See the [Detailed Setup](#detailed-setup) section below for Azure AD service principal creation instructions.

---

## 🎯 Key Features for Consultants

### Data Query & CRUD Operations (Tools)

This package provides **6 specialized tools** for data querying, modification, and action execution. Unlike the read-only package, this package has **0 prompts** to emphasize that all operations are explicit and require intentional tool invocations.

#### Read-Only Query Tools (No Permission Flags Required)

These tools allow you to query data before and after CRUD operations without needing a second MCP server:

1. **`query-records`** - Query records using OData filter expressions
   - Example: `"Find all accounts where name contains 'Acme'"`
   - No permission flag required (read-only)
   - Use before operations to check what exists
   - Use after operations to validate changes

2. **`get-record`** - Get a specific record by entity name and ID
   - Example: `"Get the account with ID 12345678-..."`
   - No permission flag required (read-only)
   - Use to verify a record before updating/deleting
   - Use after create/update to validate the result

#### Production Data Tools

**⚠️ WARNING: These tools modify production data. Use with extreme caution.**

1. **`create-record`** - Create new records in Dataverse entities
   - Example: `"Create a new account for Acme Corporation with phone 555-1234"`
   - Requires: `POWERPLATFORM_ENABLE_CREATE=true`
   - Audit logged: ✅ All operations logged with user context

2. **`update-record`** - Update existing records (partial or full updates)
   - Example: `"Update account record to change the phone number to 555-5678"`
   - Requires: `POWERPLATFORM_ENABLE_UPDATE=true`
   - Audit logged: ✅ All operations logged with field changes

3. **`delete-record`** - Permanently delete records (CANNOT BE UNDONE)
   - Example: `"Delete the test account record"`
   - Requires: `POWERPLATFORM_ENABLE_DELETE=true` AND `confirm: true` parameter
   - Audit logged: ✅ All deletions logged with confirmation
   - Safety: Two-layer protection (flag + confirmation)

4. **`execute-action`** - Execute Custom APIs and Actions (unbound or bound)
   - Example: `"Execute the WhoAmI action to get current user info"`
   - Requires: `POWERPLATFORM_ENABLE_ACTIONS=true`
   - Audit logged: ✅ All action executions logged
   - Supports: Unbound actions (global) and bound actions (entity-specific)

### Security Features

**Granular Operation Control:**
- Each operation (create/update/delete/execute) requires separate environment flag
- Delete operations require explicit `confirm: true` parameter
- All operations logged for audit compliance
- Field-level validation before API calls
- GUID validation for record IDs

**Safety Mechanisms:**
- ❗ No bulk delete tool (must iterate with individual confirmations)
- ❗ Validation before API calls (field types, required fields, GUIDs)
- ❗ Error handling with clear messages
- ❗ Confirmation requirements for destructive operations

---

## Table of Contents

1. [Overview](#overview)
   - [What is This Package?](#what-is-this-package)
   - [Use Cases](#use-cases)
   - [Key Features](#key-features)
   - [Security Model](#security-model)

2. [Detailed Setup](#detailed-setup)
   - [Prerequisites](#prerequisites)
   - [Installation](#installation)
   - [Environment Variables](#environment-variables)
   - [Required Permissions](#required-permissions)

3. [Tools (6 Total)](#tools-6-total)
   - [query-records](#query-records) (Read-only)
   - [get-record](#get-record) (Read-only)
   - [create-record](#create-record)
   - [update-record](#update-record)
   - [delete-record](#delete-record)
   - [execute-action](#execute-action)

4. [Data Format Reference](#data-format-reference)
   - [Field Types](#field-types)
   - [Lookup Fields](#lookup-fields)
   - [Option Sets](#option-sets)
   - [Date and Time](#date-and-time)
   - [Money and Decimal](#money-and-decimal)

5. [Usage Examples](#usage-examples)
   - [Create Records](#create-records)
   - [Update Records](#update-records)
   - [Delete Records](#delete-records)
   - [Execute Actions](#execute-actions)
   - [Bulk Operations](#bulk-operations)

6. [Best Practices](#best-practices)
   - [Data Validation](#data-validation)
   - [Error Handling](#error-handling)
   - [Audit Logging](#audit-logging)
   - [Operational Use](#operational-use)

7. [Troubleshooting](#troubleshooting)
   - [Common Errors](#common-errors)
   - [Permission Issues](#permission-issues)
   - [Data Validation Errors](#data-validation-errors)

---

## Overview

### What is This Package?

The `powerplatform-data` package provides programmatic access to **Dataverse data operations** as a self-contained CRUD package. It enables:

- **Querying records** using OData filters (read-only, no permission flags required)
- **Getting specific records** by ID (read-only, no permission flags required)
- **Creating new records** in Dataverse entities (requires flag)
- **Updating existing records** - partial or full updates (requires flag)
- **Deleting records** - permanent deletion (requires flag)
- **Executing Custom APIs and Actions** - unbound or bound (requires flag)

**Self-Contained CRUD Workflow:** Unlike previous versions, this package includes query tools so you can check what exists before operations and validate changes after - without needing a second MCP server.

Data modification operations **require explicit enablement** via individual environment flags (`POWERPLATFORM_ENABLE_CREATE`, `POWERPLATFORM_ENABLE_UPDATE`, `POWERPLATFORM_ENABLE_DELETE`, `POWERPLATFORM_ENABLE_ACTIONS`) to prevent accidental data modifications.

### Use Cases

**Approved Use Cases:**
1. **Data Migration**: Automated data migration from legacy systems with human oversight
2. **Bulk Data Operations**: Mass updates with approval workflows (e.g., territory reassignments)
3. **Integration Workflows**: Bi-directional sync with external systems (with approval gates)
4. **Operational Data Management**: Routine data corrections and updates
5. **Development/Testing**: Populating test data in development environments
6. **AI-Assisted Data Entry**: Creating records via natural language with human confirmation

**Example Workflow with Human Oversight:**
```
User: "Create a new account for Acme Corporation with phone 555-1234"
AI Agent: Uses create-record tool
System: Logs operation for audit
User: Reviews created record, confirms correctness
```

### Key Features

- ✅ **Self-Contained**: Query, create, update, delete in one package (no second MCP server needed)
- ✅ **Query Records**: Find records using OData filters (no permission flags required)
- ✅ **Get Record**: Retrieve specific records by ID (no permission flags required)
- ✅ **Record Creation**: Create new records with all field types
- ✅ **Record Updates**: Partial updates (only specified fields changed)
- ✅ **Record Deletion**: Permanent deletion with explicit confirmation
- ✅ **Action Execution**: Execute Custom APIs and Actions (unbound or bound)
- ✅ **Granular Permissions**: Separate flags for create/update/delete/execute
- ✅ **Field Validation**: Pre-validation before API calls
- ✅ **Audit Logging**: All operations logged with user context
- ✅ **Error Handling**: Clear error messages for validation and permission issues
- ✅ **GUID Validation**: Automatic validation of record IDs
- ✅ **Confirmation Requirements**: Delete operations require explicit confirmation

**Safety Features:**
- ❗ **Requires individual flags**: Each operation (create/update/delete) requires explicit environment variable
- ❗ **Delete confirmation**: Delete operations require `confirm: true` parameter
- ❗ **Audit logging**: All operations logged with timestamps and parameters
- ❗ **No bulk delete**: No tool for bulk deletion (must iterate with confirmation)
- ❗ **Validation first**: Field and GUID validation before API calls

### Security Model

⚠️ **This package enables data modification and should be used with extreme caution.**

**Granular Operation Flags (v21+):**

Each data operation requires its own environment flag:

```bash
POWERPLATFORM_ENABLE_CREATE=true   # Enables create-record tool
POWERPLATFORM_ENABLE_UPDATE=true   # Enables update-record tool
POWERPLATFORM_ENABLE_DELETE=true   # Enables delete-record tool
```

**Without these flags**, tools will throw errors:
- `create-record`: `Error: Create operations are disabled. Set POWERPLATFORM_ENABLE_CREATE=true to enable.`
- `update-record`: `Error: Update operations are disabled. Set POWERPLATFORM_ENABLE_UPDATE=true to enable.`
- `delete-record`: `Error: Delete operations are disabled. Set POWERPLATFORM_ENABLE_DELETE=true to enable.`

**Recommended Security Configuration by Environment:**

| Environment | CREATE | UPDATE | DELETE | Rationale |
|-------------|--------|--------|--------|-----------|
| Development | ✅ true | ✅ true | ✅ true | Full flexibility for testing |
| QA/UAT | ❌ false | ❌ false | ❌ false | Read-only for validation |
| Production (Automated) | ❌ false | ❌ false | ❌ false | Use base package only |
| Production (Operational) | ⚠️ true (gated) | ⚠️ true (gated) | ❌ false | With approval workflows only |

---

## Detailed Setup

### Prerequisites

1. **PowerPlatform Environment**: Appropriate environment for data operations (dev/operational)
2. **Azure AD App Registration**: With Dataverse permissions
3. **Create/Update/Delete Privileges**: Application user needs data modification privileges
4. **Base Package**: This package depends on `@mcp-consultant-tools/powerplatform`
5. **Approval Workflow** (Production): Human approval gates for AI-generated operations

### Installation

```bash
# Install base package + data package
npm install @mcp-consultant-tools/core @mcp-consultant-tools/powerplatform @mcp-consultant-tools/powerplatform-data
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POWERPLATFORM_URL` | ✅ Yes | - | PowerPlatform environment URL (e.g., `https://yourenvironment.crm.dynamics.com`) |
| `POWERPLATFORM_CLIENT_ID` | ✅ Yes | - | Azure AD app registration client ID |
| `POWERPLATFORM_CLIENT_SECRET` | ✅ Yes | - | Azure AD app registration client secret |
| `POWERPLATFORM_TENANT_ID` | ✅ Yes | - | Azure tenant ID |
| `POWERPLATFORM_ENABLE_CREATE` | ❌ No | `"false"` | ⚠️ Enable record creation (create-record tool) |
| `POWERPLATFORM_ENABLE_UPDATE` | ❌ No | `"false"` | ⚠️ Enable record updates (update-record tool) |
| `POWERPLATFORM_ENABLE_DELETE` | ❌ No | `"false"` | ⚠️ Enable record deletion (delete-record tool) |
| `POWERPLATFORM_ENABLE_ACTIONS` | ❌ No | `"false"` | ⚠️ Enable action execution (execute-action tool) |

```bash
# Required - PowerPlatform Authentication
POWERPLATFORM_URL=https://yourenvironment.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=your-azure-app-client-id
POWERPLATFORM_CLIENT_SECRET=your-azure-app-client-secret
POWERPLATFORM_TENANT_ID=your-azure-tenant-id

# Optional - Data CRUD Operations (all default to "false")
# ⚠️ WARNING: These allow data modifications - use with caution
POWERPLATFORM_ENABLE_CREATE=true   # Optional - enables create-record tool
POWERPLATFORM_ENABLE_UPDATE=true   # Optional - enables update-record tool
POWERPLATFORM_ENABLE_DELETE=true   # Optional - enables delete-record tool
POWERPLATFORM_ENABLE_ACTIONS=true  # Optional - enables execute-action tool
```

**Claude Desktop Config (Development - Full CRUD):**
```json
{
  "mcpServers": {
    "powerplatform-data": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-data", "mcp-pp-data"],
      "env": {
        // Required - PowerPlatform Authentication
        "POWERPLATFORM_URL": "https://yourdevenv.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-azure-app-secret",
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id",

        // Optional - Data CRUD Operations (defaults to "false")
        "POWERPLATFORM_ENABLE_CREATE": "true",  // Optional - enables create-record
        "POWERPLATFORM_ENABLE_UPDATE": "true",  // Optional - enables update-record
        "POWERPLATFORM_ENABLE_DELETE": "true"   // Optional - enables delete-record
      }
    }
  }
}
```

**Claude Desktop Config (Production - Restricted, No Delete):**
```json
{
  "mcpServers": {
    "powerplatform-data": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-data", "mcp-pp-data"],
      "env": {
        // Required - PowerPlatform Authentication
        "POWERPLATFORM_URL": "https://yourprodenv.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-azure-app-secret",
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id",

        // Optional - Data CRUD Operations (restrict in production)
        "POWERPLATFORM_ENABLE_CREATE": "true",  // Optional - allow creates with oversight
        "POWERPLATFORM_ENABLE_UPDATE": "true",  // Optional - allow updates with oversight
        "POWERPLATFORM_ENABLE_DELETE": "false"  // Optional - DISABLE deletes in production
      }
    }
  }
}
```

### Required Permissions

The application user must have appropriate **CRUD privileges** on target entities:

| Operation | Required Privilege |
|-----------|-------------------|
| create-record | **Create** privilege on target entity |
| update-record | **Write** privilege on target entity |
| delete-record | **Delete** privilege on target entity |

**Assign Privileges:**

**Option 1: Security Role with Entity-Level Privileges**
1. Go to PowerPlatform Admin Center → **Settings** → **Security** → **Security Roles**
2. Create custom role or modify existing role
3. Grant **Create**, **Write**, **Delete** privileges on target entities
4. Assign role to application user

**Option 2: Custom Security Role (Recommended for Production)**
1. Create custom security role with specific entity privileges
2. Example: "Data Entry Role"
   - **Create** on Account, Contact, Opportunity
   - **Write** on Account, Contact
   - **Delete** on none (disable delete in production)
3. Assign to application user

**Principle of Least Privilege:**
- Grant **only** the privileges needed for intended operations
- Avoid System Administrator role for data operations
- Use entity-level security for fine-grained control

---

## Tools (6 Total)

### query-records

**Query Dataverse records using an OData filter expression**

Use this tool to find records before performing CRUD operations or to validate changes after operations. This is a **read-only** operation and does not require any permission flags.

**Parameters:**
- `entityNamePlural` (string, required): Plural logical name (e.g., "accounts", "contacts")
- `filter` (string, required): OData filter expression
- `maxRecords` (number, optional): Maximum records to retrieve (default: 50, max: 5000)

**Returns:**
- List of matching records with all fields

**Example - Find accounts by name:**
```javascript
await invoke("query-records", {
  entityNamePlural: "accounts",
  filter: "contains(name, 'Acme')"
});
```

**Example - Find active contacts:**
```javascript
await invoke("query-records", {
  entityNamePlural: "contacts",
  filter: "statecode eq 0",
  maxRecords: 100
});
```

**Example - Find records created recently:**
```javascript
await invoke("query-records", {
  entityNamePlural: "opportunities",
  filter: "createdon gt 2024-01-01"
});
```

**Common OData Filter Expressions:**
| Filter | Description |
|--------|-------------|
| `name eq 'Acme Corp'` | Exact match |
| `contains(name, 'Acme')` | Contains substring |
| `startswith(name, 'A')` | Starts with |
| `statecode eq 0` | Active records |
| `createdon gt 2024-01-01` | Created after date |
| `revenue gt 1000000` | Greater than |
| `_parentaccountid_value eq 'guid'` | Lookup field match |

**Validation:**
- No permission flag required (read-only operation)
- Validates `filter` is not empty
- Validates `maxRecords` is within bounds

---

### get-record

**Get a specific Dataverse record by entity name and ID**

Use this tool to retrieve a specific record before updating/deleting or to validate changes after create/update operations. This is a **read-only** operation and does not require any permission flags.

**Parameters:**
- `entityNamePlural` (string, required): Plural logical name (e.g., "accounts", "contacts")
- `recordId` (string, required): GUID of the record

**Returns:**
- Complete record with all fields

**Example - Get an account:**
```javascript
await invoke("get-record", {
  entityNamePlural: "accounts",
  recordId: "12345678-1234-1234-1234-123456789012"
});
```

**Example - Verify after create:**
```javascript
// After creating a record, verify it was created correctly
const createResult = await invoke("create-record", {
  entityNamePlural: "contacts",
  data: { firstname: "John", lastname: "Smith" }
});

// Get the created record to verify
await invoke("get-record", {
  entityNamePlural: "contacts",
  recordId: createResult.contactid
});
```

**Validation:**
- No permission flag required (read-only operation)
- Validates `recordId` format (GUID)
- Returns 404 error if record doesn't exist

---

### create-record

**Create a new record in a Dataverse entity**

**Parameters:**
- `entityNamePlural` (string, required): Plural logical name (e.g., "accounts", "contacts")
- `data` (object, required): Record data with field names and values

**Returns:**
- Created record with generated ID
- All fields populated by the system (created date, owner, etc.)

**Example:**
```javascript
await invoke("create-record", {
  entityNamePlural: "accounts",
  data: {
    name: "Acme Corporation",
    telephone1: "555-1234",
    websiteurl: "https://acme.com",
    revenue: 1000000.00,
    numberofemployees: 500,
    industrycode: 1  // Option set value
  }
});
```

**Validation:**
- Permission check: Requires `POWERPLATFORM_ENABLE_CREATE=true` environment flag
- Package check: Requires `@mcp-consultant-tools/powerplatform-data` installed
- Validates `data` is not empty
- Validates required fields are present (checked by Dataverse API)
- Validates field types match entity schema

**Audit Log:**
```javascript
{
  operation: 'create-record',
  operationType: 'CREATE',
  resourceId: entityNamePlural,
  componentType: 'Record',
  success: true,
  parameters: { entityNamePlural, dataFields: Object.keys(data) },
  executionTimeMs: 245
}
```

---

### update-record

**Update an existing record in a Dataverse entity**

**Parameters:**
- `entityNamePlural` (string, required): Plural logical name
- `recordId` (string, required): GUID of record to update
- `data` (object, required): Partial or full record data (only specified fields updated)

**Returns:**
- Updated record with all current values

**Example:**
```javascript
await invoke("update-record", {
  entityNamePlural: "accounts",
  recordId: "12345678-1234-1234-1234-123456789012",
  data: {
    telephone1: "555-5678",
    revenue: 1500000.00
  }
});
// Only telephone1 and revenue updated, all other fields unchanged
```

**Validation:**
- Permission check: Requires `POWERPLATFORM_ENABLE_UPDATE=true` environment flag
- Package check: Requires `@mcp-consultant-tools/powerplatform-data` installed
- Validates `recordId` is valid GUID format
- Validates `data` is not empty
- Validates record exists (checked by Dataverse API)

**Audit Log:**
```javascript
{
  operation: 'update-record',
  operationType: 'UPDATE',
  resourceId: `${entityNamePlural}/${recordId}`,
  componentType: 'Record',
  success: true,
  parameters: { entityNamePlural, recordId, dataFields: Object.keys(data) },
  executionTimeMs: 189
}
```

---

### delete-record

**Permanently delete a record from a Dataverse entity**

**⚠️ WARNING: This operation is permanent and cannot be undone.**

**Parameters:**
- `entityNamePlural` (string, required): Plural logical name
- `recordId` (string, required): GUID of record to delete
- `confirm` (boolean, required): Must be `true` for safety (explicit confirmation)

**Returns:**
- Success confirmation message

**Example:**
```javascript
await invoke("delete-record", {
  entityNamePlural: "accounts",
  recordId: "12345678-1234-1234-1234-123456789012",
  confirm: true  // REQUIRED - explicit confirmation
});
```

**Validation:**
- Permission check: Requires `POWERPLATFORM_ENABLE_DELETE=true` environment flag
- Package check: Requires `@mcp-consultant-tools/powerplatform-data` installed
- Tool-level safety: Requires explicit `confirm: true` parameter
- Validates `recordId` is valid GUID format
- Validates `confirm === true` (throws error if false or omitted)
- Validates record exists (checked by Dataverse API)

**Safety Requirements:**
- `confirm` parameter **must** be explicitly set to `true`
- No bulk delete tool provided (must iterate with individual confirmations)
- Audit log captures every deletion

**Audit Log:**
```javascript
{
  operation: 'delete-record',
  operationType: 'DELETE',
  resourceId: `${entityNamePlural}/${recordId}`,
  componentType: 'Record',
  success: true,
  parameters: { entityNamePlural, recordId, confirmed: true },
  executionTimeMs: 156
}
```

---

### execute-action

**Execute a Custom API or Action in Dataverse**

Supports both **unbound actions** (not tied to any entity) and **bound actions** (tied to a specific record).

**Parameters:**
- `actionName` (string, required): The unique name of the Custom API or Action (e.g., `"WhoAmI"`, `"new_CalculateTotals"`, `"WinOpportunity"`)
- `parameters` (object, optional): Input parameters for the action as JSON object
- `boundTo` (object, optional): For bound actions only - specifies the entity and record
  - `entityNamePlural` (string): Plural name of the entity (e.g., `"opportunities"`)
  - `recordId` (string): GUID of the record to bind to

**Returns:**
- Action response with output parameters (if any)

**Example - Unbound Action (WhoAmI):**
```javascript
await invoke("execute-action", {
  actionName: "WhoAmI"
});
// Returns: { UserId: "guid", BusinessUnitId: "guid", OrganizationId: "guid" }
```

**Example - Unbound Action with Parameters:**
```javascript
await invoke("execute-action", {
  actionName: "new_CalculateTotals",
  parameters: {
    Amount: 1000,
    TaxRate: 0.08
  }
});
// Returns: { Total: 1080, Tax: 80 }
```

**Example - Bound Action (WinOpportunity):**
```javascript
await invoke("execute-action", {
  actionName: "WinOpportunity",
  parameters: {
    Status: 3,
    OpportunityClose: {
      subject: "Won - Closed deal with Contoso",
      actualend: "2025-01-15T00:00:00Z",
      actualrevenue: 50000.00
    }
  },
  boundTo: {
    entityNamePlural: "opportunities",
    recordId: "12345678-1234-1234-1234-123456789012"
  }
});
```

**Validation:**
- Permission check: Requires `POWERPLATFORM_ENABLE_ACTIONS=true` environment flag
- Validates `actionName` is not empty
- For bound actions: validates `recordId` is valid GUID format
- Action must exist in Dataverse (checked by API)

**Common Built-in Actions:**
| Action Name | Type | Description |
|-------------|------|-------------|
| `WhoAmI` | Unbound | Get current user, business unit, and organization |
| `WinOpportunity` | Bound (opportunity) | Close opportunity as won |
| `LoseOpportunity` | Bound (opportunity) | Close opportunity as lost |
| `SetState` | Bound | Set record state and status |
| `CalculatePrice` | Bound (opportunity/quote/order/invoice) | Calculate pricing |
| `Merge` | Bound | Merge two records |
| `ConvertSalesOrderToInvoice` | Bound (salesorder) | Convert order to invoice |

**Audit Log:**
```javascript
{
  operation: 'execute-action',
  operationType: 'EXECUTE',
  resourceId: actionName,
  componentType: 'Action',
  success: true,
  parameters: { actionName, hasParameters: true, isBound: false },
  executionTimeMs: 312
}
```

---

## Data Format Reference

### Field Types

**Text Fields:**
```javascript
{
  name: "Acme Corporation",           // Single line text
  description: "Long description..."  // Multiple lines (memo)
}
```

**Number Fields:**
```javascript
{
  numberofemployees: 500,             // Whole number (integer)
  revenue: 1000000.00,                // Decimal
  creditlimit: 50000.00               // Money (stores as decimal)
}
```

**Boolean Fields:**
```javascript
{
  donotemail: true,                   // Boolean (true/false)
  followemail: false
}
```

### Lookup Fields

**Lookup fields use `@odata.bind` syntax:**

```javascript
{
  // Link to parent account
  "parentaccountid@odata.bind": "/accounts(12345678-1234-1234-1234-123456789012)",

  // Link to primary contact
  "primarycontactid@odata.bind": "/contacts(87654321-4321-4321-4321-210987654321)",

  // Link to owner (user)
  "ownerid@odata.bind": "/systemusers(aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa)"
}
```

**Format:** `"<fieldname>@odata.bind": "/<pluralname>(<guid>)"`

### Option Sets

**Option set fields use integer values:**

```javascript
{
  // Industry (option set)
  industrycode: 1,  // 1 = Accounting, 2 = Agriculture, etc.

  // State (status)
  statecode: 0,     // 0 = Active, 1 = Inactive
  statuscode: 1     // Status reason (depends on entity)
}
```

**Finding option set values:**
1. Use base package: `get-entity-attribute` to see option set values
2. Or query via Power Apps maker portal

### Date and Time

**Use ISO 8601 format:**

```javascript
{
  birthdate: "1990-01-15",                    // Date only
  createdon: "2025-01-15T10:30:00Z",         // Date and time (UTC)
  scheduledstart: "2025-01-20T09:00:00-05:00" // With timezone
}
```

**Recommended:** Always use UTC (Z suffix) for consistency

### Money and Decimal

**Money fields:**
```javascript
{
  revenue: 1000000.00,        // Stored as decimal
  creditlimit: 50000.50
}
```

**Decimal fields:**
```javascript
{
  exchangerate: 1.23456,      // Up to 10 decimal places
  latitude: 47.606209
}
```

---

## Usage Examples

### Query Records (Before/After CRUD Operations)

**Check if a record exists before creating:**
```javascript
// Before creating a new account, check if one already exists with this name
const existing = await invoke("query-records", {
  entityNamePlural: "accounts",
  filter: "name eq 'Contoso Ltd'"
});

if (existing.value.length > 0) {
  console.log("Account already exists:", existing.value[0].accountid);
} else {
  // Safe to create
  await invoke("create-record", { ... });
}
```

**Get a specific record before updating:**
```javascript
// Verify the record exists and check current values before updating
const record = await invoke("get-record", {
  entityNamePlural: "accounts",
  recordId: "12345678-1234-1234-1234-123456789012"
});

console.log("Current phone:", record.telephone1);
// Now safe to update
await invoke("update-record", {
  entityNamePlural: "accounts",
  recordId: "12345678-1234-1234-1234-123456789012",
  data: { telephone1: "425-555-0199" }
});
```

**Validate changes after update:**
```javascript
// After updating, verify the changes took effect
await invoke("update-record", {
  entityNamePlural: "contacts",
  recordId: contactId,
  data: { jobtitle: "VP of Sales" }
});

// Verify the update
const updated = await invoke("get-record", {
  entityNamePlural: "contacts",
  recordId: contactId
});
console.log("Verified new job title:", updated.jobtitle);
```

**Find related records before deletion:**
```javascript
// Check if account has related contacts before deleting
const contacts = await invoke("query-records", {
  entityNamePlural: "contacts",
  filter: `_parentcustomerid_value eq '${accountId}'`
});

if (contacts.value.length > 0) {
  console.log(`Warning: Account has ${contacts.value.length} related contacts`);
  // Handle related records first...
}
```

### Create Records

**Create Account:**
```javascript
const result = await invoke("create-record", {
  entityNamePlural: "accounts",
  data: {
    name: "Contoso Ltd",
    telephone1: "425-555-0100",
    emailaddress1: "info@contoso.com",
    websiteurl: "https://contoso.com",
    address1_city: "Seattle",
    address1_stateorprovince: "WA",
    address1_country: "USA",
    industrycode: 7,  // Software
    revenue: 5000000.00,
    numberofemployees: 250
  }
});

console.log(`Created account with ID: ${result.accountid}`);
```

**Create Contact with Lookup:**
```javascript
await invoke("create-record", {
  entityNamePlural: "contacts",
  data: {
    firstname: "John",
    lastname: "Smith",
    emailaddress1: "john.smith@contoso.com",
    telephone1: "425-555-0101",
    jobtitle: "Sales Director",

    // Link to parent account
    "parentcustomerid@odata.bind": `/accounts(${accountId})`
  }
});
```

### Update Records

**Update Single Field:**
```javascript
await invoke("update-record", {
  entityNamePlural: "accounts",
  recordId: accountId,
  data: {
    telephone1: "425-555-0199"  // Only updates phone number
  }
});
```

**Update Multiple Fields:**
```javascript
await invoke("update-record", {
  entityNamePlural: "contacts",
  recordId: contactId,
  data: {
    jobtitle: "VP of Sales",
    emailaddress1: "john.smith-new@contoso.com",
    mobilephone: "425-555-0102"
  }
});
```

**Update Lookup Field:**
```javascript
await invoke("update-record", {
  entityNamePlural: "opportunities",
  recordId: opportunityId,
  data: {
    "parentaccountid@odata.bind": `/accounts(${newAccountId})`
  }
});
```

### Delete Records

**Delete with Confirmation:**
```javascript
await invoke("delete-record", {
  entityNamePlural: "accounts",
  recordId: accountId,
  confirm: true  // MUST be true
});
```

**❌ Without Confirmation (Fails):**
```javascript
await invoke("delete-record", {
  entityNamePlural: "accounts",
  recordId: accountId
  // confirm omitted - will throw error
});
// Error: Delete operations require explicit confirmation (confirm: true)
```

### Execute Actions

**Execute Unbound Action (WhoAmI):**
```javascript
const result = await invoke("execute-action", {
  actionName: "WhoAmI"
});

console.log(`Current User ID: ${result.UserId}`);
console.log(`Business Unit ID: ${result.BusinessUnitId}`);
```

**Execute Custom API with Parameters:**
```javascript
const result = await invoke("execute-action", {
  actionName: "new_ValidateAddress",
  parameters: {
    Street: "123 Main St",
    City: "Seattle",
    State: "WA",
    PostalCode: "98101"
  }
});

if (result.IsValid) {
  console.log("Address is valid");
} else {
  console.log(`Address validation failed: ${result.ValidationMessage}`);
}
```

**Execute Bound Action (Close Opportunity as Won):**
```javascript
await invoke("execute-action", {
  actionName: "WinOpportunity",
  parameters: {
    Status: 3,  // Won
    OpportunityClose: {
      subject: "Won - Deal closed",
      actualend: new Date().toISOString(),
      actualrevenue: 75000.00
    }
  },
  boundTo: {
    entityNamePlural: "opportunities",
    recordId: opportunityId
  }
});
```

**Execute Bound Action (Qualify Lead):**
```javascript
const result = await invoke("execute-action", {
  actionName: "QualifyLead",
  parameters: {
    CreateAccount: true,
    CreateContact: true,
    CreateOpportunity: true,
    Status: 3  // Qualified
  },
  boundTo: {
    entityNamePlural: "leads",
    recordId: leadId
  }
});

console.log(`Created Account: ${result.CreatedEntities.accountid}`);
console.log(`Created Contact: ${result.CreatedEntities.contactid}`);
console.log(`Created Opportunity: ${result.CreatedEntities.opportunityid}`);
```

### Bulk Operations

**Create Multiple Records (Sequential):**
```javascript
const accountData = [
  { name: "Account 1", telephone1: "555-0001" },
  { name: "Account 2", telephone1: "555-0002" },
  { name: "Account 3", telephone1: "555-0003" }
];

for (const data of accountData) {
  await invoke("create-record", {
    entityNamePlural: "accounts",
    data
  });
}
```

**Update Multiple Records (Sequential):**
```javascript
const updates = [
  { id: "guid-1", data: { telephone1: "555-0101" } },
  { id: "guid-2", data: { telephone1: "555-0102" } }
];

for (const update of updates) {
  await invoke("update-record", {
    entityNamePlural: "accounts",
    recordId: update.id,
    data: update.data
  });
}
```

---

## Best Practices

### Data Validation

1. **Validate Before API Calls**: Check required fields before invoking tools
2. **Use Correct Field Names**: Use logical names (e.g., `emailaddress1`, not `email`)
3. **Validate GUIDs**: Ensure record IDs are valid GUID format
4. **Check Option Set Values**: Verify option set integer values are valid
5. **Validate Lookups**: Ensure target records exist before setting lookups

### Error Handling

1. **Catch API Errors**: Handle Dataverse API errors gracefully
2. **Log Failures**: Log failed operations for troubleshooting
3. **Retry Logic**: Implement retry for transient failures (network issues)
4. **User Feedback**: Provide clear error messages to users
5. **Rollback Plans**: Have plans for reversing changes if needed

### Audit Logging

1. **All Operations Logged**: Every create/update/delete is automatically logged
2. **Review Audit Logs**: Regularly review logs for unauthorized operations
3. **Correlate with Users**: Track which users triggered which operations
4. **Retention Policy**: Define audit log retention policy
5. **Alert on Anomalies**: Set up alerts for unusual operation patterns

### Operational Use

1. **Human Oversight**: Always have human review for production operations
2. **Approval Workflows**: Implement approval gates for AI-generated changes
3. **Staging First**: Test operations in staging environment first
4. **Backup Before Bulk**: Backup data before bulk operations
5. **Limit Scope**: Limit AI agent access to specific entities only

---

## Troubleshooting

### Common Errors

**Error:** `Create operations are disabled`
- **Cause**: `POWERPLATFORM_ENABLE_CREATE` not set to `true`
- **Fix**: Add `POWERPLATFORM_ENABLE_CREATE=true` to environment variables

**Error:** `Update operations are disabled`
- **Cause**: `POWERPLATFORM_ENABLE_UPDATE` not set to `true`
- **Fix**: Add `POWERPLATFORM_ENABLE_UPDATE=true` to environment variables

**Error:** `Delete operations are disabled`
- **Cause**: `POWERPLATFORM_ENABLE_DELETE` not set to `true`
- **Fix**: Add `POWERPLATFORM_ENABLE_DELETE=true` to environment variables

**Error:** `Invalid GUID format for recordId`
- **Cause**: Provided record ID is not a valid GUID
- **Fix**: Use format: `12345678-1234-1234-1234-123456789012` (lowercase, with dashes)

**Error:** `Delete operations require explicit confirmation (confirm: true)`
- **Cause**: `confirm` parameter missing or not set to `true`
- **Fix**: Add `confirm: true` to delete-record parameters

**Error:** `Data object cannot be empty`
- **Cause**: Empty `data` object passed to create-record or update-record
- **Fix**: Provide at least one field in `data` object

**Error:** `Action execution is disabled`
- **Cause**: `POWERPLATFORM_ENABLE_ACTIONS` not set to `true`
- **Fix**: Add `POWERPLATFORM_ENABLE_ACTIONS=true` to environment variables

**Error:** `Action name cannot be empty`
- **Cause**: Empty or missing `actionName` parameter
- **Fix**: Provide the action name (e.g., `actionName: "WhoAmI"`)

**Error:** `Bound action requires entityNamePlural`
- **Cause**: `boundTo` object provided but missing `entityNamePlural`
- **Fix**: Include both `entityNamePlural` and `recordId` in the `boundTo` object

### Permission Issues

**Error:** `Principal user is missing prvCreateAccount privilege`
- **Cause**: Application user lacks Create privilege on Account entity
- **Fix**: Assign security role with Create privilege on Account

**Error:** `Principal user is missing prvWriteContact privilege`
- **Cause**: Application user lacks Write privilege on Contact entity
- **Fix**: Assign security role with Write privilege on Contact

**Error:** `Principal user is missing prvDeleteOpportunity privilege`
- **Cause**: Application user lacks Delete privilege on Opportunity entity
- **Fix**: Assign security role with Delete privilege on Opportunity (or disable delete operations)

### Data Validation Errors

**Error:** `Required field 'name' is missing`
- **Cause**: Required field not provided in data
- **Fix**: Include all required fields in `data` object

**Error:** `Invalid option set value '999' for field 'industrycode'`
- **Cause**: Invalid option set value provided
- **Fix**: Use `get-entity-attribute` (base package) to find valid option set values

**Error:** `Invalid lookup reference`
- **Cause**: Lookup field using incorrect format or target record doesn't exist
- **Fix**: Use correct format: `"fieldname@odata.bind": "/pluralname(guid)"`

**Error:** `Record with id 'guid' does not exist`
- **Cause**: Trying to update/delete non-existent record
- **Fix**: Verify record ID using `get-record` (base package) first

---

## Related Documentation

- [PowerPlatform Read-Only Package](POWERPLATFORM.md) - Query and explore data
- [PowerPlatform Customization Package](POWERPLATFORM_CUSTOMIZATION.md) - Schema modifications
- [Dataverse Web API Reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview)
- [Create and Update Records](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-entity-web-api)

---

## Support

For issues, questions, or feature requests:
- GitHub Issues: https://github.com/klemensms/mcp-consultant-tools/issues
- Documentation: https://github.com/klemensms/mcp-consultant-tools
