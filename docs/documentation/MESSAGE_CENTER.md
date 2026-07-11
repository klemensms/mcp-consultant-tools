# Microsoft 365 Message Center & Service Health

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/MESSAGE_CENTER_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/message-center`

MCP server for Microsoft 365 **Service Health** and **Message Center**: the current health of every service, service-health issues (incidents and advisories), post-incident review documents, and Message Center posts (planned changes, required actions, advisories). **Every tool is read-only** — there are no write operations and no feature flags.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

The `MESSAGE_CENTER_*` variables are deliberately distinct from the shared `AZURE_*` service-principal block used by `azure-management` and `azure-defender`. Those need subscription RBAC roles; this server needs **Microsoft Graph directory permissions** instead, so the app registration behind it is usually a different one. There is no subscription ID here.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for the full setup guide.

```json
{
  "servers": {
    "message-center": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/message-center@beta", "mcp-message-center"],
      "env": {
        "MESSAGE_CENTER_TENANT_ID": "op://Work/M365-App-Registration/tenantid",
        "MESSAGE_CENTER_CLIENT_ID": "op://Work/M365-App-Registration/username",
        "MESSAGE_CENTER_CLIENT_SECRET": "op://Work/M365-App-Registration/password"
      }
    }
  }
}
```

### Claude Desktop — local credentials

```json
{
  "mcpServers": {
    "message-center": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/message-center@beta", "mcp-message-center"],
      "env": {
        "MESSAGE_CENTER_TENANT_ID": "your-tenant-id",
        "MESSAGE_CENTER_CLIENT_ID": "your-client-id",
        "MESSAGE_CENTER_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

All three variables are required.

## Required Graph permissions

| Permission | Type | Purpose |
|------------|------|---------|
| `ServiceHealth.Read.All` | Application | Health overviews, service-health issues, incident reports |
| `ServiceMessage.Read.All` | Application | Message Center posts |

Grant both as **application** permissions with admin consent — this server authenticates with client credentials and has no signed-in user.

## Prompts

| Prompt | Purpose |
|--------|---------|
| `m365-service-health-review` | Review current service health and report which services are impacted and what is unresolved right now |
| `m365-message-center-digest` | Summarise the Message Center posts that need administrator action, ordered by deadline and impact |

## Notable behavior

**Filters run client-side, so a truncated result under-reports.** Microsoft Graph does not filter the service-health-issues or messages collections server-side (the query options are undocumented and can fail silently), so this server fetches the collection and filters it in-process. When `truncated` is `true`, `maxResults` cut the list and the counts are a lower bound — omit `maxResults` for a full picture.

**Filters are case-insensitive on purpose.** Microsoft's own documentation is inconsistent about enum casing (the schema says `advisory`/`stayInformed`/`normal`; live payloads return `Advisory`/`StayInformed`/`Normal`). Pass the documented camelCase values — matching is case-insensitive either way, so a filter never silently matches zero rows because of casing.

**"Resolved" comes from the issue's `isResolved` flag, not its status text.** `m365-list-health-issues --is-resolved false` returns still-active issues; the `status` field is descriptive only.

**`m365-get-service-health` accepts either the display name or the id, in any case.** Pass `"Exchange Online"` or `"Exchange"`; an unknown name returns the list of available services rather than a bare not-found. Call `m365-list-service-health` first to see valid names.

**A post-incident review exists only for published issues.** `m365-get-incident-report` returns the PIR document only for issues whose status is `postIncidentReviewPublished`; for any other issue it returns a clear error. The document is returned as text when it decodes as UTF-8, otherwise as base64 (the `format` field says which).

## Reference

See [`docs/technical/MESSAGE_CENTER_TECHNICAL.md`](../technical/MESSAGE_CENTER_TECHNICAL.md) for the full tool reference, Graph query contract, known limitations, and troubleshooting.
