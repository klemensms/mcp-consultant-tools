# Installing via Docker MCP Toolkit

This guide covers installing mcp-consultant-tools packages via Docker Desktop's MCP Toolkit.

## Overview

Docker MCP Toolkit provides a streamlined way to discover, install, and manage MCP servers with:

- **One-click installation** from the Docker catalog
- **Secure credential management** via Docker secrets
- **Automatic updates** when new versions are released
- **Token-efficient discovery** - tools only loaded when needed

## Prerequisites

- **Docker Desktop 4.40+** with MCP Toolkit enabled
- **Azure AD credentials** for your integrations (varies by package)

## Benefits Comparison

| Feature | Docker | NPX |
|---------|--------|-----|
| Installation | One-click catalog | Manual configuration |
| Credentials | Docker secrets (secure) | .env files or MCP client config |
| Updates | Automatic | Manual npm update |
| Discovery | Search catalog | Must know package name |
| Token efficiency | Dynamic loading | Always in context |
| Setup time | ~2 minutes | ~5-10 minutes |

## Installation Steps

### Step 1: Enable MCP Toolkit

1. Open **Docker Desktop**
2. Go to **Settings** → **Features in development** (or **Beta features**)
3. Enable **MCP Toolkit**
4. Restart Docker Desktop if prompted

### Step 2: Add Server from Catalog

1. Click **MCP Toolkit** in the Docker Desktop sidebar
2. Go to the **Catalog** tab
3. Search for your desired package:
   - `mcp-consultant-tools-powerplatform` - PowerPlatform/Dataverse read-only
   - `mcp-consultant-tools-azure-devops` - Azure DevOps wikis and work items
   - `mcp-consultant-tools-figma` - Figma design extraction
   - *(more packages listed below)*
4. Click **Add**

### Step 3: Configure Credentials

Docker Desktop will display a form for required credentials. Example for PowerPlatform:

| Field | Value | Description |
|-------|-------|-------------|
| PowerPlatform URL | `https://yourorg.crm.dynamics.com` | Your environment URL |
| Tenant ID | `12345678-1234-...` | Azure AD tenant GUID |
| Client ID | `app-client-id` | App registration ID |
| Client Secret | `********` | App registration secret |

**Important**: Credentials are stored securely in Docker's secret store, not in environment variables or config files.

### Step 4: Enable Server

Toggle the server to **Enabled** status.

### Step 5: Connect Your AI Client

Configure your AI client to use Docker MCP Gateway:

**Claude Desktop / Claude Code** (`~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "docker": {
      "command": "docker",
      "args": ["mcp", "gateway"]
    }
  }
}
```

The Docker gateway provides access to all enabled MCP servers through a single connection.

## Available Packages

| Package | Description | Tools | Prompts |
|---------|-------------|-------|---------|
| `mcp-consultant-tools-powerplatform` | Dataverse read-only access | 38 | 10 |
| `mcp-consultant-tools-powerplatform-customization` | Schema modifications | 40 | 2 |
| `mcp-consultant-tools-powerplatform-data` | Data CRUD operations | 3 | 0 |
| `mcp-consultant-tools-azure-devops` | Wikis and work items | 18 | 6 |
| `mcp-consultant-tools-figma` | Design extraction | 2 | 0 |
| `mcp-consultant-tools-application-insights` | Telemetry queries | 10 | 5 |
| `mcp-consultant-tools-log-analytics` | Log workspace queries | 10 | 5 |
| `mcp-consultant-tools-azure-sql` | Database queries | 11 | 3 |
| `mcp-consultant-tools-service-bus` | Message inspection | 8 | 5 |
| `mcp-consultant-tools-sharepoint` | Site and file access | 15 | 5 |
| `mcp-consultant-tools-github-enterprise` | Repository access | 22 | 5 |
| `mcp-consultant-tools-azure-b2c` | User management | 11 | 2 |

## Multiple Environments

To connect to multiple environments (e.g., Production and Development):

### Option 1: Add Server Multiple Times

1. Add the server from the catalog
2. Configure with Production credentials
3. Rename to `powerplatform-prod` (if supported)
4. Add the same server again
5. Configure with Development credentials
6. Rename to `powerplatform-dev`

### Option 2: Switch Credentials

1. Disable current server
2. Update credentials in Docker Desktop
3. Re-enable server

## Dynamic Tool Discovery

With Docker MCP Gateway, tools are discovered dynamically:

1. Your AI client connects to Docker gateway
2. Gateway knows which servers are enabled
3. Tools are loaded on-demand when needed
4. Reduces context window bloat

**Example workflow**:
```
User: "I need to check my PowerPlatform plugins"

AI: Uses mcp-find to discover powerplatform server
    Uses mcp-add to activate it
    Uses get-plugins tool to fetch plugin list
    Returns results to user
```

This means you can have many servers enabled without impacting performance.

## Troubleshooting

### Server not appearing in catalog

- Ensure Docker Desktop is updated to 4.40+
- Check MCP Toolkit is enabled in Settings
- Try refreshing: `docker mcp catalog refresh`

### Authentication errors

- Verify credentials in Docker Desktop secrets
- Check Azure AD app permissions include required APIs
- Ensure client secret hasn't expired
- Verify environment URL is correct

### Container startup issues

```bash
# Check container logs
docker logs $(docker ps -q --filter ancestor=mcp/mcp-consultant-tools-powerplatform)

# Verify image is pulled
docker images | grep mcp-consultant-tools

# Test manually
docker run -it --rm \
  -e POWERPLATFORM_URL=https://yourorg.crm.dynamics.com \
  -e POWERPLATFORM_TENANT_ID=your-tenant-id \
  -e POWERPLATFORM_CLIENT_ID=your-client-id \
  -e POWERPLATFORM_CLIENT_SECRET=your-secret \
  mcp/mcp-consultant-tools-powerplatform
```

### Gateway connection issues

```bash
# Check gateway status
docker mcp status

# Restart gateway
docker mcp gateway restart

# View gateway logs
docker mcp gateway logs
```

## Alternative Installation (NPX)

If Docker isn't available, you can still use npx:

```bash
npx @mcp-consultant-tools/powerplatform
```

See the [main README](../../README.md) for detailed npx configuration.

## Security Considerations

### Docker Secrets vs .env Files

| Aspect | Docker Secrets | .env Files |
|--------|----------------|------------|
| Storage | Encrypted secret store | Plain text file |
| Access | Container process only | Anyone with file access |
| Inspection | Not visible in `docker inspect` | Visible in filesystem |
| Rotation | UI-based update | Manual file edit |

### Best Practices

1. **Use short-lived credentials** where possible
2. **Rotate secrets regularly** - update in Docker Desktop UI
3. **Limit permissions** - use read-only app registrations for production
4. **Review enabled servers** - disable unused servers

## Further Reading

- [Docker MCP Toolkit Documentation](https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/)
- [Docker MCP Gateway](https://github.com/docker/mcp-gateway)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
