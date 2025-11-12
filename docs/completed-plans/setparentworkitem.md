# Azure DevOps: Add Parent Relationship Support to create-work-item Tool

## Issue Summary

The `create-work-item` tool cannot set parent-child relationships during work item creation, requiring a separate update operation to establish the hierarchy.

## Current Behavior

When creating a work item using the `create-work-item` tool:

```json
{
  "fields": {
    "System.Title": "NEU API | GetMember",
    "System.Parent": 1133,
    "Microsoft.VSTS.Scheduling.StoryPoints": 2,
    "System.Description": "<content>"
  },
  "project": "Membership%20System%20Replacement",
  "workItemType": "User Story"
}
```

**Result:** The work item is created successfully, but `System.Parent` is ignored and the parent relationship is not established.

## Root Cause

Azure DevOps API requires parent-child relationships to be defined in the `relations` array, not as a field:

```json
{
  "rel": "System.LinkTypes.Hierarchy-Reverse",
  "url": "https://dev.azure.com/{org}/{project}/_apis/wit/workItems/{parentId}"
}
```

The `create-work-item` tool only accepts a `fields` parameter and does not support a `relations` parameter.

## Current Workaround

A two-step process is required:

1. **Step 1: Create the work item**
   ```
   create-work-item with fields only
   ```

2. **Step 2: Add parent relationship**
   ```
   update-work-item with patch operation:
   {
     "op": "add",
     "path": "/relations/-",
     "value": {
       "rel": "System.LinkTypes.Hierarchy-Reverse",
       "url": "https://dev.azure.com/NationalEducationUnion/f8652d6a-e6ed-48b3-ab87-e32016d73455/_apis/wit/workItems/1133"
     }
   }
   ```

## Impact

- **Inefficiency:** Requires two API calls instead of one
- **Error-prone:** Easy to forget the second step
- **User Experience:** Work items appear without parents momentarily
- **Audit Trail:** Creates unnecessary revision history

---

## Implementation Plan: Parent Relationship Support

### 1. Design Decision: Hybrid Approach ✅

**Recommendation:** Implement BOTH `parentId` (simple) and `relations` (advanced) parameters.

**Rationale:**
- **`parentId`**: Covers 90% use case - simple, intuitive, matches user mental model
- **`relations`**: Enables advanced scenarios (multiple links, other relationship types)
- **Hybrid**: Best of both worlds with minimal complexity

**Precedence Rule:** If both provided, merge them (parentId converted to relation and prepended to relations array)

### 2. Service Layer Changes

**File:** [packages/azure-devops/src/AzureDevOpsService.ts](../../packages/azure-devops/src/AzureDevOpsService.ts)

**Current Signature (line 729):**
```typescript
async createWorkItem(project: string, workItemType: string, fields: any): Promise<any>
```

**New Signature:**
```typescript
async createWorkItem(
  project: string,
  workItemType: string,
  fields: any,
  parentId?: number,
  relations?: Array<{
    rel: string;
    url: string;
    attributes?: Record<string, any>;
  }>
): Promise<any>
```

**Implementation Logic:**

```typescript
async createWorkItem(
  project: string,
  workItemType: string,
  fields: any,
  parentId?: number,
  relations?: Array<{ rel: string; url: string; attributes?: Record<string, any> }>
): Promise<any> {
  this.validateProject(project);

  if (!this.config.enableWorkItemWrite) {
    throw new Error('Work item write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.');
  }

  // Build patch operations array
  const patchOperations: any[] = [];

  // Add field operations
  Object.keys(fields).forEach(field => {
    patchOperations.push({
      op: 'add',
      path: `/fields/${field}`,
      value: fields[field]
    });
  });

  // Handle parentId parameter (simplified parent relationship)
  if (parentId !== undefined) {
    const parentUrl = `${this.baseUrl}/${encodeURIComponent(project)}/_apis/wit/workItems/${parentId}`;
    patchOperations.push({
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'System.LinkTypes.Hierarchy-Reverse',
        url: parentUrl
      }
    });
  }

  // Handle relations array (advanced relationships)
  if (relations && relations.length > 0) {
    relations.forEach(relation => {
      patchOperations.push({
        op: 'add',
        path: '/relations/-',
        value: relation
      });
    });
  }

  // Execute API call
  const response = await this.makeRequest<any>(
    `${project}/_apis/wit/workitems/$${workItemType}?api-version=${this.apiVersion}`,
    'PATCH',
    patchOperations
  );

  return {
    id: response.id,
    rev: response.rev,
    fields: response.fields,
    relations: response.relations || [],  // Include relations in response
    url: response._links?.html?.href,
    project
  };
}
```

### 3. Tool Layer Changes

**File:** [packages/azure-devops/src/index.ts](../../packages/azure-devops/src/index.ts)

**Current Schema (line 788-794):**
```typescript
{
  project: z.string().describe("The project name"),
  workItemType: z.string().describe("The work item type (e.g., 'Bug', 'Task', 'User Story')"),
  fields: z.record(z.any()).describe("Object with field values (e.g., {\"System.Title\": \"Bug title\", \"System.Description\": \"Details\"})"),
}
```

**New Schema:**
```typescript
{
  project: z.string().describe("The project name"),
  workItemType: z.string().describe("The work item type (e.g., 'Bug', 'Task', 'User Story')"),
  fields: z.record(z.any()).describe("Object with field values (e.g., {\"System.Title\": \"Bug title\", \"System.Description\": \"Details\"})"),
  parentId: z.number().optional().describe("Parent work item ID (for creating child items). Simplified alternative to relations parameter."),
  relations: z.array(z.object({
    rel: z.string().describe("Relation type (e.g., 'System.LinkTypes.Hierarchy-Reverse' for parent)"),
    url: z.string().describe("URL to related work item (e.g., 'https://dev.azure.com/org/project/_apis/wit/workItems/123')"),
    attributes: z.record(z.any()).optional().describe("Optional relation attributes")
  })).optional().describe("Advanced: Array of work item relationships. Use parentId for simple parent-child relationships.")
}
```

**Tool Handler (line 795-821):**
```typescript
async ({ project, workItemType, fields, parentId, relations }: any) => {
  try {
    const service = getAzureDevOpsService();
    const result = await service.createWorkItem(project, workItemType, fields, parentId, relations);

    const resultStr = JSON.stringify(result, null, 2);

    return {
      content: [
        {
          type: "text",
          text: `Created work item:\n\n${resultStr}`,
        },
      ],
    };
  } catch (error: any) {
    console.error("Error creating work item:", error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to create work item: ${error.message}`,
        },
      ],
    };
  }
}
```

### 4. Validation & Error Handling

**Input Validation:**
- ✅ `parentId` must be a positive integer (Zod handles this)
- ✅ `relations[].rel` must be a valid relation type string
- ✅ `relations[].url` must be a valid URL format
- ⚠️ No server-side validation that parent exists (Azure DevOps API will return 400 if invalid)

**Error Scenarios:**
1. **Parent doesn't exist:** Azure DevOps returns 400 with message "The link to work item 9999 may not be created because the work item does not exist or you do not have permissions to access it."
2. **Circular relationship:** Azure DevOps returns 400 with message "Circular relationships are not allowed."
3. **Invalid relation type:** Azure DevOps returns 400 with message about invalid link type.
4. **Permission denied:** Azure DevOps returns 401/403 with permission error.

**Error Handling Strategy:**
- Pass through Azure DevOps API errors (they're already descriptive)
- Log errors to console.error for debugging
- Return user-friendly error messages in tool response

### 5. URL Construction Logic

**Challenge:** Construct full work item URL from organization, project, and work item ID.

**Solution:**
```typescript
const parentUrl = `${this.baseUrl}/${encodeURIComponent(project)}/_apis/wit/workItems/${parentId}`;
// Example: https://dev.azure.com/NationalEducationUnion/f8652d6a-e6ed-48b3-ab87-e32016d73455/_apis/wit/workItems/1133
```

**Notes:**
- `this.baseUrl` is already `https://dev.azure.com/${organization}`
- Use `encodeURIComponent(project)` to handle spaces/special chars in project names
- Project can be either name ("Membership System Replacement") or ID (GUID)

### 6. Common Relation Types Reference

Document these in the tool description and CLAUDE.md:

| Relation Type | Description | Use Case |
|---------------|-------------|----------|
| `System.LinkTypes.Hierarchy-Reverse` | Child → Parent | Setting parent for child item (most common) |
| `System.LinkTypes.Hierarchy-Forward` | Parent → Child | Setting children for parent item |
| `System.LinkTypes.Related` | Related | Linking related work items |
| `System.LinkTypes.Dependency-Forward` | Successor | This item blocks the linked item |
| `System.LinkTypes.Dependency-Reverse` | Predecessor | This item is blocked by linked item |

### 7. Example Usage Scenarios

**Scenario 1: Simple parent relationship (recommended)**
```json
{
  "project": "Membership System Replacement",
  "workItemType": "User Story",
  "parentId": 1133,
  "fields": {
    "System.Title": "NEU API | GetMember",
    "Microsoft.VSTS.Scheduling.StoryPoints": 2,
    "System.Description": "Implement GetMember endpoint"
  }
}
```

**Scenario 2: Parent + related item**
```json
{
  "project": "Membership System Replacement",
  "workItemType": "User Story",
  "parentId": 1133,
  "relations": [
    {
      "rel": "System.LinkTypes.Related",
      "url": "https://dev.azure.com/NationalEducationUnion/f8652d6a-e6ed-48b3-ab87-e32016d73455/_apis/wit/workItems/1050"
    }
  ],
  "fields": {
    "System.Title": "NEU API | GetMember",
    "System.Description": "Implement GetMember endpoint"
  }
}
```

**Scenario 3: Multiple relationships (advanced)**
```json
{
  "project": "Membership System Replacement",
  "workItemType": "Task",
  "relations": [
    {
      "rel": "System.LinkTypes.Hierarchy-Reverse",
      "url": "https://dev.azure.com/NationalEducationUnion/f8652d6a-e6ed-48b3-ab87-e32016d73455/_apis/wit/workItems/1133"
    },
    {
      "rel": "System.LinkTypes.Dependency-Reverse",
      "url": "https://dev.azure.com/NationalEducationUnion/f8652d6a-e6ed-48b3-ab87-e32016d73455/_apis/wit/workItems/1050"
    }
  ],
  "fields": {
    "System.Title": "Write API documentation",
    "System.Description": "Document GetMember endpoint"
  }
}
```

### 8. Testing Strategy

**Unit Tests (add to test suite):**
1. ✅ Create work item with parentId only
2. ✅ Create work item with relations only
3. ✅ Create work item with both parentId and relations (merge behavior)
4. ✅ Create work item with neither (existing behavior)
5. ⚠️ Invalid parentId (non-existent) - expect Azure DevOps 400 error
6. ⚠️ Invalid relation URL - expect Azure DevOps 400 error
7. ✅ URL encoding with special characters in project name

**Integration Tests (manual):**
1. Create child user story under existing feature
2. Verify parent relationship in Azure DevOps UI
3. Verify only 1 revision exists (no separate update operation)
4. Create work item with multiple relationships
5. Test error scenarios (non-existent parent, circular relationship)

### 9. Documentation Updates

**Files to Update:**

1. **`/packages/azure-devops/README.md`**
   - Add parentId parameter to create-work-item tool
   - Add usage examples
   - Document relation types

2. **`/CLAUDE.md`** (lines 140-155 - Azure DevOps Tools section)
   - Update create-work-item tool description
   - Add implementation notes about parent relationships
   - Add example usage patterns

3. **`/docs/documentation/azure-devops.md`**
   - Add parentId parameter to tool reference
   - Add "Parent Relationships" section with examples
   - Add relation types table
   - Add troubleshooting section (common errors)

4. **`.env.example`**
   - No changes needed (uses existing `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE` flag)

### 10. Benefits Summary

**Before (current state):**
- 2 API calls required (create + update)
- 2 revisions created
- Easy to forget second step
- Parent appears empty momentarily

**After (with this feature):**
- ✅ Single API call for creation with parent
- ✅ Single revision created
- ✅ Atomic operation (parent set immediately)
- ✅ Cleaner audit history
- ✅ Better user experience
- ✅ Matches Azure DevOps API capabilities
- ✅ Backward compatible (optional parameters)

### 11. Implementation Checklist

- [ ] Update `AzureDevOpsService.createWorkItem()` method signature and implementation
- [ ] Update tool schema in `packages/azure-devops/src/index.ts`
- [ ] Update tool handler to pass new parameters
- [ ] Add TypeScript types/interfaces if needed
- [ ] Update `packages/azure-devops/README.md`
- [ ] Update `/CLAUDE.md` Azure DevOps section
- [ ] Update `/docs/documentation/azure-devops.md`
- [ ] Write unit tests
- [ ] Manual integration testing
- [ ] Update package version (minor bump: 1.x.0 → 1.x+1.0)
- [ ] Publish to npm
- [ ] Update CHANGELOG.md

### 12. Risk Assessment

**Low Risk:**
- Both parameters are optional → backward compatible
- No breaking changes to existing code
- Follows Azure DevOps API patterns
- Error handling delegates to Azure DevOps API (already comprehensive)

**Medium Risk:**
- URL construction logic must handle all project name formats (names vs GUIDs, special characters)
- Need to test with multiple ADO organizations/projects

**Mitigation:**
- Extensive testing with different project name formats
- Clear error messages
- Documentation with troubleshooting section

---

## Recommendation

**Priority: Medium-High** - This is a quality-of-life improvement that significantly improves bulk work item creation workflows and aligns the tool with native Azure DevOps API capabilities.

**Estimated Effort:**
- Code changes: 2-3 hours
- Testing: 1-2 hours
- Documentation: 1 hour
- **Total: 4-6 hours**

**Next Steps:**
1. Implement service layer changes first (testable in isolation)
2. Update tool layer to expose new parameters
3. Write comprehensive tests
4. Update documentation
5. Test with real Azure DevOps projects
6. Publish as minor version bump

---

**Reported by:** Klemens Stelk
**Date:** 2025-11-12
**Tool:** AzureDevops-local-NEU:create-work-item
**Related Work Items:** #1306 (first work item where limitation was encountered)
