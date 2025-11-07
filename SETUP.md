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
        "POWERPLATFORM_ENABLE_CUSTOMIZATION": "true",
        "POWERPLATFORM_DEFAULT_SOLUTION": "YourSolutionName",

        "AZUREDEVOPS_ORGANIZATION": "your-organization-name",
        "AZUREDEVOPS_PAT": "your-personal-access-token",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false",

        "FIGMA_API_KEY": "your-figma-personal-access-token",
        "FIGMA_OAUTH_TOKEN": "",
        "FIGMA_USE_OAUTH": "false",

        "APPINSIGHTS_AUTH_METHOD": "entra-id",
        "APPINSIGHTS_TENANT_ID": "your-tenant-id",
        "APPINSIGHTS_CLIENT_ID": "your-client-id",
        "APPINSIGHTS_CLIENT_SECRET": "your-client-secret",
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod-api\",\"name\":\"Production API\",\"appId\":\"your-app-id\",\"active\":true}]",

        "AZURE_SQL_SERVER": "yourserver.database.windows.net",
        "AZURE_SQL_DATABASE": "yourdatabase",
        "AZURE_SQL_USERNAME": "your-username",
        "AZURE_SQL_PASSWORD": "your-password",
        "AZURE_SQL_USE_AZURE_AD": "false"
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
        "POWERPLATFORM_ENABLE_CUSTOMIZATION": "true",
        "POWERPLATFORM_DEFAULT_SOLUTION": "YourSolutionName",

        "AZUREDEVOPS_ORGANIZATION": "your-organization-name",
        "AZUREDEVOPS_PAT": "your-personal-access-token",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false",

        "FIGMA_API_KEY": "your-figma-personal-access-token",
        "FIGMA_OAUTH_TOKEN": "",
        "FIGMA_USE_OAUTH": "false",

        "APPINSIGHTS_AUTH_METHOD": "entra-id",
        "APPINSIGHTS_TENANT_ID": "your-tenant-id",
        "APPINSIGHTS_CLIENT_ID": "your-client-id",
        "APPINSIGHTS_CLIENT_SECRET": "your-client-secret",
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod-api\",\"name\":\"Production API\",\"appId\":\"your-app-id\",\"active\":true}]",

        "AZURE_SQL_SERVER": "yourserver.database.windows.net",
        "AZURE_SQL_DATABASE": "yourdatabase",
        "AZURE_SQL_USERNAME": "your-username",
        "AZURE_SQL_PASSWORD": "your-password",
        "AZURE_SQL_USE_AZURE_AD": "false"
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
export POWERPLATFORM_ENABLE_CUSTOMIZATION="true"
export POWERPLATFORM_DEFAULT_SOLUTION="YourSolutionName"

export AZUREDEVOPS_ORGANIZATION="your-organization"
export AZUREDEVOPS_PAT="your-pat"
export AZUREDEVOPS_PROJECTS="Project1,Project2"
export AZUREDEVOPS_API_VERSION="7.1"
export AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE="false"
export AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE="false"
export AZUREDEVOPS_ENABLE_WIKI_WRITE="false"

export FIGMA_API_KEY="your-figma-token"
export FIGMA_OAUTH_TOKEN=""
export FIGMA_USE_OAUTH="false"

export APPINSIGHTS_AUTH_METHOD="entra-id"
export APPINSIGHTS_TENANT_ID="your-tenant-id"
export APPINSIGHTS_CLIENT_ID="your-client-id"
export APPINSIGHTS_CLIENT_SECRET="your-client-secret"
export APPINSIGHTS_RESOURCES='[{"id":"prod-api","name":"Production API","appId":"your-app-id","active":true}]'

export AZURE_SQL_SERVER="yourserver.database.windows.net"
export AZURE_SQL_DATABASE="yourdatabase"
export AZURE_SQL_USERNAME="your-username"
export AZURE_SQL_PASSWORD="your-password"
export AZURE_SQL_USE_AZURE_AD="false"
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
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id",
        "POWERPLATFORM_ENABLE_CUSTOMIZATION": "true",
        "POWERPLATFORM_DEFAULT_SOLUTION": "YourSolutionName",

        "AZUREDEVOPS_ORGANIZATION": "your-organization-name",
        "AZUREDEVOPS_PAT": "your-personal-access-token",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false",

        "FIGMA_API_KEY": "your-figma-personal-access-token",
        "FIGMA_OAUTH_TOKEN": "",
        "FIGMA_USE_OAUTH": "false",

        "APPINSIGHTS_AUTH_METHOD": "entra-id",
        "APPINSIGHTS_TENANT_ID": "your-tenant-id",
        "APPINSIGHTS_CLIENT_ID": "your-client-id",
        "APPINSIGHTS_CLIENT_SECRET": "your-client-secret",
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod-api\",\"name\":\"Production API\",\"appId\":\"your-app-id\",\"active\":true}]",

        "AZURE_SQL_SERVER": "yourserver.database.windows.net",
        "AZURE_SQL_DATABASE": "yourdatabase",
        "AZURE_SQL_USERNAME": "your-username",
        "AZURE_SQL_PASSWORD": "your-password",
        "AZURE_SQL_USE_AZURE_AD": "false"
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
- `POWERPLATFORM_ENABLE_CUSTOMIZATION` (optional): Enable write operations for customization
  - Default: `"false"`
  - Set to `"true"` to enable entity/attribute creation, form/view management, solution operations, etc.
  - **WARNING:** Write operations make permanent changes to your CRM environment. Use with caution.
- `POWERPLATFORM_DEFAULT_SOLUTION` (optional): Default solution to add new customizations to
  - Example: `"YourSolutionName"`
  - When set, all created entities, attributes, forms, views, etc. will be automatically added to this solution

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

**Authentication Methods (choose one):**

- `FIGMA_API_KEY` (required if using PAT): Figma Personal Access Token
  - Get from: https://www.figma.com/developers/api#authentication
  - Recommended for personal use
- `FIGMA_OAUTH_TOKEN` (required if using OAuth): OAuth Bearer token
  - Used for team/organizational access
  - Requires `FIGMA_USE_OAUTH` to be `"true"`
- `FIGMA_USE_OAUTH` (optional): Set to `"true"` if using OAuth token instead of API key
  - Default: `"false"`
  - When `"true"`, uses `FIGMA_OAUTH_TOKEN` for authentication
  - When `"false"`, uses `FIGMA_API_KEY` for authentication

### Application Insights (Optional)

**Authentication Methods (choose one):**

**Option 1: Microsoft Entra ID (Recommended for Production)**
- `APPINSIGHTS_AUTH_METHOD` (optional): Authentication method
  - Options: `"entra-id"` or `"api-key"`
  - Default: `"entra-id"`
  - Entra ID provides higher rate limits (60 req/min vs 15 req/min)
- `APPINSIGHTS_TENANT_ID` (required if using Entra ID): Azure tenant ID
- `APPINSIGHTS_CLIENT_ID` (required if using Entra ID): Service principal client ID
- `APPINSIGHTS_CLIENT_SECRET` (required if using Entra ID): Service principal client secret
- `APPINSIGHTS_RESOURCES` (required): JSON array of Application Insights resources to monitor

**Option 2: API Key (Simpler for Single Resources)**
- `APPINSIGHTS_APP_ID` (required if not using APPINSIGHTS_RESOURCES): Application Insights application ID
- `APPINSIGHTS_API_KEY` (required if using API key auth): Application Insights API key

**Multi-Resource Configuration (Recommended):**

Configure multiple Application Insights resources with active/inactive flags:

```json
[
  {
    "id": "prod-api",
    "name": "Production API",
    "appId": "12345678-1234-1234-1234-123456789abc",
    "active": true,
    "description": "Production API Application Insights"
  },
  {
    "id": "prod-web",
    "name": "Production Web",
    "appId": "87654321-4321-4 321-4321-cba987654321",
    "active": true,
    "description": "Production Web Application Insights"
  },
  {
    "id": "staging-api",
    "name": "Staging API",
    "appId": "11111111-2222-3333-4444-555555555555",
    "active": false,
    "description": "Staging API (inactive)"
  }
]
```

Set as environment variable (minified):
```bash
APPINSIGHTS_RESOURCES='[{"id":"prod-api","name":"Production API","appId":"12345678-1234-1234-1234-123456789abc","active":true},{"id":"prod-web","name":"Production Web","appId":"87654321-4321-4321-4321-cba987654321","active":true}]'
```

**Single-Resource Configuration (Simple):**

For a single Application Insights resource:

```bash
APPINSIGHTS_APP_ID=12345678-1234-1234-1234-123456789abc
APPINSIGHTS_API_KEY=your-api-key-here
APPINSIGHTS_AUTH_METHOD=api-key
```

Or with Entra ID:

```bash
APPINSIGHTS_APP_ID=12345678-1234-1234-1234-123456789abc
APPINSIGHTS_TENANT_ID=your-tenant-id
APPINSIGHTS_CLIENT_ID=your-service-principal-client-id
APPINSIGHTS_CLIENT_SECRET=your-service-principal-secret
APPINSIGHTS_AUTH_METHOD=entra-id
```

### Azure SQL Database (Optional)

**Connection Settings:**

- `AZURE_SQL_SERVER` (required if using SQL Database): SQL Server hostname
  - Example: `yourserver.database.windows.net`
  - Do not include `tcp:` prefix or port number
- `AZURE_SQL_DATABASE` (required): Database name
  - Example: `yourdatabase`
- `AZURE_SQL_PORT` (optional): SQL Server port
  - Default: `1433`

**Authentication Methods (choose one):**

**Option 1: SQL Authentication (Username/Password)**
- `AZURE_SQL_USERNAME` (required if using SQL auth): SQL Server username
  - Example: `mcp_readonly`
- `AZURE_SQL_PASSWORD` (required if using SQL auth): SQL Server password
- `AZURE_SQL_USE_AZURE_AD` (optional): Set to `"false"` (default)

**Option 2: Azure AD Authentication (Recommended for Production)**
- `AZURE_SQL_USE_AZURE_AD` (required): Set to `"true"` to enable Azure AD auth
- `AZURE_SQL_CLIENT_ID` (required if using Azure AD): Service principal client ID
- `AZURE_SQL_CLIENT_SECRET` (required if using Azure AD): Service principal client secret
- `AZURE_SQL_TENANT_ID` (required if using Azure AD): Azure tenant ID

**Query Safety Limits (Optional):**

- `AZURE_SQL_QUERY_TIMEOUT` (optional): Query timeout in milliseconds
  - Default: `30000` (30 seconds)
  - Maximum: `300000` (5 minutes)
- `AZURE_SQL_MAX_RESULT_ROWS` (optional): Maximum rows returned per query
  - Default: `1000`
  - Maximum: `10000`
- `AZURE_SQL_CONNECTION_TIMEOUT` (optional): Connection timeout in milliseconds
  - Default: `15000` (15 seconds)

**Connection Pool Settings (Optional):**

- `AZURE_SQL_POOL_MIN` (optional): Minimum pool connections
  - Default: `0`
- `AZURE_SQL_POOL_MAX` (optional): Maximum pool connections
  - Default: `10`

**Note:** The MCP server is read-only by design. Only `SELECT` queries are permitted. All write operations (INSERT, UPDATE, DELETE, DROP, etc.) are blocked by query validation.

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

### Application Insights Credentials

**Option 1: Entra ID (Service Principal) - Recommended**

This is the recommended approach for production use with higher rate limits and better security.

**Step 1: Create Service Principal**

```bash
# Create service principal
az ad sp create-for-rbac \
  --name "mcp-appinsights-reader" \
  --role "Monitoring Reader" \
  --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group}/providers/Microsoft.Insights/components/{appinsights-name}

# Output (save these values):
# {
#   "appId": "87654321-4321-4321-4321-cba987654321",    # → APPINSIGHTS_CLIENT_ID
#   "password": "your-client-secret",                    # → APPINSIGHTS_CLIENT_SECRET
#   "tenant": "12345678-1234-1234-1234-123456789abc"    # → APPINSIGHTS_TENANT_ID
# }
```

**Step 2: Get Application Insights Application ID**

1. Go to Azure Portal → Application Insights → Your resource
2. Navigate to "API Access" under "Configure"
3. Copy the **Application ID** (GUID format)
4. This is your `appId` for the resource configuration

**Step 3: Assign Monitoring Reader Role (if not done in Step 1)**

```bash
# Assign role to existing service principal
az role assignment create \
  --assignee {client-id} \
  --role "Monitoring Reader" \
  --scope /subscriptions/{subscription-id}/resourceGroups/{resource-group}/providers/Microsoft.Insights/components/{appinsights-name}
```

**Step 4: Configure Environment Variables**

For multiple resources (recommended):

```bash
APPINSIGHTS_AUTH_METHOD=entra-id
APPINSIGHTS_TENANT_ID=your-tenant-id
APPINSIGHTS_CLIENT_ID=your-service-principal-client-id
APPINSIGHTS_CLIENT_SECRET=your-service-principal-secret
APPINSIGHTS_RESOURCES='[{"id":"prod-api","name":"Production API","appId":"app-id-from-portal","active":true},{"id":"prod-web","name":"Production Web","appId":"another-app-id","active":true}]'
```

**Option 2: API Key - Simpler for Single Resources**

This is simpler but has lower rate limits (15 req/min vs 60 req/min).

**Step 1: Create API Key**

1. Go to Azure Portal → Application Insights → Your resource
2. Navigate to "API Access" under "Configure"
3. Copy the **Application ID** (you'll need this)
4. Click "+ Create API Key"
5. Give it a name (e.g., "MCP Consultant Tools")
6. Select permissions: **Read telemetry**
7. Click "Generate key"
8. Copy the generated key (only shown once!)

**Step 2: Configure Environment Variables**

For a single resource:

```bash
APPINSIGHTS_APP_ID=your-application-id-from-portal
APPINSIGHTS_API_KEY=your-generated-api-key
APPINSIGHTS_AUTH_METHOD=api-key
```

**Finding Required Information:**

- **Application ID (appId)**: Azure Portal → Application Insights → API Access → Application ID
- **Subscription ID**: Azure Portal → Subscriptions → Subscription ID
- **Resource Group**: Azure Portal → Application Insights → Overview → Resource group
- **Application Insights Name**: The name of your Application Insights resource

**Required Permissions:**

- **Entra ID**: Service principal needs "Monitoring Reader" or "Reader" role on the Application Insights resource
- **API Key**: API key needs "Read telemetry" permission

**Security Note:**
- Service principal secrets should be rotated regularly (every 90 days recommended)
- API keys have lower rate limits but are simpler to set up
- Store all credentials securely. Never commit them to version control.
- Use Entra ID for production environments (better rate limits and security)

---

### Azure SQL Database Credentials

**Option 1: SQL Authentication (Username/Password) - Simpler**

This is the simplest approach for getting started.

**Step 1: Create Read-Only SQL User**

Connect to your Azure SQL Database using an admin account and run:

```sql
-- Create a login at the server level (master database)
USE master;
CREATE LOGIN mcp_readonly WITH PASSWORD = 'YourSecurePassword123!';

-- Switch to your application database
USE YourDatabaseName;
CREATE USER mcp_readonly FOR LOGIN mcp_readonly;

-- Grant read-only permissions
ALTER ROLE db_datareader ADD MEMBER [mcp_readonly];
GRANT VIEW DEFINITION TO [mcp_readonly];

-- Optional: Grant execute permissions on specific stored procedures
-- GRANT EXECUTE ON [dbo].[YourStoredProcedure] TO [mcp_readonly];
```

**Step 2: Configure Firewall Rules**

1. Go to Azure Portal → SQL Server → Networking/Firewall
2. Add your client IP address to the firewall rules
3. Or enable "Allow Azure services and resources to access this server" if running from Azure

**Step 3: Configure Environment Variables**

```bash
AZURE_SQL_SERVER=yourserver.database.windows.net
AZURE_SQL_DATABASE=yourdatabase
AZURE_SQL_USERNAME=mcp_readonly
AZURE_SQL_PASSWORD=YourSecurePassword123!
AZURE_SQL_USE_AZURE_AD=false
```

---

**Option 2: Azure AD Authentication (Recommended for Production)**

This provides better security with token-based authentication and no stored passwords.

**Step 1: Create Service Principal**

```bash
# Create service principal
az ad sp create-for-rbac --name "mcp-sql-reader"

# Output (save these values):
# {
#   "appId": "12345678-1234-1234-1234-123456789abc",       # → AZURE_SQL_CLIENT_ID
#   "password": "your-client-secret",                       # → AZURE_SQL_CLIENT_SECRET
#   "tenant": "87654321-4321-4321-4321-cba987654321"       # → AZURE_SQL_TENANT_ID
# }
```

**Step 2: Grant Service Principal Database Access**

Connect to your Azure SQL Database and run:

```sql
-- Create Azure AD user from the service principal
CREATE USER [mcp-sql-reader] FROM EXTERNAL PROVIDER;

-- Grant read-only permissions
ALTER ROLE db_datareader ADD MEMBER [mcp-sql-reader];
GRANT VIEW DEFINITION TO [mcp-sql-reader];
```

**Step 3: Configure Environment Variables**

```bash
AZURE_SQL_SERVER=yourserver.database.windows.net
AZURE_SQL_DATABASE=yourdatabase
AZURE_SQL_USE_AZURE_AD=true
AZURE_SQL_CLIENT_ID=your-service-principal-app-id
AZURE_SQL_CLIENT_SECRET=your-service-principal-secret
AZURE_SQL_TENANT_ID=your-azure-tenant-id
```

---

**Finding Required Information:**

- **Server Name**: Azure Portal → SQL Database → Overview → Server name (format: `yourserver.database.windows.net`)
- **Database Name**: Azure Portal → SQL Database → Overview → Database name
- **Connection String**: Azure Portal → SQL Database → Connection strings (for reference)

**Required Permissions:**

For read-only database investigation, the user/service principal needs:
- `db_datareader` role - Read access to all tables and views
- `VIEW DEFINITION` permission - View schema metadata (tables, views, procedures, triggers)

**Optional Permissions:**

If you want to query stored procedures:
- `EXECUTE` permission on specific procedures or schema

**Security Notes:**

- The MCP server is **read-only by design** - only SELECT queries are permitted
- All write operations (INSERT, UPDATE, DELETE, DROP, etc.) are blocked by query validation
- Connection strings are never logged or exposed
- Credentials are sanitized from all error messages
- Use Azure AD authentication for production (no stored passwords)
- SQL passwords should be complex (at least 12 characters, mixed case, numbers, symbols)
- Rotate credentials regularly (every 90 days recommended)
- Use separate credentials for MCP (don't use admin/DBA accounts)

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

**Azure SQL Database:**
- Verify server name is correct (format: `yourserver.database.windows.net`)
- Check database name is correct
- For SQL Authentication:
  - Verify username and password are correct
  - Check firewall rules allow your IP address
  - Ensure user has `db_datareader` and `VIEW DEFINITION` permissions
- For Azure AD Authentication:
  - Verify service principal credentials are correct
  - Check service principal has database access (`CREATE USER FROM EXTERNAL PROVIDER`)
  - Ensure Azure AD authentication is enabled on the SQL Server

**Application Insights:**
- Verify Application ID (appId) is correct
- For Entra ID:
  - Check service principal has "Monitoring Reader" role
  - Verify tenant ID and client credentials
- For API Key:
  - Verify API key hasn't been revoked
  - Check API key has "Read telemetry" permission

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

**Customization Write Operations (IMPORTANT):**

When `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`, the following tools make **permanent changes** to your CRM environment:

- Entity/attribute creation and deletion
- Form and view modifications
- Business rule changes
- Web resource uploads
- Solution import/export
- Publishing customizations

**Security Recommendations:**
- Use customization tools **only in development/test environments** initially
- Always test in a sandbox before production
- Use `POWERPLATFORM_DEFAULT_SOLUTION` to track all changes
- Export solutions regularly for backup
- Review and test all AI-generated customizations before publishing
- Consider separate credentials for read-only vs. write access
- Monitor audit logs for all customization operations

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
- 16 read-only tools (entities, plugins, workflows, flows)
- 56 customization tools (if `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`)
  - Entity & attribute management
  - Relationships
  - Forms & views
  - Global option sets
  - Business rules
  - Web resources
  - Solution management
  - Publishing & validation

**Azure DevOps tools** (if `AZUREDEVOPS_*` is configured):
- 12 tools for wikis and work items

**Figma tools** (if `FIGMA_*` is configured):
- 2 tools for design data

**Total:** Up to 86+ tools and 12 prompts when all integrations are configured.

---

## Next Steps

- See [TOOLS.md](TOOLS.md) for complete tool reference
- See [USAGE.md](USAGE.md) for examples and use cases
- See [CLAUDE.md](CLAUDE.md) for architecture and development details
