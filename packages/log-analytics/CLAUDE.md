# Log Analytics Package Guide

## Overview

Azure Log Analytics integration for workspace queries, Azure Functions troubleshooting, and sync-function-app debugging.

- **Tools:** 14 tools, 4 prompts
- **Authentication:** Entra ID (recommended) or API Key
- **Shared Credentials:** Can reuse Application Insights credentials

## Environment Configuration

```bash
# Authentication method
LOGANALYTICS_AUTH_METHOD=entra-id  # or 'api-key'

# Entra ID authentication (can reuse App Insights creds)
LOGANALYTICS_TENANT_ID=your-azure-tenant-id
LOGANALYTICS_CLIENT_ID=your-azure-app-client-id
LOGANALYTICS_CLIENT_SECRET=your-azure-app-client-secret

# Multi-workspace configuration (JSON array)
# Naming convention: log-{environment}-{client}-...
LOGANALYTICS_RESOURCES=[{"id":"log-dev-acme-uks-01","name":"log-dev-acme-uks-01","workspaceId":"guid","active":true}]

# Single workspace fallback
LOGANALYTICS_WORKSPACE_ID=guid
LOGANALYTICS_API_KEY=your-api-key
```

## Key Tools

### Investigation Tools (Start Here)
- `la-investigate-app` - Combined investigation: exceptions + traces + recent errors (deduplicated)
- `la-investigate-sync` - **sync-function-app-specific**: Auto-derives sync app from workspace ID, categorizes errors
- `la-get-error-summary` - Aggregated error summary by type (deduplicated by OperationId)

### Query Tools
- `la-execute-query` - Run custom KQL queries with column filtering
- `la-get-recent-events` - Recent events from any table
- `la-search-logs` - Cross-table text search

### Azure Functions Tools
- `la-get-fn-logs` - Function execution logs with severity filter
- `la-get-fn-errors` - Function error logs with exception details
- `la-get-fn-stats` - Execution statistics (count, success rate), one row per function
- `la-get-fn-invocations` - Function invocation history

### Utility Tools
- `la-list-workspaces` - List configured workspaces
- `la-get-metadata` - Schema catalogue: tables the workspace *could* hold
- `la-list-workspace-tables` - Inventory: data types the workspace has actually ingested
- `la-test-access` - Validate workspace access

## New Features (v27+)

### Column Filtering (Token Reduction)
All query tools support `columnPreset` parameter:
- `minimal` - 4 columns (TimeGenerated, AppRoleName, Message, SeverityLevel)
- `investigation` - 8 columns (adds ExceptionType, OuterMessage, InnermostMessage, OperationId)
- `full` - All columns (default for backwards compatibility)

```typescript
// Example: Reduce tokens by 80%+
execute-query(resourceId, query, columnPreset: "minimal", outputFormat: "markdown")
```

### Retry Deduplication
Investigation tools group by `OperationId` to deduplicate retry attempts:
- Shows `UniqueErrors` count and `TotalRetries`
- Single error that retried 10 times shows as 1 row, not 10
- Enabled by default, disable with `deduplicateRetries: false`

### Output Formats
All tools support the `outputFormat` parameter (`--format` on the CLI):
- `json` - Raw JSON
- `markdown` - Formatted markdown tables

Default is `json`, except the report-style tools `la-get-error-summary` and `la-investigate-app`,
which default to `markdown` because they are read by humans. Pass `json` to those when a consumer
parses the result — `la-investigate-app` then returns `{ appNamePattern, timespan, deduplicate,
exceptionSummary, traceSeverity, recentErrors, includeDetails, detailsLimit }`.

### Sync Function App Investigation

The `la-investigate-sync` tool is designed for sync-function-app debugging:

```typescript
// Workspace ID encodes environment and client
// log-dev-acme-uks-01 → func-dev-acme-sc-sync-*
investigate-sync(resourceId: "log-dev-acme-uks-01", timespan: "PT8H")
```

**Features:**
- Auto-derives sync app name from workspace ID naming convention
- Categorizes errors: Dataverse, ServiceBus, Database, Timeout, Network
- Groups by FunctionName (e.g., `contactSynchronization`, `accountChangeTracking`)
- Default timespan: PT8H (typical work day)

## Common Investigation Workflows

### Quick Health Check
```typescript
// Start with combined investigation
investigate-app(resourceId, timespan: "PT1H")
```

### Sync Function-App Debugging
```typescript
// For the sync function app clients
investigate-sync(resourceId: "log-dev-acme-uks-01", timespan: "PT8H")
```

### Error Summary (Aggregated)
```typescript
// Get deduplicated error counts
get-error-summary(resourceId, timespan: "P1D", tableName: "AppExceptions")
```

### Custom KQL Query
```typescript
// With column filtering for token efficiency
execute-query(
  resourceId,
  query: "AppTraces | where SeverityLevel >= 3 | take 50",
  columnPreset: "minimal",
  outputFormat: "markdown"
)
```

## Things that will bite you

**`la-get-metadata` is a schema catalogue, not an inventory.** It returned 679-691 tables for every workspace measured, near-identically, including for a workspace that had ingested nothing in seven days. Any rule of the form "this workspace has no X table" keyed on it can never fire, and any per-workspace table census credits every empty workspace with a full telemetry stack. The payload now declares itself via `scope.kind: 'schema-catalogue'`. Use `la-list-workspace-tables` (CLI: `workspace tables`) for what a workspace actually holds; it is backed by `Usage | summarize by DataType` and therefore covers ingestion-metered data types only, which its `summary.caveat` says on every call.

**`FunctionAppLogs.FunctionName` is not one name per function.** The same Azure Function reaches that column as the bare name, as a `Functions.`-prefixed variant written by the functions runtime, and as blank on host-level rows. Any `summarize ... by FunctionName` therefore groups by *name*, not by *function*: `la-get-fn-stats` returned 61 rows for 27 functions and inflated total executions from 43,445 to 131,977, roughly threefold, and nothing in the output said so. `collapseFunctionStats` in `src/utils/function-stats.ts` does the reduction and reports it in a `normalization` block. **Any new query that groups by `FunctionName` must run through it**, or normalise the column itself - a threefold inflation of an execution count is not obviously wrong on sight, so it does not get cross-checked.

**A markdown rendering drops everything but the tables.** `formatTableAsMarkdown` keeps the rows and nothing else, so a `normalization` note, a `timespanWarning` or any other declaration has to be appended to the string by hand. `la-get-fn-stats`, the `fn stats` CLI command and the three prompt templates all do this. A new markdown surface that forgets to is silently back to presenting a reshaped table as the raw one.

## Reference

See `docs/technical/LOG_ANALYTICS_TECHNICAL.md` for detailed implementation.

## CLI Usage

Binary: `mcp-loganalytics-cli`

```bash
# Execute KQL query
mcp-loganalytics-cli query execute my-workspace "AppTraces | take 10"

# List workspaces
mcp-loganalytics-cli workspace list

# Combined app investigation — markdown report (default)
mcp-loganalytics-cli query investigate-app my-workspace --app-name "func-dev" --timespan PT2H

# Same investigation as structured JSON, for a consumer that parses the findings
mcp-loganalytics-cli query investigate-app my-workspace --timespan P7D --format json
```
