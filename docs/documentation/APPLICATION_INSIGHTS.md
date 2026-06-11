# Application Insights

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/APPLICATION_INSIGHTS_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/application-insights`

MCP server for Azure Application Insights providing 10 tools and 5 prompts for querying telemetry data — exceptions, performance metrics, dependencies, traces, and availability results. Read-only, production-safe.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "application-insights": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/application-insights@beta", "mcp-appins"],
      "env": {
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod-api\",\"name\":\"Production API\",\"appId\":\"your-app-id\",\"active\":true}]",
        "APPINSIGHTS_TENANT_ID": "op://Work/AppInsights-App-Registration/tenantid",
        "APPINSIGHTS_CLIENT_ID": "op://Work/AppInsights-App-Registration/username",
        "APPINSIGHTS_CLIENT_SECRET": "op://Work/AppInsights-App-Registration/password",
        "APPINSIGHTS_AUTH_METHOD": "entra-id"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "application-insights": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/application-insights", "mcp-appins"],
      "env": {
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod-api\",\"name\":\"Production API\",\"appId\":\"your-app-id\",\"active\":true}]",
        "APPINSIGHTS_TENANT_ID": "your-tenant-id",
        "APPINSIGHTS_CLIENT_ID": "your-client-id",
        "APPINSIGHTS_CLIENT_SECRET": "your-client-secret",
        "APPINSIGHTS_AUTH_METHOD": "entra-id"
      }
    }
  }
}
```

**Resource options:** supply `APPINSIGHTS_RESOURCES` — a JSON array of `{id, name, appId, active}` objects — for one or more resources (recommended), or set a single `APPINSIGHTS_APP_ID` as a fallback.

**Auth methods:** the default is Entra ID (`APPINSIGHTS_AUTH_METHOD=entra-id`, using tenant/client/secret, shown above). For API-key auth, set `APPINSIGHTS_AUTH_METHOD` to `api-key` and add an `apiKey` field to each resource inside the `APPINSIGHTS_RESOURCES` array — there is no top-level API-key env var. For example:

```json
"APPINSIGHTS_RESOURCES": "[{\"id\":\"prod-api\",\"name\":\"Production API\",\"appId\":\"your-app-id\",\"apiKey\":\"your-api-key\",\"active\":true}]"
```

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "application-insights": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `ai-exception-summary` | Exception summary report with frequency analysis and recommendations |
| `ai-performance-report` | Performance analysis with slowest operations and P95/P99 percentiles |
| `ai-dependency-health` | External dependency health with success rates per target |
| `ai-availability-report` | Availability test results and uptime statistics |
| `ai-troubleshooting-guide` | Comprehensive incident guide combining all telemetry sources |

## Notable Behavior

- **Multi-resource support**: Configure multiple Application Insights resources via `APPINSIGHTS_RESOURCES` JSON array. Each resource has an `active` flag for quick toggling without removing configuration. Use `ai-list-resources` to see configured resources and their IDs.
- **Auth method choice**: Entra ID gives 60 req/min with no daily cap. API key is limited to 15 req/min and 1,500 req/day — use Entra ID for production.
- **Timespans**: All time-range parameters use ISO 8601 duration format (`PT1H`, `PT12H`, `P1D`, `P7D`).
- **Trace severity levels**: `ai-get-traces` filters by numeric severity (0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical, default: 2).
