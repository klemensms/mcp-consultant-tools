# Teams Package Guide

## Overview

Microsoft Teams integration for reading, sending and managing channel messages and chats. Originally built for automated release announcements; extended in v35 so an agent can read and act on Teams on the user's behalf.

- **Tools:** 14 tools
- **Authentication:** Device Code (default, personal credentials) or Client Credentials (app-only)
- **Services:** `TeamsService` (auth, discovery, channel sends) and `MessageService` (message reads, replies, chats). `MessageService` shares `TeamsService`'s authenticated Graph client rather than owning auth, so there is one token cache and one sign-in for the package.

## Scope Boundary (HARD RULE)

The device-code flow requests exactly these eight delegated scopes, defined once as `DEVICE_CODE_SCOPES` in `src/services/teams-service.ts`:

```
User.Read, Team.ReadBasic.All, Channel.ReadBasic.All, ChannelMessage.Read.All,
ChannelMessage.Send, Chat.ReadWrite, Group.Read.All, offline_access
```

**Do not add a scope to that array unless it has tenant-wide admin consent.** An unconsented scope cannot be self-consented in a tenant that classifies it as anything other than low impact, so it fails at *sign-in* rather than degrading gracefully on the call that needed it — which takes the whole server down, not one tool. If a new capability needs a ninth scope, stop and raise it rather than implementing it.

Verified against the Graph v1.0 permission tables, these are reachable on the set above:

| Operation | Least-privileged delegated permission |
|-----------|---------------------------------------|
| `GET /teams/{t}/channels/{c}/messages` | `ChannelMessage.Read.All` |
| `GET .../messages/{m}/replies` | `ChannelMessage.Read.All` |
| `POST .../messages/{m}/replies` | `ChannelMessage.Send` |
| `GET /me/chats`, `GET /chats/{c}/members` | `Chat.ReadBasic` (`Chat.ReadWrite` is higher) |
| `GET /chats/{c}/messages` | `Chat.Read` (`Chat.ReadWrite` is higher) |
| `POST /chats/{c}/messages` | `ChatMessage.Send` (`Chat.ReadWrite` is higher) |
| `POST /chats/{c}/markChatReadForUser` | `Chat.ReadWrite` (only permission listed) |
| `POST .../messages/{m}/setReaction` (channel) | `ChannelMessage.Send` |
| `POST /chats/{c}/messages/{m}/setReaction` | `Chat.ReadWrite` |

Deliberately **not** implemented, and why:

- **`search-messages`** (`POST /search/query` with `entityTypes: ["chatMessage"]`) — the delegated permission list names `Chat.Read`, *not* `Chat.ReadWrite`. Graph search enforces its literal list rather than treating ReadWrite as a superset of Read, so this is expected to 403 on the current scope set. Would need `Chat.Read` as a ninth scope.
- **Channel messages `delta`** — no delegated channel-message delta endpoint is documented in v1.0 or beta. The surviving `chatmessage-delta` reference covers `/users/{id}/chats/getAllMessages/delta`, which is application-permission only.
- **Reactions** — permitted by the scope set (see table), but not built. Cheap to add if wanted.
- **@-mentions** — possible only for AAD user ids already present in data that has been read (`authorId` is returned on every message). This registration cannot search the directory by name, and no directory-lookup tool should be added.
- **Team/channel administration** — out of scope entirely: no creating channels, no managing members, no changing team settings.

## Authentication Modes

### Device Code (Default) - Personal Credentials

Use your personal Microsoft account with a custom Azure AD app registration.

```bash
# Required - Custom app registration
TEAMS_TENANT_ID=your-azure-tenant-id
TEAMS_CLIENT_ID=your-app-client-id

# Optional - Default targets for posting
TEAMS_DEFAULT_TEAM_ID=team-guid
TEAMS_DEFAULT_CHANNEL_ID=channel-guid
```

**App Registration Setup:**
1. Go to https://entra.microsoft.com → **App registrations** → **New registration**
2. Name: `MCP Teams Integration` (or similar)
3. Supported account types: **Single tenant**
4. In **Authentication** → Enable **"Allow public client flows"**
5. In **API permissions** → Add **Microsoft Graph** → **Delegated permissions** (all eight — see Scope Boundary above):
   - `User.Read`
   - `Team.ReadBasic.All`
   - `Channel.ReadBasic.All`
   - `ChannelMessage.Read.All`
   - `ChannelMessage.Send`
   - `Chat.ReadWrite`
   - `Group.Read.All`
   - `offline_access`
6. Click **Grant admin consent**

No client secret and no certificate: device-code mode holds no standing credential and runs only in the signed-in user's context.

**How it works:**
1. Call the `authenticate` tool
2. You'll receive a URL and code
3. Open the URL in your browser, enter the code, sign in
4. Authentication completes automatically
5. The MSAL token cache (with refresh token) is persisted encrypted for future sessions
6. Actions are performed as your user account (delegated permissions)

### Client Credentials - App Registration

Use an Azure AD app registration for automation (no user interaction).

```bash
# Required for client-credentials mode
TEAMS_AUTH_MODE=client-credentials
TEAMS_TENANT_ID=your-azure-tenant-id
TEAMS_CLIENT_ID=your-app-client-id
TEAMS_CLIENT_SECRET=your-client-secret

# Optional - Default targets for posting
TEAMS_DEFAULT_TEAM_ID=team-guid
TEAMS_DEFAULT_CHANNEL_ID=channel-guid
```

**Required App Permissions (Application, NOT Delegated):**

| Permission | Purpose |
|------------|---------|
| `ChannelMessage.Send` | Send messages to channels |
| `Group.Read.All` | List teams and channels |
| `Team.ReadBasic.All` | Read team information |

**Admin consent required:** Yes

## Tools

### Authentication Tools

#### authenticate

Start the authentication flow. For device-code mode, returns URL and code for browser sign-in.

```typescript
// No parameters - just call it
{}
```

**Response (device-code mode):**
```
🔐 Teams Authentication Required

1. Open this URL: https://microsoft.com/devicelogin
2. Enter this code: ABC123XYZ
3. Sign in with your Microsoft account

⏱️ This code expires in 15 minutes.
```

#### auth-status

Check current authentication status.

```typescript
// No parameters
{}
```

#### logout

Clear cached authentication tokens.

```typescript
// No parameters
{}
```

### Messaging Tools

#### send-channel-message

Send text or markdown messages to a Teams channel.

```typescript
{
  teamId?: string,      // Optional if default set
  channelId?: string,   // Optional if default set
  message: string,      // Required - the message content
  format?: "text" | "markdown",  // Default: "markdown"
  importance?: "normal" | "high" | "urgent"  // Default: "normal"
}
```

#### send-adaptive-card

Send Adaptive Cards with pre-built templates or raw JSON.

**Templates available:**
- `release-announcement` - Standard release card
- `beta-release` - Beta release with warning styling
- `hotfix` - Urgent hotfix notification

```typescript
// Using a template
{
  template: "release-announcement",
  templateData: {
    packageName: "@mcp-consultant-tools/azure-devops",
    version: "27.0.0",
    summary: "New work item sync tools",
    date: "2025-01-16",
    releaseType: "Minor Release",
    changes: "- Added sync-work-item-to-file\n- Added sync-work-item-from-file",
    releaseNotesUrl: "https://github.com/..."
  }
}

// Using raw card
{
  card: {
    type: "AdaptiveCard",
    version: "1.4",
    body: [...]
  }
}
```

#### list-teams

List Teams the app/user has access to.

#### list-channels

List channels in a team to find channel IDs.

### Message Read Tools

All reads default to the 20 most recent messages and cap at Graph's maximum of 50. Bodies are returned as plain text with HTML stripped; each message shows author, timestamp and ID.

#### get-channel-messages

```typescript
{
  teamId?: string,     // Optional if default set
  channelId?: string,  // Optional if default set
  top?: number,        // 1-50, default 20
  since?: string,      // ISO-8601, e.g. "2026-08-01T00:00:00Z"
  until?: string       // ISO-8601
}
```

Excludes thread replies by design. `since`/`until` are applied client-side over the fetched page — widen `top` if a range looks short.

#### get-message-replies

```typescript
{ messageId: string, teamId?: string, channelId?: string, top?: number }
```

#### reply-to-message

```typescript
{
  messageId: string,
  message: string,
  teamId?: string,
  channelId?: string,
  format?: "text" | "markdown"  // Default: "markdown"
}
```

### Chat Tools

#### list-chats

```typescript
{ top?: number, includeMembers?: boolean }
```

Most recently active first. `includeMembers` expands member display names — useful for naming one-on-one chats, which have no topic. Graph caps expanded members at 25 per chat regardless of `top`.

#### get-chat-messages

```typescript
{ chatId: string, top?: number, since?: string, until?: string }
```

Range filters are applied server-side against `lastModifiedDateTime`.

#### send-chat-message

```typescript
{ chatId: string, message: string, format?: "text" | "markdown" }
```

Cannot create a chat — use `list-chats` to find an existing one.

#### mark-chat-read

```typescript
{ chatId: string }
```

Posts the signed-in user's own AAD identity (resolved via `User.Read`), which the Graph action requires.

## Typical Usage Flow

### Device Code (Personal Credentials)

1. **First time:** Call `authenticate` → get URL/code → sign in browser
2. **Discover:** `list-teams` → `list-channels`, or `list-chats`
3. **Read:** `get-channel-messages` / `get-chat-messages`, then `get-message-replies` on any thread worth expanding
4. **Act:** `reply-to-message`, `send-channel-message`, `send-chat-message`, `mark-chat-read`
5. **Token expired:** nothing to do — it renews silently from the cached refresh token
6. **Refresh token expired or revoked:** `auth-status` reports `expired`; call `authenticate` again

### Client Credentials (App Registration)

1. **Configure env:** Set `TEAMS_AUTH_MODE=client-credentials` + credentials
2. **Use tools directly:** No manual authentication needed

## Key Implementation Details

### Token Caching and Silent Refresh

`src/auth/token-cache.ts` implements an MSAL `ICachePlugin` that persists `tokenCache.serialize()` encrypted with AES-256-GCM under a key derived from hostname + username, at mode 0600:

```
~/.mcp-consultant-tools/teams-token-cache-{clientId}.enc
```

`getAccessToken()` tries the in-memory token, then `getAllAccounts()` → `acquireTokenSilent()`, and only then reports "not authenticated". `InteractionRequiredAuthError` (refresh token expired or revoked) falls back to device code; any other error propagates. This is what makes `offline_access` worth requesting — before v35 the bare access token expired after ~1h and forced a fresh device-code flow.

Pattern follows `packages/powerplatform-core/src/auth/token-cache.ts`. It is **not** shared code: `powerplatform-core` is a PowerPlatform-specific internal library (wrong dependency direction), and `@mcp-consultant-tools/core` has no `@azure/msal-node` dependency — adding one there would pull MSAL into every package in the monorepo.

**Legacy migration.** The pre-v35 plaintext `~/.mcp-consultant-tools/teams-auth.json` is deleted on construction, not migrated. It holds a five-scope token with no refresh token; reusing it silently produces a 403 on every read tool with no visible cause. `logout` removes the MSAL account from the in-memory cache *and* both files, so logout-then-status in one process reports `not_authenticated` rather than resurrecting the account.

**403 handling.** `MessageService` wraps 403s with an explicit "run logout then authenticate" hint, because a stale narrow scope set is invisible from the raw Graph error text.

### Message Content Conversion

`src/message-content.ts` is the single place message content is converted, in both directions:

- `markdownToHtml()` — outbound. Every send/reply path routes through it, so model-generated markup never reaches Graph unsanitized. Uses `marked` + `dompurify` (bold, italic, code, lists, headings, tables, blockquotes; `<script>`, event handlers and `<img>` stripped).
- `sanitizeHtml()` — outbound, for caller-supplied HTML, same allowlist.
- `htmlToText()` — inbound. Flattens Teams' nested-div bodies to readable text, renders `<at>` mentions as `@Name`, and replaces images/attachments/system events with placeholders (their content is a Graph `hostedContents` URL, useless to a reader).
- `truncateText()` — caps each rendered body so one wide read cannot exhaust a context window.

This function was previously duplicated as a private `markdownToHtml` in both `tools/send-message.ts` and `cli/commands/message-commands.ts`; both now import it.

### Read Tool Design

Output volume is the main risk. Reads default to 20 messages (Graph max 50 via `top`), and `get-channel-messages` deliberately does **not** expand each thread's replies — `get-message-replies` is separate so a wide skim stays cheap. Every rendered message carries its `id`, because that is the input `reply-to-message` needs.

Date ranges behave differently per surface, and this is a Graph constraint rather than a choice: chat messages support `$filter` server-side but **only when `$orderby` names the same property**, so ranges are expressed against `lastModifiedDateTime` (the one property accepting both `gt` and `lt`). Channel messages support neither `$filter` nor `$orderby`, so the range is applied client-side over the fetched page.

### Testing

`npm run test --workspace=packages/teams` (vitest). `src/services/__tests__/message-service.test.ts` stubs the fluent Graph chain and asserts the exact path/query that would go on the wire, using **real response payloads copied from the Graph v1.0 reference** for each endpoint. This exists because the two failure classes here — wrong endpoint path/query and mishandled response shape — are catchable without credentials, while permission failures are not.

## Reference

See `docs/plans/teams-mcp-server.md` for full design documentation.

## CLI Usage

Binary: `mcp-teams-cli`. Every MCP tool has a matching command (parity is non-negotiable in this repo).

```bash
# Auth
mcp-teams-cli auth login
mcp-teams-cli auth status
mcp-teams-cli auth logout

# Discovery
mcp-teams-cli list-teams
mcp-teams-cli list-channels <teamId>

# Channel reads
mcp-teams-cli get-channel-messages --top 20
mcp-teams-cli get-channel-messages -t <teamId> -c <channelId> --since 2026-08-01T00:00:00Z
mcp-teams-cli get-message-replies <messageId>

# Channel writes
mcp-teams-cli send-message "Hello from CLI!"
mcp-teams-cli reply-to-message <messageId> "Thanks, looking now"

# Chats
mcp-teams-cli list-chats --members
mcp-teams-cli get-chat-messages <chatId> --top 10
mcp-teams-cli send-chat-message <chatId> "On my way"
mcp-teams-cli mark-chat-read <chatId>
```

Add `--json` for raw JSON. Full responses are also written to `.context/.mcp-teams-cache/`.
