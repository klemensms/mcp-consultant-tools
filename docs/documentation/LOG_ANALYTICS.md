# Log Analytics

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/LOG_ANALYTICS_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/log-analytics`

MCP server providing KQL-based access to Azure Log Analytics workspaces, with specialized tools for Azure Functions troubleshooting, cross-table log investigation, and the sync function app sync debugging.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "log-analytics": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/log-analytics@beta", "mcp-loganalytics"],
      "env": {
        "LOGANALYTICS_WORKSPACE_ID": "your-workspace-guid",
        "LOGANALYTICS_TENANT_ID": "op://Work/LogAnalytics-App-Registration/tenantid",
        "LOGANALYTICS_CLIENT_ID": "op://Work/LogAnalytics-App-Registration/username",
        "LOGANALYTICS_CLIENT_SECRET": "op://Work/LogAnalytics-App-Registration/password",
        "LOGANALYTICS_AUTH_METHOD": "entra-id"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "log-analytics": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/log-analytics", "mcp-loganalytics"],
      "env": {
        "LOGANALYTICS_WORKSPACE_ID": "your-workspace-guid",
        "LOGANALYTICS_TENANT_ID": "your-tenant-id",
        "LOGANALYTICS_CLIENT_ID": "your-client-id",
        "LOGANALYTICS_CLIENT_SECRET": "your-client-secret",
        "LOGANALYTICS_AUTH_METHOD": "entra-id"
      }
    }
  }
}
```

**Workspace options:** set a single `LOGANALYTICS_WORKSPACE_ID`, or supply `LOGANALYTICS_RESOURCES` — a JSON array of `{id, name, workspaceId, active}` objects — for multiple workspaces.

**Shared credentials:** If Application Insights is already configured, `LOGANALYTICS_TENANT_ID/CLIENT_ID/CLIENT_SECRET` automatically fall back to `APPINSIGHTS_TENANT_ID/CLIENT_ID/CLIENT_SECRET`. A single Azure AD app registration covers both integrations.

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "log-analytics": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `la-workspace-summary` | Workspace health report: function stats, top errors, recommendations |
| `la-fn-troubleshooting` | Full troubleshooting guide for a specific Azure Function (logs, errors, stats, invocations) |
| `la-fn-performance` | Performance analysis report with invocation statistics |
| `la-logs-report` | Formatted log report with analysis for any table |

## Notable Behavior

- **Retry deduplication:** Investigation tools (`la-investigate-app`, `la-investigate-sync`, `la-get-error-summary`) group by `OperationId` by default, so a message that retried 10 times appears as 1 row with `RetryCount: 10`. Disable with `deduplicateRetries: false`. On `FunctionAppLogs`, which has no `OperationId`, the key is `FunctionInvocationId` and it collapses the log lines of one invocation rather than retries across invocations; the output names whichever key was used.
- **Sync function-app workspace naming:** `la-investigate-sync` expects workspace IDs matching the pattern `log-{env}-{client}-...` and auto-derives the sync function app name (`func-{env}-{client}-sc-sync-...`). Only relevant for the sync function app clients.
- **Column presets:** All query tools accept `columnPreset: "minimal" | "investigation" | "full"` to reduce token consumption. `minimal` (4 columns) reduces output by ~80%. Default is `full` for backwards compatibility.
- **Output format:** All tools accept `outputFormat: "json" | "markdown"`. Investigation tools default to `markdown`; query tools default to `json`.
- **Schema catalogue vs inventory:** `la-get-metadata` returns every table the workspace *could* hold - roughly 680 of them, near-identically for every workspace, including workspaces that have ingested nothing. Use it to check table and column names before writing KQL, never to answer "which tables does this workspace have". `la-list-workspace-tables` answers that, over a window you choose (default `P7D`), and says so when the answer is nothing.
- **Function stats are per function, not per `FunctionName`:** one Azure Function reaches `FunctionAppLogs.FunctionName` under up to three names, so `la-get-fn-stats` collapses them and reports what it collapsed in a `normalization` block. Row counts and execution totals are the un-inflated ones.
