# Azure DevOps Admin Package Guide

## Overview

Azure DevOps admin operations for DevOps engineers managing pipelines, service connections, agent pools, environments, iterations, areas, and projects.

- **Tools:** 71 tools (32 read-only + 29 upsert + 10 delete), 2 prompts
- **Authentication:** Personal Access Token (PAT) or Entra ID App Registration (client credentials)

> **Developer Tools:** For wikis, work items, and pull requests, see `@mcp-consultant-tools/azure-devops`

## Environment Configuration

```bash
# Required
AZUREDEVOPS_ORGANIZATION=your-organization-name
AZUREDEVOPS_PROJECTS=Project1,Project2  # Use * for all projects

# Authentication (choose one)
# Option A: Personal Access Token
AZUREDEVOPS_PAT=your-personal-access-token-here

# Option B: Entra ID App Registration (overrides PAT if both set)
AZUREDEVOPS_TENANT_ID=your-tenant-id
AZUREDEVOPS_CLIENT_ID=your-client-id
AZUREDEVOPS_CLIENT_SECRET=your-client-secret

# Optional
AZUREDEVOPS_API_VERSION=7.1

# Tier 2: Upsert operations (default: false)
AZUREDEVOPS_ENABLE_PIPELINE_UPSERT=false
AZUREDEVOPS_ENABLE_SERVICE_CONN_UPSERT=false
AZUREDEVOPS_ENABLE_VARIABLE_GROUP_UPSERT=false
AZUREDEVOPS_ENABLE_AGENT_POOL_UPSERT=false
AZUREDEVOPS_ENABLE_ENVIRONMENT_UPSERT=false
AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT=false
AZUREDEVOPS_ENABLE_ITERATION_CAPACITY_UPSERT=false
AZUREDEVOPS_ENABLE_PROJECT_UPSERT=false

# Tier 3: Delete/Disable operations (default: false)
AZUREDEVOPS_ENABLE_PIPELINE_DELETE=false
AZUREDEVOPS_ENABLE_SERVICE_CONN_DELETE=false
AZUREDEVOPS_ENABLE_VARIABLE_GROUP_DELETE=false
AZUREDEVOPS_ENABLE_AGENT_POOL_DISABLE=false
AZUREDEVOPS_ENABLE_ENVIRONMENT_DELETE=false
AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_DELETE=false
AZUREDEVOPS_ENABLE_PROJECT_DELETE=false

# Artifact Feed Allowlist (optional, comma-separated)
AZUREDEVOPS_FEEDS=
```

## Test Environment

**No pre-configured test environment.** Ask user before using any ADO admin tools.

## Three-Tier Permission Model

| Tier | Purpose | Tools |
|------|---------|-------|
| Tier 1 | Read-only (always available) | 32 tools |
| Tier 2 | Create/Update | 29 tools (requires `_UPSERT` flags) |
| Tier 3 | Delete/Disable | 10 tools (requires `_DELETE` flags) |

## Tool Categories

### Pipeline Tools (16)
- Read-only: `list-pipelines`, `get-pipeline-definition`, `get-pipeline-yaml`, `list-pipeline-runs`, `get-build-status`*, `get-build-timeline`*, `get-build-logs`*, `list-pending-approvals`
- Upsert: `admin-create-pipeline`, `admin-update-pipeline`, `admin-rename-pipeline`, `admin-queue-build`, `admin-cancel-build`, `admin-retry-build`, `approve-stage`
- Delete: `admin-delete-pipeline`

\* **Duplicated tools:** `get-build-status`, `get-build-timeline`, `get-build-logs` are also in `azure-devops` package (for developer access). If you update these, also update `packages/azure-devops/src/AzureDevOpsService.ts` and `packages/azure-devops/src/index.ts`.

### Service Connection Tools (7)
- Read-only: `list-service-connections`, `get-service-connection`, `get-service-connection-types`
- Upsert: `admin-create-service-connection`, `admin-update-service-connection`, `admin-share-service-connection`
- Delete: `admin-delete-service-connection`

### Agent Pool Tools (7)
- Read-only: `list-agent-pools`, `get-agent-pool`, `list-agents`, `get-agent`
- Upsert: `admin-update-agent-pool`, `admin-enable-agent`
- Delete: `admin-disable-agent`

### Environment Tools (10)
- Read-only: `list-environments`, `get-environment`, `get-environment-deployments`, `get-environment-checks`
- Upsert: `admin-create-environment`, `admin-update-environment`, `admin-create-environment-check`, `admin-update-environment-check`
- Delete: `admin-delete-environment`, `admin-delete-environment-check`

### Variable Group Admin Tools (5)
- Upsert: `admin-create-variable-group`, `admin-update-variable-group`, `admin-set-variable`, `admin-remove-variable`
- Delete: `admin-delete-variable-group`

### Classification Node Tools (11) - Iterations & Areas
- Read-only: `list-iterations`, `get-iteration`, `list-areas`, `get-area`
- Upsert: `create-iteration`, `update-iteration`, `create-area`, `update-area`, `add-iteration-to-team`
- Delete: `delete-iteration`, `delete-area`

### Iteration Capacity Tools (5) - Team sprint capacity & days-off
- Read-only: `get-iteration-capacities`, `get-team-days-off`
- Upsert: `set-team-member-capacity`, `set-team-capacities-batch`, `set-team-days-off` (requires `AZUREDEVOPS_ENABLE_ITERATION_CAPACITY_UPSERT`)

> `member` accepts an identity GUID, email, or display name (resolved against the team). Writes are FULL REPLACE. `iterationId` is the iteration `identifier` GUID (from `list-iterations`). Batch = one PATCH per member (members not listed are untouched). PAT needs `vso.work_write`.

### Artifact Feed Tools (2)
- Read-only: `list-feed-packages`, `get-package-versions`

### Project Tools (6) - Org-scoped
- Read-only: `list-projects`, `get-project`, `get-project-properties`
- Upsert: `create-project`, `update-project`
- Delete: `delete-project`

> **Note:** Project tools operate at organization level and are NOT restricted by the `AZUREDEVOPS_PROJECTS` allowlist.

### Wildcard Project Access

Set `AZUREDEVOPS_PROJECTS=*` to allow access to all projects in the organization without listing them individually. This also applies to the main `azure-devops` package.

## Reference

See `docs/technical/AZURE_DEVOPS_TECHNICAL.md` for detailed implementation.
See `docs/documentation/AZURE_DEVOPS_ADMIN.md` for user-facing documentation.

## CLI Usage

Binary: `mcp-ado-admin-cli`

```bash
# List pipelines
mcp-ado-admin-cli pipeline list MyProject

# List agent pools
mcp-ado-admin-cli pipeline get MyProject 123

# List all projects
mcp-ado-admin-cli project list

# Create a project
mcp-ado-admin-cli project create "New Project" -d "Description" --process Scrum
```
