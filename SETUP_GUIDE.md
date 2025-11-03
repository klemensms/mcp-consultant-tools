# PowerPlatform MCP Server - Setup Guide for Claude Desktop

This guide will help you configure Claude Desktop to use the PowerPlatform MCP server for your organization.

## Prerequisites

1. Node.js 16 or later installed
2. Access to your company's GitHub Enterprise repository
3. Claude Desktop installed
4. PowerPlatform credentials (Azure AD app registration)
5. Azure DevOps Personal Access Token (PAT)

## Step 1: Obtain Required Credentials

### PowerPlatform Credentials

You need the following information from your Azure AD app registration:

- **POWERPLATFORM_URL**: Your PowerPlatform environment URL
  - Example: `https://yourorg.crm.dynamics.com`
- **POWERPLATFORM_CLIENT_ID**: Azure AD app client ID
- **POWERPLATFORM_CLIENT_SECRET**: Azure AD app client secret
- **POWERPLATFORM_TENANT_ID**: Azure tenant ID

Contact your PowerPlatform administrator if you don't have these credentials.

### Azure DevOps Personal Access Token

1. Go to Azure DevOps: `https://dev.azure.com/<your-organization>/_usersSettings/tokens`
2. Click "New Token"
3. Set the following scopes:
   - **Wiki**: `vso.wiki` (Read) - Required for wiki access
   - **Work Items**: `vso.work` (Read) - Required for work item queries
   - **Work Items (Write)**: `vso.work_write` (Read & Write) - Optional, for creating/updating work items
   - **Search**: `vso.search` (Read) - Required for wiki search
4. Copy the token - you'll need it for configuration

## Step 2: Configure Claude Desktop

### Locate Configuration File

Find your Claude Desktop configuration file:

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

### Edit Configuration

Open the file in a text editor and add the PowerPlatform MCP server configuration:

```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": [
        "-y",
        "git+https://github-enterprise.your-company.com/your-org/devops-mcp-consultant-tools.git"
      ],
      "env": {
        "POWERPLATFORM_URL": "https://yourorg.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id-here",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret-here",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id-here",

        "AZUREDEVOPS_ORGANIZATION": "your-organization-name",
        "AZUREDEVOPS_PAT": "your-personal-access-token-here",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",

        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false"
      }
    }
  }
}
```

**Important:** Replace the placeholder values with your actual credentials:
- `https://github-enterprise.your-company.com/your-org/devops-mcp-consultant-tools.git` - Your GitHub Enterprise repository URL
- `https://yourorg.crm.dynamics.com` - Your PowerPlatform environment URL
- `your-client-id-here` - Your Azure AD app client ID
- `your-client-secret-here` - Your Azure AD app client secret
- `your-tenant-id-here` - Your Azure tenant ID
- `your-organization-name` - Your Azure DevOps organization name
- `your-personal-access-token-here` - Your Azure DevOps PAT
- `Project1,Project2` - Comma-separated list of Azure DevOps projects you want to access

### Configuration Options

#### Read-Only Access (Recommended for Most Users)

```json
"AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
"AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
"AZUREDEVOPS_ENABLE_WIKI_WRITE": "false"
```

Use this configuration if you only need to read data (query entities, search wikis, view work items).

#### Developer Access (Can Create/Update Work Items)

```json
"AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "true",
"AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
"AZUREDEVOPS_ENABLE_WIKI_WRITE": "false"
```

Use this if you want to create work items, add comments, and update work item states.

#### Full Access (Team Leads/Admins)

```json
"AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "true",
"AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "true",
"AZUREDEVOPS_ENABLE_WIKI_WRITE": "true"
```

## Step 3: Restart Claude Desktop

After saving the configuration file:

1. Quit Claude Desktop completely
2. Restart Claude Desktop
3. The MCP server will be automatically initialized on first use

## Step 4: Verify Installation

In Claude Desktop, try asking:

```
Can you show me the available PowerPlatform entities?
```

or

```
Search our wiki for "authentication"
```

If the server is configured correctly, Claude will be able to access your PowerPlatform environment and Azure DevOps wikis.

## Troubleshooting

### Server Not Starting

1. Check that all environment variables are set correctly
2. Verify your credentials are valid
3. Check Claude Desktop logs:
   - **macOS**: `~/Library/Logs/Claude/`
   - **Windows**: `%APPDATA%\Claude\logs\`

### Authentication Errors

- **PowerPlatform**: Verify your Azure AD app has the correct permissions for Dataverse API
- **Azure DevOps**: Ensure your PAT has not expired and has the required scopes

### "Cannot find module" Errors

The server uses `npx -y` which automatically installs dependencies. If you see this error:

1. Clear npm cache: `npm cache clean --force`
2. Try manual installation:
   ```bash
   npm install -g git+https://github-enterprise.your-company.com/your-org/devops-mcp-consultant-tools.git
   ```
3. Update the config to use the global installation:
   ```json
   {
     "command": "powerplatform-mcp",
     "args": [],
     "env": { ... }
   }
   ```

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use environment-specific PATs** with minimal required scopes
3. **Rotate PATs regularly** (Azure DevOps allows setting expiration dates)
4. **Enable only features you need** (write/delete flags)
5. **Limit project access** using `AZUREDEVOPS_PROJECTS`

## Available Features

Once configured, you can use Claude to:

### PowerPlatform
- Query entity metadata and attributes
- Retrieve and filter records
- Explore entity relationships
- Inspect plugin registrations and validate deployments
- Query plugin trace logs
- View Power Automate flows and classic workflows
- Analyze flow run history

### Azure DevOps
- Search wiki pages across projects
- Read wiki documentation
- Query work items using WIQL
- View work item details and comments
- Create and update work items (if enabled)
- Manage work item lifecycle

## Examples

### Example 1: Query PowerPlatform Entities

```
Show me all active accounts with revenue over $1M
```

### Example 2: Search Wiki Documentation

```
Search our wiki for information about API authentication
```

### Example 3: Inspect Plugin Registration

```
Show me the plugin deployment report for MyCompany.Plugins
```

### Example 4: Query Work Items

```
Find all active bugs assigned to me in the current sprint
```

### Example 5: Analyze Flow Runs

```
Show me the last 10 runs of the "Lead Notification" flow
```

## Support

For issues or questions:
1. Check the [README.md](README.md) for detailed documentation
2. Review the [CLAUDE.md](CLAUDE.md) for architecture details
3. Contact your team administrator

## Updates

To update to the latest version:

1. Claude Desktop will automatically use the latest version from GitHub Enterprise on each restart (when using `npx`)
2. For manual installations, run:
   ```bash
   npm update -g powerplatform-mcp
   ```

Or reinstall from the repository:
```bash
npm install -g git+https://github-enterprise.your-company.com/your-org/devops-mcp-consultant-tools.git
```
