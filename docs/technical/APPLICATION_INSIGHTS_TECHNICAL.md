# Application Insights - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/APPLICATION_INSIGHTS.md -->

<overview>

The Application Insights integration enables querying and analysis of Azure Application Insights telemetry via the Application Insights Query API using KQL (Kusto Query Language). It provides 10 tools and 5 prompts covering exceptions, performance, dependencies, traces, availability results, and custom events.

**Package:** `@mcp-consultant-tools/application-insights`
**Binaries:** `mcp-appins` (MCP server), `mcp-appins-cli` (CLI)
**Security:** Read-only. No write, update, or delete operations.

</overview>

<architecture>

<service-layer>

**Single service class:** `ApplicationInsightsService` in `packages/application-insights/src/services/appinsights-service.ts`

Responsibilities:
- Authentication (Entra ID OAuth 2.0 via MSAL or API Key)
- Token caching with automatic refresh (5-minute buffer before expiry)
- KQL query execution via `https://api.applicationinsights.io/v1`
- Helper methods for common telemetry patterns
- Multi-resource management with active/inactive flags

**ServiceContext** (`types.ts`): Single getter `appInsights: ApplicationInsightsService`.

**Tool files:**
- `tools/query-tools.ts` — `ai-list-resources`, `ai-get-metadata`, `ai-execute-query`
- `tools/telemetry-tools.ts` — `ai-get-exceptions`, `ai-get-slow-requests`, `ai-get-op-perf`, `ai-get-failed-deps`, `ai-get-traces`, `ai-get-availability`, `ai-get-custom-events`

**Prompt file:**
- `prompts/templates.ts` — all 5 prompts registered via `registerAppInsightsPrompts()`

**Formatting utilities** (`utils/appinsights-formatters.ts`):
- `formatTableAsMarkdown(table)` — converts query result tables to markdown
- `analyzeExceptions(table)` — extracts exception frequency insights
- `analyzePerformance(table)` — extracts performance bottleneck insights
- `analyzeDependencies(table)` — extracts dependency health insights

</service-layer>

<authentication>

Two auth methods controlled by `APPINSIGHTS_AUTH_METHOD` env var.

<auth-method name="entra-id" priority="high">

**Microsoft Entra ID (OAuth 2.0) — Recommended**

- Rate limit: 60 requests/minute
- No daily cap
- Uses `@azure/msal-node` `ConfidentialClientApplication`
- Scope: `https://api.applicationinsights.io/.default`
- Token cached in memory; refreshed 5 minutes before expiry
- Required env vars: `APPINSIGHTS_TENANT_ID`, `APPINSIGHTS_CLIENT_ID`, `APPINSIGHTS_CLIENT_SECRET`
- Required Azure RBAC: "Monitoring Reader" or "Reader" role on each Application Insights resource

**Setup steps:**
1. Create service principal: `az ad sp create-for-rbac --name "MCP-AppInsights" --skip-assignment`
2. Get Application ID from Azure Portal → Application Insights → API Access
3. Assign role: `az role assignment create --assignee <clientId> --role "Monitoring Reader" --scope <resourceId>`

</auth-method>

<auth-method name="api-key">

**API Key Authentication — Simpler, limited**

- Rate limit: 15 requests/minute per key
- Daily cap: 1,500 requests per key
- Deprecated by Microsoft for new implementations
- Header used: `x-api-key`
- Per-resource API key: set `apiKey` field in each resource object in `APPINSIGHTS_RESOURCES`
- Single-resource API key: set `APPINSIGHTS_API_KEY`

**Setup steps:**
1. Go to Azure Portal → Application Insights → API Access
2. Click "+ Create API key", check "Read telemetry", copy the key immediately
3. Also copy the Application ID (GUID) from the same page

</auth-method>

</authentication>

<configuration>

<resource-configuration>

Two mutually exclusive configuration modes:

**Mode 1: Multi-resource (preferred)**
```bash
APPINSIGHTS_RESOURCES='[
  {
    "id": "prod-api",
    "name": "Production API",
    "appId": "12345678-1234-1234-1234-123456789abc",
    "active": true,
    "description": "Optional description",
    "apiKey": "only-needed-for-api-key-auth"
  },
  {
    "id": "staging-api",
    "name": "Staging API",
    "appId": "87654321-4321-4321-4321-cba987654321",
    "active": false
  }
]'
```

**Mode 2: Single-resource fallback**
```bash
APPINSIGHTS_APP_ID=12345678-1234-1234-1234-123456789abc
APPINSIGHTS_API_KEY=your-key   # only for api-key auth
```

When using single-resource mode, the service creates a synthetic resource with `id: "default"`.

**Resource resolution priority in `index.ts`:**
1. `APPINSIGHTS_RESOURCES` (if set, parse as JSON)
2. `APPINSIGHTS_APP_ID` (single-resource fallback)
3. Error: "Missing Application Insights configuration"

</resource-configuration>

<environment-variables>

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APPINSIGHTS_AUTH_METHOD` | No | `entra-id` | Auth method: `entra-id` or `api-key` |
| `APPINSIGHTS_RESOURCES` | Yes* | — | JSON array of resource configs |
| `APPINSIGHTS_APP_ID` | Yes* | — | Single-resource Application ID fallback |
| `APPINSIGHTS_TENANT_ID` | Entra ID only | — | Azure tenant ID |
| `APPINSIGHTS_CLIENT_ID` | Entra ID only | — | Service principal client ID |
| `APPINSIGHTS_CLIENT_SECRET` | Entra ID only | — | Service principal client secret |
| `APPINSIGHTS_API_KEY` | API key only | — | API key for single-resource mode |

*Either `APPINSIGHTS_RESOURCES` or `APPINSIGHTS_APP_ID` must be set.

**Log Analytics credential sharing:** Log Analytics falls back to `APPINSIGHTS_*` credentials when Log Analytics-specific credentials are not provided.

</environment-variables>

</configuration>

</architecture>

<tool-reference>

<tool name="ai-list-resources">

**Description:** List all configured Application Insights resources with their IDs, names, and active status.

**Parameters:** None

**Returns:** Array of resource objects from `getAllResources()` — includes both active and inactive resources.

**Resource object shape:**
```typescript
{
  id: string;          // Resource identifier used in all other tools
  name: string;        // Human-readable name
  appId: string;       // Application Insights Application ID (GUID)
  active: boolean;     // Whether this resource is currently queryable
  apiKey?: string;     // Present only for api-key auth resources
  description?: string;
}
```

**Usage pattern:** Always call this first to discover resource IDs. All other tools require `resourceId` matching the `id` field.

</tool>

<tool name="ai-get-metadata">

**Description:** Get schema metadata (available tables and their columns) for an Application Insights resource.

**Parameters:**
- `resourceId` (required) — Resource ID from `ai-list-resources`

**Returns:** Table/column schema from `https://api.applicationinsights.io/v1/apps/{appId}/metadata`.

**Usage pattern:** Call when uncertain about available columns or tables before writing custom KQL queries.

</tool>

<tool name="ai-execute-query">

**Description:** Execute a custom KQL (Kusto Query Language) query against Application Insights.

**Parameters:**
- `resourceId` (required) — Resource ID
- `query` (required) — KQL query string
- `timespan` (optional) — ISO 8601 duration (e.g., `PT1H`, `P1D`). Applies as API-level filter in addition to any `ago()` in the query.

**Timeout:** 30 seconds

**KQL examples:**
```kusto
// Exceptions by type
exceptions | summarize count() by type | order by count_ desc

// Error rate by operation
requests
| summarize total=count(), failed=countif(success == false) by name
| extend errorRate=round(100.0*failed/total, 2)

// Failed dependencies by target
dependencies | where success == false | summarize count() by target, type

// Slow requests over 5 seconds
requests | where duration > 5000 | project timestamp, name, duration
```

</tool>

<tool name="ai-get-exceptions">

**Description:** Get recent exceptions with timestamps, types, and messages.

**Parameters:**
- `resourceId` (required)
- `timespan` (optional, default: `PT1H`) — ISO 8601 duration
- `limit` (optional, default: `50`) — max rows

**Underlying KQL:**
```kusto
exceptions
| where timestamp > ago({timespan})
| order by timestamp desc
| take {limit}
| project timestamp, type, outerMessage, innermostMessage, operation_Name, operation_Id, cloud_RoleName
```

</tool>

<tool name="ai-get-slow-requests">

**Description:** Get HTTP requests exceeding a duration threshold.

**Parameters:**
- `resourceId` (required)
- `durationThresholdMs` (optional, default: `5000`) — threshold in milliseconds
- `timespan` (optional, default: `PT1H`)
- `limit` (optional, default: `50`)

**Underlying KQL:**
```kusto
requests
| where timestamp > ago({timespan})
| where duration > {durationThresholdMs}
| order by duration desc
| take {limit}
| project timestamp, name, duration, resultCode, success, operation_Id, cloud_RoleName
```

</tool>

<tool name="ai-get-op-perf">

**Description:** Get performance summary by operation — request count, average duration, P50/P95/P99 percentiles, failure count.

**Parameters:**
- `resourceId` (required)
- `timespan` (optional, default: `PT1H`)

**Underlying KQL:**
```kusto
requests
| where timestamp > ago({timespan})
| summarize
    RequestCount=count(),
    AvgDuration=avg(duration),
    P50Duration=percentile(duration, 50),
    P95Duration=percentile(duration, 95),
    P99Duration=percentile(duration, 99),
    FailureCount=countif(success == false)
  by operation_Name
| order by RequestCount desc
```

</tool>

<tool name="ai-get-failed-deps">

**Description:** Get failed external dependency calls (APIs, databases, etc.).

**Parameters:**
- `resourceId` (required)
- `timespan` (optional, default: `PT1H`)
- `limit` (optional, default: `50`)

**Underlying KQL:**
```kusto
dependencies
| where timestamp > ago({timespan})
| where success == false
| order by timestamp desc
| take {limit}
| project timestamp, name, target, type, duration, resultCode, operation_Id, cloud_RoleName
```

</tool>

<tool name="ai-get-traces">

**Description:** Get diagnostic traces filtered by minimum severity level.

**Parameters:**
- `resourceId` (required)
- `severityLevel` (optional, default: `2`) — minimum level: 0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical
- `timespan` (optional, default: `PT1H`)
- `limit` (optional, default: `100`)

**Underlying KQL:**
```kusto
traces
| where timestamp > ago({timespan})
| where severityLevel >= {severityLevel}
| order by timestamp desc
| take {limit}
| project timestamp, message, severityLevel, operation_Name, operation_Id, cloud_RoleName
```

</tool>

<tool name="ai-get-availability">

**Description:** Get availability test results and uptime statistics.

**Parameters:**
- `resourceId` (required)
- `timespan` (optional, default: `PT24H`)

**Underlying KQL:**
```kusto
availabilityResults
| where timestamp > ago({timespan})
| summarize
    TotalTests=count(),
    SuccessCount=countif(success == true),
    FailureCount=countif(success == false),
    AvgDuration=avg(duration)
  by name
| extend SuccessRate=round(100.0 * SuccessCount / TotalTests, 2)
| order by FailureCount desc
```

</tool>

<tool name="ai-get-custom-events">

**Description:** Get custom application events, optionally filtered by event name.

**Parameters:**
- `resourceId` (required)
- `eventName` (optional) — filter to a specific event name
- `timespan` (optional, default: `PT1H`)
- `limit` (optional, default: `100`)

**Underlying KQL:**
```kusto
customEvents
| where timestamp > ago({timespan})
[| where name == "{eventName}"]  -- added only when eventName is provided
| order by timestamp desc
| take {limit}
| project timestamp, name, customDimensions, operation_Id, cloud_RoleName
```

</tool>

</tool-reference>

<prompt-reference>

All prompts accept `resourceId` (required) and `timespan` (optional). Prompts execute multiple queries internally and return a pre-formatted markdown report as an `assistant` role message.

<prompt name="ai-exception-summary">

**Default timespan:** `PT1H`

**Queries executed:**
1. `getRecentExceptions(resourceId, timespan, 50)` — recent exceptions
2. Custom KQL: exception type frequency (`summarize Count=count() by type`)

**Report sections:** Key Insights, Recent Exceptions (table), Exception Types by Frequency (table), Recommendations

**Recommendations included:**
- Review most frequent exception types for systemic issues
- Investigate exceptions in critical operations first
- Check for timestamp patterns (deployments, peak traffic)
- Use `operation_Id` to correlate exceptions with requests and dependencies

</prompt>

<prompt name="ai-performance-report">

**Default timespan:** `PT1H`

**Queries executed:**
1. `getOperationPerformance(resourceId, timespan)` — P50/P95/P99 by operation
2. `getSlowRequests(resourceId, 5000, timespan, 20)` — requests over 5s

**Report sections:** Key Insights, Operation Performance Summary (table), Slowest Requests >5s (table), Performance Recommendations

**Recommendations included:**
- Focus on operations with high P95/P99 duration
- Investigate operations with high failure counts
- Monitor high-request-count operations for scalability issues
- Use `operation_Id` to trace slow requests through dependencies

</prompt>

<prompt name="ai-dependency-health">

**Default timespan:** `PT1H`

**Queries executed:**
1. `getFailedDependencies(resourceId, timespan, 50)` — failed dependency calls
2. Custom KQL: success rates per target (`summarize Total, Failed, AvgDuration by target, type; extend SuccessRate`)

**Report sections:** Key Insights, Failed Dependencies (table), Dependency Success Rates (table), Recommendations

**Recommendations included:**
- Investigate dependencies with success rates below 99%
- Check if external service degradation matches known incidents
- Review timeout configurations for slow dependencies
- Consider circuit breakers for unreliable dependencies

</prompt>

<prompt name="ai-availability-report">

**Default timespan:** `PT24H`

**Queries executed:**
1. `getAvailabilityResults(resourceId, timespan)` — uptime per test name

**Report sections:** Availability Test Results (table), Recommendations

**Recommendations included:**
- Investigate tests with success rates below 99.9%
- Review failed tests for geographic or time-based patterns
- Add availability tests for critical endpoints if missing
- Set up alerts for availability degradation

</prompt>

<prompt name="ai-troubleshooting-guide">

**Default timespan:** `PT1H`

**Queries executed (parallel):**
1. `getRecentExceptions(resourceId, timespan, 20)`
2. `getSlowRequests(resourceId, 5000, timespan, 20)`
3. `getFailedDependencies(resourceId, timespan, 20)`
4. `getTracesBySeverity(resourceId, 3, timespan, 30)` — Error level only

**Report sections:**
1. Recent Errors and Exceptions
2. Performance Issues (slow requests)
3. Dependency Failures
4. Diagnostic Logs (Error severity)
5. Investigation Steps
6. Common Patterns and Root Causes

**Common patterns in report:**
- High exception rate + dependency failures → External service degradation
- Slow requests + high dependency duration → Network or external API latency
- Exceptions in specific operations → Code defect or invalid input
- Timeouts → Insufficient resources or inefficient queries

</prompt>

</prompt-reference>

<telemetry-tables>

Application Insights stores telemetry in the following KQL tables:

| Table | Description | Common use |
|-------|-------------|------------|
| `requests` | Incoming HTTP requests | Performance, error rates |
| `dependencies` | Outbound calls (APIs, DBs, queues) | External service health, latency |
| `exceptions` | Application exceptions with stack traces | Error investigation, stability |
| `traces` | Diagnostic log messages | Debug output, informational logs |
| `customEvents` | Custom application events | Feature usage, business events |
| `customMetrics` | Custom metrics | Business KPIs, counters |
| `pageViews` | Client-side page views | User behavior, frontend performance |
| `browserTimings` | Client-side performance timings | Frontend load time analysis |
| `availabilityResults` | Availability/uptime test results | SLA monitoring |
| `performanceCounters` | System metrics (CPU, memory, disk) | Infrastructure health |

</telemetry-tables>

<timespan-reference>

All tools accept timespans as ISO 8601 duration strings. The service converts them to KQL `ago()` format internally.

<conversion-table>

| ISO 8601 Input | KQL `ago()` Value | Description |
|----------------|-------------------|-------------|
| `PT15M` | `15m` | 15 minutes |
| `PT1H` | `1h` | 1 hour (most tool defaults) |
| `PT12H` | `12h` | 12 hours |
| `PT24H` | `24h` | 24 hours |
| `P1D` | `1d` | 1 day |
| `P7D` | `7d` | 7 days |
| `P30D` | `30d` | 30 days |

</conversion-table>

**Conversion logic** (`convertTimespanToKQL` private method):
- Parses `P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?`
- Concatenates parts: `{days}d{hours}h{minutes}m{seconds}s`
- Falls back to `1h` if no parts matched

The `timespan` parameter is also passed to the API as a query parameter, which applies as an additional server-side filter on top of the `ago()` in the KQL itself.

</timespan-reference>

<error-handling>

<error-case name="authentication-401">

**HTTP 401**
Message: `"Application Insights authentication failed. Check credentials and permissions."`

Causes: Invalid tenant ID, client ID, or client secret. Expired token (rare — tokens auto-refresh).

</error-case>

<error-case name="authorization-403">

**HTTP 403**
Message: `"Application Insights access denied. Ensure you have Reader role on the resource."`

Cause: Service principal lacks "Monitoring Reader" or "Reader" role on the Application Insights resource.

</error-case>

<error-case name="rate-limit-429">

**HTTP 429**
Message: `"Application Insights rate limit exceeded. Please retry after {retryAfter} seconds. Current limits: {60 or 15} requests/minute"`

The `retry-after` response header value is included in the error message. Switch to Entra ID auth to get the higher 60 req/min limit.

</error-case>

<error-case name="kql-syntax-error">

**KQL SyntaxError** (API inner error code)
Message: `"KQL query syntax error: {message}\nHint: Check table names, column names, and operator syntax"`

</error-case>

<error-case name="kql-semantic-error">

**KQL SemanticError** (API inner error code)
Message: `"KQL query semantic error: {message}\nHint: Use appinsights-get-metadata to see available tables and columns"`

</error-case>

<error-case name="timeout">

**Connection timeout** (ECONNABORTED / ETIMEDOUT)
Message: `"Application Insights query timed out after 30 seconds. Try reducing the time range or simplifying the query."`

Default timeout: 30 seconds for all queries and metadata requests.

</error-case>

<error-case name="network-error">

**Network error** (ENOTFOUND / ECONNREFUSED)
Message: `"Network error: Unable to connect to Application Insights API. Check your internet connection and firewall settings."`

</error-case>

<error-case name="resource-not-found">

**Resource not found**
Message: `"Application Insights resource '{resourceId}' not found"`
Thrown by `getResourceById()` when `resourceId` does not match any configured resource.

</error-case>

<error-case name="resource-inactive">

**Inactive resource**
Message: `"Application Insights resource '{resourceId}' is inactive"`
Thrown by `getResourceById()` when the matching resource has `active: false`. Set `active: true` in `APPINSIGHTS_RESOURCES` to enable it.

</error-case>

<error-case name="config-missing">

**No resource configuration**
Message: `"Missing Application Insights configuration: APPINSIGHTS_RESOURCES or APPINSIGHTS_APP_ID"`
Thrown on first tool/prompt invocation when neither env var is set.

</error-case>

<error-case name="resources-json-invalid">

**Invalid JSON in APPINSIGHTS_RESOURCES**
Message: `"Failed to parse APPINSIGHTS_RESOURCES JSON"`

</error-case>

</error-handling>

<security>

- **Read-only**: No write, update, or delete operations are possible via the API used
- **No credentials logged**: Auth credentials never appear in `console.error()` output
- **Tokens in memory only**: Access tokens never persisted to disk
- **Query size limit**: Max 10KB per query (API enforced)
- **Result size limit**: Max 10,000 rows (API enforced)
- **Results truncated**: Large results automatically truncated by the API

**Required RBAC:**
- Entra ID: "Monitoring Reader" or "Reader" role on each Application Insights resource. Can be assigned at resource or resource group level.
- API Key: "Read telemetry" permission only. Keys can be scoped to specific resources.

**API key rotation:** Recommended every 90 days. Monitor usage in Azure Portal → Application Insights → API Access → Usage.

</security>

<query-best-practices>

- Use `take` or `top` to limit row counts (all helper methods do this automatically)
- Use `summarize` with `by` to aggregate before returning large datasets
- Set explicit `timespan` parameters rather than relying on unbounded queries
- Use `ai-get-metadata` to discover column names before writing custom queries
- Use `operation_Id` to correlate exceptions, requests, and dependencies across tables
- Use `cloud_RoleName` to filter telemetry for a specific microservice in multi-service applications
- Use `ago()` in KQL combined with the `timespan` API parameter for redundant time filtering

</query-best-practices>

<cli-architecture>

**Binary:** `mcp-appins-cli`
**Cache directory:** `.mcp-appins-cache/`

**File structure:**
```
packages/application-insights/src/
  cli.ts                          # Entry point, Commander.js program
  context-factory.ts              # Shared createServiceContext() for CLI
  cli/
    output.ts                     # Sets cache dir to .mcp-appins-cache
    commands/
      index.ts                    # registerAllCommands() aggregator
      appinsights-commands.ts     # All 10 CLI commands
```

**Command groups:**

| CLI Command | MCP Tool | Required Args | Options |
|-------------|----------|---------------|---------|
| `list-resources` | `ai-list-resources` | — | — |
| `get-metadata <resourceId>` | `ai-get-metadata` | resourceId | — |
| `query <resourceId> <query>` | `ai-execute-query` | resourceId, query | `--timespan` |
| `exceptions <resourceId>` | `ai-get-exceptions` | resourceId | `--timespan`, `--limit` |
| `slow-requests <resourceId>` | `ai-get-slow-requests` | resourceId | `--duration`, `--timespan`, `--limit` |
| `op-perf <resourceId>` | `ai-get-op-perf` | resourceId | `--timespan` |
| `failed-deps <resourceId>` | `ai-get-failed-deps` | resourceId | `--timespan`, `--limit` |
| `traces <resourceId>` | `ai-get-traces` | resourceId | `--severity`, `--timespan`, `--limit` |
| `availability <resourceId>` | `ai-get-availability` | resourceId | `--timespan` |
| `custom-events <resourceId>` | `ai-get-custom-events` | resourceId | `--event-name`, `--timespan`, `--limit` |

**Global flags** (all commands):
- `--json` — output raw JSON instead of summary
- `--no-cache` — skip writing to cache directory
- `--env-file <path>` — load custom `.env` file

**Usage examples:**
```bash
# List resources
mcp-appins-cli list-resources

# Run a custom KQL query
mcp-appins-cli query prod-api "exceptions | take 10" --timespan PT1H

# Get exceptions with raw JSON output
mcp-appins-cli --json exceptions prod-api --timespan PT4H --limit 100

# Get traces at Error severity
mcp-appins-cli traces prod-api --severity 3 --timespan PT1H

# Get slow requests over 10s threshold
mcp-appins-cli slow-requests prod-api --duration 10000 --timespan PT6H
```

</cli-architecture>
