# Configuration

This folder contains configuration file examples and templates.

## Available Configurations

### claude_desktop_config.sample.json
Sample configuration for Claude Desktop MCP server integration.

**Usage:**
Copy the relevant section to your Claude Desktop config file at:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Configuration format:**
```json
{
  "mcpServers": {
    "powerplatform-mcp": {
      "command": "npx",
      "args": ["-y", "powerplatform-mcp"],
      "env": {
        "POWERPLATFORM_URL": "https://your-env.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",
        "AZUREDEVOPS_ORGANIZATION": "your-org",
        "AZUREDEVOPS_PAT": "your-pat",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_API_VERSION": "7.1"
      }
    }
  }
}
```

### CLAUDE_DESKTOP_FIX.json
Configuration specifically for the wiki path conversion fix.

Contains the minimal configuration needed to test the Azure DevOps wiki functionality with the path conversion fix.

## Using These Configurations

### Option 1: Automated Setup (Recommended)
```bash
./scripts/setup-claude-desktop.sh
```

### Option 2: Manual Setup
1. Open your Claude Desktop config file
2. Copy the MCP server configuration from `claude_desktop_config.sample.json`
3. Replace the placeholder values with your actual credentials
4. Save and restart Claude Desktop

## Environment Variables

All configurations use the following environment variables:

### PowerPlatform/Dataverse
- `POWERPLATFORM_URL` - Your PowerPlatform environment URL
- `POWERPLATFORM_CLIENT_ID` - Azure AD app client ID
- `POWERPLATFORM_CLIENT_SECRET` - Azure AD app client secret
- `POWERPLATFORM_TENANT_ID` - Azure tenant ID

### Azure DevOps
- `AZUREDEVOPS_ORGANIZATION` - Your Azure DevOps organization name
- `AZUREDEVOPS_PAT` - Personal Access Token with appropriate scopes
- `AZUREDEVOPS_PROJECTS` - Comma-separated list of allowed projects
- `AZUREDEVOPS_API_VERSION` - API version (default: "7.1")
- `AZUREDEVOPS_ENABLE_WIKI_WRITE` - Enable wiki write operations (default: false)
- `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE` - Enable work item write (default: false)
- `AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE` - Enable work item delete (default: false)

See [../.env.example](../.env.example) for a complete list of environment variables.

## Security Notes

⚠️ **Never commit actual credentials to version control!**

- Use `.env` file for local development (already in `.gitignore`)
- Use environment variables in production
- Keep PATs and secrets secure
- Rotate credentials regularly
- Use minimal required permissions

## Testing Your Configuration

After configuring:

1. Build the project: `npm run build`
2. Run a test: `node tests/test-connection.js`
3. Check Claude Desktop integration
