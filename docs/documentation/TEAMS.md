# Microsoft Teams

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/TEAMS_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/teams`

Read, send and manage Microsoft Teams channel messages and chats via the Microsoft Graph API. Supports both interactive (device-code) and automated (client-credentials) authentication.

## Tools

| Tool | Description |
|------|-------------|
| `authenticate` | Start sign-in (device-code returns a URL and one-time code) |
| `auth-status` | Check authentication state; renews silently if a refresh token is cached |
| `logout` | Clear the cached token |
| `list-teams` | List the Teams the app has access to (to find team IDs) |
| `list-channels` | List channels in a team (to find channel IDs) |
| `send-channel-message` | Send a plain-text or markdown message to a channel |
| `send-adaptive-card` | Send an Adaptive Card (built-in release templates or raw card JSON) |
| `get-channel-messages` | Read recent channel messages (default 20, newest first, replies excluded) |
| `get-message-replies` | Read the replies to one channel message |
| `reply-to-message` | Post a reply into an existing channel thread |
| `list-chats` | List the signed-in user's chats (1:1, group, meeting) |
| `get-chat-messages` | Read recent messages in a chat (default 20, newest first) |
| `send-chat-message` | Send a message to an existing chat |
| `mark-chat-read` | Clear a chat's unread state for the signed-in user |
| `react-to-channel-message` | Add or remove an emoji reaction on a channel message or thread reply |
| `react-to-chat-message` | Add or remove an emoji reaction on a chat message |

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
        "TEAMS_CLIENT_SECRET": "",
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
- **Device-code mode needs no client secret.** Leave `TEAMS_CLIENT_SECRET` empty and enable "Allow public client flows" on the registration. A registration used only in device-code mode holds no standing credential, which is the point — actions run solely in the signed-in user's context.
- **Delegated permissions required (device-code mode).** Grant admin consent for all eight, or reads will fail with 403: `User.Read`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`, `ChannelMessage.Send`, `Chat.ReadWrite`, `Group.Read.All`, `offline_access`.
- **Device-code flow:** Call the `authenticate` tool first to get a URL and one-time code, complete sign-in in a browser. Sign-in is then persistent — see token caching below.
- **Silent token refresh.** The MSAL token cache is stored encrypted (AES-256-GCM, machine-derived key, mode 0600) at `~/.mcp-consultant-tools/teams-token-cache-{clientId}.enc`. Because `offline_access` is requested, an expired access token is renewed from the cached refresh token without user interaction, so you are not sent back to the device-code flow every hour. Clear it with `logout`.
- **Upgrading from an earlier version:** the previous plaintext token file `~/.mcp-consultant-tools/teams-auth.json` carried a narrower scope set and no refresh token. It is deleted automatically on first run — authenticate once more to get a token with the full scope set.
- **Reads are bounded by default.** `get-channel-messages` and `get-chat-messages` return the 20 most recent messages; use `top` (max 50, the Graph limit) plus `since`/`until` to widen or narrow. Channel reads deliberately exclude thread replies so a wide skim stays cheap — pass a returned message ID to `get-message-replies` for those. Message bodies are rendered as plain text with the HTML stripped, and each message shows its ID because that is what `reply-to-message` needs.
- **`list-chats` "Last activity" is the last message.** Chats are ordered most-recently-active first, and the timestamp shown is when someone last spoke. It is not the same as the chat's own `lastUpdatedDateTime` (topic or membership changes), which can be weeks older.
- **Mentions and emoji survive a read.** A multi-word mention renders as one `@Jane Doe` rather than one tag per word, and emoji in message bodies are rendered as the character rather than dropped.
- **Date filtering differs by surface.** Chat reads filter server-side on `lastModifiedDateTime`. Channel reads filter client-side over the fetched page, because the Graph channel-messages endpoint supports neither `$filter` nor `$orderby` — widen `top` if a range returns fewer messages than expected.
- **Default team/channel:** Set `TEAMS_DEFAULT_TEAM_ID` and `TEAMS_DEFAULT_CHANNEL_ID` to avoid passing IDs on every tool call.
- **Adaptive Card templates:** `send-adaptive-card` supports three built-in templates (`release-announcement`, `beta-release`, `hotfix`) designed for release workflow announcements.
- **Reactions** are posted as the signed-in user. `reactionType` accepts the six Graph v1.0 values (`like`, `angry`, `sad`, `laugh`, `heart`, `surprised`); pass `action: "remove"` to clear one you previously set. Channel reactions can target a thread reply via `replyId`. The CLI accepts either `--remove` or `--action remove`.
- **Not supported by design:** no team or channel administration (no creating channels, managing members, or changing team settings), and no directory search (so @-mentions cannot be resolved by name). Chat creation is also unavailable — `send-chat-message` requires a chat that already exists.
- **Message search and channel-message delta are not built yet, but both are viable** — live testing confirmed `POST /search/query` (`entityTypes: ["chatMessage"]`, header `Prefer: include-unknown-enum-members`) and `GET /teams/{id}/channels/{id}/messages/delta` both return 200 on the eight consented scopes. They are candidates for a future release, not permanent exclusions.
