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
- `adf-query-pipeline-runs` - Query runs by date/status
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

## Important: Debug Mode Limitation

The ADF REST API does NOT support true "debug mode" runs (running unpublished pipelines). All pipeline runs via this API execute the **published** version of the pipeline.

However, the API provides full pipeline execution and monitoring capabilities:
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
# List pipelines
mcp-adf-cli pipeline list dev-adf

# Get pipeline run
mcp-adf-cli pipeline get-run dev-adf abc-123-run-id
```
