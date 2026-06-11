# Microsoft Fabric

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/FABRIC_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/fabric`

MCP server for Microsoft Fabric — manage workspaces, capacities, items (lakehouses, warehouses, notebooks, etc.), OneLake shortcuts, governance domains, and read tenant-wide admin inventory. Read-only by default; write and delete require explicit feature flags.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "fabric": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/fabric@beta", "mcp-fabric"],
      "env": {
        "FABRIC_TENANT_ID": "op://Work/Fabric-App-Registration/tenantid",
        "FABRIC_CLIENT_ID": "op://Work/Fabric-App-Registration/username",
        "FABRIC_CLIENT_SECRET": "op://Work/Fabric-App-Registration/password",
        "FABRIC_ENABLE_WRITE": "false",
        "FABRIC_ENABLE_DELETE": "false"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "fabric": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/fabric", "mcp-fabric"],
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

All environment variables are shown above with their defaults. Only the three `FABRIC_*` credential variables (an Azure AD / Entra service principal) are required; the two write/delete feature flags default to `false` (read-only) when omitted.

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "fabric": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `fabric-workspace-overview` | Workspace metadata, its items, and role assignments formatted as markdown |
| `fabric-tenant-inventory` | Tenant-wide workspace and domain inventory (uses the Fabric admin API) |

## Notable Behavior

- **Feature flags gate write and delete separately.** `FABRIC_ENABLE_WRITE=true` enables create/update of workspaces, items, and shortcuts plus all assign operations (capacity, domain, workspace roles). `FABRIC_ENABLE_DELETE=true` independently enables deletion of workspaces, items, and shortcuts. Both default to `false`.
- **`FABRIC_*` env prefix.** This package uses the `FABRIC_*` prefix to match the sibling-package convention (`SHAREPOINT_*`, `AZUREDEVOPS_*`, `TEAMS_*`) rather than the `MCP_FABRIC_*` form.
- **Admin and domain tools need extra rights.** The `fabric-list-domains`, `fabric-get-domain`, `fabric-assign-domain-workspaces`, `fabric-unassign-domain-workspaces`, and all `fabric-admin-*` tools call the Fabric admin API (`/v1/admin`). The service principal must have Fabric admin rights **and** the corresponding admin tenant-setting opt-in, or these calls return `403`.
- **Service principal must be enabled for Fabric APIs.** In the Fabric admin portal, "Service principals can use Fabric APIs" must be enabled (optionally scoped to a security group the SP belongs to).
- **`fabric-get-capacity` filters the list.** The Fabric REST API has no per-capacity GET route, so this tool retrieves the full capacity list and filters client-side.
- **Long-running creates may return "accepted".** Some create operations return HTTP 202; the tool surfaces this as `{ accepted: true, status: 202, location, retryAfter }` rather than a completed resource.
