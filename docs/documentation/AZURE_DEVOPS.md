# Azure DevOps Integration

Complete documentation for the Azure DevOps integration in `mcp-consultant-tools`.

## Table of Contents

1. [Overview](#overview)
   - [What is Azure DevOps?](#what-is-azure-devops)
   - [Why Use This Integration?](#why-use-this-integration)
   - [Key Features](#key-features)

2. [Setup](#setup)
   - [Prerequisites](#prerequisites)
   - [Creating a Personal Access Token (PAT)](#creating-a-personal-access-token-pat)
   - [Environment Variables](#environment-variables)
   - [Configuration Example](#configuration-example)

3. [Tools (13 Total)](#tools-13-total)
   - [Wiki Tools (6)](#wiki-tools)
   - [Work Item Tools (7)](#work-item-tools)

4. [Prompts (4 Total)](#prompts-4-total)
   - [Wiki Prompts (2)](#wiki-prompts)
   - [Work Item Prompts (2)](#work-item-prompts)

5. [Usage Examples](#usage-examples)
   - [Wiki Documentation Search](#wiki-documentation-search)
   - [Work Item Management](#work-item-management)
   - [Cross-Service Correlation](#cross-service-correlation)

6. [Best Practices](#best-practices)
   - [Security](#security)
   - [Performance](#performance)
   - [Access Control](#access-control)

7. [Troubleshooting](#troubleshooting)
   - [Common Errors](#common-errors)
   - [Authentication Issues](#authentication-issues)
   - [Permission Problems](#permission-problems)

---

## Overview

### What is Azure DevOps?

Azure DevOps is Microsoft's DevOps platform that provides:
- **Azure Boards**: Work item tracking (epics, features, user stories, tasks, bugs)
- **Azure Repos**: Git repositories and version control
- **Azure Pipelines**: CI/CD automation
- **Azure Test Plans**: Test management
- **Azure Artifacts**: Package management
- **Azure Wiki**: Documentation and knowledge base

This integration provides programmatic access to Azure DevOps Wikis and Work Items.

### Why Use This Integration?

**Primary Use Cases:**
1. **Documentation Search**: Quickly find information in wiki pages without navigating the web UI
2. **Work Item Analysis**: Retrieve bug/task/story details programmatically for analysis
3. **Cross-Service Correlation**: Link work items with source code (GitHub Enterprise), deployments (PowerPlatform), and runtime telemetry (Application Insights)
4. **Automated Updates**: Programmatically update work items and wiki pages
5. **Workflow Automation**: Create work items, add comments, update states
6. **Knowledge Extraction**: Extract content from wiki pages for documentation generation

### Key Features

- **Wiki Search & Access**: Full-text search across wiki pages with content highlighting
- **Work Item Queries**: Execute WIQL (Work Item Query Language) to find specific items
- **Path Auto-Conversion**: Automatically converts git paths to wiki paths
- **Write Operations**: Create/update wiki pages and work items (when enabled)
- **Formatted Prompts**: Human-readable reports for search results and work item summaries
- **Project-Based Access Control**: Restrict access to specified projects only
- **Comment Management**: Read and add comments to work items
- **Field Updates**: Update work item fields using JSON Patch operations

---

## Setup

### Prerequisites

1. **Azure DevOps Organization**: Access to an Azure DevOps organization
2. **Project Access**: Member or contributor access to projects you want to query
3. **Personal Access Token**: Ability to create PATs in your organization

### Creating a Personal Access Token (PAT)

**Step 1: Navigate to PAT Settings**

1. Go to Azure DevOps: `https://dev.azure.com/<your-organization>/_usersSettings/tokens`
2. Click **"New Token"**

**Step 2: Configure Token**

1. **Name**: "MCP Azure DevOps Integration" (or your preferred name)
2. **Organization**: Select your organization (or All accessible organizations)
3. **Expiration**: Set expiration date
   - Recommended: 90 days or less for security
   - Organizations may enforce maximum expiration
4. **Scopes**: Select based on operations you need

**Scopes for Read-Only Access:**
- ✅ **Code**: `vso.code` (Read) - For wiki access
- ✅ **Work Items**: `vso.work` (Read) - For work item access
- ✅ **Search**: `vso.search` (Read) - For wiki search

**Scopes for Read/Write Access:**
- ✅ **Code**: `vso.code_write` (Read & Write) - For wiki write operations
- ✅ **Work Items**: `vso.work_write` (Read & Write) - For work item create/update
- ✅ **Search**: `vso.search` (Read) - For wiki search

**Step 3: Create and Save Token**

1. Click **"Create"**
2. **CRITICAL**: Copy the token immediately → This is your `AZUREDEVOPS_PAT`
   - The token value is only shown once
   - If you lose it, you must create a new token

**Step 4: Store Token Securely**

- Store in environment variable (not in code)
- Use secret management in production (Azure Key Vault, etc.)
- Never commit tokens to version control

**Security Notes:**
- PATs have the same permissions as your user account
- Rotate PATs regularly (before expiration)
- Revoke unused PATs immediately
- Use minimal required scopes (principle of least privilege)
- Monitor PAT usage via Azure DevOps audit logs

### Environment Variables

Configure the following environment variables:

```bash
# Azure DevOps Configuration (Required)
AZUREDEVOPS_ORGANIZATION=your-organization-name
AZUREDEVOPS_PAT=your-personal-access-token
AZUREDEVOPS_PROJECTS=Project1,Project2

# API Configuration (Optional)
AZUREDEVOPS_API_VERSION=7.1

# Write Operations Control (Optional - defaults to false)
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=false
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=false
AZUREDEVOPS_ENABLE_WIKI_WRITE=false
```

**Environment Variable Details:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AZUREDEVOPS_ORGANIZATION` | Yes | - | Organization name (e.g., `mycompany`, not full URL) |
| `AZUREDEVOPS_PAT` | Yes | - | Personal Access Token |
| `AZUREDEVOPS_PROJECTS` | Yes | - | Comma-separated list of allowed projects (exact names, case-sensitive) |
| `AZUREDEVOPS_API_VERSION` | No | `7.1` | Azure DevOps REST API version |
| `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE` | No | `false` | Enable work item create/update operations |
| `AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE` | No | `false` | Enable work item delete operations |
| `AZUREDEVOPS_ENABLE_WIKI_WRITE` | No | `false` | Enable wiki create/update operations |

**Important Notes:**
- `AZUREDEVOPS_ORGANIZATION`: Use organization name only, NOT the full URL
  - ✅ Correct: `mycompany`
  - ❌ Incorrect: `https://dev.azure.com/mycompany`
- `AZUREDEVOPS_PROJECTS`: Project names are case-sensitive and must match exactly
- Write operations require explicit enablement via environment flags

### Configuration Example

**Claude Desktop (`claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/azure-devops"],
      "env": {
        "AZUREDEVOPS_ORGANIZATION": "mycompany",
        "AZUREDEVOPS_PAT": "your-pat-token-here",
        "AZUREDEVOPS_PROJECTS": "ProjectA,ProjectB",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false"
      }
    }
  }
}
```

**VS Code MCP Extension (`settings.json`):**

```json
{
  "mcp.servers": {
    "azure-devops": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/azure-devops"],
      "env": {
        "AZUREDEVOPS_ORGANIZATION": "mycompany",
        "AZUREDEVOPS_PAT": "your-pat-token-here",
        "AZUREDEVOPS_PROJECTS": "ProjectA,ProjectB",
        "AZUREDEVOPS_API_VERSION": "7.1"
      }
    }
  }
}
```

**Local Development (`.env` file):**

```bash
# Azure DevOps
AZUREDEVOPS_ORGANIZATION=mycompany
AZUREDEVOPS_PAT=your-pat-token-here
AZUREDEVOPS_PROJECTS=ProjectA,ProjectB,ProjectC
AZUREDEVOPS_API_VERSION=7.1
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=false
AZUREDEVOPS_ENABLE_WIKI_WRITE=true
```

---

## Tools (13 Total)

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

**Use Cases:**
- Discover available wikis in a project
- List wiki types (project vs code wikis)
- Get wiki IDs for page queries

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
  - **Page path** (wiki format, ready for get-wiki-page)
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

**Use Cases:**
- Find documentation by keyword
- Locate specific procedures or guidelines
- Search release notes for changes

**Important:** The returned `path` field is automatically converted to wiki format and can be used directly with `get-wiki-page`.

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

**Use Cases:**
- Read documentation content
- Extract page markdown for processing
- Navigate wiki hierarchy

**Path Conversion:** Automatically converts git paths (ending in `.md`) to wiki paths if needed. Paths from `search-wiki-pages` work directly.

---

#### create-wiki-page

Create a new wiki page.

**⚠️ REQUIRES: `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`**

**Parameters:**
- `project` (string, required): Project name
- `wikiId` (string, required): Wiki identifier
- `pagePath` (string, required): Path for the new page (wiki format)
- `content` (string, required): Markdown content for the page

**Returns:**
- Created page metadata

**Example:**
```javascript
await mcpClient.invoke("create-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Architecture/New Design",
  content: "# New Design\n\nThis is the content..."
});
```

**Use Cases:**
- Programmatically create documentation
- Generate wiki pages from templates
- Automate documentation updates

---

#### update-wiki-page

Update an existing wiki page.

**⚠️ REQUIRES: `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`**

**Parameters:**
- `project` (string, required): Project name
- `wikiId` (string, required): Wiki identifier
- `pagePath` (string, required): Page path (wiki format)
- `content` (string, required): New markdown content
- `version` (string, required): Current page version (ETag) for optimistic concurrency

**Returns:**
- Updated page metadata

**Example:**
```javascript
// First, get current version
const currentPage = await mcpClient.invoke("get-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Architecture/API Design"
});

// Then update with version
await mcpClient.invoke("update-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Architecture/API Design",
  content: "# Updated content...",
  version: currentPage.eTag  // For concurrency control
});
```

**Use Cases:**
- Update documentation programmatically
- Automate release notes generation
- Sync documentation with code changes

**Important:** Requires current page version (ETag) to prevent concurrent edit conflicts.

---

#### azuredevops-str-replace-wiki-page

Replace a specific string in a wiki page without rewriting entire content. **Much more efficient** than `update-wiki-page` for small changes.

**⚠️ REQUIRES: `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`**

**Parameters:**
- `project` (string, required): Project name
- `wikiId` (string, required): Wiki identifier
- `pagePath` (string, required): Page path (wiki format, e.g., '/SharePoint-Online/04-DEV-Configuration')
- `old_str` (string, required): Exact string to replace (must be unique unless `replace_all=true`)
- `new_str` (string, required): Replacement string
- `replace_all` (boolean, optional, default: false): If true, replace all occurrences; if false, `old_str` must be unique
- `description` (string, optional): Description of the change for audit logging

**Returns:**
- Success status
- Diff output (unified format showing line numbers and changes)
- Number of occurrences replaced
- Updated page version
- Success message

**Example 1: Simple Date Update**
```javascript
await mcpClient.invoke("azuredevops-str-replace-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/SharePoint-Online/04-DEV-Configuration",
  old_str: "Last Verified: November 5, 2025",
  new_str: "Last Verified: November 10, 2025",
  description: "Update verification date"
});

// Returns:
// {
//   success: true,
//   diff: "@@ Line 42 @@\n- Last Verified: November 5, 2025\n+ Last Verified: November 10, 2025",
//   occurrences: 1,
//   version: "W/\"datetime'2025-11-10T15%3A30%3A00.000Z'\"",
//   message: "Successfully replaced 1 occurrence(s)"
// }
```

**Example 2: Multi-Environment Updates**
```javascript
// Update across DEV/UAT/PROD environments
const environments = ['DEV', 'UAT', 'PROD'];
for (const env of environments) {
  await mcpClient.invoke("azuredevops-str-replace-wiki-page", {
    project: "MyProject",
    wikiId: "MyProject.wiki",
    pagePath: `/SharePoint-Online/04-${env}-Configuration`,
    old_str: "Last Verified: November 5, 2025",
    new_str: "Last Verified: November 10, 2025"
  });
}

// Token savings: ~30,000 → ~450 tokens (98.5% reduction!)
```

**Example 3: Multi-line Replacement**
```javascript
await mcpClient.invoke("azuredevops-str-replace-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Architecture/API Design",
  old_str: `## Document Libraries
- Forms
- Templates`,
  new_str: `## Document Libraries
- Forms
- Templates
- Archives`
});
```

**Example 4: Replace All Occurrences**
```javascript
await mcpClient.invoke("azuredevops-str-replace-wiki-page", {
  project: "MyProject",
  wikiId: "MyProject.wiki",
  pagePath: "/Project-Status",
  old_str: "TODO",
  new_str: "DONE",
  replace_all: true
});
```

**Use Cases:**
- **Cross-environment updates**: Update dates/versions across DEV/UAT/PROD wiki pages
- **Status updates**: Change status markers (TODO → DONE)
- **Version updates**: Update version numbers in documentation
- **Date updates**: Update "Last Verified" or "Last Updated" dates
- **Template updates**: Update common text across multiple pages

**Key Features:**
- **98% Token Reduction**: For typical date/version updates vs. full content rewrite
- **Uniqueness Enforcement**: Prevents accidental bulk replacements (safe default)
- **Version Conflict Auto-Retry**: Automatically handles concurrent edits (1 retry max)
- **Unified Diff Output**: Shows exactly what changed (line numbers and before/after)
- **Match Location Preview**: Lists line numbers when multiple matches found

**Error Handling:**
- **String Not Found**: Shows page excerpt to help locate the issue
- **Multiple Matches**: Lists all matching line numbers with context (when `replace_all=false`)
- **Version Conflict**: Automatically retries with fresh content
- **Write Permission**: Clear message about environment flag requirement

**Important Notes:**
- Default behavior requires `old_str` to be unique in the page (safety first!)
- Set `replace_all=true` to replace multiple occurrences
- Automatically handles version conflicts (fetches fresh content and re-applies)
- Returns unified diff for verification before committing changes elsewhere

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

**Use Cases:**
- Retrieve bug details for investigation
- Get task information for tracking
- Extract work item data for reporting

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

**Common WIQL Patterns:**

```sql
-- My active work items
SELECT [System.Id], [System.Title], [System.State]
FROM WorkItems
WHERE [System.AssignedTo] = @me
AND [System.State] <> 'Closed'

-- Bugs in current iteration
SELECT [System.Id], [System.Title], [System.Severity]
FROM WorkItems
WHERE [System.WorkItemType] = 'Bug'
AND [System.IterationPath] = @currentIteration

-- High priority tasks
SELECT [System.Id], [System.Title], [System.Priority]
FROM WorkItems
WHERE [System.WorkItemType] = 'Task'
AND [System.Priority] = 1
AND [System.State] = 'Active'

-- Work items modified this week
SELECT [System.Id], [System.Title], [System.ChangedDate]
FROM WorkItems
WHERE [System.ChangedDate] >= @today - 7

-- Work items linked to specific PR
SELECT [System.Id], [System.Title]
FROM WorkItemLinks
WHERE ([Source].[System.Id] = 12345
AND [System.Links.LinkType] = 'Pull Request')
MODE (MustContain)
```

**Use Cases:**
- Find my assigned work items
- Query bugs by severity
- List tasks in current sprint
- Search by tags or custom fields

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

**Use Cases:**
- Review discussion history
- Extract investigation notes
- Track resolution progress

---

#### add-work-item-comment

Add a comment to a work item.

**⚠️ REQUIRES: `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`**

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID
- `commentText` (string, required): Comment content

**Returns:**
- Created comment metadata

**Example:**
```javascript
await mcpClient.invoke("add-work-item-comment", {
  project: "MyProject",
  workItemId: 12345,
  commentText: "Investigation complete. Root cause identified in plugin assembly."
});
```

**Use Cases:**
- Add investigation findings
- Document resolution steps
- Update stakeholders

---

#### update-work-item

Update work item fields using JSON Patch operations.

**⚠️ REQUIRES: `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`**

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID
- `patchOperations` (array, required): Array of JSON Patch operations

**Returns:**
- Updated work item

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
      "value": "Fixed in PR #456. Deployed to production."
    },
    {
      "op": "add",
      "path": "/fields/System.Tags",
      "value": "Deployment; Production"
    }
  ]
});
```

**Common Operations:**

```javascript
// Update state
{ "op": "add", "path": "/fields/System.State", "value": "Resolved" }

// Assign to user
{ "op": "add", "path": "/fields/System.AssignedTo", "value": "user@company.com" }

// Update priority
{ "op": "add", "path": "/fields/Microsoft.VSTS.Common.Priority", "value": 1 }

// Add tags
{ "op": "add", "path": "/fields/System.Tags", "value": "Bug; Critical" }

// Update history (adds comment)
{ "op": "add", "path": "/fields/System.History", "value": "Fixed the issue" }
```

**Use Cases:**
- Automate status updates
- Bulk update work items
- Integrate with external systems

---

#### create-work-item

Create a new work item with optional parent relationship.

**⚠️ REQUIRES: `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`**

**Parameters:**
- `project` (string, required): Project name
- `workItemType` (string, required): Type (Bug, Task, User Story, Epic, Feature, etc.)
- `fields` (object, required): Field values (`System.Title` is required)
- `parentId` (number, optional): Parent work item ID for creating child items
- `relations` (array, optional): Array of work item relationships (advanced)

**Returns:**
- Created work item with relations

**Example 1: Basic work item**
```javascript
await mcpClient.invoke("create-work-item", {
  project: "MyProject",
  workItemType: "Bug",
  fields: {
    "System.Title": "Login page shows 404 error",
    "System.Description": "After deploying v2.3, users cannot access login page",
    "System.AssignedTo": "john@company.com",
    "System.AreaPath": "MyProject\\Web",
    "System.IterationPath": "MyProject\\Sprint 10",
    "System.Tags": "critical; deployment; web",
    "Microsoft.VSTS.Common.Priority": 1,
    "Microsoft.VSTS.Common.Severity": "1 - Critical"
  }
});
```

**Example 2: Child work item with parent (recommended)**
```javascript
await mcpClient.invoke("create-work-item", {
  project: "MyProject",
  workItemType: "Task",
  parentId: 1133,  // Parent user story ID
  fields: {
    "System.Title": "Implement login page fix",
    "System.Description": "Update routing configuration",
    "Microsoft.VSTS.Scheduling.RemainingWork": 4
  }
});
```

**Example 3: Work item with multiple relationships (advanced)**
```javascript
await mcpClient.invoke("create-work-item", {
  project: "MyProject",
  workItemType: "Task",
  parentId: 1133,  // Parent user story
  relations: [
    {
      rel: "System.LinkTypes.Related",
      url: "https://dev.azure.com/myorg/MyProject/_apis/wit/workItems/1050"
    },
    {
      rel: "System.LinkTypes.Dependency-Reverse",
      url: "https://dev.azure.com/myorg/MyProject/_apis/wit/workItems/1045"
    }
  ],
  fields: {
    "System.Title": "Write integration tests"
  }
});
```

**Common Relation Types:**
- `System.LinkTypes.Hierarchy-Reverse`: Child → Parent (used by `parentId`)
- `System.LinkTypes.Hierarchy-Forward`: Parent → Child
- `System.LinkTypes.Related`: Related work items
- `System.LinkTypes.Dependency-Forward`: Successor (this blocks the linked item)
- `System.LinkTypes.Dependency-Reverse`: Predecessor (this is blocked by linked item)

**Benefits of Parent Relationships:**
- ✅ Single API call (no separate update needed)
- ✅ Single revision created (cleaner audit history)
- ✅ Atomic operation (parent set immediately)
- ✅ Backward compatible (optional parameters)

**Use Cases:**
- Create bugs from automated testing
- Generate child tasks under parent user stories
- Bulk create work items with hierarchy
- Integrate with external ticketing systems

---

#### delete-work-item

Delete a work item.

**⚠️ REQUIRES: `AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true`**

**Parameters:**
- `project` (string, required): Project name
- `workItemId` (number, required): Work item ID

**Returns:**
- Deletion confirmation

**Example:**
```javascript
await mcpClient.invoke("delete-work-item", {
  project: "MyProject",
  workItemId: 12345
});
```

**Warning:** This permanently deletes the work item. Consider moving to "Removed" state instead for audit trail.

**Use Cases:**
- Remove duplicate work items
- Clean up test data
- Delete invalid entries

---

## Prompts (4 Total)

### Wiki Prompts

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

**Use Cases:**
- Quick documentation lookup
- Formatted search results for sharing
- Find relevant wiki pages

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

**Use Cases:**
- Read formatted documentation
- Navigate wiki hierarchy
- Extract structured page content

---

### Work Item Prompts

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

**Use Cases:**
- Get complete work item overview
- Review bug details with comments
- Share work item summary

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

**Use Cases:**
- Sprint planning reports
- Bug triage summaries
- Team workload overview

---

## Usage Examples

### Wiki Documentation Search

**Scenario:** You need to find documentation about authentication in your project's wiki.

```javascript
// 1. Search for authentication pages
const searchResults = await mcpClient.invoke("search-wiki-pages", {
  searchText: "authentication API",
  project: "MyProject",
  maxResults: 10
});

console.log(`Found ${searchResults.count} pages`);
searchResults.results.forEach(result => {
  console.log(`- ${result.path} (Wiki: ${result.wiki.name})`);
  console.log(`  Snippet: ${result.hits[0]?.highlights || ''}`);
});

// 2. Get specific page content
const page = await mcpClient.invoke("get-wiki-page", {
  project: "MyProject",
  wikiId: searchResults.results[0].wiki.id,
  pagePath: searchResults.results[0].path,  // Already in wiki format!
  includeContent: true
});

console.log(`\n## ${page.path}\n`);
console.log(page.content);

// 3. Or use formatted prompt for better readability
const formattedPage = await mcpClient.invoke("wiki-page-content", {
  project: "MyProject",
  wikiId: searchResults.results[0].wiki.id,
  pagePath: searchResults.results[0].path
});

console.log(formattedPage);  // Markdown formatted with metadata
```

---

### Work Item Management

**Scenario:** You're investigating a bug reported by a user.

```javascript
// 1. Find the bug work item
const bugs = await mcpClient.invoke("query-work-items", {
  project: "MyProject",
  wiql: `SELECT [System.Id], [System.Title], [System.State]
         FROM WorkItems
         WHERE [System.WorkItemType] = 'Bug'
         AND [System.Title] CONTAINS 'login 404'
         AND [System.State] <> 'Closed'`
});

console.log(`Found ${bugs.workItems.length} bugs`);
const bugId = bugs.workItems[0].id;

// 2. Get bug details with comments
const bugSummary = await mcpClient.invoke("work-item-summary", {
  project: "MyProject",
  workItemId: bugId
});

console.log(bugSummary);  // Formatted markdown report

// 3. Investigate and add findings
await mcpClient.invoke("add-work-item-comment", {
  project: "MyProject",
  workItemId: bugId,
  commentText: `Investigation complete:

  **Root Cause:** Plugin assembly missing deployment to production
  **Affected Version:** v2.3
  **Fix:** Redeploy plugin assembly with correct configuration
  **Related PR:** #456`
});

// 4. Update work item status
await mcpClient.invoke("update-work-item", {
  project: "MyProject",
  workItemId: bugId,
  patchOperations: [
    { "op": "add", "path": "/fields/System.State", "value": "Resolved" },
    { "op": "add", "path": "/fields/System.History", "value": "Fixed in PR #456. Deployed to production." }
  ]
});

console.log(`✅ Bug ${bugId} resolved and updated`);
```

---

### Cross-Service Correlation

**Scenario:** Correlate a work item with source code, plugin deployment, and runtime telemetry.

```javascript
// This is the KILLER FEATURE of having multiple integrations!

// 1. Get work item details
const workItem = await mcpClient.invoke("get-work-item", {
  project: "MyProject",
  workItemId: 1234
});

console.log(`Bug: ${workItem.fields['System.Title']}`);
console.log(`Description: ${workItem.fields['System.Description']}`);

// 2. Find related commits in GitHub Enterprise
const commits = await mcpClient.invoke("ghe-search-commits", {
  query: `AB#${workItem.id}`,  // Azure DevOps work item reference format
  repoId: "plugin-core"
});

console.log(`\nFound ${commits.total_count} related commits:`);
commits.items.forEach(commit => {
  console.log(`- ${commit.sha.substring(0, 7)}: ${commit.commit.message.split('\n')[0]}`);
});

// 3. Check deployed plugin configuration
const pluginDetails = await mcpClient.invoke("get-plugin-assembly-complete", {
  assemblyName: "MyCompany.Plugins"
});

console.log(`\nDeployed plugin version: ${pluginDetails.assembly.version}`);
console.log(`Validation issues: ${pluginDetails.potentialIssues.length}`);

// 4. Query runtime exceptions in Application Insights
const exceptions = await mcpClient.invoke("appinsights-get-exceptions", {
  resourceId: "prod-api",
  timespan: "P1D",
  limit: 10
});

console.log(`\nRecent exceptions (last 24h): ${exceptions.length}`);
exceptions.forEach(ex => {
  console.log(`- ${ex.timestamp}: ${ex.type} - ${ex.outerMessage}`);
});

// 5. Update work item with complete investigation
await mcpClient.invoke("add-work-item-comment", {
  project: "MyProject",
  workItemId: 1234,
  commentText: `## Investigation Summary

**Related Commits:**
${commits.items.map(c => `- ${c.sha.substring(0, 7)}: ${c.commit.message.split('\n')[0]}`).join('\n')}

**Deployed Plugin:**
- Version: ${pluginDetails.assembly.version}
- Validation: ${pluginDetails.potentialIssues.length === 0 ? '✅ No issues' : `⚠️ ${pluginDetails.potentialIssues.length} issues`}

**Runtime Telemetry:**
- Exceptions (24h): ${exceptions.length}
- Most recent: ${exceptions[0]?.type} at ${exceptions[0]?.timestamp}

**Conclusion:** Bug reproduced and root cause identified. Fix deployed in commit ${commits.items[0]?.sha.substring(0, 7)}.`
});

console.log("✅ Work item updated with complete investigation findings");
```

---

## Best Practices

### Security

**1. Principle of Least Privilege**

```bash
# Read-only access (recommended for most users)
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=false
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=false
AZUREDEVOPS_ENABLE_WIKI_WRITE=false

# Enable write operations only when needed
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true  # For automation/integration accounts
```

**2. PAT Security**

- **Rotation**: Rotate PATs every 90 days (or per org policy)
- **Minimal Scopes**: Grant only required scopes
- **Separate PATs**: Use different PATs for different purposes
- **Never Commit**: Never commit PATs to version control
- **Revoke Unused**: Revoke PATs that are no longer needed

**3. Project Access Control**

```bash
# Restrict to specific projects only
AZUREDEVOPS_PROJECTS=ProjectA,ProjectB

# ❌ DON'T: Grant access to all projects
AZUREDEVOPS_PROJECTS=*  # Not supported - always specify projects
```

**4. Audit Logging**

- Monitor PAT usage via Azure DevOps audit logs
- Review work item modifications in history
- Track wiki page changes in git history (for code wikis)

---

### Performance

**1. Query Optimization**

```javascript
// ❌ BAD: Fetch all work items
SELECT [System.Id], [System.Title] FROM WorkItems

// ✅ GOOD: Filter and limit results
SELECT [System.Id], [System.Title]
FROM WorkItems
WHERE [System.State] = 'Active'
AND [System.ChangedDate] >= @today - 7
```

**2. Field Selection**

```javascript
// ❌ BAD: Fetch all fields
SELECT * FROM WorkItems

// ✅ GOOD: Select only needed fields
SELECT [System.Id], [System.Title], [System.State]
FROM WorkItems
```

**3. Batch Operations**

```javascript
// ❌ BAD: Individual queries for each work item
for (const id of workItemIds) {
  await mcpClient.invoke("get-work-item", { project, workItemId: id });
}

// ✅ GOOD: Single WIQL query for multiple items
const wiql = `SELECT [System.Id], [System.Title]
              FROM WorkItems
              WHERE [System.Id] IN (${workItemIds.join(',')})`;
await mcpClient.invoke("query-work-items", { project, wiql });
```

---

### Access Control

**1. Team-Based Access**

- Configure projects based on team boundaries
- Use separate PATs for different teams/purposes
- Align PAT scopes with team responsibilities

**2. Environment Separation**

```bash
# Development
AZUREDEVOPS_ORGANIZATION=mycompany
AZUREDEVOPS_PROJECTS=DevProject
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true

# Production (read-only)
AZUREDEVOPS_ORGANIZATION=mycompany
AZUREDEVOPS_PROJECTS=ProdProject
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=false
```

**3. Integration Accounts**

- Use dedicated user accounts for integrations
- Apply minimal required permissions
- Monitor integration account activity

---

## Troubleshooting

### Common Errors

**Error: "Missing required Azure DevOps configuration"**

```
Missing required Azure DevOps configuration: AZUREDEVOPS_ORGANIZATION, AZUREDEVOPS_PAT, AZUREDEVOPS_PROJECTS
```

**Solution:**
1. Verify all 3 required environment variables are set
2. Check for typos in variable names
3. Ensure values are not empty strings
4. Restart MCP client after updating configuration

---

**Error: "Write operations are disabled"**

```
Write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable work item modifications.
```

**Solution:**
```bash
# Enable work item write operations
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true
```

---

**Error: "The requested project does not exist or you do not have permission to access it"**

```
Error: TF400813: The requested project 'MyProject' does not exist, or you do not have permission to access it.
```

**Solution:**
1. Verify project name is exact (case-sensitive)
2. Check project name in `AZUREDEVOPS_PROJECTS` list
3. Ensure PAT user has access to the project
4. Verify project exists in organization

---

### Authentication Issues

**Error: "401 Unauthorized"**

```
Error: HTTP 401 Unauthorized
```

**Solution:**
1. PAT has expired → Create new PAT
2. PAT is invalid → Regenerate PAT
3. PAT lacks required scopes → Update PAT scopes
4. Organization name is incorrect → Verify `AZUREDEVOPS_ORGANIZATION`

---

**Error: "203 Non-Authoritative Information"**

```
Error: HTTP 203 Non-Authoritative Information - This is usually caused by a proxy returning a 203 instead of 401.
```

**Solution:**
1. Check if corporate proxy is interfering
2. Verify PAT is correctly formatted (no extra spaces)
3. Try creating a new PAT

---

### Permission Problems

**Error: "403 Forbidden - You do not have permissions"**

```
Error: TF400813: You do not have permissions to access this resource.
```

**Solution:**
1. Check PAT scopes include required permissions
2. For wiki: Requires `vso.code` (read) or `vso.code_write` (write)
3. For work items: Requires `vso.work` (read) or `vso.work_write` (write)
4. Ensure user has project-level permissions

---

**Error: "VS403403: The identity does not have required permission"**

```
Error: VS403403: The current user does not have permission to perform this action.
```

**Solution:**
1. User needs "Contribute" permission for wiki write
2. User needs "Edit work items" permission for work item write
3. User needs "Delete work items" permission for work item delete
4. Contact project administrator to grant permissions

---

**Need Help?**

- Review the [CLAUDE.md](../../CLAUDE.md) file for architecture details
- Check [SETUP.md](../../SETUP.md) for detailed setup instructions
- See [USAGE.md](../../USAGE.md) for more usage examples
- File issues at: https://github.com/anthropics/mcp-consultant-tools/issues

---

**Last Updated:** 2025-01-09
