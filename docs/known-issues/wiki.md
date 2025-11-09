# Bug Report: Wiki Page Update Fails with 500 Error - Path Mismatch

## ✅ STATUS: RESOLVED (2025-11-09)

**This bug has been fixed.** See [wiki-fix-summary.md](wiki-fix-summary.md) for implementation details.

**Fix Summary:**
- All wiki operations now consistently normalize paths (hyphens → spaces)
- `getWikiPage` now returns version/ETag for optimistic concurrency
- `updateWikiPage` now supports `If-Match` header for version control
- Works with both hyphenated and space-separated path inputs

---

## Original Bug Report

## Summary
Unable to update an Azure DevOps wiki page after successful creation. The `update-wiki-page` tool returns a 500 error claiming the page already exists, with a discrepancy between the path used during creation (hyphens) and the path shown in the error message (spaces).

## Environment
- **Project:** RTPI
- **Wiki:** RTPI.Crm.wiki (Project Wiki)
- **MCP Server:** RTPI-CRM-ADO
- **API Version:** Azure DevOps REST API

## Steps to Reproduce

1. Create a new wiki page using `create-wiki-page`:
   ```
   Tool: create-wiki-page
   Parameters:
     - pagePath: /SPO-SharePoint-Online-Setup-Instructions
     - project: RTPI
     - wikiId: RTPI.Crm.wiki
     - content: [markdown content]
   ```
   **Result:** ✅ Success - Page created

2. Attempt to update the same page using `update-wiki-page`:
   ```
   Tool: update-wiki-page
   Parameters:
     - pagePath: /SPO-SharePoint-Online-Setup-Instructions
     - project: RTPI
     - wikiId: RTPI.Crm.wiki
     - content: [updated markdown content]
     - version: W/"..."
   ```
   **Result:** ❌ Failed with 500 error

## Expected Behavior
- The wiki page should update successfully with the new content
- The same path format used for creation should work for updates

## Actual Behavior
**Error Message:**
```
Failed to update wiki page: Azure DevOps API request failed: 
Request failed with status code 500 - 
"The page '/SPO SharePoint Online Setup Instructions' specified in the add operation already exists in the wiki. Please specify a new page path."
```

## Key Issues Identified

### 1. Path Transformation
- **Created with:** `/SPO-SharePoint-Online-Setup-Instructions` (hyphens)
- **Error shows:** `/SPO SharePoint Online Setup Instructions` (spaces)
- Unclear if Azure DevOps is converting hyphens to spaces or if this is just the display name

### 2. Error Code Mismatch
- Receiving HTTP 500 (Internal Server Error) 
- Should be HTTP 409 (Conflict) if page already exists
- Suggests an issue with the update operation logic

### 3. "add operation" Message
- Error message mentions "add operation"
- This is an UPDATE operation, not an ADD operation
- Indicates the API may be treating update as create

### 4. Missing ETag/Version Handling
- Attempted to get the page first with `get-wiki-page` to retrieve version
- `get-wiki-page` returned: "No result received from client-side tool execution"
- Cannot retrieve the ETag/version needed for proper update

## Additional Context

### get-wiki-page Also Failing
Attempted to retrieve the page before updating:
```
Tool: get-wiki-page
Parameters:
  - pagePath: /SPO-SharePoint-Online-Setup-Instructions
  - project: RTPI
  - wikiId: RTPI.Crm.wiki
```
**Result:** 
```
<error>No result received from client-side tool execution.</error>
```

This suggests there may be a broader issue with wiki page retrieval/update operations.

## Impact
- **Severity:** High
- **Workaround:** Delete and recreate the page (loses edit history)
- **Affects:** Ability to maintain and update wiki documentation
- **Blocks:** Documentation updates via MCP tools

## Suggested Investigation Areas

1. **Path Normalization:**
   - How does Azure DevOps handle hyphens vs spaces in wiki page paths?
   - Is there automatic transformation happening?
   - Should the MCP server normalize paths consistently?

2. **Version/ETag Handling:**
   - Why does `get-wiki-page` return no result?
   - Is the version parameter required or optional?
   - How should the version be retrieved for updates?

3. **Update vs Create Operation:**
   - Why does the error mention "add operation" for an update?
   - Is the update endpoint incorrectly routing to create?
   - Are there different endpoints for update vs create that should be used?

4. **Error Response Codes:**
   - Why HTTP 500 instead of 409 for conflict?
   - Are there other status codes that should be handled?

## Temporary Workaround Used
Attempted to search for the page to verify it exists and get the correct path format.

## Recommended Fix
1. Fix `get-wiki-page` tool to properly retrieve existing pages
2. Ensure `update-wiki-page` uses correct Azure DevOps API endpoint
3. Add path normalization to handle hyphen/space conversion
4. Improve error handling to distinguish between:
   - Page doesn't exist (404)
   - Version conflict (409)
   - Path already exists (409)
   - Server error (500)