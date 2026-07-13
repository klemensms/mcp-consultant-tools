# Azure Data Factory - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/azure-data-factory.md -->

<overview>

Azure Data Factory MCP server. 24 tools across pipeline operations, resource discovery, trigger management, and integration runtime control. Uses the Azure Management REST API (`api-version=2018-06-01`) with MSAL service principal authentication.

**Package:** `@mcp-consultant-tools/azure-data-factory`
**MCP binary:** `mcp-adf`
**CLI binary:** `mcp-adf-cli`

</overview>

<architecture>

## Package Structure

```
packages/azure-data-factory/src/
  index.ts                    # MCP server entry + createServiceContext()
  context-factory.ts          # Shared createServiceContext() for CLI
  types.ts                    # ServiceContext interface
  tool-examples.ts            # descWithExamples() + example arrays
  cli.ts                      # CLI entry point (Commander.js)
  models/
    api-types.ts              # All TypeScript interfaces
    index.ts                  # Barrel export
  services/
    adf-service.ts            # AdfService class (single service, all domains)
    index.ts                  # Barrel export
  tools/
    pipeline-tools.ts         # Factory + pipeline tools (10 tools)
    monitoring-tools.ts       # Integration runtime tools (4 tools)
    trigger-tools.ts          # Trigger tools (5 tools)
    dataset-tools.ts          # Dataset tools (2 tools)
    linked-service-tools.ts   # Linked service + data flow tools (3 tools)
    index.ts                  # registerAllTools() aggregator
  utils/
    formatters.ts             # Markdown + JSON output formatters
  cli/
    output.ts                 # Cache dir: .mcp-adf-cache
    commands/
      index.ts                # registerAllCommands() aggregator
      pipeline-commands.ts    # pipeline + factory commands
      trigger-commands.ts     # trigger commands
      dataset-commands.ts     # dataset commands
      linked-service-commands.ts
      data-flow-commands.ts
      integration-runtime-commands.ts
      factory-commands.ts
```

**ServiceContext** has a single getter:

```typescript
export interface ServiceContext {
  readonly adf: AdfService;
}
```

All 24 tools call methods on the single `AdfService` class.

</architecture>

<authentication>

## Authentication

**Method:** Azure AD service principal (MSAL `ConfidentialClientApplication`)

**Scope:** `https://management.azure.com/.default`

**Token caching:** Tokens are cached in memory and refreshed 5 minutes before expiration (`expiresOn - 5min`).

```typescript
// Token acquisition
const result = await msalClient.acquireTokenByClientCredential({
  scopes: ['https://management.azure.com/.default'],
});

// Authorization header on every request
Authorization: `Bearer ${accessToken}`
```

**Environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_TENANT_ID` | Yes | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | Yes | Service principal application ID |
| `AZURE_CLIENT_SECRET` | Yes | Service principal client secret |

**Required RBAC role:** `Data Factory Contributor` (full access) or `Data Factory Reader` (read-only).

**Minimum RBAC permissions for full functionality:**

| Permission | Required For |
|------------|-------------|
| `Microsoft.DataFactory/factories/pipelines/read` | List and view pipelines |
| `Microsoft.DataFactory/factories/pipelines/createRun/action` | Trigger pipeline runs |
| `Microsoft.DataFactory/factories/pipelineruns/read` | View run status |
| `Microsoft.DataFactory/factories/pipelineruns/activityruns/read` | View activity details |
| `Microsoft.DataFactory/factories/pipelineruns/cancel/action` | Cancel runs |
| `Microsoft.DataFactory/factories/datasets/read` | List datasets |
| `Microsoft.DataFactory/factories/linkedservices/read` | List linked services |
| `Microsoft.DataFactory/factories/triggers/read` | List triggers |
| `Microsoft.DataFactory/factories/triggers/start/action` | Start triggers |
| `Microsoft.DataFactory/factories/triggers/stop/action` | Stop triggers |
| `Microsoft.DataFactory/factories/integrationruntimes/read` | List integration runtimes |

**Create service principal:**

```bash
az ad sp create-for-rbac --name "ADF-MCP-Server" \
  --role "Data Factory Contributor" \
  --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group}/providers/Microsoft.DataFactory/factories/{factory-name}
```

</authentication>

<factory-configuration>

## Factory Configuration

The server supports both single-factory and multi-factory modes.

<configuration name="single-factory">

### Single Factory Mode

Set three environment variables:

```bash
AZURE_DATA_FACTORY_SUBSCRIPTION_ID=your-subscription-id
AZURE_DATA_FACTORY_RESOURCE_GROUP=your-resource-group
AZURE_DATA_FACTORY_NAME=your-factory-name
```

The service creates an internal factory entry with `id: "default"`.

</configuration>

<configuration name="multi-factory">

### Multi-Factory Mode

Set `AZURE_DATA_FACTORIES` with a JSON array. This takes precedence over the single-factory variables.

```bash
AZURE_DATA_FACTORIES='[
  {
    "id": "dev-adf",
    "name": "Development ADF",
    "subscriptionId": "sub-1",
    "resourceGroup": "rg-dev",
    "factoryName": "adf-dev-01",
    "active": true
  },
  {
    "id": "prod-adf",
    "name": "Production ADF",
    "subscriptionId": "sub-2",
    "resourceGroup": "rg-prod",
    "factoryName": "adf-prod-01",
    "active": true
  }
]'
```

**Factory resolution logic:**
1. If `factoryId` parameter is provided → look up factory by `id` field
2. If `factoryId` is omitted → use the first active factory (`active: true`)
3. If factory is found but `active: false` → throw error
4. If no active factories → throw error

The `adf-list-factories` tool shows all configured factories plus the current `writeEnabled` and `triggerControlEnabled` state.

</configuration>

</factory-configuration>

<feature-flags>

## Feature Flags

Two separate flags gate write operations. Both default to `false` (read-only mode).

| Flag | Default | Gates |
|------|---------|-------|
| `AZURE_DATA_FACTORY_ENABLE_WRITE` | `false` | `adf-run-pipeline`, `adf-cancel-pipeline-run`, `adf-rerun-pipeline`, `adf-start-integration-runtime`, `adf-stop-integration-runtime` |
| `AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL` | `false` | `adf-start-trigger`, `adf-stop-trigger` |

**Guard pattern in service:**

```typescript
if (!this.config.enableWrite) {
  throw new Error(
    'Write operations are disabled. Set AZURE_DATA_FACTORY_ENABLE_WRITE=true to enable.'
  );
}
```

```typescript
if (!this.config.enableTriggerControl) {
  throw new Error(
    'Trigger control is disabled. Set AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL=true to enable.'
  );
}
```

</feature-flags>

<api-reference>

## REST API Reference

**Base URL pattern:**

```
https://management.azure.com/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.DataFactory/factories/{factoryName}
```

**API version:** `2018-06-01` (stable, used on all endpoints)

**HTTP timeouts:** GET requests = 30 seconds, POST requests = 60 seconds.

### Endpoints

| Operation | Method | Path |
|-----------|--------|------|
| List Pipelines | GET | `/pipelines?api-version=2018-06-01` |
| Get Pipeline | GET | `/pipelines/{pipelineName}?api-version=2018-06-01` |
| Create Pipeline Run | POST | `/pipelines/{pipelineName}/createRun?api-version=2018-06-01` |
| Get Pipeline Run | GET | `/pipelineruns/{runId}?api-version=2018-06-01` |
| Query Activity Runs | POST | `/pipelineruns/{runId}/queryActivityruns?api-version=2018-06-01` |
| Cancel Pipeline Run | POST | `/pipelineruns/{runId}/cancel?api-version=2018-06-01` |
| Query Pipeline Runs | POST | `/queryPipelineRuns?api-version=2018-06-01` |
| Query Debug Pipeline Runs | POST | `/queryDebugPipelineRuns?api-version=2018-06-01` (undocumented ARM action) |
| List Datasets | GET | `/datasets?api-version=2018-06-01` |
| Get Dataset | GET | `/datasets/{datasetName}?api-version=2018-06-01` |
| List Linked Services | GET | `/linkedservices?api-version=2018-06-01` |
| List Data Flows | GET | `/dataflows?api-version=2018-06-01` |
| Get Data Flow | GET | `/dataflows/{dataFlowName}?api-version=2018-06-01` |
| List Triggers | GET | `/triggers?api-version=2018-06-01` |
| Get Trigger | GET | `/triggers/{triggerName}?api-version=2018-06-01` |
| Start Trigger | POST | `/triggers/{triggerName}/start?api-version=2018-06-01` |
| Stop Trigger | POST | `/triggers/{triggerName}/stop?api-version=2018-06-01` |
| Query Trigger Runs | POST | `/queryTriggerRuns?api-version=2018-06-01` |
| List Integration Runtimes | GET | `/integrationRuntimes?api-version=2018-06-01` |
| Get IR Status | POST | `/integrationRuntimes/{irName}/getStatus?api-version=2018-06-01` |
| Start IR | POST | `/integrationRuntimes/{irName}/start?api-version=2018-06-01` |
| Stop IR | POST | `/integrationRuntimes/{irName}/stop?api-version=2018-06-01` |

### Recovery Mode (Rerun from Failure)

Recovery runs pass additional query parameters to the `createRun` endpoint:

```http
POST /pipelines/{pipelineName}/createRun?api-version=2018-06-01
    &referencePipelineRunId={failedRunId}
    &isRecovery=true
    &startFromFailure=true
    [&startActivityName={activityName}]
```

The `adf-rerun-pipeline` tool fetches the original run first (to get the pipeline name and original parameters), then calls `createRun` with these recovery parameters.

</api-reference>

<tool-reference>

## Tool Reference

<tool-group name="factory">

### Factory Tools

**`adf-list-factories`**
Lists all configured factory instances. Returns `writeEnabled` and `triggerControlEnabled` state alongside factory details. No parameters.

</tool-group>

<tool-group name="pipeline">

### Pipeline Tools

**`adf-list-pipelines`**
Lists all pipelines in a factory. Returns a formatted table with name, description (truncated to 50 chars), activity count, and folder.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `factoryId` | string | No | Factory ID from `adf-list-factories`. Defaults to first active factory. |

**`adf-get-pipeline`**
Returns the full pipeline definition JSON including all activities, parameters, and variables.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pipelineName` | string | Yes | Exact pipeline name |
| `factoryId` | string | No | Factory ID |

**`adf-run-pipeline`**
Triggers a pipeline run. Requires `AZURE_DATA_FACTORY_ENABLE_WRITE=true`. Returns `runId` plus a `monitorUrl` pointing to the ADF Studio monitoring page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pipelineName` | string | Yes | Pipeline name |
| `parameters` | object | No | Key-value pipeline parameters |
| `factoryId` | string | No | Factory ID |

**`adf-get-pipeline-run`**
Returns formatted run status: pipeline name, run ID, status, duration, start/end times, invoked-by info, message. Uses markdown table format.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `runId` | string | Yes | Run ID from `adf-run-pipeline` or `adf-query-pipeline-runs` |
| `factoryId` | string | No | Factory ID |

**`adf-get-activity-runs`**
Returns formatted activity breakdown plus a JSON block. The formatted section includes: summary counts (total/succeeded/failed/cancelled), detailed failure section with error code and message for each failed activity, and a full activity timeline table. The tool also fetches the parent pipeline run for additional context.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `runId` | string | Yes | Pipeline run ID |
| `status` | enum | No | Filter: `Succeeded`, `Failed`, `InProgress`, `Cancelled`, `Queued` |
| `activityName` | string | No | Filter by exact activity name |
| `factoryId` | string | No | Factory ID |

**Activity time range:** Queries activities updated within the last 30 days through tomorrow, ordered by `ActivityRunStart ASC`.

**`adf-cancel-pipeline-run`**
Cancels a running pipeline. Requires `AZURE_DATA_FACTORY_ENABLE_WRITE=true`. Cancellation is asynchronous — the pipeline may take a moment to fully stop.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `runId` | string | Yes | Run ID to cancel |
| `factoryId` | string | No | Factory ID |

**`adf-query-pipeline-runs`**
Queries pipeline runs with optional filters. Returns JSON array of run summaries including human-readable `duration` field alongside raw `durationInMs`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `lastDays` | number | 7 | Look-back window in days |
| `pipelineName` | string | — | Filter by exact pipeline name |
| `status` | enum | — | `Queued`, `InProgress`, `Succeeded`, `Failed`, `Canceling`, `Cancelled` |
| `factoryId` | string | — | Factory ID |

**`adf-query-debug-pipeline-runs`**
Queries **debug-mode** pipeline run history — runs launched via the ADF Studio "Debug" button, a distinct surface from triggered/published runs. Backed by the `queryDebugPipelineRuns` ARM action, which is **undocumented** by Microsoft (absent from the public Swagger/REST reference) but is a real, RBAC-registered control-plane action (`Microsoft.DataFactory/factories/querydebugpipelineruns/action`, `IsDataAction: false`) that works with **app-only** (service principal) auth given Data Factory Contributor-equivalent RBAC. Debug-run history is retained **server-side for ~15 days** regardless of the query window.

The response schema has **no total-count field**, so the tool pages through `continuationToken` up to `maxResults` and reports `"truncated": true` when the cap hid further runs — a capped count is never reported as the total. Caller-supplied `status` is normalized to the wire casing (e.g. British `Cancelling` → `Canceling`) so an exact-match filter does not silently return zero.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `lastDays` | number | 7 | Look-back window in days (debug history kept ~15 days) |
| `pipelineName` | string | — | Filter by exact pipeline name |
| `status` | enum | — | `Queued`, `InProgress`, `Succeeded`, `Failed`, `Canceling`, `Cancelled` |
| `maxResults` | number | 100 | Max runs to return before truncating (1–1000) |
| `factoryId` | string | — | Factory ID |

**`adf-rerun-pipeline`**
Reruns a failed pipeline in recovery mode. Automatically fetches the original run to get the pipeline name and parameters. Creates a new run with `isRecovery=true` and `startFromFailure=true`. Requires `AZURE_DATA_FACTORY_ENABLE_WRITE=true`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `failedRunId` | string | — | Run ID of the failed pipeline |
| `startFromFailure` | boolean | `true` | Start from failed activities |
| `startActivityName` | string | — | Optional: start from a specific activity instead |
| `factoryId` | string | — | Factory ID |

</tool-group>

<tool-group name="resource-discovery">

### Resource Discovery Tools

**`adf-list-datasets`** / **`adf-get-dataset`**
List all datasets or get one by name. Returns full dataset definition JSON.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `datasetName` | string | Yes (`get` only) | Dataset name |
| `factoryId` | string | No | Factory ID |

**`adf-list-linked-services`**
Lists all linked services with credentials automatically redacted. The following fields are replaced with `[REDACTED]` before returning:

```
connectionString, password, secretAccessKey, accountKey,
servicePrincipalKey, accessToken, refreshToken,
encryptedCredential, credential
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `factoryId` | string | No | Factory ID |

**`adf-list-data-flows`** / **`adf-get-data-flow`**
List all data flows or get one by name. Returns full data flow definition JSON.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataFlowName` | string | Yes (`get` only) | Data flow name |
| `factoryId` | string | No | Factory ID |

</tool-group>

<tool-group name="trigger">

### Trigger Tools

**`adf-list-triggers`**
Returns a formatted table of triggers with name, type, runtime state, and pipeline count.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `factoryId` | string | No | Factory ID |

**`adf-get-trigger`**
Returns full trigger definition JSON including schedule and pipeline associations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `triggerName` | string | Yes | Trigger name |
| `factoryId` | string | No | Factory ID |

**`adf-start-trigger`** / **`adf-stop-trigger`**
Activate or deactivate a trigger. Both require `AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL=true`. Operations are asynchronous.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `triggerName` | string | Yes | Trigger name |
| `factoryId` | string | No | Factory ID |

**`adf-query-trigger-runs`**
Queries trigger execution history, ordered by `TriggerRunTimestamp DESC`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `lastDays` | number | 7 | Look-back window |
| `triggerName` | string | — | Filter by trigger name |
| `status` | enum | — | `Succeeded`, `Failed`, `Inprogress` (note: ADF API uses `Inprogress` not `InProgress`) |
| `factoryId` | string | — | Factory ID |

</tool-group>

<tool-group name="integration-runtime">

### Integration Runtime Tools

**`adf-list-integration-runtimes`**
Lists all IRs with name, type, state, and description.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `factoryId` | string | No | Factory ID |

**`adf-get-integration-runtime-status`**
Returns formatted IR status including type, state, auto-update setting, version, scheduled update date, and encryption mode.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `irName` | string | Yes | Integration runtime name |
| `factoryId` | string | No | Factory ID |

**`adf-start-integration-runtime`** / **`adf-stop-integration-runtime`**
Start or stop a managed integration runtime. Requires `AZURE_DATA_FACTORY_ENABLE_WRITE=true`. Managed IR startup typically takes 2-5 minutes; these calls are asynchronous.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `irName` | string | Yes | Integration runtime name |
| `factoryId` | string | No | Factory ID |

</tool-group>

</tool-reference>

<data-models>

## Data Models

### Pipeline Run Status Values

```typescript
type PipelineRunStatus =
  | 'Queued'
  | 'InProgress'
  | 'Succeeded'
  | 'Failed'
  | 'Canceling'
  | 'Cancelled';
```

### Activity Run Status Values

```typescript
type ActivityRunStatus =
  | 'Queued'
  | 'InProgress'
  | 'Succeeded'
  | 'Failed'
  | 'Cancelled';
```

### Activity Error Structure

```typescript
interface ActivityError {
  errorCode: string;
  message: string;
  failureType: 'UserError' | 'SystemError' | 'BadRequest';
  target?: string;
  details?: string;
}
```

### Common ADF Error Code Ranges

| Code Range | Category | Description |
|------------|----------|-------------|
| 2000–2099 | Copy Activity | Source/sink errors |
| 2100–2199 | Mapping Data Flow | Transformation errors |
| 2200–2299 | Storage | Blob/file not found, access denied |
| 2300–2399 | Database | Connection, query errors |
| 2400–2499 | Authentication | Token, credential errors |

### Factory Config Interface

```typescript
interface AdfFactoryConfig {
  id: string;           // Unique identifier used in tool factoryId params
  name: string;         // Display name
  subscriptionId: string;
  resourceGroup: string;
  factoryName: string;
  active: boolean;      // Inactive factories are excluded from default resolution
}
```

</data-models>

<error-handling>

## Error Handling

All tool catch blocks return `isError: true`. The service maps HTTP errors to descriptive messages:

| Condition | Error Message |
|-----------|---------------|
| 401 Unauthorized | `Azure Data Factory authentication failed. Check credentials and permissions.` |
| 403 Forbidden | `Azure Data Factory access denied. Ensure you have the required RBAC role.` |
| 404 Not Found | `Resource not found: {API error message}` |
| 429 Rate Limited | `Azure Management API rate limit exceeded. Retry after {N} seconds.` |
| ECONNABORTED / ETIMEDOUT | `Azure Data Factory request timed out. Try again or check if the factory is accessible.` |
| ENOTFOUND / ECONNREFUSED | `Network error: Unable to connect to Azure Management API. Check your internet connection and firewall settings.` |

**Rate limit handling:** The `Retry-After` header value from the 429 response is included in the error message. The service does not auto-retry — the user must retry manually after the indicated delay.

**Troubleshooting common errors:**

- `Authentication failed` → Verify `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`. Check if the client secret has expired.
- `Resource not found: Pipeline 'xyz'` → Verify factory name is correct. Ensure the pipeline is published (not just saved). Check `factoryId` in multi-factory setups.
- `Write operations are disabled` → Set `AZURE_DATA_FACTORY_ENABLE_WRITE=true`. This is by design.
- `Trigger control is disabled` → Set `AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL=true`. This is by design.

</error-handling>

<limitations>

## Limitations

### No Debug Mode via API

The ADF REST API does not support "debug mode" runs (unpublished pipelines):

| Feature | ADF Studio UI | REST API |
|---------|---------------|----------|
| Debug runs (unpublished pipelines) | Yes | No |
| Data Flow debug sessions | Yes | No |
| Trigger published pipelines | Yes | Yes |
| Monitor runs and get errors | Yes | Yes |
| Recovery/rerun from failure | Yes | Yes |

All pipeline runs via this server execute the **published** version of the pipeline.

### API Rate Limits

Azure Management API has per-subscription rate limits. Exact limits vary by region and subscription tier. The server surfaces the `Retry-After` header value when rate limited.

</limitations>

<output-formatting>

## Output Formatting

The `utils/formatters.ts` module produces markdown output for human-readable tools and JSON objects for structured queries.

### `adf-get-activity-runs` — Example Output

```markdown
## Pipeline Run Failed

**Pipeline**: DataCopy_Pipeline
**Run ID**: `abc123`
**Duration**: 5m 22s

### Summary

- Total: 12
- Succeeded: 5
- **Failed: 1**
- Cancelled: 6

### Failed Activities

#### Copy_account

| Field | Value |
|-------|-------|
| Activity Type | Copy |
| Duration | 3m 22s |
| Error Code | 2200 |
| Failure Type | UserError |

**Error Message:**

> The specified blob does not exist. Container: 'source-data', Blob: 'accounts.csv'

### Activity Timeline

| Activity | Type | Status | Duration |
|----------|------|--------|----------|
| DisableChangeTracking_1 | Lookup | Succeeded | 1.5s |
| Copy_account | Copy | **Failed** | 3m 22s |
| Copy_contact | Copy | Cancelled | - |
```

### `adf-query-pipeline-runs` — JSON Output Format

```json
{
  "count": 3,
  "runs": [
    {
      "runId": "abc123",
      "pipelineName": "DataCopy_Pipeline",
      "status": "Failed",
      "runStart": "2026-03-03T08:00:00Z",
      "runEnd": "2026-03-03T08:05:22Z",
      "durationInMs": 322000,
      "duration": "5m 22s",
      "invokedBy": "Manual",
      "invokedByType": "Manual",
      "message": "Activity Copy_account failed"
    }
  ]
}
```

### `adf-query-debug-pipeline-runs` — JSON Output Format

Adds `returned`/`truncated` and `byStatus`/`byPipeline` rollups on top of the run list. `returned` is the number of runs actually returned (capped by `maxResults`), and `truncated` is `true` when more runs existed beyond the cap — there is no server-side total count.

```json
{
  "returned": 2,
  "truncated": false,
  "byStatus": { "Succeeded": 1, "Failed": 1 },
  "byPipeline": { "DataCopy_Pipeline": 2 },
  "runs": [
    {
      "runId": "abc123",
      "pipelineName": "DataCopy_Pipeline",
      "status": "Failed",
      "runStart": "2026-03-03T08:00:00Z",
      "runEnd": "2026-03-03T08:05:22Z",
      "durationInMs": 322000,
      "duration": "5m 22s",
      "invokedBy": "Manual",
      "invokedByType": "Manual",
      "message": "Activity Copy_account failed"
    }
  ]
}
```

</output-formatting>

<example-workflows>

## Example Workflows

<example name="run-and-monitor">

### Run Pipeline and Monitor

```
1. List available pipelines:
   adf-list-pipelines

2. Trigger pipeline with parameters:
   adf-run-pipeline(pipelineName: "DataCopy_Pipeline", parameters: {isIncremental: false})
   → Returns runId: "abc123"

3. Check status:
   adf-get-pipeline-run(runId: "abc123")
   → Returns status: "InProgress", duration so far

4. If failed, get activity details:
   adf-get-activity-runs(runId: "abc123", status: "Failed")
   → Returns which activity failed and the detailed error message
```

</example>

<example name="diagnose-and-recover">

### Diagnose and Recover from Failure

```
1. Get activity details for failed run:
   adf-get-activity-runs(runId: "abc123")
   → Shows Copy_account failed: "The specified blob does not exist"

2. Fix the underlying issue (ensure file exists in source)

3. Rerun from failure point:
   adf-rerun-pipeline(failedRunId: "abc123", startFromFailure: true)
   → Creates new run starting from failed activity; returns new runId: "def456"
```

</example>

<example name="trigger-health">

### Monitor Trigger Health

```
1. List triggers and their states:
   adf-list-triggers
   → Shows each trigger's type and runtime state (Started/Stopped)

2. Query recent failed trigger runs:
   adf-query-trigger-runs(lastDays: 7, status: "Failed")

3. Investigate a specific trigger:
   adf-get-trigger(triggerName: "DailySchedule")
   → Shows full schedule configuration and pipeline associations
```

</example>

</example-workflows>

<cli-architecture>

## CLI Architecture

The CLI reuses the same `AdfService` and `ServiceContext` as the MCP server via `context-factory.ts`.

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of summary |
| `--no-cache` | Skip writing cache files |
| `--env-file <path>` | Load environment from a custom .env file |

Cache directory: `.context/.mcp-adf-cache/`

### Command Groups

| Group | Commands | Notes |
|-------|----------|-------|
| `factory` | `list` | Lists all configured factories |
| `pipeline` | `list`, `get`, `run`, `get-run`, `cancel-run`, `query-runs`, `query-debug-runs`, `activity-runs`, `rerun` | `run`, `cancel-run`, `rerun` require ENABLE_WRITE |
| `dataset` | `list`, `get` | |
| `linked-service` | `list` | Credentials always redacted |
| `data-flow` | `list`, `get` | |
| `trigger` | `list`, `get`, `start`, `stop`, `query-runs` | `start`, `stop` require ENABLE_TRIGGER_CONTROL |
| `integration-runtime` | `list`, `status`, `start`, `stop` | `start`, `stop` require ENABLE_WRITE |

### Parameter Mapping Convention

| MCP Tool (Zod) | CLI (Commander) |
|----------------|-----------------|
| Required `z.string()` | Positional argument `<arg>` |
| Optional `z.string().optional()` | Option flag `--flag <value>` |
| Optional `z.number().optional()` | Option `--last-days <n>` (parsed with `parseInt`) |
| Optional `z.boolean().optional()` | Boolean flag `--no-start-from-failure` |
| `z.record(z.any()).optional()` (parameters) | `--parameters <json>` (parsed with `JSON.parse`) |
| `z.enum([...])` | `--status <status>` with choices comment in description |

### CLI Examples

```bash
# List all configured factories
mcp-adf-cli factory list

# List pipelines (uses default factory)
mcp-adf-cli pipeline list

# List pipelines in a specific factory
mcp-adf-cli pipeline list --factory-id prod-adf

# Run a pipeline with parameters
mcp-adf-cli pipeline run DataCopy_Pipeline --parameters '{"isIncremental": false}'

# Get pipeline run status
mcp-adf-cli pipeline get-run abc123-def456

# Get activity-level details, filter to failed only
mcp-adf-cli pipeline activity-runs abc123-def456 --status Failed

# Query pipeline runs from the last 14 days, failed only
mcp-adf-cli pipeline query-runs --last-days 14 --status Failed

# Query DEBUG-mode run history (undocumented ARM op; ~15-day server-side retention).
# All flags shown: -d look-back window, -n pipeline-name filter, -s status filter
# (British "Cancelling" is normalized to wire "Canceling"), -m truncation cap
# (default 100, max 1000), -f target factory. The response reports "truncated": true
# when --max-results hid further runs — a capped count is never the total.
mcp-adf-cli pipeline query-debug-runs --last-days 14 --pipeline-name DataCopy_Pipeline --status Failed --max-results 500 --factory-id prod-adf

# Rerun from failure point
mcp-adf-cli pipeline rerun abc123-def456

# List triggers
mcp-adf-cli trigger list

# Query failed trigger runs from last 7 days
mcp-adf-cli trigger query-runs --status Failed

# Get integration runtime status
mcp-adf-cli integration-runtime status MyIR

# JSON output
mcp-adf-cli --json pipeline list
```

</cli-architecture>

<dependencies>

## Dependencies

```json
{
  "@azure/msal-node": "^3.3.0",
  "@mcp-consultant-tools/core": "^1.0.0",
  "@modelcontextprotocol/sdk": "^1.0.4",
  "axios": "^1.8.3",
  "zod": "^3.24.1"
}
```

Uses `axios` + MSAL for the Azure Management API, consistent with the `application-insights` and `log-analytics` packages.

</dependencies>

<testing>

## Testing

### Local Build and Run

```bash
# Build
npm run build --workspace=packages/azure-data-factory

# Run MCP server with env file
node --env-file=.env packages/azure-data-factory/build/index.js

# Verify CLI help
node packages/azure-data-factory/build/cli.js --help
node packages/azure-data-factory/build/cli.js pipeline --help
```

### MCP Local Tester

```bash
MCP_TEST_PACKAGE="./packages/azure-data-factory/build/index.js" \
MCP_TEST_TOOL="adf-list-factories" \
MCP_TEST_ARGS='{}' \
node .claude/templates/mcp-test-runner.mjs
```

### Integration Test Sequence

Test against a real ADF instance in this order:
1. `adf-list-factories` — verify config loads
2. `adf-list-pipelines` — verify read access
3. `adf-run-pipeline` (requires ENABLE_WRITE) — trigger a simple/short pipeline
4. `adf-get-pipeline-run` — poll until complete
5. `adf-get-activity-runs` — verify activity data returned
6. If run failed: `adf-rerun-pipeline` — verify recovery mode

</testing>

<api-references>

## External API References

- [Azure Data Factory REST API](https://learn.microsoft.com/en-us/rest/api/datafactory/)
- [Pipeline Runs API](https://learn.microsoft.com/en-us/rest/api/datafactory/pipeline-runs)
- [Activity Runs API](https://learn.microsoft.com/en-us/rest/api/datafactory/activity-runs/query-by-pipeline-run)
- [Pipelines - Create Run](https://learn.microsoft.com/en-us/rest/api/datafactory/pipelines/create-run)
- [Debug Mode Documentation](https://learn.microsoft.com/en-us/azure/data-factory/iterative-development-debugging)

</api-references>
