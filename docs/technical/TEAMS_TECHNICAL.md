# Teams - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/TEAMS.md -->

<overview>

The Teams integration sends messages and Adaptive Cards to Microsoft Teams channels via the Microsoft Graph API. Authentication is handled by MSAL (Microsoft Authentication Library) in two modes: device-code (interactive, delegated permissions) and client-credentials (automated, application permissions).

**Package:** `@mcp-consultant-tools/teams`
**Binaries:** `mcp-teams` (MCP server), `mcp-teams-cli` (CLI)
**Tools:** 7 total (3 auth + 4 messaging)

</overview>

<architecture>

## Package Structure

```
packages/teams/src/
  index.ts                    # MCP server entry point
  context-factory.ts          # Shared createServiceContext() for CLI
  types.ts                    # TypeScript interfaces (TeamsConfig, AdaptiveCard, etc.)
  tool-examples.ts            # descWithExamples() + domain-specific example arrays
  cli.ts                      # CLI entry point (Commander.js)
  message-content.ts          # markdownToHtml / sanitizeHtml / htmlToText / truncateText
  auth/
    token-cache.ts            # MSAL ICachePlugin, AES-256-GCM encrypted at rest
  services/
    index.ts                  # Barrel export
    teams-service.ts          # TeamsService class (auth + discovery + channel sends)
    message-service.ts        # MessageService class (message reads, replies, chats)
    __tests__/
      message-service.test.ts # Stubbed-Graph tests: endpoint paths + response mapping
  tools/
    index.ts                  # registerAllTools() aggregator
    authenticate.ts           # authenticate, auth-status, logout tools
    send-message.ts           # send-channel-message tool
    send-card.ts              # send-adaptive-card tool
    list-channels.ts          # list-teams, list-channels tools
    read-channel.ts           # get-channel-messages, get-message-replies, reply-to-message
    chats.ts                  # list-chats, get-chat-messages, send-chat-message, mark-chat-read
    format-messages.ts        # Shared reader-facing rendering for messages and chats
  cards/
    templates.ts              # Adaptive Card template builders
  cli/
    output.ts                 # Cache dir: .mcp-teams-cache
    commands/
      index.ts                # registerAllCommands() aggregator
      auth-commands.ts        # auth login/status/logout
      message-commands.ts     # list-teams, list-channels, send-message, send-card
      read-commands.ts        # the 7 read/reply/chat commands (CLI parity)
```

**Service split.** `MessageService` takes `TeamsService` in its constructor and calls `teams.getGraphClient()`, so auth, the token cache and the sign-in are owned in exactly one place. `TeamsService` exposes `getGraphClient()`, `getTeamId()`, `getChannelId()`, `getMe()` and `getTenantId()` for that purpose. The split exists to keep each service near the repo's <500-line target rather than pushing `teams-service.ts` toward the 1,000-line hard limit.

## ServiceContext

`types.ts` defines a single-service context:

```typescript
export interface ServiceContext {
  readonly teams: TeamsService;
}
```

Both `index.ts` and `context-factory.ts` create this with a lazy getter — `TeamsService` is instantiated on the first tool call, at which point environment variables are validated.

## Environment Variable Validation

Validation occurs in `createServiceContext()` when the service is first accessed:

- `TEAMS_CLIENT_ID` — always required; throws with Azure portal instructions if missing
- `TEAMS_TENANT_ID` — always required; throws with Azure portal instructions if missing
- `TEAMS_CLIENT_SECRET` — required only when `TEAMS_AUTH_MODE=client-credentials`

</architecture>

<authentication>

## Authentication Modes

| Mode | `TEAMS_AUTH_MODE` value | User interaction | MSAL client type |
|------|------------------------|------------------|------------------|
| Device Code (default) | `device-code` (or omit) | Yes — browser sign-in | `PublicClientApplication` |
| Client Credentials | `client-credentials` | None | `ConfidentialClientApplication` |

<auth-mode name="device-code">

### Device Code Flow

**Scopes requested** (`DEVICE_CODE_SCOPES` in `services/teams-service.ts`):
- `User.Read`
- `Team.ReadBasic.All`
- `Channel.ReadBasic.All`
- `ChannelMessage.Read.All`
- `ChannelMessage.Send`
- `Chat.ReadWrite`
- `Group.Read.All`
- `offline_access`

> **Do not add an unconsented scope to this array.** In a tenant where only `User.Read`, `email`, `openid` and `profile` are classified low impact, an unconsented scope cannot be self-consented — it fails at *sign-in*, taking the whole server down rather than degrading the one tool that needed it. A capability requiring a ninth scope should be raised, not implemented.

`offline_access` is what enables silent renewal. Listing it explicitly is safe for cache matching: `OIDC_DEFAULT_SCOPES` in `@azure/msal-common` includes it, and `ScopeSet.createSearchScopes()` strips OIDC scopes before cache lookups, so it cannot cause an `acquireTokenSilent` miss.

**Required Azure AD App Registration settings:**
1. Go to https://entra.microsoft.com → App registrations → New registration
2. Supported account types: Single tenant (or multi-tenant if needed)
3. In Authentication → enable **"Allow public client flows"**
4. In API permissions → Microsoft Graph → **Delegated** permissions: add all 8 scopes above
5. Grant admin consent
6. Add **no** client secret and no certificate — device-code mode holds no standing credential

**Flow mechanics:**

`startAuthentication()` calls `msalPublicClient.acquireTokenByDeviceCode()` with a `deviceCodeCallback`. The callback fires immediately with the user code and URL, at which point the method resolves the outer Promise and returns to the caller — it does NOT block. MSAL continues polling Azure AD in the background via the inner `authPromise`.

The pending auth state is stored in `this.pendingAuth`:

```typescript
interface PendingAuth {
  userCode: string;
  verificationUri: string;
  expiresAt: number;           // Unix ms timestamp
  promise: Promise<AuthResult>; // Resolves when user completes sign-in
}
```

When any other tool (e.g., `get-channel-messages`) calls `getAccessToken()`, it checks:
1. In-memory token — use if valid
2. **Silent refresh** — `getAllAccounts()`, then `acquireTokenSilent({ account, scopes })`. This is the path that normally succeeds after the access token expires
3. `pendingAuth` — race against a 2-second timeout; if still pending, throw a helpful error with the URL/code
4. No token and no pending auth — throw "Not authenticated" error directing user to call `authenticate`

`InteractionRequiredAuthError` from step 2 means the refresh token itself has expired or been revoked, so the method returns null and falls through to step 3. Any other error propagates rather than being swallowed into a misleading "not authenticated".

**Token persistence:**

```
~/.mcp-consultant-tools/teams-token-cache-{clientId}.enc
```

`auth/token-cache.ts` registers an MSAL `ICachePlugin` on the `PublicClientApplication`, so MSAL persists the whole serialized token cache — access token *and* refresh token — automatically:

- `beforeCacheAccess` → decrypt file → `context.tokenCache.deserialize()`
- `afterCacheAccess` → if `context.cacheHasChanged` → `serialize()` → encrypt → write

Encryption is AES-256-GCM (`IV[16] + authTag[16] + ciphertext`) under `scryptSync(hostname + username, 'mcp-teams-auth', 32)`, written at mode 0600 in a 0700 directory. The machine-derived key means a copied cache file is useless elsewhere; a decrypt failure is logged and treated as an empty cache so MSAL falls back to device code.

A 5-minute expiry buffer is applied via `applyToken()`: `tokenExpirationTime = expiresOn - 5 * 60 * 1000`. Per-clientId filenames replace the old in-file `clientId` check.

**Legacy token migration (v35).**

The pre-v35 format was a plaintext `~/.mcp-consultant-tools/teams-auth.json` holding a bare access token with five scopes and no refresh token. `discardLegacyToken()` deletes it on construction rather than migrating it — a narrower token reused silently 403s on every read tool with no visible cause. `logout()` also removes the MSAL account from the in-memory cache, so a logout followed by an `auth-status` in the same process reports `not_authenticated` instead of resurrecting the cached account.

**403 diagnosis.** `MessageService` wraps 403 responses with an explicit instruction to run `logout` then `authenticate`, because a stale narrow scope set is indistinguishable from a genuine authorization failure in the raw Graph error text.

</auth-mode>

<auth-mode name="client-credentials">

### Client Credentials Flow

**Required Azure AD App Registration settings:**

| Permission | Type | Purpose |
|------------|------|---------|
| `ChannelMessage.Send` | Application | Send messages to channels |
| `Group.Read.All` | Application | List teams (via group filter) |
| `Team.ReadBasic.All` | Application | Read team information |

Admin consent is required for all application permissions.

**Flow mechanics:**

`getTokenClientCredentials()` calls `msalConfidentialClient.acquireTokenByClientCredential()` with scope `https://graph.microsoft.com/.default`. This is synchronous from the caller's perspective — the token is returned immediately and cached with a 5-minute buffer.

The `authenticate` tool in client-credentials mode validates credentials by attempting token acquisition and returns `status: "authenticated"` or `status: "failed"` with an error message.

</auth-mode>

<auth-status-states>

### Auth Status States

```typescript
type AuthStatus =
  | "authenticated"      // Valid token exists (in-memory or disk cache)
  | "not_authenticated"  // No token, no pending flow
  | "pending"            // Device code flow started, user not yet signed in
  | "expired";           // Token file exists but has expired
```

`getAuthStatus()` in client-credentials mode always returns `"authenticated"` — the actual token is acquired lazily on the first Graph API call.

</auth-status-states>

</authentication>

<tool-reference>

## Tool Reference

<tool-group name="authentication">

### Authentication Tools

**File:** `packages/teams/src/tools/authenticate.ts`

<tool name="authenticate">

#### authenticate

Starts the authentication flow.

- **Device-code mode:** Returns `status: "pending"` with `userCode` and `verificationUri`. Token acquisition completes in the background when the user signs in.
- **Client-credentials mode:** Attempts token acquisition immediately. Returns `status: "authenticated"` on success or `status: "failed"` with error details.
- If already authenticated, returns `status: "authenticated"` without re-initiating the flow.
- If a device-code flow is already pending (not expired), returns the existing `userCode` and remaining time instead of starting a new flow.

**Parameters:** None

**Response (device-code pending):**
```
Please authenticate:

1. Open this URL: https://microsoft.com/devicelogin
2. Enter this code: ABC123XYZ
3. Sign in with your Microsoft account

The authentication will complete automatically once you sign in.
```

</tool>

<tool name="auth-status">

#### auth-status

Returns the current authentication state. Reads the in-memory token, then `pendingAuth`, then **attempts a silent refresh** from the cached refresh token — so an expired access token backed by a live refresh token reports `authenticated` rather than sending the user back to the device-code flow. Reports `expired` only when a cache file exists but the refresh token is no longer usable. Not strictly side-effect-free: a successful silent refresh updates the in-memory token and the cache file.

**Parameters:** None

**Response fields:** `status`, `authMode`, `expiresAt` (when authenticated), `message`

</tool>

<tool name="logout">

#### logout

Clears all authentication state. Async as of v35, because removing the MSAL account is an async cache operation:
- Sets `accessToken = null`, `tokenExpirationTime = 0`, `pendingAuth = null`, `me = null`
- Calls `removeAccount()` for every account in the MSAL token cache — without this, a logout followed by an `auth-status` in the same process would silently resurrect the cached account via silent refresh
- Deletes the encrypted cache file `~/.mcp-consultant-tools/teams-token-cache-{clientId}.enc`
- Deletes the pre-v35 plaintext `~/.mcp-consultant-tools/teams-auth.json` if it exists

Note: Clearing `pendingAuth` does not cancel the background MSAL polling — if the user completes sign-in after logout, the polling promise resolves but the token is no longer stored (since `pendingAuth` is null when the callback fires).

**Parameters:** None

</tool>

</tool-group>

<tool-group name="messaging">

### Messaging Tools

<tool name="send-channel-message">

#### send-channel-message

**File:** `packages/teams/src/tools/send-message.ts`

Sends a text or markdown message to a Teams channel.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `teamId` | string | No* | — | Team GUID (*required if `TEAMS_DEFAULT_TEAM_ID` not set) |
| `channelId` | string | No* | — | Channel ID (*required if `TEAMS_DEFAULT_CHANNEL_ID` not set) |
| `message` | string | Yes | — | Message content |
| `format` | `"text"` \| `"markdown"` | No | `"markdown"` | Message format |
| `importance` | `"normal"` \| `"high"` \| `"urgent"` | No | `"normal"` | Message importance |

**Markdown processing pipeline:**

When `format = "markdown"`, the message is converted before sending:

```
Markdown Input
    ↓
marked.parse()        (markdown → HTML, synchronous)
    ↓
DOMPurify.sanitize()  (XSS protection via jsdom window)
    ↓
Sanitized HTML → sent with contentType: "html"
```

Allowed HTML tags after sanitization:
```
p, br, strong, b, em, i, u, s, strike,
code, pre, blockquote, ul, ol, li, a,
h1, h2, h3, h4, h5, h6,
table, thead, tbody, tr, th, td
```

Allowed attributes: `href`, `target`

When `format = "text"`, content is sent as-is with `contentType: "text"`.

**Graph API call:**
```
POST /teams/{teamId}/channels/{channelId}/messages
{
  body: { content: "<p>...</p>", contentType: "html" },
  importance: "high"  // omitted when "normal"
}
```

The `importance` field is only included in the payload when it is `"high"` or `"urgent"`.

</tool>

<tool name="send-adaptive-card">

#### send-adaptive-card

**File:** `packages/teams/src/tools/send-card.ts`

Sends an Adaptive Card to a Teams channel. Accepts either a pre-built template or raw card JSON.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `teamId` | string | No* | Team GUID |
| `channelId` | string | No* | Channel ID |
| `template` | `"release-announcement"` \| `"beta-release"` \| `"hotfix"` | Conditional | Template name (required unless `card` provided) |
| `templateData` | object | Conditional | Data for template (required when `template` is set) |
| `card` | object | Conditional | Raw Adaptive Card JSON (required when `template` not set) |
| `importance` | `"normal"` \| `"high"` \| `"urgent"` | No | Message importance |

**templateData fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `packageName` | Yes | e.g., `"@mcp-consultant-tools/azure-devops"` |
| `version` | Yes | e.g., `"27.0.0"` |
| `summary` | Yes | One-sentence release summary |
| `date` | Yes | Release date string, e.g., `"2025-01-16"` |
| `releaseType` | Yes | e.g., `"Minor Release"`, `"Patch"`, `"Major"` |
| `changes` | Yes | Markdown-formatted changelog |
| `releaseNotesUrl` | No | URL → renders "View Release Notes" action button |
| `npmUrl` | No | URL to npm package; auto-generated as `https://www.npmjs.com/package/{packageName}` if omitted |

**Graph API call:**
```
POST /teams/{teamId}/channels/{channelId}/messages
{
  body: { contentType: "html", content: "" },
  attachments: [{
    id: "adaptive-card-1",
    contentType: "application/vnd.microsoft.card.adaptive",
    content: "{...card JSON as string...}"
  }],
  importance: "urgent"  // omitted when "normal"
}
```

</tool>

<tool name="list-teams">

#### list-teams

**File:** `packages/teams/src/tools/list-channels.ts`

Lists Teams the authenticated user/app has access to.

**Parameters:** None

**Graph API endpoint (mode-dependent):**

| Auth Mode | Endpoint |
|-----------|----------|
| `device-code` | `GET /me/joinedTeams?$select=id,displayName,description&$top=100` |
| `client-credentials` | `GET /groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')&$select=id,displayName,description&$top=100` |

**Response shape:**
```typescript
TeamInfo[] = Array<{ id: string; displayName: string; description?: string }>
```

</tool>

<tool name="list-channels">

#### list-channels

**File:** `packages/teams/src/tools/list-channels.ts`

Lists channels in a specific Team.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `teamId` | string | No* | Team GUID (*required if `TEAMS_DEFAULT_TEAM_ID` not set) |

**Graph API call:**
```
GET /teams/{teamId}/channels?$select=id,displayName,description,membershipType
```

**Response shape:**
```typescript
ChannelInfo[] = Array<{
  id: string;
  displayName: string;
  description?: string;
  membershipType?: "standard" | "private" | "shared";
}>
```

</tool>

</tool-group>

<tool-group name="message-read">

### Message Read Tools

Output volume is the primary design constraint: a busy channel will exhaust a context window. All reads default to 20 messages and clamp to Graph's maximum of 50 (`clampTop()`). Bodies are flattened to plain text by `htmlToText()` and capped per message at 1,500 characters by `truncateText()`.

Every rendered message carries its ID, because that ID is the required input to `reply-to-message` and `get-message-replies`.

**Shared response shape** (`MessageInfo`):

```typescript
{
  id: string;                     // Required by reply/reaction calls
  createdDateTime: string;
  lastModifiedDateTime?: string;
  authorName: string;             // Falls back to bot name, then "System"
  authorId?: string;              // AAD user id - the only usable @-mention source
  text: string;                   // HTML stripped, <at> rendered as @Name
  replyCount?: number;
  importance?: string;
  messageType?: string;           // "message", "systemEventMessage", ...
  webUrl?: string;
  isDeleted?: boolean;
}
```

<tool name="get-channel-messages">

#### get-channel-messages

`GET /teams/{teamId}/channels/{channelId}/messages` — delegated `ChannelMessage.Read.All`.

**Parameters:** `teamId?`, `channelId?`, `top?` (1-50, default 20), `since?`, `until?` (ISO-8601)

Returns root messages only. Replies are deliberately **not** expanded (`$expand=replies` would pull up to 200 replies per message), keeping a wide skim cheap; use `get-message-replies` on a returned ID instead.

**Date filtering is client-side here.** The Graph channel-messages endpoint supports only `$top` and `$expand` — not `$filter` or `$orderby` — so `since`/`until` are applied over the fetched page by `applyDateRange()`. A range narrower than expected usually means `top` needs widening. Graph also sorts channel messages by last-modified date of the whole reply chain, not of the root message.

</tool>

<tool name="get-message-replies">

#### get-message-replies

`GET /teams/{teamId}/channels/{channelId}/messages/{messageId}/replies` — delegated `ChannelMessage.Read.All`.

**Parameters:** `messageId` (required), `teamId?`, `channelId?`, `top?` (1-50, default 20)

</tool>

<tool name="reply-to-message">

#### reply-to-message

`POST /teams/{teamId}/channels/{channelId}/messages/{messageId}/replies` — delegated `ChannelMessage.Send`.

**Parameters:** `messageId` (required), `message` (required), `teamId?`, `channelId?`, `format?` (`"text"` | `"markdown"`, default `"markdown"`)

Markdown is converted and sanitized by `markdownToHtml()` before it reaches Graph. Returns the new reply's ID and `webUrl`.

</tool>

</tool-group>

<tool-group name="chats">

### Chat Tools

All four operate on the delegated `Chat.ReadWrite` scope.

<tool name="list-chats">

#### list-chats

`GET /me/chats` — least privilege `Chat.ReadBasic`; `Chat.ReadWrite` is higher and sufficient.

**Parameters:** `top?` (1-50, default 20), `includeMembers?` (boolean)

Ordered by `lastMessagePreview/createdDateTime desc` (descending only — Graph does not support ascending here). `includeMembers` adds `$expand=members`; Graph caps expanded members at **25 per chat regardless of `$top`**, so member lists on large group chats may be partial.

**Response shape** (`ChatInfo`): `id`, `topic?`, `chatType`, `memberNames?`, `lastUpdatedDateTime?`, `webUrl?`. One-on-one chats have no topic — the renderer substitutes member names when available.

</tool>

<tool name="get-chat-messages">

#### get-chat-messages

`GET /chats/{chatId}/messages` — least privilege `Chat.Read`; `Chat.ReadWrite` is higher and sufficient.

**Parameters:** `chatId` (required), `top?` (1-50, default 20), `since?`, `until?` (ISO-8601)

**Date filtering is server-side here**, unlike channel reads. Graph only honours `$filter` when `$orderby` names the same property, so both are set to `lastModifiedDateTime` — the one property accepting both `gt` and `lt` (`createdDateTime` supports `lt` only). Requests without a range send neither parameter.

</tool>

<tool name="send-chat-message">

#### send-chat-message

`POST /chats/{chatId}/messages` — least privilege `ChatMessage.Send`; `Chat.ReadWrite` is higher and sufficient.

**Parameters:** `chatId` (required), `message` (required), `format?` (`"text"` | `"markdown"`, default `"markdown"`)

Cannot create a chat — Graph requires an existing chat ID, and this registration cannot search the directory to assemble participants. Use `list-chats` first.

</tool>

<tool name="mark-chat-read">

#### mark-chat-read

`POST /chats/{chatId}/markChatReadForUser` — delegated `Chat.ReadWrite` (the only permission Graph lists for this action).

**Parameters:** `chatId` (required)

Graph requires a `teamworkUserIdentity` body identifying the user to mark read:

```json
{ "user": { "id": "<signed-in user AAD id>", "tenantId": "<tenant id>" } }
```

The ID comes from `TeamsService.getMe()` (`GET /me`, `User.Read`, cached for the process lifetime) and the tenant from config — which is why `User.Read` is a required scope rather than incidental. Returns `204 No Content`.

</tool>

</tool-group>

<unsupported-operations>

## Deliberately Unsupported

| Operation | Reason |
|-----------|--------|
| `search-messages` (`POST /search/query`, `entityTypes: ["chatMessage"]`) | Graph search lists `Chat.Read` and **not** `Chat.ReadWrite` in its delegated permissions, and enforces that list literally rather than treating ReadWrite as a superset. Expected to 403; would need `Chat.Read` as a ninth scope. Also requires `Prefer: include-unknown-enum-members` since `chatMessage` is an evolvable-enum member. |
| Channel messages `delta` | No delegated channel-message delta endpoint is documented in v1.0 or beta. The surviving `chatmessage-delta` reference covers `/users/{id}/chats/getAllMessages/delta`, which is application-permission only ("Delegated: Not supported"). |
| Reactions (`setReaction`) | Permitted by the current scope set — channel needs `ChannelMessage.Send`, chat needs `Chat.ReadWrite`, both consented — but not implemented. Cheap to add. |
| @-mentions | Require the target's AAD user id in the payload. Only ids already present in read data are available (`MessageInfo.authorId`, `ChatInfo` members); this registration cannot resolve a name to an id. No directory-lookup tool should be added. |
| Team/channel administration | Out of scope by design: no creating channels, no managing members, no changing team settings. |
| Chat creation | Graph's send endpoint cannot create a chat, and participant selection would need directory search. |

</unsupported-operations>

</tool-reference>

<adaptive-card-templates>

## Adaptive Card Templates

**File:** `packages/teams/src/cards/templates.ts`

All templates produce an `AdaptiveCard` at schema version `1.4`. The `npmUrl` defaults to `https://www.npmjs.com/package/{packageName}` if not provided.

<template name="release-announcement">

### release-announcement

Container style: `emphasis` (neutral blue accent).

Body:
1. Container (emphasis) — header: "🚀 New Release: {packageName} v{version}"
2. TextBlock — summary text
3. FactSet — Version, Released, Type
4. TextBlock — "**Changes:**" (bold label)
5. TextBlock — changes content

Actions: "View Release Notes" (if `releaseNotesUrl` provided) + "npm Package"

</template>

<template name="beta-release">

### beta-release

Container style: `warning` (orange/yellow).

Body:
1. Container (warning) — header: "🧪 Beta Release: {packageName} v{version}"
2. TextBlock — "⚠️ **This is a pre-release version for testing purposes.**" (color: warning)
3. TextBlock — summary text
4. FactSet — Version, Released, Type (hardcoded as "Beta Release")
5. TextBlock — "**Changes:**"
6. TextBlock — changes content
7. TextBlock — "Install with: `npm install {packageName}@beta`"

Actions: "View Release Notes" (if provided) + "npm Package (Beta)"

</template>

<template name="hotfix">

### hotfix

Container style: `attention` (red).

Body:
1. Container (attention) — header: "🔥 Hotfix: {packageName} v{version}" (color: attention)
2. TextBlock — "🚨 **Critical fix - please update immediately.**" (color: attention)
3. TextBlock — summary text
4. FactSet — Version, Released, Type (hardcoded as "Hotfix")
5. TextBlock — "**Fixed Issues:**"
6. TextBlock — changes content

Actions: "View Details" (if `releaseNotesUrl` provided) + "Update Now"

</template>

</adaptive-card-templates>

<error-handling>

## Error Handling

All tools return `isError: true` in the MCP response on failure.

<error-table name="authentication">

### Authentication Errors

| Error message | Cause | Resolution |
|---------------|-------|------------|
| `Not authenticated to Microsoft Teams` | No token, no pending flow | Call `authenticate` tool |
| `Authentication in progress` | Device-code pending | Complete sign-in in browser |
| `Token has expired` | Stored token past expiry | Call `authenticate` again |
| `Client secret is required for client-credentials auth mode` | `TEAMS_CLIENT_SECRET` missing | Set env var |
| `TEAMS_CLIENT_ID is required` | Missing env var | Register Azure AD app, set env var |
| `TEAMS_TENANT_ID is required` | Missing env var | Set tenant ID env var |

</error-table>

<error-table name="graph-api">

### Graph API Errors

| HTTP Status | Cause | Resolution |
|-------------|-------|------------|
| 401 | Invalid or expired token | Re-authenticate |
| 403 | Insufficient permissions | Verify API permissions + admin consent |
| 404 | Team or channel ID not found | Use `list-teams`/`list-channels` to find valid IDs |
| 429 | Rate limited by Microsoft Graph | Implement retry with backoff |

</error-table>

<error-table name="team-channel-id">

### Team/Channel ID Errors

| Error message | Cause | Resolution |
|---------------|-------|------------|
| `Team ID is required. Either provide teamId parameter or set TEAMS_DEFAULT_TEAM_ID` | No teamId and no default | Pass `teamId` or set env var |
| `Channel ID is required. Either provide channelId parameter or set TEAMS_DEFAULT_CHANNEL_ID` | No channelId and no default | Pass `channelId` or set env var |

These errors originate from `getTeamId()` / `getChannelId()` helper methods in `TeamsService`.

</error-table>

</error-handling>

<implementation-details>

## Implementation Details

<detail name="graph-client-initialization">

### Graph Client Initialization

A fresh Graph client is created per request with the current access token:

```typescript
private async getGraphClient(): Promise<Client> {
  const token = await this.getAccessToken();
  this.graphClient = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => token,
    },
  });
  return this.graphClient;
}
```

This ensures the token is always fresh before each API call.

</detail>

<detail name="token-refresh-buffer">

### Token Refresh Buffer

A 5-minute buffer is applied to all token expiration checks:

```typescript
this.tokenExpirationTime = expiresOn.getTime() - 5 * 60 * 1000;
```

This applies to both in-memory tokens (client-credentials) and disk-cached tokens (device-code). The `getAccessToken()` method checks `tokenExpirationTime > Date.now()` — the buffer ensures tokens are proactively refreshed before they actually expire.

</detail>

<detail name="pending-auth-race">

### Pending Auth Race Condition (Device Code)

When a tool other than `authenticate` needs a token and a device-code flow is in progress, `getTokenDeviceCode()` uses:

```typescript
const result = await Promise.race([
  this.pendingAuth.promise,
  new Promise<AuthResult>((resolve) =>
    setTimeout(() => resolve({ status: "timeout", message: "Still waiting..." }), 2000)
  ),
]);
```

The 2-second race allows for the case where the user completed sign-in between the `authenticate` call and the next tool call. If still pending after 2 seconds, a helpful error is thrown that includes the current `verificationUri` and `userCode`.

</detail>

<detail name="dependencies">

### Dependencies

| Package | Purpose |
|---------|---------|
| `@azure/msal-node` | MSAL authentication (device-code + client-credentials) |
| `@microsoft/microsoft-graph-client` | Microsoft Graph API HTTP client |
| `marked` | Markdown to HTML conversion |
| `dompurify` | HTML sanitization (XSS protection) |
| `jsdom` | DOM environment required by DOMPurify in Node.js |
| `zod` | Input validation for tool parameters |
| `commander` | CLI framework |

</detail>

</implementation-details>

<cli-architecture>

## CLI Architecture

The CLI reuses `TeamsService` via the same `ServiceContext` pattern as the MCP server.

### File Structure

```
packages/teams/src/
  cli.ts                      # Entry point (#!/usr/bin/env node)
  context-factory.ts          # createServiceContext() for CLI (mirrors index.ts)
  cli/
    output.ts                 # Cache dir: .mcp-teams-cache
    commands/
      index.ts                # registerAllCommands() aggregator
      auth-commands.ts        # auth login/status/logout
      message-commands.ts     # list-teams, list-channels, send-message, send-card
```

### Command Groups

| Group | Commands | Corresponding MCP tools |
|-------|----------|------------------------|
| `auth` | `login`, `status`, `logout` | `authenticate`, `auth-status`, `logout` |
| (root) | `list-teams` | `list-teams` |
| (root) | `list-channels <teamId>` | `list-channels` |
| (root) | `send-message <message>` | `send-channel-message` |
| (root) | `send-card` | `send-adaptive-card` |

### Tool-to-CLI Parameter Mapping

| MCP parameter | CLI equivalent |
|---------------|----------------|
| `teamId` (optional) | `-t, --team-id <id>` |
| `channelId` (optional) | `-c, --channel-id <id>` |
| `message` (required) | positional `<message>` |
| `format` (optional) | `-f, --format <format>` |
| `importance` (optional) | `-i, --importance <level>` |
| `template` (optional) | `--template <name>` |
| `card` (raw JSON) | `--card-file <path>` (reads from file) |
| `templateData.packageName` | `--package-name <name>` |
| `templateData.version` | `--version <ver>` |
| `templateData.summary` | `--summary <text>` |
| `templateData.date` | `--date <date>` |
| `templateData.releaseType` | `--release-type <type>` |
| `templateData.changes` | `--changes <text>` |
| `templateData.releaseNotesUrl` | `--release-notes-url <url>` |
| `templateData.npmUrl` | `--npm-url <url>` |

Note: The CLI `send-card` command accepts raw Adaptive Card JSON via `--card-file <path>` (reads from disk) rather than inline JSON, which avoids shell escaping issues.

### CLI Usage Examples

```bash
# Check auth status
mcp-teams-cli auth status

# Start device-code login
mcp-teams-cli auth login

# List teams
mcp-teams-cli list-teams

# List channels in a team
mcp-teams-cli list-channels abc123-def456-...

# Send a markdown message (uses default team/channel if env vars set)
mcp-teams-cli send-message "## Build Complete\n\nDeployment to **staging** finished."

# Send with explicit team/channel and high importance
mcp-teams-cli send-message "Urgent update" \
  -t abc123-team-id \
  -c 19:xyz@thread.tacv2 \
  -i high

# Send a release announcement card
mcp-teams-cli send-card \
  --template release-announcement \
  --package-name "@mcp-consultant-tools/azure-devops" \
  --version "27.0.0" \
  --summary "New work item sync tools" \
  --date "2025-01-16" \
  --release-type "Minor Release" \
  --changes "- Added sync-work-item-to-file\n- Added sync-work-item-from-file" \
  --release-notes-url "https://github.com/.../releases/v27.0.0"

# Send raw Adaptive Card from file
mcp-teams-cli send-card --card-file ./my-card.json

# JSON output (bypasses summary, writes raw JSON)
mcp-teams-cli --json list-teams

# Use custom env file
mcp-teams-cli --env-file .env.prod list-teams
```

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of summary |
| `--no-cache` | Skip writing JSON to cache directory |
| `--env-file <path>` | Load environment from a custom .env file |

Output: human-readable summary to stdout + full JSON cached to `.context/.mcp-teams-cache/`.

</cli-architecture>

<security>

## Security Considerations

- Token file created with mode `0o600` (user read/write only); directory with `0o700`
- Token validated against current `clientId` before use — prevents cross-app token reuse
- Markdown messages sanitized via DOMPurify before sending (XSS protection)
- Never commit `TEAMS_CLIENT_SECRET` to version control — use environment variables
- For client-credentials, use least-privilege application permissions
- Rotate client secrets regularly (Azure recommends 90-day rotation)
- Device-code mode is preferable for individual developer use; client-credentials for CI/CD automation

</security>
