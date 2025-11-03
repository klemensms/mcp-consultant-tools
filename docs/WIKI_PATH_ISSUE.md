# Azure DevOps Wiki Path Conversion Issue

## Problem Summary

Claude Desktop (and other MCP clients) cannot retrieve wiki pages after searching for them because the **search API returns git paths** but the **get-page API expects wiki paths**, and these formats are different.

## The Issue in Detail

### What Happens

1. User searches for "Release_002" using `search-wiki-pages` tool
2. Search returns:
   ```json
   {
     "path": "/Release-Notes/Release_002-[Online-Joining]-%2D-Go%2DLive-Check-List.md",
     "wikiId": "5a23b2eb-0059-44f9-a233-24bc57dd6627"
   }
   ```
3. User tries to get the page using `get-wiki-page` with this path
4. **Request fails** with "Wiki page not found"

### Why It Fails

The path returned by search is a **git path** (the actual file path in the git repository), but the get-page API expects a **wiki path** (the user-facing page path with spaces).

| Aspect | Git Path (from search) | Wiki Path (for get-page) |
|--------|------------------------|--------------------------|
| Folder separators | Dashes: `/Release-Notes/` | Spaces: `/Release Notes/` |
| File extension | Has `.md`: `Page.md` | No extension: `Page` |
| Special chars | URL-encoded: `%2D` | Decoded: `-` |
| Page name spacing | Dashes: `Page-Name` | Spaces: `Page Name` |

### Example

**Git Path** (what search returns):
```
/Release-Notes/Release_002-[Online-Joining]-%2D-Go%2DLive-Check-List.md
```

**Wiki Path** (what get-page expects):
```
/Release Notes/Release_002 [Online Joining] - Go-Live Check List
```

## The Solution

### Simple Conversion Function

Add this conversion function to transform git paths to wiki paths:

```javascript
function convertGitPathToWikiPath(gitPath) {
  return gitPath
    .replace(/\.md$/, '')     // Remove .md extension
    .replace(/-/g, ' ')        // Replace ALL dashes with spaces
    .replace(/%2D/gi, '-');    // Decode %2D back to - (actual dashes in page names)
}
```

### Usage Example

```javascript
// After searching:
const searchResult = await searchWikiPages("Release_002", "RTPI");
const gitPath = searchResult.results[0].path;

// Convert before getting page:
const wikiPath = convertGitPathToWikiPath(gitPath);
const page = await getWikiPage("RTPI", wikiId, wikiPath, true);
```

## Implementation Options

### Option 1: Add Helper Function (Recommended)

Add a new tool: `convert-wiki-path` that converts git paths to wiki paths.

```typescript
server.tool(
  "convert-wiki-path",
  "Convert a git path (from search results) to a wiki path (for get-page API)",
  {
    gitPath: z.string().describe("The git path from search results"),
  },
  async ({ gitPath }) => {
    const wikiPath = gitPath
      .replace(/\.md$/, '')
      .replace(/-/g, ' ')
      .replace(/%2D/gi, '-');

    return {
      gitPath,
      wikiPath,
      note: "Use the wikiPath with the get-wiki-page tool"
    };
  }
);
```

### Option 2: Modify Search Results

Modify the `searchWikiPages` function to return both git path and wiki path:

```typescript
results: (response.results || []).map((result: any) => ({
  fileName: result.fileName,
  gitPath: result.path,  // Original git path
  wikiPath: result.path  // Converted wiki path
    .replace(/\.md$/, '')
    .replace(/-/g, ' ')
    .replace(/%2D/gi, '-'),
  wikiName: result.wiki?.name,
  wikiId: result.wiki?.id,
  project: result.project?.name,
  highlights: result.hits?.map((hit: any) => hit.highlights).flat() || []
}))
```

### Option 3: Auto-Convert in Get-Page

Modify the `getWikiPage` function to accept both formats and auto-detect/convert:

```typescript
async getWikiPage(project: string, wikiId: string, pagePath: string, includeContent: boolean = true) {
  // If path looks like a git path (has .md), convert it
  let wikiPath = pagePath;
  if (pagePath.endsWith('.md')) {
    wikiPath = pagePath
      .replace(/\.md$/, '')
      .replace(/-/g, ' ')
      .replace(/%2D/gi, '-');
  }

  // Use wikiPath for the API call
  const response = await this.makeRequest<any>(
    `${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(wikiPath)}&includeContent=${includeContent}&api-version=${this.apiVersion}`
  );
  ...
}
```

## Testing

### Test Cases

```javascript
// Test Case 1: Simple page name
convertGitPathToWikiPath("/Folder-Name/Page-Name.md")
// Expected: "/Folder Name/Page Name"

// Test Case 2: Page with special chars
convertGitPathToWikiPath("/Release-Notes/Release_002-[Online-Joining]-%2D-Go%2DLive-Check-List.md")
// Expected: "/Release Notes/Release_002 [Online Joining] - Go-Live Check List"

// Test Case 3: Page with underscores (should not be affected)
convertGitPathToWikiPath("/Folder-Name/Page_Name.md")
// Expected: "/Folder Name/Page_Name"
```

### Validation Script

Run `test-release-002-path.js` to validate the conversion works:

```bash
node test-release-002-path.js
```

## Recommendation

**Implement Option 2** (modify search results) because:
1. ✅ Transparent to users - they don't need to know about conversion
2. ✅ Backward compatible - still returns gitPath for reference
3. ✅ No extra tool calls needed
4. ✅ Works automatically with Claude Desktop and other MCP clients

**Also implement Option 3** as a fallback for robustness, so the get-page API gracefully handles both formats.

## Impact on Claude Desktop

After implementing this fix, the workflow will be:

1. User: "What bugs are in Release_002?"
2. Claude Desktop: `search-wiki-pages("Release_002")`
3. Search returns both `gitPath` and `wikiPath`
4. Claude Desktop: `get-wiki-page(wikiPath)` ✅ Works!
5. Claude parses the page content and extracts bug numbers

No more "Wiki page not found" errors!
