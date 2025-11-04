# Usage Guide

This guide provides practical examples and use cases for the MCP Consultant Tools.

## Table of Contents

- [PowerPlatform Examples](#powerplatform-examples)
- [Azure DevOps Examples](#azure-devops-examples)
- [Figma Examples](#figma-examples)
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
