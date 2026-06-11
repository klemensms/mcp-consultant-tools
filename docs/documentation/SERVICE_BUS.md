# Azure Service Bus

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/SERVICE_BUS_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/service-bus`

Read-only inspection of Azure Service Bus queues and dead letter queues for troubleshooting, monitoring, and message investigation across single or multiple namespaces.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for the full setup guide.

```json
{
  "servers": {
    "service-bus": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/service-bus@beta", "mcp-sb"],
      "env": {
        "SERVICEBUS_NAMESPACE": "your-namespace.servicebus.windows.net",
        "SERVICEBUS_TENANT_ID": "op://Work/ServiceBus-App-Registration/tenantid",
        "SERVICEBUS_CLIENT_ID": "op://Work/ServiceBus-App-Registration/username",
        "SERVICEBUS_CLIENT_SECRET": "op://Work/ServiceBus-App-Registration/password",
        "SERVICEBUS_SANITIZE_MESSAGES": "false"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "service-bus": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/service-bus", "mcp-sb"],
      "env": {
        "SERVICEBUS_NAMESPACE": "your-namespace.servicebus.windows.net",
        "SERVICEBUS_TENANT_ID": "your-tenant-id",
        "SERVICEBUS_CLIENT_ID": "your-client-id",
        "SERVICEBUS_CLIENT_SECRET": "your-client-secret",
        "SERVICEBUS_SANITIZE_MESSAGES": "false"
      }
    }
  }
}
```

**Namespace options:** set a single `SERVICEBUS_NAMESPACE`, or supply `SERVICEBUS_RESOURCES` — a JSON array of `{id, name, namespace, active}` objects — for multiple namespaces.

**Auth methods:** the default is Entra ID (tenant/client/secret, shown above). For connection-string auth, set `SERVICEBUS_AUTH_METHOD` to `connection-string` and provide `SERVICEBUS_CONNECTION_STRING` (the connection string is ignored unless the auth method is set).

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "service-bus": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `sb-namespace-overview` | Comprehensive namespace overview with all queues and health metrics |
| `sb-queue-health` | Detailed health report for a specific queue with recommendations |
| `sb-deadletter-analysis` | DLQ investigation with pattern detection and actionable recommendations |
| `sb-message-inspection` | Detailed single message inspection with cross-service troubleshooting suggestions |

## Notable Behavior

- All message operations use `peekMessages()` only — messages are never consumed, removed, or modified. This makes all tools safe to run in production.
- Queue lists are cached for ~5 minutes to reduce API calls; run `sb-list-queues` again after that interval to see fresh counts.
- `SERVICEBUS_SANITIZE_MESSAGES=true` redacts message bodies and application properties matching sensitive patterns before returning results. Disabled by default.
- Multi-namespace mode (`SERVICEBUS_RESOURCES` JSON array) supports an `active` flag per namespace — set `"active": false` to disable a namespace without removing its config.

## Coming later (not yet active)

These tuning variables are planned but **not yet wired up** — setting them currently has no effect, and the server uses fixed built-in values. They are documented here so the intended configuration surface isn't lost:

| Variable | Purpose (planned) |
|----------|-------------------|
| `SERVICEBUS_MAX_PEEK_MESSAGES` | Max messages peeked per queue request |
| `SERVICEBUS_MAX_SEARCH_MESSAGES` | Max messages scanned during a search |
| `SERVICEBUS_PEEK_TIMEOUT` | Peek operation timeout (ms) |
| `SERVICEBUS_RETRY_MAX_ATTEMPTS` | Max retry attempts on transient failures |
| `SERVICEBUS_RETRY_DELAY` | Delay between retries (ms) |
| `SERVICEBUS_CACHE_QUEUE_LIST_TTL` | Queue-list cache lifetime (seconds) |
