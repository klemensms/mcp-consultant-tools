# Implementation Plan: PowerPlatform Best Practices Automation

## Overview
Add automated best practices guidance and validation for PowerPlatform customization, with configurable client-specific rules, AI-powered description generation, and user-friendly prompts.

## Requirements Summary

Based on user requirements:

1. **Client-specific configuration**: Client prefix configurable (e.g., RTPI, AOP) for solution naming
2. **Web resource best practices**:
   - All web resources in `{CLIENT}WebResources` solution
   - Icons named "Icon for {display name} - {schema name}"
   - Web resource names must be lowercase
   - Display names must be proper casing
3. **Description requirements**:
   - Every table and column needs a description
   - AI suggests descriptions, user can override
4. **DateTime field configuration**:
   - Must be TimeZoneIndependent
   - Agent asks if DateOnly or DateTime should be displayed
5. **Global optionset values**:
   - Values start at 0 and increment (0, 1, 2, 3...)
   - 0 reserved for default value if one exists
6. **Enforcement level**: Warnings (allow override) rather than hard errors
7. **Automatic guidance**: Prompts that MCP clients can auto-inject into context

## Phase 1: Core Infrastructure

### 1.1 Add Client Prefix Configuration

**Environment Variable:**
```bash
# PowerPlatform client prefix for solution naming (e.g., RTPI, AOP, XYZ)
# Used for constructing solution names like {CLIENT}Core, {CLIENT}WebResources
POWERPLATFORM_CLIENT_PREFIX=RTPI
```

**Implementation:**
- Add to `.env.example` with clear description
- Add to service initialization in `packages/powerplatform-customization/src/index.ts`
- Validate prefix is set when web resource tools are used
- Use in solution name validation

### 1.2 Extend Best Practices Validator

**File**: `packages/powerplatform/src/utils/bestPractices.ts`

**New validation methods to add:**

```typescript
/**
 * Validates web resource naming conventions
 * - Icons: "Icon for {displayName} - {schemaName}"
 * - Web resource names: lowercase
 * - Display names: proper casing
 */
validateWebResourceNaming(
  name: string,
  displayName: string,
  type: 'Icon' | 'Script' | 'Data' | 'Style' | 'Image',
  relatedEntityDisplayName?: string,
  relatedEntitySchemaName?: string
): ValidationResult

/**
 * Validates web resource is in correct solution
 * - Should be in {CLIENT}WebResources solution
 */
validateWebResourceSolution(
  solutionName: string,
  clientPrefix: string
): ValidationResult

/**
 * Validates description is present and meaningful
 * - Required for all tables and columns
 * - Warning level (non-blocking)
 */
validateDescriptionRequired(
  description: string | undefined,
  entityType: 'table' | 'column',
  schemaName: string
): ValidationResult

/**
 * Validates DateTime configuration
 * - Should use TimeZoneIndependent behavior
 * - Prompts for DateOnly vs DateTime format
 */
validateDateTimeConfiguration(
  behavior: 'UserLocal' | 'DateOnly' | 'TimeZoneIndependent',
  format: 'DateOnly' | 'DateAndTime'
): ValidationResult

/**
 * Validates global optionset values follow best practices
 * - Values start at 0
 * - Values increment by 1
 * - 0 reserved for default if applicable
 */
validateGlobalOptionSetValues(
  options: Array<{ value: number; label: string }>,
  hasDefault: boolean
): ValidationResult
```

**Update ValidationResult type to support warnings:**
```typescript
interface ValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];  // NEW: Non-blocking warnings
  suggestions: string[];  // NEW: Helpful suggestions
}
```

### 1.3 Create AI Description Generator

**New file**: `packages/powerplatform/src/utils/descriptionGenerator.ts`

**Purpose**: Generate intelligent description suggestions based on schema names and context

**Methods to implement:**

```typescript
/**
 * Generate suggested description for a table
 * Uses schema name patterns and context to create meaningful descriptions
 */
export function generateTableDescription(
  schemaName: string,
  isRefData: boolean,
  attributes?: Array<{ schemaName: string; type: string }>
): {
  suggestion: string;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

/**
 * Generate suggested description for an attribute
 * Uses attribute name, type, and table context
 */
export function generateAttributeDescription(
  attributeSchemaName: string,
  attributeType: string,
  tableSchemaName: string,
  tableDisplayName?: string
): {
  suggestion: string;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

/**
 * Batch generate descriptions for multiple entities/attributes
 */
export function generateBatchDescriptions(
  entities: Array<{
    schemaName: string;
    isRefData: boolean;
    attributes: Array<{ schemaName: string; type: string }>;
  }>
): Array<{
  entitySchemaName: string;
  entityDescription: string;
  attributeDescriptions: Array<{
    attributeSchemaName: string;
    description: string;
  }>;
}>
```

**Implementation approach:**
- Parse schema names for common patterns (e.g., "sic_customer_name" → "Customer Name")
- Use type information to infer purpose (e.g., DateTime + "enddate" → "End date for the record")
- For RefData tables, emphasize reference/lookup nature
- For lookup attributes, describe the relationship
- For common patterns (createdby, modifiedon, etc.), use standard descriptions

## Phase 2: Enhanced Tools

### 2.1 Update create-entity Tool

**File**: `packages/powerplatform-customization/src/index.ts`

**Changes:**
- Add optional `description` parameter
- If not provided, generate AI suggestion
- Return suggestion to user for review/override
- Validate description presence (warning if missing)

**Updated tool schema:**
```typescript
{
  name: "create-entity",
  inputSchema: z.object({
    // ... existing parameters ...
    description: z.string()
      .optional()
      .describe("Table description. If not provided, an AI-generated suggestion will be returned for review."),
    acceptSuggestedDescription: z.boolean()
      .optional()
      .default(false)
      .describe("Set to true to accept AI-generated description without review")
  })
}
```

**Implementation flow:**
1. If no description provided → generate AI suggestion
2. If `acceptSuggestedDescription: false` → return suggestion, don't create table yet
3. If `acceptSuggestedDescription: true` → use suggestion and proceed
4. If description provided → validate and proceed
5. Warning if description is too short or generic

### 2.2 Update create-attribute Tool

**File**: `packages/powerplatform-customization/src/index.ts`

**Changes:**
- Add optional `description` parameter (with AI generation like create-entity)
- For DateTime type: Add explicit `dateOnly` parameter
- Enforce TimeZoneIndependent behavior (warning if UserLocal requested)
- Add `format` parameter for DateTime (DateOnly vs DateAndTime)

**Updated tool schema:**
```typescript
{
  name: "create-attribute",
  inputSchema: z.object({
    // ... existing parameters ...
    description: z.string()
      .optional()
      .describe("Column description. If not provided, an AI-generated suggestion will be returned for review."),
    acceptSuggestedDescription: z.boolean()
      .optional()
      .default(false),

    // DateTime-specific parameters
    dateOnly: z.boolean()
      .optional()
      .describe("For DateTime fields: true for DateOnly, false for DateAndTime. Must be specified for DateTime fields."),
    timeZoneBehavior: z.enum(['UserLocal', 'DateOnly', 'TimeZoneIndependent'])
      .optional()
      .default('TimeZoneIndependent')
      .describe("DateTime behavior. TimeZoneIndependent is strongly recommended for consistency.")
  })
}
```

**Implementation flow:**
1. If type is DateTime and `dateOnly` not specified → return error asking user to specify
2. If `timeZoneBehavior` is not TimeZoneIndependent → return warning but allow override
3. Description generation same as create-entity
4. Validate attribute name follows lowercase conventions

### 2.3 Update create-global-option-set Tool

**File**: `packages/powerplatform-customization/src/index.ts`

**Changes:**
- Validate option values start at 0 and increment properly
- Add `hasDefault` parameter to indicate if 0 should be reserved
- Auto-suggest proper values if validation fails

**Updated tool schema:**
```typescript
{
  name: "create-global-option-set",
  inputSchema: z.object({
    // ... existing parameters ...
    hasDefault: z.boolean()
      .optional()
      .default(true)
      .describe("Whether this optionset has a default value. If true, value 0 is reserved for the default."),
    autoFixValues: z.boolean()
      .optional()
      .default(false)
      .describe("Automatically renumber values to start at 0 and increment properly")
  })
}
```

**Implementation flow:**
1. Validate values start at 0: `[0, 1, 2, 3...]`
2. Validate values increment by 1 (no gaps)
3. If `hasDefault: true`, ensure value 0 exists
4. If validation fails:
   - If `autoFixValues: true` → automatically renumber
   - If `autoFixValues: false` → return warning with suggested values
5. Allow user to override with confirmation

### 2.4 Add create-web-resource Tool

**New tool**: `packages/powerplatform-customization/src/index.ts`

**Purpose**: Create web resources with best practices validation

**Tool schema:**
```typescript
{
  name: "create-web-resource",
  description: "Create a web resource (icon, script, style, etc.) with best practices validation",
  inputSchema: z.object({
    name: z.string()
      .describe("Web resource name (lowercase, e.g., 'sic_icon_customer')"),
    displayName: z.string()
      .describe("Web resource display name (proper casing, e.g., 'Icon for Customer - sic_customer')"),
    type: z.enum(['Icon', 'Script', 'Data', 'Style', 'Image', 'HTML'])
      .describe("Web resource type"),
    solution: z.string()
      .optional()
      .describe("Solution name (defaults to {CLIENT}WebResources based on POWERPLATFORM_CLIENT_PREFIX)"),
    content: z.string()
      .describe("Base64-encoded content or file path"),
    relatedEntityDisplayName: z.string()
      .optional()
      .describe("For icons: Display name of related entity (e.g., 'Customer')"),
    relatedEntitySchemaName: z.string()
      .optional()
      .describe("For icons: Schema name of related entity (e.g., 'sic_customer')"),
    forceCreate: z.boolean()
      .optional()
      .default(false)
      .describe("Override validation warnings and create anyway")
  })
}
```

**Implementation:**
1. Validate `name` is lowercase → warning if not
2. Validate `displayName` is proper casing
3. If type is 'Icon':
   - Require `relatedEntityDisplayName` and `relatedEntitySchemaName`
   - Auto-format displayName: "Icon for {display} - {schema}"
   - Warning if doesn't match pattern
4. Validate solution is `{CLIENT}WebResources`:
   - Get client prefix from `POWERPLATFORM_CLIENT_PREFIX`
   - Expected: `{prefix}WebResources` (e.g., "RTPIWebResources")
   - Warning if different solution specified
5. If warnings and `forceCreate: false` → return warnings, don't create
6. If warnings and `forceCreate: true` → log warnings but proceed
7. Create web resource via PowerPlatform API

### 2.5 Add suggest-descriptions Tool

**New tool**: `packages/powerplatform-customization/src/index.ts`

**Purpose**: Batch-generate description suggestions for existing entities

**Tool schema:**
```typescript
{
  name: "suggest-descriptions",
  description: "Generate AI-powered description suggestions for entities and attributes",
  inputSchema: z.object({
    entitySchemaName: z.string()
      .optional()
      .describe("Specific entity to generate descriptions for. If omitted, suggests for all entities."),
    includeAttributes: z.boolean()
      .optional()
      .default(true)
      .describe("Include attribute description suggestions"),
    solution: z.string()
      .optional()
      .describe("Filter to entities in a specific solution"),
    onlyMissing: z.boolean()
      .optional()
      .default(true)
      .describe("Only suggest descriptions for entities/attributes missing descriptions")
  })
}
```

**Implementation:**
1. Query entities (optionally filtered by solution)
2. For each entity without description → generate suggestion
3. If `includeAttributes: true` → generate attribute suggestions
4. Return formatted list of suggestions
5. Include confidence levels and rationale
6. User can then use update tools to apply suggestions

## Phase 3: Guidance Prompts

**File**: `packages/powerplatform-customization/src/index.ts`

Add 5 new prompts to guide users through customization with best practices.

### 3.1 Prompt: powerplatform-customization-best-practices

**Name**: `powerplatform-customization-best-practices`

**Description**: "Comprehensive best practices guide for PowerPlatform customization"

**Content sections:**
1. **Naming Conventions**
   - Entity naming: lowercase, prefix, RefData infix
   - Attribute naming: lowercase, lookup suffix
   - Web resource naming: lowercase names, proper display names
   - Icon naming: "Icon for {display} - {schema}"

2. **Solutions & Organization**
   - Core customizations: `{CLIENT}Core` solution
   - Web resources: `{CLIENT}WebResources` solution
   - Publisher prefix configuration

3. **Required Metadata**
   - Every table needs description
   - Every column needs description
   - AI-powered suggestion workflow

4. **DateTime Field Best Practices**
   - Always use TimeZoneIndependent behavior
   - Choose DateOnly vs DateAndTime explicitly
   - Rationale: consistency across timezones

5. **Optionset Best Practices**
   - Global vs local decision tree
   - Value numbering: start at 0, increment by 1
   - Reserve 0 for default value
   - Rationale: prevents value conflicts

6. **Validation Workflow**
   - Use `validate-dataverse-best-practices` to audit
   - Use `suggest-descriptions` for missing descriptions
   - Review warnings before forcing creation

7. **Examples**
   - Good vs bad entity creation
   - Good vs bad attribute creation
   - Good vs bad web resource creation

### 3.2 Prompt: table-creation-checklist

**Name**: `table-creation-checklist`

**Description**: "Step-by-step checklist for creating Dataverse tables following best practices"

**Content:**
```markdown
# Table Creation Checklist

## Before You Start
- [ ] Determine if this should be a RefData table (reference/lookup data)
- [ ] Confirm publisher prefix (default: sic_)
- [ ] Confirm target solution ({CLIENT}Core)

## Naming
- [ ] Schema name: lowercase, prefixed (e.g., sic_customer or sic_ref_cancellationreason)
- [ ] Display name: proper casing (e.g., "Customer" or "Cancellation Reason")
- [ ] Plural name: proper casing (e.g., "Customers")

## Description
- [ ] Provide meaningful description explaining table purpose
- [ ] Or use AI-generated suggestion: call create-entity without description first
- [ ] Review and refine suggestion before accepting

## Configuration
- [ ] Ownership: UserOwned or TeamOwned (not Organization)
- [ ] Enable auditing if needed
- [ ] Enable change tracking if needed

## Required Columns (added automatically by validator)
- [ ] sic_updatedbyprocess (all tables)
- [ ] For RefData: sic_startdate, sic_enddate, sic_description, sic_code

## After Creation
- [ ] Add custom columns with descriptions
- [ ] Configure forms (first column rule, color palette, timeline)
- [ ] Add to relevant model-driven app
- [ ] Run validate-dataverse-best-practices to verify

## Example
```json
{
  "schemaName": "sic_customer",
  "displayName": "Customer",
  "pluralName": "Customers",
  "description": "Stores customer information including contact details and preferences",
  "isRefData": false,
  "ownershipType": "UserOwned"
}
```
```

### 3.3 Prompt: column-creation-guide

**Name**: `column-creation-guide`

**Description**: "Best practices for creating Dataverse columns with appropriate types and configuration"

**Content sections:**
1. **Column Type Selection**
   - Text: Single vs Multi-line
   - Number: Integer vs Decimal vs Money
   - Date: DateOnly vs DateAndTime
   - Choice: Boolean vs Picklist
   - Lookup: Single vs Multi

2. **DateTime Configuration**
   - **Always specify `dateOnly` parameter**
   - `dateOnly: true` → Date only (e.g., birthdate, deadline)
   - `dateOnly: false` → Date and time (e.g., appointment, event)
   - **Always use TimeZoneIndependent behavior**
   - Why: Prevents timezone conversion issues

3. **Boolean vs Picklist Decision Tree**
   - Use Boolean ONLY if:
     - Exactly 2 states
     - States will never expand
     - Clear yes/no meaning
   - Use Picklist if:
     - Might need more than 2 options in future
     - Need to track state transitions
     - Need custom labels (not Yes/No)

4. **Description Requirements**
   - Every column needs description
   - Use AI suggestions: call create-attribute without description
   - Review and refine before accepting

5. **Naming Conventions**
   - Schema name: lowercase, prefixed (e.g., sic_customername)
   - Lookup suffix: id (e.g., sic_primarycontactid)
   - Display name: proper casing (e.g., "Customer Name")

6. **Examples**
   ```json
   // Good DateTime field
   {
     "schemaName": "sic_appointmentdate",
     "displayName": "Appointment Date",
     "type": "DateTime",
     "dateOnly": false,
     "timeZoneBehavior": "TimeZoneIndependent",
     "description": "Date and time of customer appointment"
   }

   // Good Picklist (not Boolean)
   {
     "schemaName": "sic_status",
     "displayName": "Status",
     "type": "Picklist",
     "options": [
       { "value": 0, "label": "Draft" },
       { "value": 1, "label": "Active" },
       { "value": 2, "label": "Inactive" }
     ],
     "description": "Current status of the record"
   }
   ```

### 3.4 Prompt: web-resource-management-guide

**Name**: `web-resource-management-guide`

**Description**: "Best practices for managing web resources including icons, scripts, and styles"

**Content sections:**
1. **Solution Placement**
   - All web resources → `{CLIENT}WebResources` solution
   - Never in `{CLIENT}Core` solution
   - Configured via `POWERPLATFORM_CLIENT_PREFIX`

2. **Icon Naming Convention**
   - **Display name format**: "Icon for {entity display name} - {entity schema name}"
   - **Example**: "Icon for Customer - sic_customer"
   - **Name (lowercase)**: "sic_icon_customer"
   - Why: Clear association with entity, searchable

3. **Other Web Resource Naming**
   - Scripts: `sic_scriptname.js` (lowercase)
   - Styles: `sic_stylename.css` (lowercase)
   - Display names: Proper casing

4. **Icon Format Recommendations**
   - SVG preferred (scalable, small size)
   - PNG acceptable (32x32 or 64x64)
   - Use Fluent UI icons when possible

5. **Usage with create-web-resource Tool**
   ```json
   {
     "name": "sic_icon_customer",
     "displayName": "Icon for Customer - sic_customer",
     "type": "Icon",
     "relatedEntityDisplayName": "Customer",
     "relatedEntitySchemaName": "sic_customer",
     "content": "<base64-encoded SVG>",
     "solution": "RTPIWebResources"
   }
   ```

6. **Validation**
   - Use `validate-dataverse-best-practices` with `web-resource-naming` rule
   - Check solution placement with `web-resource-solution` rule

### 3.5 Prompt: optionset-best-practices

**Name**: `optionset-best-practices`

**Description**: "Best practices for creating and managing global and local optionsets"

**Content sections:**
1. **Global vs Local Decision**
   - **Use Global if**:
     - Values reused across multiple entities
     - Standard reference data (status, type, category)
     - Consistency required across system
   - **Use Local if**:
     - Values specific to one entity
     - Likely to change independently
     - Entity-specific context

2. **Value Numbering Best Practice**
   - **Always start at 0**
   - **Increment by 1**: 0, 1, 2, 3, 4...
   - **Reserve 0 for default** if applicable
   - **Never skip values** (no gaps)
   - Why: Prevents value conflicts, allows easy extension

3. **Examples**
   ```json
   // Global optionset with default
   {
     "name": "sic_priority",
     "displayName": "Priority",
     "hasDefault": true,
     "options": [
       { "value": 0, "label": "Normal" },      // Default
       { "value": 1, "label": "Low" },
       { "value": 2, "label": "High" },
       { "value": 3, "label": "Critical" }
     ]
   }

   // Global optionset without default
   {
     "name": "sic_department",
     "displayName": "Department",
     "hasDefault": false,
     "options": [
       { "value": 0, "label": "Sales" },
       { "value": 1, "label": "Marketing" },
       { "value": 2, "label": "Support" },
       { "value": 3, "label": "Engineering" }
     ]
   }
   ```

4. **Validation**
   - Tool automatically validates value sequence
   - Set `autoFixValues: true` to automatically renumber
   - Or review suggested values and update manually

5. **Extending Existing Optionsets**
   - Always use next sequential value
   - Never reuse deleted values
   - Never change existing value numbers

## Phase 4: Enhanced Validation Tool

### 4.1 Extend validate-dataverse-best-practices

**File**: `packages/powerplatform/src/index.ts`

**Add new validation rules:**

Update `rules` parameter to accept:
```typescript
rules: z.array(z.enum([
  'prefix',
  'lowercase',
  'lookup',
  'optionset',
  'required-column',
  'entity-icon',
  'web-resource-naming',      // NEW
  'web-resource-solution',    // NEW
  'descriptions',             // NEW
  'datetime-behavior',        // NEW
  'optionset-values'         // NEW
]))
```

**Implementation for new rules:**

1. **web-resource-naming**: Check icon naming convention
   - Query all web resources of type Icon
   - Validate format: "Icon for {display} - {schema}"
   - Report violations with current name and suggested name

2. **web-resource-solution**: Check web resource solution placement
   - Query all web resources
   - Check solution is `{CLIENT}WebResources`
   - Require `POWERPLATFORM_CLIENT_PREFIX` to be set
   - Report web resources in wrong solution

3. **descriptions**: Check description presence
   - Query entities and attributes
   - Filter by `dateFilter` if provided (existing feature)
   - Report entities/attributes missing descriptions
   - Include suggestion to use `suggest-descriptions` tool

4. **datetime-behavior**: Check DateTime field configuration
   - Query all DateTime attributes
   - Check behavior is TimeZoneIndependent
   - Report fields using UserLocal or DateOnly behavior
   - Note: DateOnly behavior is acceptable for date-only fields

5. **optionset-values**: Check global optionset value numbering
   - Query all global optionsets
   - Validate values start at 0 and increment by 1
   - Report optionsets with gaps or non-zero start
   - Suggest corrected value sequence

**Update return format:**
```typescript
{
  "summary": {
    "totalChecks": 9,  // Updated from 6
    "passedChecks": 7,
    "failedChecks": 2,
    "affectedTables": ["sic_customer", "sic_ref_status"]
  },
  "violations": [
    {
      "rule": "web-resource-naming",
      "severity": "warning",
      "count": 3,
      "affectedResources": [
        {
          "name": "sic_icon_customer",
          "displayName": "Customer Icon",
          "suggestedDisplayName": "Icon for Customer - sic_customer"
        }
      ]
    },
    {
      "rule": "descriptions",
      "severity": "warning",
      "count": 5,
      "affectedTables": [
        {
          "schemaName": "sic_customer",
          "missingEntityDescription": true,
          "missingAttributeDescriptions": ["sic_customername", "sic_email"]
        }
      ],
      "suggestion": "Use suggest-descriptions tool to generate descriptions"
    }
  ]
}
```

**Usage example:**
```json
{
  "solution": "RTPICore",
  "publisherPrefix": "sic_",
  "rules": [
    "prefix",
    "lowercase",
    "descriptions",
    "datetime-behavior",
    "web-resource-naming",
    "optionset-values"
  ],
  "dateFilter": "last30days",
  "includeDetails": true
}
```

## Phase 5: Documentation Updates

### 5.1 Update User-Facing Documentation

**File**: `docs/documentation/powerplatform.md`

**Restructure for non-technical users (new section order):**

#### New Structure:

1. **Quick Start** (NEW - First Section)
   - What is this integration?
   - Prerequisites (PowerPlatform environment, Azure AD app)

   **Configuration Examples:**

   **VS Code (settings.json):**
   ```json
   {
     "mcp.servers": {
       "powerplatform": {
         "command": "npx",
         "args": ["@mcp-consultant-tools/powerplatform@latest"],
         "env": {
           "POWERPLATFORM_URL": "https://yourenv.crm.dynamics.com",
           "POWERPLATFORM_CLIENT_ID": "your-client-id",
           "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
           "POWERPLATFORM_TENANT_ID": "your-tenant-id",
           "POWERPLATFORM_CLIENT_PREFIX": "RTPI"
         }
       },
       "powerplatform-customization": {
         "command": "npx",
         "args": ["@mcp-consultant-tools/powerplatform-customization@latest"],
         "env": {
           "POWERPLATFORM_URL": "https://yourenv.crm.dynamics.com",
           "POWERPLATFORM_CLIENT_ID": "your-client-id",
           "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
           "POWERPLATFORM_TENANT_ID": "your-tenant-id",
           "POWERPLATFORM_CLIENT_PREFIX": "RTPI",
           "POWERPLATFORM_ENABLE_CUSTOMIZATION": "true"
         }
       }
     }
   }
   ```

   **Claude Desktop (claude_desktop_config.json):**
   ```json
   {
     "mcpServers": {
       "powerplatform": {
         "command": "npx",
         "args": ["-y", "@mcp-consultant-tools/powerplatform@latest"],
         "env": {
           "POWERPLATFORM_URL": "https://yourenv.crm.dynamics.com",
           "POWERPLATFORM_CLIENT_ID": "your-client-id",
           "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
           "POWERPLATFORM_TENANT_ID": "your-tenant-id",
           "POWERPLATFORM_CLIENT_PREFIX": "RTPI"
         }
       }
     }
   }
   ```

   **First Commands to Try:**
   - List your solutions: `list-solutions`
   - Validate best practices: `validate-dataverse-best-practices` with your solution name

2. **Important Prompts & Workflow Tools** (MOVED UP - Second Section)

   **Audit & Validation:**
   - `validate-dataverse-best-practices` - **Most important prompt**
     ```
     Use the validate-dataverse-best-practices tool to check the "RTPICore"
     solution with publisher prefix "sic_" for all rules. Include complete
     details for all violations.
     ```

     ```
     Use the validate-dataverse-best-practices tool to check the "RTPICore"
     solution for columns created in the last 30 days. Include all returned
     information, including a complete list of affected tables for each check.
     ```

   **Best Practices Guidance:**
   - `powerplatform-customization-best-practices` - Comprehensive guide
   - `table-creation-checklist` - Step-by-step table creation
   - `column-creation-guide` - Column type selection and configuration
   - `web-resource-management-guide` - Web resource and icon best practices
   - `optionset-best-practices` - Global optionset configuration

   **Other Useful Prompts:**
   - `entity-overview` - Entity metadata summary
   - `plugin-deployment-report` - Plugin analysis
   - `app-overview` - Model-driven app structure

3. **Configuration** (Existing - Updated)
   - All environment variables including **NEW**: `POWERPLATFORM_CLIENT_PREFIX`
   - Security flags explanation
   - Multi-environment setup
   - Package split (read-only, customization, data)

4. **Best Practices Automation** (NEW Section)
   - AI-powered description generation workflow
   - Validation warnings vs errors
   - Override patterns (`forceCreate` flag)
   - Client-specific configuration

5. **Common Workflows** (NEW Section)
   - Creating a new table with best practices
   - Adding columns with proper configuration
   - Managing web resources and icons
   - Auditing recent changes
   - Generating missing descriptions

6. **Tool Reference** (Existing - MOVED DOWN)
   - Comprehensive tool listing
   - Organized by category (read-only, customization, data)
   - Full parameter documentation
   - Examples for each tool

**Update tool counts:**
- Read-only package: 38 tools, 11 prompts (update to reflect current count)
- Customization package: 40 → **42 tools** (add create-web-resource, suggest-descriptions)
- Customization package: 2 → **7 prompts** (add 5 new guidance prompts)

**Add new tools to reference section:**
- `create-web-resource` - Full documentation with parameters
- `suggest-descriptions` - Usage examples and workflow

**Update existing tools:**
- `create-entity` - Document description parameter and AI suggestion flow
- `create-attribute` - Document DateTime configuration and description parameters
- `create-global-option-set` - Document value validation and auto-fix

### 5.2 Update Technical Documentation

**File**: `docs/technical/POWERPLATFORM_TECHNICAL.md`

**Add new sections:**

#### AI Description Generation

**Location**: New section after "Best Practices Validation"

**Content:**
- Algorithm for generating descriptions
- Pattern matching approach (schema name parsing)
- Type-based inference (DateTime + "enddate" → date field)
- Context usage (table name, related entities)
- Confidence scoring methodology
- Extensibility (adding new patterns)

**Code examples:**
```typescript
// Example description generation logic
export function generateTableDescription(
  schemaName: string,
  isRefData: boolean
): { suggestion: string; confidence: string; rationale: string } {
  // Parse schema name: sic_customer → "Customer"
  const baseName = schemaName.replace(/^[a-z]+_/, '').replace(/_/g, ' ');

  if (isRefData) {
    return {
      suggestion: `Reference data for ${baseName}`,
      confidence: 'high',
      rationale: 'RefData table pattern detected'
    };
  }

  // Continue with other patterns...
}
```

#### Validation Warning vs Error Patterns

**Location**: New section in "Best Practices Validation"

**Content:**
- When to use errors (blocking): Critical violations (prefix, lowercase, required columns)
- When to use warnings (non-blocking): Style guidelines, recommendations
- Override mechanism (`forceCreate` flag)
- Logging and audit trail for overrides
- User experience considerations

**Example patterns:**
```typescript
// Error (blocking)
if (!entityName.startsWith(publisherPrefix)) {
  return {
    isValid: false,
    issues: [`Entity name must start with publisher prefix: ${publisherPrefix}`],
    warnings: [],
    suggestions: []
  };
}

// Warning (non-blocking)
if (timeZoneBehavior !== 'TimeZoneIndependent') {
  return {
    isValid: true,  // Still valid, but warned
    issues: [],
    warnings: ['TimeZoneIndependent behavior is recommended for consistency'],
    suggestions: ['Set timeZoneBehavior to TimeZoneIndependent']
  };
}
```

#### Client Prefix Configuration Architecture

**Location**: New section in "Configuration"

**Content:**
- Environment variable: `POWERPLATFORM_CLIENT_PREFIX`
- Usage in solution name construction
- Validation at service initialization
- Multi-client deployments (different prefixes per environment)
- Default fallback behavior

**Code example:**
```typescript
const clientPrefix = process.env.POWERPLATFORM_CLIENT_PREFIX;
if (!clientPrefix) {
  throw new Error('POWERPLATFORM_CLIENT_PREFIX must be set for web resource operations');
}

const expectedSolution = `${clientPrefix}WebResources`;
if (solution !== expectedSolution) {
  warnings.push(`Web resources should be in ${expectedSolution} solution`);
}
```

#### Web Resource Management Implementation

**Location**: New section after "Icon Management"

**Content:**
- Web resource creation API calls
- Solution placement validation
- Naming convention enforcement
- Icon-specific logic (display name formatting)
- Base64 content handling
- File upload workflow

### 5.3 Update README.md

**Changes:**

1. **Update tool/prompt counts** in overview table:
   ```markdown
   | Package | Tools | Prompts |
   |---------|-------|---------|
   | powerplatform | 38 | 11 |
   | powerplatform-customization | 42 | 7 |  <!-- Updated from 40, 2 -->
   | powerplatform-data | 3 | 0 |
   ```

2. **Add POWERPLATFORM_CLIENT_PREFIX** to configuration example:
   ```bash
   # PowerPlatform Configuration
   POWERPLATFORM_URL=https://yourenv.crm.dynamics.com
   POWERPLATFORM_CLIENT_ID=your-client-id
   POWERPLATFORM_CLIENT_SECRET=your-client-secret
   POWERPLATFORM_TENANT_ID=your-tenant-id
   POWERPLATFORM_CLIENT_PREFIX=RTPI  # NEW
   ```

3. **Update feature highlights** to mention:
   - AI-powered description generation
   - Best practices automation
   - Client-specific configuration

### 5.4 Update .env.example

**Add:**
```bash
# PowerPlatform client prefix for solution naming (e.g., RTPI, AOP, XYZ)
# Used for constructing solution names like {CLIENT}Core, {CLIENT}WebResources
# Required for web resource operations
POWERPLATFORM_CLIENT_PREFIX=RTPI
```

### 5.5 Update CLAUDE.md

**Changes:**

1. **Update tool/prompt counts** in monorepo section:
   ```markdown
   | Package | Purpose | Tools | Prompts |
   |---------|---------|-------|---------|
   | powerplatform | Read-only access | 38 | 11 |
   | powerplatform-customization | Schema changes | 42 | 7 | <!-- Updated -->
   | powerplatform-data | Data CRUD | 3 | 0 |
   ```

2. **Add brief mention** in PowerPlatform description:
   ```markdown
   - **powerplatform-customization**: Schema changes with AI-powered description
     generation and client-specific best practices validation (42 tools, 7 prompts)
   ```

3. **Verify character count**:
   ```bash
   wc -c CLAUDE.md
   # Must be < 40,000 characters
   ```

   If approaching limit, move details to technical guide instead.

## Phase 6: Testing Checklist

### 6.1 Environment Configuration Tests

- [ ] Set `POWERPLATFORM_CLIENT_PREFIX=RTPI`
- [ ] Verify service initialization uses prefix
- [ ] Test with different prefixes (AOP, XYZ)
- [ ] Test error when prefix not set for web resource operations
- [ ] Verify solution name construction: `{prefix}WebResources`

### 6.2 Description Generation Tests

- [ ] Generate table description for standard table
- [ ] Generate table description for RefData table
- [ ] Generate attribute descriptions for various types
- [ ] Test confidence scoring (high/medium/low)
- [ ] Verify description quality and relevance
- [ ] Test batch description generation
- [ ] Test with missing/incomplete schema names

### 6.3 Validation Warning Tests

- [ ] Trigger web resource naming warning
- [ ] Trigger web resource solution warning
- [ ] Trigger description missing warning
- [ ] Trigger DateTime behavior warning
- [ ] Trigger optionset value warning
- [ ] Verify warnings are non-blocking
- [ ] Test `forceCreate: true` override
- [ ] Verify warning messages are clear and actionable

### 6.4 Tool Enhancement Tests

#### create-entity
- [ ] Create entity without description → receive AI suggestion
- [ ] Create entity with `acceptSuggestedDescription: true`
- [ ] Create entity with custom description
- [ ] Verify description validation

#### create-attribute
- [ ] Create DateTime without `dateOnly` → receive error
- [ ] Create DateTime with `dateOnly: true` (DateOnly)
- [ ] Create DateTime with `dateOnly: false` (DateAndTime)
- [ ] Create DateTime with UserLocal behavior → receive warning
- [ ] Create attribute without description → receive AI suggestion
- [ ] Test all attribute types with description generation

#### create-global-option-set
- [ ] Create optionset with proper values [0,1,2,3] → success
- [ ] Create optionset with gaps [0,2,4] → warning + suggestion
- [ ] Create optionset starting at 1 → warning + suggestion
- [ ] Test `hasDefault: true` with value 0
- [ ] Test `autoFixValues: true` automatic renumbering

#### create-web-resource (new)
- [ ] Create icon with proper naming → success
- [ ] Create icon with improper naming → warning
- [ ] Create web resource with uppercase name → warning
- [ ] Create web resource in wrong solution → warning
- [ ] Test `forceCreate: true` override
- [ ] Verify auto-formatted icon display name

#### suggest-descriptions (new)
- [ ] Generate descriptions for single entity
- [ ] Generate descriptions for all entities in solution
- [ ] Test `includeAttributes: true/false`
- [ ] Test `onlyMissing: true` filtering
- [ ] Verify suggestion quality

### 6.5 Prompt Tests

- [ ] `powerplatform-customization-best-practices` renders correctly
- [ ] `table-creation-checklist` shows all steps
- [ ] `column-creation-guide` includes DateTime guidance
- [ ] `web-resource-management-guide` includes icon naming
- [ ] `optionset-best-practices` includes value numbering
- [ ] All prompts use proper markdown formatting
- [ ] Examples in prompts are accurate and runnable

### 6.6 Validation Tool Tests

#### validate-dataverse-best-practices (extended)
- [ ] Run with `web-resource-naming` rule
- [ ] Run with `web-resource-solution` rule
- [ ] Run with `descriptions` rule
- [ ] Run with `datetime-behavior` rule
- [ ] Run with `optionset-values` rule
- [ ] Test `dateFilter: "last30days"` with new rules
- [ ] Verify affected resources/tables listed correctly
- [ ] Test with `includeDetails: true/false`
- [ ] Verify summary counts accurate

### 6.7 Documentation Tests

- [ ] VS Code configuration example works
- [ ] Claude Desktop configuration example works
- [ ] Tool counts accurate in all docs
- [ ] Examples in documentation are runnable
- [ ] Links between docs work correctly
- [ ] CLAUDE.md character count < 40,000
- [ ] Non-technical user flow is clear (config → prompts → tools)

### 6.8 Integration Tests

- [ ] End-to-end: Create table with AI description
- [ ] End-to-end: Create DateTime column with proper config
- [ ] End-to-end: Create icon with validation
- [ ] End-to-end: Audit solution, generate descriptions, re-audit
- [ ] Test multiple client prefixes in same codebase
- [ ] Verify audit logging captures warnings and overrides

## Success Criteria

✅ **Core Infrastructure**
- [ ] Client prefix configurable via `POWERPLATFORM_CLIENT_PREFIX`
- [ ] Best practices validator supports warning-level results
- [ ] AI description generator produces quality suggestions
- [ ] Description confidence scoring implemented

✅ **Enhanced Tools**
- [ ] create-entity supports AI description suggestions
- [ ] create-attribute enforces DateTime configuration
- [ ] create-global-option-set validates value numbering
- [ ] create-web-resource validates naming and solution
- [ ] suggest-descriptions generates batch suggestions

✅ **Guidance Prompts**
- [ ] 5 new prompts implemented and documented
- [ ] Prompts provide actionable guidance
- [ ] Examples in prompts are accurate

✅ **Validation**
- [ ] validate-dataverse-best-practices supports 5 new rules
- [ ] Validation returns warnings (non-blocking)
- [ ] Override mechanism works correctly

✅ **Documentation**
- [ ] User-facing docs prioritize non-technical users
- [ ] Configuration examples for VS Code and Claude Desktop
- [ ] Important prompts highlighted first
- [ ] Tool counts accurate across all files
- [ ] CLAUDE.md < 40,000 characters

✅ **Testing**
- [ ] All test cases pass
- [ ] No regressions in existing functionality
- [ ] Performance acceptable for large solutions

## Implementation Priority

### P0 (Must Have - MVP)
1. Client prefix configuration
2. Best practices validator warnings
3. create-entity with description suggestions
4. create-attribute with DateTime configuration
5. validate-dataverse-best-practices new rules
6. Documentation updates (user-facing + .env.example)

### P1 (Should Have - Full Release)
7. AI description generator (smart suggestions)
8. create-global-option-set value validation
9. create-web-resource tool
10. All 5 guidance prompts
11. suggest-descriptions tool
12. Complete testing

### P2 (Nice to Have - Future)
13. Advanced AI description patterns
14. Batch operations for fixes
15. Automated remediation tools
16. Custom validation rules via config

## Files Changed Summary

### New Files
- `packages/powerplatform/src/utils/descriptionGenerator.ts` - AI description generation

### Modified Files
- `packages/powerplatform/src/utils/bestPractices.ts` - New validation methods, warning support
- `packages/powerplatform/src/PowerPlatformService.ts` - Description generation integration
- `packages/powerplatform/src/index.ts` - Extended validate-dataverse-best-practices
- `packages/powerplatform-customization/src/index.ts` - Updated tools, new tools, new prompts
- `.env.example` - Add POWERPLATFORM_CLIENT_PREFIX
- `README.md` - Tool counts, configuration example
- `CLAUDE.md` - Brief overview updates (verify < 40k chars)
- `docs/documentation/powerplatform.md` - Restructure for non-technical users
- `docs/technical/POWERPLATFORM_TECHNICAL.md` - Implementation details

### Total Scope
- **New files**: 1
- **Modified files**: 8
- **New tools**: 2 (create-web-resource, suggest-descriptions)
- **Updated tools**: 3 (create-entity, create-attribute, create-global-option-set)
- **New prompts**: 5 (best-practices, table-checklist, column-guide, web-resource-guide, optionset-guide)
- **New validation rules**: 5 (web-resource-naming, web-resource-solution, descriptions, datetime-behavior, optionset-values)

## Notes & Considerations

1. **AI Description Quality**: Initial implementation uses pattern matching. Could be enhanced with:
   - LLM-based generation (if MCP supports it)
   - Training data from existing good descriptions
   - User feedback loop to improve suggestions

2. **Performance**: Description generation for large solutions may be slow. Consider:
   - Batch processing with progress indicator
   - Caching suggestions
   - Async/streaming results

3. **Backward Compatibility**: All changes are additive (new tools, new parameters optional). No breaking changes.

4. **Client Prefix Flexibility**: Currently string-based. Could enhance with:
   - Validation pattern (alphanumeric only)
   - Per-solution prefix override
   - Prefix registry for multi-client environments

5. **Warning vs Error Philosophy**: Warnings should be actionable and educational. Avoid "warning fatigue" by keeping warnings meaningful.

6. **Documentation Maintenance**: As new best practices emerge, update:
   - Validation rules
   - Prompts
   - Documentation
   - Examples
   Keep synchronized across all locations.

7. **User Adoption**: Non-technical users benefit most from:
   - Clear error messages
   - Actionable prompts
   - Working examples
   - Progressive disclosure (simple → advanced)

## Next Steps After Implementation

1. **Beta Testing**: Release as beta to select clients (RTPI, AOP)
2. **Gather Feedback**: Monitor usage, collect user feedback on AI suggestions
3. **Iterate**: Improve description quality, add patterns
4. **Expand**: Add more validation rules based on discovered patterns
5. **Automate**: Consider auto-fix tools for common violations
6. **Train**: Create video tutorials for non-technical users
7. **Monitor**: Track validation override frequency to identify pain points
