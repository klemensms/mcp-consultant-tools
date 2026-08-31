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
| `update-channel-message` | Correct a channel message already posted, in place |
| `delete-channel-message` | Withdraw a channel message already posted (soft delete, reversible) |
| `undo-delete-channel-message` | Restore a channel message that was soft-deleted |
| `list-chats` | List the signed-in user's chats (1:1, group, meeting) |
| `get-chat-messages` | Read recent messages in a chat (default 20, newest first) |
| `send-chat-message` | Send a message to an existing chat |
| `mark-chat-read` | Clear a chat's unread state for the signed-in user |
| `update-chat-message` | Correct a chat message already sent, in place |
| `delete-chat-message` | Withdraw a chat message already sent (soft delete, reversible) |
| `undo-delete-chat-message` | Restore a chat message that was soft-deleted |
| `react-to-channel-message` | Add or remove an emoji reaction on a channel message or thread reply |
| `react-to-chat-message` | Add or remove an emoji reaction on a chat message |
| `find-user` | Find people in the directory by name, email or UPN (returns the AAD id an @-mention needs) |
| `send-direct-message` | DM a person by name or email, without needing a chat ID |
| `search-messages` | Keyword search across channel and chat messages at once |
| `get-channel-messages-delta` | Read only what changed in a channel since a previous call |

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
- **Delegated permissions required (device-code mode).** Grant admin consent for all ten, or sign-in itself fails: `User.Read`, `User.ReadBasic.All`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`, `ChannelMessage.Send`, `Chat.ReadWrite`, `Chat.Create`, `Group.Read.All`, `offline_access`. Do **not** add `ChannelMessage.Edit` — Entra returns it in the token whether or not you ask for it, and Graph rejects it on every published method, so it enables nothing.
- **Editing or deleting a *channel* message needs one further scope: `ChannelMessage.ReadWrite`.** It is admin-consent gated, and the server deliberately never requests it. Entra returns every admin-consented scope in the token regardless of what is asked for, so granting it on the registration is enough — no code change, and no need to sign in again, since the cached refresh token picks it up on its next silent renewal. It is left out of the requested list on purpose: a registration that has *not* consented it would fail at **sign-in** rather than on the one call that needed it, taking the whole server down instead of three tools.
- **Device-code flow:** Call the `authenticate` tool first to get a URL and one-time code, complete sign-in in a browser. Sign-in is then persistent — see token caching below.
- **Silent token refresh.** The MSAL token cache is stored encrypted (AES-256-GCM, machine-derived key, mode 0600) at `~/.mcp-consultant-tools/teams-token-cache-{clientId}.enc`. Because `offline_access` is requested, an expired access token is renewed from the cached refresh token without user interaction, so you are not sent back to the device-code flow every hour. Clear it with `logout`.
- **Upgrading from an earlier version:** the previous plaintext token file `~/.mcp-consultant-tools/teams-auth.json` carried a narrower scope set and no refresh token. It is deleted automatically on first run — authenticate once more to get a token with the full scope set.
- **Reads are bounded by default.** `get-channel-messages` and `get-chat-messages` return the 20 most recent messages; use `top` (max 50, the Graph limit) plus `since`/`until` to widen or narrow. Channel reads deliberately exclude thread replies so a wide skim stays cheap - pass a returned message ID to `get-message-replies` for those. Message bodies are rendered as plain text with the HTML stripped, and each message shows its ID because that is what `reply-to-message` needs. Links keep their URLs as markdown, and attachments are named: a file or link-preview card renders as `[attachment: name - url]` and a quoted reply as `[quoted reply from Sender: the quoted text]`.
- **`list-chats` "Last activity" is the last message.** Chats are ordered most-recently-active first, and the timestamp shown is when someone last spoke. It is not the same as the chat's own `lastUpdatedDateTime` (topic or membership changes), which can be weeks older.
- **Mentions and emoji survive a read.** A multi-word mention renders as one `@Jane Doe` rather than one tag per word, and emoji in message bodies are rendered as the character rather than dropped.
- **Date filtering differs by surface.** Chat reads filter server-side on `lastModifiedDateTime`. Channel reads filter client-side over the fetched page, because the Graph channel-messages endpoint supports neither `$filter` nor `$orderby` — widen `top` if a range returns fewer messages than expected.
- **Default team/channel:** Set `TEAMS_DEFAULT_TEAM_ID` and `TEAMS_DEFAULT_CHANNEL_ID` to avoid passing IDs on every tool call.
- **Adaptive Card templates:** `send-adaptive-card` supports three built-in templates (`release-announcement`, `beta-release`, `hotfix`) designed for release workflow announcements.
- **Reactions** are posted as the signed-in user. `reactionType` accepts the six Graph v1.0 values (`like`, `angry`, `sad`, `laugh`, `heart`, `surprised`); pass `action: "remove"` to clear one you previously set. Channel reactions can target a thread reply via `replyId`. The CLI accepts either `--remove` or `--action remove`.
- **@-mentions:** write `@[Jane Doe]` or `@[jdoe@example.com]` inline in any message — `send-channel-message`, `reply-to-message`, `send-chat-message` and `send-direct-message` all resolve them. The square brackets are required; a bare `@Jane` is sent as plain text, because there is no way to know where the name ends.
- **A name that is not a colleague will not be messaged.** Your directory holds guests as well as staff — suppliers, client contacts, personal addresses invited to a channel — and `find-user` returns them, marked as guests. `send-direct-message` and @-mentions refuse to act on a guest identified by name alone, however unambiguous that name is, and tell you the address to re-run with. Naming their exact email address goes through. Without this, a first name matching one outsider and no colleague would quietly send outside the organisation.
- **An ambiguous name is never guessed at.** Several matches are reported back with the candidates and nothing is sent; an exact email, UPN or full display name beats partial hits.
- **`search-messages` covers channels and chats in one call**, and each hit carries the ids and a link for reading the surrounding thread. `total` is Graph's estimate over the whole matching set, so "20 of about 340" means you are looking at the first page. Widen with `top` (max 50) or page with `from`.
- **A cold `get-channel-messages-delta` is expensive.** Graph does not honour "give me a token from here", so the first call must page to the end of the channel's history to earn a `deltaLink`. `maxPages` (default 10) bounds that, and a walk that stops early returns **no** deltaLink rather than one that would silently skip everything past the cut. For a one-off skim, `get-channel-messages` is cheaper.
- **A sent message can be corrected in place, in a chat or a channel.** `update-chat-message` and `update-channel-message` replace the whole body of a message you sent, and Teams marks it "Edited" as it would for any manual edit. The channel tools also take a `replyId` to act on one reply inside a thread. The channel three need `ChannelMessage.ReadWrite`; without it they return a 403 that says so plainly rather than failing obscurely.
- **An edit replaces the entire body, not part of it.** Graph offers no partial update, so an @-mention in the original must be restated in the replacement or it is lost.
- **Your tenant may forbid deleting sent messages, and this is common.** If a delete returns `AclCheckFailed`, Teams refused it rather than Graph: the scope and the request were both accepted. That is a Teams messaging policy set by an administrator, it applies to chats and channels alike, and no scope change or re-authentication will help. The quick check is whether the Teams client offers **Delete** on the same message. Editing is governed by a separate policy switch, so edit frequently works where delete does not.
- **Graph will not edit or delete an old message.** Beyond a recent window it answers `403 InsufficientPrivileges` with `MessageIdNotInAllowedRange`, which reads like a permissions failure and is not one. The tools name the real cause.
- **Not supported by design:** no team or channel administration — no creating channels, managing members, or changing team settings.
