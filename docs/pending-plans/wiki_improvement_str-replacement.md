# Wiki String Replacement Tool - Implementation Plan

## Problem Statement

**Current Issue:** Updating Azure DevOps wiki pages requires reading the entire page content and rewriting it, which is extremely inefficient for small changes.

**Example Scenario:** Updating "Last Verified: November 5, 2025" to "Last Verified: November 10, 2025" across 3 wiki pages (DEV/UAT/PROD):

```
Current Approach:
- Read DEV wiki (~5,000 tokens)
- Read UAT wiki (~5,000 tokens)
- Read PROD wiki (~5,000 tokens)
- Rewrite DEV wiki (~5,000 tokens)
- Rewrite UAT wiki (~5,000 tokens)
- Rewrite PROD wiki (~5,000 tokens)
Total: ~30,000 tokens

Proposed Approach (String Replacement):
- Replace in DEV wiki (~150 tokens)
- Replace in UAT wiki (~150 tokens)
- Replace in PROD wiki (~150 tokens)
Total: ~450 tokens

Token Savings: 98.5%!
```

## Solution Design

### New Tool: `azuredevops-str-replace-wiki-page`

A string replacement tool for Azure DevOps wiki pages, similar to the `Edit` tool pattern used for files.

**Key Features:**
1. String-based replacement (exact match)
2. Multi-line support
3. Uniqueness enforcement (default) with `replace_all` option
4. Automatic version conflict handling
5. Diff output for verification
6. Requires `AZUREDEVOPS_ENABLE_WIKI_WRITE=true`

### Tool Schema

```typescript
{
  name: "azuredevops-str-replace-wiki-page",
  description: "Replace a specific string in an Azure DevOps wiki page without rewriting the entire content. Much more efficient than update-wiki-page for small changes.",
  inputSchema: {
    type: "object",
    properties: {
      project: {
        type: "string",
        description: "The project name"
      },
      wikiId: {
        type: "string",
        description: "The wiki identifier (ID or name)"
      },
      pagePath: {
        type: "string",
        description: "The path to the wiki page (e.g., '/SharePoint-Online/04-DEV-Configuration')"
      },
      old_str: {
        type: "string",
        description: "The exact string to replace (must be unique unless replace_all is true)"
      },
      new_str: {
        type: "string",
        description: "The replacement string"
      },
      replace_all: {
        type: "boolean",
        description: "If true, replace all occurrences. If false (default), old_str must be unique in the page.",
        default: false
      },
      description: {
        type: "string",
        description: "Optional description of the change (for audit logging)"
      }
    },
    required: ["project", "wikiId", "pagePath", "old_str", "new_str"]
  }
}
```

### Implementation Algorithm

```typescript
async strReplaceWikiPage(
  project: string,
  wikiId: string,
  pagePath: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean = false,
  description?: string
): Promise<ReplaceResult> {

  // 1. Validate write permission
  if (!AZUREDEVOPS_ENABLE_WIKI_WRITE) {
    throw new Error("Wiki write operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_WRITE=true");
  }

  // 2. Fetch current page content and version (auto-fetch latest)
  const currentPage = await this.getWikiPage(project, wikiId, pagePath, true);
  const currentContent = currentPage.content;
  const currentVersion = currentPage.version;

  // 3. Count occurrences of old_str
  const occurrences = countOccurrences(currentContent, oldStr);

  if (occurrences === 0) {
    throw new Error(
      `String not found in page.\n\n` +
      `Looking for: "${truncate(oldStr, 200)}"\n\n` +
      `Page excerpt:\n${truncate(currentContent, 500)}`
    );
  }

  if (occurrences > 1 && !replaceAll) {
    throw new Error(
      `String appears ${occurrences} times in the page. ` +
      `Either provide more context to make old_str unique, or set replace_all=true.\n\n` +
      `Matching locations:\n${getMatchLocations(currentContent, oldStr)}`
    );
  }

  // 4. Perform replacement
  const newContent = replaceAll
    ? currentContent.replaceAll(oldStr, newStr)
    : currentContent.replace(oldStr, newStr);

  // 5. Validate replacement succeeded
  if (newContent === currentContent) {
    throw new Error("Replacement failed - content unchanged");
  }

  // 6. Update wiki page with version conflict retry
  let updateResult;
  try {
    updateResult = await this.updateWikiPage(
      project,
      wikiId,
      pagePath,
      newContent,
      currentVersion
    );
  } catch (error: any) {
    // Version conflict - retry once with fresh version
    if (error.message.includes('412') || error.message.includes('version')) {
      console.error('Version conflict detected, retrying with fresh version...');

      const freshPage = await this.getWikiPage(project, wikiId, pagePath, true);
      const freshContent = freshPage.content;
      const freshVersion = freshPage.version;

      // Re-apply replacement to fresh content
      const freshNewContent = replaceAll
        ? freshContent.replaceAll(oldStr, newStr)
        : freshContent.replace(oldStr, newStr);

      updateResult = await this.updateWikiPage(
        project,
        wikiId,
        pagePath,
        freshNewContent,
        freshVersion
      );
    } else {
      throw error;
    }
  }

  // 7. Generate diff output
  const diff = generateUnifiedDiff(currentContent, newContent, oldStr, newStr);

  // 8. Audit logging
  auditLogger.log({
    operation: 'str-replace-wiki-page',
    operationType: 'WRITE',
    resourceId: project,
    componentType: 'WikiPage',
    componentName: pagePath,
    success: true,
    parameters: {
      wikiId,
      oldStrPreview: truncate(oldStr, 100),
      newStrPreview: truncate(newStr, 100),
      replaceAll,
      occurrences,
      description
    }
  });

  // 9. Return result with diff
  return {
    success: true,
    diff,
    occurrences: replaceAll ? occurrences : 1,
    version: updateResult.version,
    message: `Successfully replaced ${replaceAll ? occurrences : 1} occurrence(s)`
  };
}
```

### Helper Functions

```typescript
// Count string occurrences
function countOccurrences(content: string, searchStr: string): number {
  return (content.match(new RegExp(escapeRegExp(searchStr), 'g')) || []).length;
}

// Get match locations with context
function getMatchLocations(content: string, searchStr: string): string {
  const lines = content.split('\n');
  const matches: string[] = [];

  lines.forEach((line, index) => {
    if (line.includes(searchStr)) {
      matches.push(
        `Line ${index + 1}: ${truncate(line.trim(), 100)}`
      );
    }
  });

  return matches.slice(0, 10).join('\n') +
    (matches.length > 10 ? `\n... and ${matches.length - 10} more` : '');
}

// Generate unified diff (simplified)
function generateUnifiedDiff(
  oldContent: string,
  newContent: string,
  oldStr: string,
  newStr: string
): string {
  // Find changed lines
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const changedLineNumbers: number[] = [];
  oldLines.forEach((line, index) => {
    if (line.includes(oldStr)) {
      changedLineNumbers.push(index);
    }
  });

  // Build diff output
  const diffLines: string[] = [];
  changedLineNumbers.forEach(lineNum => {
    diffLines.push(`@@ Line ${lineNum + 1} @@`);
    diffLines.push(`- ${oldLines[lineNum]}`);
    diffLines.push(`+ ${newLines[lineNum]}`);
    diffLines.push('');
  });

  return diffLines.join('\n');
}

// Escape special regex characters
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Truncate string for display
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}
```

### Return Value Structure

```typescript
interface ReplaceResult {
  success: boolean;
  diff: string;          // Unified diff showing changes
  occurrences: number;   // Number of replacements made
  version: string;       // New page version (ETag)
  message: string;       // Human-readable success message
}
```

**Example Return:**
```typescript
{
  success: true,
  diff: `@@ Line 42 @@
- Last Verified: November 5, 2025
+ Last Verified: November 10, 2025`,
  occurrences: 1,
  version: "W/\"datetime'2025-11-10T15%3A30%3A00.000Z'\"",
  message: "Successfully replaced 1 occurrence(s)"
}
```

## Error Handling

### 1. String Not Found
```
Error: String not found in page.

Looking for: "Last Verified: November 5, 2025"

Page excerpt:
# SharePoint Online - DEV Configuration

Last Updated: November 10, 2025
Environment: Development

...
```

### 2. Multiple Matches (replaceAll=false)
```
Error: String appears 3 times in the page. Either provide more context to make old_str unique, or set replace_all=true.

Matching locations:
Line 15: Last Verified: November 5, 2025
Line 87: Last Verified: November 5, 2025
Line 142: Last Verified: November 5, 2025
```

### 3. Version Conflict
```
Error: Version conflict detected, retrying with fresh version...
Success: Successfully replaced 1 occurrence(s)
```

### 4. Write Permission Denied
```
Error: Wiki write operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_WRITE=true in your environment configuration.
```

### 5. Page Not Found
```
Error: Wiki page not found: /SharePoint-Online/04-DEV-Configuration

Available pages:
- /SharePoint-Online/01-Overview
- /SharePoint-Online/02-Architecture
- /SharePoint-Online/03-Setup
```

## Usage Examples

### Example 1: Simple Date Update
```typescript
await mcpClient.invoke("azuredevops-str-replace-wiki-page", {
  project: "RTPI",
  wikiId: "RTPI.Crm.wiki",
  pagePath: "/SharePoint-Online/04-DEV-Configuration",
  old_str: "Last Verified: November 5, 2025",
  new_str: "Last Verified: November 10, 2025",
  description: "Update verification date"
});

// Returns:
{
  success: true,
  diff: "- Last Verified: November 5, 2025\n+ Last Verified: November 10, 2025",
  occurrences: 1,
  version: "W/\"datetime'2025-11-10T15%3A30%3A00.000Z'\"",
  message: "Successfully replaced 1 occurrence(s)"
}
```

### Example 2: Multi-line Replacement
```typescript
await mcpClient.invoke("azuredevops-str-replace-wiki-page", {
  project: "RTPI",
  wikiId: "RTPI.Crm.wiki",
  pagePath: "/SharePoint-Online/04-DEV-Configuration",
  old_str: `## Document Libraries
- Forms
- Templates`,
  new_str: `## Document Libraries
- Forms
- Templates
- Archives`,
  description: "Add Archives library"
});
```

### Example 3: Replace All Occurrences
```typescript
await mcpClient.invoke("azuredevops-str-replace-wiki-page", {
  project: "RTPI",
  wikiId: "RTPI.Crm.wiki",
  pagePath: "/SharePoint-Online/04-DEV-Configuration",
  old_str: "TODO",
  new_str: "DONE",
  replace_all: true,
  description: "Mark all TODOs as done"
});

// Returns:
{
  success: true,
  diff: `@@ Line 15 @@
- Status: TODO
+ Status: DONE

@@ Line 87 @@
- Review: TODO
+ Review: DONE

@@ Line 142 @@
- Testing: TODO
+ Testing: DONE`,
  occurrences: 3,
  version: "...",
  message: "Successfully replaced 3 occurrence(s)"
}
```

### Example 4: Update Across Multiple Environments
```typescript
// Update verification date across DEV/UAT/PROD
const environments = ['DEV', 'UAT', 'PROD'];

for (const env of environments) {
  await mcpClient.invoke("azuredevops-str-replace-wiki-page", {
    project: "RTPI",
    wikiId: "RTPI.Crm.wiki",
    pagePath: `/SharePoint-Online/04-${env}-Configuration`,
    old_str: "Last Verified: November 5, 2025",
    new_str: "Last Verified: November 10, 2025",
    description: `Update ${env} verification date`
  });
}
```

## Implementation Checklist

### Phase 1: Core Implementation

- [ ] Add `strReplaceWikiPage()` method to `AzureDevOpsService` ([src/AzureDevOpsService.ts](../src/AzureDevOpsService.ts))
- [ ] Implement helper functions:
  - [ ] `countOccurrences()`
  - [ ] `getMatchLocations()`
  - [ ] `generateUnifiedDiff()`
  - [ ] `escapeRegExp()`
  - [ ] `truncate()`
- [ ] Add tool registration in [src/index.ts](../src/index.ts)
- [ ] Add Zod schema validation
- [ ] Implement version conflict retry logic
- [ ] Add audit logging

### Phase 2: Error Handling

- [ ] String not found error with page excerpt
- [ ] Multiple matches error with line numbers
- [ ] Version conflict auto-retry
- [ ] Write permission check
- [ ] Page not found error

### Phase 3: Testing

- [ ] Unit tests for helper functions
- [ ] Integration test: Simple replacement
- [ ] Integration test: Multi-line replacement
- [ ] Integration test: Replace all
- [ ] Integration test: Version conflict handling
- [ ] Integration test: Error cases (not found, multiple matches)

### Phase 4: Documentation

- [ ] Update [TOOLS.md](../TOOLS.md) with new tool
  - [ ] Add to "Azure DevOps Tools" section
  - [ ] Document parameters
  - [ ] Add usage examples
  - [ ] Update tool count (XX ’ XX+1)
- [ ] Update [USAGE.md](../USAGE.md)
  - [ ] Add "Efficient Wiki Updates" section
  - [ ] Show before/after comparison (token usage)
  - [ ] Multi-environment update example
- [ ] Update [SETUP.md](../SETUP.md) - No changes needed
- [ ] Update [README.md](../README.md)
  - [ ] Update tool count
  - [ ] Add to features list if needed
- [ ] Update [CLAUDE.md](../CLAUDE.md)
  - [ ] Add to "Azure DevOps Wiki Integration" section
  - [ ] Document algorithm and design decisions

### Phase 5: Build & Release

- [ ] Build: `npm run build`
- [ ] Test locally with MCP client
- [ ] Update version: `npm version minor` (new feature)
- [ ] Publish: `npm publish`
- [ ] Merge to main branch
- [ ] Tag release on GitHub

## Future Enhancements (v2)

### Batch String Replacement Tool

**Tool Name:** `azuredevops-batch-str-replace-wiki-pages`

**Use Case:** Update the same string across multiple wiki pages in one call.

**Example:**
```typescript
await mcpClient.invoke("azuredevops-batch-str-replace-wiki-pages", {
  project: "RTPI",
  wikiId: "RTPI.Crm.wiki",
  replacements: [
    {
      pagePath: "/SharePoint-Online/04-DEV-Configuration",
      old_str: "Last Verified: November 5, 2025",
      new_str: "Last Verified: November 10, 2025"
    },
    {
      pagePath: "/SharePoint-Online/05-UAT-Configuration",
      old_str: "Last Verified: November 5, 2025",
      new_str: "Last Verified: November 10, 2025"
    },
    {
      pagePath: "/SharePoint-Online/06-PROD-Configuration",
      old_str: "Last Verified: November 5, 2025",
      new_str: "Last Verified: November 10, 2025"
    }
  ],
  description: "Update verification date across all environments"
});
```

**Benefits:**
- Single transaction (all or nothing)
- Faster execution (parallel updates)
- Simpler API calls
- Better error reporting (which pages succeeded/failed)

**Implementation Notes:**
- Execute replacements in parallel (Promise.all)
- Collect all results and errors
- Return aggregated diff showing all changes
- Implement rollback on partial failure (optional)

## Success Metrics

### Before (Current Approach)
- **Token Usage:** ~30,000 tokens for 3 wiki updates
- **API Calls:** 6 calls (3 reads + 3 writes)
- **User Effort:** Copy/paste entire page content, find/replace manually, submit full content

### After (String Replacement Tool)
- **Token Usage:** ~450 tokens for 3 wiki updates (98.5% reduction)
- **API Calls:** 6 calls (3 reads + 3 writes) - same, but automatic
- **User Effort:** Single tool call per page with old/new strings

### Additional Benefits
- **Accuracy:** No risk of accidentally modifying other content
- **Auditability:** Clear diff output shows exactly what changed
- **Safety:** Uniqueness enforcement prevents unintended replacements
- **Reliability:** Automatic version conflict handling

## Risk Assessment

### Low Risk
-  Uses existing `updateWikiPage()` infrastructure
-  Read-only by default (requires write flag)
-  Uniqueness enforcement prevents accidents
-  Diff output for verification
-  Audit logging for compliance

### Medium Risk
-   Version conflicts in high-activity wikis (mitigated by retry logic)
-   Multi-line replacements could be error-prone (user responsibility to test)

### Mitigation Strategies
1. Clear error messages with context
2. Diff output for verification before/after
3. Audit logging for rollback capability
4. Comprehensive documentation with examples

## Conclusion

This implementation will significantly improve the efficiency of wiki updates, reducing token usage by ~98% for common update scenarios. The design follows established patterns (Edit tool) and includes robust error handling, version conflict management, and comprehensive audit logging.

The tool will be especially valuable for:
- Cross-environment updates (DEV/UAT/PROD)
- Date/version updates
- Status updates
- Template-based content updates

Future batch tool will further improve efficiency for multi-page updates.
