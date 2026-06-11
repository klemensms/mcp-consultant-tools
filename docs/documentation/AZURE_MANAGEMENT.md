# Azure Management

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/AZURE_MANAGEMENT_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/azure-management`

MCP server for the Azure Resource Manager (ARM) API, providing discovery and inspection of Azure infrastructure including Function Apps, App Services, Key Vaults, Storage, SQL, Monitoring, and Networking. Read-first: all discovery tools are always available, and 4 App Service write operations (`restart-app-service`, `stop-app-service`, `start-app-service`, `set-app-service-config`) become available only when `AZURE_MGMT_ENABLE_WRITE=true`.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for the full setup guide.

```json
{
  "servers": {
    "azure-management": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-management@beta", "mcp-azure-mgmt"],
      "env": {
        "AZURE_TENANT_ID": "op://Work/Azure-App-Registration/tenantid",
        "AZURE_CLIENT_ID": "op://Work/Azure-App-Registration/username",
        "AZURE_CLIENT_SECRET": "op://Work/Azure-App-Registration/password",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_RESOURCE_GROUP": "",
        "AZURE_REDACT_SECRETS": "true",
        "AZURE_MGMT_ENABLE_WRITE": "false"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "azure-management": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-management", "mcp-azure-mgmt"],
      "env": {
        "AZURE_TENANT_ID": "your-tenant-id",
        "AZURE_CLIENT_ID": "your-client-id",
        "AZURE_CLIENT_SECRET": "your-client-secret",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_RESOURCE_GROUP": "",
        "AZURE_REDACT_SECRETS": "true",
        "AZURE_MGMT_ENABLE_WRITE": "false"
      }
    }
  }
}
```

`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_SUBSCRIPTION_ID` are required. `AZURE_RESOURCE_GROUP` (default empty), `AZURE_REDACT_SECRETS` (default `true`), and `AZURE_MGMT_ENABLE_WRITE` (default `false`) are optional; defaults are shown above.

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "azure-management": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `azure-resource-discovery` | Guide through discovering and understanding resources in a subscription |
| `function-app-troubleshooting` | Diagnose issues with a specific Function App |
| `alert-investigation` | Investigate alert rules, action groups, and smart detectors |
| `infrastructure-overview` | Generate a comprehensive infrastructure summary report |

## Notable Behavior

- **Read-first.** All discovery and inspection tools are always available. The only write operations are 4 App Service tools (`restart-app-service`, `stop-app-service`, `start-app-service`, `set-app-service-config`); they are gated behind `AZURE_MGMT_ENABLE_WRITE=true` and refuse to run when the flag is off. Nothing creates or deletes resources. With the flag left at its `false` default the server is safe for production subscriptions.
- **Secret redaction:** Connection strings and keys in app settings are redacted by default (`AZURE_REDACT_SECRETS=true`). Set to `false` to expose raw values.
- **`get-function-keys` and `list-key-vault-secrets` require elevated permissions** beyond the base Reader role — these will fail with permission errors if the service principal only has Reader access.
- **`get-resource` filters nulls by default** to reduce response size; pass `includeAllProperties=true` to get the full ARM payload.
