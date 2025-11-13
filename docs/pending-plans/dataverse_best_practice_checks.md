# Best Practices for CRM customisation
Author: Klemens Stelk
Date published 4/11/25

## Publisher - ![Static Badge](https://img.shields.io/badge/Requ._Level:-MUST-red)

<span style="color:red">TODO - add to IT checklist</span> 

- **ALWAYS** use **sic_**  
  - Name: SmartImpactCustomer
  - Prefix: sic_
  - Option Value Prefix: 15,743
  - set contacts details to: unfold below



  <!--⭐️Header⭐️-->
## New Tables - ![Static Badge](https://img.shields.io/badge/Requ._Level:-MUST-red)
- Never use 'Organisational' Ownership (always use 'User or Team') 
- when creating a RefData table, use **sic_ref_** for the schema name
- use all **LOWER** case letters


|                           | Example of naming                  | Explanation             |
|---------------------------|------------------------------------|-------------------------|
| Name                      | Type Of Establishment              |                         |
| Plural Name               | Types Of Establishments            |                         |
| RefData Table Schema Name | sic_<b>ref_</b>typeofestablishment | start the name it: ref_ |
| BAU Table Schema Name     | sic_application                    |                         |

<details>
  <summary style="color: darkgrey; text-decoration: underline;">Explanation/Reasoning</summary>
--> Makes it easy to identify the purpose of the table when interacting with it 'in code' (e.g. via smartConnectorCloud) 
  <br> 
--> Makes it easy to setup and maintain the '{Client} - RBAC' security roles, as the new UI allows you to search for tables with 'ref_' in them 
</details>



<!--⭐️Header⭐️-->
# Columns - ![Static Badge](https://img.shields.io/badge/Requ._Level:-Should-blue)
- do NOT use booleans (unless you are absolutely certain that you must use one)
- DateTime: use 'Time Zone Independent' unless you are dealing with a CRM that will be used in countries with different time zones
  - Example name: Display name: _Start Date_  - Schema Name: _sic_startdate_

|           | Name       | Schema Name   | Explanation                                       |
|-----------|------------|---------------|---------------------------------------------------|
| Lookup    | Contact    | sic_contactid | all lower case, **sic_**{target_table_name}**id** |
| all other | Start Date | sic_startdate | schema name matches field name, all lower case    |




<!--⭐️Header⭐️-->
# Table Status - ![Static Badge](https://img.shields.io/badge/Requ._Level:-Should-blue)

- Do **not** use the **OOTB state & status reason** unless '_deactivation_' or '_status reason transition_' is part of the business process 
- **Default to a global option set** for simplicity and reusability
- Use a **RefData table** **only when needed** — specifically when:
  - Status logic must be **data-driven** or extensible (adding/removing/renaming statuses)
  - Additional **metadata (e.g. portal display name), transitions, or role-based rules** are required.
  - there are many options 
  - different teams use different sets of statuses

<a href="https://smartimpactuk.visualstudio.com/DevOps/_wiki/wikis/DevOps.wiki/4262/CRM-Best-Practice-Status-Column-Design" target="_blank">Detailed list of reasons and explanations</a>



<!--⭐️Header⭐️-->
#'New Table Checklist' - ![Static Badge](https://img.shields.io/badge/Requ._Level:-MUST-red)


Page Owner:  @<Klemens Stelk> 
Last updated on: 2025_02_08

> How to use this: copy the list below into your user story / task, delete lines as you complete them, skip whatever does not apply


- How to reach the old setting: https://rtpidev.crm11.dynamics.com/main.aspx?settingsonly=true
  - add ``/main.aspx?settingsonly=true`` to the end of the url
- ## Creation
  - ### Create new table
    - schema name if Reference data: sic_ref_
    - uncheck all 'table features' that are not required
    - rename the primary columns if required, at least update the schema name to `sic_name` (with a lower case n)
  - ### Add Client Columns
    - as per wireframes
  - ### Add Generic Columns
    - All tables (except reference data tables) should have this column
    - `Updated by process` `This field is updated, each time an automated process updates this record.` `updatedbyprocess` `4000`



  - ### Add Reference Data Columns:
    - `Start Date` `The date this reference data record started being used.` `startdate`
      - Date only - Timezone independent
    - `End Date` `The date this reference data record stopped being used.` `enddate`
      - Date only - Timezone independent
    - `Description` `Useful information about this reference data record.` `description`
      - Multiple lines plain text - 20,000
    - `Code` `Code to identify the record, instead of GUID` `code`
      - Used for clients that do not want to keep GUIDs consistent across environments
  - ### Add Data Migration Columns
    - `externalkey` `Unique identifier from original source system`
    - `externalsystem` `Original source system`
- ## Customisation
  - For SI-Product forms: Copy&Rename them! 
  - Customise the form as required, optionally:
    - rename it: {table name} - Main Form
    - Add/Enable 'Power App Grid Control' (via legacy customisation UI) -> enable coloured option-set statuses [MS link](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/the-power-apps-grid-control)
      - Colours
        - Orange/Amber: ``ffd175``
        - Green: ``8ed483``
        - Red: ``ff8c8c``
        - Grey: ``d1d1d1``
![2025-01-25_06-43-26_am_1737787471013_0.png](/.attachments/2025-01-25_06-43-26_am_1737787471013_0-0f7602fb-f594-446e-b54b-a8b576141245.png)

  - Customise the 'Active records' view - then use XRMToolbox View layout replicator to update all other views
    - column: Name, {relevant columns}, creation on, by, modified on, by, status reason, where relevant: status
      - 'Name' has to be the first column and it has to be set - better UX, allows easy opening as well as opening in a separate tab
  - Using timeline? - reduce selected activity types - preferably less than 10 for better performance
  - Add and icon: 16px .svg as a new webresource - https://thedynamicidentity.com/2021/12/30/how-to-add-icons-to-a-custom-table-in-dynamics-crm/
  - Add table to the MDA and, if required, edit the sitemap
  - Add/update security role
  - Optional steps:
    - Enable & customise the quick-create form
    - Add business rules
    - Add real-time workflows
    - Add flows (no a-sync workflows if possible)
    - Update relationship type (e.g. to parental)
    - add field mappings
- <a href="https://smartimpactuk.visualstudio.com/DevOps/_wiki/wikis/DevOps.wiki/3451/Additional-table-customisation-steps" target="_blank">Additional table customisation steps</a> 
- ## Admin
  - Create a 'Data migration' user story to track deployment of all reference data (and link user stories)

---

# AUTOMATED BEST PRACTICE VALIDATION PLAN

## Objective

Enable an AI agent to quickly and efficiently validate that tables within a specific solution (e.g., "{Client} Core") follow internal best practices for column naming, prefixes, and configuration.

## Validation Scope

### Tables to Check
- All custom entities (tables) within the specified solution
- Filter: Only tables with publisher prefix "sic_"
- Exclude: System entities without custom publisher prefix

### Columns to Check
- Recently created columns (configurable timeframe, e.g., last 30 days)
- Custom columns only (exclude system columns like `modifiedon`, `createdon`, etc.)
- Filter: Only columns with publisher prefix (e.g., `sic_`)

### Validation Rules

1. **Publisher Prefix Check**
   - **Rule**: All custom columns must have publisher prefix "sic_"
   - **Severity**: MUST (Critical)
   - **Check**: `attribute.LogicalName.startsWith('sic_')`

2. **Schema Name Lowercase Check**
   - **Rule**: Schema names (LogicalName) must be all lowercase
   - **Severity**: MUST (Critical)
   - **Check**: `attribute.LogicalName === attribute.LogicalName.toLowerCase()`

3. **Lookup Naming Convention**
   - **Rule**: Lookup columns must end with "id"
   - **Severity**: MUST (Critical)
   - **Check**: If `attribute.AttributeType === 'Lookup'`, then `attribute.LogicalName.endsWith('id')`
   - **Example**: `sic_contactid`, `sic_accountid`

4. **Option Set Scope Check**
   - **Rule**: Option sets (picklists) should be global, not local
   - **Severity**: SHOULD (Warning)
   - **Check**: If `attribute.AttributeType === 'Picklist'`, then `attribute.OptionSet.IsGlobal === true`

5. **Required Column Existence**
   - **Rule**: Non-RefData tables must have `sic_updatedbyprocess` column
   - **Severity**: MUST (Critical)
   - **Check**: Entity must contain attribute with `LogicalName === 'sic_updatedbyprocess'`
   - **Exception**: Skip for RefData tables (schema name starts with `sic_ref_`)

6. **System Column Exclusion**
   - **Rule**: Exclude system columns from validation
   - **Implementation**: Filter out columns without publisher prefix or with known system prefixes
   - **System Columns**: `createdon`, `modifiedon`, `createdby`, `modifiedby`, `ownerid`, `statecode`, `statuscode`, `importsequencenumber`, `overriddencreatedon`, `timezoneruleversionnumber`, `utcconversiontimezonecode`, `versionnumber`

---

## Implementation Approach

### Phase 1: Discover Solution Components

**Objective**: Get all custom entities within the target solution

**Method**:
1. Query solution by unique name
2. Query solution components (componenttype = 1 for Entity)
3. Filter to custom entities with `sic_` prefix

**PowerPlatform Web API Queries Needed**:
```javascript
// Get solution ID
GET /api/data/v9.2/solutions?$filter=uniquename eq '{solutionName}'&$select=solutionid,friendlyname,uniquename

// Get solution components (entities only)
GET /api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq '{solutionId}' and componenttype eq 1&$select=objectid,componenttype

// For each objectid (entity MetadataId), get entity metadata
GET /api/data/v9.2/EntityDefinitions({objectid})?$select=LogicalName,SchemaName,DisplayName
```

**Alternative Simpler Approach**:
- Use existing `get-entity-metadata` tool for each known entity
- Requires manual list of entities to check (less dynamic but simpler)

---

### Phase 2: Get Entity Attributes

**Objective**: For each entity, retrieve all attributes with metadata

**Method**:
1. Use existing MCP tool: `get-entity-attributes`
2. Filter attributes by creation date (recently created)
3. Exclude system attributes

**Filtering Logic**:
```javascript
// Pseudo-code for filtering
attributes.filter(attr => {
  // Exclude system attributes (no publisher prefix)
  if (!attr.LogicalName.startsWith('sic_')) return false;

  // Exclude known system columns
  const systemColumns = ['createdon', 'modifiedon', 'createdby', 'modifiedby', 'ownerid', 'statecode', 'statuscode'];
  if (systemColumns.includes(attr.LogicalName)) return false;

  // Filter by creation date (recently created)
  if (attr.CreatedOn) {
    const createdDate = new Date(attr.CreatedOn);
    const daysAgo = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo > 30) return false; // Configurable threshold
  }

  return true;
});
```

---

### Phase 3: Apply Validation Rules

**Objective**: Check each attribute against validation rules

**Validation Function**:
```javascript
function validateAttribute(attribute, entityMetadata) {
  const violations = [];

  // Rule 1: Publisher Prefix Check
  if (!attribute.LogicalName.startsWith('sic_')) {
    violations.push({
      rule: 'Publisher Prefix',
      severity: 'MUST',
      message: `Column "${attribute.LogicalName}" does not have required prefix "sic_"`,
      currentValue: attribute.LogicalName,
      expectedValue: `sic_${attribute.LogicalName}`
    });
  }

  // Rule 2: Schema Name Lowercase Check
  if (attribute.LogicalName !== attribute.LogicalName.toLowerCase()) {
    violations.push({
      rule: 'Schema Name Lowercase',
      severity: 'MUST',
      message: `Column "${attribute.LogicalName}" contains uppercase letters`,
      currentValue: attribute.LogicalName,
      expectedValue: attribute.LogicalName.toLowerCase()
    });
  }

  // Rule 3: Lookup Naming Convention
  if (attribute.AttributeType === 'Lookup' && !attribute.LogicalName.endsWith('id')) {
    violations.push({
      rule: 'Lookup Naming Convention',
      severity: 'MUST',
      message: `Lookup column "${attribute.LogicalName}" does not end with "id"`,
      currentValue: attribute.LogicalName,
      expectedValue: `${attribute.LogicalName}id`
    });
  }

  // Rule 4: Option Set Scope Check
  if (attribute.AttributeType === 'Picklist' && attribute.OptionSet && !attribute.OptionSet.IsGlobal) {
    violations.push({
      rule: 'Option Set Scope',
      severity: 'SHOULD',
      message: `Option set "${attribute.LogicalName}" is local, should be global`,
      currentValue: 'Local Option Set',
      expectedValue: 'Global Option Set',
      recommendation: 'Convert to global option set for reusability'
    });
  }

  return violations;
}

function validateEntity(entityMetadata, attributes) {
  const violations = [];

  // Rule 5: Required Column Existence (sic_updatedbyprocess)
  // Skip for RefData tables
  if (!entityMetadata.LogicalName.startsWith('sic_ref_')) {
    const hasUpdatedByProcess = attributes.some(attr => attr.LogicalName === 'sic_updatedbyprocess');
    if (!hasUpdatedByProcess) {
      violations.push({
        rule: 'Required Column Existence',
        severity: 'MUST',
        message: `Entity "${entityMetadata.LogicalName}" is missing required column "sic_updatedbyprocess"`,
        currentValue: 'Missing',
        expectedValue: 'Column "sic_updatedbyprocess" of type Text (4000 chars)',
        action: 'Create column with Display Name "Updated by process" and Description "This field is updated, each time an automated process updates this record."'
      });
    }
  }

  return violations;
}
```

---

### Phase 4: Generate Report

**Objective**: Create human-readable markdown report with violations grouped by severity

**Report Structure**:
```markdown
# Dataverse Best Practice Validation Report

**Solution**: {Client} Core
**Generated**: 2025-11-13 10:30 AM
**Entities Checked**: 15
**Attributes Checked**: 127
**Total Violations**: 8

---

## Summary

| Severity | Count |
|----------|-------|
| MUST (Critical) | 5 |
| SHOULD (Warning) | 3 |

---

## Critical Violations (MUST Fix)

### Entity: sic_strikeaction

#### Column: sic_ContactId (Created: 2025-11-10)
- **Rule**: Schema Name Lowercase
- **Issue**: Column "sic_ContactId" contains uppercase letters
- **Current**: `sic_ContactId`
- **Expected**: `sic_contactid`
- **Action**: Rename column to use all lowercase

#### Column: sic_contact (Created: 2025-11-08)
- **Rule**: Lookup Naming Convention
- **Issue**: Lookup column "sic_contact" does not end with "id"
- **Current**: `sic_contact`
- **Expected**: `sic_contactid`
- **Action**: Rename column to add "id" suffix

### Entity: sic_application

#### Missing Required Column
- **Rule**: Required Column Existence
- **Issue**: Entity "sic_application" is missing required column "sic_updatedbyprocess"
- **Action**: Create column with:
  - Display Name: "Updated by process"
  - Schema Name: "sic_updatedbyprocess"
  - Type: Text (4000 characters)
  - Description: "This field is updated, each time an automated process updates this record."

---

## Warnings (SHOULD Fix)

### Entity: sic_strikeaction

#### Column: sic_status (Created: 2025-11-09)
- **Rule**: Option Set Scope
- **Issue**: Option set "sic_status" is local, should be global
- **Current**: Local Option Set
- **Expected**: Global Option Set
- **Recommendation**: Convert to global option set for reusability across entities

---

## Compliant Entities

The following entities have no violations:
- sic_strikeactionperiod (12 columns checked)
- sic_ref_typeofestablishment (8 columns checked)
- sic_ref_sector (6 columns checked)

---

## Excluded from Validation

- System columns: 45
- Columns older than 30 days: 89
- RefData tables (sic_updatedbyprocess check skipped): 3
```

---

## Recommended MCP Tool Implementation

### New Tool: `validate-solution-best-practices`

**Parameters**:
```typescript
{
  solutionUniqueName: string;        // e.g., "MCPTestCore"
  publisherPrefix: string;           // e.g., "sic_"
  recentDaysThreshold?: number;      // Default: 30 days
  includeWarnings?: boolean;         // Default: true
  entityFilter?: string[];           // Optional: Specific entities to check
}
```

**Returns**:
```typescript
{
  summary: {
    entitiesChecked: number;
    attributesChecked: number;
    totalViolations: number;
    criticalViolations: number;
    warnings: number;
  },
  violations: Array<{
    entity: string;
    attribute?: string;
    rule: string;
    severity: 'MUST' | 'SHOULD';
    message: string;
    currentValue: string;
    expectedValue: string;
    action: string;
  }>,
  compliantEntities: string[];
}
```

---

### New Prompt: `validate-solution-best-practices-report`

**Purpose**: Generate formatted markdown report from validation results

**Input**: Results from `validate-solution-best-practices` tool

**Output**: Markdown report as shown in Phase 4

---

## Alternative: Simpler Manual Approach

If implementing new tools is not immediately feasible, an agent can achieve this using existing tools:

### Step-by-Step Manual Validation

1. **Get Entity List** (manual or from documentation)
   ```
   Entities to check: sic_strikeaction, sic_application, sic_strikeactionperiod
   ```

2. **For Each Entity, Get Attributes**
   ```
   Use tool: get-entity-attributes
   Input: entityNamePlural = "sic_strikeactions"
   ```

3. **Agent Analyzes Attributes**
   - Filter to recent columns (check CreatedOn property)
   - Exclude system columns (no prefix or known system names)
   - Apply validation rules manually

4. **Agent Generates Report**
   - Use natural language to format violations
   - Group by severity
   - Provide actionable recommendations

---

## Efficiency Considerations

### For Large Solutions (100+ entities)

**Problem**: Checking every entity is time-consuming

**Solutions**:
1. **Incremental Validation**: Only check entities modified recently
2. **Cached Results**: Store validation results and only re-check changed entities
3. **Parallel Queries**: Use existing MCP tools in parallel for multiple entities
4. **Entity Filtering**: Allow user to specify subset of entities to check

### For Frequent Checks

**Problem**: Running full validation every time is slow

**Solutions**:
1. **Differential Validation**: Compare against previous validation results
2. **Continuous Validation**: Run automatically on solution publish/import
3. **Quick Scan Mode**: Only check critical rules (MUST), skip warnings (SHOULD)

---

## 🎯 RECOMMENDED IMPLEMENTATION: Dedicated Tool

**Decision**: The manual agent approach (using existing tools) was not practical. We need a dedicated tool.

### Tool Design: `validate-dataverse-best-practices`

**Package**: `@mcp-consultant-tools/powerplatform` (read-only, production-safe)

**Design Principles**:
1. **Generic**: Works with any solution, any entity, any environment
2. **Flexible**: Configurable time range, entity filters, rule selection
3. **Efficient**: Single service call, optimized Web API queries
4. **Structured**: Returns raw data for consumption by formatting prompt
5. **Extensible**: Easy to add new validation rules

---

## Tool Specification

### Tool Name
`validate-dataverse-best-practices`

### Parameters

```typescript
{
  // OPTION 1: Query by solution (most common)
  solutionUniqueName?: string;           // e.g., "RTPICore", "MCPTestCore"

  // OPTION 2: Explicit entity list (for spot checks)
  entityLogicalNames?: string[];         // e.g., ["sic_strikeaction", "sic_application"]

  // Filtering options
  publisherPrefix: string;               // e.g., "sic_" (required)
  recentDays?: number;                   // Default: 30 (0 = all columns, regardless of age)
  includeRefDataTables?: boolean;        // Default: true (include sic_ref_* tables)

  // Rule selection (future extensibility)
  rules?: string[];                      // Default: all rules
                                         // Options: ["prefix", "lowercase", "lookup", "optionset", "required-column"]

  // Performance tuning
  maxEntities?: number;                  // Default: unlimited (safety limit for large solutions)
}
```

**Validation**:
- Either `solutionUniqueName` OR `entityLogicalNames` must be provided (mutually exclusive)
- `publisherPrefix` is required
- If neither solution nor entities provided, return error

### Return Type

```typescript
{
  // Metadata
  metadata: {
    generatedAt: string;                // ISO 8601 timestamp
    solutionName?: string;              // Friendly name if solution-based
    solutionUniqueName?: string;        // Unique name if solution-based
    publisherPrefix: string;            // e.g., "sic_"
    recentDays: number;                 // Days threshold used
    executionTimeMs: number;            // Total execution time
  },

  // Summary statistics
  summary: {
    entitiesChecked: number;            // Total entities validated
    attributesChecked: number;          // Total attributes validated
    totalViolations: number;            // All violations
    criticalViolations: number;         // MUST violations
    warnings: number;                   // SHOULD violations
    compliantEntities: number;          // Entities with zero violations
  },

  // Detailed results per entity
  entities: Array<{
    logicalName: string;                // e.g., "sic_strikeaction"
    schemaName: string;                 // e.g., "sic_StrikeAction"
    displayName: string;                // e.g., "Strike Action"
    isRefData: boolean;                 // true if schema starts with sic_ref_

    attributesChecked: number;          // Number of attributes validated
    violations: Array<{
      attributeLogicalName?: string;    // Column name (null for entity-level violations)
      attributeType?: string;           // e.g., "Lookup", "Picklist", "String"
      createdOn?: string;               // ISO 8601 timestamp

      rule: string;                     // e.g., "Publisher Prefix", "Schema Name Lowercase"
      severity: 'MUST' | 'SHOULD';      // Critical or warning
      message: string;                  // Human-readable violation message
      currentValue: string;             // What it is now
      expectedValue: string;            // What it should be
      action: string;                   // Remediation action
      recommendation?: string;          // Optional additional guidance
    }>;

    // Quick compliance check
    isCompliant: boolean;               // true if violations.length === 0
  }>;

  // Statistics for report footer
  statistics: {
    systemColumnsExcluded: number;      // Count of excluded system columns
    oldColumnsExcluded: number;         // Count of columns older than threshold
    refDataTablesSkipped: number;       // Count of RefData tables (for updatedbyprocess check)
  };
}
```

---

## Service Implementation

### File Location
`packages/powerplatform/src/PowerPlatformService.ts`

### Service Method Signature

```typescript
async validateBestPractices(
  solutionUniqueName: string | undefined,
  entityLogicalNames: string[] | undefined,
  publisherPrefix: string,
  recentDays: number = 30,
  includeRefDataTables: boolean = true,
  rules: string[] = ['prefix', 'lowercase', 'lookup', 'optionset', 'required-column'],
  maxEntities: number = 0
): Promise<ValidationResult>
```

### Implementation Steps

#### Step 1: Discover Entities

```typescript
// OPTION 1: Query by solution
if (solutionUniqueName) {
  // Get solution ID
  const solutionResponse = await this.makeRequest(
    `/solutions?$filter=uniquename eq '${solutionUniqueName}'&$select=solutionid,friendlyname,uniquename`
  );

  if (solutionResponse.value.length === 0) {
    throw new Error(`Solution not found: ${solutionUniqueName}`);
  }

  const solution = solutionResponse.value[0];
  const solutionId = solution.solutionid;

  // Get solution components (entities only, componenttype = 1)
  const componentsResponse = await this.makeRequest(
    `/solutioncomponents?$filter=_solutionid_value eq ${solutionId} and componenttype eq 1&$select=objectid`
  );

  // Get entity metadata for each component
  const entities: string[] = [];
  for (const component of componentsResponse.value) {
    const metadataId = component.objectid;

    // Query entity by MetadataId
    const entityResponse = await this.makeRequest(
      `/EntityDefinitions(${metadataId})?$select=LogicalName,SchemaName,DisplayName`
    );

    const logicalName = entityResponse.LogicalName;

    // Filter: Only entities with publisher prefix
    if (logicalName.startsWith(publisherPrefix)) {
      // Filter: Optionally exclude RefData tables
      if (includeRefDataTables || !logicalName.startsWith(`${publisherPrefix}ref_`)) {
        entities.push(logicalName);
      }
    }
  }

  if (maxEntities > 0 && entities.length > maxEntities) {
    entities.splice(maxEntities); // Truncate to limit
  }
}

// OPTION 2: Use explicit entity list
else if (entityLogicalNames) {
  entities = entityLogicalNames.filter(name => name.startsWith(publisherPrefix));
}

else {
  throw new Error('Either solutionUniqueName or entityLogicalNames must be provided');
}
```

#### Step 2: Get Entity Attributes

```typescript
const results: EntityValidationResult[] = [];

for (const entityLogicalName of entities) {
  // Get entity metadata
  const entityMetadata = await this.makeRequest(
    `/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=LogicalName,SchemaName,DisplayName,MetadataId`
  );

  // Get all attributes for entity
  const attributesResponse = await this.makeRequest(
    `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName,AttributeType,DisplayName,CreatedOn,IsValidForCreate,IsValidForRead,IsValidForUpdate,IsCustomAttribute,AttributeTypeName`
  );

  const attributes = attributesResponse.value;

  // Apply filtering
  const filteredAttributes = attributes.filter(attr => {
    // Rule: Must have publisher prefix
    if (!attr.LogicalName.startsWith(publisherPrefix)) {
      return false; // Exclude system columns
    }

    // Rule: Must be custom attribute (additional safety)
    if (!attr.IsCustomAttribute) {
      return false;
    }

    // Rule: Must be within time threshold
    if (recentDays > 0 && attr.CreatedOn) {
      const createdDate = new Date(attr.CreatedOn);
      const daysAgo = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysAgo > recentDays) {
        return false; // Too old
      }
    }

    return true;
  });

  // Validate each attribute
  const violations = await this.validateEntityAttributes(
    entityMetadata,
    filteredAttributes,
    publisherPrefix,
    rules
  );

  results.push({
    logicalName: entityMetadata.LogicalName,
    schemaName: entityMetadata.SchemaName,
    displayName: entityMetadata.DisplayName?.UserLocalizedLabel?.Label || entityMetadata.LogicalName,
    isRefData: entityMetadata.LogicalName.startsWith(`${publisherPrefix}ref_`),
    attributesChecked: filteredAttributes.length,
    violations: violations,
    isCompliant: violations.length === 0
  });
}
```

#### Step 3: Apply Validation Rules

```typescript
private async validateEntityAttributes(
  entityMetadata: any,
  attributes: any[],
  publisherPrefix: string,
  rules: string[]
): Promise<Violation[]> {
  const violations: Violation[] = [];

  // RULE 1: Publisher Prefix Check
  if (rules.includes('prefix')) {
    for (const attr of attributes) {
      if (!attr.LogicalName.startsWith(publisherPrefix)) {
        violations.push({
          attributeLogicalName: attr.LogicalName,
          attributeType: attr.AttributeTypeName?.Value || attr.AttributeType,
          createdOn: attr.CreatedOn,
          rule: 'Publisher Prefix',
          severity: 'MUST',
          message: `Column "${attr.LogicalName}" does not have required prefix "${publisherPrefix}"`,
          currentValue: attr.LogicalName,
          expectedValue: `${publisherPrefix}${attr.LogicalName}`,
          action: `Rename column to add "${publisherPrefix}" prefix`
        });
      }
    }
  }

  // RULE 2: Schema Name Lowercase Check
  if (rules.includes('lowercase')) {
    for (const attr of attributes) {
      if (attr.LogicalName !== attr.LogicalName.toLowerCase()) {
        violations.push({
          attributeLogicalName: attr.LogicalName,
          attributeType: attr.AttributeTypeName?.Value || attr.AttributeType,
          createdOn: attr.CreatedOn,
          rule: 'Schema Name Lowercase',
          severity: 'MUST',
          message: `Column "${attr.LogicalName}" contains uppercase letters`,
          currentValue: attr.LogicalName,
          expectedValue: attr.LogicalName.toLowerCase(),
          action: `Rename column to use all lowercase: ${attr.LogicalName.toLowerCase()}`
        });
      }
    }
  }

  // RULE 3: Lookup Naming Convention
  if (rules.includes('lookup')) {
    for (const attr of attributes) {
      // Check if it's a Lookup type
      const isLookup = attr.AttributeType === 'Lookup' ||
                       attr.AttributeTypeName?.Value === 'LookupType';

      if (isLookup && !attr.LogicalName.endsWith('id')) {
        violations.push({
          attributeLogicalName: attr.LogicalName,
          attributeType: 'Lookup',
          createdOn: attr.CreatedOn,
          rule: 'Lookup Naming Convention',
          severity: 'MUST',
          message: `Lookup column "${attr.LogicalName}" does not end with "id"`,
          currentValue: attr.LogicalName,
          expectedValue: `${attr.LogicalName}id`,
          action: `Rename column to add "id" suffix: ${attr.LogicalName}id`
        });
      }
    }
  }

  // RULE 4: Option Set Scope Check
  if (rules.includes('optionset')) {
    for (const attr of attributes) {
      // Check if it's a Picklist type
      const isPicklist = attr.AttributeType === 'Picklist' ||
                        attr.AttributeTypeName?.Value === 'PicklistType';

      if (isPicklist) {
        // Need to get full attribute details to check OptionSet.IsGlobal
        const attrDetails = await this.makeRequest(
          `/EntityDefinitions(LogicalName='${entityMetadata.LogicalName}')/Attributes(LogicalName='${attr.LogicalName}')?$select=LogicalName&$expand=OptionSet($select=IsGlobal)`
        );

        if (attrDetails.OptionSet && !attrDetails.OptionSet.IsGlobal) {
          violations.push({
            attributeLogicalName: attr.LogicalName,
            attributeType: 'Picklist',
            createdOn: attr.CreatedOn,
            rule: 'Option Set Scope',
            severity: 'SHOULD',
            message: `Option set "${attr.LogicalName}" is local, should be global`,
            currentValue: 'Local Option Set',
            expectedValue: 'Global Option Set',
            action: 'Convert to global option set for reusability',
            recommendation: 'Use global option sets to enable reuse across entities and reduce maintenance'
          });
        }
      }
    }
  }

  // RULE 5: Required Column Existence (sic_updatedbyprocess)
  if (rules.includes('required-column')) {
    // Skip for RefData tables
    if (!entityMetadata.LogicalName.startsWith(`${publisherPrefix}ref_`)) {
      const hasUpdatedByProcess = attributes.some(
        attr => attr.LogicalName === `${publisherPrefix}updatedbyprocess`
      );

      if (!hasUpdatedByProcess) {
        violations.push({
          attributeLogicalName: null, // Entity-level violation
          rule: 'Required Column Existence',
          severity: 'MUST',
          message: `Entity "${entityMetadata.LogicalName}" is missing required column "${publisherPrefix}updatedbyprocess"`,
          currentValue: 'Missing',
          expectedValue: `Column "${publisherPrefix}updatedbyprocess" of type Text (4000 chars)`,
          action: `Create column with Display Name "Updated by process", Schema Name "${publisherPrefix}updatedbyprocess", Type: Text (4000 chars), Description: "This field is updated, each time an automated process updates this record."`
        });
      }
    }
  }

  return violations;
}
```

#### Step 4: Build Response

```typescript
// Calculate summary statistics
const summary = {
  entitiesChecked: results.length,
  attributesChecked: results.reduce((sum, e) => sum + e.attributesChecked, 0),
  totalViolations: results.reduce((sum, e) => sum + e.violations.length, 0),
  criticalViolations: results.reduce((sum, e) =>
    sum + e.violations.filter(v => v.severity === 'MUST').length, 0
  ),
  warnings: results.reduce((sum, e) =>
    sum + e.violations.filter(v => v.severity === 'SHOULD').length, 0
  ),
  compliantEntities: results.filter(e => e.isCompliant).length
};

// Build final result
return {
  metadata: {
    generatedAt: new Date().toISOString(),
    solutionName: solution?.friendlyname,
    solutionUniqueName: solutionUniqueName,
    publisherPrefix,
    recentDays,
    executionTimeMs: timer()
  },
  summary,
  entities: results,
  statistics: {
    systemColumnsExcluded: statisticsCounters.systemColumns,
    oldColumnsExcluded: statisticsCounters.oldColumns,
    refDataTablesSkipped: results.filter(e => e.isRefData).length
  }
};
```

---

## Tool Registration

### File Location
`packages/powerplatform/src/index.ts`

### Tool Registration

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ... existing tools

      {
        name: "validate-dataverse-best-practices",
        description: "Validate Dataverse entities against internal best practices for column naming, prefixes, and configuration. Checks schema name casing, lookup naming conventions, option set scope, required columns, and publisher prefix compliance. Supports solution-based validation or explicit entity list with configurable time range filtering.",
        inputSchema: {
          type: "object",
          properties: {
            solutionUniqueName: {
              type: "string",
              description: "Solution unique name to validate (e.g., 'RTPICore', 'MCPTestCore'). Mutually exclusive with entityLogicalNames."
            },
            entityLogicalNames: {
              type: "array",
              items: { type: "string" },
              description: "Explicit list of entity logical names to validate (e.g., ['sic_strikeaction', 'sic_application']). Mutually exclusive with solutionUniqueName."
            },
            publisherPrefix: {
              type: "string",
              description: "Publisher prefix to validate against (e.g., 'sic_'). Required."
            },
            recentDays: {
              type: "number",
              description: "Only validate columns created in the last N days. Set to 0 to validate all columns regardless of age. Default: 30.",
              default: 30
            },
            includeRefDataTables: {
              type: "boolean",
              description: "Include RefData tables (schema starts with prefix + 'ref_') in validation. Default: true.",
              default: true
            },
            rules: {
              type: "array",
              items: {
                type: "string",
                enum: ["prefix", "lowercase", "lookup", "optionset", "required-column"]
              },
              description: "Specific rules to validate. Default: all rules."
            },
            maxEntities: {
              type: "number",
              description: "Maximum number of entities to validate (safety limit). Default: 0 (unlimited).",
              default: 0
            }
          },
          required: ["publisherPrefix"]
        }
      }
    ]
  };
});

// Tool handler
if (request.params.name === "validate-dataverse-best-practices") {
  const service = getPowerPlatformService();

  const solutionUniqueName = request.params.arguments?.solutionUniqueName;
  const entityLogicalNames = request.params.arguments?.entityLogicalNames;
  const publisherPrefix = request.params.arguments?.publisherPrefix;
  const recentDays = request.params.arguments?.recentDays ?? 30;
  const includeRefDataTables = request.params.arguments?.includeRefDataTables ?? true;
  const rules = request.params.arguments?.rules ?? ['prefix', 'lowercase', 'lookup', 'optionset', 'required-column'];
  const maxEntities = request.params.arguments?.maxEntities ?? 0;

  // Validate input
  if (!solutionUniqueName && !entityLogicalNames) {
    throw new Error('Either solutionUniqueName or entityLogicalNames must be provided');
  }

  if (solutionUniqueName && entityLogicalNames) {
    throw new Error('solutionUniqueName and entityLogicalNames are mutually exclusive');
  }

  const result = await service.validateBestPractices(
    solutionUniqueName,
    entityLogicalNames,
    publisherPrefix,
    recentDays,
    includeRefDataTables,
    rules,
    maxEntities
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}
```

---

## Formatting Prompt

### Prompt Name
`dataverse-best-practices-report`

### Purpose
Generate human-readable markdown report from validation results

### Implementation

```typescript
{
  name: "dataverse-best-practices-report",
  description: "Generate formatted markdown report from Dataverse best practice validation results. Groups violations by severity, provides actionable recommendations, and highlights compliant entities.",
  arguments: [
    {
      name: "validationResult",
      description: "JSON result from validate-dataverse-best-practices tool",
      required: true
    }
  ]
}
```

### Prompt Template

```markdown
# Dataverse Best Practice Validation Report

**Solution**: {{solutionName}} ({{solutionUniqueName}})
**Generated**: {{generatedAt}}
**Publisher Prefix**: {{publisherPrefix}}
**Time Filter**: Columns created in last {{recentDays}} days

---

## Summary

| Metric | Count |
|--------|-------|
| Entities Checked | {{entitiesChecked}} |
| Attributes Checked | {{attributesChecked}} |
| **Total Violations** | **{{totalViolations}}** |
| Critical (MUST) | {{criticalViolations}} |
| Warnings (SHOULD) | {{warnings}} |
| Compliant Entities | {{compliantEntities}} |

**Overall Status**: {{#if totalViolations > 0}}⚠️ Issues Found{{else}}✅ All Compliant{{/if}}

---

{{#if criticalViolations > 0}}
## 🔴 Critical Violations (MUST Fix)

{{#each entities}}
{{#if hasViolations}}
### Entity: {{displayName}} (`{{logicalName}}`)

{{#each violations}}
{{#if isCritical}}
#### {{#if attributeLogicalName}}Column: {{attributeLogicalName}}{{else}}Entity-Level Issue{{/if}} {{#if createdOn}}(Created: {{createdOn}}){{/if}}

- **Rule**: {{rule}}
- **Issue**: {{message}}
- **Current**: `{{currentValue}}`
- **Expected**: `{{expectedValue}}`
- **Action**: {{action}}
{{#if recommendation}}- **Recommendation**: {{recommendation}}{{/if}}

{{/if}}
{{/each}}
{{/if}}
{{/each}}
{{/if}}

{{#if warnings > 0}}
---

## ⚠️ Warnings (SHOULD Fix)

{{#each entities}}
{{#if hasViolations}}
### Entity: {{displayName}} (`{{logicalName}}`)

{{#each violations}}
{{#if isWarning}}
#### {{#if attributeLogicalName}}Column: {{attributeLogicalName}}{{else}}Entity-Level Issue{{/if}} {{#if createdOn}}(Created: {{createdOn}}){{/if}}

- **Rule**: {{rule}}
- **Issue**: {{message}}
- **Current**: `{{currentValue}}`
- **Expected**: `{{expectedValue}}`
- **Recommendation**: {{recommendation || action}}

{{/if}}
{{/each}}
{{/if}}
{{/each}}
{{/if}}

---

## ✅ Compliant Entities

{{#if compliantEntities > 0}}
The following entities have no violations:

{{#each entities}}
{{#if isCompliant}}
- **{{displayName}}** (`{{logicalName}}`) - {{attributesChecked}} columns checked{{#if isRefData}} (RefData table){{/if}}
{{/if}}
{{/each}}
{{else}}
No fully compliant entities found.
{{/if}}

---

## Exclusions

- System columns excluded: {{systemColumnsExcluded}}
- Columns older than {{recentDays}} days: {{oldColumnsExcluded}}
- RefData tables (updatedbyprocess check skipped): {{refDataTablesSkipped}}

---

**Execution Time**: {{executionTimeMs}}ms
```

---

## Usage Examples

### Example 1: Validate Entire Solution (Most Common)

**User Request:**
> "Check if tables in 'RTPI Core' solution follow best practices for columns created in the last 30 days"

**Agent Action:**
```json
// Call tool
{
  "tool": "validate-dataverse-best-practices",
  "arguments": {
    "solutionUniqueName": "RTPICore",
    "publisherPrefix": "sic_",
    "recentDays": 30
  }
}

// Returns structured result
{
  "metadata": { ... },
  "summary": {
    "entitiesChecked": 8,
    "attributesChecked": 47,
    "totalViolations": 5,
    "criticalViolations": 3,
    "warnings": 2
  },
  "entities": [ ... ]
}

// Then call prompt for formatted report
{
  "prompt": "dataverse-best-practices-report",
  "arguments": {
    "validationResult": "<json from above>"
  }
}
```

**Result:** Human-readable markdown report with all violations grouped by severity.

---

### Example 2: Validate Specific Entities (Spot Check)

**User Request:**
> "Check if sic_strikeaction and sic_application tables follow naming conventions"

**Agent Action:**
```json
{
  "tool": "validate-dataverse-best-practices",
  "arguments": {
    "entityLogicalNames": ["sic_strikeaction", "sic_application"],
    "publisherPrefix": "sic_",
    "recentDays": 0  // All columns, regardless of age
  }
}
```

---

### Example 3: Only Check Critical Rules (Quick Scan)

**User Request:**
> "Quick check: Are all column names lowercase in RTPI Core?"

**Agent Action:**
```json
{
  "tool": "validate-dataverse-best-practices",
  "arguments": {
    "solutionUniqueName": "RTPICore",
    "publisherPrefix": "sic_",
    "recentDays": 30,
    "rules": ["lowercase"]  // Only check this one rule
  }
}
```

---

### Example 4: Validate Very Recent Changes

**User Request:**
> "Check tables modified in the last 7 days for best practice violations"

**Agent Action:**
```json
{
  "tool": "validate-dataverse-best-practices",
  "arguments": {
    "solutionUniqueName": "RTPICore",
    "publisherPrefix": "sic_",
    "recentDays": 7  // Only last week
  }
}
```

---

### Example 5: Large Solution with Safety Limit

**User Request:**
> "Check Client Core solution but limit to 20 entities for performance"

**Agent Action:**
```json
{
  "tool": "validate-dataverse-best-practices",
  "arguments": {
    "solutionUniqueName": "ClientCore",
    "publisherPrefix": "sic_",
    "recentDays": 30,
    "maxEntities": 20  // Stop after 20 entities
  }
}
```

---

### Example 6: Exclude RefData Tables

**User Request:**
> "Check only BAU tables (not RefData) for missing updatedbyprocess column"

**Agent Action:**
```json
{
  "tool": "validate-dataverse-best-practices",
  "arguments": {
    "solutionUniqueName": "RTPICore",
    "publisherPrefix": "sic_",
    "recentDays": 0,
    "includeRefDataTables": false,  // Exclude sic_ref_* tables
    "rules": ["required-column"]  // Only check updatedbyprocess
  }
}
```

---

## Testing Strategy

### Test Cases

1. **Test: Valid Entity (All Compliant)**
   - Entity: `sic_compliantentity`
   - Columns: All lowercase, correct prefixes, lookups end with "id"
   - Has `sic_updatedbyprocess` column
   - Expected: 0 violations

2. **Test: Invalid Entity (Multiple Violations)**
   - Entity: `sic_badentity`
   - Column: `sic_ContactId` (uppercase)
   - Column: `sic_contact` (lookup without "id")
   - Column: `sic_status` (local option set)
   - Missing: `sic_updatedbyprocess`
   - Expected: 4 violations (3 MUST, 1 SHOULD)

3. **Test: RefData Entity (Skip updatedbyprocess check)**
   - Entity: `sic_ref_status`
   - Missing: `sic_updatedbyprocess`
   - Expected: 0 violations (rule skipped for RefData)

4. **Test: System Columns Excluded**
   - Entity: `sic_testentity`
   - Columns: `createdon`, `modifiedon`, `ownerid` (no prefix)
   - Expected: 0 violations (system columns excluded)

5. **Test: Date Filtering (Recent Columns Only)**
   - Entity: `sic_oldentity`
   - Column: `sic_oldColumn` (Created: 2024-01-01)
   - Column: `sic_newColumn` (Created: 2025-11-01)
   - Expected: Only `sic_newColumn` is validated

---

## Success Criteria

### Functional Requirements
✅ Agent can validate entities in a specific solution
✅ Agent checks all 5 validation rules
✅ Agent excludes system columns
✅ Agent filters by creation date (recently created)
✅ Agent generates human-readable report with violations
✅ Report groups violations by severity (MUST vs SHOULD)
✅ Report provides actionable recommendations

### Performance Requirements
✅ Validation completes in <2 minutes for 20 entities
✅ Agent provides progress updates for long-running checks
✅ Agent handles API rate limits gracefully

### Usability Requirements
✅ User can specify solution name
✅ User can configure "recent" threshold (days)
✅ User can filter to specific entities
✅ Report is clear and actionable for developers

---

## Future Enhancements

1. **Auto-Remediation**: Agent suggests PowerPlatform Web API calls to fix violations
2. **Rule Customization**: Allow users to define custom validation rules
3. **Historical Tracking**: Store validation results over time, show trends
4. **Integration with ADO**: Create ADO work items for violations
5. **Pre-Commit Validation**: Run before solution export to prevent bad commits
6. **Dashboard**: Web UI showing solution health scores

---

## 📋 Implementation Summary

### ✅ What This Plan Provides

**Tool Design**: `validate-dataverse-best-practices`
- **Generic**: Works with any solution or entity list
- **Flexible Time Filtering**: `recentDays` parameter (0 = all, 30 = last 30 days)
- **Rule Selection**: Choose which rules to validate
- **Comprehensive Output**: Structured JSON with all violation details
- **Formatted Reporting**: Paired with `dataverse-best-practices-report` prompt

**Validation Rules**:
1. ✅ Publisher prefix check (`sic_`)
2. ✅ Schema name lowercase
3. ✅ Lookup naming convention (ends with `id`)
4. ✅ Option set scope (prefer global)
5. ✅ Required column existence (`sic_updatedbyprocess`)
6. ✅ System column exclusion

**Two Usage Modes**:
1. **Solution-based**: `solutionUniqueName` - validate entire solution
2. **Entity-based**: `entityLogicalNames` - spot-check specific entities

---

## 🚀 Next Steps

### Step 1: Implement Service Method
**File**: `packages/powerplatform/src/PowerPlatformService.ts`

```typescript
async validateBestPractices(
  solutionUniqueName: string | undefined,
  entityLogicalNames: string[] | undefined,
  publisherPrefix: string,
  recentDays: number = 30,
  includeRefDataTables: boolean = true,
  rules: string[] = ['prefix', 'lowercase', 'lookup', 'optionset', 'required-column'],
  maxEntities: number = 0
): Promise<ValidationResult>
```

**Implementation**: Follow Step 1-4 in "Service Implementation" section above

---

### Step 2: Register Tool
**File**: `packages/powerplatform/src/index.ts`

Add tool registration to `ListToolsRequestSchema` handler and implement tool handler (see "Tool Registration" section above)

---

### Step 3: Create Formatting Prompt
**File**: `packages/powerplatform/src/index.ts`

Add prompt registration to `ListPromptsRequestSchema` handler and implement prompt handler (see "Formatting Prompt" section above)

---

### Step 4: Test with Real Data

**Test Case 1**: Validate solution with known violations
```json
{
  "solutionUniqueName": "RTPICore",
  "publisherPrefix": "sic_",
  "recentDays": 30
}
```

**Expected**: Should find violations and return structured results

**Test Case 2**: Validate compliant entity
```json
{
  "entityLogicalNames": ["sic_compliantentity"],
  "publisherPrefix": "sic_",
  "recentDays": 0
}
```

**Expected**: Should return zero violations

**Test Case 3**: Time filtering
```json
{
  "solutionUniqueName": "RTPICore",
  "publisherPrefix": "sic_",
  "recentDays": 7  // Only last week
}
```

**Expected**: Should only validate columns created in last 7 days

---

## 🎯 Success Criteria

**Functional**:
- ✅ Tool works with solution name or entity list
- ✅ Time filtering works correctly (recentDays parameter)
- ✅ All 5 validation rules implemented
- ✅ System columns properly excluded
- ✅ RefData tables handled correctly (skip updatedbyprocess check)
- ✅ Formatted prompt generates readable report

**Performance**:
- ✅ Completes in <2 minutes for 20 entities
- ✅ Single service call (no multiple tool chaining)
- ✅ Optimized Web API queries with $select

**Usability**:
- ✅ Clear error messages for invalid input
- ✅ Actionable violation messages
- ✅ Easy to understand report format

---

## 🔑 Key Design Decisions

**Why dedicated tool over manual approach?**
- Manual approach (using existing tools) didn't work for the agent
- Single tool call is more efficient than chaining multiple tools
- Optimized queries reduce API calls and execution time
- Structured output enables consistent reporting

**Why two modes (solution vs entities)?**
- Solution mode: Most common use case (validate entire solution)
- Entity mode: Quick spot checks without solution context
- Flexibility for different workflows

**Why configurable time filtering?**
- Focus on recent changes (most relevant)
- Reduce noise from old, stable columns
- Performance optimization for large solutions
- `recentDays=0` allows "validate everything" mode

**Why separate tool and prompt?**
- Tool returns raw structured data (JSON)
- Prompt formats data into human-readable markdown
- Enables alternative report formats in future
- Follows MCP tool/prompt pattern established in codebase

---

## 💡 Pro Tips

**For Large Solutions**:
- Use `maxEntities` parameter to limit validation scope
- Start with `recentDays=7` to focus on very recent changes
- Use `rules` parameter to check only specific rules

**For CI/CD Integration**:
- Run validation after solution export
- Fail build if critical violations found
- Store results for historical tracking

**For Team Workflows**:
- Run validation before creating PRs
- Share reports in ADO work items
- Use as PR review checklist

---

## 📚 Related Documentation

**PowerPlatform Best Practices** (lines 1-135):
- Publisher prefix: `sic_`
- Schema naming conventions
- RefData table patterns
- Required columns checklist

**Existing MCP Tools**:
- `get-entity-metadata` - Get entity schema
- `get-entity-attributes` - Get column definitions
- `get-global-option-set` - Check option set scope

**Web API References**:
- Entity Definitions: `/api/data/v9.2/EntityDefinitions`
- Attributes: `/api/data/v9.2/EntityDefinitions(...)/Attributes`
- Solutions: `/api/data/v9.2/solutions`
- Solution Components: `/api/data/v9.2/solutioncomponents`

---

## ✅ Conclusion

This plan provides a complete, production-ready specification for a dedicated best practice validation tool. The tool is:

- **Generic** - works with any solution, any entities
- **Flexible** - configurable time ranges and rules
- **Efficient** - single optimized service call
- **Actionable** - clear violation messages with remediation steps

**Implementation effort**: 1-2 days for complete tool + prompt + testing

**Value**: Automated validation saves hours of manual checking and ensures consistent code quality across the team.