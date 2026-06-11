# @mcp-consultant-tools/teams

MCP server for Microsoft Teams integration. Send messages and adaptive cards to Teams channels for release announcements.

## Features

- Send text and markdown messages to Teams channels
- Send Adaptive Cards with pre-built templates
- Templates for release announcements, beta releases, and hotfixes
- Client Credentials authentication (no user interaction required)
- Token caching with automatic refresh

## Installation

```bash
npm install @mcp-consultant-tools/teams
```

Or use directly with npx:

```bash
npx @mcp-consultant-tools/teams
```

## Configuration

### Environment Variables

```bash
# Required - Azure AD App Registration
TEAMS_TENANT_ID=your-azure-tenant-id
TEAMS_CLIENT_ID=your-app-client-id
TEAMS_CLIENT_SECRET=your-client-secret

# Optional - Default targets
TEAMS_DEFAULT_TEAM_ID=team-guid
TEAMS_DEFAULT_CHANNEL_ID=channel-guid
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "teams": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/teams@latest"],
      "env": {
        "TEAMS_TENANT_ID": "your-tenant-id",
        "TEAMS_CLIENT_ID": "your-client-id",
        "TEAMS_CLIENT_SECRET": "your-client-secret",
        "TEAMS_DEFAULT_TEAM_ID": "optional-team-id",
        "TEAMS_DEFAULT_CHANNEL_ID": "optional-channel-id"
      }
    }
  }
}
```

## Azure AD Setup

### Required Permissions

Create an Azure AD App Registration with these **Application permissions** (not Delegated):

| Permission | Purpose |
|------------|---------|
| `ChannelMessage.Send` | Send messages to channels |
| `Group.Read.All` | List teams and channels |
| `Team.ReadBasic.All` | Read team information |

**Important:** Admin consent is required for these permissions.

### Setup Steps

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory
2. App registrations → New registration
3. Name: "MCP Teams Release Bot"
4. Supported account types: Single tenant
5. API permissions → Add Application permissions (NOT delegated)
6. Grant admin consent for your organization
7. Certificates & secrets → Create new client secret
8. Copy the secret value immediately

## Tools

### send-channel-message

Send a text or markdown message to a Teams channel.

```
Message: "Hello from Claude!"
Format: markdown
Importance: normal
```

### send-adaptive-card

Send an Adaptive Card using templates or raw JSON.

**Available Templates:**
- `release-announcement` - Standard release notification
- `beta-release` - Beta release with warning styling
- `hotfix` - Urgent hotfix notification

Example with template:
```json
{
  "template": "release-announcement",
  "templateData": {
    "packageName": "@mcp-consultant-tools/azure-devops",
    "version": "27.0.0",
    "summary": "New work item sync tools for efficient editing",
    "date": "2025-01-16",
    "releaseType": "Minor Release",
    "changes": "- Added sync-work-item-to-file\n- Added sync-work-item-from-file",
    "releaseNotesUrl": "https://github.com/..."
  }
}
```

### list-teams

List Microsoft Teams the app has access to.

### list-channels

List channels in a team to find channel IDs for messaging.

## License

MIT
