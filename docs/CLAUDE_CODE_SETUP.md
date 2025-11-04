# Setting Up PowerPlatform MCP Server in Claude Code

## Option 1: Configure in VS Code Settings (Recommended)

1. **Open VS Code Settings**
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Preferences: Open User Settings (JSON)"
   - Press Enter

2. **Add MCP Server Configuration**

Add this to your `settings.json`:

```json
{
  "mcp.servers": {
    "powerplatform": {
      "command": "node",
      "args": [
        "/Users/klemensstelk/Repo/mcp-consultant-tools/build/index.js"
      ],
      "env": {
        "POWERPLATFORM_URL": "https://rtpidev.crm11.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

**IMPORTANT:** Replace the credential values with your actual PowerPlatform credentials.

## Option 2: Use Environment Variables (More Secure)

If you don't want credentials in VS Code settings:

1. **Set environment variables in your shell profile** (`~/.zshrc` or `~/.bash_profile`):

```bash
export POWERPLATFORM_URL="https://rtpidev.crm11.dynamics.com"
export POWERPLATFORM_CLIENT_ID="your-client-id"
export POWERPLATFORM_CLIENT_SECRET="your-client-secret"
export POWERPLATFORM_TENANT_ID="your-tenant-id"
```

2. **Then use this simpler VS Code configuration:**

```json
{
  "mcp.servers": {
    "powerplatform": {
      "command": "node",
      "args": [
        "/Users/klemensstelk/Repo/mcp-consultant-tools/build/index.js"
      ]
    }
  }
}
```

3. **Restart VS Code** after setting environment variables

## Option 3: Use the .env File (Development)

Since you already have a `.env` file in the repo:

1. **VS Code Configuration:**

```json
{
  "mcp.servers": {
    "powerplatform": {
      "command": "node",
      "args": [
        "/Users/klemensstelk/Repo/mcp-consultant-tools/build/index.js"
      ],
      "cwd": "/Users/klemensstelk/Repo/mcp-consultant-tools"
    }
  }
}
```

The `.env` file will be automatically loaded by the server.

## Verify the Setup

After adding the configuration:

1. **Reload VS Code Window**
   - Press `Cmd+Shift+P` / `Ctrl+Shift+P`
   - Type "Developer: Reload Window"
   - Press Enter

2. **Open Claude Code**
   - The PowerPlatform MCP server should now be available
   - You can verify by checking Claude Code's available tools

3. **Test a Tool**
   - Ask Claude Code: "List all PowerPlatform plugin assemblies"
   - Claude should use the `get-plugin-assemblies` tool

## Available Tools in Claude Code

Once configured, you'll have access to:

### Entity & Data Tools
- `get-entity-metadata`
- `get-entity-attributes`
- `get-entity-attribute`
- `get-entity-relationships`
- `get-global-option-set`
- `get-record`
- `query-records`

### Plugin Tools (NEW!)
- `get-plugin-assemblies` - List all plugin assemblies
- `get-plugin-assembly-complete` - Full validation for PR reviews
- `get-entity-plugin-pipeline` - See plugin execution order
- `get-plugin-trace-logs` - Query plugin errors

### Prompts
- `entity-overview`
- `attribute-details`
- `query-template`
- `relationship-map`
- `plugin-deployment-report`
- `entity-plugin-pipeline-report`

## Troubleshooting

### Server Not Showing Up

1. Check VS Code Output panel:
   - View → Output
   - Select "MCP" from dropdown
   - Look for errors

2. Check the build:
   ```bash
   cd /Users/klemensstelk/Repo/mcp-consultant-tools
   npm run build
   ```

3. Test the server directly:
   ```bash
   node /Users/klemensstelk/Repo/mcp-consultant-tools/build/index.js
   ```
   - Should wait for input (that's normal for stdio server)
   - Press Ctrl+C to exit

### Authentication Errors

- Verify your credentials in `.env` or environment variables
- Make sure the Azure AD app has permissions to access PowerPlatform
- Check the URL is correct (no trailing slash)

### Missing Tools

- Make sure you're using the latest build: `npm run build`
- Reload VS Code window
- Check that `build/index.js` exists

## Example Usage in Claude Code

Once configured, you can ask Claude Code:

**"Show me all plugin assemblies in my PowerPlatform environment"**
→ Uses `get-plugin-assemblies`

**"Validate the RTPI.Events.Plugins assembly for me"**
→ Uses `get-plugin-assembly-complete` and shows validation warnings

**"What plugins run on the account entity?"**
→ Uses `get-entity-plugin-pipeline`

**"Show me recent plugin errors for the account entity"**
→ Uses `get-plugin-trace-logs` with filters
