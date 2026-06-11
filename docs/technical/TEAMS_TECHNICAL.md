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
  services/
    index.ts                  # Barrel export
    teams-service.ts          # TeamsService class (auth + Graph API operations)
  tools/
    index.ts                  # registerAllTools() aggregator
    authenticate.ts           # authenticate, auth-status, logout tools
    send-message.ts           # send-channel-message tool
    send-card.ts              # send-adaptive-card tool
    list-channels.ts          # list-teams, list-channels tools
  cards/
    templates.ts              # Adaptive Card template builders
  cli/
    output.ts                 # Cache dir: .mcp-teams-cache
    commands/
      index.ts                # registerAllCommands() aggregator
      auth-commands.ts        # auth login/status/logout
      message-commands.ts     # list-teams, list-channels, send-message, send-card
```

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

**Scopes requested:**
- `User.Read`
- `Team.ReadBasic.All`
- `Channel.ReadBasic.All`
- `ChannelMessage.Send`
- `Group.Read.All`

**Required Azure AD App Registration settings:**
1. Go to https://entra.microsoft.com → App registrations → New registration
2. Supported account types: Single tenant (or multi-tenant if needed)
3. In Authentication → enable **"Allow public client flows"**
4. In API permissions → Microsoft Graph → **Delegated** permissions: add all 5 scopes above
5. Grant admin consent

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

When any other tool (e.g., `send-channel-message`) calls `getAccessToken()`, it checks:
1. In-memory token — use if valid
2. Disk token at `~/.mcp-consultant-tools/teams-auth.json` — load if valid and matches clientId
3. `pendingAuth` — race against a 2-second timeout; if still pending, throw a helpful error with the URL/code
4. No token and no pending auth — throw "Not authenticated" error directing user to call `authenticate`

**Token persistence:**

```typescript
// Storage location
~/.mcp-consultant-tools/teams-auth.json

// File format (mode 0o600, directory mode 0o700)
interface StoredToken {
  accessToken: string;
  expiresAt: string;       // ISO 8601
  clientId: string;        // Validated against current config before use
  authenticatedAt: string; // ISO 8601
}
```

A 5-minute buffer is applied: `tokenExpirationTime = expiresAt - 5 * 60 * 1000`. Tokens are validated against the current `clientId` — tokens from a different app registration are ignored.

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

Returns the current authentication state without side effects. Reads from in-memory token, then `pendingAuth`, then disk token file.

**Parameters:** None

**Response fields:** `status`, `authMode`, `expiresAt` (when authenticated), `message`

</tool>

<tool name="logout">

#### logout

Clears all authentication state:
- Sets `accessToken = null`, `tokenExpirationTime = 0`, `pendingAuth = null`
- Deletes `~/.mcp-consultant-tools/teams-auth.json` if it exists

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
