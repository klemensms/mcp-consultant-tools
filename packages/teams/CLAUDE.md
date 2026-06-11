# Teams Package Guide

## Overview

Microsoft Teams integration for sending messages and adaptive cards to channels. Designed for automated release announcements.

- **Tools:** 7 tools
- **Authentication:** Device Code (default, personal credentials) or Client Credentials (app-only)

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
5. In **API permissions** → Add **Microsoft Graph** → **Delegated permissions**:
   - `User.Read`
   - `Team.ReadBasic.All`
   - `Channel.ReadBasic.All`
   - `ChannelMessage.Send`
   - `Group.Read.All`
6. Click **Grant admin consent**

**How it works:**
1. Call the `authenticate` tool
2. You'll receive a URL and code
3. Open the URL in your browser, enter the code, sign in
4. Authentication completes automatically
5. Token is cached for future sessions
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

## Typical Usage Flow

### Device Code (Personal Credentials)

1. **First time:** Call `authenticate` → get URL/code → sign in browser
2. **Use tools:** `list-teams`, `list-channels`, `send-channel-message`, etc.
3. **Token cached:** Subsequent sessions auto-load cached token
4. **Token expired:** Call `authenticate` again

### Client Credentials (App Registration)

1. **Configure env:** Set `TEAMS_AUTH_MODE=client-credentials` + credentials
2. **Use tools directly:** No manual authentication needed

## Key Implementation Details

### Token Caching

- Device-code tokens cached at `~/.mcp-consultant-tools/teams-auth.json`
- Tokens auto-refresh 5 minutes before expiration
- Clear with `logout` tool

### Markdown Support

Uses `marked` + `dompurify` for safe HTML conversion:
- Supports: bold, italic, code, lists, headings, tables, blockquotes
- XSS protection via HTML sanitization

## Reference

See `docs/plans/teams-mcp-server.md` for full design documentation.

## CLI Usage

Binary: `mcp-teams-cli`

```bash
# List teams
mcp-teams-cli message list-teams

# Send message
mcp-teams-cli message send "Hello from CLI!"
```
