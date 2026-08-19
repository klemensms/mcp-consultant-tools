# Log Analytics - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/LOG_ANALYTICS.md -->

<overview>

The Azure Log Analytics integration provides KQL-based access to Azure Log Analytics workspaces through the Log Analytics Query API (`https://api.loganalytics.io/v1`). Primary use cases are Azure Functions troubleshooting, cross-table log investigation, and sync-function-app debugging.

**Package:** `@mcp-consultant-tools/log-analytics`
**Tools:** 13 tools, 4 prompts
**Security:** Production-safe (read-only)

</overview>

<architecture>

## Architecture

The package follows the standard v28 Service-Tool-Prompt pattern.

```
packages/log-analytics/src/
  index.ts                    # MCP server entry + registerLogAnalyticsTools()
  context-factory.ts          # Shared createServiceContext() for CLI
  types.ts                    # ServiceContext interface
  tool-examples.ts            # descWithExamples() helpers
  cli.ts                      # CLI entry point (Commander.js)
  services/
    log-analytics-service.ts  # LogAnalyticsService class (all business logic)
  tools/
    workspace-tools.ts        # la-list-workspaces, la-get-metadata, la-test-access
    query-tools.ts            # la-execute-query, la-get-recent-events, la-search-logs
    function-tools.ts         # la-get-fn-*, la-get-error-summary, la-investigate-*
  prompts/
    templates.ts              # 4 prompt registrations
  utils/
    loganalytics-formatters.ts  # Formatting and analysis utilities
  cli/
    output.ts                 # Cache dir: .mcp-loganalytics-cache
    commands/
      workspace-commands.ts   # workspace list, metadata, test
      query-commands.ts       # query execute, recent, search, error-summary, investigate-*
      function-commands.ts    # fn logs, errors, stats, invocations
```

**Service class:** `LogAnalyticsService` in `services/log-analytics-service.ts`

</architecture>

<authentication>

## Authentication

<auth-method name="entra-id" priority="high">

### Entra ID (OAuth 2.0) - Recommended

- Rate limit: 60 requests/minute per user, no daily cap
- Uses `@azure/msal-node` `ConfidentialClientApplication`
- OAuth scope: `https://api.loganalytics.io/.default`
- Token cached in memory with 5-minute buffer before expiry (automatic refresh)
- Requires "Log Analytics Reader" role on workspace

**Setup:**
```bash
# Create service principal (or reuse Application Insights one)
az ad sp create-for-rbac --name "MCP-LogAnalytics" --skip-assignment

# Get workspace resource ID
az monitor log-analytics workspace show \
  --workspace-name YourWorkspaceName \
  --resource-group YourResourceGroup \
  --query id --output tsv

# Assign role
az role assignment create \
  --assignee YOUR_SERVICE_PRINCIPAL_CLIENT_ID \
  --role "Log Analytics Reader" \
  --scope "/subscriptions/SUB_ID/resourceGroups/RG_NAME/providers/Microsoft.OperationalInsights/workspaces/WORKSPACE_NAME"
```

**Verify role assignment:**
```bash
az role assignment list \
  --assignee YOUR_SERVICE_PRINCIPAL_CLIENT_ID \
  --resource-group YOUR_RESOURCE_GROUP
```

</auth-method>

<auth-method name="api-key">

### API Key Authentication - Deprecated

- Rate limit: 15 requests/minute, 1,500 requests/day
- Deprecated by Microsoft - use Entra ID for new implementations
- Simpler setup (no service principal needed)
- Requires `apiKey` field on each workspace resource config

</auth-method>

<shared-credentials>

### Shared Credentials with Application Insights

The service automatically falls back to Application Insights environment variables if Log Analytics-specific ones are not set:

```typescript
const config: LogAnalyticsConfig = {
  tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
  clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
  clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
};
```

A single Azure AD app registration and service principal can serve both integrations.

</shared-credentials>

</authentication>

<configuration>

## Configuration

<env-vars>

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOGANALYTICS_WORKSPACE_ID` | Yes (single-workspace fallback) | - | Workspace GUID. Creates a resource with id `"default"`. |
| `LOGANALYTICS_RESOURCES` | Yes (multi-workspace) | - | JSON array of workspace configs (see below). Takes precedence over `LOGANALYTICS_WORKSPACE_ID`. |
| `LOGANALYTICS_AUTH_METHOD` | No | `"entra-id"` | Authentication method: `"entra-id"` or `"api-key"` |
| `LOGANALYTICS_TENANT_ID` | Yes (Entra ID) | Falls back to `APPINSIGHTS_TENANT_ID` | Azure tenant ID |
| `LOGANALYTICS_CLIENT_ID` | Yes (Entra ID) | Falls back to `APPINSIGHTS_CLIENT_ID` | Service principal client ID |
| `LOGANALYTICS_CLIENT_SECRET` | Yes (Entra ID) | Falls back to `APPINSIGHTS_CLIENT_SECRET` | Service principal client secret |

</env-vars>

<workspace-config>

### Multi-Workspace Configuration (LOGANALYTICS_RESOURCES)

JSON array where each item is a `LogAnalyticsResourceConfig`:

```typescript
interface LogAnalyticsResourceConfig {
  id: string;          // Short identifier used in tool calls (e.g., "prod-functions")
  name: string;        // Human-readable label
  workspaceId: string; // Azure workspace GUID (from Azure Portal → workspace → Properties)
  active: boolean;     // false = excluded from queries but retained in config
  apiKey?: string;     // Required for api-key auth method only
  description?: string;
}
```

**Example:**
```json
[
  {
    "id": "log-prod-client-uks-01",
    "name": "Production Functions",
    "workspaceId": "12345678-1234-1234-1234-123456789abc",
    "active": true,
    "description": "Production Azure Functions logs"
  },
  {
    "id": "log-dev-client-uks-01",
    "name": "Dev Functions",
    "workspaceId": "abcdefab-abcd-abcd-abcd-abcdefabcdef",
    "active": true
  }
]
```

**Workspace ID naming convention (sync-function-app clients):** `log-{environment}-{client}-{region}-{instance}`. This convention is used by `la-investigate-sync` to auto-derive the sync app name.

</workspace-config>

<config-parsing>

### Configuration Parsing (from index.ts)

```typescript
function getService(): LogAnalyticsService {
  if (!service) {
    let resources: any[] = [];

    if (process.env.LOGANALYTICS_RESOURCES) {
      resources = JSON.parse(process.env.LOGANALYTICS_RESOURCES);
    } else if (process.env.LOGANALYTICS_WORKSPACE_ID) {
      resources = [{
        id: 'default',
        name: 'Default Workspace',
        workspaceId: process.env.LOGANALYTICS_WORKSPACE_ID,
        active: true,
      }];
    } else {
      throw new Error("Missing Log Analytics configuration: LOGANALYTICS_RESOURCES or LOGANALYTICS_WORKSPACE_ID");
    }

    const config: LogAnalyticsConfig = {
      resources,
      authMethod: (process.env.LOGANALYTICS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
      tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
      clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
      clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
    };

    service = new LogAnalyticsService(config);
  }
  return service;
}
```

</config-parsing>

</configuration>

<tool-reference>

## Tool Reference

All tools use `resourceId` to identify which workspace to query. Get valid IDs from `la-list-workspaces`.

<tool-group name="workspace">

### Workspace Tools (workspace-tools.ts)

<tool name="la-list-workspaces">

**`la-list-workspaces`** - List all configured workspaces (active and inactive)

Parameters: None

Returns: Array of `LogAnalyticsResourceConfig` objects including `id`, `name`, `workspaceId`, `active`, `description`.

</tool>

<tool name="la-get-metadata">

**`la-get-metadata`** - Get schema metadata for a workspace

Parameters:
- `resourceId` (required): Resource ID

Returns: `MetadataResult` - tables with column names, types, and optional descriptions. Use this before writing KQL to verify table and column names.

</tool>

<tool name="la-test-access">

**`la-test-access`** - Validate workspace access by executing a simple test query

Parameters:
- `resourceId` (required): Resource ID

Returns: `{ success: boolean, message: string }`. Use to verify credentials and role assignments are correct.

</tool>

</tool-group>

<tool-group name="query">

### Query Tools (query-tools.ts)

All query tools support column filtering (`columnPreset`, `columns`) and output format (`outputFormat`). See [Column Filtering](#column-filtering) below.

<tool name="la-execute-query">

**`la-execute-query`** - Execute a custom KQL query

Parameters:
- `resourceId` (required): Resource ID
- `query` (required): KQL query string
- `timespan` (optional): ISO 8601 duration. The API treats this as the OUTER BOUND on the query — the effective window is the intersection of the timespan and any `ago()` filter in the KQL, so a timespan narrower than the query's `ago()` clips results. When omitted, the timespan is derived from the widest `ago()` in the KQL (e.g. `ago(30d)` → `P30D`); `PT1H` applies only when the KQL has no `ago()` at all. An explicitly-passed timespan is always sent verbatim; if it is narrower than the KQL's `ago()`, the response carries a `timespanWarning`.
- `columnPreset` (optional): `"minimal" | "investigation" | "full"`
- `columns` (optional): Custom column list (array of strings, overrides `columnPreset`)
- `outputFormat` (optional): `"json" | "markdown"` (default: `"json"`)

Returns: `QueryResult` with `tables[].columns` and `tables[].rows`, plus `effectiveTimespan` (the timespan actually sent to the API) and `timespanWarning` (present only when an explicit timespan clips a wider `ago()` window).

**Example:**
```json
{
  "resourceId": "log-prod-client-uks-01",
  "query": "FunctionAppLogs | where FunctionName == 'ProcessOrders' | where SeverityLevel >= 3 | order by TimeGenerated desc | take 10",
  "timespan": "PT24H",
  "columnPreset": "investigation",
  "outputFormat": "markdown"
}
```

</tool>

<tool name="la-get-recent-events">

**`la-get-recent-events`** - Get recent events from any table

Parameters:
- `resourceId` (required): Resource ID
- `tableName` (required): Table name (e.g., `"FunctionAppLogs"`, `"AppExceptions"`, `"AppTraces"`)
- `timespan` (optional): ISO 8601 duration (default: `PT1H`)
- `limit` (optional): Max records (default: 100)
- `columnPreset`, `columns`, `outputFormat` (optional): See column filtering

</tool>

<tool name="la-search-logs">

**`la-search-logs`** - Text search across tables (case-insensitive)

Parameters:
- `resourceId` (required): Resource ID
- `searchText` (required): Text to search for
- `tableName` (optional): Specific table (default: all tables using `*`)
- `timespan` (optional): ISO 8601 duration (default: `PT1H`)
- `limit` (optional): Max records (default: 100)
- `columnPreset`, `columns`, `outputFormat` (optional): See column filtering

KQL generated: `{tableName} | where * contains "{searchText}"` (or `* | where * contains ...` for all tables)

</tool>

</tool-group>

<tool-group name="function">

### Azure Functions Tools (function-tools.ts)

Specialized tools querying the `FunctionAppLogs` table. All support column filtering and output format.

<tool name="la-get-fn-logs">

**`la-get-fn-logs`** - Get function execution logs with optional filtering

Parameters:
- `resourceId` (required): Resource ID
- `functionName` (optional): Filter by function name
- `timespan` (optional): Default `PT1H`
- `severityLevel` (optional): Minimum level: 0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical
- `limit` (optional): Default 100
- `columnPreset`, `columns`, `outputFormat` (optional)

KQL: `FunctionAppLogs | where ... | order by TimeGenerated desc | take {limit}`

</tool>

<tool name="la-get-fn-errors">

**`la-get-fn-errors`** - Get function error logs (where ExceptionDetails is present)

Parameters:
- `resourceId` (required): Resource ID
- `functionName` (optional): Filter by function name
- `timespan` (optional): Default `PT1H`
- `limit` (optional): Default 100
- `columnPreset`, `columns`, `outputFormat` (optional)

KQL: `FunctionAppLogs | where ExceptionDetails != "" | ...`

</tool>

<tool name="la-get-fn-stats">

**`la-get-fn-stats`** - Get aggregated execution statistics (count, success rate, errors)

Parameters:
- `resourceId` (required): Resource ID
- `functionName` (optional): Filter (returns stats for all functions if omitted)
- `timespan` (optional): Default `PT1H`
- `outputFormat` (optional): `"json" | "markdown"`. No column filtering (already aggregated).

Returns columns: `FunctionName`, `TotalExecutions`, `ErrorCount`, `SuccessCount`, `UniqueHosts`, `SuccessRate`

**One row per function, not per `FunctionName`.** The same Azure Function reaches that column under up to three names - the bare name, a `Functions.`-prefixed variant written by the functions runtime, and blank on host-level rows. Grouping by the raw column therefore returned one row per *name*: in a measured run 27 functions became 61 rows and 43,445 executions became 131,977, roughly threefold, with nothing in the output saying so.

The variants are collapsed after the query returns. Where a function arrived under several names the row with the highest `TotalExecutions` is kept **whole**, so `SuccessRate` stays consistent with the counts beside it, and blank-named rows are dropped as host-level. The reshaping is declared in a `normalization` block rather than done silently:

| Field | Meaning |
|-------|---------|
| `rawRows` | Rows the query returned |
| `rows` | Rows after collapsing - the real function count |
| `blankNameRowsDropped` | Rows dropped because `FunctionName` was blank |
| `collapsed` | One entry per function that arrived under more than one name, with the variants |
| `note` | Present only when something was collapsed or dropped |

In `markdown` output the note is appended as a blockquote under the table, because markdown keeps only the tables and a collapsed table with no note is indistinguishable from a raw one.

`UniqueFunctions` is **no longer returned**. It was `dcount(FunctionName)` inside a `by FunctionName` summarize, so it was always 1: a column that looked like a count and carried nothing. `normalization.rows` is the real per-function total.

A call that passes `functionName` aggregates across a single function, has no `FunctionName` column, and carries no `normalization` block - there is nothing to collapse.

</tool>

<tool name="la-get-fn-invocations">

**`la-get-fn-invocations`** - Get function invocation history from requests/traces tables

Parameters:
- `resourceId` (required): Resource ID
- `functionName` (optional): Filter by function name
- `timespan` (optional): Default `PT1H`
- `limit` (optional): Default 100
- `columnPreset`, `columns`, `outputFormat` (optional)

</tool>

<tool name="la-get-error-summary">

**`la-get-error-summary`** - Aggregated error summary grouped by type. Best starting point for investigations.

Parameters:
- `resourceId` (required): Resource ID
- `timespan` (optional): Default `PT1H`
- `tableName` (optional): `"AppExceptions" | "AppTraces" | "FunctionAppLogs"` (default: `AppExceptions`)
- `minCount` (optional): Minimum error count to include (default: 1)
- `deduplicateRetries` (optional): Group by OperationId to collapse retries (default: `true`)
- `outputFormat` (optional): Default `"markdown"`

**With deduplication (default):** Returns `UniqueErrors`, `TotalRetries`, `FirstSeen`, `LastSeen`, `SampleMessage`.
**Without deduplication:** Returns `Count`, `FirstSeen`, `LastSeen`, `SampleMessage`.

See [Retry Deduplication](#retry-deduplication) for KQL details.

</tool>

<tool name="la-investigate-app">

**`la-investigate-app`** - Combined investigation: exception summary + trace severity + recent error details. Best starting point for general app investigations.

Parameters:
- `resourceId` (required): Resource ID
- `appNamePattern` (optional): Filter by `AppRoleName` (partial match)
- `timespan` (optional): Default `PT1H`
- `includeDetails` (optional): Include recent error details section (default: `true`)
- `detailsLimit` (optional): Max recent errors (default: 20)
- `deduplicateRetries` (optional): Default `true`
- `outputFormat` (optional): `markdown` (default) or `json`

Returns a markdown report with:
1. Exception Summary (top 20 by UniqueErrors/Count)
2. Trace Severity Distribution
3. Recent Errors (if `includeDetails: true`)

With `outputFormat: "json"` it returns the structured result instead — `{ appNamePattern, timespan, deduplicate, exceptionSummary, traceSeverity, recentErrors, includeDetails, detailsLimit }`, where the three query fields are raw `QueryResult`s. Use this when a consumer parses the findings rather than reads them.

Runs 2-3 queries in parallel (`Promise.all`).

</tool>

<tool name="la-investigate-sync">

**`la-investigate-sync`** - the sync function app sync failure investigation. Only useful for sync-function-app clients.

Parameters:
- `resourceId` (required): Resource ID matching pattern `log-{env}-{client}-...`
- `timespan` (optional): Default `PT8H` (typical work day)
- `includeDetails` (optional): Include recent error details (default: `true`)
- `detailsLimit` (optional): Max recent errors (default: 10)

**Auto-derives sync app name:**
```
resourceId: "log-dev-acme-uks-01"
→ environment: "dev", client: "acme"
→ syncAppPattern: "func-dev-acme-sc-sync"
```

Returns markdown report with:
1. Error Categories (Dataverse, ServiceBus, Database, Timeout, Network, Other)
2. Errors by Sync Operation (grouped by `FunctionName` from `Properties.AzureFunctions_FunctionName`)
3. Error Traces (AppTraces with SeverityLevel >= 3, deduplicated)
4. Recent Errors (if `includeDetails: true`)

Runs 3-4 queries in parallel (`Promise.all`).

</tool>

</tool-group>

</tool-reference>

<prompt-reference>

## Prompt Reference

Prompts are registered in `prompts/templates.ts`. They fetch data and return pre-formatted markdown reports.

| Prompt | Parameters | Description |
|--------|-----------|-------------|
| `la-workspace-summary` | `resourceId`, `timespan?` | Health report: function stats, recent errors, recommendations |
| `la-fn-troubleshooting` | `resourceId`, `functionName`, `timespan?` | Full function troubleshooting: logs + errors + stats + invocations |
| `la-fn-performance` | `resourceId`, `functionName?`, `timespan?` | Performance report: stats + invocation history |
| `la-logs-report` | `resourceId`, `tableName`, `timespan?`, `limit?` | Formatted log report for any table with analysis |

All prompts return `messages[{ role: "assistant", content: { type: "text", text: markdownReport } }]`.

Note: The prompt IDs registered in source code are `la-workspace-summary`, `la-fn-troubleshooting`, `la-fn-performance`, `la-logs-report` (not the longer names referenced in the old user doc).

</prompt-reference>

<service-implementation>

## Service Implementation

**File:** `packages/log-analytics/src/services/log-analytics-service.ts`

<core-methods>

### Core LogAnalyticsService Methods

```typescript
class LogAnalyticsService {
  // Authentication
  private async getAccessToken(): Promise<string>
  private async getAuthHeaders(resource): Promise<Record<string, string>>

  // Core API
  async executeQuery(resourceId: string, query: string, timespan?: string): Promise<QueryResult>
  async getMetadata(resourceId: string): Promise<MetadataResult>
  async testWorkspaceAccess(resourceId: string): Promise<{ success: boolean; message: string }>

  // Azure Functions helpers (wrap KQL)
  async getFunctionLogs(resourceId, functionName?, timespan?, severityLevel?, limit?): Promise<QueryResult>
  async getFunctionErrors(resourceId, functionName?, timespan?, limit?): Promise<QueryResult>
  async getFunctionStats(resourceId, functionName?, timespan?): Promise<QueryResult>
  async getFunctionInvocations(resourceId, functionName?, timespan?, limit?): Promise<QueryResult>

  // Generic helpers
  async getRecentEvents(resourceId, tableName, timespan?, limit?): Promise<QueryResult>
  async searchLogs(resourceId, searchText, tableName?, timespan?, limit?): Promise<QueryResult>

  // Utility
  getAllResources(): LogAnalyticsResourceConfig[]
  convertTimespanToKQL(iso8601Duration: string): string
}
```

</core-methods>

<query-execution>

### KQL Query Execution

```typescript
async executeQuery(resourceId: string, query: string, timespan?: string): Promise<QueryResult> {
  const resource = this.getResourceById(resourceId);
  const headers = await this.getAuthHeaders(resource);
  const url = `${this.baseUrl}/workspaces/${resource.workspaceId}/query`;

  const requestBody: any = { query };
  if (timespan) requestBody.timespan = timespan;

  const response = await axios.post(url, requestBody, {
    headers,
    timeout: 30000  // 30-second query timeout
  });

  return response.data;
}
```

</query-execution>

<token-management>

### Token Management

- MSAL `ConfidentialClientApplication` acquires tokens via client credentials flow
- Token cached in memory: `this.accessToken` + `this.tokenExpirationTime`
- Buffer: token refreshed if less than 5 minutes remain before expiry
- Tokens never persisted to disk

</token-management>

<timespan-conversion>

### Timespan Conversion

The service converts ISO 8601 durations to KQL `ago()` format:

```typescript
convertTimespanToKQL('PT15M') // → '15m'
convertTimespanToKQL('PT1H')  // → '1h'
convertTimespanToKQL('PT12H') // → '12h'
convertTimespanToKQL('P1D')   // → '1d'
convertTimespanToKQL('P7D')   // → '7d'
convertTimespanToKQL('P30D')  // → '30d'
```

</timespan-conversion>

</service-implementation>

<column-filtering>

## Column Filtering and Token Reduction

Added in v27+. All query tools support `columnPreset` and `columns` parameters.

<column-presets>

### Column Presets

| Preset | Columns | Token Reduction | Use Case |
|--------|---------|----------------|----------|
| `minimal` | `TimeGenerated`, `AppRoleName`, `Message`, `SeverityLevel` | ~80% | Quick overview, volume checks |
| `investigation` | Above + `ExceptionType`, `OuterMessage`, `InnermostMessage`, `OperationId` | ~60% | Error debugging |
| `full` | All columns | 0% | Data export, backwards compatibility (default) |

Implemented in `utils/loganalytics-formatters.ts`:

```typescript
export const COLUMN_PRESETS = {
  minimal: ['TimeGenerated', 'AppRoleName', 'Message', 'SeverityLevel'],
  investigation: [
    'TimeGenerated', 'AppRoleName', 'Message', 'SeverityLevel',
    'ExceptionType', 'OuterMessage', 'InnermostMessage', 'OperationId'
  ],
  full: null,  // all columns
};
```

`columns` parameter (array of strings) overrides `columnPreset` entirely.

</column-presets>

</column-filtering>

<retry-deduplication>

## Retry Deduplication

Investigation tools use two-stage KQL aggregation to collapse Service Bus retry attempts.

**Two-stage pattern (AppExceptions with deduplication):**
```kql
AppExceptions
| summarize
    RetryCount = count(),
    FirstSeen = min(TimeGenerated),
    LastSeen = max(TimeGenerated),
    SampleMessage = take_any(OuterMessage)
  by OperationId, ExceptionType, AppRoleName
| summarize
    UniqueErrors = count(),
    TotalRetries = sum(RetryCount),
    FirstSeen = min(FirstSeen),
    LastSeen = max(LastSeen),
    SampleMessage = take_any(SampleMessage)
  by ExceptionType, AppRoleName
| where UniqueErrors >= {minCount}
| order by UniqueErrors desc
```

**Result interpretation:**
- `UniqueErrors`: Number of distinct failures (deduplicated by OperationId)
- `TotalRetries`: Total log entries across all retries
- A message that retried 10 times shows as 1 row with `UniqueErrors: 1`, `TotalRetries: 10`

Tools that support deduplication: `la-get-error-summary`, `la-investigate-app`, `la-investigate-sync`

Default: enabled. Disable with `deduplicateRetries: false`.

</retry-deduplication>

<sync-funcapp-integration>

## Sync Function App Integration

`la-investigate-sync` is purpose-built for sync-function-app debugging.

<workspace-naming>

### Workspace Naming Convention

Workspaces follow: `log-{environment}-{client}-{region}-{instance}`

Examples: `log-dev-acme-uks-01`, `log-prod-acme-uks-01`

</workspace-naming>

<sync-app-derivation>

### Sync App Name Derivation

```typescript
const match = resourceId.match(/^log-([^-]+)-([^-]+)/);
const environment = match[1];   // e.g., "dev"
const client = match[2];        // e.g., "acme"
const syncAppPattern = `func-${environment}-${client}-sc-sync`;
// → "func-dev-acme-sc-sync"
// Used as: AppRoleName contains "func-dev-acme-sc-sync"
```

If `resourceId` does not match the `log-{env}-{client}` pattern, the tool returns `isError: true`.

</sync-app-derivation>

<error-categories>

### Error Categorization

```kql
| extend ErrorCategory = case(
    ExceptionType contains "FaultException" or ExceptionType contains "OrganizationService", "Dataverse",
    ExceptionType contains "ServiceBus", "ServiceBus",
    ExceptionType contains "Sql", "Database",
    ExceptionType contains "Timeout", "Timeout",
    ExceptionType contains "Socket" or ExceptionType contains "Http", "Network",
    "Other"
  )
```

| Category | Exception Types |
|----------|-----------------|
| Dataverse | FaultException, OrganizationService |
| ServiceBus | ServiceBusException |
| Database | SqlException |
| Timeout | TimeoutException |
| Network | SocketException, HttpException |
| Other | Everything else |

</error-categories>

<report-sections>

### Report Sections

1. **Error Categories** - `UniqueOps` count per category
2. **Errors by Sync Operation** - Grouped by `FunctionName` (e.g., `contactSynchronization`, `accountChangeTracking`)
3. **Error Traces** - AppTraces SeverityLevel >= 3, top 10 by UniqueErrors
4. **Recent Errors** - Deduplicated with RetryCount (if `includeDetails: true`)

</report-sections>

</sync-funcapp-integration>

<log-tables>

## Log Analytics Tables Reference

| Table | Description | Primary Use |
|-------|-------------|-------------|
| `FunctionAppLogs` | Azure Function execution logs | Error analysis, troubleshooting, severity filtering |
| `AppExceptions` | Application exceptions (Application Insights) | Exception pattern detection, investigation tools |
| `AppTraces` | Diagnostic traces (Application Insights) | Severity distribution, trace analysis |
| `requests` | Incoming HTTP requests | HTTP-triggered function monitoring |
| `dependencies` | Outbound calls (APIs, DBs) | External dependency failures |
| `traces` | Raw diagnostic traces (legacy) | Debug output |
| `exceptions` | Raw exceptions (legacy) | Exception troubleshooting |
| `customEvents` | Custom application events | Feature usage tracking |

### FunctionAppLogs Schema

```kql
FunctionAppLogs | getschema

// Key columns:
TimeGenerated: datetime
FunctionName: string
Message: string
SeverityLevel: int      // 0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical
ExceptionDetails: string
HostInstanceId: string
InvocationId: string
```

</log-tables>

<formatting-utilities>

## Formatting Utilities

**File:** `utils/loganalytics-formatters.ts`

| Function | Purpose |
|----------|---------|
| `formatTableAsMarkdown(table)` | Convert QueryResult table to markdown table |
| `formatTableAsCSV(table)` | Convert to CSV format |
| `filterColumns(table, columns)` | Filter table columns (used for column presets) |
| `resolveColumnPreset(preset, columns)` | Resolve preset name or custom list to column array |
| `analyzeLogs(table, tableName)` | Generic log analysis - returns insight strings |
| `analyzeFunctionLogs(table)` | Azure Functions-specific analysis |
| `analyzeFunctionErrors(table)` | Error pattern detection, exception analysis |
| `analyzeFunctionStats(table)` | Statistics analysis with success rate |
| `generateRecommendations({ errorCount, successRate })` | Returns recommendation strings |
| `sanitizeErrorMessage(msg)` | Removes credentials/connection strings from messages |
| `parseTimespan(iso8601)` | Validates ISO 8601 duration |
| `getTimespanPresets()` | Returns common timespan presets |

</formatting-utilities>

<error-handling>

## Error Handling

<errors name="authentication">

### Authentication Errors (401/403)

- **401:** Invalid credentials or expired client secret. Check tenant ID, client ID, and client secret. For Entra ID, verify the secret has not expired.
- **403:** Insufficient permissions. Service principal must have "Log Analytics Reader" or "Reader" role on the workspace.

Error messages include the specific missing permission and role assignment instructions.

</errors>

<errors name="workspace">

### Workspace Errors

- **Workspace not found:** `resourceId` does not match any configured workspace. Use `la-list-workspaces` to see valid IDs.
- **Inactive workspace:** Workspace exists in config but has `active: false`. Set `active: true` or use a different workspace.
- **Missing config:** Neither `LOGANALYTICS_RESOURCES` nor `LOGANALYTICS_WORKSPACE_ID` is set.

</errors>

<errors name="query">

### Query Errors

- **KQL syntax error:** Test query in Azure Portal → Log Analytics → Logs before using in MCP. Pipe operator (`|`) is required between operators.
- **Invalid table/column:** Use `la-get-metadata` to discover valid table and column names.
- **Query timeout:** 30-second default timeout. Reduce timespan, add `| take N`, or use `| summarize` to aggregate.

**Common KQL mistake:**
```kql
// ERROR: Missing pipe operator
FunctionAppLogs where TimeGenerated > ago(1h)

// CORRECT
FunctionAppLogs | where TimeGenerated > ago(1h)
```

</errors>

<errors name="rate-limiting">

### Rate Limiting (429)

- Check `Retry-After` header in response
- Entra ID: 60 req/min (no daily cap)
- API Key: 15 req/min, 1,500 req/day (deprecated)
- If hitting limits: upgrade to Entra ID, cache results, reduce query frequency

</errors>

</error-handling>

<security>

## Security Considerations

- **Read-only:** No write, update, or delete operations. All tools execute SELECT-equivalent KQL queries only.
- **Token storage:** Access tokens cached in memory only (never persisted to disk or logs).
- **Error sanitization:** `sanitizeErrorMessage()` removes connection strings, API keys, and workspace IDs from error output.
- **Query size:** Recommended max 10KB per query; max 10,000 rows per result.
- **RBAC:** Minimum required role is "Log Analytics Reader". Can be scoped to workspace, resource group, or subscription.
- **Credentials:** Store in environment variables or `.env` file. Never commit to version control.
- **Conditional Access:** If 403 persists after role assignment, check Azure AD Conditional Access policies that may block service principals.

</security>

<cli-architecture>

## CLI Architecture

The CLI reuses `LogAnalyticsService` via the same `ServiceContext` pattern.

**Binary:** `mcp-loganalytics-cli`

**File structure:**
```
packages/log-analytics/src/
  cli.ts                          # Entry point, createCliProgram()
  context-factory.ts              # createServiceContext() (mirrors index.ts)
  cli/
    output.ts                     # Cache dir: .mcp-loganalytics-cache
    commands/
      index.ts                    # registerAllCommands() aggregator
      workspace-commands.ts       # workspace list, metadata, test
      query-commands.ts           # query execute, recent, search, error-summary, investigate-app, investigate-sync
      function-commands.ts        # fn logs, errors, stats, invocations
```

### Command Groups

| Group | Subcommands | Maps to MCP Tools |
|-------|-------------|------------------|
| `workspace` | `list`, `metadata`, `test` | `la-list-workspaces`, `la-get-metadata`, `la-test-access` |
| `query` | `execute`, `recent`, `search`, `error-summary`, `investigate-app`, `investigate-sync` | `la-execute-query`, `la-get-recent-events`, `la-search-logs`, `la-get-error-summary`, `la-investigate-app`, `la-investigate-sync` |
| `fn` | `logs`, `errors`, `stats`, `invocations` | `la-get-fn-logs`, `la-get-fn-errors`, `la-get-fn-stats`, `la-get-fn-invocations` |

### Usage Examples

```bash
# List workspaces
mcp-loganalytics-cli workspace list

# Test workspace access
mcp-loganalytics-cli workspace test log-dev-acme-uks-01

# Execute KQL query
mcp-loganalytics-cli query execute log-dev-acme-uks-01 "AppTraces | take 10"

# Execute with column preset and markdown output
mcp-loganalytics-cli query execute log-dev-acme-uks-01 "AppTraces | take 10" --preset minimal --format markdown

# Get recent events from a table
mcp-loganalytics-cli query recent log-dev-acme-uks-01 AppExceptions --timespan PT6H --limit 50

# Search logs
mcp-loganalytics-cli query search log-dev-acme-uks-01 "timeout" --table AppTraces --timespan PT12H

# Error summary (defaults to markdown, deduplicated)
mcp-loganalytics-cli query error-summary log-dev-acme-uks-01 --timespan PT8H

# Combined investigation (defaults to markdown)
mcp-loganalytics-cli query investigate-app log-dev-acme-uks-01 --app-name "func-dev" --timespan PT2H

# Combined investigation as structured JSON (for downstream parsing)
mcp-loganalytics-cli query investigate-app log-dev-acme-uks-01 --app-name "func-dev" --timespan PT2H --format json

# function-app sync investigation
mcp-loganalytics-cli query investigate-sync log-dev-acme-uks-01 --timespan PT8H

# Function logs
mcp-loganalytics-cli fn logs log-dev-acme-uks-01 --function-name ProcessOrders --severity 3

# Function errors
mcp-loganalytics-cli fn errors log-dev-acme-uks-01 -n ProcessOrders --timespan PT6H --format markdown

# Function stats
mcp-loganalytics-cli fn stats log-dev-acme-uks-01 --timespan PT24H --format markdown

# Function invocations
mcp-loganalytics-cli fn invocations log-dev-acme-uks-01 -n ProcessOrders --limit 50

# Global flags
mcp-loganalytics-cli --json workspace list          # Raw JSON output
mcp-loganalytics-cli --no-cache query execute ...   # Skip cache file
mcp-loganalytics-cli --env-file .env.prod workspace list
```

### Parameter Mapping

| MCP Parameter | CLI Flag |
|---------------|---------|
| `resourceId` (required) | Positional `<resourceId>` |
| `query` (required) | Positional `<kql>` |
| `tableName` (required) | Positional `<tableName>` |
| `timespan` (optional) | `-t, --timespan <timespan>` |
| `limit` (optional) | `-l, --limit <n>` |
| `columnPreset` (optional) | `-p, --preset <preset>` |
| `columns` (optional) | `-c, --columns <cols>` (comma-separated) |
| `outputFormat` (optional) | `-f, --format <format>` |
| `functionName` (optional) | `-n, --function-name <name>` |
| `severityLevel` (optional) | `-s, --severity <level>` |
| `appNamePattern` (optional) | `--app-name <pattern>` |
| `deduplicateRetries` (optional) | `--no-deduplicate` (flag to disable) |
| `includeDetails` (optional) | `--no-details` (flag to disable) |
| `detailsLimit` (optional) | `--details-limit <n>` |

</cli-architecture>

<usage-examples>

## Usage Examples

```typescript
// Quick health check (any app)
la-investigate-app({ resourceId: "log-dev-acme-uks-01", timespan: "PT1H" })

// sync-function-app debugging (last work day)
la-investigate-sync({ resourceId: "log-dev-acme-uks-01", timespan: "PT8H" })

// Deduplicated error triage
la-get-error-summary({ resourceId: "log-dev-acme-uks-01", timespan: "P1D", tableName: "AppExceptions" })

// Custom KQL with token efficiency
la-execute-query({
  resourceId: "log-dev-acme-uks-01",
  query: "FunctionAppLogs | where SeverityLevel >= 3 | order by TimeGenerated desc | take 50",
  timespan: "PT6H",
  columnPreset: "investigation",
  outputFormat: "markdown"
})

// Cross-table text search
la-search-logs({ resourceId: "log-dev-acme-uks-01", searchText: "timeout", timespan: "PT12H", columnPreset: "minimal" })

// Function failure triage workflow
la-get-fn-stats({ resourceId: "prod", timespan: "PT24H", outputFormat: "markdown" })
la-get-fn-errors({ resourceId: "prod", functionName: "ProcessOrders", timespan: "PT6H", columnPreset: "investigation" })
la-fn-troubleshooting({ resourceId: "prod", functionName: "ProcessOrders", timespan: "PT6H" })
```

</usage-examples>
