# Azure Management Package Guide

## Overview

MCP server for Azure Resource Manager (ARM) API. Provides discovery and inspection of Azure infrastructure, App Service lifecycle management, and configuration updates.

**Tools:** 31 | **Prompts:** 4 | **Auth:** Entra ID (Service Principal)

## Environment Configuration

```bash
# Required - Azure AD Authentication
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_SUBSCRIPTION_ID=your-subscription-id

# Optional - Default resource group
AZURE_RESOURCE_GROUP=your-default-rg

# Optional - Filtering
AZURE_ALLOWED_RESOURCE_GROUPS=rg1,rg2,rg3    # Restrict to specific RGs
AZURE_EXCLUDED_RESOURCE_TYPES=Microsoft.Compute/disks  # Hide certain types

# Optional - Features
AZURE_INCLUDE_TAGS=true                       # Include tags in listings (default: true)
AZURE_REDACT_SECRETS=true                     # Redact sensitive values (default: true)
AZURE_MAX_RESULTS=100                         # Default max results
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

## Key Tools

### Discovery
- `list-resources` - List all resources with filtering
- `get-resource` - Get detailed resource info
- `list-resource-groups` - List resource groups
- `query-resource-graph` - Advanced KQL-like queries

### Function Apps
- `list-function-apps` - List all Function Apps
- `get-function-app` - Get Function App details + config
- `list-functions` - List functions in an app
- `get-function-keys` - Get function/host keys

### App Services (Read)
- `list-app-services` - List web apps
- `get-app-service` - Get App Service details (supports `showValues` to override redaction)
- `list-app-service-plans` - List hosting plans
- `get-app-service-logs` - Fetch logs via Kudu SCM (docker, eventlog, stdout)

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
- `list-event-grid-topics` - List Event Grid topics

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

## Reference

See `docs/technical/AZURE_MANAGEMENT_TECHNICAL.md` for detailed implementation documentation.

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
```
