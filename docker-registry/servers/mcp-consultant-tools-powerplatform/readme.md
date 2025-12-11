# PowerPlatform / Dataverse MCP Server

Read-only access to Microsoft PowerPlatform/Dataverse environments for AI assistants.

## Features

- **38 tools** for exploring entities, plugins, workflows, and records
- **10 prompts** for common analysis and troubleshooting tasks
- **Production-safe**: No write operations, suitable for production environments
- **Azure AD authentication** via MSAL with token caching

## Available Tools

### Entity & Metadata
- `get-entities` - List all entities with filtering options
- `get-entity-metadata` - Detailed entity schema and attributes
- `get-entity-relationships` - Entity relationship mappings
- `get-global-optionsets` - Shared option set definitions

### Querying
- `query-records` - Query entity records with FetchXML or OData
- `get-record` - Retrieve single record by ID
- `get-record-count` - Count records matching criteria

### Plugins & Workflows
- `get-plugins` - List plugin assemblies and steps
- `get-plugin-types` - Plugin type registrations
- `get-plugin-steps` - Message processing steps
- `list-workflows` - Business process flows and workflows

### Solutions & Components
- `list-solutions` - Installed solutions
- `get-solution-components` - Solution component inventory
- `validate-solution` - Solution validation checks

### Best Practices
- `validate-dataverse-best-practices` - Comprehensive validation against Microsoft guidelines

## Prerequisites

1. **Azure AD App Registration** with:
   - API Permission: `Dynamics CRM` → `user_impersonation`
   - Client secret configured
   - Application user created in PowerPlatform environment

2. **PowerPlatform Environment URL** (e.g., `https://yourorg.crm.dynamics.com`)

## Configuration

When adding this server in Docker Desktop, you'll be prompted for:

| Secret | Environment Variable | Description |
|--------|---------------------|-------------|
| URL | `POWERPLATFORM_URL` | Your environment URL |
| Tenant ID | `POWERPLATFORM_TENANT_ID` | Azure AD tenant GUID |
| Client ID | `POWERPLATFORM_CLIENT_ID` | App registration client ID |
| Client Secret | `POWERPLATFORM_CLIENT_SECRET` | App registration secret |
| Default Solution | `POWERPLATFORM_DEFAULT_SOLUTION` | (Optional) Filter to specific solution |

## Related Packages

- **mcp-consultant-tools-powerplatform-customization** - Schema modification tools for development environments
- **mcp-consultant-tools-powerplatform-data** - Data CRUD operations for operational use

## Documentation

- [Full Documentation](https://github.com/klemensms/mcp-consultant-tools/blob/main/docs/documentation/powerplatform/)
- [Setup Guide](https://github.com/klemensms/mcp-consultant-tools/blob/main/docs/documentation/powerplatform/setup.md)
- [Tool Reference](https://github.com/klemensms/mcp-consultant-tools/blob/main/docs/documentation/powerplatform/tools.md)

## Alternative Installation

Also available via npm:

```bash
npx @mcp-consultant-tools/powerplatform
```

## License

MIT License - see [repository](https://github.com/klemensms/mcp-consultant-tools) for details.
