# Azure Data Factory

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/AZURE_DATA_FACTORY_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/azure-data-factory`

MCP server for Azure Data Factory providing pipeline execution, monitoring, and error debugging across one or multiple factories.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "azure-data-factory": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-data-factory@beta", "mcp-adf"],
      "env": {
        "AZURE_DATA_FACTORY_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_DATA_FACTORY_RESOURCE_GROUP": "your-resource-group",
        "AZURE_DATA_FACTORY_NAME": "your-factory-name",
        "AZURE_TENANT_ID": "op://Work/ADF-App-Registration/tenantid",
        "AZURE_CLIENT_ID": "op://Work/ADF-App-Registration/username",
        "AZURE_CLIENT_SECRET": "op://Work/ADF-App-Registration/password",
        "AZURE_DATA_FACTORY_ENABLE_WRITE": "false",
        "AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL": "false"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "azure-data-factory": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-data-factory", "mcp-adf"],
      "env": {
        "AZURE_DATA_FACTORY_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_DATA_FACTORY_RESOURCE_GROUP": "your-resource-group",
        "AZURE_DATA_FACTORY_NAME": "your-factory-name",
        "AZURE_TENANT_ID": "your-tenant-id",
        "AZURE_CLIENT_ID": "your-client-id",
        "AZURE_CLIENT_SECRET": "your-client-secret",
        "AZURE_DATA_FACTORY_ENABLE_WRITE": "false",
        "AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL": "false"
      }
    }
  }
}
```

The first three vars (`SUBSCRIPTION_ID`, `RESOURCE_GROUP`, `NAME`) configure single-factory mode. The two feature flags are disabled by default. For managing multiple factories, replace the single-factory vars with `AZURE_DATA_FACTORIES` (JSON array). See the technical doc for the full schema.

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "azure-data-factory": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Notable Behavior

- **Read-only by default.** Pipeline execution, cancellation, and rerun require `AZURE_DATA_FACTORY_ENABLE_WRITE=true`. Trigger start/stop requires a separate `AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL=true` flag.
- **Linked service credentials are always redacted.** `adf-list-linked-services` automatically replaces connection strings, passwords, keys, and tokens with `[REDACTED]`.
- **Rerun from failure.** `adf-rerun-pipeline` looks up the original run automatically — pass the failed `runId`, not the pipeline name.
- **Debug runs: query yes, execute no.** *Executing* an unpublished/debug run is not possible through the REST API — `adf-run-pipeline` always runs the published version. But *querying* debug-run history (runs launched via the ADF Studio "Debug" button) IS possible: `adf-query-debug-pipeline-runs` reads them via an undocumented ARM operation that works with app-only auth given Data Factory Contributor RBAC. Debug-run history is retained server-side for only ~15 days, and results report `truncated` rather than a total count.
