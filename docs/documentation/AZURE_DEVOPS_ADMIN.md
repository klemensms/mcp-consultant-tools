# Azure DevOps Admin

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/AZURE_DEVOPS_ADMIN_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/azure-devops-admin`

MCP server for Azure DevOps admin operations — pipelines, service connections, agent pools, environments, iterations, areas, artifact feeds, and project management. Read-only by default; write operations require explicit opt-in via feature flags.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "azure-devops-admin": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-devops-admin@beta", "mcp-ado-admin"],
      "env": {
        "AZUREDEVOPS_ORGANIZATION": "your-org-name",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_PAT": "op://Work/AzureDevOps-PAT/password",
        "AZUREDEVOPS_TENANT_ID": "",
        "AZUREDEVOPS_CLIENT_ID": "",
        "AZUREDEVOPS_CLIENT_SECRET": "",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_PIPELINE_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_PIPELINE_DELETE": "false",
        "AZUREDEVOPS_ENABLE_SERVICE_CONN_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_SERVICE_CONN_DELETE": "false",
        "AZUREDEVOPS_ENABLE_VARIABLE_GROUP_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_VARIABLE_GROUP_DELETE": "false",
        "AZUREDEVOPS_ENABLE_AGENT_POOL_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_AGENT_POOL_DISABLE": "false",
        "AZUREDEVOPS_ENABLE_ENVIRONMENT_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_ENVIRONMENT_DELETE": "false",
        "AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_DELETE": "false",
        "AZUREDEVOPS_ENABLE_PROJECT_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_PROJECT_DELETE": "false",
        "AZUREDEVOPS_FEEDS": ""
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

Authentication: use `AZUREDEVOPS_PAT` (simple) or `AZUREDEVOPS_TENANT_ID` + `AZUREDEVOPS_CLIENT_ID` + `AZUREDEVOPS_CLIENT_SECRET` together (Entra ID app registration).

```json
{
  "servers": {
    "azure-devops-admin": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-devops-admin", "mcp-ado-admin"],
      "env": {
        "AZUREDEVOPS_ORGANIZATION": "your-org-name",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_PAT": "your-personal-access-token",
        "AZUREDEVOPS_TENANT_ID": "",
        "AZUREDEVOPS_CLIENT_ID": "",
        "AZUREDEVOPS_CLIENT_SECRET": "",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_PIPELINE_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_PIPELINE_DELETE": "false",
        "AZUREDEVOPS_ENABLE_SERVICE_CONN_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_SERVICE_CONN_DELETE": "false",
        "AZUREDEVOPS_ENABLE_VARIABLE_GROUP_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_VARIABLE_GROUP_DELETE": "false",
        "AZUREDEVOPS_ENABLE_AGENT_POOL_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_AGENT_POOL_DISABLE": "false",
        "AZUREDEVOPS_ENABLE_ENVIRONMENT_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_ENVIRONMENT_DELETE": "false",
        "AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_DELETE": "false",
        "AZUREDEVOPS_ENABLE_PROJECT_UPSERT": "false",
        "AZUREDEVOPS_ENABLE_PROJECT_DELETE": "false",
        "AZUREDEVOPS_FEEDS": ""
      }
    }
  }
}
```

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "azure-devops-admin": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Notable Behavior

- **Authentication modes:** Two options are supported. PAT: set `AZUREDEVOPS_PAT`. Entra ID: set `AZUREDEVOPS_TENANT_ID`, `AZUREDEVOPS_CLIENT_ID`, and `AZUREDEVOPS_CLIENT_SECRET` together. Entra ID takes priority if both are configured. Setting only 1 or 2 of the 3 Entra ID variables throws a clear configuration error.
- **Three-tier permission model:** 30 tools are always available (read-only). Upsert tools (26) require the relevant `_UPSERT` flag. Delete/disable tools (10) require the relevant `_DELETE` or `_DISABLE` flag. Each resource category has its own independent flag pair.
- **Project allowlist:** Set `AZUREDEVOPS_PROJECTS=*` to allow all projects. Project admin tools (`list-projects`, `create-project`, etc.) always operate at the organization scope and ignore this allowlist.
- **Feed allowlist:** Set `AZUREDEVOPS_FEEDS` to a comma-separated list of feed names to restrict artifact feed access. Leave empty to allow all feeds.
- **GitHub pipeline sources:** `create-pipeline` supports Azure Repos (`TfsGit`), GitHub, and GitHub Enterprise repository types. GitHub types require `repositoryUrl` and `serviceConnectionId`. Use `list-svc-conns` to find the service connection ID.

## Related Package

For wiki, work item, and pull request operations, see `@mcp-consultant-tools/azure-devops` — [Documentation](./AZURE_DEVOPS.md).
