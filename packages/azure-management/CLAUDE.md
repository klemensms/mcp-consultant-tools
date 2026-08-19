# Azure Management Package Guide

## Overview

MCP server for Azure Resource Manager (ARM) API. Provides discovery and inspection of Azure infrastructure, App Service lifecycle management, and configuration updates.

**Tools:** 42 (38 read-only, 4 write) | **Prompts:** 4 | **Auth:** Entra ID (Service Principal)

## Environment Configuration

```bash
# Required - Azure AD Authentication
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_SUBSCRIPTION_ID=your-subscription-id

# Optional - Default resource group
AZURE_RESOURCE_GROUP=your-default-rg

# Optional - Features
AZURE_REDACT_SECRETS=true                     # Redact sensitive values (default: true)
AZURE_MGMT_ENABLE_WRITE=false                 # Enable write operations: restart, stop, start, set-config (default: false)
```

## Required Azure Permissions

| Role | Scope | Purpose |
|------|-------|---------|
| `Reader` | Subscription or Resource Group | List and read all resources |

### Extended Permissions (Optional)

| Feature | Role | Scope |
|---------|------|-------|
| Function Keys | `Website Contributor` | Function App |
| App Service Logs | `Website Contributor` | App Service (Kudu SCM access) |
| App Service Write Ops | `Website Contributor` | App Service (restart, stop, start, config) |
| Key Vault Secrets | `Key Vault Secrets User` | Key Vault |
| Storage Keys | `Storage Account Key Operator` | Storage Account |
| `--include-configuration` | `Website Contributor` | App Service / Function App |

**`--include-configuration` is not a Reader operation.** Reading app settings needs `Microsoft.Web/sites/config/list/action`, a POST action Reader does not grant, so against a read-only credential it returns 403 for every site. Commands that fan out report this in a `fanOut` block, mark each site `configurationUnavailable: true`, and exit 1 - a partial collection is never presented as a complete one. See the fan-out contract in `docs/technical/AZURE_MANAGEMENT_TECHNICAL.md`.

## Key Tools

### Discovery
- `list-subscriptions` - Subscriptions visible to the service principal (tenant-level)
- `list-resources` - List all resources with filtering
- `get-resource` - Get detailed resource info
- `list-resource-groups` - List resource groups
- `query-resource-graph` - Advanced KQL-like queries

### Resource Graph (cross-resource, read-only)
- `list-network-security-groups` - NSGs + rules + subnet/NIC associations
- `list-role-assignments` - RBAC assignments with resolved role names
- `list-private-endpoints` - Private endpoints + connection status
- `find-resource-consumers` - What references a given resource
- `list-diagnostic-settings` - Diagnostic settings across resources
- `get-resource-relationships` - Subnet/VNet adjacency + forward/reverse references

### Function Apps
- `list-function-apps` - List all Function Apps
- `get-function-app` - Get Function App details + config
- `list-functions` - List functions in an app
- `get-function-keys` - Get function/host keys

### App Services (Read)
- `list-app-services` - List web apps
- `get-app-service` - Get App Service details (supports `showValues` to override redaction)
- `list-app-service-plans` - List hosting plans
- `get-app-service-logs` - Fetch log *files* via Kudu SCM (docker, eventlog, stdout)
- `get-log-stream` - Collect *live* log output via Kudu SCM (bounded: max 30s / 1000 lines)
- `get-log-config` - Logging configuration (levels, blob destinations, tracing)
- `list-detectors` - App Service diagnostic detectors
- `get-detector` - Run one detector over a time range

### App Services (Write — requires AZURE_MGMT_ENABLE_WRITE=true)
- `restart-app-service` - Restart an App Service
- `stop-app-service` - Stop a running App Service
- `start-app-service` - Start a stopped App Service
- `set-app-service-config` - Update app settings or connection strings (merge pattern)

### Key Vault
- `list-key-vaults` - List Key Vaults
- `get-key-vault` - Get vault details
- `list-key-vault-secrets` - List secret names (NOT values)

### Storage & SQL
- `list-storage-accounts` - List storage accounts
- `get-storage-account` - Get storage details
- `list-sql-servers` - List SQL servers
- `list-sql-databases` - List databases

### Monitoring
- `list-alert-rules` - List metric alerts
- `list-action-groups` - List notification groups
- `list-smart-detector-alerts` - List AI-based alerts

### Networking
- `list-front-doors` - List Azure Front Door profiles
- `get-front-door` - Get Front Door configuration

### Event Grid
- `list-event-grid-topics` - List Event Grid topics (custom and system topics are always counted; system topics are listed only on request)

## Common Workflows

### 1. Discover All Resources
```
1. Use list-resource-groups to see available RGs
2. Use list-resources with resourceGroup filter
3. Use get-resource for detailed inspection
```

### 2. Investigate Function App
```
1. Use list-function-apps to find the app
2. Use get-function-app with includeFunctions=true
3. Check configuration and function bindings
```

### 3. Check Monitoring Setup
```
1. Use list-alert-rules to see configured alerts
2. Use list-action-groups to see notification targets
3. Cross-reference with specific resources
```

### 4. Investigate App Service 500.30 Errors
```
1. Use get-app-service to check status and runtime config
2. Use get-app-service-logs to fetch eventlog.xml or docker logs
3. Use get-app-service with showValues=true to inspect config values
4. If config fix needed: use set-app-service-config then restart-app-service
```

## Things that will bite you

**Resource Graph has no query-parameter binding.** Filter values are escaped into the KQL literal by `src/utils/kql.ts`, which escapes the backslash *before* the quote. Escaping only the quote lets a trailing `\` close the literal and inject clauses. Never interpolate a value into a query without `kqlString()`.

**Compare `type` with `=~`, never `==`.** A wrong-cased `type` literal compiles and returns zero rows — a false all-clear, not an error. Same for `tostring(properties) contains`: `contains` takes a `string`, and `properties` is `dynamic`.

**`truncated: true` means the counts are a lower bound.** Resource Graph withholds `$skipToken` whenever it truncates, so a full 1000-row page with no continuation token is indistinguishable from "exactly one page exists". Every Resource Graph tool reports `truncated`; `summary` always describes exactly the rows returned. Paged queries carry `| order by id asc` — without a deterministic sort, `$skipToken` duplicates and drops rows.

**`list-diagnostic-settings` distinguishes "nothing configured" from "could not look".** A resource type that does not support diagnostic settings answers `200 []`. A `403` or `404` *rejects*. The si source bucketed every rejection as "not configured", turning a permissions gap into a clean audit result. `ArmClient` errors now carry `.status` (`getArmErrorStatus()`) so the two stay apart. Any new fan-out across resources must do the same.

**`list-role-assignments` returns `roleDefinitionName: null`, never `"Unknown"`,** when a role definition cannot be read — a fabricated `Unknown` reads like a real role in `byRole`. The whole-lowercased-id join is correct **only** against ARG's `authorizationresources` table; the raw ARM REST APIs put a subscription prefix on one side and not the other.

**`list-event-grid-topics` counts both topic types, and lists only one by default.** `includeSystemTopics` decides what appears in `topics`, not what is looked for, so `summary.total` is what exists and `summary.listed` is what came back. This is deliberate: the command used to enumerate custom topics only and report a subscription holding 15 system topics as a clean `total: 0`, indistinguishable from a subscription holding nothing. `summary.note` names the shortfall when there is one, and a refused query sets `systemTopicsUnavailable` / `customTopicsUnavailable` rather than leaving a zero that looks like a count. Any new command that enumerates one type out of several must do the same.

**`list-subscriptions` returning `[]` is a permissions signal.** `GET /subscriptions` is RBAC-filtered and answers `200 []`, never `403`, when the principal holds no role assignment. Partial subscription access is equally invisible to Resource Graph: it returns a clean `200` with only the readable subscriptions.

**`get-log-stream` blocks the MCP client** for up to 30 seconds. Bounds are enforced twice — Zod schema *and* a service-side clamp — because a CLI caller bypasses the schema. The si source allowed 120s/2000 lines; deliberately not honoured. An empty stream is not evidence the app is idle: filesystem logging is off by default and self-disables after 12 hours.

**Kudu SCM auth is unverified.** `ScmClient` sends an ARM-audience token; `az webapp log tail` uses `https://appservice.azure.com`. If Kudu ever rejects ARM tokens, every SCM call here 401s. Reported explicitly as `SCM authentication rejected`. Not changed, because it would risk breaking the already-shipped `get-app-service-logs`.

**Detectors: `sites/{name}/detectors` returns data; `sites/{name}/diagnostics/{category}/detectors` is a metadata browser.** They are different APIs. Use the former.

**Pre-existing, do not fix inside a port commit:**
- `AzureManagementService.ts` logs the subscription ID to stderr on startup. It lands in transcripts and CI output.
- `src/index.ts` carries a duplicate private copy of `createServiceContext()` alongside `context-factory.ts`. Both must gain any new field or the build fails.
- The technical doc's CLI cache path says `.context/.mcp-mgmt-cache/`; the code uses `.mcp-azure-mgmt-cache`.

## Security Notes

- **Read-only by default**: Write tools require `AZURE_MGMT_ENABLE_WRITE=true`
- **Secret redaction**: Connection strings and keys are redacted by default
- **Per-call unredaction**: `get-app-service` supports `showValues` to override redaction for a single call
- **Config merge**: `set-app-service-config` merges with existing settings — never replaces the full set
- **Audit logging**: All API calls logged to stderr

## MCP Configuration

```json
{
  "mcpServers": {
    "azure-management": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-management", "mcp-azure-mgmt"],
      "env": {
        "AZURE_TENANT_ID": "your-tenant-id",
        "AZURE_CLIENT_ID": "your-client-id",
        "AZURE_CLIENT_SECRET": "your-client-secret",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_RESOURCE_GROUP": "your-default-rg",
        "AZURE_REDACT_SECRETS": "true",
        "AZURE_MGMT_ENABLE_WRITE": "false"
      }
    }
  }
}
```

## Testing

```bash
npm run build --workspace=packages/azure-management
npm test --workspace=packages/azure-management   # 87 tests, no live API
```

Services take injected clients, so the suite uses plain stub objects and needs no `vi.mock`. Query builders are exported as pure `buildXQuery(opts) => string` functions and tested without a subscription.

**Not verified against a live Azure subscription.** The Resource Graph, log-stream and detector surfaces are checked against Microsoft's published schemas and mocked responses only. See `<known-limitations>` in the technical doc.

## Reference

See `docs/technical/AZURE_MANAGEMENT_TECHNICAL.md` for detailed implementation documentation, including the `<query-safety>` and `<known-limitations>` sections.

## CLI Usage

Binary: `mcp-azure-mgmt-cli`

```bash
# List resources
mcp-azure-mgmt-cli resource list --resource-group my-rg

# List function apps
mcp-azure-mgmt-cli function-app list

# App Service operations
mcp-azure-mgmt-cli app-service list
mcp-azure-mgmt-cli app-service get my-app --show-values
mcp-azure-mgmt-cli app-service logs my-app --log-type docker
mcp-azure-mgmt-cli app-service restart my-app
mcp-azure-mgmt-cli app-service set-config my-app --app-settings '{"KEY":"value"}'

# Subscriptions
mcp-azure-mgmt-cli resource subscriptions

# Resource Graph
mcp-azure-mgmt-cli graph nsgs --resource-group my-rg
mcp-azure-mgmt-cli graph role-assignments --principal-id aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
mcp-azure-mgmt-cli graph private-endpoints
mcp-azure-mgmt-cli graph consumers /subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/resourceGroups/my-rg/providers/Microsoft.KeyVault/vaults/my-vault
mcp-azure-mgmt-cli graph diagnostic-settings --resource-type Microsoft.Web/sites --max-resources 50
mcp-azure-mgmt-cli graph relationships /subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/resourceGroups/my-rg/providers/Microsoft.Web/sites/my-app

# Log streaming and detectors
mcp-azure-mgmt-cli log stream my-app --duration 15 --max-lines 500
mcp-azure-mgmt-cli log config my-app
mcp-azure-mgmt-cli log detectors my-app
mcp-azure-mgmt-cli log detector my-app availability --start-time 2026-07-10T00:00:00Z
```
