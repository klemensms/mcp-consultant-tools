# Microsoft Teams

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/TEAMS_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/teams`

Send messages and Adaptive Cards to Microsoft Teams channels via the Microsoft Graph API. Supports both interactive (device-code) and automated (client-credentials) authentication.

## Tools

| Tool | Description |
|------|-------------|
| `send-channel-message` | Send a plain-text or markdown message to a channel |
| `send-adaptive-card` | Send an Adaptive Card (built-in release templates or raw card JSON) |
| `list-teams` | List the Teams the app has access to (to find team IDs) |
| `list-channels` | List channels in a team (to find channel IDs) |

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "teams": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/teams@beta", "mcp-teams"],
      "env": {
        "TEAMS_TENANT_ID": "op://Work/Teams-App-Registration/tenantid",
        "TEAMS_CLIENT_ID": "op://Work/Teams-App-Registration/username",
        "TEAMS_AUTH_MODE": "device-code",
        "TEAMS_CLIENT_SECRET": "op://Work/Teams-App-Registration/password",
        "TEAMS_DEFAULT_TEAM_ID": "",
        "TEAMS_DEFAULT_CHANNEL_ID": ""
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "teams": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/teams", "mcp-teams"],
      "env": {
        "TEAMS_TENANT_ID": "your-azure-tenant-id",
        "TEAMS_CLIENT_ID": "your-app-client-id",
        "TEAMS_AUTH_MODE": "device-code",
        "TEAMS_CLIENT_SECRET": "",
        "TEAMS_DEFAULT_TEAM_ID": "",
        "TEAMS_DEFAULT_CHANNEL_ID": ""
      }
    }
  }
}
```

**For automation (client-credentials mode):**

```json
{
  "servers": {
    "teams": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/teams", "mcp-teams"],
      "env": {
        "TEAMS_AUTH_MODE": "client-credentials",
        "TEAMS_TENANT_ID": "your-azure-tenant-id",
        "TEAMS_CLIENT_ID": "your-app-client-id",
        "TEAMS_CLIENT_SECRET": "your-client-secret",
        "TEAMS_DEFAULT_TEAM_ID": "optional-default-team-guid",
        "TEAMS_DEFAULT_CHANNEL_ID": "optional-default-channel-guid"
      }
    }
  }
}
```

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "teams": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Notable Behavior

- **`TEAMS_CLIENT_ID` is always required** — both device-code and client-credentials modes require your own Azure AD app registration.
- **Device-code flow:** Call the `authenticate` tool first to get a URL and one-time code, complete sign-in in a browser. The token is cached at `~/.mcp-consultant-tools/teams-auth.json` for reuse across sessions.
- **Default team/channel:** Set `TEAMS_DEFAULT_TEAM_ID` and `TEAMS_DEFAULT_CHANNEL_ID` to avoid passing IDs on every tool call.
- **Adaptive Card templates:** `send-adaptive-card` supports three built-in templates (`release-announcement`, `beta-release`, `hotfix`) designed for release workflow announcements.
