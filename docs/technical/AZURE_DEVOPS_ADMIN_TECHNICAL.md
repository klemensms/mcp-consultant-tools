# Azure DevOps Admin - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/AZURE_DEVOPS_ADMIN.md -->

<overview>

**Package:** `@mcp-consultant-tools/azure-devops-admin`
**Binary (MCP):** `mcp-ado-admin`
**Binary (CLI):** `mcp-ado-admin-cli`
**Total tools:** 66 (30 read-only + 26 upsert + 10 delete)
**Prompts:** None
**Related package:** `@mcp-consultant-tools/azure-devops` (wikis, work items, pull requests)

This package provides Azure DevOps admin operations across eight domains: pipelines, service connections, variable groups, agent pools, environments, classification nodes (iterations and areas), artifact feeds, and projects.

</overview>

<architecture>

<layers>

1. **AdminClient** (`services/admin-client.ts`) — Axios-based HTTP client. Provides `makeRequest()`, `validateProject()`, `validateFeed()`, and `formatDateForAdo()`. Handles 401/403/404 error translation.
2. **Services** (`services/`) — One class per domain. All business logic lives here.
3. **Tools** (`tools/`) — Thin MCP wrappers. Each tool file returns `{ readonly, upsert, delete }` counts for startup logging.
4. **CLI** (`cli/`) — Commander.js commands. One file per domain under `cli/commands/`. Reuses the same ServiceContext.

</layers>

<service-context>

`ServiceContext` is defined in `types.ts` with lazy getters:

```typescript
export interface ServiceContext {
  readonly client: AdminClient;
  readonly pipelines: PipelineService;
  readonly serviceConnections: ServiceConnectionService;
  readonly variableGroups: VariableGroupService;
  readonly agentPools: AgentPoolService;
  readonly environments: EnvironmentService;
  readonly classification: ClassificationService;
  readonly artifactFeeds: ArtifactFeedService;
  readonly projects: ProjectService;
  readonly tierFlags: TierFlags;
}
```

`tierFlags` is read from environment variables at startup and does not change. Tools conditionally register themselves at startup: if a flag is `false`, the corresponding tool is never registered with the MCP server.

</service-context>

<tier-model>

The three-tier permission model is enforced at tool registration time, not at request time:

| Tier | Count | Condition | Purpose |
|------|-------|-----------|---------|
| Tier 1 — Read-Only | 30 | Always registered | View resources |
| Tier 2 — Upsert | 26 | Requires `_UPSERT=true` flag | Create and update |
| Tier 3 — Delete/Disable | 10 | Requires `_DELETE=true` or `_DISABLE=true` flag | Destructive operations |

Each resource category has its own independent flag pair. Enabling pipelines upsert does not enable environments upsert.

</tier-model>

<directory-structure>

```
packages/azure-devops-admin/src/
  index.ts                            # MCP entry point + createServiceContext()
  context-factory.ts                  # Shared factory for CLI
  types.ts                            # ServiceContext, AzureDevOpsAdminConfig, TierFlags
  tool-examples.ts                    # descWithExamples re-export + domain examples
  cli.ts                              # CLI entry point
  services/
    admin-client.ts                   # HTTP client
    pipeline-service.ts               # Pipeline + build operations
    service-connection-service.ts     # Service connection operations
    variable-group-service.ts         # Variable group operations
    agent-pool-service.ts             # Agent pool + agent operations
    environment-service.ts            # Environment + check operations
    classification-service.ts         # Iteration + area operations
    artifact-feed-service.ts          # Artifact feed operations
    project-service.ts                # Project CRUD (org-scoped)
    index.ts                          # Barrel export
  tools/
    pipeline-tools.ts                 # 8 readonly + 7 upsert + 1 delete = 16 tools
    service-connection-tools.ts       # 3 readonly + 3 upsert + 1 delete = 7 tools
    variable-group-tools.ts           # 2 readonly + 3 upsert + 2 delete = 7 tools
    agent-pool-tools.ts               # 4 readonly + 2 upsert + 1 delete = 7 tools
    environment-tools.ts              # 4 readonly + 4 upsert + 2 delete = 10 tools
    classification-tools.ts           # 4 readonly + 5 upsert + 2 delete = 11 tools
    artifact-feed-tools.ts            # 2 readonly only = 2 tools
    project-tools.ts                  # 3 readonly + 2 upsert + 1 delete = 6 tools
    index.ts                          # registerAllTools() aggregator
  cli/
    output.ts                         # outputResult() wrapper
    commands/
      pipeline-commands.ts            # alias: pl
      environment-commands.ts         # alias: env
      service-connection-commands.ts  # alias: svc
      variable-group-commands.ts      # alias: vg
      agent-pool-commands.ts          # alias: pool
      classification-commands.ts      # alias: it (iterations), ar (areas)
      artifact-feed-commands.ts       # alias: feed
      project-commands.ts             # alias: p
      index.ts                        # registerAllCommands()
```

</directory-structure>

</architecture>

<authentication>

- **Method:** HTTP Basic auth using Personal Access Token (PAT)
- **Header format:** `Basic base64(:<PAT>)` (empty username, PAT as password)
- **Base URL:** `https://dev.azure.com/{organization}`
- **Feeds URL:** `https://feeds.dev.azure.com/{organization}` (used only for artifact feed tools)
- **API Version:** Configurable via `AZUREDEVOPS_API_VERSION`, defaults to `7.1`

**Required PAT scopes by operation tier:**
- Tier 1 (read-only): `Build (read)`, `Release (read)`, `Service Connections (read)`, `Agent Pools (read)`, `Environment (read)`, `Project and Team (read)`
- Tier 2 (upsert): Add `Build (read, execute)`, `Service Connections (read, query, manage)`, `Variable Groups (read, create, manage)`, `Agent Pools (read, manage)`, `Environment (read, manage)`
- Tier 3 (delete): Same as Tier 2 plus deletion permissions

</authentication>

<environment-variables>

<required>

| Variable | Description |
|----------|-------------|
| `AZUREDEVOPS_ORGANIZATION` | Organization name only — not the full URL (e.g., `mycompany`, not `https://dev.azure.com/mycompany`) |
| `AZUREDEVOPS_PAT` | Personal Access Token |
| `AZUREDEVOPS_PROJECTS` | Comma-separated list of allowed project names. Use `*` to allow all projects. |

</required>

<optional>

| Variable | Default | Description |
|----------|---------|-------------|
| `AZUREDEVOPS_API_VERSION` | `7.1` | Azure DevOps REST API version |
| `AZUREDEVOPS_FEEDS` | (empty = all) | Comma-separated feed allowlist for artifact tools |

</optional>

<feature-flags>

All flags default to `false`. Set to the string `"true"` to enable.

| Flag | Enables |
|------|---------|
| `AZUREDEVOPS_ENABLE_PIPELINE_UPSERT` | `create-pipeline`, `update-pipeline`, `rename-pipeline`, `queue-build`, `cancel-build`, `retry-build`, `approve-stage` |
| `AZUREDEVOPS_ENABLE_PIPELINE_DELETE` | `delete-pipeline` |
| `AZUREDEVOPS_ENABLE_SERVICE_CONN_UPSERT` | `create-svc-conn`, `update-svc-conn`, `share-svc-conn` |
| `AZUREDEVOPS_ENABLE_SERVICE_CONN_DELETE` | `delete-svc-conn` |
| `AZUREDEVOPS_ENABLE_VARIABLE_GROUP_UPSERT` | `create-variable-group`, `update-variable-group`, `set-variable` |
| `AZUREDEVOPS_ENABLE_VARIABLE_GROUP_DELETE` | `remove-variable`, `delete-variable-group` |
| `AZUREDEVOPS_ENABLE_AGENT_POOL_UPSERT` | `update-agent-pool`, `enable-agent` |
| `AZUREDEVOPS_ENABLE_AGENT_POOL_DISABLE` | `disable-agent` |
| `AZUREDEVOPS_ENABLE_ENVIRONMENT_UPSERT` | `create-environment`, `update-environment`, `create-env-check`, `update-env-check` |
| `AZUREDEVOPS_ENABLE_ENVIRONMENT_DELETE` | `delete-environment`, `delete-env-check` |
| `AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT` | `create-iteration`, `update-iteration`, `create-area`, `update-area`, `add-iteration-to-team` |
| `AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_DELETE` | `delete-iteration`, `delete-area` |
| `AZUREDEVOPS_ENABLE_PROJECT_UPSERT` | `create-project`, `update-project` |
| `AZUREDEVOPS_ENABLE_PROJECT_DELETE` | `delete-project` |

</feature-flags>

</environment-variables>

<tool-reference>

<domain name="pipelines">

**16 tools total: 8 read-only + 7 upsert + 1 delete**

Note: `get-build-status`, `get-build-timeline`, and `get-build-logs` are duplicated in the `@mcp-consultant-tools/azure-devops` package for developer access. If these tools are updated here, the counterparts in `packages/azure-devops/` must also be updated.

<tool-group name="read-only">

<tool name="list-pipelines">

Lists all YAML pipeline definitions in a project. Returns id, name, path, repository info, and YAML filename for each pipeline.

**Parameters:**
- `project` (string, required) — Project name

</tool>

<tool name="get-pipeline-definition">

Gets detailed pipeline config including triggers, variables (secrets masked as `***SECRET***`), queue settings, and repository info.

**Parameters:**
- `project` (string, required) — Project name
- `definitionId` (number, required) — Pipeline definition ID

</tool>

<tool name="get-pipeline-yaml">

Gets the raw YAML content for a pipeline. For non-Azure-Repos pipelines (GitHub/GHE), returns metadata and a message indicating the YAML is external.

**Parameters:**
- `project` (string, required) — Project name
- `definitionId` (number, required) — Pipeline definition ID

**Behavior:** If `repository.type !== 'TfsGit'`, returns location metadata instead of content and includes a message directing to the external repository URL.

</tool>

<tool name="list-pipeline-runs">

Lists recent pipeline runs. Returns build ID, buildNumber, status, result, branch, timestamps, requestedBy, and reason.

**Parameters:**
- `project` (string, required) — Project name
- `definitionId` (number, required) — Pipeline definition ID
- `top` (number, optional) — Max results, default 10

</tool>

<tool name="get-build-status">

Gets build status with configurable detail. Combines basic status, optional timeline, and optional logs in one call.

**Parameters:**
- `project` (string, required) — Project name
- `buildId` (number, required) — Build ID
- `detail` (enum, optional) — `summary` (default), `timeline`, `full`
- `timelineScope` (enum, optional) — `problems` (default), `stages`, `jobs`, `all`
- `maxIssues` (number, optional) — Max issues per record, default 5

**detail behavior:**
- `summary`: Basic status fields only
- `timeline`: Basic status + timeline records filtered by `timelineScope`
- `full`: Basic status + timeline + log listing

</tool>

<tool name="get-build-timeline">

Gets step-by-step build breakdown. Always includes summary stats (totalErrors, totalWarnings, failed list) regardless of scope.

**Parameters:**
- `project` (string, required) — Project name
- `buildId` (number, required) — Build ID
- `scope` (enum, optional) — `problems` (default, only errors/warnings/failed), `stages`, `jobs`, `all`
- `maxIssues` (number, optional) — Max issues per record, prioritizes errors over warnings, default 5

**scope behavior:**
- `problems`: Records with errorCount > 0, warningCount > 0, or result = failed/canceled
- `stages`: Only Stage-type records
- `jobs`: Stage and Job type records
- `all`: All records including tasks

</tool>

<tool name="get-build-logs">

Lists available logs or retrieves content of a specific log with noise filtering.

**Parameters:**
- `project` (string, required) — Project name
- `buildId` (number, required) — Build ID
- `logId` (number, optional) — Specific log ID; omit to get the listing
- `mode` (enum, optional) — `summary` (default, filters progress indicators), `full`, `errors` (only error/warning lines)

**Log filtering (mode=summary):** Strips git progress lines matching patterns: `Counting objects:`, `Compressing objects:`, `Receiving objects:`, `Resolving deltas:`, `Unpacking objects:`, `Updating files:`.

**Log filtering (mode=errors):** Keeps only lines matching: `##[error]`, `##[warning]`, `error:`, `failed`, `exception`, `fatal`.

</tool>

<tool name="list-pending-approvals">

Finds approval checkpoints for a build by reading its timeline, then fetches approval details including assignedApprovers, status, and instructions.

**Parameters:**
- `project` (string, required) — Project name
- `buildId` (number, required) — Build ID

**Implementation:** Reads timeline to find `Checkpoint.Approval` records, then calls `/pipelines/approvals?approvalIds=...&$expand=steps`.

</tool>

</tool-group>

<tool-group name="upsert" requires="AZUREDEVOPS_ENABLE_PIPELINE_UPSERT=true">

<tool name="create-pipeline">

Creates a new YAML pipeline definition. Supports three repository types.

**Parameters:**
- `project` (string, required)
- `name` (string, required) — Pipeline display name
- `yamlPath` (string, required) — Path to YAML file in repo (e.g., `azure-pipelines.yml`)
- `repositoryId` (string, required) — GUID for Azure Repos; `org/repo` format for GitHub
- `folder` (string, optional) — Folder path, default `\` (root). Use backslash-delimited paths.
- `repositoryType` (enum, optional) — `TfsGit` (default), `GitHub`, `GitHubEnterprise`
- `repositoryUrl` (string, optional) — Required for GitHub/GHE (e.g., `https://github.com/org/repo.git`)
- `defaultBranch` (string, optional) — Required for GitHub/GHE. Accepts `main` or `refs/heads/main` (auto-normalized)
- `serviceConnectionId` (string, optional) — Required for GitHub/GHE. GUID from `list-svc-conns`.

**Validation:** For non-`TfsGit` types, throws if `repositoryUrl` or `serviceConnectionId` is missing.

<example name="azure-repos">

```json
{
  "project": "MyProject",
  "name": "build-pipeline",
  "repositoryId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "yamlPath": "azure-pipelines.yml"
}
```

</example>

<example name="github-enterprise">

```json
{
  "project": "MyProject",
  "name": "ghe-build-pipeline",
  "repositoryId": "myorg/my-repo",
  "repositoryType": "GitHubEnterprise",
  "repositoryUrl": "https://github.mycompany.com/myorg/my-repo.git",
  "defaultBranch": "main",
  "serviceConnectionId": "0c7953fa-6eef-4025-9d4a-7dd3c5035710",
  "yamlPath": "pipelines/build.yml",
  "folder": "\\Builds"
}
```

</example>

</tool>

<tool name="update-pipeline">

Updates a pipeline definition. Fetches current definition first, merges updates, and PUTs back.

**Parameters:**
- `project` (string, required)
- `definitionId` (number, required)
- `name` (string, optional) — New name
- `path` (string, optional) — New folder path
- `queueStatus` (enum, optional) — `enabled`, `disabled`, `paused`
- `variables` (object, optional) — Record of `{ value, isSecret?, allowOverride? }`

</tool>

<tool name="rename-pipeline">

Renames a pipeline. Thin wrapper over `update-pipeline` with only `name` set.

**Parameters:**
- `project` (string, required)
- `definitionId` (number, required)
- `newName` (string, required)

</tool>

<tool name="queue-build">

Queues a new build run.

**Parameters:**
- `project` (string, required)
- `definitionId` (number, required)
- `branch` (string, optional) — Source branch (e.g., `refs/heads/main`)
- `variables` (object, optional) — Runtime variables as `Record<string, string>`; serialized to `parameters` field
- `parameters` (object, optional) — Template parameters for YAML pipelines; sent as `templateParameters`

</tool>

<tool name="cancel-build">

Requests cancellation of a running build by PATCHing status to `cancelling`.

**Parameters:**
- `project` (string, required)
- `buildId` (number, required)

**Note:** The build finishes its current task before stopping.

</tool>

<tool name="retry-build">

Retries a failed build. Fetches original build's `definition.id` and `sourceBranch`, then calls `queue-build` with those values.

**Parameters:**
- `project` (string, required)
- `buildId` (number, required) — The failed build ID

</tool>

<tool name="approve-stage">

Approves or rejects a pipeline stage gate. Use `list-pending-approvals` to find the `approvalId`.

**Parameters:**
- `project` (string, required)
- `approvalId` (string, required) — GUID from `list-pending-approvals`
- `status` (enum, required) — `approved` or `rejected`
- `comment` (string, optional)

**Implementation:** PATCH to `/pipelines/approvals` with body `[{ approvalId, status, comment }]`.

</tool>

</tool-group>

<tool-group name="delete" requires="AZUREDEVOPS_ENABLE_PIPELINE_DELETE=true">

<tool name="delete-pipeline">

Permanently deletes a pipeline definition. Cannot be undone.

**Parameters:**
- `project` (string, required)
- `definitionId` (number, required)

</tool>

</tool-group>

</domain>

<domain name="service-connections">

**7 tools total: 3 read-only + 3 upsert + 1 delete**

<tool-group name="read-only">

<tool name="list-svc-conns">

Lists all service connections in a project. Credentials are masked.

**Parameters:**
- `project` (string, required)

</tool>

<tool name="get-svc-conn">

Gets detailed connection configuration including type, URL, authorization scheme, data fields, and project references. Secrets masked.

**Parameters:**
- `project` (string, required)
- `connectionId` (string, required) — GUID

</tool>

<tool name="get-svc-conn-types">

Lists all available service connection types with authentication schemes and configuration options. Takes no parameters.

</tool>

</tool-group>

<tool-group name="upsert" requires="AZUREDEVOPS_ENABLE_SERVICE_CONN_UPSERT=true">

<tool name="create-svc-conn">

Creates a new service connection. Use `get-svc-conn-types` to discover valid types and auth schemes.

**Parameters:**
- `project` (string, required)
- `name` (string, required)
- `type` (string, required) — Common values: `AzureRM`, `GitHub`, `npm`, `NuGet`, `Docker`
- `url` (string, optional) — Service URL (required for some types)
- `description` (string, optional)
- `authorization` (object, optional) — `{ scheme: string, parameters?: Record<string, string> }`
- `data` (object, optional) — Type-specific configuration as `Record<string, string>`

</tool>

<tool name="update-svc-conn">

Updates connection metadata. Cannot update credentials for security reasons.

**Parameters:**
- `project` (string, required)
- `connectionId` (string, required) — GUID
- `name` (string, optional)
- `description` (string, optional)
- `url` (string, optional)
- `data` (object, optional) — Updated data fields

</tool>

<tool name="share-svc-conn">

Shares a service connection with additional projects.

**Parameters:**
- `connectionId` (string, required) — GUID
- `projectIds` (string[], required) — Array of project ID GUIDs

</tool>

</tool-group>

<tool-group name="delete" requires="AZUREDEVOPS_ENABLE_SERVICE_CONN_DELETE=true">

<tool name="delete-svc-conn">

Permanently deletes a service connection. Pipelines using this connection will fail.

**Parameters:**
- `project` (string, required)
- `connectionId` (string, required) — GUID

</tool>

</tool-group>

</domain>

<domain name="variable-groups">

**7 tools total: 2 read-only + 3 upsert + 2 delete**

Note: Read-only variable group operations in the main `azure-devops` package (`list-variable-groups`, `get-variable-group`) are separate tools. This package includes read operations as well under `get-variable-groups` and `get-variable-group`.

<tool-group name="read-only">

<tool name="get-variable-groups">

Lists all variable groups in a project with variable names (secrets masked).

**Parameters:**
- `project` (string, required)

</tool>

<tool name="get-variable-group">

Gets a specific variable group by ID with all variables (secrets masked).

**Parameters:**
- `project` (string, required)
- `groupId` (number, required)

</tool>

</tool-group>

<tool-group name="upsert" requires="AZUREDEVOPS_ENABLE_VARIABLE_GROUP_UPSERT=true">

<tool name="create-variable-group">

Creates a new variable group with optional initial variables.

**Parameters:**
- `project` (string, required)
- `name` (string, required)
- `description` (string, optional)
- `variables` (object, optional) — `Record<string, { value: string, isSecret?: boolean }>`

</tool>

<tool name="update-variable-group">

Updates a variable group's name or description only. Use `set-variable` to modify variable values.

**Parameters:**
- `project` (string, required)
- `groupId` (number, required)
- `name` (string, optional)
- `description` (string, optional)

</tool>

<tool name="set-variable">

Sets or creates a variable in a variable group. Creates the variable if it doesn't exist.

**Parameters:**
- `project` (string, required)
- `groupId` (number, required)
- `variableName` (string, required)
- `value` (string, required) — Supports pipeline expressions: `$(var)`, `$[counter('prefix', 0)]`, `$(Build.BuildId)`
- `isSecret` (boolean, optional) — Mark as secret, default false

</tool>

</tool-group>

<tool-group name="delete" requires="AZUREDEVOPS_ENABLE_VARIABLE_GROUP_DELETE=true">

<tool name="remove-variable">

Removes a single variable from a variable group.

**Parameters:**
- `project` (string, required)
- `groupId` (number, required)
- `variableName` (string, required)

</tool>

<tool name="delete-variable-group">

Permanently deletes a variable group. Pipelines using this group will fail.

**Parameters:**
- `project` (string, required)
- `groupId` (number, required)

</tool>

</tool-group>

</domain>

<domain name="agent-pools">

**7 tools total: 4 read-only + 2 upsert + 1 delete**

<tool-group name="read-only">

<tool name="list-agent-pools">

Lists all agent pools in the organization. Returns pool type, size, hosted status, and auto-provision settings.

**Parameters:**
- `poolType` (enum, optional) — `automation` (build/release pipelines) or `deployment` (environment deployment groups)

</tool>

<tool name="get-agent-pool">

Gets detailed pool configuration including auto-provision, auto-update, auto-size settings, and owner information.

**Parameters:**
- `poolId` (number, required)

</tool>

<tool name="list-agents">

Lists all agents in a pool with name, version, OS, enabled status, and online/offline status.

**Parameters:**
- `poolId` (number, required)
- `includeCapabilities` (boolean, optional) — Include system and user capabilities, default false

</tool>

<tool name="get-agent">

Gets detailed agent information including capabilities, current assignment, and last completed request.

**Parameters:**
- `poolId` (number, required)
- `agentId` (number, required)

</tool>

</tool-group>

<tool-group name="upsert" requires="AZUREDEVOPS_ENABLE_AGENT_POOL_UPSERT=true">

<tool name="update-agent-pool">

Updates pool settings.

**Parameters:**
- `poolId` (number, required)
- `autoProvision` (boolean, optional) — Auto-provision pool to new projects
- `autoUpdate` (boolean, optional) — Auto-update agents
- `autoSize` (boolean, optional) — Auto-size pool based on demand
- `targetSize` (number, optional) — Target pool size for auto-scaling

</tool>

<tool name="enable-agent">

Enables a disabled agent so it accepts new jobs.

**Parameters:**
- `poolId` (number, required)
- `agentId` (number, required)

</tool>

</tool-group>

<tool-group name="delete" requires="AZUREDEVOPS_ENABLE_AGENT_POOL_DISABLE=true">

<tool name="disable-agent">

Disables an agent. It will complete its current job then stop accepting new jobs.

**Parameters:**
- `poolId` (number, required)
- `agentId` (number, required)

</tool>

</tool-group>

</domain>

<domain name="environments">

**10 tools total: 4 read-only + 4 upsert + 2 delete**

<tool-group name="read-only">

<tool name="list-environments">

Lists all deployment environments in a project with name, description, and modification info.

**Parameters:**
- `project` (string, required)

</tool>

<tool name="get-environment">

Gets detailed environment configuration including associated resources (Kubernetes, VMs).

**Parameters:**
- `project` (string, required)
- `environmentId` (number, required)

</tool>

<tool name="get-env-deployments">

Gets deployment history for an environment including pipeline, owner, timestamps, and result.

**Parameters:**
- `project` (string, required)
- `environmentId` (number, required)
- `top` (number, optional) — Max results, default 10

</tool>

<tool name="get-env-checks">

Gets all checks configured on an environment (approvals, business hours, branch control, etc.).

**Parameters:**
- `project` (string, required)
- `environmentId` (number, required)

</tool>

</tool-group>

<tool-group name="upsert" requires="AZUREDEVOPS_ENABLE_ENVIRONMENT_UPSERT=true">

<tool name="create-environment">

Creates a new deployment environment.

**Parameters:**
- `project` (string, required)
- `name` (string, required) — Common values: `Production`, `Staging`, `Development`, `QA`
- `description` (string, optional)

</tool>

<tool name="update-environment">

Updates an environment's name or description.

**Parameters:**
- `project` (string, required)
- `environmentId` (number, required)
- `name` (string, optional)
- `description` (string, optional)

</tool>

<tool name="create-env-check">

Adds a check (approval, business hours, branch control, etc.) to an environment.

**Parameters:**
- `project` (string, required)
- `environmentId` (number, required)
- `checkType` (enum, required) — `Approval`, `BusinessHours`, `BranchControl`, `InvokeRESTAPI`, `InvokeAzureFunction`, `ExclusiveLock`, `RequiredTemplate`
- `settings` (any, required) — Check-specific configuration (see below)
- `timeout` (number, optional) — Timeout in minutes, default 43200 (30 days)

**settings by checkType:**

```
Approval:       { approvers: [{ id: 'user-guid' }], minRequiredApprovers: 1, instructions: '...' }
BusinessHours:  { businessHours: { startTime: '09:00', endTime: '17:00', timeZoneId: 'UTC' } }
BranchControl:  { allowedBranches: ['refs/heads/main'] }
InvokeRESTAPI:  { method: 'POST', url: 'https://...', headers: {...} }
ExclusiveLock:  {}
```

</tool>

<tool name="update-env-check">

Updates an existing check's settings or timeout.

**Parameters:**
- `project` (string, required)
- `checkId` (number, required) — Check configuration ID from `get-env-checks`
- `settings` (any, optional) — Updated check-specific settings
- `timeout` (number, optional) — Updated timeout in minutes

</tool>

</tool-group>

<tool-group name="delete" requires="AZUREDEVOPS_ENABLE_ENVIRONMENT_DELETE=true">

<tool name="delete-environment">

Permanently deletes a deployment environment. Pipelines targeting this environment will fail.

**Parameters:**
- `project` (string, required)
- `environmentId` (number, required)

</tool>

<tool name="delete-env-check">

Removes a check from an environment. Get the check ID from `get-env-checks`.

**Parameters:**
- `project` (string, required)
- `checkId` (number, required)

</tool>

</tool-group>

</domain>

<domain name="classification-nodes">

**11 tools total: 4 read-only + 5 upsert + 2 delete**

Classification nodes are iterations (sprints) and areas. Both use the same underlying `ClassificationService` with a `structureType` parameter (`iterations` or `areas`).

<tool-group name="read-only">

<tool name="list-iterations">

Lists all iterations (sprints) with their hierarchy, dates, and time frame. Returns a flattened list with full paths.

**Parameters:**
- `project` (string, required)
- `depth` (number, optional) — Hierarchy depth to traverse, default 10

</tool>

<tool name="get-iteration">

Gets a specific iteration by path including start/finish dates and time frame.

**Parameters:**
- `project` (string, required)
- `path` (string, required) — Use backslash for hierarchy: `Sprint 1` or `Release 1\Sprint 1`

</tool>

<tool name="list-areas">

Lists all area paths with their hierarchy. Returns a flattened list with full paths.

**Parameters:**
- `project` (string, required)
- `depth` (number, optional) — Hierarchy depth to traverse, default 10

</tool>

<tool name="get-area">

Gets a specific area path.

**Parameters:**
- `project` (string, required)
- `path` (string, required) — Use backslash for hierarchy: `Backend` or `Product\Backend`

</tool>

</tool-group>

<tool-group name="upsert" requires="AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT=true">

<tool name="create-iteration">

Creates a new iteration with optional dates and optional team subscription. If `team` is provided, the iteration is automatically subscribed to that team's sprint view in the same operation.

**Parameters:**
- `project` (string, required)
- `name` (string, required) — e.g., `Sprint 1`
- `parentPath` (string, optional) — Parent path to create under; omit for root
- `startDate` (string, optional) — ISO format: `2024-01-01` (auto-converted to `2024-01-01T00:00:00Z`)
- `finishDate` (string, optional) — ISO format: `2024-01-14`
- `team` (string, optional) — Team name; if provided, calls `addIterationToTeam` after creation

</tool>

<tool name="update-iteration">

Updates an iteration's name or dates.

**Parameters:**
- `project` (string, required)
- `path` (string, required) — Iteration path
- `name` (string, optional)
- `startDate` (string, optional)
- `finishDate` (string, optional)

</tool>

<tool name="create-area">

Creates a new area path.

**Parameters:**
- `project` (string, required)
- `name` (string, required)
- `parentPath` (string, optional) — Parent area path; omit for root

</tool>

<tool name="update-area">

Renames an area path.

**Parameters:**
- `project` (string, required)
- `path` (string, required) — Area path to rename
- `name` (string, required) — New name

</tool>

<tool name="add-iteration-to-team">

Subscribes an existing iteration to a team's sprint planning view.

**Parameters:**
- `project` (string, required)
- `team` (string, required) — Team name
- `iterationId` (string, required) — Iteration identifier GUID (the `identifier` field from `create-iteration` or `get-iteration`)

**Note:** `iterationId` is a GUID, not the iteration path.

</tool>

</tool-group>

<tool-group name="delete" requires="AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_DELETE=true">

<tool name="delete-iteration">

Deletes an iteration. Work items in this iteration are reclassified to the target iteration.

**Parameters:**
- `project` (string, required)
- `path` (string, required) — Iteration path
- `reclassifyId` (number, required) — ID of the iteration to move work items to (from `list-iterations`)

</tool>

<tool name="delete-area">

Deletes an area path. Work items in this area are reclassified to the target area.

**Parameters:**
- `project` (string, required)
- `path` (string, required) — Area path
- `reclassifyId` (number, required) — ID of the area to move work items to (from `list-areas`)

</tool>

</tool-group>

</domain>

<domain name="artifact-feeds">

**2 tools total: 2 read-only only**

Feed access is validated against the `AZUREDEVOPS_FEEDS` allowlist. The API uses a different base URL: `https://feeds.dev.azure.com/{organization}`.

<tool-group name="read-only">

<tool name="list-feed-packages">

Lists packages in an Azure Artifacts feed with optional filtering. Returns package names, latest versions, and publish dates.

**Parameters:**
- `feedName` (string, required) — Feed name (e.g., `Acme`)
- `project` (string, optional) — For project-scoped feeds; omit for org-scoped
- `namePrefix` (string, optional) — Filter by name prefix (e.g., `pp-solution-`)
- `packageType` (enum, optional) — `nuget`, `npm`, `maven`, `upack`, `pypi`
- `top` (number, optional) — Max results, default 50

</tool>

<tool name="get-package-versions">

Gets version history for a specific package, sorted by publish date.

**Parameters:**
- `feedName` (string, required)
- `packageName` (string, required) — Full package name
- `project` (string, optional) — For project-scoped feeds
- `packageType` (enum, optional) — Protocol type hint for faster lookup
- `top` (number, optional) — Max versions, default 10
- `includeDelisted` (boolean, optional) — Include deprecated versions, default false

<example name="find-latest-for-deployment">

```
1. list-feed-packages: feedName="Acme", namePrefix="pp-solution-"
2. get-package-versions: feedName="Acme", packageName="pp-solution-core"
3. queue-build: use the latest version as a template parameter
```

</example>

</tool>

</tool-group>

</domain>

<domain name="projects">

**6 tools total: 3 read-only + 2 upsert + 1 delete**

Project tools operate at the organization scope. They do NOT take a `project` parameter for access control and are NOT restricted by the `AZUREDEVOPS_PROJECTS` allowlist.

<tool-group name="read-only">

<tool name="list-projects">

Lists all projects in the organization.

**Parameters:**
- `stateFilter` (string, optional) — `all`, `wellFormed` (default), `createPending`, `deleting`
- `top` (number, optional) — Max results
- `skip` (number, optional) — For pagination

</tool>

<tool name="get-project">

Gets detailed project information including version control type and process template.

**Parameters:**
- `projectId` (string, required) — Project name or GUID

</tool>

<tool name="get-project-properties">

Gets extended project properties (process template ID, system capabilities).

**Parameters:**
- `projectId` (string, required) — Project name or GUID

</tool>

</tool-group>

<tool-group name="upsert" requires="AZUREDEVOPS_ENABLE_PROJECT_UPSERT=true">

<tool name="create-project">

Creates a new Azure DevOps project. Polls the operation status until complete (typically 5–30 seconds).

**Parameters:**
- `name` (string, required) — Must be unique in the organization
- `description` (string, optional)
- `visibility` (string, optional) — `private` (default) or `public`
- `processTemplate` (string, optional) — `Agile` (default), `Scrum`, `Basic`, `CMMI`
- `versionControl` (string, optional) — `Git` (default) or `Tfvc`

</tool>

<tool name="update-project">

Updates a project's name and/or description.

**Parameters:**
- `projectId` (string, required) — Project name or GUID
- `name` (string, optional)
- `description` (string, optional)

</tool>

</tool-group>

<tool-group name="delete" requires="AZUREDEVOPS_ENABLE_PROJECT_DELETE=true">

<tool name="delete-project">

Permanently deletes a project and all its data. Cannot be undone. Polls until the operation completes.

**Parameters:**
- `projectId` (string, required) — Project name or GUID

</tool>

</tool-group>

</domain>

</tool-reference>

<error-handling>

<http-errors>

The `AdminClient.makeRequest()` translates HTTP errors:

| HTTP Status | Error Message |
|------------|---------------|
| 401 | "Azure DevOps authentication failed. Please check your PAT token and permissions." |
| 403 | "Azure DevOps access denied: {detail or default message}" |
| 404 | "Azure DevOps resource not found: {endpoint}" |
| Other | "Azure DevOps Admin API request failed: {message} - {response data}" |

</http-errors>

<project-validation>

`validateProject()` runs before every project-scoped operation:
- If `AZUREDEVOPS_PROJECTS` includes `*`, all projects are allowed
- Otherwise, throws: `"Project '{name}' is not in the allowed projects list. Allowed projects: {list}"`

</project-validation>

<feed-validation>

`validateFeed()` runs before every artifact feed operation:
- If `AZUREDEVOPS_FEEDS` is empty or undefined, all feeds are allowed
- Otherwise, throws: `"Feed '{name}' is not in the allowed feeds list. Allowed feeds: {list}"`

</feed-validation>

<tool-error-pattern>

All tool catch blocks return a text content response (not `isError: true`) for most domains, except project tools which use `isError: true`. All errors are also logged to stderr via `console.error`.

</tool-error-pattern>

</error-handling>

<cli-architecture>

The CLI reuses the same `ServiceContext` and service classes as the MCP server. `context-factory.ts` provides `createServiceContext()` identical to `index.ts` but used solely by the CLI entry point.

**Binary:** `mcp-ado-admin-cli`
**Global flags:** `--json` (raw JSON output), `--no-cache` (skip cache files), `--env-file <path>` (custom .env file)
**Output:** Summary to stdout + JSON cached to `.context/.mcp-ado-admin-cache/`

<command-groups>

| Command Group | Alias | Sub-commands |
|---------------|-------|-------------|
| `pipeline` | `pl` | `list`, `get`, `yaml`, `runs`, `approvals`, `create`, `update`, `rename`, `delete`, `queue`, `build-status`, `build-timeline`, `build-logs`, `cancel`, `retry`, `approve` |
| `environment` | `env` | `list`, `get`, `deployments`, `checks`, `create`, `update`, `create-check`, `update-check`, `delete`, `delete-check` |
| `svc-conn` | `svc` | `list`, `get`, `types`, `create`, `update`, `share`, `delete` |
| `var-group` | `vg` | `list`, `get`, `create`, `update`, `set-var`, `remove-var`, `delete` |
| `pool` | (alias) | `list`, `get`, `agents`, `agent`, `update`, `enable`, `disable` |
| `iteration` | `it` | `list`, `get`, `create`, `update`, `delete`, `add-to-team` |
| `area` | `ar` | `list`, `get`, `create`, `update`, `delete` |
| `feed` | (alias) | `list-packages`, `package-versions` |
| `project` | `p` | `list`, `get`, `properties`, `create`, `update`, `delete` |

</command-groups>

<cli-examples>

```bash
# Pipeline operations
mcp-ado-admin-cli pipeline list MyProject
mcp-ado-admin-cli pipeline get MyProject 123
mcp-ado-admin-cli pipeline yaml MyProject 123
mcp-ado-admin-cli pipeline runs MyProject 123 --top 20
mcp-ado-admin-cli pipeline build-status MyProject 5678 --detail timeline --scope problems
mcp-ado-admin-cli pipeline build-logs MyProject 5678 --log-id 3 --mode errors
mcp-ado-admin-cli pipeline queue MyProject 123 --branch refs/heads/main
mcp-ado-admin-cli pipeline approve MyProject abc-guid-123 approved --comment "LGTM"

# Environment operations
mcp-ado-admin-cli environment list MyProject
mcp-ado-admin-cli environment checks MyProject 5

# Service connections
mcp-ado-admin-cli svc-conn list MyProject
mcp-ado-admin-cli --json svc-conn list MyProject

# Variable groups
mcp-ado-admin-cli var-group list MyProject
mcp-ado-admin-cli var-group set-var MyProject 42 MY_VAR "new-value"
mcp-ado-admin-cli var-group set-var MyProject 42 MY_SECRET "secret-val" --secret

# Agent pools
mcp-ado-admin-cli pool list
mcp-ado-admin-cli pool list --pool-type automation
mcp-ado-admin-cli pool agents 7

# Iterations
mcp-ado-admin-cli iteration list MyProject
mcp-ado-admin-cli iteration create MyProject "Sprint 5" --start-date 2024-03-01 --finish-date 2024-03-14
mcp-ado-admin-cli iteration delete MyProject "Sprint 1" 42

# Areas
mcp-ado-admin-cli area create MyProject "Backend" --parent-path "Platform"

# Artifact feeds
mcp-ado-admin-cli feed list-packages Acme --name-prefix "pp-solution-"

# Projects
mcp-ado-admin-cli project list
mcp-ado-admin-cli project create "New Project" --process Scrum --description "My new project"
```

</cli-examples>

</cli-architecture>

<security>

- **Secrets masking:** Variable group secrets are masked as `***SECRET***` in all read responses. Service connection credentials are never returned.
- **Tier enforcement:** Write and delete tools are conditionally registered at startup. If a flag is not set, the tool does not exist in the MCP server and cannot be called.
- **Project allowlist:** All project-scoped tools call `validateProject()` before making any API request. Project admin tools are exempt (org-scoped).
- **Feed allowlist:** All artifact feed tools call `validateFeed()` before making requests.
- **No stdout logging:** All diagnostic output uses `console.error()` to avoid corrupting the MCP stdio transport.

</security>

<usage-patterns>

<pattern name="pipeline-deployment-workflow">

```
1. list-feed-packages (find latest version)
2. get-package-versions (confirm exact version)
3. list-pipelines (find deployment pipeline ID)
4. queue-build (trigger with version as parameter)
5. get-build-status (poll until done)
6. get-build-timeline (scope=problems if failed)
7. get-build-logs (retrieve specific log if needed)
```

</pattern>

<pattern name="environment-approval-workflow">

```
1. list-pending-approvals (get approval ID for a blocked build)
2. approve-stage (approve or reject with comment)
```

</pattern>

<pattern name="sprint-setup-workflow">

```
1. list-iterations (find parent path and reclassify target ID)
2. create-iteration (with startDate, finishDate, and team for auto-subscription)
   OR
2a. create-iteration (without team)
2b. add-iteration-to-team (subscribe separately)
```

</pattern>

</usage-patterns>
