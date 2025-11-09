# Tool and Prompt Reference

Complete reference for all tools and prompts provided by the MCP Consultant Tools.

## Table of Contents

- [PowerPlatform Tools](#powerplatform-tools)
- [Azure DevOps Tools](#azure-devops-tools)
- [Figma Tools](#figma-tools)
- [Application Insights Tools](#application-insights-tools)
- [Azure Log Analytics Workspace Tools](#azure-log-analytics-workspace-tools)
- [Azure SQL Database Tools](#azure-sql-database-tools)
- [MCP Prompts](#mcp-prompts)

## PowerPlatform Tools

### Entity Metadata & Data Tools

#### get-entity-metadata

Get comprehensive metadata about a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity (e.g., "account", "contact")

**Returns:**
- Entity definition including primary key, display name, description
- Collection status (online/offline)
- Primary identifier and name attributes
- Ownership type

**Example:**
```javascript
await mcpClient.invoke("get-entity-metadata", {
  entityName: "account"
});
```

---

#### get-entity-attributes

Get all attributes/fields of a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Array of all attributes with:
  - Logical name
  - Display name
  - Data type
  - Required/optional status
  - Format information
  - Valid values for option sets

**Example:**
```javascript
await mcpClient.invoke("get-entity-attributes", {
  entityName: "account"
});
```

---

#### get-entity-attribute

Get details for a specific attribute/field of a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `attributeName` (string, required): Logical name of the attribute

**Returns:**
- Detailed attribute information:
  - Data type and format
  - Min/max values or lengths
  - Option set values (if applicable)
  - Lookup target entities
  - Searchability and requirement status

**Example:**
```javascript
await mcpClient.invoke("get-entity-attribute", {
  entityName: "account",
  attributeName: "revenue"
});
```

---

#### get-entity-relationships

Get all relationships for a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- One-to-Many relationships
- Many-to-Many relationships
- Relationship schema names
- Referenced/referencing entity names
- Lookup attribute names

**Example:**
```javascript
await mcpClient.invoke("get-entity-relationships", {
  entityName: "account"
});
```

---

#### get-global-option-set

Get a global option set definition.

**Parameters:**
- `optionSetName` (string, required): Name of the global option set

**Returns:**
- Option set name
- Display name
- All options with values and labels

**Example:**
```javascript
await mcpClient.invoke("get-global-option-set", {
  optionSetName: "industrycode"
});
```

---

#### get-record

Get a specific record by entity name and ID.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `recordId` (string, required): GUID of the record
- `selectAttributes` (string, optional): Comma-separated list of attributes to retrieve

**Returns:**
- Record data with all or selected attributes

**Example:**
```javascript
await mcpClient.invoke("get-record", {
  entityName: "account",
  recordId: "00000000-0000-0000-0000-000000000000",
  selectAttributes: "name,revenue,industrycode"
});
```

---

#### query-records

Query records using OData filter expression.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `filter` (string, optional): OData $filter expression
- `select` (string, optional): Comma-separated list of attributes
- `orderby` (string, optional): Ordering expression
- `top` (number, optional): Maximum number of records to return

**Returns:**
- Array of matching records
- Total count

**Example:**
```javascript
await mcpClient.invoke("query-records", {
  entityName: "account",
  filter: "revenue gt 1000000 and statecode eq 0",
  select: "name,revenue,industrycode",
  orderby: "revenue desc",
  top: 50
});
```

---

### Plugin Registration & Validation Tools

#### get-plugin-assemblies

List all plugin assemblies in the environment.

**Parameters:**
- `includeManaged` (boolean, optional, default: false): Include managed plugin assemblies

**Returns:**
- Total count
- Array of assemblies with:
  - Assembly name
  - Version
  - Isolation mode (Sandbox/None)
  - Modified date and modifier
  - Culture and public key token

**Example:**
```javascript
await mcpClient.invoke("get-plugin-assemblies", {
  includeManaged: false
});
```

---

#### get-plugin-assembly-complete

Get comprehensive plugin assembly information with automatic validation.

**Parameters:**
- `assemblyName` (string, required): Name of the plugin assembly
- `includeDisabled` (boolean, optional, default: false): Include disabled steps

**Returns:**
- Assembly metadata
- All plugin types (classes)
- All registered steps with:
  - Stage, mode, rank
  - Filtering attributes
  - Pre/Post images with attributes
  - SDK message and entity
- **Automatic validation warnings:**
  - Missing filtering attributes
  - Missing images
  - Disabled steps

**Example:**
```javascript
await mcpClient.invoke("get-plugin-assembly-complete", {
  assemblyName: "MyCompany.Plugins",
  includeDisabled: false
});
```

---

#### get-entity-plugin-pipeline

Get all plugins that execute on a specific entity, organized by message and execution order.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `messageFilter` (string, optional): Filter by SDK message (e.g., "Update", "Create", "Delete")

**Returns:**
- Plugins organized by:
  - SDK message type
  - Execution stage
  - Execution rank
- For each step:
  - Assembly name and version
  - Plugin type name
  - Mode (Sync/Async)
  - Filtering attributes
  - Pre/Post images

**Example:**
```javascript
await mcpClient.invoke("get-entity-plugin-pipeline", {
  entityName: "account",
  messageFilter: "Update"
});
```

---

#### get-plugin-trace-logs

Query plugin execution trace logs with filtering and exception parsing.

**Parameters:**
- `entityName` (string, optional): Filter by entity logical name
- `messageName` (string, optional): Filter by SDK message name
- `correlationId` (string, optional): Filter by correlation ID
- `exceptionOnly` (boolean, optional, default: false): Only return logs with exceptions
- `hoursBack` (number, optional, default: 24): How many hours back to search
- `maxRecords` (number, optional, default: 50): Maximum records to return

**Returns:**
- Array of trace logs with:
  - Execution timestamp
  - Entity and message names
  - Performance metrics
  - Parsed exception details:
    - Exception type
    - Message
    - Stack trace
  - Correlation ID

**Example:**
```javascript
await mcpClient.invoke("get-plugin-trace-logs", {
  entityName: "account",
  exceptionOnly: true,
  hoursBack: 24,
  maxRecords: 50
});
```

---

### Workflow & Power Automate Flow Tools

#### get-flows

List all Power Automate cloud flows (category = 5).

**Parameters:**
- `activeOnly` (boolean, optional, default: false): Only return activated flows

**Returns:**
- Array of flows with:
  - Flow name and ID
  - State (Draft/Activated/Suspended)
  - Owner and modifier
  - Primary entity
  - Trigger type
  - Modified date

**Example:**
```javascript
await mcpClient.invoke("get-flows", {
  activeOnly: true
});
```

---

#### get-flow-definition

Get complete flow definition including JSON logic from clientdata field.

**Parameters:**
- `flowName` (string, required): Name of the flow

**Returns:**
- Flow metadata:
  - Name, ID, state
  - Owner and modifier
  - Primary entity
- Complete flow definition (JSON):
  - Triggers
  - Actions
  - Conditions
  - Connections

**Example:**
```javascript
await mcpClient.invoke("get-flow-definition", {
  flowName: "Lead Notification Flow"
});
```

---

#### get-flow-runs

Get flow run history with status, duration, and error details.

**Parameters:**
- `flowName` (string, required): Name of the flow
- `maxRecords` (number, optional, default: 100): Maximum number of runs to return

**Returns:**
- Array of flow runs with:
  - Run ID and timestamp
  - Status (Succeeded/Failed/Running/TimedOut/Cancelled/Faulted)
  - Start time, end time, duration
  - Trigger type
  - Error message and code (if failed)
  - Parsed JSON error details

**Example:**
```javascript
await mcpClient.invoke("get-flow-runs", {
  flowName: "Lead Notification Flow",
  maxRecords: 50
});
```

---

#### get-workflows

List all classic Dynamics workflows (category = 0).

**Parameters:**
- `activeOnly` (boolean, optional, default: false): Only return activated workflows

**Returns:**
- Array of workflows with:
  - Workflow name and ID
  - State (Draft/Activated/Suspended)
  - Mode (Background/Real-time)
  - Trigger events (Create/Update/Delete)
  - Primary entity
  - Owner and modifier

**Example:**
```javascript
await mcpClient.invoke("get-workflows", {
  activeOnly: true
});
```

---

#### get-workflow-definition

Get complete workflow definition including XAML and trigger configuration.

**Parameters:**
- `workflowName` (string, required): Name of the workflow

**Returns:**
- Workflow metadata:
  - Name, ID, state
  - Mode (Background/Real-time)
  - Trigger events
  - Primary entity
- Complete XAML definition
- Trigger attributes
- Filtering attributes

**Example:**
```javascript
await mcpClient.invoke("get-workflow-definition", {
  workflowName: "Account Update Workflow"
});
```

---

### PowerPlatform Customization Tools (Write Operations)

**IMPORTANT:** All customization tools require `POWERPLATFORM_ENABLE_CUSTOMIZATION=true` and make permanent changes to your CRM environment.

---

#### create-entity

Create a new custom entity (table) in PowerPlatform.

**Parameters:**
- `schemaName` (string, required): Entity schema name (e.g., "sic_application")
- `displayName` (string, required): Display name
- `pluralDisplayName` (string, required): Plural display name
- `description` (string, optional): Entity description
- `ownershipType` (string, required): UserOwned, TeamOwned, or OrganizationOwned
- `hasActivities` (boolean, optional): Enable activities (default: false)
- `hasNotes` (boolean, optional): Enable notes (default: false)
- `isActivityParty` (boolean, optional): Can be activity party (default: false)
- `primaryAttributeSchemaName` (string, optional): Primary attribute name (default: "name")
- `primaryAttributeDisplayName` (string, optional): Primary attribute display name (default: "Name")
- `primaryAttributeMaxLength` (number, optional): Primary attribute max length (default: 850)
- `solutionUniqueName` (string, optional): Solution to add entity to

**Default Settings:**
- Activities: Disabled
- Notes: Disabled
- Duplicate detection: Disabled
- Mail merge: Disabled
- Primary column max length: 850 characters

**Returns:**
- Created entity metadata including MetadataId

**Example:**
```javascript
await mcpClient.invoke("create-entity", {
  schemaName: "sic_application",
  displayName: "Application",
  pluralDisplayName: "Applications",
  description: "Custom application entity",
  ownershipType: "UserOwned",
  hasActivities: true,
  hasNotes: true,
  solutionUniqueName: "MySolution"
});
```

**Note:** Remember to publish customizations after creation.

---

#### update-entity

Update existing entity metadata.

**Parameters:**
- `metadataId` (string, required): Entity MetadataId (GUID)
- `displayName` (string, optional): New display name
- `pluralDisplayName` (string, optional): New plural display name
- `description` (string, optional): New description
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("update-entity", {
  metadataId: "12345678-1234-1234-1234-123456789012",
  displayName: "Updated Application",
  description: "Updated description"
});
```

---

#### update-entity-icon

Set or update entity icon using Fluent UI System Icons from Microsoft's official icon library.

**Parameters:**
- `entityLogicalName` (string, required): The logical name of the entity (e.g., 'sic_strikeaction')
- `iconFileName` (string, required): Fluent UI icon file name (e.g., 'people_community_24_filled.svg')
- `solutionUniqueName` (string, optional): Solution to add the web resource to

**Returns:**
- Entity details with web resource information
- Web resource ID and name
- Icon vector name

**Example:**
```javascript
await mcpClient.invoke("update-entity-icon", {
  entityLogicalName: "sic_strikeaction",
  iconFileName: "people_community_24_filled.svg",
  solutionUniqueName: "MCPTestCore"
});
```

**Icon Suggestions:**
- **Strike Action**: `people_community_24_filled.svg` (group/collective action)
- **Calendar/Period**: `calendar_24_filled.svg` (date ranges)
- **Contact**: `person_24_filled.svg` (individual person)
- **Account**: `building_24_filled.svg` (organization)
- **Alert/Case**: `alert_24_filled.svg` (alerts/warnings)

**Browse icons:** https://github.com/microsoft/fluentui-system-icons

**Note:** You must publish customizations after updating icons for changes to appear in the UI.

---

#### delete-entity

Delete a custom entity.

**Parameters:**
- `metadataId` (string, required): Entity MetadataId (GUID)

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("delete-entity", {
  metadataId: "12345678-1234-1234-1234-123456789012"
});
```

**Warning:** This permanently deletes the entity and all its data. Check dependencies first.

---

#### create-attribute

Create a new attribute (column) on an entity. Supports 10 user-creatable attribute types.

**⚠️ IMPORTANT LIMITATIONS:**
1. **Local option sets are NOT SUPPORTED** - All Picklist/MultiSelectPicklist attributes MUST use global option sets
2. **Customer-type attributes CANNOT be created via SDK** - This is a Microsoft platform limitation. Use a standard Lookup to Account or Contact instead, or create manually via Power Apps maker portal

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `attributeType` (string, required): One of: String, Memo, Integer, Decimal, Money, DateTime, Boolean, Picklist, Lookup, Customer, MultiSelectPicklist, AutoNumber
- `schemaName` (string, required): Attribute schema name
- `displayName` (string, required): Display name
- `description` (string, optional): Description
- `isRequired` (string, optional): "None", "ApplicationRequired", or "SystemRequired"
- Type-specific parameters (see below)
- `solutionUniqueName` (string, optional): Solution to add attribute to

**Type-Specific Parameters:**

**String:**
- `maxLength` (number, required): Max length (1-4000)
- `format` (string, optional): "Email", "Text", "TextArea", "Url", "TickerSymbol", "PhoneticGuide", "VersionNumber", "Phone"

**Memo:**
- `maxLength` (number, required): Max length (1-1048576)

**Integer:**
- `minValue` (number, optional): Minimum value
- `maxValue` (number, optional): Maximum value

**Decimal:**
- `precision` (number, required): Total digits (1-10)
- `minValue` (number, optional): Minimum value
- `maxValue` (number, optional): Maximum value

**Money:**
- `precision` (number, required): Decimal places (0-4)
- `minValue` (number, optional): Minimum value
- `maxValue` (number, optional): Maximum value

**DateTime:**
- `dateTimeBehavior` (string, required): "UserLocal", "DateOnly", or "TimeZoneIndependent"
- `format` (string, optional): "DateOnly" or "DateAndTime"

**Boolean:**
- `defaultValue` (boolean, optional): Default value

**Picklist:**
- `globalOptionSetName` (string, optional): Name of existing global option set to reference
- `optionSetOptions` (array, optional): Options to create a NEW global option set automatically
  - **Simple format (RECOMMENDED)**: Array of strings - values auto-numbered 0, 1, 2, etc.
  - **Advanced format**: Array of {value: number, label: string} for custom values

**IMPORTANT:** All option sets are created as GLOBAL for consistency and reusability. Local option sets are NOT supported. Provide either `globalOptionSetName` (to use existing) OR `optionSetOptions` (to create new).

**Lookup:**
- `referencedEntity` (string, required): Target entity logical name

**Customer:**
- ⚠️ **NOT SUPPORTED VIA SDK** - Customer-type attributes cannot be created programmatically due to Microsoft API limitations
- **Workarounds:**
  1. Create manually via Power Apps maker portal
  2. Use a standard Lookup to Account or Contact instead
  3. Create separate lookup fields for each target entity (Account and Contact)

**MultiSelectPicklist:**
- `globalOptionSetName` (string, optional): Name of existing global option set to reference
- `optionSetOptions` (array, optional): Options to create a NEW global option set automatically
  - **Simple format (RECOMMENDED)**: Array of strings - values auto-numbered 0, 1, 2, etc.
  - **Advanced format**: Array of {value: number, label: string} for custom values

**Returns:**
- Created attribute metadata

**Example - String:**
```javascript
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "account",
  attributeType: "String",
  schemaName: "sic_customfield",
  displayName: "Custom Field",
  description: "A custom text field",
  maxLength: 100,
  solutionUniqueName: "MySolution"
});
```

**Example - Picklist (Use Existing Global Option Set):**
```javascript
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "account",
  attributeType: "Picklist",
  schemaName: "sic_status",
  displayName: "Status",
  globalOptionSetName: "sic_status"  // Reference existing global option set
});
```

**Example - Picklist (Create New Global Option Set - Simple):**
```javascript
// Simple format with auto-numbering from 0
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "account",
  attributeType: "Picklist",
  schemaName: "sic_priority",
  displayName: "Priority",
  optionSetOptions: ["Low", "Medium", "High", "Critical"]  // Values: 0, 1, 2, 3
  // Global option set named "sic_priority" will be created automatically
});
```

**Example - Picklist (Create New Global Option Set - Custom Values):**
```javascript
// Advanced format with custom values
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "account",
  attributeType: "Picklist",
  schemaName: "sic_customstatus",
  displayName: "Custom Status",
  optionSetOptions: [
    {value: 100, label: "Active"},
    {value: 200, label: "Inactive"},
    {value: 300, label: "Pending"}
  ]
  // Global option set named "sic_customstatus" will be created automatically
});
```

**Example - Lookup:**
```javascript
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "sic_application",
  attributeType: "Lookup",
  schemaName: "sic_parentaccount",
  displayName: "Parent Account",
  referencedEntity: "account"
});
```

---

#### update-attribute

Update existing attribute metadata. **Supports converting String attributes to AutoNumber type** by setting the `autoNumberFormat` parameter.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `attributeLogicalName` (string, required): Attribute logical name
- `displayName` (string, optional): New display name
- `description` (string, optional): New description
- `requiredLevel` (string, optional): Required level ("None", "Recommended", "ApplicationRequired")
- `autoNumberFormat` (string, optional): Auto-number format to convert String attribute to AutoNumber (see format details below)
- `solutionUniqueName` (string, optional): Solution context

**AutoNumber Format Placeholders:**
- `{SEQNUM:n}` - Sequential number with minimum length n (grows as needed)
- `{RANDSTRING:n}` - Random alphanumeric string (length 1-6 ONLY - API limitation)
- `{DATETIMEUTC:format}` - UTC timestamp with .NET DateTime format

**Examples:**
```javascript
// Convert primary name field to AutoNumber
await mcpClient.invoke("update-attribute", {
  entityLogicalName: "sic_strikeactionperiod",
  attributeLogicalName: "sic_name",
  autoNumberFormat: "SAP-{SEQNUM:5}",
  solutionUniqueName: "MCPTestCore"
});
// Result: SAP-00001, SAP-00002, SAP-00003...

// Complex format with date and random string
await mcpClient.invoke("update-attribute", {
  entityLogicalName: "incident",
  attributeLogicalName: "ticketnumber",
  autoNumberFormat: "CASE-{DATETIMEUTC:yyyyMMdd}-{SEQNUM:4}-{RANDSTRING:4}"
});
// Result: CASE-20250115-0001-A7K2, CASE-20250115-0002-B9M4...
```

**⚠️ IMPORTANT NOTES:**
- Converting to AutoNumber is **irreversible** - you cannot convert back to a regular String
- Existing values in the field will remain, but new records will use auto-generated values
- RANDSTRING length must be 1-6 (Dataverse API limitation)

**Returns:**
- Success confirmation with format details

---

#### delete-attribute

Delete an attribute from an entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `attributeMetadataId` (string, required): Attribute MetadataId (GUID)

**Returns:**
- Success confirmation

**Warning:** This permanently deletes the attribute and all its data.

---

#### create-global-optionset-attribute

Create a picklist attribute that uses a global option set.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `schemaName` (string, required): Attribute schema name
- `displayName` (string, required): Display name
- `globalOptionSetName` (string, required): Global option set name
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created attribute metadata

**Example:**
```javascript
await mcpClient.invoke("create-global-optionset-attribute", {
  entityLogicalName: "account",
  schemaName: "sic_industry",
  displayName: "Industry",
  globalOptionSetName: "sic_industrycodes"
});
```

---

#### create-one-to-many-relationship

Create a one-to-many (1:N) relationship between entities.

**Parameters:**
- `schemaName` (string, required): Relationship schema name
- `referencedEntity` (string, required): Parent entity (1 side)
- `referencingEntity` (string, required): Child entity (N side)
- `lookupAttributeSchemaName` (string, required): Lookup field name on child entity
- `lookupAttributeDisplayName` (string, required): Lookup field display name
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created relationship metadata

**Example:**
```javascript
await mcpClient.invoke("create-one-to-many-relationship", {
  schemaName: "sic_account_application",
  referencedEntity: "account",
  referencingEntity: "sic_application",
  lookupAttributeSchemaName: "sic_parentaccount",
  lookupAttributeDisplayName: "Parent Account"
});
```

---

#### create-many-to-many-relationship

Create a many-to-many (N:N) relationship between entities.

**Parameters:**
- `schemaName` (string, required): Relationship schema name
- `entity1LogicalName` (string, required): First entity
- `entity2LogicalName` (string, required): Second entity
- `entity1NavigationPropertyName` (string, optional): Navigation property name
- `entity2NavigationPropertyName` (string, optional): Navigation property name
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created relationship metadata

**Example:**
```javascript
await mcpClient.invoke("create-many-to-many-relationship", {
  schemaName: "sic_application_contact",
  entity1LogicalName: "sic_application",
  entity2LogicalName: "contact"
});
```

---

#### update-relationship

Update relationship metadata (labels only - most properties are immutable).

**Parameters:**
- `metadataId` (string, required): Relationship MetadataId (GUID)
- `displayName` (string, optional): New display name

**Returns:**
- Success confirmation

---

#### delete-relationship

Delete a relationship.

**Parameters:**
- `metadataId` (string, required): Relationship MetadataId (GUID)

**Returns:**
- Success confirmation

---

#### update-global-optionset

Update global option set metadata.

**Parameters:**
- `metadataId` (string, required): Option set MetadataId (GUID)
- `displayName` (string, optional): New display name
- `description` (string, optional): New description
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

---

#### add-optionset-value

Add a new value to a global option set.

**Parameters:**
- `optionSetName` (string, required): Option set name
- `value` (number, required): Numeric value
- `label` (string, required): Display label
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Created option metadata

**Example:**
```javascript
await mcpClient.invoke("add-optionset-value", {
  optionSetName: "sic_industrycodes",
  value: 100000,
  label: "Technology"
});
```

---

#### update-optionset-value

Update an existing option set value label.

**Parameters:**
- `optionSetName` (string, required): Option set name
- `value` (number, required): Value to update
- `label` (string, required): New label
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

---

#### delete-optionset-value

Delete a value from an option set.

**Parameters:**
- `optionSetName` (string, required): Option set name
- `value` (number, required): Value to delete

**Returns:**
- Success confirmation

**Warning:** Removes the value from all records using it.

---

#### reorder-optionset-values

Reorder option set values to change their display order.

**Parameters:**
- `optionSetName` (string, required): Option set name
- `values` (array, required): Array of values in desired order
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("reorder-optionset-values", {
  optionSetName: "sic_priority",
  values: [3, 1, 2]  // High, Medium, Low
});
```

---

#### create-form

Create a new form for an entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `name` (string, required): Form name
- `formType` (number, required): Form type code (2=Main, 7=QuickCreate, 6=QuickView, 11=Card)
- `formXml` (string, required): Form XML definition
- `description` (string, optional): Form description
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created form ID

**Example:**
```javascript
await mcpClient.invoke("create-form", {
  entityLogicalName: "account",
  name: "Custom Main Form",
  formType: 2,
  formXml: "<form>...</form>"
});
```

---

#### update-form

Update existing form XML and metadata.

**Parameters:**
- `formId` (string, required): Form ID (GUID)
- `name` (string, optional): New form name
- `formXml` (string, optional): New form XML
- `description` (string, optional): New description
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

---

#### delete-form

Delete a form.

**Parameters:**
- `formId` (string, required): Form ID (GUID)

**Returns:**
- Success confirmation

---

#### activate-form

Activate a form to make it available for use.

**Parameters:**
- `formId` (string, required): Form ID (GUID)

**Returns:**
- Success confirmation

---

#### deactivate-form

Deactivate a form to hide it from users.

**Parameters:**
- `formId` (string, required): Form ID (GUID)

**Returns:**
- Success confirmation

---

#### get-forms

Get all forms for an entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name

**Returns:**
- Array of forms with metadata

**Example:**
```javascript
await mcpClient.invoke("get-forms", {
  entityLogicalName: "account"
});
```

---

#### create-view

Create a new view (saved query) with FetchXML.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `name` (string, required): View name
- `fetchXml` (string, required): FetchXML query
- `layoutXml` (string, required): Layout XML (columns)
- `queryType` (number, required): View type (0=Public, 64=Lookup)
- `description` (string, optional): View description
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created view ID

**Example:**
```javascript
await mcpClient.invoke("create-view", {
  entityLogicalName: "account",
  name: "Active Accounts",
  fetchXml: "<fetch><entity name='account'><filter><condition attribute='statecode' operator='eq' value='0'/></filter></entity></fetch>",
  layoutXml: "<grid><row><cell name='name'/><cell name='revenue'/></row></grid>",
  queryType: 0
});
```

---

#### update-view

Update existing view query and layout.

**Parameters:**
- `viewId` (string, required): View ID (GUID)
- `name` (string, optional): New view name
- `fetchXml` (string, optional): New FetchXML
- `layoutXml` (string, optional): New layout XML
- `description` (string, optional): New description
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

---

#### delete-view

Delete a view.

**Parameters:**
- `viewId` (string, required): View ID (GUID)

**Returns:**
- Success confirmation

---

#### set-default-view

Set a view as the default view for its entity.

**Parameters:**
- `viewId` (string, required): View ID (GUID)

**Returns:**
- Success confirmation

---

#### get-view-fetchxml

Get the FetchXML from a specific view.

**Parameters:**
- `viewId` (string, required): View ID (GUID)

**Returns:**
- View metadata including FetchXML

---

#### get-views

Get all views for an entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name

**Returns:**
- Array of views with metadata

---

#### get-business-rules

Get all business rules in the environment (read-only for troubleshooting).

**Parameters:**
- `activeOnly` (boolean, optional): Only return activated business rules (default: false)
- `maxRecords` (number, optional): Maximum number of business rules to return (default: 100)

**Returns:**
- List of business rules with basic information

**Note:** Business rules are read-only in this MCP server. Use the PowerPlatform UI to create or modify business rules.

---

#### get-business-rule

Get the complete definition of a specific business rule including its XAML (read-only for troubleshooting).

**Parameters:**
- `workflowId` (string, required): Business rule ID (GUID)

**Returns:**
- Complete business rule information including XAML definition

**Note:** Business rules are read-only in this MCP server. Use the PowerPlatform UI to create or modify business rules.

---

### Model-Driven App Tools

#### get-apps

Get all model-driven apps in the PowerPlatform environment.

**Parameters:**
- `activeOnly` (boolean, optional): Only return active apps (default: false)
- `maxRecords` (number, optional): Maximum number of apps to return (default: 100)

**Returns:**
- List of model-driven apps with:
  - App ID, name, unique name
  - Description and URL
  - State (Active/Inactive)
  - Publisher information
  - Published timestamp

**Example:**
```javascript
await mcpClient.invoke("get-apps", {
  activeOnly: true,
  maxRecords: 50
});
```

---

#### get-app

Get detailed information about a specific model-driven app.

**Parameters:**
- `appId` (string, required): App ID (GUID)

**Returns:**
- Complete app information including:
  - Basic properties (name, unique name, description)
  - Navigation type (single/multi session)
  - Featured and default status
  - Publisher details
  - Created/modified timestamps

**Example:**
```javascript
await mcpClient.invoke("get-app", {
  appId: "12345678-1234-1234-1234-123456789abc"
});
```

---

#### get-app-components

Get all components (entities, forms, views, sitemaps) in a model-driven app.

**Parameters:**
- `appId` (string, required): App ID (GUID)

**Returns:**
- List of all components with:
  - Component ID and type
  - Grouped by type (Entity, Form, View, SiteMap, etc.)
  - Creation and modification timestamps

**Example:**
```javascript
await mcpClient.invoke("get-app-components", {
  appId: "12345678-1234-1234-1234-123456789abc"
});
```

---

#### get-app-sitemap

Get the sitemap (navigation) configuration for a model-driven app.

**Parameters:**
- `appId` (string, required): App ID (GUID)

**Returns:**
- Sitemap information including:
  - Sitemap name and ID
  - Sitemap XML structure
  - Configuration options (collapsible groups, show home, pinned, recents)
  - Managed status

**Example:**
```javascript
await mcpClient.invoke("get-app-sitemap", {
  appId: "12345678-1234-1234-1234-123456789abc"
});
```

---

#### ~~create-app~~ (REMOVED - API Bug)

**Status:** ❌ Removed due to Dataverse API bug

**Issue:** This tool has been removed because the Dataverse API consistently creates orphaned solution components without creating the actual app module record. See [CREATE_APP_API_BUG_REPORT.md](CREATE_APP_API_BUG_REPORT.md) for details.

**Workaround:** Create apps manually via Power Apps maker portal, then use the other MDA tools (add-entities-to-app, validate-app, publish-app) with the app ID.

---

#### add-entities-to-app

Add entities to a model-driven app (automatically adds them to navigation).

**Parameters:**
- `appId` (string, required): App ID (GUID)
- `entityNames` (array of strings, required): Entity logical names to add (e.g., ["account", "contact"])

**Returns:**
- List of entities added
- Success message

**Example:**
```javascript
await mcpClient.invoke("add-entities-to-app", {
  appId: "12345678-1234-1234-1234-123456789abc",
  entityNames: ["account", "contact", "opportunity"]
});
```

**Important Notes:**
- Entities are validated before adding
- After adding entities, run validate-app
- Then publish-app to make changes live

---

#### validate-app

Validate a model-driven app before publishing (checks for missing components and configuration issues).

**Parameters:**
- `appId` (string, required): App ID (GUID)

**Returns:**
- Validation success status
- List of validation issues (if any)
- Issue details (error type, message, component ID)

**Example:**
```javascript
await mcpClient.invoke("validate-app", {
  appId: "12345678-1234-1234-1234-123456789abc"
});
```

**Common Issues:**
- Missing sitemap
- Entities without forms or views
- Invalid component references

---

#### publish-app

Publish a model-driven app to make it available to users (automatically validates first).

**Parameters:**
- `appId` (string, required): App ID (GUID)

**Returns:**
- Success message
- Published app ID

**Example:**
```javascript
await mcpClient.invoke("publish-app", {
  appId: "12345678-1234-1234-1234-123456789abc"
});
```

**Important Notes:**
- App must pass validation before publishing
- Users need appropriate security roles to access the app
- Publishing makes changes visible to all users

---

### Web Resource Tools

#### create-web-resource

Create a new web resource (JavaScript, CSS, HTML, images, etc.).

**Parameters:**
- `name` (string, required): Web resource name (must include prefix, e.g., "prefix_/scripts/file.js")
- `displayName` (string, required): Display name
- `webResourceType` (number, required): Type code (1=HTML, 2=CSS, 3=JS, 4=XML, 5=PNG, 6=JPG, 7=GIF, 8=XAP, 9=XSL, 10=ICO, 11=SVG, 12=RESX)
- `content` (string, required): Base64-encoded content
- `description` (string, optional): Description
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created web resource ID

**Example:**
```javascript
await mcpClient.invoke("create-web-resource", {
  name: "sic_/scripts/myfile.js",
  displayName: "My JavaScript File",
  webResourceType: 3,
  content: "ZnVuY3Rpb24gaGVsbG8oKSB7IGNvbnNvbGUubG9nKCdIZWxsbycpOyB9"  // Base64 of JS code
});
```

---

#### update-web-resource

Update web resource content or metadata.

**Parameters:**
- `webResourceId` (string, required): Web resource ID (GUID)
- `displayName` (string, optional): New display name
- `content` (string, optional): New base64-encoded content
- `description` (string, optional): New description
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

**Note:** Remember to publish after updating.

---

#### delete-web-resource

Delete a web resource.

**Parameters:**
- `webResourceId` (string, required): Web resource ID (GUID)

**Returns:**
- Success confirmation

---

#### get-web-resource

Get web resource by ID.

**Parameters:**
- `webResourceId` (string, required): Web resource ID (GUID)

**Returns:**
- Web resource metadata and content

---

#### get-web-resources

Get web resources by name pattern.

**Parameters:**
- `nameFilter` (string, optional): Name filter (partial match)

**Returns:**
- Array of web resources

**Example:**
```javascript
await mcpClient.invoke("get-web-resources", {
  nameFilter: "sic_/scripts"
});
```

---

#### get-webresource-dependencies

Get dependencies for a web resource.

**Parameters:**
- `webResourceId` (string, required): Web resource ID (GUID)

**Returns:**
- Array of components that depend on this web resource

---

#### create-publisher

Create a new solution publisher.

**Parameters:**
- `uniqueName` (string, required): Publisher unique name
- `friendlyName` (string, required): Publisher friendly name
- `customizationPrefix` (string, required): Customization prefix (e.g., "sic")
- `description` (string, optional): Description

**Returns:**
- Created publisher ID

**Example:**
```javascript
await mcpClient.invoke("create-publisher", {
  uniqueName: "SmartImpactConsulting",
  friendlyName: "Smart Impact Consulting",
  customizationPrefix: "sic",
  description: "Our company publisher"
});
```

---

#### get-publishers

Get all publishers (excluding system publishers).

**Parameters:**
None

**Returns:**
- Array of publishers

---

#### create-solution

Create a new solution.

**Parameters:**
- `uniqueName` (string, required): Solution unique name
- `friendlyName` (string, required): Solution friendly name
- `publisherId` (string, required): Publisher ID (GUID)
- `version` (string, required): Version (e.g., "1.0.0.0")
- `description` (string, optional): Description

**Returns:**
- Created solution ID

**Example:**
```javascript
await mcpClient.invoke("create-solution", {
  uniqueName: "MyCustomSolution",
  friendlyName: "My Custom Solution",
  publisherId: "12345678-1234-1234-1234-123456789012",
  version: "1.0.0.0",
  description: "Custom solution for our app"
});
```

---

#### add-solution-component

Add a component to a solution.

**Parameters:**
- `solutionUniqueName` (string, required): Solution unique name
- `componentId` (string, required): Component ID (GUID)
- `componentType` (number, required): Component type code (1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=View, 29=Workflow, 60=SystemForm, 61=WebResource)
- `addRequiredComponents` (boolean, optional, default: true): Include required components

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("add-solution-component", {
  solutionUniqueName: "MyCustomSolution",
  componentId: "12345678-1234-1234-1234-123456789012",
  componentType: 1,  // Entity
  addRequiredComponents: true
});
```

---

#### remove-solution-component

Remove a component from a solution.

**Parameters:**
- `solutionUniqueName` (string, required): Solution unique name
- `componentId` (string, required): Component ID (GUID)
- `componentType` (number, required): Component type code

**Returns:**
- Success confirmation

---

#### export-solution

Export a solution as a zip file (base64-encoded).

**Parameters:**
- `solutionName` (string, required): Solution unique name
- `managed` (boolean, optional, default: false): Export as managed solution

**Returns:**
- Base64-encoded zip file

**Example:**
```javascript
const result = await mcpClient.invoke("export-solution", {
  solutionName: "MyCustomSolution",
  managed: false
});
// result.ExportSolutionFile contains base64-encoded zip
```

---

#### import-solution

Import a solution from a base64-encoded zip file.

**Parameters:**
- `customizationFile` (string, required): Base64-encoded solution zip
- `publishWorkflows` (boolean, optional, default: true): Activate workflows after import
- `overwriteUnmanagedCustomizations` (boolean, optional, default: false): Overwrite existing customizations

**Returns:**
- Import job ID

**Example:**
```javascript
await mcpClient.invoke("import-solution", {
  customizationFile: "UEsDBBQ...",  // Base64 zip content
  publishWorkflows: true,
  overwriteUnmanagedCustomizations: false
});
```

---

#### publish-customizations

Publish all pending customizations to make them active.

**Parameters:**
None

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("publish-customizations", {});
```

**Note:** This makes all unpublished entity, form, view, and other customizations active in the system.

---

#### publish-entity

Publish customizations for a specific entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("publish-entity", {
  entityLogicalName: "account"
});
```

---

#### check-dependencies

Check what components depend on a specific component.

**Parameters:**
- `componentId` (string, required): Component ID (GUID)
- `componentType` (number, required): Component type code

**Returns:**
- Array of dependent components

**Example:**
```javascript
await mcpClient.invoke("check-dependencies", {
  componentId: "12345678-1234-1234-1234-123456789012",
  componentType: 1  // Entity
});
```

---

#### check-entity-dependencies

Check dependencies for a specific entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name

**Returns:**
- Array of dependent components

---

#### check-delete-eligibility

Check if a component can be safely deleted.

**Parameters:**
- `componentId` (string, required): Component ID (GUID)
- `componentType` (number, required): Component type code

**Returns:**
- `canDelete` (boolean): Whether component can be deleted
- `dependencies` (array): List of blocking dependencies

**Example:**
```javascript
const result = await mcpClient.invoke("check-delete-eligibility", {
  componentId: "12345678-1234-1234-1234-123456789012",
  componentType: 1
});
if (result.canDelete) {
  // Safe to delete
}
```

---

#### get-entity-customization-info

Check if an entity is customizable and its managed state.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name

**Returns:**
- `IsCustomizable`: Whether entity can be customized
- `IsManaged`: Whether entity is managed
- `IsCustomEntity`: Whether entity is custom (not system)

---

#### validate-schema-name

Validate a schema name against naming rules.

**Parameters:**
- `schemaName` (string, required): Schema name to validate
- `prefix` (string, required): Required prefix

**Returns:**
- `valid` (boolean): Whether name is valid
- `errors` (array): List of validation errors

**Example:**
```javascript
const result = await mcpClient.invoke("validate-schema-name", {
  schemaName: "sic_application",
  prefix: "sic_"
});
if (!result.valid) {
  console.log("Errors:", result.errors);
}
```

---

#### preview-unpublished-changes

Preview all unpublished customizations in the environment.

**Parameters:**
None

**Returns:**
- List of components with unpublished changes

---

#### validate-solution-integrity

Validate a solution for missing dependencies and issues.

**Parameters:**
- `solutionUniqueName` (string, required): Solution unique name

**Returns:**
- `isValid` (boolean): Whether solution is valid
- `issues` (array): Missing dependencies
- `warnings` (array): Potential issues

**Example:**
```javascript
const result = await mcpClient.invoke("validate-solution-integrity", {
  solutionUniqueName: "MyCustomSolution"
});
if (!result.isValid) {
  console.log("Issues:", result.issues);
}
```

---

## Azure DevOps Tools

### Wiki Tools

#### get-wikis

List all wikis in an Azure DevOps project.

**Parameters:**
- `project` (string, required): Project name

**Returns:**
- Array of wikis with:
  - Wiki ID and name
  - Wiki type (ProjectWiki/CodeWiki)
  - Repository details
  - Mapped path

**Example:**
```javascript
await mcpClient.invoke("get-wikis", {
  project: "MyProject"
});
```

---

#### search-wiki-pages

Full-text search across wiki pages with highlighting.

**Parameters:**
- `searchText` (string, required): Text to search for
- `project` (string, required): Project name
- `maxResults` (number, optional, default: 25): Maximum results to return

**Returns:**
- Total count
- Array of search results with:
  - Page path (wiki format, ready for get-wiki-page)
  - Git path (original format from API)
  - Wiki ID
  - Project name
  - Content highlights (matching snippets)

**Example:**
```javascript
await mcpClient.invoke("search-wiki-pages", {
  searchText: "authentication",
  project: "MyProject",
  maxResults: 10
});
```

**Note:** The returned `path` field is automatically converted to wiki format and can be used directly with `get-wiki-page`.

---

#### get-wiki-page

Get specific wiki page content and metadata.

**Parameters:**
- `project` (string, required): Project name
- `wikiId` (string, required): Wiki identifier
- `pagePath` (string, required): Page path (wiki format or git format - auto-converts)
- `includeContent` (boolean, optional, default: true): Include page content

**Returns:**
- Page metadata:
  - Path (wiki format)
  - Git path
  - Git item path
- Content (if requested)
- Sub-pages array

**Example:**
```javascript
await mcpClient.invoke("get-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Architecture/API Design",
  includeContent: true
});
```

**Note:** Automatically converts git paths (ending in `.md`) to wiki paths if needed.

---

#### create-wiki-page

Create a new wiki page.

**Parameters:**
- `project` (string, required): Project name
- `wikiId` (string, required): Wiki identifier
- `pagePath` (string, required): Path for the new page (wiki format)
- `content` (string, required): Markdown content for the page

**Returns:**
- Created page metadata

**Requires:** `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`

**Example:**
```javascript
await mcpClient.invoke("create-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Architecture/New Design",
  content: "# New Design\n\nThis is the content..."
});
```

---

#### update-wiki-page

Update an existing wiki page.

**Parameters:**
- `project` (string, required): Project name
- `wikiId` (string, required): Wiki identifier
- `pagePath` (string, required): Page path (wiki format)
- `content` (string, required): New markdown content
- `version` (string, required): Current page version (ETag) for optimistic concurrency

**Returns:**
- Updated page metadata

**Requires:** `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`

**Example:**
```javascript
await mcpClient.invoke("update-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Architecture/API Design",
  content: "# Updated content...",
  version: "current-page-version-etag"
});
```

---

### Work Item Tools

#### get-work-item

Get a work item by ID with full details.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID

**Returns:**
- Work item fields:
  - System fields (ID, Title, State, Type, etc.)
  - Custom fields
  - Area/Iteration paths
  - Assigned To, Created By
  - Dates (Created, Changed, Closed)
  - Tags
- Relations (links to other items)
- URL

**Example:**
```javascript
await mcpClient.invoke("get-work-item", {
  project: "MyProject",
  workItemId: 12345
});
```

---

#### query-work-items

Execute WIQL (Work Item Query Language) queries to find work items.

**Parameters:**
- `project` (string, required): Project name
- `wiql` (string, required): WIQL query

**Returns:**
- Array of work items matching the query
- Total count

**Example:**
```javascript
await mcpClient.invoke("query-work-items", {
  project: "MyProject",
  wiql: "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.State] = 'Active' AND [System.AssignedTo] = @me"
});
```

**Common WIQL patterns:** See [USAGE.md](USAGE.md#wiql-query-language)

---

#### get-work-item-comments

Get discussion comments for a work item.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID

**Returns:**
- Array of comments with:
  - Comment text
  - Author
  - Timestamp
  - Modified date
  - Version

**Example:**
```javascript
await mcpClient.invoke("get-work-item-comments", {
  project: "MyProject",
  workItemId: 12345
});
```

---

#### add-work-item-comment

Add a comment to a work item.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID
- `commentText` (string, required): Comment content

**Returns:**
- Created comment metadata

**Requires:** `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`

**Example:**
```javascript
await mcpClient.invoke("add-work-item-comment", {
  project: "MyProject",
  workItemId: 12345,
  commentText: "Investigation complete. Root cause identified."
});
```

---

#### update-work-item

Update work item fields using JSON Patch operations.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID
- `patchOperations` (array, required): Array of JSON Patch operations

**Returns:**
- Updated work item

**Requires:** `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`

**Example:**
```javascript
await mcpClient.invoke("update-work-item", {
  project: "MyProject",
  workItemId: 12345,
  patchOperations: [
    {
      "op": "add",
      "path": "/fields/System.State",
      "value": "Resolved"
    },
    {
      "op": "add",
      "path": "/fields/System.History",
      "value": "Fixed in PR #456"
    }
  ]
});
```

---

#### create-work-item

Create a new work item.

**Parameters:**
- `project` (string, required): Project name
- `workItemType` (string, required): Type (Bug, Task, User Story, etc.)
- `fields` (object, required): Field values (System.Title is required)

**Returns:**
- Created work item

**Requires:** `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`

**Example:**
```javascript
await mcpClient.invoke("create-work-item", {
  project: "MyProject",
  workItemType: "Bug",
  fields: {
    "System.Title": "Login page shows 404",
    "System.Description": "After deploying v2.3...",
    "System.AssignedTo": "john@company.com",
    "System.Tags": "critical; deployment"
  }
});
```

---

#### delete-work-item

Delete a work item.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID

**Returns:**
- Deletion confirmation

**Requires:** `AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true`

**Example:**
```javascript
await mcpClient.invoke("delete-work-item", {
  project: "MyProject",
  workItemId: 12345
});
```

---

## Figma Tools

#### get-figma-data

Get comprehensive Figma design data including layout, text, styles, and components.

**Parameters:**
- `fileKey` (string, required): Figma file key from URL (alphanumeric string)
- `nodeId` (string, optional): Specific node ID(s) to fetch (format: "1:10" or "1:10;2:20" for multiple)
- `depth` (number, optional): Tree traversal depth limit (prevents token overflow on large files)

**Returns:**
- File metadata (name, last modified)
- Simplified node tree with:
  - Layout properties (position, size, constraints)
  - Text content and typography
  - Visual styles (fills, strokes, effects)
  - Component instances and properties
- Component definitions
- Component sets
- Global style dictionary (deduplicated)

**Example:**
```javascript
// Get entire file
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  depth: 3
});

// Get specific nodes
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  nodeId: "1:10;2:20"
});
```

**Output format:** AI-friendly simplified JSON (not raw Figma API format)

---

#### download-figma-images

Placeholder for future image download functionality.

**Status:** Coming in v2

**Planned features:**
- Download node images as PNG/SVG
- Batch image downloads
- Image processing with Sharp

---

## Application Insights Tools

Query and analyze application telemetry data from Azure Application Insights.

### appinsights-list-resources

List all configured Application Insights resources (active and inactive).

**Parameters:**
- None

**Returns:**
- JSON array of configured resources with id, name, appId, active status, and description

**Example:**
```json
[
  {
    "id": "prod-api",
    "name": "Production API",
    "appId": "12345678-1234-1234-1234-123456789abc",
    "active": true,
    "description": "Production API Application Insights"
  },
  {
    "id": "staging-api",
    "name": "Staging API",
    "appId": "11111111-2222-3333-4444-555555555555",
    "active": false,
    "description": "Staging API (inactive)"
  }
]
```

---

### appinsights-get-metadata

Get schema metadata (tables and columns) for an Application Insights resource.

**Parameters:**
- `resourceId` (string, required): Resource ID (use `appinsights-list-resources` to find IDs)

**Returns:**
- JSON object containing tables with their column schemas

**Example:**
```json
{
  "tables": [
    {
      "name": "requests",
      "columns": [
        {"name": "timestamp", "type": "datetime"},
        {"name": "id", "type": "string"},
        {"name": "name", "type": "string"},
        {"name": "duration", "type": "real"}
      ]
    }
  ]
}
```

---

### appinsights-execute-query

Execute a custom KQL (Kusto Query Language) query against Application Insights.

**Parameters:**
- `resourceId` (string, required): Resource ID
- `query` (string, required): KQL query string
- `timespan` (string, optional): Time range (e.g., 'PT1H' for 1 hour, 'P1D' for 1 day, 'PT12H' for 12 hours)

**Returns:**
- JSON object containing query results with tables, columns, and rows

**Example:**
```typescript
// Query for exceptions in the last hour
{
  "resourceId": "prod-api",
  "query": "exceptions | where timestamp > ago(1h) | take 10 | project timestamp, type, outerMessage",
  "timespan": "PT1H"
}
```

**Common Timespan Formats:**
- `PT15M` - 15 minutes
- `PT1H` - 1 hour
- `PT12H` - 12 hours
- `P1D` - 1 day
- `P7D` - 7 days

---

### appinsights-get-exceptions

Get recent exceptions from Application Insights with timestamps, types, and messages.

**Parameters:**
- `resourceId` (string, required): Resource ID
- `timespan` (string, optional): Time range (default: PT1H)
- `limit` (number, optional): Maximum number of results (default: 50)

**Returns:**
- JSON object with exception data (timestamp, type, outerMessage, innermostMessage, operation_Name, operation_Id, cloud_RoleName)

**Example:**
```typescript
{
  "resourceId": "prod-api",
  "timespan": "PT12H",
  "limit": 100
}
```

---

### appinsights-get-slow-requests

Get slow HTTP requests (above duration threshold) from Application Insights.

**Parameters:**
- `resourceId` (string, required): Resource ID
- `durationThresholdMs` (number, optional): Duration threshold in milliseconds (default: 5000)
- `timespan` (string, optional): Time range (default: PT1H)
- `limit` (number, optional): Maximum number of results (default: 50)

**Returns:**
- JSON object with slow request data (timestamp, name, duration, resultCode, success, operation_Id, cloud_RoleName)

**Example:**
```typescript
{
  "resourceId": "prod-web",
  "durationThresholdMs": 3000,  // 3 seconds
  "timespan": "PT6H",
  "limit": 25
}
```

---

### appinsights-get-operation-performance

Get performance summary by operation (request count, avg duration, percentiles).

**Parameters:**
- `resourceId` (string, required): Resource ID
- `timespan` (string, optional): Time range (default: PT1H)

**Returns:**
- JSON object with performance metrics (RequestCount, AvgDuration, P50Duration, P95Duration, P99Duration, FailureCount) grouped by operation_Name

**Example:**
```typescript
{
  "resourceId": "prod-api",
  "timespan": "P1D"  // Last 24 hours
}
```

**Use Cases:**
- Identify slowest operations
- Monitor performance regression
- Track operation failure rates
- Analyze performance percentiles

---

### appinsights-get-failed-dependencies

Get failed dependency calls (external APIs, databases, etc.) from Application Insights.

**Parameters:**
- `resourceId` (string, required): Resource ID
- `timespan` (string, optional): Time range (default: PT1H)
- `limit` (number, optional): Maximum number of results (default: 50)

**Returns:**
- JSON object with failed dependency data (timestamp, name, target, type, duration, resultCode, operation_Id, cloud_RoleName)

**Example:**
```typescript
{
  "resourceId": "prod-api",
  "timespan": "PT2H",
  "limit": 100
}
```

**Use Cases:**
- Identify external service issues
- Monitor third-party API reliability
- Track database connection failures
- Correlate with operation failures

---

### appinsights-get-traces

Get diagnostic traces/logs from Application Insights filtered by severity level.

**Parameters:**
- `resourceId` (string, required): Resource ID
- `severityLevel` (number, optional): Minimum severity level (default: 2)
  - 0 = Verbose
  - 1 = Information
  - 2 = Warning
  - 3 = Error
  - 4 = Critical
- `timespan` (string, optional): Time range (default: PT1H)
- `limit` (number, optional): Maximum number of results (default: 100)

**Returns:**
- JSON object with trace data (timestamp, message, severityLevel, operation_Name, operation_Id, cloud_RoleName)

**Example:**
```typescript
{
  "resourceId": "prod-api",
  "severityLevel": 3,  // Error level and above
  "timespan": "PT4H",
  "limit": 200
}
```

---

### appinsights-get-availability

Get availability test results and uptime statistics from Application Insights.

**Parameters:**
- `resourceId` (string, required): Resource ID
- `timespan` (string, optional): Time range (default: PT24H)

**Returns:**
- JSON object with availability test summaries (TotalTests, SuccessCount, FailureCount, AvgDuration, SuccessRate) grouped by test name

**Example:**
```typescript
{
  "resourceId": "prod-web",
  "timespan": "P7D"  // Last 7 days
}
```

**Use Cases:**
- Monitor uptime percentage
- Track availability test failures
- Identify geographic issues
- Verify SLA compliance

---

### appinsights-get-custom-events

Get custom application events from Application Insights.

**Parameters:**
- `resourceId` (string, required): Resource ID
- `eventName` (string, optional): Filter by specific event name
- `timespan` (string, optional): Time range (default: PT1H)
- `limit` (number, optional): Maximum number of results (default: 100)

**Returns:**
- JSON object with custom event data (timestamp, name, customDimensions, operation_Id, cloud_RoleName)

**Example:**
```typescript
{
  "resourceId": "prod-api",
  "eventName": "OrderPlaced",
  "timespan": "P1D",
  "limit": 500
}
```

**Use Cases:**
- Track business events
- Monitor feature usage
- Analyze user behavior
- Custom KPI tracking

---

## Azure Log Analytics Workspace Tools

Query and analyze log data from Azure Log Analytics workspaces using KQL (Kusto Query Language). Ideal for troubleshooting Azure Functions, App Services, and other Azure resources.

**Key Features:**
- **KQL query execution** - Run custom KQL queries against Log Analytics workspaces
- **Azure Functions troubleshooting** - Specialized tools for function logs, errors, and performance
- **Multi-workspace support** - Query multiple workspaces with active/inactive flags
- **Generic log querying** - Search and retrieve logs from any table
- **Metadata exploration** - Discover available tables and columns
- **Authentication flexibility** - Supports Entra ID (OAuth) or API keys
- **Shared credentials** - Automatic fallback to Application Insights credentials

### loganalytics-list-workspaces

List all configured Log Analytics workspaces (active and inactive).

**Parameters:** None

**Returns:**
```typescript
{
  workspaces: Array<{
    id: string;
    name: string;
    workspaceId: string;
    active: boolean;
    description?: string;
  }>;
}
```

**Example:**
```json
{
  "workspaces": [
    {
      "id": "prod-functions",
      "name": "Production Functions",
      "workspaceId": "12345678-1234-1234-1234-123456789abc",
      "active": true,
      "description": "Production Azure Functions logs"
    },
    {
      "id": "staging-functions",
      "name": "Staging Functions",
      "workspaceId": "87654321-4321-4321-4321-cba987654321",
      "active": false
    }
  ]
}
```

**Use Cases:**
- View available workspaces
- Check workspace active/inactive status
- Get workspace IDs for queries

### loganalytics-get-metadata

Get schema metadata (tables and columns) for a Log Analytics workspace.

**Parameters:**
- `workspaceId` (required): Workspace identifier from configuration

**Returns:**
```typescript
{
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      description?: string;
    }>;
  }>;
}
```

**Example:**
```json
{
  "tables": [
    {
      "name": "FunctionAppLogs",
      "columns": [
        { "name": "TimeGenerated", "type": "datetime" },
        { "name": "FunctionName", "type": "string" },
        { "name": "Message", "type": "string" },
        { "name": "SeverityLevel", "type": "int" },
        { "name": "ExceptionDetails", "type": "string" }
      ]
    },
    {
      "name": "requests",
      "columns": [
        { "name": "timestamp", "type": "datetime" },
        { "name": "name", "type": "string" },
        { "name": "success", "type": "bool" },
        { "name": "duration", "type": "real" }
      ]
    }
  ]
}
```

**Use Cases:**
- Discover available tables in workspace
- Explore table schemas before querying
- Validate column names for KQL queries
- Understand data types

### loganalytics-execute-query

Execute custom KQL query against a Log Analytics workspace.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `query` (required): KQL query string
- `timespan` (optional): ISO 8601 duration (e.g., "PT1H", "P1D", "PT12H")

**Returns:**
```typescript
{
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string }>;
    rows: any[][];
  }>;
}
```

**Example:**
```typescript
// Query parameters
{
  "workspaceId": "prod-functions",
  "query": "FunctionAppLogs | where FunctionName == 'ProcessOrders' | where SeverityLevel >= 3 | order by TimeGenerated desc | take 10",
  "timespan": "PT24H"
}

// Returns
{
  "tables": [
    {
      "name": "PrimaryResult",
      "columns": [
        { "name": "TimeGenerated", "type": "datetime" },
        { "name": "FunctionName", "type": "string" },
        { "name": "Message", "type": "string" },
        { "name": "SeverityLevel", "type": "int" }
      ],
      "rows": [
        ["2025-01-07T10:30:45Z", "ProcessOrders", "Database connection failed", 3],
        ["2025-01-07T10:25:12Z", "ProcessOrders", "Timeout exception", 4]
      ]
    }
  ]
}
```

**Use Cases:**
- Run custom KQL queries
- Complex log analysis
- Custom aggregations and joins
- Advanced troubleshooting

### loganalytics-get-function-logs

Get logs for a specific Azure Function with optional filtering.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (optional): Filter by function name
- `timespan` (optional): ISO 8601 duration (default: "PT1H")
- `severityLevel` (optional): Minimum severity (0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical)
- `limit` (optional): Maximum records to return (default: 100)

**Returns:** Query result with FunctionAppLogs table

**Example:**
```typescript
// Get error and critical logs for ProcessOrders function
{
  "workspaceId": "prod-functions",
  "functionName": "ProcessOrders",
  "timespan": "PT12H",
  "severityLevel": 3,
  "limit": 50
}
```

**Use Cases:**
- View function execution logs
- Filter by severity level
- Investigate function behavior
- Debug function issues

### loganalytics-get-function-errors

Get error logs for Azure Functions (ExceptionDetails present).

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (optional): Filter by function name
- `timespan` (optional): ISO 8601 duration (default: "PT1H")
- `limit` (optional): Maximum records to return (default: 100)

**Returns:** Query result with error logs including ExceptionDetails

**Example:**
```typescript
{
  "workspaceId": "prod-functions",
  "functionName": "ProcessOrders",
  "timespan": "PT6H"
}
```

**Use Cases:**
- Troubleshoot function failures
- Analyze exception patterns
- Identify recurring errors
- Review stack traces

### loganalytics-get-function-stats

Get execution statistics for Azure Functions.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (optional): Filter by function name (if omitted, returns stats for all functions)
- `timespan` (optional): ISO 8601 duration (default: "PT1H")

**Returns:** Statistics with execution count, error count, success rate

**Example Response:**
```json
{
  "tables": [
    {
      "columns": [
        { "name": "FunctionName", "type": "string" },
        { "name": "TotalExecutions", "type": "long" },
        { "name": "ErrorCount", "type": "long" },
        { "name": "SuccessCount", "type": "long" },
        { "name": "SuccessRate", "type": "real" }
      ],
      "rows": [
        ["ProcessOrders", 1250, 15, 1235, 98.8],
        ["SendNotifications", 3420, 2, 3418, 99.94],
        ["GenerateReports", 180, 45, 135, 75.0]
      ]
    }
  ]
}
```

**Use Cases:**
- Monitor function health
- Track success/failure rates
- Identify problematic functions
- Performance monitoring

### loganalytics-get-function-invocations

Get Azure Function invocation records from requests and traces tables.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (optional): Filter by function name
- `timespan` (optional): ISO 8601 duration (default: "PT1H")
- `limit` (optional): Maximum records to return (default: 100)

**Returns:** Query result with function invocations

**Example:**
```typescript
{
  "workspaceId": "prod-functions",
  "functionName": "ProcessOrders",
  "timespan": "PT2H"
}
```

**Use Cases:**
- Track function execution history
- Monitor HTTP-triggered functions
- Analyze invocation patterns
- Debug timing issues

### loganalytics-get-recent-events

Get recent events from any Log Analytics table (generic log retrieval).

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `tableName` (required): Table name (e.g., "FunctionAppLogs", "requests", "traces")
- `timespan` (optional): ISO 8601 duration (default: "PT1H")
- `limit` (optional): Maximum records to return (default: 100)

**Returns:** Query result ordered by TimeGenerated descending

**Example:**
```typescript
{
  "workspaceId": "prod-functions",
  "tableName": "requests",
  "timespan": "PT30M",
  "limit": 50
}
```

**Use Cases:**
- Explore any table in workspace
- Recent event monitoring
- Generic log retrieval
- Custom table queries

### loganalytics-search-logs

Search logs across tables or within a specific table (cross-table search).

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `searchText` (required): Text to search for
- `tableName` (optional): Specific table to search (default: all tables using "*")
- `timespan` (optional): ISO 8601 duration (default: "PT1H")
- `limit` (optional): Maximum records to return (default: 100)

**Returns:** Query result with matching log entries

**Example:**
```typescript
// Search for "timeout" across all tables
{
  "workspaceId": "prod-functions",
  "searchText": "timeout",
  "timespan": "PT24H"
}

// Search within specific table
{
  "workspaceId": "prod-functions",
  "searchText": "connection refused",
  "tableName": "FunctionAppLogs",
  "timespan": "PT6H"
}
```

**Use Cases:**
- Search for error messages
- Find specific events
- Cross-table log correlation
- Keyword-based troubleshooting

---

## Azure SQL Database Tools

The Azure SQL Database integration provides read-only access to SQL databases with comprehensive security controls. All tools are designed for database investigation and schema exploration.

**Key Features:**
- **Read-only by design** - Only SELECT queries permitted
- **Query validation** - Blocks INSERT, UPDATE, DELETE, DROP, EXEC, and other write operations
- **Safety mechanisms** - 10MB response limit, 1000 row limit (configurable), 30-second timeout
- **Connection pooling** - Automatic connection management with health checks
- **Credential protection** - Credentials sanitized from all error messages
- **Audit logging** - All user queries logged for security

### Schema Exploration Tools

#### sql-test-connection

Test connectivity to the Azure SQL Database.

**Parameters:**
None

**Returns:**
- `connected` (boolean): Connection status
- `sqlVersion` (string): SQL Server version
- `database` (string): Connected database name
- `user` (string): Current user (sanitized)
- `serverTime` (string): Server UTC time

**Example:**
```javascript
await mcpClient.invoke("sql-test-connection", {});
```

**Use Cases:**
- Verify database connectivity before queries
- Check SQL Server version for compatibility
- Confirm correct database connection
- Troubleshoot connection issues

---

#### sql-list-tables

List all user tables in the database with row counts and sizes.

**Parameters:**
None

**Returns:**
Array of tables with:
- `schemaName` (string): Schema name (e.g., "dbo")
- `tableName` (string): Table name
- `rowCount` (number): Approximate row count
- `totalSpaceMB` (number): Total space used in MB
- `dataSpaceMB` (number): Data space used in MB
- `indexSpaceMB` (number): Index space used in MB

**Example:**
```javascript
await mcpClient.invoke("sql-list-tables", {});
```

**Use Cases:**
- Database inventory and exploration
- Identify large tables for optimization
- Understand database schema structure
- Find tables by name pattern

---

#### sql-list-views

List all database views with their definitions.

**Parameters:**
None

**Returns:**
Array of views with:
- `schemaName` (string): Schema name
- `viewName` (string): View name
- `definition` (string): View SQL definition

**Example:**
```javascript
await mcpClient.invoke("sql-list-views", {});
```

**Use Cases:**
- Explore existing views
- Understand data access patterns
- Document database logic
- Find views by name pattern

---

#### sql-list-stored-procedures

List all stored procedures in the database.

**Parameters:**
None

**Returns:**
Array of procedures with:
- `schemaName` (string): Schema name
- `procedureName` (string): Procedure name
- `definition` (string): Procedure SQL definition
- `createDate` (string): Creation date
- `modifyDate` (string): Last modification date

**Example:**
```javascript
await mcpClient.invoke("sql-list-stored-procedures", {});
```

**Use Cases:**
- Inventory database procedures
- Review procedure logic
- Find procedures by name pattern
- Document database operations

---

#### sql-list-triggers

List all database triggers with their event types.

**Parameters:**
None

**Returns:**
Array of triggers with:
- `schemaName` (string): Schema name
- `triggerName` (string): Trigger name
- `tableName` (string): Associated table name
- `eventType` (string): Trigger event (INSERT, UPDATE, DELETE)
- `isEnabled` (boolean): Enabled status
- `definition` (string): Trigger SQL definition

**Example:**
```javascript
await mcpClient.invoke("sql-list-triggers", {});
```

**Use Cases:**
- Audit automated operations
- Understand data modification logic
- Document database automation
- Troubleshoot trigger conflicts

---

#### sql-list-functions

List all user-defined functions in the database.

**Parameters:**
None

**Returns:**
Array of functions with:
- `schemaName` (string): Schema name
- `functionName` (string): Function name
- `functionType` (string): Function type (Scalar, Table-valued, etc.)
- `returnType` (string): Return data type
- `definition` (string): Function SQL definition

**Example:**
```javascript
await mcpClient.invoke("sql-list-functions", {});
```

**Use Cases:**
- Inventory database functions
- Review calculation logic
- Find functions by name pattern
- Document business rules

---

#### sql-get-table-schema

Get comprehensive schema details for a specific table including columns, indexes, and foreign keys.

**Parameters:**
- `schemaName` (string, required): Schema name (e.g., "dbo")
- `tableName` (string, required): Table name

**Returns:**
- `columns` (array): Column definitions with data types, nullability, defaults, identity
- `indexes` (array): Index definitions with columns, uniqueness, primary key status
- `foreignKeys` (array): Foreign key relationships with referenced tables and columns

**Example:**
```javascript
await mcpClient.invoke("sql-get-table-schema", {
  schemaName: "dbo",
  tableName: "Users"
});
```

**Use Cases:**
- Understand table structure
- Plan data queries
- Document table relationships
- Troubleshoot data issues

---

#### sql-get-object-definition

Get the SQL definition for views, stored procedures, functions, or triggers.

**Parameters:**
- `schemaName` (string, required): Schema name
- `objectName` (string, required): Object name
- `objectType` (string, required): Object type - "VIEW", "PROCEDURE", "FUNCTION", or "TRIGGER"

**Returns:**
- `schemaName` (string): Schema name
- `objectName` (string): Object name
- `objectType` (string): Object type
- `definition` (string): SQL definition

**Example:**
```javascript
await mcpClient.invoke("sql-get-object-definition", {
  schemaName: "dbo",
  objectName: "vw_ActiveUsers",
  objectType: "VIEW"
});
```

**Use Cases:**
- Review database logic
- Document business rules
- Troubleshoot procedure issues
- Understand view definitions

---

### Query Execution Tools

#### sql-execute-query

Execute a SELECT query safely with read-only access.

**Parameters:**
- `query` (string, required): SQL SELECT query to execute

**Returns:**
- `columns` (array): Column names
- `rows` (array): Query result rows
- `rowCount` (number): Number of rows returned
- `truncated` (boolean): Whether results were truncated (>1000 rows)

**Security:**
- Only SELECT queries permitted
- Validates query for dangerous keywords (INSERT, UPDATE, DELETE, DROP, EXEC, etc.)
- Removes SQL comments before validation
- 1000 row limit (configurable via AZURE_SQL_MAX_RESULT_ROWS)
- 10MB response size limit
- 30-second query timeout
- All queries logged for audit

**Example:**
```javascript
await mcpClient.invoke("sql-execute-query", {
  query: "SELECT TOP 10 UserId, UserName, Email, IsActive FROM dbo.Users WHERE IsActive = 1 ORDER BY CreateDate DESC"
});
```

**Use Cases:**
- Investigate data issues
- Explore table contents
- Verify data quality
- Ad-hoc data analysis

**Limitations:**
- Maximum 1000 rows (configurable)
- Maximum 10MB response size
- 30-second query timeout
- Read-only operations only

---

## MCP Prompts

Prompts return formatted, human-readable content with context. They use tools internally but add interpretation and formatting.

### PowerPlatform Entity Prompts

#### entity-overview

Comprehensive overview of a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Formatted markdown with:
  - Entity description and purpose
  - Key fields and their meanings
  - Relationship summary
  - Common usage patterns

---

#### attribute-details

Detailed information about a specific entity attribute.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `attributeName` (string, required): Logical name of the attribute

**Returns:**
- Formatted markdown with:
  - Attribute purpose and description
  - Data type with examples
  - Valid values or ranges
  - Usage notes and best practices

---

#### query-template

OData query template for an entity with example filters.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Formatted markdown with:
  - Basic query structure
  - Common filter patterns
  - Ordering and pagination examples
  - Field selection recommendations

---

#### relationship-map

Visual map of entity relationships.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Formatted markdown with:
  - One-to-Many relationships (parent → children)
  - Many-to-Many relationships
  - Related entity purposes
  - Relationship navigation examples

---

### PowerPlatform Plugin Prompts

#### plugin-deployment-report

Comprehensive deployment report for a plugin assembly with validation warnings.

**Parameters:**
- `assemblyName` (string, required): Name of the plugin assembly

**Returns:**
- Formatted markdown report with:
  - Assembly information (version, isolation, modified by)
  - All registered steps organized by entity and message
  - Validation results:
    - ✓ Checkmarks for valid configuration
    - ⚠ Warnings for potential issues
  - Detailed issue descriptions

**Use case:** PR reviews for plugin deployments

---

#### entity-plugin-pipeline-report

Visual execution pipeline showing all plugins for an entity in order.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `messageFilter` (string, optional): Filter by SDK message

**Returns:**
- Formatted markdown with:
  - Plugins grouped by message type
  - Execution order by stage and rank
  - Mode indicators (Sync/Async)
  - Filtering attributes
  - Image configuration
  - Assembly versions

**Use case:** Understanding plugin execution flow

---

### PowerPlatform Workflow & Flow Prompts

#### flows-report

Comprehensive report of all Power Automate flows grouped by state.

**Parameters:** None

**Returns:**
- Formatted markdown with:
  - Flows grouped by state (Activated/Draft/Suspended)
  - Flow names and owners
  - Primary entities
  - Trigger types
  - Last modified dates

---

#### workflows-report

Comprehensive report of all classic Dynamics workflows grouped by state.

**Parameters:** None

**Returns:**
- Formatted markdown with:
  - Workflows grouped by state
  - Execution modes (Background/Real-time)
  - Trigger events
  - Primary entities
  - Owners and modified dates

---

#### business-rules-report

Comprehensive report of all business rules grouped by state (read-only for troubleshooting).

**Parameters:**
- `activeOnly` (string, optional): Set to 'true' to only include activated business rules (default: false)

**Returns:**
- Formatted markdown with:
  - Business rules grouped by state (Active, Draft, Suspended)
  - Primary entities
  - Owners and modified dates
  - Note about read-only access

**Note:** Business rules are read-only in this MCP server. Use the PowerPlatform UI to create or modify business rules.

---

### Azure DevOps Prompts

#### wiki-search-results

Search Azure DevOps wiki pages with formatted results and content snippets.

**Parameters:**
- `searchText` (string, required): Search query
- `project` (string, required): Project name
- `maxResults` (number, optional, default: 25): Maximum results

**Returns:**
- Formatted markdown with:
  - Search summary
  - Results with paths and projects
  - Content highlights (matching snippets)
  - Navigation links

---

#### wiki-page-content

Get a formatted wiki page with navigation context and sub-pages.

**Parameters:**
- `project` (string, required): Project name
- `wikiId` (string, required): Wiki identifier
- `pagePath` (string, required): Page path

**Returns:**
- Formatted markdown with:
  - Page metadata (project, wiki, paths)
  - Sub-pages list
  - Full page content
  - Navigation context

---

#### work-item-summary

Comprehensive summary of a work item with details and comments.

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID

**Returns:**
- Formatted markdown with:
  - Work item header (ID, title, type)
  - All field details
  - Description and repro steps
  - Comments thread
  - Related items

---

#### work-items-query-report

Execute a WIQL query and get results grouped by state/type.

**Parameters:**
- `project` (string, required): Project name
- `wiql` (string, required): WIQL query

**Returns:**
- Formatted markdown with:
  - Query summary
  - Results grouped by state
  - Work item details (ID, title, assigned to)
  - Counts by group

---

### Application Insights Prompts

#### appinsights-exception-summary

Generate a comprehensive exception summary report for troubleshooting.

**Parameters:**
- `resourceId` (string, required): Application Insights resource ID
- `timespan` (string, optional, default: 'PT1H'): Time range in ISO 8601 duration format

**Returns:**
- Formatted markdown report with:
  - Key insights (exception counts, unique types, affected operations)
  - Recent exceptions table
  - Exception types frequency table
  - Actionable recommendations

**Use case:** Quick exception analysis during incident response

---

#### appinsights-performance-report

Generate a comprehensive performance analysis report from Application Insights.

**Parameters:**
- `resourceId` (string, required): Application Insights resource ID
- `timespan` (string, optional, default: 'PT1H'): Time range in ISO 8601 duration format

**Returns:**
- Formatted markdown report with:
  - Key insights (slowest operations, highest failure rates)
  - Operation performance summary (request counts, avg/P50/P95/P99 duration, failures)
  - Slowest requests (>5 seconds)
  - Performance optimization recommendations

**Use case:** Performance analysis and optimization planning

---

#### appinsights-dependency-health

Generate a dependency health report showing external service issues.

**Parameters:**
- `resourceId` (string, required): Application Insights resource ID
- `timespan` (string, optional, default: 'PT1H'): Time range in ISO 8601 duration format

**Returns:**
- Formatted markdown report with:
  - Key insights (affected targets, failure counts)
  - Failed dependencies table
  - Dependency success rates by target and type
  - Actionable recommendations (circuit breakers, timeout configuration)

**Use case:** Identifying external service dependencies causing failures

---

#### appinsights-availability-report

Generate an availability and uptime report from Application Insights.

**Parameters:**
- `resourceId` (string, required): Application Insights resource ID
- `timespan` (string, optional, default: 'PT24H'): Time range in ISO 8601 duration format

**Returns:**
- Formatted markdown report with:
  - Availability test results (total tests, success/failure counts, success rates)
  - Average test duration by location
  - Recommendations for improving availability monitoring

**Use case:** SLA monitoring and uptime verification

---

#### appinsights-troubleshooting-guide

Generate a comprehensive troubleshooting guide combining exceptions, performance, and dependencies.

**Parameters:**
- `resourceId` (string, required): Application Insights resource ID
- `timespan` (string, optional, default: 'PT1H'): Time range in ISO 8601 duration format

**Returns:**
- Formatted markdown report with:
  - Health status overview (exceptions, slow requests, dependency failures)
  - Top exceptions table
  - Slowest requests table
  - Failed dependencies table
  - Step-by-step troubleshooting workflow
  - Investigation recommendations with KQL query examples

**Use case:** First-responder guide during production incidents

---

### Azure Log Analytics Workspace Prompts

#### loganalytics-workspace-summary

Generate a comprehensive workspace summary report with all active functions and their health status.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `timespan` (optional): ISO 8601 duration (default: "PT1H")

**Returns:**
- Formatted markdown report with:
  - Workspace overview
  - List of active functions with execution counts
  - Error summary by function
  - Top errors by frequency
  - Overall health status (success rates, error rates)
  - Key insights and recommendations

**Example:**
```
# Log Analytics Workspace Summary: Production Functions
**Time Range:** Last 1 hour

## Overview
- Active Functions: 5
- Total Executions: 1,250
- Total Errors: 15
- Overall Success Rate: 98.8%

## Functions
| Function Name | Executions | Errors | Success Rate |
|--------------|------------|--------|--------------|
| ProcessOrders | 450 | 8 | 98.2% |
| SendNotifications | 600 | 2 | 99.7% |
| GenerateReports | 200 | 5 | 97.5% |

## Top Errors
1. Database connection timeout (5 occurrences)
2. HTTP request timeout (3 occurrences)
3. Invalid input format (2 occurrences)

## Recommendations
- ⚠️ Investigate database connection timeouts in ProcessOrders
- ✅ SendNotifications performing well (99.7% success rate)
```

**Use case:** Regular health monitoring and status dashboards

#### loganalytics-function-troubleshooting

Generate a comprehensive troubleshooting report for a specific Azure Function combining errors, stats, and recommendations.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (required): Function name to analyze
- `timespan` (optional): ISO 8601 duration (default: "PT1H")

**Returns:**
- Formatted markdown report with:
  - Recent errors and exceptions with timestamps
  - Execution statistics (count, success rate)
  - Error patterns and frequency analysis
  - Common exception types
  - Performance metrics
  - Actionable troubleshooting recommendations

**Example:**
```
# Troubleshooting Report: ProcessOrders Function
**Time Range:** Last 1 hour

## Execution Summary
- Total Executions: 450
- Successful: 442 (98.2%)
- Failed: 8 (1.8%)

## Recent Errors (Last 8)
1. **[Error] 2025-01-07 10:30:45**
   - Message: Database connection timeout
   - Exception: System.TimeoutException

2. **[Error] 2025-01-07 10:25:12**
   - Message: HTTP request timeout
   - Exception: System.Net.Http.HttpRequestException

## Error Patterns
- Database timeouts: 5 occurrences (62.5%)
- HTTP timeouts: 3 occurrences (37.5%)

## Recommendations
🔍 **Immediate Actions:**
1. Check database connection pool settings
2. Review HTTP client timeout configuration
3. Investigate external API response times

⚠️ **Critical Issues:**
- Error rate increasing (1.8% vs 0.5% baseline)
- Database timeouts concentrated in last 30 minutes
```

**Use case:** Debugging function failures and investigating production issues

#### loganalytics-function-performance-report

Generate a performance analysis report for an Azure Function with execution statistics and optimization recommendations.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (optional): Function name (if omitted, analyzes all functions)
- `timespan` (optional): ISO 8601 duration (default: "PT1H")

**Returns:**
- Formatted markdown report with:
  - Execution count and success rate
  - Performance statistics (if available)
  - Slow executions analysis
  - Performance trends
  - Optimization recommendations

**Example:**
```
# Performance Report: ProcessOrders Function
**Time Range:** Last 6 hours

## Execution Statistics
- Total Executions: 2,750
- Success Rate: 98.2%
- Error Rate: 1.8%

## Performance Insights
- Average execution time: 1.2 seconds
- Slowest execution: 8.5 seconds
- Fastest execution: 0.3 seconds

## Recommendations
✅ **Performing Well:**
- Success rate above 95% threshold
- Consistent execution times

⚠️ **Optimization Opportunities:**
- 5 executions took > 5 seconds (investigate database queries)
- Consider adding retry logic for transient failures
```

**Use case:** Performance monitoring and optimization planning

#### loganalytics-security-analysis

Generate a security analysis report by scanning logs for suspicious patterns, authentication failures, and security events.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `timespan` (optional): ISO 8601 duration (default: "PT24H")

**Returns:**
- Formatted markdown report with:
  - Authentication failures analysis
  - Suspicious IP addresses or patterns
  - Security-related error messages
  - Access pattern anomalies
  - Security recommendations

**Example:**
```
# Security Analysis Report: Production Functions
**Time Range:** Last 24 hours

## Authentication Events
- Total auth attempts: 1,250
- Successful: 1,245 (99.6%)
- Failed: 5 (0.4%)

## Failed Authentication Details
1. **2025-01-07 10:30:00** - Invalid API key
2. **2025-01-07 09:15:22** - Expired token
3. **2025-01-07 08:45:10** - Invalid credentials

## Security Insights
- No suspicious patterns detected
- All failed auth attempts from known IPs
- No anomalous access patterns

## Recommendations
✅ **Security Status:**
- Authentication failure rate within normal range (<1%)
- No immediate security concerns

🔒 **Best Practices:**
- Rotate API keys quarterly
- Monitor for unusual access patterns
- Enable MFA where possible
```

**Use case:** Security auditing and compliance monitoring

#### loganalytics-logs-report

Generate a formatted logs report with key insights and analysis for any table in Log Analytics.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `tableName` (required): Table name to query (e.g., "FunctionAppLogs", "requests")
- `timespan` (optional): ISO 8601 duration (default: "PT1H")
- `limit` (optional): Maximum log entries to include (default: 100)

**Returns:**
- Formatted markdown report with:
  - Logs table formatted as markdown
  - Summary statistics (total entries, time range)
  - Severity distribution (if applicable)
  - Key insights and patterns
  - Recommendations based on log analysis

**Example:**
```
# Logs Report: FunctionAppLogs
**Time Range:** Last 1 hour
**Total Entries:** 125

## Summary
- Total log entries: 125
- Unique functions: 3
- Error count: 8
- Success rate: 93.6%

## Severity Distribution
- Verbose: 25 (20%)
- Information: 80 (64%)
- Warning: 12 (9.6%)
- Error: 8 (6.4%)
- Critical: 0 (0%)

## Key Insights
- ProcessOrders function has higher error rate (5.3%)
- Most errors related to database timeouts
- SendNotifications performing well (99% success)

## Top 10 Recent Logs
| Time | Function | Severity | Message |
|------|----------|----------|---------|
| 10:30:45 | ProcessOrders | Error | Database timeout |
| 10:29:12 | SendNotifications | Info | Message sent successfully |
...

## Recommendations
- 🔍 Investigate database connection settings in ProcessOrders
- ⚠️ Warning-level logs increasing (consider reviewing warning messages)
```

**Use case:** General log analysis and investigation

---

### Azure SQL Database Prompts

#### sql-database-overview

Generate a comprehensive database overview with all schema objects formatted as markdown.

**Parameters:**
None

**Returns:**
- Formatted markdown report with:
  - Database summary (total tables, views, procedures, triggers, functions)
  - Tables list with row counts and sizes
  - Views list
  - Stored procedures list
  - Triggers list
  - Functions list
  - Database statistics

**Example:**
```javascript
await mcpClient.getPrompt("sql-database-overview", {});
```

**Use Cases:**
- Database inventory and documentation
- Schema exploration for new team members
- Architecture review and planning
- Database health assessment

---

#### sql-table-details

Generate a detailed report for a specific table with all schema information.

**Parameters:**
- `schemaName` (string, required): Schema name (e.g., "dbo")
- `tableName` (string, required): Table name

**Returns:**
- Formatted markdown report with:
  - Table summary (schema, name, row count)
  - Column definitions (name, type, nullable, default, identity)
  - Indexes (name, type, columns, uniqueness, clustered)
  - Foreign key relationships (name, columns, referenced table)
  - Sample query templates

**Example:**
```javascript
await mcpClient.getPrompt("sql-table-details", {
  schemaName: "dbo",
  tableName: "Users"
});
```

**Use Cases:**
- Table structure documentation
- Query planning and optimization
- Relationship mapping
- Data investigation

---

#### sql-query-results

Execute a query and return formatted results as markdown tables.

**Parameters:**
- `query` (string, required): SQL SELECT query to execute

**Returns:**
- Formatted markdown table with:
  - Column headers
  - Query results (up to 1000 rows)
  - Row count summary
  - Truncation indicator if results exceeded limit

**Security:**
- Only SELECT queries permitted
- Query validation blocks write operations
- 1000 row limit (configurable)
- 10MB response size limit
- 30-second timeout

**Example:**
```javascript
await mcpClient.getPrompt("sql-query-results", {
  query: "SELECT TOP 20 UserId, UserName, Email, CreateDate FROM dbo.Users WHERE IsActive = 1 ORDER BY CreateDate DESC"
});
```

**Use Cases:**
- Data exploration and analysis
- Result sharing in documentation
- Quick data investigation
- Report generation

---
