# Setup Guide

Complete setup guide for configuring MCP Consultant Tools with Claude Desktop, VS Code (Claude Code), or other MCP clients.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Claude Desktop](#claude-desktop-configuration)
  - [VS Code (Claude Code)](#vs-code-claude-code-configuration)
  - [Local Development](#local-development-configuration)
- [Environment Variables](#environment-variables)
- [Obtaining Credentials](#obtaining-credentials)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

## Prerequisites

- **Node.js 16 or later** installed
- **MCP-compatible client** (Claude Desktop, VS Code with Claude Code extension, or other)
- **Optional:** PowerPlatform/Dataverse access credentials
- **Optional:** Azure DevOps Personal Access Token (PAT)
- **Optional:** Figma Personal Access Token or OAuth token

**Note:** All integrations (PowerPlatform, Azure DevOps, Figma) are optional. Configure only the services you need.

## Installation

You can use this tool in two ways:

### Option 1: Run with npx (Recommended)

No installation needed. The tool runs directly from npm:

```bash
npx mcp-consultant-tools@latest
```

**Advantages:**
- Always uses the latest version
- No global installation
- Works across different projects

### Option 2: Install Globally

Install once, run anywhere:

```bash
npm install -g mcp-consultant-tools
```

Then run:

```bash
mcp-consultant-tools
```

**Advantages:**
- Faster startup (no download)
- Works offline after initial install

## Configuration

### Claude Desktop Configuration

#### Location

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

#### Basic Configuration

Edit the file and add:

```json
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["-y", "mcp-consultant-tools@latest"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-azure-app-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id",

        "AZUREDEVOPS_ORGANIZATION": "your-organization-name",
        "AZUREDEVOPS_PAT": "your-personal-access-token",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false",

        "FIGMA_API_KEY": "your-figma-personal-access-token",
        "FIGMA_USE_OAUTH": "false"
      }
    }
  }
}
```

**Important:** Replace all placeholder values with your actual credentials.

#### Restart Claude Desktop

After saving the configuration:

1. Quit Claude Desktop completely
2. Restart Claude Desktop
3. The MCP server will be available on first use

---

### VS Code (Claude Code) Configuration

#### Option 1: Project-Level Configuration (Recommended)

Create `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["-y", "mcp-consultant-tools@latest"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-azure-app-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id",

        "AZUREDEVOPS_ORGANIZATION": "your-organization-name",
        "AZUREDEVOPS_PAT": "your-personal-access-token",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",

        "FIGMA_API_KEY": "your-figma-personal-access-token"
      }
    }
  }
}
```

**After configuration:**
1. Save the `.vscode/mcp.json` file
2. Reload VS Code window (`Cmd+Shift+P` → "Developer: Reload Window")
3. The MCP server will be available in Claude Code

#### Option 2: User Settings

Add to your VS Code `settings.json`:

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Preferences: Open User Settings (JSON)"
3. Add the MCP server configuration under `"mcp.servers"`

#### Option 3: Environment Variables (More Secure)

Set environment variables in your shell profile (`~/.zshrc` or `~/.bash_profile`):

```bash
export POWERPLATFORM_URL="https://yourenvironment.crm.dynamics.com"
export POWERPLATFORM_CLIENT_ID="your-client-id"
export POWERPLATFORM_CLIENT_SECRET="your-client-secret"
export POWERPLATFORM_TENANT_ID="your-tenant-id"

export AZUREDEVOPS_ORGANIZATION="your-organization"
export AZUREDEVOPS_PAT="your-pat"
export AZUREDEVOPS_PROJECTS="Project1,Project2"

export FIGMA_API_KEY="your-figma-token"
```

Then use a simpler configuration:

```json
{
  "servers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["-y", "mcp-consultant-tools@latest"]
    }
  }
}
```

Restart VS Code after setting environment variables.

---

### Local Development Configuration

For local development and testing from a cloned repository:

#### Claude Desktop

```json
{
  "mcpServers": {
    "mcp-consultant-tools-dev": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-consultant-tools/build/index.js"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-azure-app-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id"
      }
    }
  }
}
```

#### VS Code

```json
{
  "servers": {
    "mcp-consultant-tools-dev": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-consultant-tools/build/index.js"]
    }
  }
}
```

**Important:** Replace `/absolute/path/to/mcp-consultant-tools` with the actual path to your cloned repository.

**Before running:**

```bash
cd /path/to/mcp-consultant-tools
npm install
npm run build
```

---

## Environment Variables

All integrations are optional. Configure only the services you need.

### PowerPlatform/Dataverse (Optional)

- `POWERPLATFORM_URL` (required if using PowerPlatform): Your PowerPlatform environment URL
  - Example: `https://yourenvironment.crm.dynamics.com`
  - No trailing slash
- `POWERPLATFORM_CLIENT_ID` (required): Azure AD app registration client ID
- `POWERPLATFORM_CLIENT_SECRET` (required): Azure AD app registration client secret
- `POWERPLATFORM_TENANT_ID` (required): Azure tenant ID

### Azure DevOps (Optional)

- `AZUREDEVOPS_ORGANIZATION` (required if using Azure DevOps): Organization name
  - Example: `mycompany` (not the full URL)
- `AZUREDEVOPS_PAT` (required): Personal Access Token with appropriate scopes
- `AZUREDEVOPS_PROJECTS` (required): Comma-separated list of allowed projects
  - Example: `Project1,Project2,Project3`
- `AZUREDEVOPS_API_VERSION` (optional): API version
  - Default: `"7.1"`
- `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE` (optional): Enable work item write operations
  - Default: `"false"`
  - Set to `"true"` to allow creating/updating work items
- `AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE` (optional): Enable work item delete operations
  - Default: `"false"`
  - Set to `"true"` to allow deleting work items
- `AZUREDEVOPS_ENABLE_WIKI_WRITE` (optional): Enable wiki write operations
  - Default: `"false"`
  - Set to `"true"` to allow creating/updating wiki pages

### Figma (Optional)

- `FIGMA_API_KEY` (required if using Figma): Figma Personal Access Token
  - Get from: https://www.figma.com/developers/api#authentication
- `FIGMA_OAUTH_TOKEN` (optional): Alternative to API key for OAuth authentication
- `FIGMA_USE_OAUTH` (optional): Set to `"true"` if using OAuth token
  - Default: `"false"`

---

## Obtaining Credentials

### PowerPlatform Credentials

You need an Azure AD app registration with permissions to access your PowerPlatform/Dataverse environment.

**Required information:**
- **POWERPLATFORM_URL**: Your environment URL (ask your PowerPlatform administrator)
- **POWERPLATFORM_CLIENT_ID**: Azure AD app client ID
- **POWERPLATFORM_CLIENT_SECRET**: Azure AD app client secret
- **POWERPLATFORM_TENANT_ID**: Azure tenant ID

**Creating an Azure AD App Registration:**

1. Go to Azure Portal → Azure Active Directory → App registrations
2. Click "New registration"
3. Set name (e.g., "MCP Consultant Tools")
4. Set redirect URI (not needed for this app)
5. Click "Register"
6. Copy the **Application (client) ID** → This is your `POWERPLATFORM_CLIENT_ID`
7. Copy the **Directory (tenant) ID** → This is your `POWERPLATFORM_TENANT_ID`
8. Go to "Certificates & secrets" → "New client secret"
9. Copy the secret value → This is your `POWERPLATFORM_CLIENT_SECRET`
10. Go to "API permissions" → "Add a permission" → "Dynamics CRM"
11. Add "user_impersonation" permission
12. Grant admin consent

Contact your PowerPlatform administrator if you need help with app registration.

---

### Azure DevOps Personal Access Token (PAT)

**Creating a PAT:**

1. Go to Azure DevOps: `https://dev.azure.com/<your-organization>/_usersSettings/tokens`
2. Click "New Token"
3. Set an expiration date (recommended: 90 days or less)
4. Select scopes based on what you need:

**For read-only access:**
- **Wiki**: `vso.wiki` (Read)
- **Work Items**: `vso.work` (Read)
- **Search**: `vso.search` (Read)

**For read/write access:**
- **Wiki**: `vso.wiki` (Read) or `vso.wiki_write` (Read & Write)
- **Work Items**: `vso.work_write` (Read & Write)
- **Search**: `vso.search` (Read)

5. Click "Create"
6. Copy the token immediately (you won't see it again)
7. Set it in `AZUREDEVOPS_PAT` environment variable

**Security Note:** Store PATs securely. Rotate them regularly. Use minimal required scopes.

---

### Figma Personal Access Token

**How to get a Figma API Key:**

1. Go to https://www.figma.com/developers/api#authentication
2. Scroll to "Personal Access Tokens"
3. Click "Get personal access token"
4. Log in to Figma
5. Generate new token with a descriptive name (e.g., "MCP Consultant Tools")
6. Copy the token
7. Set it in `FIGMA_API_KEY` environment variable

**Security Note:** Figma tokens have full access to your files. Keep them secure. Don't commit them to version control.

---

## Troubleshooting

### Server Not Starting

**Check configuration:**

1. Verify all required environment variables are set
2. Check for typos in variable names
3. Ensure no extra spaces in values
4. Verify JSON syntax (use a JSON validator)

**Check logs:**

**Claude Desktop:**
- **macOS**: `~/Library/Logs/Claude/`
- **Windows**: `%APPDATA%\Claude\logs\`

**VS Code:**
- View → Output → Select "MCP" from dropdown

### Authentication Errors

**PowerPlatform:**
- Verify Azure AD app has correct permissions
- Check that client secret hasn't expired
- Ensure URL has no trailing slash
- Verify user has access to the environment

**Azure DevOps:**
- Check PAT hasn't expired
- Verify PAT has required scopes
- Ensure organization name is correct (not the full URL)
- Check project names are exact matches (case-sensitive)

**Figma:**
- Verify API key is valid
- Check that you have access to the files you're trying to fetch

### "Cannot find module" Errors

**Using npx:**

The `-y` flag should auto-install dependencies. If it fails:

1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

2. Try running manually:
   ```bash
   npx -y mcp-consultant-tools@latest
   ```

**Using global install:**

Reinstall the package:

```bash
npm uninstall -g mcp-consultant-tools
npm install -g mcp-consultant-tools@latest
```

### Local Development Issues

**Build errors:**

```bash
cd /path/to/mcp-consultant-tools
rm -rf node_modules build
npm install
npm run build
```

**Test the server directly:**

```bash
node /path/to/mcp-consultant-tools/build/index.js
```

The server should wait for input (this is normal for stdio server). Press Ctrl+C to exit.

### Version Issues with npx

If you're getting an old cached version:

**Always use `@latest`:**
```json
{
  "args": ["-y", "mcp-consultant-tools@latest"]
}
```

**Or specify exact version:**
```json
{
  "args": ["-y", "mcp-consultant-tools@3.0.0"]
}
```

**Clear cache:**
```bash
npm cache clean --force
```

---

## Security Best Practices

### General

1. **Never commit credentials** to version control
   - Add `.vscode/mcp.json` to `.gitignore` if it contains credentials
   - Use environment variables for shared repositories

2. **Use minimal permissions**
   - PowerPlatform: Use service accounts with least privilege
   - Azure DevOps: Scope PATs to only required permissions
   - Figma: Consider separate tokens for different use cases

3. **Rotate credentials regularly**
   - Azure AD client secrets: Rotate every 90 days
   - Azure DevOps PATs: Set expiration dates and rotate before expiry
   - Figma tokens: Regenerate periodically

4. **Use environment-specific configurations**
   - Separate dev/staging/prod credentials
   - Use different PATs for different environments

### PowerPlatform

- Use Azure AD app registration (not personal credentials)
- Grant only necessary API permissions
- Use service accounts for automated access
- Monitor app registration usage in Azure AD audit logs

### Azure DevOps

**Read-Only Access (Recommended for most users):**
```bash
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=false
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=false
AZUREDEVOPS_ENABLE_WIKI_WRITE=false
```

**Developer Access (Can create/update work items):**
```bash
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=false
AZUREDEVOPS_ENABLE_WIKI_WRITE=false
```

**Full Access (Team leads/admins only):**
```bash
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true
AZUREDEVOPS_ENABLE_WIKI_WRITE=true
```

**Project Scoping:**

Limit access to specific projects:
```bash
AZUREDEVOPS_PROJECTS=Project1,Project2
```

Never use `*` or leave empty (would allow all projects).

### Figma

- Use separate tokens for different tools/integrations
- Revoke tokens when no longer needed
- Monitor token usage in Figma settings
- Consider OAuth for team environments (requires `FIGMA_USE_OAUTH=true`)

---

## Verification

### Test the Setup

**Claude Desktop:**

Ask Claude:
```
Can you show me the available PowerPlatform entities?
```

or

```
Search our wiki for "authentication"
```

**VS Code (Claude Code):**

Ask Claude Code:
```
List all PowerPlatform plugin assemblies
```

or

```
Show me active work items in MyProject
```

### Check Available Tools

The MCP client should show all configured tools based on your environment variables:

**PowerPlatform tools** (if `POWERPLATFORM_*` is configured):
- 15 tools for entities, plugins, workflows, flows

**Azure DevOps tools** (if `AZUREDEVOPS_*` is configured):
- 12 tools for wikis and work items

**Figma tools** (if `FIGMA_*` is configured):
- 2 tools for design data

**Total:** Up to 30 tools and 12 prompts when all integrations are configured.

---

## Next Steps

- See [TOOLS.md](TOOLS.md) for complete tool reference
- See [USAGE.md](USAGE.md) for examples and use cases
- See [CLAUDE.md](CLAUDE.md) for architecture and development details
