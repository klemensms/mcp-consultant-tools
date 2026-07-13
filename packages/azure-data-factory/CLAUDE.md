# Azure Data Factory Package Guide

## Overview

Azure Data Factory integration for pipeline execution, monitoring, and error debugging.

- **Tools:** 24 tools
- **Authentication:** Azure AD Service Principal (MSAL)
- **Write Protection:** Pipeline execution requires explicit opt-in

## Environment Configuration

### Required Configuration

```bash
# Default factory (single factory mode)
AZURE_DATA_FACTORY_SUBSCRIPTION_ID=your-subscription-id
AZURE_DATA_FACTORY_RESOURCE_GROUP=your-resource-group
AZURE_DATA_FACTORY_NAME=your-factory-name

# Azure AD credentials (same as other Azure packages)
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
```

### Multi-Factory Configuration (Optional)

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

### Write Protection

```bash
# Default: read-only mode (listing, monitoring)
AZURE_DATA_FACTORY_ENABLE_WRITE=false

# Enable pipeline execution (run-pipeline, cancel-pipeline-run, rerun-pipeline)
AZURE_DATA_FACTORY_ENABLE_WRITE=true

# Enable trigger control (separate flag)
AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL=false
```

## Key Tools

### Pipeline Operations
- `adf-list-factories` - List configured factories
- `adf-list-pipelines` - List all pipelines
- `adf-get-pipeline` - Get pipeline definition
- `adf-run-pipeline` - Trigger a pipeline run (requires ENABLE_WRITE)
- `adf-get-pipeline-run` - Get run status and errors
- `adf-get-activity-runs` - Get activity-level details (critical for debugging)
- `adf-cancel-pipeline-run` - Cancel a running pipeline (requires ENABLE_WRITE)
- `adf-query-pipeline-runs` - Query triggered/published runs by date/status
- `adf-query-debug-pipeline-runs` - Query **debug-mode** run history (undocumented ARM op, ~15-day retention)
- `adf-rerun-pipeline` - Rerun from failure (requires ENABLE_WRITE)

### Resource Discovery
- `adf-list-datasets` - List all datasets
- `adf-get-dataset` - Get dataset definition
- `adf-list-linked-services` - List linked services (credentials sanitized)
- `adf-list-data-flows` - List data flows
- `adf-get-data-flow` - Get data flow definition

### Trigger Management
- `adf-list-triggers` - List all triggers
- `adf-get-trigger` - Get trigger definition
- `adf-start-trigger` - Activate trigger (requires ENABLE_TRIGGER_CONTROL)
- `adf-stop-trigger` - Deactivate trigger (requires ENABLE_TRIGGER_CONTROL)
- `adf-query-trigger-runs` - Query trigger execution history

### Integration Runtime
- `adf-list-integration-runtimes` - List all IRs
- `adf-get-integration-runtime-status` - Get detailed IR status
- `adf-start-integration-runtime` - Start managed IR (requires ENABLE_WRITE)
- `adf-stop-integration-runtime` - Stop managed IR (requires ENABLE_WRITE)

## Required Azure RBAC Roles

| Role | Scope | Operations |
|------|-------|------------|
| **Data Factory Contributor** | Factory | Full read/write access |
| **Data Factory Reader** | Factory | Read-only access |

Minimum permissions:
- `Microsoft.DataFactory/factories/pipelines/read`
- `Microsoft.DataFactory/factories/pipelines/createRun/action`
- `Microsoft.DataFactory/factories/pipelineruns/read`
- `Microsoft.DataFactory/factories/pipelineruns/activityruns/read`
- `Microsoft.DataFactory/factories/pipelineruns/cancel/action`
- `Microsoft.DataFactory/factories/datasets/read`
- `Microsoft.DataFactory/factories/linkedservices/read`
- `Microsoft.DataFactory/factories/triggers/read`
- `Microsoft.DataFactory/factories/triggers/start/action`
- `Microsoft.DataFactory/factories/triggers/stop/action`
- `Microsoft.DataFactory/factories/integrationruntimes/read`

## Important: Debug Mode — Execute vs Query

The ADF REST API does NOT support *executing* true "debug mode" runs (running unpublished pipelines). All pipeline runs *created* via this API execute the **published** version of the pipeline.

*Querying* debug-run history is a different matter. Runs launched via the ADF Studio "Debug" button are retrievable through the `queryDebugPipelineRuns` ARM action (surfaced by `adf-query-debug-pipeline-runs`). That operation is **undocumented** by Microsoft — absent from the public Swagger/REST reference — but is a real, RBAC-registered control-plane action (`Microsoft.DataFactory/factories/querydebugpipelineruns/action`, `IsDataAction: false`) that works with app-only auth given Data Factory Contributor-equivalent RBAC. Debug-run history is retained server-side for only ~15 days, and the response has no total-count field (the tool reports `truncated` when `maxResults` capped the result). Treat the endpoint as unsupported — Microsoft may change or remove external access without notice.

For *executing* pipelines, the API provides full execution and monitoring capabilities:
1. Trigger pipeline runs with parameters
2. Monitor execution status in real-time
3. Get detailed error messages when activities fail
4. Rerun pipelines from the point of failure

## Example Workflows

### Run Pipeline and Monitor

```
1. adf-run-pipeline(pipelineName: "DataCopy_Pipeline", parameters: {isIncremental: false})
   → Returns runId

2. adf-get-pipeline-run(runId: "abc123")
   → Returns status: "InProgress"

3. [Poll until complete]

4. adf-get-activity-runs(runId: "abc123", status: "Failed")
   → Returns detailed error: Copy_account failed, blob not found
```

### Diagnose and Rerun

```
1. adf-get-activity-runs(runId: "abc123")
   → Shows Copy_account failed due to missing file

2. adf-rerun-pipeline(failedRunId: "abc123", startFromFailure: true)
   → Returns new runId: "def456"
```

## Reference

See `docs/technical/AZURE_DATA_FACTORY_TECHNICAL.md` for detailed implementation.

## CLI Usage

Binary: `mcp-adf-cli`

```bash
# List pipelines (default factory)
mcp-adf-cli pipeline list

# List pipelines in a specific factory (factory ID is a --factory-id flag, not positional)
mcp-adf-cli pipeline list --factory-id prod-adf

# Get a pipeline run's status
mcp-adf-cli pipeline get-run abc123-def456

# Query DEBUG-mode run history — all flags: window, pipeline, status, truncation cap, factory
mcp-adf-cli pipeline query-debug-runs --last-days 14 --pipeline-name DataCopy_Pipeline --status Failed --max-results 500 --factory-id prod-adf
```
