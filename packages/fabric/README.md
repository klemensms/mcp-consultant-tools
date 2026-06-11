# @mcp-consultant-tools/fabric

MCP server for Microsoft Fabric. Manage workspaces, capacities, items, OneLake shortcuts, domains, and read tenant-wide admin inventory through an MCP-compatible interface and a companion CLI.

## Features

- **Workspaces** — list, get, create, update, delete; manage role assignments
- **Capacities** — list, get; assign/unassign workspaces to a capacity
- **Items** — list, get, create, update, delete; type-specific create for lakehouses, warehouses, notebooks
- **Shortcuts** — list, create, delete OneLake shortcuts (zero-copy references into ADLS Gen2, S3, Dataverse, OneLake)
- **Domains** — list, get; assign/unassign workspaces to a governance domain
- **Admin** — tenant-wide item inventory, admin workspace list, tenant settings (read-only)
- Service-principal authentication with token caching and automatic refresh
- Write/delete operations gated behind explicit feature flags
- Companion CLI (`mcp-fabric-cli`) with 1:1 parity to every MCP tool

## Installation

```bash
npm install @mcp-consultant-tools/fabric
```

Or use directly with npx:

```bash
npx --package=@mcp-consultant-tools/fabric@beta mcp-fabric-cli --help
```

## Configuration

### Environment Variables

```bash
# Required - Azure AD (Entra) service principal
FABRIC_TENANT_ID=your-azure-tenant-id
FABRIC_CLIENT_ID=your-app-client-id
FABRIC_CLIENT_SECRET=your-client-secret

# Write protection (default: all disabled)
FABRIC_ENABLE_WRITE=false    # create/update workspaces, items, shortcuts; assign capacities/domains/roles
FABRIC_ENABLE_DELETE=false   # delete workspaces, items, shortcuts
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fabric": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/fabric@beta", "mcp-fabric"],
      "env": {
        "FABRIC_TENANT_ID": "your-tenant-id",
        "FABRIC_CLIENT_ID": "your-client-id",
        "FABRIC_CLIENT_SECRET": "your-client-secret",
        "FABRIC_ENABLE_WRITE": "false",
        "FABRIC_ENABLE_DELETE": "false"
      }
    }
  }
}
```

## Azure AD Setup

Create an Azure AD App Registration and grant it access to the Microsoft Fabric APIs:

1. Register an application in [Azure Portal](https://portal.azure.com) → Microsoft Entra ID → App registrations.
2. Create a client secret under **Certificates & secrets**.
3. In the Fabric admin portal, enable **"Service principals can use Fabric APIs"** for the relevant tenant settings (and add the service principal to a security group if the setting is scoped).
4. Grant the service principal the required workspace roles / capacity permissions for the resources it should manage.

**Admin API note:** the `domain` and `admin` commands call the Fabric admin API (`/v1/admin`). These require the service principal to have Fabric admin rights and the corresponding admin tenant-setting opt-in. Without that opt-in these calls return `403`.

## Authentication

The Fabric REST APIs authenticate with an Azure AD bearer token. This package uses the **service principal** (client credentials) flow and acquires a token for the `https://api.fabric.microsoft.com/.default` scope, which covers both base URLs:

- Core / items API: `https://api.fabric.microsoft.com/v1`
- Admin API: `https://api.fabric.microsoft.com/v1/admin`

## CLI Usage

Binary: `mcp-fabric-cli`. Commands are grouped by domain and mirror the MCP tools 1:1.

```bash
# Inherit credentials from an MCP config entry (recommended)
npx --package=@mcp-consultant-tools/fabric@beta mcp-fabric-cli --mcp-server fabric workspace list

# Workspaces
mcp-fabric-cli workspace list
mcp-fabric-cli workspace get <workspaceId>
mcp-fabric-cli workspace list-roles <workspaceId>

# Capacities
mcp-fabric-cli capacity list
mcp-fabric-cli capacity assign <workspaceId> <capacityId>

# Items
mcp-fabric-cli item list <workspaceId> --type Lakehouse
mcp-fabric-cli item create-lakehouse <workspaceId> "My Lakehouse"

# Shortcuts
mcp-fabric-cli shortcut list <workspaceId> <itemId>

# Domains (admin API)
mcp-fabric-cli domain list

# Admin (admin API, read-only)
mcp-fabric-cli admin list-workspaces
mcp-fabric-cli admin get-tenant-settings

# Raw JSON output
mcp-fabric-cli --json workspace list
```

### Global Flags

- `--json` — print raw JSON to stdout instead of a summary
- `--no-cache` — skip writing the full JSON cache file
- `--env-file <path>` — load environment variables from a `.env` file
- `--mcp-config <path>` — load environment from an MCP config file (defaults to `./.mcp.json`)
- `--mcp-server <name>` — server name in the MCP config to read the `env` block from

Each command prints a human-readable summary to stdout and writes the full JSON
response to `.context/.mcp-fabric-cache/`.

## License

MIT
