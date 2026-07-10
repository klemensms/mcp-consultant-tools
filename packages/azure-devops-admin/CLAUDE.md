# Azure DevOps Admin Package Guide

## Overview

Azure DevOps admin operations for DevOps engineers managing pipelines, service connections, agent pools, environments, iterations, areas, and projects.

- **Tools:** 75 tools (36 read-only + 29 upsert + 10 delete), 2 prompts
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
| Tier 1 | Read-only (always available) | 36 tools |
| Tier 2 | Create/Update | 29 tools (requires `_UPSERT` flags) |
| Tier 3 | Delete/Disable | 10 tools (requires `_DELETE` flags) |

## Things that will bite you

**Stage-level status does not exist on the Build object.** `last-deploys` walks build timelines. `vsrm.dev.azure.com` (`_apis/release/deployments`) is **Classic Release only** and returns nothing useful for a YAML pipeline; `environmentdeploymentrecords` only sees stages that use the `environment:` keyword. The timeline is the only universal source.

**Timeline record `type` is an untyped string with no published enum.** `last-deploys` compares it case-insensitively against `stage`, and reports `noStageRecordsFound` rather than pretending a stage never deployed.

**Stage names must match case-insensitively, and `succeededWithIssues` is a success.** Strict `===` on the name, or accepting only `succeeded`, makes a deployed stage report as never deployed — and that reads identically to a genuine miss. `availableStageNames` and `searchWindowFull` exist so a miss is diagnosable.

**Build and Pipelines are different REST surfaces with different enums.** `Build.result` has `partiallySucceeded`; the Pipelines API's `RunResult` does not. `BuildStatus` spells it `cancelling`; `RunState` spells it `canceling`. Do not share a constant across the two.

**The packages endpoint returns no total and no continuation token.** `feed-summary` pages with `$top`/`$skip` and sets `packageCountTruncated`. A single unpaged call caps silently and reports the cap as a total.

**A feed that 403s is not an empty feed.** `AdminClient` errors carry `.status` (`getAdoErrorStatus()`); `feed-summary` lists such feeds under `unreadableFeeds` and marks `totalPackagesIsLowerBound`. Any new fan-out across resources must do the same.

**Package provenance is preview-only (`7.1-preview.1`) and exposes no documented build/branch field.** `buildId` and `branch` are best-effort reads of an untyped `data` bag and are `null` when absent — never the string `"unknown"`. Check `structuredProvenanceAvailable`.

**Feeds live on `feeds.dev.azure.com`**, not `pkgs.dev.azure.com` (protocol-specific routes only).

**Pre-existing, deliberately not fixed inside a port commit:** `src/index.ts` carries a duplicate private `createServiceContext()` alongside `context-factory.ts` (same anti-pattern as `azure-sql` and `azure-management`) — a new context field must be added to **both** or the build fails. The tool-category tables below still use the old `admin-` prefixed names for some tools; the registered names are unprefixed.

## Testing

```bash
npm run build --workspace=packages/azure-devops-admin
npm test --workspace=packages/azure-devops-admin   # 42 tests, no live API
```

Services take an injected client, so the suite uses plain stub objects and needs no `vi.mock`.

**Not verified against a live Azure DevOps organisation.** Every REST path and api-version is checked against Microsoft Learn and unit-tested against stubbed clients, but no call in `getLastDeploys`, `getPipelineSummaries`, `getFeedSummaries`, or `getPackageProvenance` has run against a real org. The provenance `data` keys in particular are undocumented and untested against a real feed.

## Tool Categories

### Pipeline Tools (18)
- Read-only: `list-pipelines`, `get-pipeline-definition`, `get-pipeline-yaml`, `list-pipeline-runs`, `get-build-status`*, `get-build-timeline`*, `get-build-logs`*, `list-pending-approvals`, `pipeline-summary`, `last-deploys`
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

### Artifact Feed Tools (4)
- Read-only: `list-feed-packages`, `get-package-versions`, `feed-summary`, `package-provenance`

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

# Pipeline overview and per-stage deploys
mcp-ado-admin-cli pipeline summary MyProject
mcp-ado-admin-cli pipeline last-deploys MyProject --pipeline-id 1234 --param TemplateBranch

# Artifact feeds
mcp-ado-admin-cli feed summary
mcp-ado-admin-cli feed provenance Acme pp-solution-core 1.2.3

# List all projects
mcp-ado-admin-cli project list

# Create a project
mcp-ado-admin-cli project create "New Project" -d "Description" --process Scrum
```
