# Azure DevOps Technical Implementation Guide

This document contains detailed technical implementation information for the Azure DevOps integration. For high-level architecture and usage information, see [CLAUDE.md](../../CLAUDE.md) and [Azure DevOps Documentation](../documentation/AZUREDEVOPS.md).

## Table of Contents
- [Wiki Path Conversion](#wiki-path-conversion)
- [Wiki Tools](#wiki-tools)
- [Wiki String Replacement Tool](#wiki-string-replacement-tool)
- [Work Item Parent Relationships](#work-item-parent-relationships)

## Wiki Path Conversion

### Wiki Path Conversion Issue & Fix

**Problem:** Azure DevOps search API returns **git paths** (file paths in the repository) but the get-page API expects **wiki paths** (user-facing page paths). These formats are incompatible:

| Format | Example |
|--------|---------|
| Git Path (from search) | `/Release-Notes/Page-Name.md` |
| Wiki Path (for get-page) | `/Release Notes/Page Name` |

**Solution:** The service automatically converts between formats using a two-pronged approach:

1. **Search Results Enhancement** ([src/AzureDevOpsService.ts](src/AzureDevOpsService.ts:182))
   - `searchWikiPages()` returns both `gitPath` (original) and `path` (converted wiki path)
   - Clients can use the `path` field directly with `getWikiPage()`
   - Backward compatible - existing code continues to work

2. **Auto-Conversion Fallback** ([src/AzureDevOpsService.ts](src/AzureDevOpsService.ts:207))
   - `getWikiPage()` detects git paths (ending with `.md`) and auto-converts them
   - Accepts both wiki paths and git paths for maximum compatibility
   - Logs conversion for debugging

**Conversion Logic:**
```typescript
private convertGitPathToWikiPath(gitPath: string): string {
  return gitPath
    .replace(/\.md$/, '')      // Remove .md extension
    .replace(/-/g, ' ')         // Replace dashes with spaces
    .replace(/%2D/gi, '-');     // Decode %2D back to -
}
```

**Testing:** See [docs/WIKI_PATH_FIX_SUMMARY.md](docs/WIKI_PATH_FIX_SUMMARY.md) for detailed testing results and [docs/WIKI_PATH_ISSUE.md](docs/WIKI_PATH_ISSUE.md) for issue analysis.

## Wiki Tools

The Azure DevOps service provides wiki search and retrieval capabilities:

- `get-wikis`: List all wikis in a project
- `search-wiki-pages`: Full-text search across wiki pages with highlighting
- `get-wiki-page`: Retrieve page content using wiki paths (auto-converts git paths)
- `create-wiki-page`: Create new wiki pages (requires `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`)
- `update-wiki-page`: Update existing wiki pages (requires `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`)
- `azuredevops-str-replace-wiki-page`: Efficiently replace strings in wiki pages (requires `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`)

**Usage Example:**
```javascript
// Search for pages
const results = await searchWikiPages("Release_002", "RTPI");

// Use the path directly (already converted to wiki path)
const page = await getWikiPage("RTPI", results.results[0].wikiId, results.results[0].path, true);

// Extract content
const items = page.content.matchAll(/\|\s*#(\d+)\s*\|/g);
```

## Wiki String Replacement Tool

The `azuredevops-str-replace-wiki-page` tool enables efficient wiki updates by replacing specific strings without rewriting the entire page content. This provides ~98% token savings for common update scenarios.

**Implementation:** [src/AzureDevOpsService.ts](src/AzureDevOpsService.ts:461)

**Key Features:**
- **Uniqueness Enforcement**: By default, old_str must be unique in the page (prevents accidental bulk replacements)
- **Replace All Option**: Set `replace_all=true` to replace multiple occurrences
- **Version Conflict Handling**: Automatically retries with fresh content if concurrent edit detected
- **Unified Diff Output**: Shows exactly what changed (line numbers and before/after)
- **Match Location Preview**: Shows line numbers when multiple matches found

**Algorithm:**

```typescript
async strReplaceWikiPage(
  project: string,
  wikiId: string,
  pagePath: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean = false,
  description?: string
): Promise<any> {
  // 1. Validate write permission
  if (!this.config.enableWikiWrite) {
    throw new Error('Wiki write operations are disabled');
  }

  // 2. Fetch current page content and version
  const currentPage = await this.getWikiPage(project, wikiId, pagePath, true);

  // 3. Count occurrences of old_str
  const occurrences = this.countOccurrences(currentPage.content, oldStr);

  // 4. Enforce uniqueness (error if multiple matches and replaceAll=false)
  if (occurrences === 0) {
    throw new Error(`String not found: "${oldStr}"`);
  }
  if (occurrences > 1 && !replaceAll) {
    throw new Error(`String appears ${occurrences} times. Use replace_all=true or make old_str unique.`);
  }

  // 5. Perform replacement
  const newContent = currentPage.content.replace(
    new RegExp(this.escapeRegExp(oldStr), replaceAll ? 'g' : ''),
    newStr
  );

  // 6. Update with version conflict retry
  try {
    updateResult = await this.updateWikiPage(project, wikiId, pagePath, newContent, currentPage.version);
  } catch (error) {
    if (error.message.includes('version') || error.message.includes('conflict')) {
      // Retry with fresh version
      const freshPage = await this.getWikiPage(project, wikiId, pagePath, true);
      const freshNewContent = freshPage.content.replace(...);
      updateResult = await this.updateWikiPage(project, wikiId, pagePath, freshNewContent, freshPage.version);
    }
  }

  // 7. Generate unified diff
  const diff = this.generateUnifiedDiff(currentPage.content, newContent, oldStr, newStr);

  // 8. Return result with diff and metadata
  return { success: true, diff, occurrences, version, message };
}
```

**Helper Methods:**
- `countOccurrences()`: Count string matches using regex
- `getMatchLocations()`: Find line numbers of matches (up to 10 displayed)
- `generateUnifiedDiff()`: Create unified diff output showing changes
- `escapeRegExp()`: Escape special regex characters for safe matching
- `truncate()`: Truncate strings for display in error messages

**Use Cases:**

1. **Cross-Environment Updates** (DEV/UAT/PROD):
```javascript
// Update verification date across all environments
const environments = ['DEV', 'UAT', 'PROD'];
for (const env of environments) {
  await strReplaceWikiPage(
    'RTPI',
    'RTPI.Crm.wiki',
    `/SharePoint-Online/04-${env}-Configuration`,
    'Last Verified: November 5, 2025',
    'Last Verified: November 10, 2025'
  );
}

// Token savings: ~30,000 → ~450 tokens (98.5% reduction)
```

2. **Multi-line Replacement**:
```javascript
await strReplaceWikiPage(
  'RTPI',
  'RTPI.Crm.wiki',
  '/SharePoint-Online/04-DEV-Configuration',
  `## Document Libraries
- Forms
- Templates`,
  `## Document Libraries
- Forms
- Templates
- Archives`
);
```

3. **Replace All Occurrences**:
```javascript
await strReplaceWikiPage(
  'RTPI',
  'RTPI.Crm.wiki',
  '/SharePoint-Online/04-DEV-Configuration',
  'TODO',
  'DONE',
  true  // replace_all=true
);
```

**Error Handling:**

- **String Not Found**: Shows page excerpt to help locate the issue
- **Multiple Matches**: Lists all matching line numbers with context
- **Version Conflict**: Automatically retries with fresh content (1 retry max)
- **Write Permission**: Clear message about environment flag requirement

**Benefits:**
- **98% Token Reduction**: For typical date/version updates
- **Safety**: Uniqueness enforcement prevents unintended replacements
- **Auditability**: Diff output shows exactly what changed
- **Reliability**: Automatic version conflict handling

## Work Item Parent Relationships

The `create-work-item` tool supports setting parent-child relationships during work item creation in a single API call, eliminating the need for a separate update operation.

**Parameters:**
- `parentId` (optional, number): Parent work item ID - simplified approach for creating child items
- `relations` (optional, array): Advanced array of work item relationships

**Common Relation Types:**
- `System.LinkTypes.Hierarchy-Reverse`: Child → Parent (most common, used by `parentId`)
- `System.LinkTypes.Hierarchy-Forward`: Parent → Child
- `System.LinkTypes.Related`: Related work items
- `System.LinkTypes.Dependency-Forward`: Successor (this item blocks the linked item)
- `System.LinkTypes.Dependency-Reverse`: Predecessor (this item is blocked by linked item)

**Example 1: Simple parent relationship (recommended)**
```json
{
  "project": "MyProject",
  "workItemType": "User Story",
  "parentId": 1133,
  "fields": {
    "System.Title": "Implement GetMember endpoint",
    "Microsoft.VSTS.Scheduling.StoryPoints": 2
  }
}
```

**Example 2: Multiple relationships (advanced)**
```json
{
  "project": "MyProject",
  "workItemType": "Task",
  "relations": [
    {
      "rel": "System.LinkTypes.Hierarchy-Reverse",
      "url": "https://dev.azure.com/org/project/_apis/wit/workItems/1133"
    },
    {
      "rel": "System.LinkTypes.Related",
      "url": "https://dev.azure.com/org/project/_apis/wit/workItems/1050"
    }
  ],
  "fields": {
    "System.Title": "Write API documentation"
  }
}
```

**Benefits:**
- Single API call (vs. create + update)
- Single revision created (cleaner audit history)
- Atomic operation (parent set immediately)
- Backward compatible (optional parameters)
