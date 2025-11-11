# Tool Decommission Proposal

**Date:** 2025-01-11
**Current Tool Count:** 170 tools + 47 prompts = 217 total
**Issue:** VS Code agent has a 128 tool limit, preventing use of other MCP servers
**Goal:** Reduce tool count to ~133-145 tools (25-37 tools removed)

---

## Executive Summary

This proposal identifies **25-37 tools** that can be safely removed without loss of functionality. All removed tools are convenience wrappers around more fundamental tools (primarily `execute-query` methods) or can be achieved by combining 2 other existing tools.

**Impact:**
- ✅ Saves 25-37 tool slots
- ✅ Final count: 133-145 tools (well within 128 limit with room for other MCP servers)
- ✅ Maintains all core functionality
- ✅ Forces users to learn more powerful patterns (execute-query)

---

## Detailed Analysis by Integration

### Application Insights (10 → 3 tools)
**Remove 7 convenience wrappers:**

All these tools are simple wrappers around `appinsights-execute-query` with predefined KQL queries:

| Tool | Replacement | KQL Query Example |
|------|-------------|-------------------|
| `appinsights-get-exceptions` | `appinsights-execute-query` | `exceptions \| top 50 by timestamp desc` |
| `appinsights-get-slow-requests` | `appinsights-execute-query` | `requests \| where duration > 5000` |
| `appinsights-get-operation-performance` | `appinsights-execute-query` | `requests \| summarize count(), avg(duration), percentiles(duration, 50, 95, 99) by operation_Name` |
| `appinsights-get-failed-dependencies` | `appinsights-execute-query` | `dependencies \| where success == false` |
| `appinsights-get-traces` | `appinsights-execute-query` | `traces \| where severityLevel >= 2` |
| `appinsights-get-availability` | `appinsights-execute-query` | `availabilityResults \| summarize ...` |
| `appinsights-get-custom-events` | `appinsights-execute-query` | `customEvents \| where name == "EventName"` |

**Keep (3 tools):**
- `appinsights-list-resources` - Lists configured resources
- `appinsights-get-metadata` - Schema exploration
- `appinsights-execute-query` - Core KQL execution

---

### Log Analytics (10 → 3-4 tools)
**Remove 6 convenience wrappers:**

All these tools are wrappers around `loganalytics-execute-query`:

| Tool | Replacement | KQL Query Example |
|------|-------------|-------------------|
| `loganalytics-get-function-logs` | `loganalytics-execute-query` | `FunctionAppLogs \| where FunctionName == "MyFunc"` |
| `loganalytics-get-function-errors` | `loganalytics-execute-query` | `FunctionAppLogs \| where ExceptionDetails != ""` |
| `loganalytics-get-function-stats` | `loganalytics-execute-query` | `FunctionAppLogs \| summarize count() by FunctionName` |
| `loganalytics-get-function-invocations` | `loganalytics-execute-query` | `requests \| where operation_Name contains "Functions"` |
| `loganalytics-get-recent-events` | `loganalytics-execute-query` | `TableName \| top 100 by TimeGenerated desc` |
| `loganalytics-search-logs` | `loganalytics-execute-query` | `search "text" \| where TimeGenerated > ago(1h)` |

**Keep (3-4 tools):**
- `loganalytics-list-workspaces` - Lists configured workspaces
- `loganalytics-get-metadata` - Schema exploration
- `loganalytics-execute-query` - Core KQL execution
- `loganalytics-test-workspace-access` - Optional, but useful for diagnostics

---

### Azure SQL Database (9 → 3-4 tools)
**Remove 5 schema listing tools:**

All these tools can be replaced with `sql-execute-query` using standard SQL:

| Tool | Replacement | SQL Query Example |
|------|-------------|-------------------|
| `sql-list-tables` | `sql-execute-query` | `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'` |
| `sql-list-views` | `sql-execute-query` | `SELECT * FROM INFORMATION_SCHEMA.VIEWS` |
| `sql-list-stored-procedures` | `sql-execute-query` | `SELECT name, create_date, modify_date FROM sys.procedures` |
| `sql-list-triggers` | `sql-execute-query` | `SELECT name, parent_class_desc, is_disabled FROM sys.triggers` |
| `sql-list-functions` | `sql-execute-query` | `SELECT name, type_desc FROM sys.objects WHERE type IN ('FN', 'IF', 'TF')` |

**Keep (3-4 tools):**
- `sql-execute-query` - Core SQL execution (SELECT only)
- `sql-get-table-schema` - Complex query combining INFORMATION_SCHEMA views (harder to replicate)
- `sql-get-object-definition` - Retrieves sp_helptext output
- `sql-test-connection` - Optional, but provides clear error messages

---

### PowerPlatform Forms (6 → 4 tools)
**Remove 2 state management wrappers:**

| Tool | Replacement | Rationale |
|------|-------------|-----------|
| `activate-form` | `update-form` with `{statecode: 1}` | State change is just an update operation |
| `deactivate-form` | `update-form` with `{statecode: 0}` | State change is just an update operation |

**Keep (4 tools):**
- `create-form` - Distinct operation
- `update-form` - Core update with any properties
- `delete-form` - Distinct operation
- `get-forms` - List/retrieve forms

---

### PowerPlatform Views (6 → 4 tools)
**Remove 2 convenience wrappers:**

| Tool | Replacement | Rationale |
|------|-------------|-----------|
| `set-default-view` | `update-view` with `{isdefault: true}` | Default flag is just an update operation |
| `get-view-fetchxml` | `get-views` then extract `fetchxml` property | Minor efficiency loss, but achievable |

**Keep (4 tools):**
- `create-view` - Distinct operation
- `update-view` - Core update with any properties
- `delete-view` - Distinct operation
- `get-views` - List/retrieve views with full metadata

---

### GitHub Enterprise (22 → 19-20 tools)
**Remove 2-3 tools:**

| Tool | Replacement | Rationale |
|------|-------------|-----------|
| `ghe-get-directory-structure` | Call `ghe-list-files` recursively | Multiple API calls, but achievable |
| `ghe-get-file-history` | Use `ghe-get-commits` with `path` parameter | Already supports path filtering |
| `ghe-search-repos` | External GitHub search or less commonly used | Debatable - low usage tool |

**Keep:** Core file/commit/PR operations (19-20 tools)

---

### SharePoint Online (15 → 12-14 tools)
**Remove 1-3 tools:**

| Tool | Replacement | Rationale |
|------|-------------|-----------|
| `spo-get-recent-items` | `spo-list-items` + client-side date filtering | Simple date comparison |
| `spo-test-connection` | Connection tested on first API call anyway | Optional - better DX if kept |
| `spo-get-item-by-path` | `spo-list-items` recursively | Very inefficient - **consider keeping** |

**Keep:** Most SharePoint tools are distinct operations (12-14 tools)

---

### Service Bus (8 → 7-8 tools)
**Remove 0-1 tool:**

| Tool | Replacement | Rationale |
|------|-------------|-----------|
| `servicebus-test-connection` | Connection tested on first API call anyway | Optional - better DX if kept |

**Keep:** All 8 tools - distinct operations with no simpler alternatives

---

### PowerPlatform Other (84 → 81-84 tools)
**Remove 0-3 tools (debatable):**

| Tool | Replacement | Rationale |
|------|-------------|-----------|
| `check-entity-dependencies` | `check-dependencies` with entity metadata ID | Generic version exists |
| `get-publishers` | `query-records` on publisher entity | Could use generic query |
| `get-solutions` | `query-records` on solution entity | Could use generic query |

**Keep:** Most customization tools - these are legitimate distinct operations (81-84 tools)

---

### Azure DevOps (13 tools)
**Remove: 0 tools**

All Azure DevOps tools are distinct operations:
- Wiki operations: CRUD, search, string-replace (token-efficient)
- Work item operations: CRUD, query, comments
- **Keep `azuredevops-str-replace-wiki-page`** - Specifically designed for 98% token reduction

---

### Figma (2 tools)
**Remove: 0 tools**

Only 2 tools total - both necessary.

---

## Summary Table

| Integration | Current Tools | Definite Remove | Maybe Remove | New Total |
|-------------|---------------|-----------------|--------------|-----------|
| Application Insights | 10 | 7 | 0 | **3** |
| Log Analytics | 10 | 6 | 1 (test-connection) | **3-4** |
| Azure SQL | 9 | 5 | 1 (test-connection) | **3-4** |
| PowerPlatform Forms | 6 | 2 | 0 | **4** |
| PowerPlatform Views | 6 | 2 | 0 | **4** |
| PowerPlatform Other | 84 | 0 | 3 (check-entity-deps, publishers, solutions) | **81-84** |
| GitHub Enterprise | 22 | 2 | 1 (search-repos) | **19-20** |
| SharePoint | 15 | 1 | 2 (test-connection, get-item-by-path) | **12-14** |
| Service Bus | 8 | 0 | 1 (test-connection) | **7-8** |
| Azure DevOps | 13 | 0 | 0 | **13** |
| Figma | 2 | 0 | 0 | **2** |
| **TOTALS** | **170** | **25** | **7-12** | **133-145** |

---

## Recommended Removals

### Tier 1: Definite Remove (25 tools)

**High Confidence - No Functionality Loss:**

1. **Application Insights (7):**
   - appinsights-get-exceptions
   - appinsights-get-slow-requests
   - appinsights-get-operation-performance
   - appinsights-get-failed-dependencies
   - appinsights-get-traces
   - appinsights-get-availability
   - appinsights-get-custom-events

2. **Log Analytics (6):**
   - loganalytics-get-function-logs
   - loganalytics-get-function-errors
   - loganalytics-get-function-stats
   - loganalytics-get-function-invocations
   - loganalytics-get-recent-events
   - loganalytics-search-logs

3. **Azure SQL (5):**
   - sql-list-tables
   - sql-list-views
   - sql-list-stored-procedures
   - sql-list-triggers
   - sql-list-functions

4. **PowerPlatform Forms (2):**
   - activate-form
   - deactivate-form

5. **PowerPlatform Views (2):**
   - set-default-view
   - get-view-fetchxml

6. **GitHub Enterprise (2):**
   - ghe-get-directory-structure
   - ghe-get-file-history

7. **SharePoint (1):**
   - spo-get-recent-items

**Savings:** 25 tools → **Down to 145 tools**

---

### Tier 2: Consider Removing (7-12 tools)

**Medium Confidence - Tradeoffs Involved:**

1. **Test Connection Tools (4):**
   - loganalytics-test-workspace-access
   - sql-test-connection
   - servicebus-test-connection
   - spo-test-connection
   - **Tradeoff:** Better error messages vs. tool count
   - **Recommendation:** Remove if desperate for slots, keep for better DX

2. **PowerPlatform Generic Wrappers (3):**
   - check-entity-dependencies (use check-dependencies)
   - get-publishers (use query-records)
   - get-solutions (use query-records)
   - **Tradeoff:** Convenience vs. learning generic query pattern
   - **Recommendation:** Remove - forces users to learn query-records

3. **GitHub Enterprise (1):**
   - ghe-search-repos
   - **Tradeoff:** Low usage vs. completeness
   - **Recommendation:** Remove - external GitHub search available

4. **SharePoint (1):**
   - spo-get-item-by-path
   - **Tradeoff:** Convenience vs. efficiency concerns
   - **Recommendation:** **KEEP** - recursive listing very inefficient

**Additional Savings:** 7-11 tools → **Down to 133-145 tools**

---

## Quick Start: How to Comment Out Tools

To comment out any tool, wrap the entire `server.tool(...)` block in `/* */`:

```typescript
// BEFORE:
server.tool(
  "tool-name",
  "Description",
  { /* params */ },
  async () => { /* implementation */ }
);

// AFTER:
/**
 * TOOL DECOMMISSIONED (v14.0.0)
 * MIGRATION: Use alternative-tool instead
 * To restore: Uncomment the block below
 */
/*
server.tool(
  "tool-name",
  "Description",
  { /* params */ },
  async () => { /* implementation */ }
);
*/
```

**Script Available:** Use `/comment_out_tools_v2.cjs` (needs debugging) or comment out manually.

---

## Implementation Plan

### Phase 1: Documentation Updates (CRITICAL)

Before removing any tools, update documentation with query equivalents:

1. **Update `docs/documentation/application-insights.md`:**
   - Add section: "Common KQL Queries" with examples for all removed tools
   - Update tool count in header

2. **Update `docs/documentation/log-analytics.md`:**
   - Add section: "Common KQL Queries for Azure Functions"
   - Include FunctionAppLogs schema reference

3. **Update `docs/documentation/azure-sql.md`:**
   - Add section: "Schema Discovery Queries"
   - Include INFORMATION_SCHEMA examples

4. **Update `docs/documentation/powerplatform.md`:**
   - Add examples for form/view state management using update-* tools
   - Document query-records usage for publishers/solutions

5. **Update `README.md`:**
   - Update tool counts
   - Add note about execute-query pattern being preferred

6. **Update `CLAUDE.md`:**
   - Update architecture sections with new tool counts
   - Add guidance on using execute-query patterns

### Phase 2: Code Removal

1. **Remove tool registrations from `src/index.ts`:**
   - Comment out removed tools with migration guidance
   - Keep code for 1 release as reference

2. **Update service files (optional):**
   - Service methods can remain (no harm)
   - Or mark as deprecated with JSDoc comments

3. **Update prompts:**
   - Update prompts that reference removed tools
   - Ensure prompts use execute-query where needed

### Phase 3: Testing

1. **Test execute-query equivalents:**
   - Verify KQL/SQL queries work as documented
   - Test edge cases (timespan conversion, parameter handling)

2. **Test prompts:**
   - Ensure prompts still work after tool removals
   - Verify cross-service correlation still functions

### Phase 4: Release

1. **Version bump:** Major version (14.0.0) - breaking change
2. **Release notes:** Document removed tools and replacements
3. **Migration guide:** Create migration guide for users

---

## Migration Guide Template

```markdown
## Migrating from v13.x to v14.x

### Removed Tools and Replacements

#### Application Insights

**Removed:** `appinsights-get-exceptions`
**Replacement:**
```typescript
await appinsights-execute-query({
  resourceId: "prod-api",
  query: "exceptions | top 50 by timestamp desc",
  timespan: "PT1H"
});
```

**Removed:** `appinsights-get-slow-requests`
**Replacement:**
```typescript
await appinsights-execute-query({
  resourceId: "prod-api",
  query: "requests | where duration > 5000 | order by duration desc",
  timespan: "PT1H"
});
```

[... continue for all removed tools ...]
```

---

## Risks and Mitigations

### Risk 1: User Confusion
**Risk:** Users may be confused by tool removals
**Mitigation:**
- Clear migration guide with examples
- Documentation updates before code changes
- Keep deprecated tools for 1 release with warnings

### Risk 2: Breaking Existing Workflows
**Risk:** Automated workflows may break
**Mitigation:**
- Major version bump (14.0.0)
- Detailed changelog
- Deprecation warnings in v13.x release

### Risk 3: Loss of Convenience
**Risk:** Users prefer convenience wrappers
**Mitigation:**
- Better documentation of execute-query patterns
- Prompts can still use execute-query internally
- Users gain more powerful capabilities

---

## Benefits

1. **Immediate:** Frees up 25-37 tool slots for other MCP servers
2. **Performance:** Fewer tools = faster tool loading/indexing
3. **Maintainability:** Less code to maintain and test
4. **User Education:** Forces learning of more powerful patterns
5. **Flexibility:** Execute-query allows arbitrary KQL/SQL queries
6. **Future-Proof:** Easier to add new integrations without hitting limits

---

## Questions for Review

1. **Tier 1 Removals:** Agree to remove all 25 Tier 1 tools?
2. **Test Connection Tools:** Keep or remove? (DX vs. tool count)
3. **PowerPlatform Wrappers:** Remove check-entity-dependencies, get-publishers, get-solutions?
4. **GitHub search-repos:** Remove or keep?
5. **SharePoint get-item-by-path:** Remove or keep? (Efficiency concerns)
6. **Timeline:** When to implement? Next release (14.0.0)?

---

## Decision Matrix

| Removal Scenario | Tools Removed | Final Count | Notes |
|------------------|---------------|-------------|-------|
| **Conservative** | Tier 1 only | 145 tools | Safe, documented replacements |
| **Moderate** | Tier 1 + test tools | 141 tools | Some DX loss |
| **Aggressive** | Tier 1 + Tier 2 all | 133 tools | Maximum savings |
| **Recommended** | Tier 1 + PP wrappers + GHE search | 138 tools | Balanced approach |

**Recommendation:** Start with **Tier 1 only** (25 tools) for v14.0.0, then evaluate if further reduction needed.

---

## Appendix A: Full KQL/SQL Query Reference

### Application Insights Common Queries

```kql
// Exceptions
exceptions
| top 50 by timestamp desc
| project timestamp, type, outerMessage, problemId, operation_Name

// Slow Requests (>5s)
requests
| where duration > 5000
| order by duration desc
| project timestamp, name, duration, resultCode, url

// Operation Performance
requests
| summarize
    count(),
    avg(duration),
    percentiles(duration, 50, 95, 99)
  by operation_Name
| order by count_ desc

// Failed Dependencies
dependencies
| where success == false
| project timestamp, name, type, target, resultCode, duration

// Traces by Severity
traces
| where severityLevel >= 2  // Warning and above
| order by timestamp desc

// Availability Tests
availabilityResults
| summarize
    uptime=countif(success==true)*100.0/count(),
    tests=count()
  by name, location

// Custom Events
customEvents
| where name == "UserLogin"
| extend userId = tostring(customDimensions.userId)
| summarize count() by userId
```

### Log Analytics Common Queries

```kql
// Function Logs
FunctionAppLogs
| where FunctionName == "MyFunction"
| where SeverityLevel >= 2
| order by TimeGenerated desc

// Function Errors
FunctionAppLogs
| where ExceptionDetails != ""
| project TimeGenerated, FunctionName, Message, ExceptionDetails

// Function Stats
FunctionAppLogs
| summarize
    executions=count(),
    errors=countif(ExceptionDetails != ""),
    successRate=countif(ExceptionDetails == "")*100.0/count()
  by FunctionName

// Function Invocations
requests
| where operation_Name contains "Functions.MyFunction"
| project timestamp, duration, resultCode, operation_Id

// Search Logs
search "error"
| where TimeGenerated > ago(1h)
| take 100
```

### Azure SQL Common Queries

```sql
-- List Tables
SELECT
    TABLE_SCHEMA,
    TABLE_NAME,
    TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_SCHEMA, TABLE_NAME;

-- List Views
SELECT
    TABLE_SCHEMA,
    TABLE_NAME,
    VIEW_DEFINITION
FROM INFORMATION_SCHEMA.VIEWS
ORDER BY TABLE_SCHEMA, TABLE_NAME;

-- List Stored Procedures
SELECT
    name,
    create_date,
    modify_date,
    type_desc
FROM sys.procedures
ORDER BY name;

-- List Triggers
SELECT
    t.name,
    t.parent_class_desc,
    t.is_disabled,
    o.name AS parent_object,
    t.create_date
FROM sys.triggers t
LEFT JOIN sys.objects o ON t.parent_id = o.object_id
ORDER BY t.name;

-- List Functions
SELECT
    name,
    type_desc,
    create_date,
    modify_date
FROM sys.objects
WHERE type IN ('FN', 'IF', 'TF')  -- Scalar, Inline, Table-valued
ORDER BY name;
```

---

**End of Proposal**
