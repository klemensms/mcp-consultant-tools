# PowerPlatform MCP Server

A Model Context Protocol (MCP) server that provides intelligent access to PowerPlatform/Dataverse entities and records. This tool offers context-aware assistance, entity exploration and metadata access.

Key features:
- Rich entity metadata exploration with formatted, context-aware prompts
- Advanced OData query support with intelligent filtering
- Comprehensive relationship mapping and visualization
- AI-assisted query building and data modeling through AI agent
- Full access to entity attributes, relationships, and global option sets

## Installation

You can install and run this tool in two ways:

### Option 1: Install globally

```bash
npm install -g powerplatform-mcp
```

Then run it:

```bash
powerplatform-mcp
```

### Option 2: Run directly with npx

Run without installing:

```bash
npx powerplatform-mcp
```

## Configuration

Before running, set the following environment variables:

```bash
# PowerPlatform/Dataverse connection details
POWERPLATFORM_URL=https://yourenvironment.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=your-azure-app-client-id
POWERPLATFORM_CLIENT_SECRET=your-azure-app-client-secret
POWERPLATFORM_TENANT_ID=your-azure-tenant-id
```

## Usage

This is an MCP server designed to work with MCP-compatible clients like Cursor, Claude App and GitHub Copilot. Once running, it will expose tools for retrieving PowerPlatform entity metadata and records.

### Available Tools

#### Entity Metadata & Data Tools
- `get-entity-metadata`: Get metadata about a PowerPlatform entity
- `get-entity-attributes`: Get attributes/fields of a PowerPlatform entity
- `get-entity-attribute`: Get a specific attribute/field of a PowerPlatform entity
- `get-entity-relationships`: Get relationships for a PowerPlatform entity
- `get-global-option-set`: Get a global option set definition
- `get-record`: Get a specific record by entity name and ID
- `query-records`: Query records using an OData filter expression
- `use-powerplatform-prompt`: Use pre-defined prompt templates for PowerPlatform entities

#### Plugin Registration & Validation Tools
- `get-plugin-assemblies`: List all plugin assemblies in the environment
- `get-plugin-assembly-complete`: Get comprehensive plugin assembly information including all types, steps, images, and automatic validation
- `get-entity-plugin-pipeline`: Get all plugins that execute on a specific entity, organized by message and execution order
- `get-plugin-trace-logs`: Query plugin trace logs with filtering and exception parsing

## MCP Prompts

The server includes a prompts feature that provides formatted, context-rich information about PowerPlatform entities.

### Available Prompt Types

#### Entity Prompts
The `use-powerplatform-prompt` tool supports the following prompt types:

1. **ENTITY_OVERVIEW**: Comprehensive overview of an entity
2. **ATTRIBUTE_DETAILS**: Detailed information about a specific entity attribute
3. **QUERY_TEMPLATE**: OData query template for an entity with example filters
4. **RELATIONSHIP_MAP**: Visual map of entity relationships

#### Plugin Prompts
5. **plugin-deployment-report**: Generate a comprehensive deployment report for a plugin assembly with validation warnings
6. **entity-plugin-pipeline-report**: Generate a visual execution pipeline showing all plugins for an entity in order

### Examples

#### Entity Overview Prompt

```javascript
// Example client code
await mcpClient.invoke("use-powerplatform-prompt", {
  promptType: "ENTITY_OVERVIEW",
  entityName: "account"
});
```

**Output:**
```
## Power Platform Entity: account

This is an overview of the 'account' entity in Microsoft Power Platform/Dataverse:

### Entity Details
- Display Name: Account
- Schema Name: Account
- Description: Business that represents a customer or potential customer
- Primary Key: accountid
- Primary Name: name

### Key Attributes
- name: String (Account Name)
- emailaddress1: String (Email)
- telephone1: String (Main Phone)
- address1_city: String (City)
- statecode: Status (Status)
- accountnumber: String (Account Number)
- industrycode: OptionSetValue (Industry)
- revenue: Money (Annual Revenue)
- ownerid: Owner (Owner)
- createdon: DateTime (Created On)

### Relationships
- One-to-Many Relationships: 42
- Many-to-Many Relationships: 8

You can query this entity using OData filters against the plural name.
```

#### Attribute Details Prompt

```javascript
await mcpClient.invoke("use-powerplatform-prompt", {
  promptType: "ATTRIBUTE_DETAILS",
  entityName: "account",
  attributeName: "revenue"
});
```

**Output:**
```
## Attribute: revenue

Details for the 'revenue' attribute of the 'account' entity:

- Display Name: Annual Revenue
- Description: Annual revenue for the account
- Type: Money
- Format: Currency
- Is Required: No
- Is Searchable: true

### Usage Notes
- Data Type: Money
- Required: No
- Max Length: N/A
```

#### Query Template Prompt

```javascript
await mcpClient.invoke("use-powerplatform-prompt", {
  promptType: "QUERY_TEMPLATE",
  entityName: "account"
});
```

**Output:**
```
## OData Query Template for accounts

Use this template to build queries against the accounts entity:
accounts?$select=name,emailaddress1,telephone1, address1_city,statecode&$filter=name eq 'Example'&$orderby=name asc&$top=50
```

### Common Filter Examples
- Equals: `name eq 'Contoso'`
- Contains: `contains(name, 'Contoso')`
- Greater than date: `createdon gt 2023-01-01T00:00:00Z`
- Multiple conditions: `name eq 'Contoso' and statecode eq 0`
```

#### Relationship Map Prompt

```javascript
await mcpClient.invoke("use-powerplatform-prompt", {
  promptType: "RELATIONSHIP_MAP",
  entityName: "contact"
});
```

**Output:**
```
## Relationship Map for contact

This shows all relationships for the 'contact' entity:

### One-to-Many Relationships (contact as Primary)
- contact_activity_parties: contact (1) → activityparty (N)
- contact_connections1: contact (1) → connection (N)
- contact_connections2: contact (1) → connection (N)
- contact_customer_contacts: contact (1) → contact (N)
- contact_master_contact: contact (1) → contact (N)

### One-to-Many Relationships (contact as Related)
- account_primary_contact: account (1) → contact (N)
- customer_contacts: customer (1) → contact (N)
- system_user_contacts: systemuser (1) → contact (N)

### Many-to-Many Relationships
- contactleads_association: contact (N) ↔ lead (N)
- contactopportunities_association: contact (N) ↔ opportunity (N)
- contactquotes_association: contact (N) ↔ quote (N)
```

## Prompt Examples

Here are some examples of how you can interact with assistant using the PowerPlatform MCP prompts:

### 1. Entity Understanding

You can ask assistant about entities in natural language:

```
User: "Tell me about the Account entity in our PowerPlatform environment"

Response:
[uses ENTITY_OVERVIEW prompt internally]

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

You can ask for help constructing queries:

```
User: "Help me write a query to find active accounts with revenue over $1M in California"

Response:
[uses QUERY_TEMPLATE prompt internally]

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

You can explore entity relationships naturally:

```
User: "How are Accounts and Contacts related in our system?"

Response:
[uses RELATIONSHIP_MAP prompt for both entities internally]

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

You can ask about specific fields:

```
User: "What kind of field is the revenue field on Account?"

Response:
[uses ATTRIBUTE_DETAILS prompt internally]

The revenue field on Account is:
- Data Type: Money
- Format: Currency
- Not required
- Searchable: Yes
- Used for: Tracking annual revenue for the account
- Can be used in advanced find and filtered views
```

### 5. Complex Data Modeling

You can get help with data modeling decisions:

```
User: "I need to design a solution for tracking product reviews. Which entities should I relate to?"

Response:
[uses multiple ENTITY_OVERVIEW and RELATIONSHIP_MAP prompts internally]

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

You can get help troubleshooting:

```
User: "Why am I getting 'invalid property' when querying account.customertypecode?"

Response:
[uses ATTRIBUTE_DETAILS prompt internally]

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

These examples show how AI assistant can leverage the MCP prompts to provide context-aware, accurate assistance for PowerPlatform development tasks. The AI understands your environment's specific configuration and can help with both simple queries and complex architectural decisions.

## Plugin Registration & Validation

The server includes powerful tools for plugin discovery, validation, and troubleshooting. These tools eliminate the need for the Plugin Registration Tool for most inspection tasks and enable AI-assisted PR reviews.

### Use Cases

#### 1. Discover Plugin Assemblies
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

#### 2. Validate Plugin Deployment (PR Review)
```javascript
// Get comprehensive assembly info with automatic validation
await mcpClient.invoke("get-plugin-assembly-complete", {
  assemblyName": "MyCompany.Plugins",
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

#### 3. View Entity Plugin Pipeline
```javascript
// See all plugins that run on an entity in execution order
await mcpClient.invoke("get-entity-plugin-pipeline", {
  entityName": "account",
  messageFilter": "Update"  // Optional: filter by message
});
```

**Shows:**
- All plugins organized by stage and rank
- Execution order
- Filtering attributes per step
- Images configured
- Assembly versions

#### 4. Troubleshoot with Trace Logs
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

When reviewing plugin PRs, use the `plugin-deployment-report` prompt for a human-readable validation report:

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

## Azure DevOps Integration

In addition to PowerPlatform capabilities, this MCP server provides comprehensive Azure DevOps integration for accessing wikis and work items across your organization.

### Azure DevOps Configuration

Set the following environment variables to enable Azure DevOps integration:

```bash
# Required: Azure DevOps organization and authentication
AZUREDEVOPS_ORGANIZATION=your-organization-name
AZUREDEVOPS_PAT=your-personal-access-token
AZUREDEVOPS_PROJECTS=Project1,Project2,Project3  # Comma-separated list of allowed projects

# Optional: API version (default: 7.1)
AZUREDEVOPS_API_VERSION=7.1

# Optional: Feature flags to control write/delete operations (default: false for all)
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true   # Enable create/update work items
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true  # Enable delete work items
AZUREDEVOPS_ENABLE_WIKI_WRITE=true        # Enable create/update wiki pages
```

#### Creating a Personal Access Token (PAT)

1. Go to Azure DevOps → User Settings → Personal Access Tokens
2. Click "New Token"
3. Set required scopes:
   - **Wiki**: `vso.wiki` (Read)
   - **Work Items**: `vso.work` (Read) and optionally `vso.work_write` (Read & Write)
   - **Search**: `vso.search` (Read - for wiki search)
4. Copy the token and set it in `AZUREDEVOPS_PAT` environment variable

**Security Note**: The PAT is scoped to specific permissions and projects. For maximum security, create separate PATs for read-only vs write operations.

### Available Azure DevOps Tools

#### Wiki Tools (5 tools)
- `get-wikis`: List all wikis in a project
- `search-wiki-pages`: Search wiki content across projects with highlighting
- `get-wiki-page`: Get specific wiki page content and metadata
- `create-wiki-page`: Create new wiki page (requires `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`)
- `update-wiki-page`: Update existing wiki page (requires `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`)

#### Work Item Tools (7 tools)
- `get-work-item`: Get work item by ID with full details
- `query-work-items`: Execute WIQL queries to find work items
- `get-work-item-comments`: Get discussion comments for a work item
- `add-work-item-comment`: Add comment to work item (requires `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`)
- `update-work-item`: Update work item fields using JSON Patch (requires `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`)
- `create-work-item`: Create new work item (requires `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`)
- `delete-work-item`: Delete work item (requires `AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true`)

### Available Azure DevOps Prompts

The server includes 4 prompts for formatted, human-readable Azure DevOps data:

1. **wiki-search-results**: Search wiki pages and get formatted results with content snippets
2. **wiki-page-content**: Get formatted wiki page with navigation context
3. **work-item-summary**: Comprehensive work item summary with details and comments
4. **work-items-query-report**: Execute WIQL query and get results grouped by state/type

### Azure DevOps Usage Examples

#### Example 1: Search Wiki Documentation

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

#### Example 2: Get Work Item with Comments

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

#### Example 3: Query Active Bugs

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

#### Example 4: Read Wiki Page

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

#### Example 5: Create Work Item (Write Operations)

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

#### Example 6: Update Work Item State

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

### Integration Use Cases

#### Use Case 1: AI-Assisted Development with Context

When working on a feature, the AI can automatically search relevant wiki documentation:

```
User: "I need to implement OAuth authentication for our API"

AI Agent:
1. Searches wiki: search-wiki-pages with "OAuth authentication"
2. Finds and reads: get-wiki-page for /Architecture/Authentication/OAuth-Setup
3. Queries related work items: query-work-items for authentication tasks
4. Provides implementation guidance based on your organization's standards
```

#### Use Case 2: Automated Work Item Management

AI can help manage work items throughout development:

```
User: "I fixed bug #12345, mark it as resolved"

AI Agent:
1. Gets work item details: get-work-item
2. Updates state: update-work-item to "Resolved"
3. Adds comment: add-work-item-comment with fix details
4. Links to PR if available
```

#### Use Case 3: Sprint Planning Assistant

AI can analyze sprint work items and provide insights:

```
User: "Show me all active bugs in our current sprint"

AI Agent:
1. Executes WIQL query: query-work-items
2. Groups results: work-items-query-report by priority/state
3. Identifies blockers and dependencies
4. Suggests prioritization based on severity
```

#### Use Case 4: Documentation Discovery

AI can search and summarize documentation across wiki pages:

```
User: "How do we handle database migrations in our projects?"

AI Agent:
1. Searches wikis: search-wiki-pages for "database migrations"
2. Reads relevant pages: wiki-page-content for each result
3. Summarizes best practices from your team's documentation
4. Provides code examples from wiki pages
```

### Security and Access Control

The Azure DevOps integration respects your organization's security boundaries:

1. **Project Scoping**: Only projects listed in `AZUREDEVOPS_PROJECTS` are accessible
2. **PAT Permissions**: Access is limited to PAT scopes (read-only, read-write, etc.)
3. **Feature Flags**: Write operations are disabled by default and must be explicitly enabled
4. **Audit Trail**: All API operations are logged in Azure DevOps audit logs

**Recommended Setup for Different Scenarios:**

**Read-Only (Documentation/Research):**
```bash
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=false
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=false
AZUREDEVOPS_ENABLE_WIKI_WRITE=false
# PAT with: vso.wiki (read), vso.work (read), vso.search (read)
```

**Developer Workflow (Read + Comment):**
```bash
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true   # Can update work items and add comments
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=false # Cannot delete
AZUREDEVOPS_ENABLE_WIKI_WRITE=false       # Cannot modify wikis
# PAT with: vso.wiki (read), vso.work_write (read/write), vso.search (read)
```

**Full Access (Team Lead/Admin):**
```bash
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true
AZUREDEVOPS_ENABLE_WIKI_WRITE=true
# PAT with: vso.wiki (read/write), vso.work_write (read/write), vso.search (read)
```

## License

MIT
