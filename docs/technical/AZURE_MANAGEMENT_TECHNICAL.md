# Azure Management - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/AZURE_MANAGEMENT.md -->

<overview>

**Package:** `@mcp-consultant-tools/azure-management`
**Binary (MCP):** `mcp-azure-mgmt`
**Binary (CLI):** `mcp-azure-mgmt-cli`
**Tools:** 26 | **Prompts:** 4
**Auth:** Azure AD Service Principal (client credentials)

MCP server and CLI for Azure Resource Manager (ARM) API. Covers resource discovery, Function Apps, App Services (including lifecycle management and config updates), Key Vaults, Storage, SQL, Monitoring, and Networking. Write operations require `AZURE_MGMT_ENABLE_WRITE=true`.

</overview>

<architecture>

## Architecture

The package follows the Service-Tool-Prompt pattern (v28+):

```
index.ts                    # MCP entry point + registerAzureManagementTools()
context-factory.ts          # Shared createServiceContext() for MCP and CLI
AzureManagementService.ts   # Facade: lazy getters for 8 domain services
client/ArmClient.ts         # HTTP client: auth, pagination, retry
auth/AzureAuthProvider.ts   # Token caching for ARM + Key Vault data plane
services/
  ResourceService.ts        # Generic resource and resource graph operations
  FunctionAppService.ts     # Function Apps
  AppServiceService.ts      # App Services and hosting plans
  KeyVaultService.ts        # Key Vaults (ARM management + data plane)
  StorageService.ts         # Storage accounts
  SqlService.ts             # SQL servers and databases
  MonitoringService.ts      # Alert rules, action groups, smart detectors
  NetworkingService.ts      # Front Door, Event Grid
tools/                      # Thin MCP tool wrappers per domain
prompts/                    # 4 MCP prompt registrations
cli/commands/               # Commander.js CLI commands per domain
```

### AzureManagementService (Facade)

`AzureManagementService` holds one `ArmClient` and 8 lazy-initialized domain services. It is the single object shared via `ServiceContext`.

```typescript
interface ServiceContext {
  readonly management: AzureManagementService;
}
```

Domain service accessors on `AzureManagementService`:
- `.resources` → `ResourceService`
- `.functionApps` → `FunctionAppService`
- `.appServices` → `AppServiceService`
- `.keyVaults` → `KeyVaultService`
- `.storage` → `StorageService`
- `.sql` → `SqlService`
- `.monitoring` → `MonitoringService`
- `.networking` → `NetworkingService`

</architecture>

<authentication>

## Authentication

### Service Principal (Client Credentials)

Authentication uses `@azure/identity` `ClientSecretCredential` (OAuth 2.0 client credentials flow).

**Required environment variables:**

| Variable | Description |
|----------|-------------|
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration client secret |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |

**Optional environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `AZURE_RESOURCE_GROUP` | (none) | Default resource group — used when tools omit `resourceGroup` |
| `AZURE_REDACT_SECRETS` | `true` | Redact connection strings and keys in app settings responses |

### Token Caching

`AzureAuthProvider` maintains two separate token caches:

- **ARM token** — scoped to `https://management.azure.com/.default`, cached until 5 minutes before expiry
- **Key Vault token** — scoped to `https://vault.azure.net/.default`, cached per vault URI

When a token nears expiry, a new one is acquired automatically before the next request.

### Required Azure Permissions

**Minimum (read-only access to all tools except keys/secrets):**

| Role | Scope |
|------|-------|
| `Reader` | Subscription or Resource Group |

**Extended permissions (for specific tools):**

| Tool | Required Role | Scope |
|------|--------------|-------|
| `get-function-keys` | `Website Contributor` | Function App |
| `list-key-vault-secrets` | `Key Vault Secrets User` | Key Vault |
| `get-storage-account` with `includeKeys=true` | `Storage Account Key Operator` | Storage Account |

</authentication>

<http-client>

## HTTP Client (ArmClient)

`ArmClient` wraps `axios` for all ARM API communication.

**Base URL:** `https://management.azure.com`
**Timeout:** 60 seconds per request
**Max retries:** 3 (configurable via `AzureManagementConfig.maxRetries`)

### Retry Logic

Retries on HTTP status codes: `429`, `500`, `502`, `503`, `504`

Delay strategy:
- If response includes `Retry-After` header: use that value (in seconds × 1000)
- Otherwise: exponential backoff — `retryDelayMs × 2^attempt` (default `retryDelayMs` = 1000ms)

Each retry is logged to stderr.

### Pagination

`ArmClient.paginate()` follows `nextLink` from ARM list responses until all pages are consumed or `maxResults` is reached. Returns a flat array.

### URL Building

`ArmClient.buildUrl()` automatically appends the correct `api-version` query parameter:
1. Checks if path already contains `api-version=` (skips if true)
2. Tries exact resource type match in `ARM_API_VERSIONS` lookup table
3. Falls back to provider-level match (e.g., `Microsoft.Web` from `Microsoft.Web/sites/slots`)
4. Falls back to `2021-04-01` if no match found

Helper path builders:
- `subscriptionPath(path)` → `/subscriptions/{id}{path}`
- `resourceGroupPath(rg, path)` → `/subscriptions/{id}/resourceGroups/{rg}{path}`
- `resourcePath(resourceId)` → the full resource ID as-is

### ARM API Versions

Key API versions pinned in `utils/arm-api-versions.ts`:

| Resource Provider | API Version |
|-------------------|-------------|
| `Microsoft.Resources/*` | 2021-04-01 |
| `Microsoft.Web/sites` | 2022-09-01 |
| `Microsoft.Storage/storageAccounts` | 2023-01-01 |
| `Microsoft.Sql/servers` | 2021-11-01 |
| `Microsoft.KeyVault/vaults` | 2023-02-01 |
| `Microsoft.Insights/metricAlerts` | 2018-03-01 |
| `Microsoft.Insights/actionGroups` | 2023-01-01 |
| `Microsoft.AlertsManagement/smartDetectorAlertRules` | 2021-04-01 |
| `Microsoft.Cdn/profiles` | 2023-05-01 |
| `Microsoft.EventGrid/topics` | 2022-06-15 |
| `Microsoft.ResourceGraph/resources` | 2022-10-01 |
| Key Vault data plane | 7.4 |

### Error Handling

ARM errors are parsed from the response body `{ error: { code, message, details[] } }` and surfaced as structured messages. All tools catch errors and return `isError: true` with the error message as content.

</http-client>

<tool-reference>

## Tool Reference

### Resource Tools

<tool name="list-resources">

**`list-resources`** — List all Azure resources in the subscription or resource group with filtering.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group name |
| `resourceType` | string | No | — | Filter by resource type (e.g., `Microsoft.Web/sites`) |
| `tagFilter` | string | No | — | OData filter for tags (e.g., `tagName eq 'env' and tagValue eq 'dev'`) |
| `nameContains` | string | No | — | Filter by name substring (client-side) |
| `maxResults` | number | No | 100 | Maximum results to return |

**Returns:** `{ resources: ArmResource[], summary: { total, byType, byResourceGroup, byLocation } }`

Note: `nameContains` is applied client-side after fetching from ARM because the ARM API does not support name substring filtering natively.

</tool>

<tool name="get-resource">

**`get-resource`** — Get detailed information about a specific Azure resource.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceId` | string | Conditional | — | Full ARM resource ID (preferred) |
| `resourceGroup` | string | Conditional | — | Resource group (required if not using `resourceId`) |
| `resourceType` | string | Conditional | — | Resource type (required if not using `resourceId`) |
| `resourceName` | string | Conditional | — | Resource name (required if not using `resourceId`) |
| `includeAllProperties` | boolean | No | false | Include null/empty properties in response |

**Requires:** either `resourceId` OR (`resourceGroup` + `resourceType` + `resourceName`)

**Default behavior:** null, undefined, empty arrays, and empty objects are stripped from the response to reduce token usage. Pass `includeAllProperties=true` for the raw ARM payload.

</tool>

<tool name="list-resource-groups">

**`list-resource-groups`** — List all resource groups in the subscription.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tagFilter` | string | No | — | OData filter for tags |
| `nameContains` | string | No | — | Filter by name substring (client-side) |

**Returns:** `{ resourceGroups: ResourceGroup[] }`

</tool>

<tool name="query-resource-graph">

**`query-resource-graph`** — Run Azure Resource Graph queries for advanced resource searching using KQL.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | KQL query string |
| `subscriptions` | string[] | No | configured subscription | Subscription IDs to query |

**Returns:** `{ data: unknown[], count: number }`

**Example queries:**
- `Resources | where type == 'microsoft.web/sites' | where kind contains 'functionapp'`
- `Resources | where tags.environment == 'dev'`
- `Resources | summarize count() by type | order by count_ desc`

</tool>

<tool name="get-resource-tags">

**`get-resource-tags`** — Get the tags object for a specific resource.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Full ARM resource ID |

**Returns:** `Record<string, string>` — tag key-value pairs, or empty object if no tags.

</tool>

<tool name="list-locations">

**`list-locations`** — List available Azure locations for the subscription.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `regionCategory` | enum | No | `Recommended` | `Recommended`, `Other`, or `all` |
| `geographyGroup` | string | No | — | Filter by geography (e.g., `Europe`, `US`, `UK`) |
| `includeMetadata` | boolean | No | false | Include coordinates and paired region data |

**Default:** returns only Recommended physical regions with `name`, `displayName`, and `geographyGroup` — excludes staging and logical regions. Pass `regionCategory=all` to include all region types.

</tool>

---

### Function App Tools

<tool name="list-function-apps">

**`list-function-apps`** — List all Azure Function Apps in the subscription or resource group.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group |
| `includeConfiguration` | boolean | No | false | Include app settings |
| `includeSlots` | boolean | No | false | Include deployment slots |

</tool>

<tool name="get-function-app">

**`get-function-app`** — Get detailed information about a specific Function App.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | Function App name |
| `resourceGroup` | string | No | env default | Resource group |
| `includeConfiguration` | boolean | No | true | Include app settings |
| `includeFunctions` | boolean | No | true | List all functions and their triggers |
| `includeDeployments` | boolean | No | false | Include recent deployments |

</tool>

<tool name="list-functions">

**`list-functions`** — List all individual functions within a Function App.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `functionAppName` | string | Yes | — | Function App name |
| `resourceGroup` | string | No | env default | Resource group |

</tool>

<tool name="get-function-keys">

**`get-function-keys`** — Get function and host keys for a Function App.

**Requires `Website Contributor` role** on the Function App — will return permission error with Reader role only.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `functionAppName` | string | Yes | — | Function App name |
| `resourceGroup` | string | No | env default | Resource group |
| `functionName` | string | No | — | Specific function name; omit for host keys only |

</tool>

---

### App Service Tools

<tool name="list-app-services">

**`list-app-services`** — List all App Services (web apps) in the subscription or resource group.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group |
| `includeConfiguration` | boolean | No | false | Include app settings |

</tool>

<tool name="get-app-service">

**`get-app-service`** — Get detailed information about an App Service.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | App Service name |
| `resourceGroup` | string | No | env default | Resource group |
| `includeConfiguration` | boolean | No | true | Include app settings |
| `includeDeployments` | boolean | No | false | Include recent deployments |
| `showValues` | boolean | No | false | Show unredacted config values for this call only |

</tool>

<tool name="list-app-service-plans">

**`list-app-service-plans`** — List all App Service Plans (hosting plans) in the subscription or resource group.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group |

</tool>

<tool name="get-app-service-logs">

**`get-app-service-logs`** — Fetch recent application logs from an App Service via Kudu SCM API. Auto-detects OS and fetches appropriate log types. Requires `Website Contributor` role.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | App Service name |
| `resourceGroup` | string | No | env default | Resource group |
| `logType` | enum | No | all | `docker`, `stdout`, `eventlog`, or `all` |
| `maxLines` | number | No | 200 | Maximum lines per log source |

**Log types by OS:**
- **Linux**: `docker` (container logs from `/api/logs/docker`), `stdout`
- **Windows**: `eventlog` (from `/api/vfs/LogFiles/eventlog.xml`), `stdout`

</tool>

---

### App Service Write Tools (require AZURE_MGMT_ENABLE_WRITE=true)

<tool name="restart-app-service">

**`restart-app-service`** — Restart an App Service. Useful for applying config changes or recovering from errors.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | App Service name |
| `resourceGroup` | string | No | env default | Resource group |

</tool>

<tool name="stop-app-service">

**`stop-app-service`** — Stop a running App Service. The app will be deallocated.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | App Service name |
| `resourceGroup` | string | No | env default | Resource group |

</tool>

<tool name="start-app-service">

**`start-app-service`** — Start a stopped App Service.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | App Service name |
| `resourceGroup` | string | No | env default | Resource group |

</tool>

<tool name="set-app-service-config">

**`set-app-service-config`** — Update app settings or connection strings on an App Service. Uses merge pattern — does not replace the full set.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | App Service name |
| `resourceGroup` | string | No | env default | Resource group |
| `appSettings` | Record<string, string> | No | — | Key-value pairs to add/update |
| `connectionStrings` | Record<string, {value, type}> | No | — | Connection strings to add/update |
| `removeSettings` | string[] | No | — | App setting keys to remove |

**Important:** The ARM API replaces ALL settings on PUT. This tool automatically GETs existing settings first, merges changes, then PUTs the full set to prevent accidental deletion.

</tool>

---

### Key Vault Tools

<tool name="list-key-vaults">

**`list-key-vaults`** — List all Key Vaults in the subscription or resource group (ARM management plane).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group |

</tool>

<tool name="get-key-vault">

**`get-key-vault`** — Get detailed information about a Key Vault including access policies.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | Key Vault name |
| `resourceGroup` | string | No | env default | Resource group |
| `includeAccessPolicies` | boolean | No | true | Include access policies |

</tool>

<tool name="list-key-vault-secrets">

**`list-key-vault-secrets`** — List secret **names** (NOT values) from Key Vault data plane.

**Requires `Key Vault Secrets User` role** — will return permission error with Reader role only.

Uses Key Vault data plane API (`https://{vaultName}.vault.azure.net/secrets`) with API version 7.4, not the ARM management plane.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vaultName` | string | Yes | Key Vault name |

</tool>

---

### Storage Tools

<tool name="list-storage-accounts">

**`list-storage-accounts`** — List all Storage Accounts in the subscription or resource group.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group |

</tool>

<tool name="get-storage-account">

**`get-storage-account`** — Get detailed information about a Storage Account.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | Storage account name |
| `resourceGroup` | string | No | env default | Resource group |
| `includeKeys` | boolean | No | false | Include storage keys (requires `Storage Account Key Operator` role) |

Connection strings and keys are subject to `AZURE_REDACT_SECRETS` redaction when `includeKeys=true`.

</tool>

---

### SQL Tools

<tool name="list-sql-servers">

**`list-sql-servers`** — List all SQL Servers in the subscription or resource group.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group |

</tool>

<tool name="list-sql-databases">

**`list-sql-databases`** — List all databases on a specific SQL Server.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `serverName` | string | Yes | — | SQL Server name |
| `resourceGroup` | string | No | env default | Resource group |

</tool>

---

### Monitoring Tools

<tool name="list-alert-rules">

**`list-alert-rules`** — List all metric alert rules in the subscription or resource group.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group |
| `targetResourceId` | string | No | — | Filter alerts for a specific resource ID |

</tool>

<tool name="list-action-groups">

**`list-action-groups`** — List all action groups (notification targets) in the subscription or resource group.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group |

</tool>

<tool name="list-smart-detector-alerts">

**`list-smart-detector-alerts`** — List all smart detector (AI-based anomaly detection) alert rules.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group |

</tool>

---

### Networking Tools

<tool name="list-front-doors">

**`list-front-doors`** — List all Azure Front Door profiles in the subscription or resource group.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group |

Uses `Microsoft.Cdn/profiles` ARM resource type (Front Door Standard/Premium uses the CDN API).

</tool>

<tool name="get-front-door">

**`get-front-door`** — Get detailed configuration of an Azure Front Door profile.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | Front Door profile name |
| `resourceGroup` | string | No | env default | Resource group |

</tool>

<tool name="list-event-grid-topics">

**`list-event-grid-topics`** — List Event Grid topics. Filters system topics (GUID names) by default.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceGroup` | string | No | — | Filter by resource group |
| `includeSystemTopics` | boolean | No | false | Include system topics with GUID names |

**Default behavior:** returns only custom topics. System topics generated by Azure services typically have auto-generated GUID names and add noise. Pass `includeSystemTopics=true` to see all topics.

</tool>

</tool-reference>

<prompts>

## Prompts

| Prompt ID | Arguments | Description |
|-----------|-----------|-------------|
| `azure-resource-discovery` | (none) | Guides through listing resource groups, all resources, then drilling into specific types |
| `function-app-troubleshooting` | `functionAppName: string` | Investigates a named Function App: config, functions, state, alerts |
| `alert-investigation` | (none) | Reviews alert rules, action groups, and smart detectors across the subscription |
| `infrastructure-overview` | (none) | Generates an executive summary report: resource counts, compute, data, security, monitoring |

### Prompt: function-app-troubleshooting

This prompt takes a `functionAppName` argument and instructs the agent to call:
1. `get-function-app` with `includeConfiguration=true`
2. `list-functions` to see all functions and triggers
3. Examine state, app settings, and connection strings for common issues
4. `list-alert-rules` to check related alerts

### Prompt: infrastructure-overview

Collects data from: `list-resource-groups`, `list-resources`, `list-function-apps`, `list-app-services`, `list-key-vaults`, `list-storage-accounts`, `list-sql-servers`, `list-alert-rules`. Produces a report with executive summary, resource counts by type/location, compute/data/security/monitoring sections.

</prompts>

<cli-architecture>

## CLI Architecture

Binary: `mcp-azure-mgmt-cli`

Entry point: `src/cli.ts` using `createCliProgram()` from `@mcp-consultant-tools/core`.

Environment is loaded via `loadEnvForCli()` in a `preAction` hook on every command — this means `--env-file` takes effect before any service code runs.

### Command Groups

| Command Group | Subcommands | MCP Tool Equivalent |
|---------------|-------------|---------------------|
| `resource list` | `-g`, `-t`, `--tag-filter`, `-n`, `-m` | `list-resources` |
| `resource get` | `-i`, `-g`, `-t`, `-n`, `--include-all-properties` | `get-resource` |
| `resource groups` | `--tag-filter`, `-n` | `list-resource-groups` |
| `resource graph <query>` | `-s` (subscriptions) | `query-resource-graph` |
| `resource tags <resourceId>` | — | `get-resource-tags` |
| `resource locations` | `-c`, `-g`, `--include-metadata` | `list-locations` |
| `function-app list` | `-g`, `--include-configuration`, `--include-slots` | `list-function-apps` |
| `function-app get <name>` | `-g`, `--include-configuration`, `--include-functions`, `--include-deployments` | `get-function-app` |
| `function-app functions <name>` | `-g` | `list-functions` |
| `function-app keys <name>` | `-g`, `-f` | `get-function-keys` |
| `app-service list` | `-g`, `--include-configuration` | `list-app-services` |
| `app-service get <name>` | `-g`, `--include-configuration`, `--include-deployments`, `--show-values` | `get-app-service` |
| `app-service plans` | `-g` | `list-app-service-plans` |
| `app-service logs <name>` | `-g`, `--log-type`, `--max-lines` | `get-app-service-logs` |
| `app-service restart <name>` | `-g` | `restart-app-service` |
| `app-service stop <name>` | `-g` | `stop-app-service` |
| `app-service start <name>` | `-g` | `start-app-service` |
| `app-service set-config <name>` | `-g`, `--app-settings`, `--connection-strings`, `--remove-settings` | `set-app-service-config` |
| `key-vault list` | `-g` | `list-key-vaults` |
| `key-vault get <name>` | `-g`, `--include-access-policies` | `get-key-vault` |
| `key-vault secrets <vaultName>` | — | `list-key-vault-secrets` |
| `storage list` | `-g` | `list-storage-accounts` |
| `storage get <name>` | `-g`, `--include-keys` | `get-storage-account` |
| `sql servers` | `-g` | `list-sql-servers` |
| `sql databases <serverName>` | `-g` | `list-sql-databases` |
| `monitoring alerts` | `-g`, `--target-resource-id` | `list-alert-rules` |
| `monitoring action-groups` | `-g` | `list-action-groups` |
| `monitoring smart-detectors` | `-g` | `list-smart-detector-alerts` |
| `networking front-doors` | `-g` | `list-front-doors` |
| `networking front-door get <name>` | `-g` | `get-front-door` |
| `networking event-grid` | `-g`, `--include-system-topics` | `list-event-grid-topics` |

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of summary text |
| `--no-cache` | Skip writing JSON results to cache directory |
| `--env-file <path>` | Load environment variables from a custom `.env` file |

### Output Pattern

All commands use `outputResult()` from `cli/output.ts`:
- Summary line to stdout
- Full JSON cached to `.context/.mcp-mgmt-cache/`
- `--json` flag bypasses summary and outputs raw JSON to stdout

### CLI Examples

```bash
# List all resources in a resource group
mcp-azure-mgmt-cli resource list -g rg-prod-uks-01

# Get a resource by ARM ID
mcp-azure-mgmt-cli resource get -i /subscriptions/{subId}/resourceGroups/rg-prod/providers/Microsoft.Web/sites/my-app

# Run a Resource Graph query
mcp-azure-mgmt-cli resource graph "Resources | where type == 'microsoft.web/sites' | where kind contains 'functionapp'"

# Get Function App details
mcp-azure-mgmt-cli function-app get func-prod-sync-uks-01

# Get Function App host keys
mcp-azure-mgmt-cli function-app keys func-prod-sync-uks-01

# List Key Vault secrets
mcp-azure-mgmt-cli key-vault secrets kv-prod-secrets-uks-01

# List storage accounts as JSON
mcp-azure-mgmt-cli --json storage list

# Use a custom env file
mcp-azure-mgmt-cli --env-file .env.prod function-app list -g rg-prod-uks-01
```

</cli-architecture>

<error-handling>

## Error Handling

### Common Error Patterns

| Error Code | Cause | Resolution |
|------------|-------|------------|
| `AuthorizationFailed` | Service principal missing permissions | Assign `Reader` role on subscription or resource group |
| `ResourceNotFound` | Resource name/group incorrect, or wrong subscription | Verify resource name, resource group, and `AZURE_SUBSCRIPTION_ID` |
| `Failed to get function keys` | Missing `Website Contributor` role | Assign `Website Contributor` on the Function App |
| `Failed to acquire ARM access token` | Invalid service principal credentials | Check `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` |
| `Resource group is required but not specified` | Tool called without `resourceGroup` and no `AZURE_RESOURCE_GROUP` set | Pass `resourceGroup` parameter or set `AZURE_RESOURCE_GROUP` |

### Retry Behavior

The ARM client retries automatically on `429` (rate limit) and `5xx` (server errors) up to 3 times with exponential backoff. The `Retry-After` header is respected if present.

### All Tool Errors Return isError: true

Every tool's catch block returns `{ content: [{ type: 'text', text: 'Failed: ...' }], isError: true }`, so agents can detect failures without inspecting content strings.

</error-handling>

<security>

## Security

- **Read-only:** Zero tools perform write operations on ARM. All calls are GET or POST (Resource Graph queries POST to the graph API, which is also read-only).
- **Secret redaction:** When `AZURE_REDACT_SECRETS=true` (default), `FunctionAppService` and `StorageService` strip connection strings and keys from app settings before returning. Set to `false` only in trusted contexts.
- **Key Vault secrets listed, never read:** `list-key-vault-secrets` returns secret names and metadata (enabled status, expiry dates), never secret values. The data plane is called for the list operation but no `GET /secrets/{name}/value` call is made.
- **Audit logging:** All ARM API token acquisitions and retries are logged to stderr. No stdout output (MCP protocol requirement).
- **Credentials never cached to disk:** Tokens are cached in-memory only within `AzureAuthProvider`.

</security>

<performance>

## Performance

- **Lazy service initialization:** Domain services (e.g., `FunctionAppService`) are instantiated on first use via getters on `AzureManagementService`. Unused services are never created.
- **Pagination with maxResults:** `listResources` defaults to `maxResults=100` to avoid paginating thousands of resources unnecessarily. Increase for full inventories.
- **Null property filtering:** `getResource` strips null/empty properties by default, significantly reducing response size for resources with many optional ARM properties.
- **Event Grid system topic exclusion:** `list-event-grid-topics` excludes system topics by default, reducing noise from auto-generated GUID-named topics.
- **Location filtering:** `list-locations` defaults to `Recommended` physical regions only, excluding staging/logical regions that add no value for most queries.

</performance>
