# Wiki Path Fix - Implementation Summary

## Problem

Claude Desktop (and other MCP clients) could not retrieve Azure DevOps wiki pages after searching for them because:

- **Search API** returns **git paths**: `/Release-Notes/Page-Name.md`
- **Get Page API** expects **wiki paths**: `/Release Notes/Page Name`

These formats are incompatible, causing "Wiki page not found" errors.

## Solution Implemented

### Two-Pronged Approach

#### 1. Search Results Enhancement (Primary Solution)

Modified `searchWikiPages()` to automatically convert git paths to wiki paths:

```typescript
results: (response.results || []).map((result: any) => {
  const gitPath = result.path;
  const wikiPath = this.convertGitPathToWikiPath(gitPath);
  return {
    fileName: result.fileName,
    gitPath: gitPath,      // Original git path (for reference)
    path: wikiPath,         // Converted wiki path (for get-page API)
    wikiName: result.wiki?.name,
    wikiId: result.wiki?.id,
    // ...
  };
})
```

**Benefits:**
- ✅ Transparent to users
- ✅ Backward compatible (still uses `path` field)
- ✅ Provides both paths for flexibility

#### 2. Auto-Conversion in Get-Page (Fallback)

Modified `getWikiPage()` to detect and convert git paths:

```typescript
async getWikiPage(project: string, wikiId: string, pagePath: string, includeContent: boolean = true) {
  // Auto-convert git paths to wiki paths
  let wikiPath = pagePath;
  if (pagePath.endsWith('.md')) {
    wikiPath = this.convertGitPathToWikiPath(pagePath);
  }
  // Use converted path for API call
}
```

**Benefits:**
- ✅ Works even if git path is passed directly
- ✅ More robust and forgiving
- ✅ No breaking changes

### Core Conversion Logic

```typescript
private convertGitPathToWikiPath(gitPath: string): string {
  return gitPath
    .replace(/\.md$/, '')      // Remove .md extension
    .replace(/-/g, ' ')         // Replace dashes with spaces
    .replace(/%2D/gi, '-');     // Decode %2D back to -
}
```

## Testing Results

### Test 1: End-to-End Workflow ✅

```bash
$ node test-wiki-fix.js

Step 1: Search for 'Release_002'...
✓ Found 1 result
  Git Path:  /Release-Notes/Release_002-[Online-Joining]-%2D-Go%2DLive-Check-List.md
  Wiki Path: /Release Notes/Release_002 [Online Joining] - Go-Live Check List

Step 2: Get wiki page using 'path' from search...
✓ SUCCESS! Page retrieved
  Content Length: 11129 characters

Step 3: Extract ADO items...
✓ Found 23 ADO items: #65225, #65378, #52067, ...

✅ ALL TESTS PASSED!
```

### Test 2: Auto-Conversion ✅

```bash
$ node test-auto-conversion.js

Test: Pass git path directly to get-wiki-page
Git Path: /Release-Notes/Release_002-[Online-Joining]-%2D-Go%2DLive-Check-List.md

Auto-converted git path to wiki path:
  /Release-Notes/... -> /Release Notes/Release_002 [Online Joining] - Go-Live Check List

✓ SUCCESS!

✅ AUTO-CONVERSION TEST PASSED!
```

## Impact on Claude Desktop

### Before Fix ❌

```
User: What bugs are in Release_002?
Claude Desktop: search-wiki-pages("Release_002")
  → Returns: path = "/Release-Notes/Release_002-...md"

Claude Desktop: get-wiki-page(path)
  → ❌ Error: "Wiki page not found"
```

### After Fix ✅

```
User: What bugs are in Release_002?
Claude Desktop: search-wiki-pages("Release_002")
  → Returns: path = "/Release Notes/Release_002 [Online Joining] - Go-Live Check List"

Claude Desktop: get-wiki-page(path)
  → ✅ Success! Returns page content

Claude: "Release_002 includes 23 ADO items: #65225, #65378, ..."
```

## Files Modified

- [src/AzureDevOpsService.ts](src/AzureDevOpsService.ts):
  - Added `convertGitPathToWikiPath()` helper function
  - Modified `searchWikiPages()` to return both paths
  - Modified `getWikiPage()` to auto-convert git paths

## Test Files Created

- `test-wiki-fix.js` - End-to-end workflow test
- `test-auto-conversion.js` - Auto-conversion test
- `analyze-path-conversion.js` - Path conversion analysis
- `test-release-002-path.js` - Release_002 specific test
- `WIKI_PATH_ISSUE.md` - Detailed issue documentation
- `WIKI_PATH_FIX_SUMMARY.md` - This file

## Next Steps

1. ✅ Build and test locally - DONE
2. ⏳ Deploy to Claude Desktop - Ready for deployment
3. ⏳ Test with Claude Desktop client
4. ⏳ Update npm package (if needed)

## Backward Compatibility

✅ **Fully backward compatible**

- Existing code using `result.path` will work (now returns wiki path)
- New code can use `result.gitPath` if needed
- `getWikiPage()` accepts both wiki paths and git paths

## Version

Fix implemented on: 2025-10-30
Package version: 0.4.5
