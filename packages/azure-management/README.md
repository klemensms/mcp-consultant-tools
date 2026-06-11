# @mcp-consultant-tools/azure-management

MCP server for Azure Resource Manager - read-only discovery and inspection of Azure infrastructure.

## Features

- **26 tools** for Azure resource discovery and inspection
- **4 prompts** for guided workflows
- Read-only access - no create, update, or delete operations
- Covers Function Apps, App Services, Key Vaults, Storage, SQL, Monitoring, Networking

## Installation

```bash
npx @mcp-consultant-tools/azure-management
```

## Configuration

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
        "AZURE_RESOURCE_GROUP": "your-default-rg"
      }
    }
  }
}
```

## Required Azure Permissions

| Role | Scope | Purpose |
|------|-------|---------|
| `Reader` | Subscription or Resource Group | List and read all resources |

## Tools

### Discovery
- `list-resources` - List all Azure resources with filtering
- `get-resource` - Get detailed resource info
- `list-resource-groups` - List resource groups
- `query-resource-graph` - Advanced KQL-like queries

### Function Apps
- `list-function-apps` - List all Function Apps
- `get-function-app` - Get Function App details + config
- `list-functions` - List functions in an app
- `get-function-keys` - Get function/host keys

### App Services
- `list-app-services` - List web apps
- `get-app-service` - Get App Service details
- `list-app-service-plans` - List hosting plans

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
- `list-event-grid-topics` - List Event Grid topics

### Utility
- `get-resource-tags` - Get tags for a resource
- `list-locations` - List available Azure locations

## License

ISC
