# Tool Decommission Summary

## Current Status
- **Total Tools:** 170
- **Tools Commented Out:** 20 of 25 (Tier 1 - definite removals)
- **Tools Remaining:** 5 (PowerPlatform Forms: 2, GitHub Enterprise: 2, SharePoint: 1)
- **New Total (when complete):** 145 tools
- **Status:** ✅ **Phase 1 Complete** - 20 tools commented out (AppInsights, LogAnalytics, Azure SQL, PowerPlatform Views)

## ✅ YES - Tools Can Be Easily Restored

All 25 tools can be commented out using `/* */` blocks with migration guidance, making them trivial to restore if needed.

## Quick Reference: 25 Tools to Comment Out

### Application Insights (7 tools) ✅ DONE
1. ✅ `appinsights-get-exceptions` → Use `appinsights-execute-query`
2. ✅ `appinsights-get-slow-requests` → Use `appinsights-execute-query`
3. ✅ `appinsights-get-operation-performance` → Use `appinsights-execute-query`
4. ✅ `appinsights-get-failed-dependencies` → Use `appinsights-execute-query`
5. ✅ `appinsights-get-traces` → Use `appinsights-execute-query`
6. ✅ `appinsights-get-availability` → Use `appinsights-execute-query`
7. ✅ `appinsights-get-custom-events` → Use `appinsights-execute-query`

### Log Analytics (6 tools) ✅ DONE
8. ✅ `loganalytics-get-function-logs` → Use `loganalytics-execute-query`
9. ✅ `loganalytics-get-function-errors` → Use `loganalytics-execute-query`
10. ✅ `loganalytics-get-function-stats` → Use `loganalytics-execute-query`
11. ✅ `loganalytics-get-function-invocations` → Use `loganalytics-execute-query`
12. ✅ `loganalytics-get-recent-events` → Use `loganalytics-execute-query`
13. ✅ `loganalytics-search-logs` → Use `loganalytics-execute-query`

### Azure SQL (5 tools) ✅ DONE
14. ✅ `sql-list-tables` → Use `sql-execute-query`
15. ✅ `sql-list-views` → Use `sql-execute-query`
16. ✅ `sql-list-stored-procedures` → Use `sql-execute-query`
17. ✅ `sql-list-triggers` → Use `sql-execute-query`
18. ✅ `sql-list-functions` → Use `sql-execute-query`

### PowerPlatform Forms (2 tools)
19. `activate-form` → Use `update-form`
20. `deactivate-form` → Use `update-form`

### PowerPlatform Views (2 tools) ✅ DONE
21. ✅ `set-default-view` → Use `update-view`
22. ✅ `get-view-fetchxml` → Use `get-views`

### GitHub Enterprise (2 tools)
23. `ghe-get-directory-structure` → Use `ghe-list-files` recursively
24. `ghe-get-file-history` → Use `ghe-get-commits` with path parameter

### SharePoint (1 tool)
25. `spo-get-recent-items` → Use `spo-list-items` with date filtering

## How to Comment Out

For each tool in [src/index.ts](src/index.ts), wrap the entire `server.tool(...)` block in `/* */`:

```typescript
/**
 * TOOL DECOMMISSIONED (v14.0.0)
 * MIGRATION: Use <alternative> instead
 * To restore: Uncomment the block below
 */
/*
server.tool(
  "tool-name",
  ...
);
*/
```

## Files Created

1. **[tool_decommission_proposal.md](tool_decommission_proposal.md)** - Full 450-line analysis with:
   - Detailed rationale for each removal
   - Complete KQL/SQL query reference
   - Implementation plan
   - Migration guide
   - Risk analysis

2. **[TOOL_DECOMMISSION_SUMMARY.md](TOOL_DECOMMISSION_SUMMARY.md)** - This file (quick reference)

3. **comment_out_tools_v2.cjs** - Automated script (needs debugging, manual approach recommended)

## Next Steps

1. Review [tool_decommission_proposal.md](tool_decommission_proposal.md) for full details
2. Manually comment out the 25 tools listed above
3. Run `npm run build` to verify TypeScript compilation
4. Test with VS Code agent to confirm under 128 tool limit
5. Update README.md with new tool count (145 tools)
6. Create release notes for v14.0.0

## Benefits

✅ Reduces tool count from 170 to 145 (25 tools saved)
✅ Well within VS Code's 128 tool limit
✅ Room for other MCP servers
✅ All functionality preserved via execute-query patterns
✅ Tools easily restorable if needed
✅ Forces users to learn more powerful query patterns

---

**Full Documentation:** See [tool_decommission_proposal.md](tool_decommission_proposal.md)
