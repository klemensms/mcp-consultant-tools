# Usage Guide

This guide provides practical examples and use cases for the MCP Consultant Tools.

## Table of Contents

- [PowerPlatform Examples](#powerplatform-examples)
- [Azure DevOps Examples](#azure-devops-examples)
- [Application Insights Examples](#application-insights-examples)
- [Figma Examples](#figma-examples)
- [Azure SQL Database Examples](#azure-sql-database-examples)
- [Integration Use Cases](#integration-use-cases)

## PowerPlatform Examples

### 1. Entity Understanding

Ask about entities in natural language:

```
User: "Tell me about the Account entity in our PowerPlatform environment"

Response:
[uses entity-overview prompt internally]

Here's what I found about the Account entity:
- It's a core business entity representing customers and potential customers
- The primary identifier is 'accountid' and the primary name field is 'name'
- Key fields include:
  * name (Account Name)
  * emailaddress1 (Email)
  * telephone1 (Main Phone)
  * revenue (Annual Revenue)
- It has 42 one-to-many relationships and 8 many-to-many relationships
```

### 2. Building Queries

Get help constructing OData queries:

```
User: "Help me write a query to find active accounts with revenue over $1M in California"

Response:
[uses query-template prompt internally]

Here's the OData query you need:
accounts?$select=name,revenue,statecode,address1_stateorprovince
&$filter=statecode eq 0
    and revenue gt 1000000
    and address1_stateorprovince eq 'California'
&$orderby=revenue desc

This query:
1. Selects relevant fields
2. Filters for active accounts (statecode eq 0)
3. Checks revenue > $1M
4. Filters for California location
5. Orders by revenue highest to lowest
```

### 3. Understanding Relationships

Explore entity relationships:

```
User: "How are Accounts and Contacts related in our system?"

Response:
[uses relationship-map prompt for both entities internally]

Here are the key relationships between Accounts and Contacts:

1. Primary Contact (One-to-Many):
   - account_primary_contact: Account (1) → Contact (N)
   - An account can have many contacts, but one designated as primary

2. Customer Relationship:
   - contact_customer_accounts: Contact (N) ← Account (1)
   - Contacts can be associated with customer accounts

3. Additional Relationships:
   - accountleads_association: For lead tracking
   - account_connections: For relationship management
```

### 4. Field/Attribute Investigation

Ask about specific fields:

```
User: "What kind of field is the revenue field on Account?"

Response:
[uses attribute-details prompt internally]

The revenue field on Account is:
- Data Type: Money
- Format: Currency
- Not required
- Searchable: Yes
- Used for: Tracking annual revenue for the account
- Can be used in advanced find and filtered views
```

### 5. Complex Data Modeling

Get help with data modeling decisions:

```
User: "I need to design a solution for tracking product reviews. Which entities should I relate to?"

Response:
[uses multiple entity-overview and relationship-map prompts internally]

Based on the existing data model, here's a suggested approach:

1. Product (existing entity):
   - Already has relationships with:
     * Price lists
     * Product categories
     * Inventory units

2. New Review entity should relate to:
   - Product (N:1) - Each review is for one product
   - Contact (N:1) - Reviews are written by contacts
   - Account (N:1) - Optional link to company if B2B review

Here's a sample lookup field structure...
[continues with detailed implementation guidance]
```

### 6. Debugging Assistance

Get help troubleshooting:

```
User: "Why am I getting 'invalid property' when querying account.customertypecode?"

Response:
[uses attribute-details prompt internally]

I see the issue. The field 'customertypecode' is actually named 'customertype' in your environment. Here's the correct field information:
- Logical Name: customertype
- Type: OptionSetValue
- Valid Values:
  * 1 = Competitor
  * 2 = Consultant
  * 3 = Customer
  * 4 = Investor
  * 5 = Partner
  * 6 = Influencer

Try updating your query to use 'customertype' instead of 'customertypecode'.
```

## Plugin Registration & Validation

### Use Case 1: Discover Plugin Assemblies

```javascript
// List all custom (unmanaged) plugin assemblies
await mcpClient.invoke("get-plugin-assemblies", {
  includeManaged: false
});
```

**Output:**
```json
{
  "totalCount": 10,
  "assemblies": [
    {
      "name": "MyCompany.Plugins",
      "version": "1.0.0.5",
      "isolationMode": "Sandbox",
      "modifiedOn": "2024-01-15T10:30:00Z",
      "modifiedBy": "John Doe"
    }
  ]
}
```

### Use Case 2: Validate Plugin Deployment (PR Review)

```javascript
// Get comprehensive assembly info with automatic validation
await mcpClient.invoke("get-plugin-assembly-complete", {
  assemblyName: "MyCompany.Plugins",
  includeDisabled: false
});
```

**Returns:**
- Assembly metadata (version, isolation mode, last modified)
- All plugin types (class names)
- All registered steps with:
  - Stage (PreValidation/PreOperation/PostOperation)
  - Mode (Synchronous/Asynchronous)
  - Execution rank
  - Filtering attributes
  - Pre/Post images with column lists
- **Automatic validation** detecting:
  - Missing filtering attributes (performance issue)
  - Missing images (potential runtime errors)
  - Disabled steps
  - Configuration issues

### Use Case 3: View Entity Plugin Pipeline

```javascript
// See all plugins that run on an entity in execution order
await mcpClient.invoke("get-entity-plugin-pipeline", {
  entityName: "account",
  messageFilter: "Update"  // Optional: filter by message
});
```

**Shows:**
- All plugins organized by stage and rank
- Execution order
- Filtering attributes per step
- Images configured
- Assembly versions

### Use Case 4: Troubleshoot with Trace Logs

```javascript
// Query recent plugin failures
await mcpClient.invoke("get-plugin-trace-logs", {
  entityName: "account",
  exceptionOnly: true,
  hoursBack: 24,
  maxRecords: 50
});
```

**Returns:**
- Parsed exception details
- Exception type and message
- Stack traces
- Execution duration
- Correlation IDs for further investigation

### Plugin Validation for PR Reviews

Use the `plugin-deployment-report` prompt for a human-readable validation report:

```javascript
await mcpClient.callPrompt("plugin-deployment-report", {
  assemblyName: "MyCompany.Plugins"
});
```

**Sample Report:**
```markdown
# Plugin Deployment Report: MyCompany.Plugins

## Assembly Information
- Version: 1.0.0.5
- Isolation Mode: Sandbox
- Last Modified: 2024-01-15 by John Doe

## Registered Steps (8 total)

### Update - Account (PreOperation, Sync, Rank 10)
- Plugin: MyCompany.Plugins.AccountPlugin
- Status: ✓ Enabled
- Filtering Attributes: name, revenue, industrycode
- Images:
  - PreImage "Target" → Attributes: name, revenue, accountnumber

## Validation Results

✓ All steps are enabled
✓ All Update/Delete steps have filtering attributes
⚠ Warning: 2 steps without images (may need entity data)

### Potential Issues
- Account.Delete step missing PreImage - code may fail at runtime
```

### Entity Pipeline Visualization

View the execution pipeline for an entity with the `entity-plugin-pipeline-report` prompt:

```javascript
await mcpClient.callPrompt("entity-plugin-pipeline-report", {
  entityName: "account",
  messageFilter: "Update"  // Optional
});
```

**Sample Report:**
```markdown
# Plugin Pipeline: Account Entity

## Update Message

### Stage 1: PreValidation (Synchronous)
1. [Rank 5] DataValidationPlugin.ValidateAccount
   - Assembly: ValidationPlugins v1.0.0
   - Filtering: name, accountnumber

### Stage 2: PreOperation (Synchronous)
1. [Rank 10] BusinessLogicPlugin.EnrichAccountData
   - Assembly: BusinessLogic v2.0.1
   - Filtering: revenue, industrycode
   - Images: PreImage

### Stage 3: PostOperation
1. [Rank 10] IntegrationPlugin.SyncToERP (Async)
   - Assembly: Integrations v3.1.0
   - Filtering: revenue
```

## PowerPlatform Customization Workflows

**IMPORTANT:** All customization examples require `POWERPLATFORM_ENABLE_CUSTOMIZATION=true` and make permanent changes to your CRM environment. Test in development/sandbox environments first.

### Workflow 1: Create a Complete Entity with Attributes

This workflow demonstrates creating a new entity with multiple attributes, relationships, and basic configuration.

```javascript
// Step 1: Create the entity
// Note: Default settings disable activities, notes, duplicate detection, and mail merge
// Primary column defaults to 850 character max length
const entityResult = await mcpClient.invoke("create-entity", {
  schemaName: "sic_application",
  displayName: "Application",
  pluralDisplayName: "Applications",
  description: "Customer application entity",
  ownershipType: "UserOwned",
  hasActivities: false,  // Default: false
  hasNotes: false,       // Default: false
  primaryAttributeSchemaName: "sic_applicationnumber",
  primaryAttributeDisplayName: "Application Number",
  primaryAttributeMaxLength: 850,  // Default: 850 (maximum allowed)
  solutionUniqueName: "MyCustomSolution"
});

// Step 2: Add additional attributes
// String attribute
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "sic_application",
  attributeType: "String",
  schemaName: "sic_applicantname",
  displayName: "Applicant Name",
  maxLength: 200,
  isRequired: "ApplicationRequired",
  solutionUniqueName: "MyCustomSolution"
});

// DateTime attribute
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "sic_application",
  attributeType: "DateTime",
  schemaName: "sic_submitteddate",
  displayName: "Submitted Date",
  dateTimeBehavior: "UserLocal",
  format: "DateOnly",
  solutionUniqueName: "MyCustomSolution"
});

// Picklist attribute
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "sic_application",
  attributeType: "Picklist",
  schemaName: "sic_status",
  displayName: "Status",
  optionSetOptions: [
    {value: 1, label: "Draft"},
    {value: 2, label: "Submitted"},
    {value: 3, label: "Under Review"},
    {value: 4, label: "Approved"},
    {value: 5, label: "Rejected"}
  ],
  solutionUniqueName: "MyCustomSolution"
});

// Lookup attribute to Account
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "sic_application",
  attributeType: "Lookup",
  schemaName: "sic_parentaccount",
  displayName: "Parent Account",
  referencedEntity: "account",
  solutionUniqueName: "MyCustomSolution"
});

// Money attribute
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "sic_application",
  attributeType: "Money",
  schemaName: "sic_requestedamount",
  displayName: "Requested Amount",
  precision: 2,
  minValue: 0,
  maxValue: 1000000,
  solutionUniqueName: "MyCustomSolution"
});

// Step 3: Publish customizations
await mcpClient.invoke("publish-customizations", {});

console.log("Entity created with 5 attributes and published!");
```

### Workflow 2: Managing Forms and Views

Create custom forms and views for your entity.

```javascript
// Step 1: Create a main form
const formResult = await mcpClient.invoke("create-form", {
  entityLogicalName: "sic_application",
  name: "Application Main Form",
  formType: 2,  // Main form
  formXml: `<form>
    <tabs>
      <tab name="general" showlabel="true">
        <labels><label description="General" languagecode="1033"/></labels>
        <columns>
          <column width="100%">
            <sections>
              <section name="info" showlabel="true">
                <labels><label description="Application Information" languagecode="1033"/></labels>
                <rows>
                  <row><cell id="sic_applicantname"/></row>
                  <row><cell id="sic_submitteddate"/></row>
                  <row><cell id="sic_status"/></row>
                  <row><cell id="sic_requestedamount"/></row>
                  <row><cell id="sic_parentaccount"/></row>
                </rows>
              </section>
            </sections>
          </column>
        </columns>
      </tab>
    </tabs>
  </form>`,
  description: "Main application form",
  solutionUniqueName: "MyCustomSolution"
});

// Step 2: Activate the form
await mcpClient.invoke("activate-form", {
  formId: formResult.formid
});

// Step 3: Create a custom view
const viewResult = await mcpClient.invoke("create-view", {
  entityLogicalName: "sic_application",
  name: "Active Applications",
  fetchXml: `<fetch>
    <entity name="sic_application">
      <attribute name="sic_applicationnumber"/>
      <attribute name="sic_applicantname"/>
      <attribute name="sic_submitteddate"/>
      <attribute name="sic_status"/>
      <attribute name="sic_requestedamount"/>
      <filter>
        <condition attribute="statecode" operator="eq" value="0"/>
        <condition attribute="sic_status" operator="in">
          <value>2</value>
          <value>3</value>
        </condition>
      </filter>
      <order attribute="sic_submitteddate" descending="true"/>
    </entity>
  </fetch>`,
  layoutXml: `<grid>
    <row>
      <cell name="sic_applicationnumber" width="150"/>
      <cell name="sic_applicantname" width="200"/>
      <cell name="sic_submitteddate" width="100"/>
      <cell name="sic_status" width="100"/>
      <cell name="sic_requestedamount" width="150"/>
    </row>
  </grid>`,
  queryType: 0,  // Public view
  description: "View of active applications",
  solutionUniqueName: "MyCustomSolution"
});

// Step 4: Set as default view
await mcpClient.invoke("set-default-view", {
  viewId: viewResult.savedqueryid
});

// Step 5: Publish customizations
await mcpClient.invoke("publish-entity", {
  entityLogicalName: "sic_application"
});

console.log("Form and view created and published!");
```

### Workflow 3: Creating Relationships

Establish relationships between entities.

```javascript
// One-to-Many relationship: Account -> Applications
const relationshipResult = await mcpClient.invoke("create-one-to-many-relationship", {
  schemaName: "sic_account_applications",
  referencedEntity: "account",
  referencingEntity: "sic_application",
  lookupAttributeSchemaName: "sic_relatedaccount",
  lookupAttributeDisplayName: "Related Account",
  solutionUniqueName: "MyCustomSolution"
});

// Many-to-Many relationship: Applications <-> Contacts
const manyToManyResult = await mcpClient.invoke("create-many-to-many-relationship", {
  schemaName: "sic_application_contact",
  entity1LogicalName: "sic_application",
  entity2LogicalName: "contact",
  solutionUniqueName: "MyCustomSolution"
});

// Publish to make relationships active
await mcpClient.invoke("publish-customizations", {});

console.log("Relationships created and published!");
```

### Workflow 4: Solution Management

Complete ALM workflow for managing solutions.

```javascript
// Step 1: Create a publisher (one-time setup)
const publisherResult = await mcpClient.invoke("create-publisher", {
  uniqueName: "SmartImpactConsulting",
  friendlyName: "Smart Impact Consulting",
  customizationPrefix: "sic",
  description: "Our company publisher"
});

// Step 2: Create a solution
const solutionResult = await mcpClient.invoke("create-solution", {
  uniqueName: "ApplicationManagement",
  friendlyName: "Application Management",
  publisherId: publisherResult.publisherid,
  version: "1.0.0.0",
  description: "Application management solution"
});

// Step 3: Add components to solution
// Add entity (automatically includes attributes)
await mcpClient.invoke("add-solution-component", {
  solutionUniqueName: "ApplicationManagement",
  componentId: entityResult.MetadataId,
  componentType: 1,  // Entity
  addRequiredComponents: true
});

// Add form
await mcpClient.invoke("add-solution-component", {
  solutionUniqueName: "ApplicationManagement",
  componentId: formResult.formid,
  componentType: 60,  // SystemForm
  addRequiredComponents: true
});

// Add view
await mcpClient.invoke("add-solution-component", {
  solutionUniqueName: "ApplicationManagement",
  componentId: viewResult.savedqueryid,
  componentType: 26,  // View
  addRequiredComponents: true
});

// Step 4: Export solution
const exportResult = await mcpClient.invoke("export-solution", {
  solutionName: "ApplicationManagement",
  managed: false
});

// Save the base64 zip file
const fs = require('fs');
fs.writeFileSync('ApplicationManagement.zip',
  Buffer.from(exportResult.ExportSolutionFile, 'base64'));

console.log("Solution exported successfully!");
```

### Workflow 5: Global Option Sets

Manage shared option sets across entities.

```javascript
// Step 1: Get existing global option set
const optionSet = await mcpClient.invoke("get-global-option-set", {
  optionSetName: "sic_industrycodes"
});

// Step 2: Add new values
await mcpClient.invoke("add-optionset-value", {
  optionSetName: "sic_industrycodes",
  value: 100000,
  label: "Technology",
  solutionUniqueName: "MyCustomSolution"
});

await mcpClient.invoke("add-optionset-value", {
  optionSetName: "sic_industrycodes",
  value: 100001,
  label: "Healthcare",
  solutionUniqueName: "MyCustomSolution"
});

await mcpClient.invoke("add-optionset-value", {
  optionSetName: "sic_industrycodes",
  value: 100002,
  label: "Finance",
  solutionUniqueName: "MyCustomSolution"
});

// Step 3: Reorder values for better display
await mcpClient.invoke("reorder-optionset-values", {
  optionSetName: "sic_industrycodes",
  values: [100002, 100000, 100001],  // Finance, Technology, Healthcare
  solutionUniqueName: "MyCustomSolution"
});

// Step 4: Use the global option set in an attribute
await mcpClient.invoke("create-global-optionset-attribute", {
  entityLogicalName: "account",
  schemaName: "sic_industrycode",
  displayName: "Industry Code",
  globalOptionSetName: "sic_industrycodes",
  solutionUniqueName: "MyCustomSolution"
});

// Step 5: Publish
await mcpClient.invoke("publish-customizations", {});

console.log("Global option set updated and used in attribute!");
```

### Workflow 6: Web Resources (JavaScript)

Upload and manage JavaScript web resources.

```javascript
// Step 1: Create JavaScript file content
const jsCode = `
function onLoad(executionContext) {
  var formContext = executionContext.getFormContext();
  console.log("Form loaded successfully");

  // Set default values
  formContext.getAttribute("sic_submitteddate").setValue(new Date());
  formContext.getAttribute("sic_status").setValue(1); // Draft
}

function onSave(executionContext) {
  var formContext = executionContext.getFormContext();

  // Validation logic
  var amount = formContext.getAttribute("sic_requestedamount").getValue();
  if (amount && amount > 100000) {
    alert("Requested amount exceeds limit. Manager approval required.");
  }
}
`;

// Step 2: Encode content to base64
const base64Content = Buffer.from(jsCode).toString('base64');

// Step 3: Create web resource
const webResourceResult = await mcpClient.invoke("create-web-resource", {
  name: "sic_/scripts/application_form.js",
  displayName: "Application Form Script",
  webResourceType: 3,  // JavaScript
  content: base64Content,
  description: "Form scripts for application entity",
  solutionUniqueName: "MyCustomSolution"
});

// Step 4: Publish
await mcpClient.invoke("publish-customizations", {});

console.log("Web resource created and published!");
console.log("Add this to your form's form libraries and events.");
```

### Workflow 7: Validation and Dependencies

Check dependencies before making changes.

```javascript
// Step 1: Check if entity is customizable
const customInfo = await mcpClient.invoke("get-entity-customization-info", {
  entityLogicalName: "sic_application"
});

if (!customInfo.IsCustomizable.Value) {
  console.log("Warning: Entity is not customizable!");
}

// Step 2: Check dependencies before deletion
const deleteCheck = await mcpClient.invoke("check-delete-eligibility", {
  componentId: "12345678-1234-1234-1234-123456789012",
  componentType: 2  // Attribute
});

if (!deleteCheck.canDelete) {
  console.log("Cannot delete - Dependencies:");
  deleteCheck.dependencies.forEach(dep => {
    console.log(`- ${dep.DependentComponentType}: ${dep.DependentComponentObjectId}`);
  });
} else {
  // Safe to delete
  await mcpClient.invoke("delete-attribute", {
    entityLogicalName: "sic_application",
    attributeMetadataId: "12345678-1234-1234-1234-123456789012"
  });
}

// Step 3: Check entity dependencies
const entityDeps = await mcpClient.invoke("check-entity-dependencies", {
  entityLogicalName: "sic_application"
});

console.log("Entity has", entityDeps.EntityCollection.Entities.length, "dependencies");

// Step 4: Validate solution integrity
const solutionValidation = await mcpClient.invoke("validate-solution-integrity", {
  solutionUniqueName: "ApplicationManagement"
});

if (!solutionValidation.isValid) {
  console.log("Solution has issues:");
  solutionValidation.issues.forEach(issue => {
    console.log(`- Missing dependency: ${issue.componentType}`);
  });
}

// Step 5: Preview unpublished changes
const unpublished = await mcpClient.invoke("preview-unpublished-changes", {});
console.log("Unpublished components:", unpublished);
```

### Workflow 8: Business Rules (Read-Only)

Business rules can be inspected for troubleshooting purposes.

```javascript
// List all business rules
const allRules = await mcpClient.invoke("get-business-rules", {
  activeOnly: false,
  maxRecords: 100
});

console.log(`Found ${allRules.totalCount} business rules`);

// Get a specific business rule definition
const ruleDetail = await mcpClient.invoke("get-business-rule", {
  workflowId: "12345678-1234-1234-1234-123456789012"
});

console.log(`Business rule: ${ruleDetail.name}`);
console.log(`Entity: ${ruleDetail.primaryEntity}`);
console.log(`State: ${ruleDetail.state}`);
console.log(`XAML: ${ruleDetail.xaml}`);

// Generate a formatted report of all business rules
const report = await mcpClient.invoke("business-rules-report", {
  activeOnly: "false"
});

console.log(report); // Markdown report grouped by state
```

**Note:** Business rules are read-only in this MCP server. Use the PowerPlatform UI to create or modify business rules.

### Best Practices for Customization

1. **Always use solutions** - Set `POWERPLATFORM_DEFAULT_SOLUTION` or pass `solutionUniqueName` to all tools
2. **Test in development first** - Never test customizations in production
3. **Check dependencies** - Use validation tools before deleting components
4. **Publish regularly** - Publish after each logical group of changes
5. **Export solutions** - Back up your work by exporting solutions regularly
6. **Use naming conventions** - Follow your organization's prefix and naming standards
7. **Validate schema names** - Use `validate-schema-name` before creating components
8. **Document changes** - Add descriptions to all customizations
9. **Monitor audit logs** - Review the audit trail for all operations
10. **Version control** - Export and commit solution files to source control

### Workflow: Configure and Publish a Model-Driven App

This workflow demonstrates adding entities to an app, validating, and publishing.

**Note:** Due to a Dataverse API bug, apps must be created manually via the Power Apps maker portal. See [CREATE_APP_API_BUG_REPORT.md](CREATE_APP_API_BUG_REPORT.md) for details.

```javascript
// Step 1: Create the app manually
// 1. Go to https://make.powerapps.com
// 2. Create a new model-driven app via the UI
// 3. Copy the app ID from the URL: https://make.powerapps.com/.../app/edit/{APP-ID}

const appId = "12345678-1234-1234-1234-123456789abc"; // From Power Apps maker portal URL

// Step 2: Add entities to the app
await mcpClient.invoke("add-entities-to-app", {
  appId: appId,
  entityNames: [
    "account",
    "contact",
    "opportunity",
    "sic_application"  // Your custom entity
  ]
});

console.log("Entities added to app");

// Step 3: Validate the app
const validationResult = await mcpClient.invoke("validate-app", {
  appId: appId
});

if (!validationResult.isValid) {
  console.error("Validation failed:", validationResult.issues);
  // Fix issues before publishing
} else {
  console.log("Validation passed!");
}

// Step 4: Publish the app
const publishResult = await mcpClient.invoke("publish-app", {
  appId: appId
});

console.log("App published successfully!");

// Step 5: Get comprehensive overview
await mcpClient.callPrompt("app-overview", {
  appId: appId
});
// Returns formatted report with all app details, components, and sitemap
```

**Querying Existing Apps:**

```javascript
// List all apps
const allApps = await mcpClient.invoke("get-apps", {
  activeOnly: false,
  maxRecords: 100
});

// Get specific app details
const app = await mcpClient.invoke("get-app", {
  appId: "12345678-1234-1234-1234-123456789abc"
});

// Get app components
const components = await mcpClient.invoke("get-app-components", {
  appId: app.appmoduleid
});

// Get app sitemap
const sitemap = await mcpClient.invoke("get-app-sitemap", {
  appId: app.appmoduleid
});
```

**Important Notes:**
- Apps require appropriate security roles for user access
- After publishing, assign security roles using PowerPlatform UI
- uniquename is auto-prefixed with publisher prefix
- Always validate before publishing to catch configuration issues

---

## Azure DevOps Examples

### Example 1: Search Wiki Documentation

```javascript
// Search for authentication-related wiki pages
await mcpClient.callPrompt("wiki-search-results", {
  searchText: "authentication",
  project: "MyProject",
  maxResults: 10
});
```

**Sample Output:**
```markdown
# Wiki Search Results: "authentication"

**Project:** MyProject
**Total Results:** 3

## Results

### 1. Setup-Guide.md
- **Path:** /Setup/Setup-Guide
- **Wiki:** MyProject.wiki
- **Project:** MyProject
- **Highlights:**
  - Authentication can be configured using OAuth or Azure AD
  - The authentication flow supports SAML and JWT tokens
```

### Example 2: Get Work Item with Comments

```javascript
// Get detailed work item summary with all comments
await mcpClient.callPrompt("work-item-summary", {
  project: "MyProject",
  workItemId: 12345
});
```

**Sample Output:**
```markdown
# Work Item #12345: Login button not working

## Details
- **Type:** Bug
- **State:** Active
- **Assigned To:** John Doe
- **Created By:** Jane Smith
- **Created Date:** 2024-01-15T10:30:00Z
- **Area Path:** MyProject\\Web\\Authentication
- **Iteration Path:** Sprint 23
- **Tags:** critical, authentication

## Description
When users click the login button on the homepage, nothing happens.
The console shows a JavaScript error: "Cannot read property 'submit' of null"

## Repro Steps
1. Navigate to https://myapp.com
2. Click the "Login" button in the top right
3. Observe that nothing happens

## Comments (3)

### John Doe - 1/15/2024 11:00 AM
I've investigated this issue. The problem is in the form validation logic.

### Jane Smith - 1/15/2024 2:30 PM
Created PR #456 to fix this issue.
```

### Example 3: Query Active Bugs

```javascript
// Find all active bugs assigned to current user
await mcpClient.callPrompt("work-items-query-report", {
  project: "MyProject",
  wiql: "SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE [System.WorkItemType] = 'Bug' AND [System.State] = 'Active' AND [System.AssignedTo] = @me"
});
```

**Sample Output:**
```markdown
# Work Items Query Results

**Project:** MyProject
**Total Results:** 5

## Active (5)

- **#12345**: Login button not working
  - Type: Bug, Assigned: John Doe
- **#12346**: Password reset email not sent
  - Type: Bug, Assigned: John Doe
- **#12347**: Dashboard loads slowly
  - Type: Bug, Assigned: John Doe
```

### Example 4: Read Wiki Page

```javascript
// Get formatted wiki page content
await mcpClient.callPrompt("wiki-page-content", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Architecture/API-Design"
});
```

**Sample Output:**
```markdown
# Wiki Page: /Architecture/API-Design

**Project:** MyProject
**Wiki:** MyProject.wiki
**Git Path:** Architecture/API-Design.md

## Sub-pages
- /Architecture/API-Design/REST-Guidelines
- /Architecture/API-Design/Authentication
- /Architecture/API-Design/Versioning

## Content

# API Design Guidelines

This document describes our API design standards...

## RESTful Principles
1. Use nouns for resources
2. Use HTTP methods correctly...
```

### Example 5: Create Work Item (Write Operations)

```javascript
// Create a new bug (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)
await mcpClient.invoke("create-work-item", {
  project: "MyProject",
  workItemType: "Bug",
  fields: {
    "System.Title": "Login page shows 404 error",
    "System.Description": "After deploying v2.3, the login page returns 404",
    "System.AssignedTo": "john@company.com",
    "Microsoft.VSTS.TCM.ReproSteps": "1. Navigate to /login\n2. Observe 404 error",
    "System.Tags": "critical; deployment"
  }
});
```

### Example 6: Update Work Item State

```javascript
// Update work item to Resolved (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)
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
      "value": "Fixed in PR #456. Verified in staging environment."
    }
  ]
});
```

### WIQL Query Language

Work Items queries use WIQL (Work Item Query Language), a SQL-like language:

**Common WIQL Patterns:**

```sql
-- Find all active bugs
SELECT [System.Id], [System.Title]
FROM WorkItems
WHERE [System.WorkItemType] = 'Bug'
  AND [System.State] = 'Active'

-- Find work items changed in last 7 days
SELECT [System.Id], [System.Title], [System.ChangedDate]
FROM WorkItems
WHERE [System.TeamProject] = @project
  AND [System.ChangedDate] > @today - 7

-- Find my active tasks in current sprint
SELECT [System.Id], [System.Title]
FROM WorkItems
WHERE [System.WorkItemType] = 'Task'
  AND [System.AssignedTo] = @me
  AND [System.State] = 'Active'
  AND [System.IterationPath] UNDER @currentIteration

-- Find user stories with specific tag
SELECT [System.Id], [System.Title], [System.Tags]
FROM WorkItems
WHERE [System.WorkItemType] = 'User Story'
  AND [System.Tags] CONTAINS 'authentication'
```

**WIQL Macros:**
- `@me` - Current user
- `@today` - Today's date
- `@project` - Current project
- `@currentIteration` - Current iteration path

## Application Insights Examples

### Example 1: Troubleshoot Production Exceptions

When users report errors in production, quickly investigate with Application Insights:

```javascript
// Get comprehensive exception summary with insights
await mcpClient.callPrompt("appinsights-exception-summary", {
  resourceId: "production-api",
  timespan: "PT1H"  // Last hour
});
```

**Sample Output:**
```markdown
# Application Insights Exception Summary Report

**Resource**: production-api
**Time Range**: PT1H

## Key Insights

- Found 3 unique exception type(s)
- Total exceptions: 47
- Most affected operation: POST /api/orders (42 exceptions)

## Recent Exceptions

| timestamp | type | outerMessage | operation_Name | cloud_RoleName |
| --- | --- | --- | --- | --- |
| 2024-01-15T14:32:15Z | NullReferenceException | Object reference not set | POST /api/orders | OrderAPI |
| 2024-01-15T14:31:58Z | NullReferenceException | Object reference not set | POST /api/orders | OrderAPI |

## Exception Types (Frequency)

| type | Count |
| --- | --- |
| NullReferenceException | 42 |
| TimeoutException | 3 |
| SqlException | 2 |

## Recommendations

- Review the most frequent exception types to identify systemic issues
- Investigate exceptions in critical operations first
- Check for patterns in timestamps (e.g., deployment times, peak traffic)
- Use operation_Id to correlate exceptions with requests and dependencies
```

### Example 2: Performance Analysis

Identify slow operations and optimize performance:

```javascript
// Generate comprehensive performance report
await mcpClient.callPrompt("appinsights-performance-report", {
  resourceId: "production-api",
  timespan: "PT6H"  // Last 6 hours
});
```

**Sample Output:**
```markdown
# Application Insights Performance Report

**Resource**: production-api
**Time Range**: PT6H

## Key Insights

- Slowest operation: GET /api/customers/search (avg: 8234ms)
- Operation with most failures: POST /api/orders (15 failures)

## Operation Performance Summary

| operation_Name | RequestCount | AvgDuration | P95Duration | P99Duration | FailureCount |
| --- | --- | --- | --- | --- | --- |
| GET /api/customers/search | 1523 | 8234 | 12450 | 18900 | 0 |
| POST /api/orders | 4521 | 245 | 450 | 1200 | 15 |
| GET /api/products | 8932 | 45 | 120 | 250 | 0 |

## Slowest Requests (>5s)

| timestamp | name | duration | resultCode | cloud_RoleName |
| --- | --- | --- | --- | --- |
| 2024-01-15T14:30:00Z | GET /api/customers/search | 18934 | 200 | CustomerAPI |
| 2024-01-15T14:25:00Z | GET /api/customers/search | 15234 | 200 | CustomerAPI |

## Performance Recommendations

- Focus optimization efforts on operations with high P95/P99 duration
- Investigate operations with high failure counts
- Monitor operations with high request counts for scalability issues
- Use operation_Id to trace slow requests through dependencies
```

### Example 3: Monitor External Dependencies

Track health of external services and APIs:

```javascript
// Check dependency health for external integrations
await mcpClient.callPrompt("appinsights-dependency-health", {
  resourceId: "production-api",
  timespan: "PT1H"
});
```

**Sample Output:**
```markdown
# Application Insights Dependency Health Report

**Resource**: production-api
**Time Range**: PT1H

## Key Insights

- Affected targets: 2
- Total failed dependency calls: 18
- Most failing target: payment-gateway.company.com (15 failures)

## Failed Dependencies

| timestamp | name | target | type | duration | resultCode | cloud_RoleName |
| --- | --- | --- | --- | --- | --- | --- |
| 2024-01-15T14:32:00Z | POST /charge | payment-gateway.company.com | HTTP | 30000 | 504 | PaymentService |
| 2024-01-15T14:31:45Z | POST /charge | payment-gateway.company.com | HTTP | 30000 | 504 | PaymentService |

## Dependency Success Rates

| target | type | Total | Failed | AvgDuration | SuccessRate |
| --- | --- | --- | --- | --- | --- |
| payment-gateway.company.com | HTTP | 150 | 15 | 2450 | 90.00 |
| crm.database.windows.net | SQL | 4523 | 3 | 45 | 99.93 |
| storage.blob.core.windows.net | Azure blob | 892 | 0 | 23 | 100.00 |

## Recommendations

- Investigate dependencies with success rates below 99%
- Check if external service degradation matches known incidents
- Review timeout configurations for slow dependencies
- Consider implementing circuit breakers for unreliable dependencies
```

### Example 4: SLA Monitoring with Availability Tests

Track uptime and availability for SLA compliance:

```javascript
// Get 24-hour availability report
await mcpClient.callPrompt("appinsights-availability-report", {
  resourceId: "production-web",
  timespan: "PT24H"
});
```

**Sample Output:**
```markdown
# Application Insights Availability Report

**Resource**: production-web
**Time Range**: PT24H

## Availability Test Results

| name | TotalTests | SuccessCount | FailureCount | AvgDuration | SuccessRate |
| --- | --- | --- | --- | --- | --- |
| Homepage Health Check | 1440 | 1438 | 2 | 234 | 99.86 |
| API Ping Test (US East) | 1440 | 1440 | 0 | 156 | 100.00 |
| API Ping Test (EU West) | 1440 | 1432 | 8 | 289 | 99.44 |

## Recommendations

- Investigate any tests with success rates below 99.9%
- Review failed tests for patterns (geographic, time-based)
- Consider adding availability tests for critical endpoints if missing
- Set up alerts for availability degradation
```

### Example 5: Execute Custom KQL Queries

For advanced scenarios, execute custom KQL queries directly:

```javascript
// Find requests with specific error codes
await mcpClient.invoke("appinsights-execute-query", {
  resourceId: "production-api",
  query: `
    requests
    | where timestamp > ago(1h)
    | where resultCode startswith "5"
    | summarize Count=count() by resultCode, operation_Name
    | order by Count desc
  `,
  timespan: "PT1H"
});
```

**Returns raw KQL results:**
```json
{
  "tables": [
    {
      "name": "PrimaryResult",
      "columns": [
        { "name": "resultCode", "type": "string" },
        { "name": "operation_Name", "type": "string" },
        { "name": "Count", "type": "long" }
      ],
      "rows": [
        ["503", "POST /api/orders", 15],
        ["500", "GET /api/customers", 8],
        ["504", "POST /api/payments", 3]
      ]
    }
  ]
}
```

### Example 6: First-Responder Incident Guide

When production issues occur, get a comprehensive troubleshooting guide:

```javascript
// Generate complete troubleshooting workflow
await mcpClient.callPrompt("appinsights-troubleshooting-guide", {
  resourceId: "production-api",
  timespan: "PT1H"
});
```

**Sample Output:**
```markdown
# Application Insights Troubleshooting Guide

**Resource**: production-api
**Time Range**: PT1H

## Health Status Overview

- 🔴 **Exceptions**: 47 exceptions detected
- 🟡 **Performance**: 12 slow requests (>5s)
- 🟡 **Dependencies**: 18 dependency failures

## Top Exceptions

| type | Count | operation_Name |
| --- | --- | --- |
| NullReferenceException | 42 | POST /api/orders |
| TimeoutException | 3 | GET /api/customers |
| SqlException | 2 | POST /api/inventory |

## Slowest Requests

| operation_Name | duration | resultCode |
| --- | --- | --- |
| GET /api/customers/search | 18934 | 200 |
| GET /api/customers/search | 15234 | 200 |

## Failed Dependencies

| target | type | FailureCount |
| --- | --- | --- |
| payment-gateway.company.com | HTTP | 15 |
| crm.database.windows.net | SQL | 3 |

## Troubleshooting Workflow

### Step 1: Identify the Root Cause

1. **Check for exceptions**
   - Review top exception types and affected operations
   - Look for correlation with recent deployments

2. **Analyze performance degradation**
   - Identify which operations are slow
   - Check if slowness coincides with dependency failures

3. **Verify external dependencies**
   - Check if third-party services are degraded
   - Review timeout and retry configurations

### Step 2: Investigate Further

Use these KQL queries for deeper investigation:

```kql
// Find all operations affected by NullReferenceException
exceptions
| where type == "NullReferenceException"
| summarize count() by operation_Name, cloud_RoleName
| order by count_ desc

// Trace request flow with operation_Id
union requests, dependencies, exceptions
| where operation_Id == "YOUR_OPERATION_ID"
| project timestamp, itemType, name, success, resultCode, duration
| order by timestamp asc
```

### Step 3: Mitigate and Monitor

- Roll back recent deployments if exceptions started after deployment
- Enable circuit breakers for failing dependencies
- Increase timeout values if seeing timeout exceptions
- Scale up resources if seeing performance degradation under load

## Next Steps

1. Create incident work item in Azure DevOps
2. Notify on-call engineer if issue persists
3. Review and update runbooks based on findings
4. Set up alerts to catch similar issues earlier
```

### Example 7: List and Select Application Insights Resources

When you have multiple Application Insights resources configured:

```javascript
// List all active Application Insights resources
await mcpClient.invoke("appinsights-list-resources", {});
```

**Sample Output:**
```json
{
  "resources": [
    {
      "id": "production-api",
      "name": "Production API",
      "appId": "12345678-1234-1234-1234-123456789abc",
      "active": true,
      "description": "Main production API telemetry"
    },
    {
      "id": "production-web",
      "name": "Production Web App",
      "appId": "87654321-4321-4321-4321-cba987654321",
      "active": true,
      "description": "Customer-facing web application"
    },
    {
      "id": "staging-api",
      "name": "Staging API",
      "appId": "abcdef12-3456-7890-abcd-ef1234567890",
      "active": false,
      "description": "Staging environment API (inactive)"
    }
  ],
  "totalCount": 3,
  "activeCount": 2,
  "authMethod": "entra-id"
}
```

### Example 8: Get Schema and Available Tables

Before writing custom KQL queries, check available tables and columns:

```javascript
// Get metadata (schema) for Application Insights resource
await mcpClient.invoke("appinsights-get-metadata", {
  resourceId: "production-api"
});
```

**Returns schema information:**
```json
{
  "tables": [
    {
      "name": "requests",
      "columns": [
        { "name": "timestamp", "type": "datetime" },
        { "name": "id", "type": "string" },
        { "name": "name", "type": "string" },
        { "name": "duration", "type": "real" },
        { "name": "resultCode", "type": "string" },
        { "name": "success", "type": "bool" }
      ]
    },
    {
      "name": "exceptions",
      "columns": [
        { "name": "timestamp", "type": "datetime" },
        { "name": "type", "type": "string" },
        { "name": "outerMessage", "type": "string" }
      ]
    }
  ]
}
```

### Common KQL Query Patterns

**Time-based filtering:**
```kql
// Last hour
requests | where timestamp > ago(1h)

// Specific time range
requests | where timestamp between(datetime(2024-01-15) .. datetime(2024-01-16))

// Last 7 days
requests | where timestamp > ago(7d)
```

**Aggregation and grouping:**
```kql
// Count by operation
requests
| summarize Count=count() by operation_Name
| order by Count desc

// Average duration by operation
requests
| summarize AvgDuration=avg(duration), P95=percentile(duration, 95) by operation_Name

// Success rate
requests
| summarize Total=count(), Failures=countif(success == false)
| extend SuccessRate=100.0 * (Total - Failures) / Total
```

**Correlation across telemetry types:**
```kql
// Find all telemetry for a specific operation
let operationId = "abc123";
union requests, dependencies, exceptions, traces
| where operation_Id == operationId
| project timestamp, itemType, name, duration, success
| order by timestamp asc
```

### ISO 8601 Duration Format

Application Insights uses ISO 8601 duration format for timespans:

| Duration | ISO 8601 | Description |
|----------|----------|-------------|
| 15 minutes | PT15M | Last 15 minutes |
| 30 minutes | PT30M | Last 30 minutes |
| 1 hour | PT1H | Last hour |
| 6 hours | PT6H | Last 6 hours |
| 12 hours | PT12H | Last 12 hours |
| 1 day | P1D | Last day (24 hours) |
| 7 days | P7D | Last week |
| 30 days | P30D | Last month |

**Format Rules:**
- Start with `P` (period)
- Add `T` before time components
- Use `D` for days, `H` for hours, `M` for minutes, `S` for seconds
- Examples: `P1DT6H` = 1 day 6 hours, `PT30M` = 30 minutes

## Figma Examples

### Get Complete Design File

```javascript
// Fetch entire Figma design file
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  depth: 3  // Limit depth for large files
});
```

**Output:**
```json
{
  "metadata": {
    "name": "Mobile App Design System",
    "lastModified": "2024-01-15T10:30:00Z"
  },
  "nodes": [
    {
      "id": "1:10",
      "name": "Button/Primary",
      "type": "COMPONENT",
      "layout": {
        "width": 120,
        "height": 40,
        "x": 100,
        "y": 200
      },
      "text": {
        "content": "Click me",
        "fontSize": 16,
        "fontFamily": "Inter"
      }
    }
  ],
  "globalVars": {
    "styles": {
      "style_1": {
        "fill": "#0066FF",
        "opacity": 1
      }
    }
  }
}
```

### Get Specific Nodes

```javascript
// Fetch specific nodes by ID
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  nodeId: "1:10;2:20"  // Multiple nodes separated by semicolon
});
```

## Azure SQL Database Examples

The Azure SQL Database integration provides read-only access for database investigation, schema exploration, and ad-hoc querying with comprehensive security controls.

### 1. Database Schema Discovery

**Natural Language Request:**

```
User: "Show me an overview of the database"

Response:
[uses sql-database-overview prompt internally]

Database Overview:
- 45 tables (containing 2.5M total rows, 1.2 GB)
- 12 views
- 28 stored procedures
- 15 triggers
- 8 user-defined functions

Top 5 largest tables:
1. OrderHistory - 1.2M rows, 450 MB
2. Users - 250K rows, 180 MB
3. Products - 150K rows, 95 MB
4. Transactions - 500K rows, 320 MB
5. AuditLog - 800K rows, 250 MB

All tables are in the 'dbo' schema.
```

### 2. Table Structure Investigation

**Natural Language Request:**

```
User: "What's the structure of the Users table?"

Response:
[uses sql-table-details prompt internally]

Users Table Structure (dbo.Users):
- 250,000 rows
- 15 columns

Key Columns:
- UserId (int, PK, Identity) - Primary key
- UserName (nvarchar(100), NOT NULL) - User login name
- Email (nvarchar(255), NOT NULL) - Email address
- IsActive (bit, NOT NULL, default: 1) - Active status
- CreateDate (datetime, NOT NULL, default: getdate()) - Account creation
- LastLoginDate (datetime, NULL) - Last successful login

Indexes:
- PK_Users (Clustered, Primary Key on UserId)
- IX_Users_Email (Non-clustered, Unique on Email)
- IX_Users_UserName (Non-clustered, Unique on UserName)
- IX_Users_IsActive_CreateDate (Non-clustered on IsActive, CreateDate)

Foreign Key Relationships:
- UserRoles.UserId → Users.UserId (One-to-Many)
- Orders.UserId → Users.UserId (One-to-Many)
- AuditLog.UserId → Users.UserId (One-to-Many)
```

### 3. Data Investigation

**Natural Language Request:**

```
User: "Show me the 10 most recent active users"

Response:
[uses sql-execute-query tool internally]

Query executed:
SELECT TOP 10 UserId, UserName, Email, CreateDate, LastLoginDate
FROM dbo.Users
WHERE IsActive = 1
ORDER BY CreateDate DESC

Results (10 rows):
| UserId | UserName    | Email                  | CreateDate          | LastLoginDate       |
|--------|-------------|------------------------|---------------------|---------------------|
| 15234  | jdoe2025    | jdoe@example.com       | 2025-01-15 09:23:45 | 2025-01-16 14:32:10 |
| 15233  | asmith99    | asmith@example.com     | 2025-01-14 16:45:12 | 2025-01-15 08:15:33 |
| 15232  | mwilliams   | mwilliams@example.com  | 2025-01-14 11:22:03 | NULL                |
...
```

### 4. Exploring Database Objects

**Listing All Views:**

```
User: "What views are available in the database?"

Response:
[uses sql-list-views tool internally]

Found 12 views:

1. dbo.vw_ActiveUsers
   - Shows active users with their last login dates

2. dbo.vw_OrderSummary
   - Aggregates order information by user

3. dbo.vw_ProductInventory
   - Current product inventory levels with warehouse locations

4. dbo.vw_UserPermissions
   - Consolidated view of user roles and permissions

[... 8 more views ...]
```

**Viewing Stored Procedures:**

```
User: "List all stored procedures"

Response:
[uses sql-list-stored-procedures tool internally]

Found 28 stored procedures:

Recent Procedures:
1. dbo.usp_GetUserOrders (Modified: 2025-01-10)
2. dbo.usp_UpdateInventory (Modified: 2025-01-08)
3. dbo.usp_ProcessPayment (Modified: 2025-01-05)
4. dbo.usp_GenerateMonthlyReport (Modified: 2024-12-28)
...
```

### 5. Testing Database Connectivity

**Connection Verification:**

```
User: "Can you verify the database connection?"

Response:
[uses sql-test-connection tool internally]

Database Connection Test:
✅ Connected successfully

Server Information:
- SQL Server Version: Microsoft SQL Server 2022 (RTM) - 16.0.1000.6
- Database: ProductionDB
- User: mcp_readonly (read-only access)
- Server Time: 2025-01-16 10:35:22 UTC

Connection is healthy and ready for queries.
```

### 6. Investigating Triggers

**Finding Automated Operations:**

```
User: "What triggers are set up on the Users table?"

Response:
[uses sql-list-triggers tool internally]

Found 2 triggers on dbo.Users:

1. trg_Users_AuditInsert (ENABLED)
   - Event: AFTER INSERT
   - Purpose: Logs new user creation to AuditLog table

2. trg_Users_AuditUpdate (ENABLED)
   - Event: AFTER UPDATE
   - Purpose: Logs user profile changes to AuditLog table

Both triggers are active and will execute on their respective events.
```

### 7. Understanding Functions

**Reviewing Business Logic:**

```
User: "What user-defined functions exist?"

Response:
[uses sql-list-functions tool internally]

Found 8 user-defined functions:

Scalar Functions:
1. dbo.fn_CalculateDiscount (Returns: decimal)
   - Calculates user discount based on loyalty points

2. dbo.fn_GetUserFullName (Returns: nvarchar(255))
   - Concatenates first and last name

3. dbo.fn_IsEligibleForPromotion (Returns: bit)
   - Checks if user qualifies for promotions

Table-Valued Functions:
4. dbo.fn_GetUserOrderHistory (Returns: TABLE)
   - Returns order history for a specific user

5. dbo.fn_SearchProducts (Returns: TABLE)
   - Performs product search with filters
...
```

### 8. Viewing Object Definitions

**Getting View Definition:**

```
User: "Show me the definition of vw_ActiveUsers"

Response:
[uses sql-get-object-definition tool internally]

View Definition (dbo.vw_ActiveUsers):

CREATE VIEW dbo.vw_ActiveUsers AS
SELECT
    u.UserId,
    u.UserName,
    u.Email,
    u.CreateDate,
    u.LastLoginDate,
    DATEDIFF(DAY, u.LastLoginDate, GETDATE()) AS DaysSinceLastLogin
FROM dbo.Users u
WHERE u.IsActive = 1
    AND u.DeletedDate IS NULL
```

### 9. Complex Query Investigation

**Multi-Table Analysis:**

```
User: "Show me users who have placed orders in the last 30 days"

Response:
[uses sql-execute-query tool with JOIN query internally]

Query executed:
SELECT DISTINCT
    u.UserId,
    u.UserName,
    u.Email,
    COUNT(o.OrderId) AS OrderCount,
    MAX(o.OrderDate) AS LastOrderDate
FROM dbo.Users u
INNER JOIN dbo.Orders o ON u.UserId = o.UserId
WHERE o.OrderDate >= DATEADD(DAY, -30, GETDATE())
GROUP BY u.UserId, u.UserName, u.Email
ORDER BY OrderCount DESC

Results (25 rows):
| UserId | UserName   | Email               | OrderCount | LastOrderDate       |
|--------|------------|---------------------|------------|---------------------|
| 1423   | jsmith     | jsmith@example.com  | 8          | 2025-01-15 14:23:10 |
| 2891   | mjohnson   | mjohnson@example.com| 6          | 2025-01-14 09:45:33 |
...
```

### 10. Safety and Security Features

**Read-Only Protection:**

```
User: "Can you delete inactive users for me?"

Response:
❌ Cannot execute query: Write operation detected.

The Azure SQL Database integration is read-only by design.
Only SELECT queries are permitted for security.

Blocked operations: INSERT, UPDATE, DELETE, DROP, EXEC, TRUNCATE, ALTER, etc.

If you need to modify data:
1. Connect to the database using a standard SQL client
2. Use an admin account with write permissions
3. Execute the modification in a controlled environment
```

**Query Validation:**

```
User: "Run this query: SELECT * FROM Users; DROP TABLE AuditLog; --"

Response:
❌ Cannot execute query: Dangerous SQL keyword detected: DROP

For security, the following are blocked:
- Schema modifications (DROP, CREATE, ALTER, TRUNCATE)
- Data modifications (INSERT, UPDATE, DELETE, MERGE)
- Procedure execution (EXEC, EXECUTE)
- System procedures (sp_*, xp_*)

Please use SELECT queries only for data investigation.
```

### 11. Result Limiting

**Large Result Handling:**

```
User: "Show me all users"

Response:
[uses sql-execute-query with SELECT * FROM Users internally]

Query executed successfully.

⚠️ Results truncated - Query returned more than 1000 rows.
Showing first 1000 rows (out of 250,000 total).

To see specific data:
1. Add WHERE clause to filter results
2. Use TOP N to limit results
3. Add ORDER BY to control which rows are returned

Example: SELECT TOP 100 * FROM Users WHERE IsActive = 1 ORDER BY CreateDate DESC
```

### 12. Database Documentation Workflow

**Complete Investigation Process:**

```
User: "I need to document the Users and Orders relationship for new developers"

AI Agent Workflow:
1. Get database overview → Identify Users and Orders tables
2. Get Users table schema → Document columns, indexes, keys
3. Get Orders table schema → Document columns, indexes, keys
4. Identify foreign key: Orders.UserId → Users.UserId
5. Query sample data → Show example records
6. Check for views → Find vw_UserOrders view
7. Get view definition → Document the join logic
8. Generate comprehensive markdown documentation

Final Output: Complete relationship diagram with column details, sample queries, and usage examples.
```

---

## Integration Use Cases

### Use Case 1: AI-Assisted Development with Context

When working on a feature, the AI can automatically search relevant wiki documentation:

```
User: "I need to implement OAuth authentication for our API"

AI Agent:
1. Searches wiki: search-wiki-pages with "OAuth authentication"
2. Finds and reads: get-wiki-page for /Architecture/Authentication/OAuth-Setup
3. Queries related work items: query-work-items for authentication tasks
4. Provides implementation guidance based on your organization's standards
```

### Use Case 2: Automated Work Item Management

AI can help manage work items throughout development:

```
User: "I fixed bug #12345, mark it as resolved"

AI Agent:
1. Gets work item details: get-work-item
2. Updates state: update-work-item to "Resolved"
3. Adds comment: add-work-item-comment with fix details
4. Links to PR if available
```

### Use Case 3: Sprint Planning Assistant

AI can analyze sprint work items and provide insights:

```
User: "Show me all active bugs in our current sprint"

AI Agent:
1. Executes WIQL query: query-work-items
2. Groups results: work-items-query-report by priority/state
3. Identifies blockers and dependencies
4. Suggests prioritization based on severity
```

### Use Case 4: Documentation Discovery

AI can search and summarize documentation across wiki pages:

```
User: "How do we handle database migrations in our projects?"

AI Agent:
1. Searches wikis: search-wiki-pages for "database migrations"
2. Reads relevant pages: wiki-page-content for each result
3. Summarizes best practices from your team's documentation
4. Provides code examples from wiki pages
```

### Use Case 5: Design System Implementation

AI can extract design specifications from Figma:

```
User: "What are the primary button styles in our design system?"

AI Agent:
1. Fetches Figma data: get-figma-data for design system file
2. Finds button components
3. Extracts colors, typography, spacing
4. Generates CSS/code snippets
```

### Use Case 6: Cross-Platform Development

Combine PowerPlatform, Azure DevOps, and Figma for full-stack development:

```
User: "I'm building a customer portal. Show me the design specs, related work items, and PowerPlatform entities"

AI Agent:
1. Figma: get-figma-data for portal designs
2. Azure DevOps: query-work-items for portal-related tasks
3. PowerPlatform: get-entity-metadata for customer/account entities
4. Provides integrated view with design specs, task status, and data model
```
