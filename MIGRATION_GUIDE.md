# Migration Guide: v14 → v15

This guide helps you migrate from mcp-consultant-tools v14 (monolithic package) to v15 (modular monorepo).

## 🎯 What Changed in v15?

**v15.0.0** introduces a **modular monorepo architecture** with 11 independently published npm packages:

- **1 core package**: [@mcp-consultant-tools/core](packages/core) - Shared utilities
- **10 service packages**: PowerPlatform, Azure DevOps, Figma, Application Insights, Log Analytics, Azure SQL, Service Bus, SharePoint, GitHub Enterprise
- **1 meta-package**: [mcp-consultant-tools](packages/meta) - Complete package with all integrations

**Key Benefits:**
- ✅ **Smaller dependencies** - Install only what you need
- ✅ **Independent versioning** - Services evolve independently
- ✅ **Faster installs** - Reduced package size (328KB → 64KB for core)
- ✅ **Better modularity** - Clear separation of concerns

## 📦 Migration Paths

### Option 1: Keep Using Complete Package (Easiest)

If you want all integrations, simply update your version:

**Before (v14):**
```json
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["mcp-consultant-tools@14"],
      "env": { ... }
    }
  }
}
```

**After (v15):**
```json
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["mcp-consultant-tools"],
      "env": { ... }
    }
  }
}
```

**No code changes required!** The v15 meta-package maintains full backward compatibility.

### Option 2: Switch to Individual Packages (Recommended)

If you only use specific integrations, switch to individual packages:

**Before (v14) - All integrations:**
```json
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["mcp-consultant-tools@14"],
      "env": {
        "POWERPLATFORM_URL": "...",
        "AZUREDEVOPS_PAT": "...",
        "FIGMA_API_KEY": "..."
      }
    }
  }
}
```

**After (v15) - Individual packages:**
```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "...",
        "POWERPLATFORM_CLIENT_ID": "...",
        "POWERPLATFORM_CLIENT_SECRET": "...",
        "POWERPLATFORM_TENANT_ID": "..."
      }
    },
    "azure-devops": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/azure-devops"],
      "env": {
        "AZUREDEVOPS_ORGANIZATION": "...",
        "AZUREDEVOPS_PAT": "..."
      }
    },
    "figma": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/figma"],
      "env": {
        "FIGMA_API_KEY": "..."
      }
    }
  }
}
```

**Benefits:**
- Smaller package size per integration
- Faster startup times
- Independent updates
- Clearer tool organization in Claude

## 🔄 Configuration Changes

### Environment Variables (No Changes)

All environment variables remain the same! No configuration changes required.

```bash
# PowerPlatform - Same as v14
POWERPLATFORM_URL=https://yourenvironment.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=your-client-id
POWERPLATFORM_CLIENT_SECRET=your-secret
POWERPLATFORM_TENANT_ID=your-tenant-id

# Azure DevOps - Same as v14
AZUREDEVOPS_ORGANIZATION=your-org
AZUREDEVOPS_PAT=your-pat
AZUREDEVOPS_PROJECTS=Project1,Project2

# All other services - No changes
```

### Tool and Prompt Names (No Changes)

All tool and prompt names remain identical:

```javascript
// v14 and v15 - Same tool names
await mcpClient.invoke("get-entity-metadata", { entityName: "account" });
await mcpClient.invoke("search-wiki-pages", { project: "RTPI", query: "release notes" });
await mcpClient.invoke("get-figma-data", { fileKey: "ABC123" });
```

## 🛠️ Programmatic Usage

If you're using mcp-consultant-tools programmatically (not via MCP), import paths have changed.

### Before (v14) - Monolithic Import

```typescript
import { PowerPlatformService } from 'mcp-consultant-tools';
```

### After (v15) - Modular Imports

**Option 1: Use complete package (maintains compatibility)**
```typescript
import { registerAllTools } from 'mcp-consultant-tools';
import { createMcpServer } from '@mcp-consultant-tools/core';

const server = createMcpServer({
  name: "my-server",
  version: "1.0.0",
  capabilities: { tools: {}, prompts: {} }
});

registerAllTools(server);
```

**Option 2: Use individual packages (recommended)**
```typescript
import { registerPowerPlatformTools } from '@mcp-consultant-tools/powerplatform';
import { registerAzureDevOpsTools } from '@mcp-consultant-tools/azure-devops';
import { createMcpServer } from '@mcp-consultant-tools/core';

const server = createMcpServer({
  name: "my-server",
  version: "1.0.0",
  capabilities: { tools: {}, prompts: {} }
});

registerPowerPlatformTools(server);
registerAzureDevOpsTools(server);
```

**Option 3: Direct service access**
```typescript
import { PowerPlatformService } from '@mcp-consultant-tools/powerplatform';
import { AzureDevOpsService } from '@mcp-consultant-tools/azure-devops';

const ppService = new PowerPlatformService({
  url: process.env.POWERPLATFORM_URL!,
  clientId: process.env.POWERPLATFORM_CLIENT_ID!,
  clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET!,
  tenantId: process.env.POWERPLATFORM_TENANT_ID!
});

const entities = await ppService.getEntityMetadata('account');
```

## 📊 Package Size Comparison

| v14 (Monolithic) | v15 (Modular) | Savings |
|------------------|---------------|---------|
| 28,755 LOC | Core: 64KB | -99.7% |
| Single package | PowerPlatform: 328KB | -98.9% |
| All or nothing | Azure DevOps: 76KB | -99.7% |

**Example**: If you only use PowerPlatform tools, you install 328KB instead of the full package.

## 🔍 Breaking Changes

### None for MCP Users!

If you're using mcp-consultant-tools via Claude Desktop or other MCP clients, **there are no breaking changes**:

- All tool names are identical
- All prompt names are identical
- All environment variables are identical
- All functionality is preserved

### For Programmatic Users

**Breaking change**: Import paths changed from `'mcp-consultant-tools'` to `'@mcp-consultant-tools/*'`

**Migration steps:**

1. Update package.json dependencies:
```json
{
  "dependencies": {
    "mcp-consultant-tools": "^14.0.0"
  }
}
```

**↓ Changes to ↓**

```json
{
  "dependencies": {
    "@mcp-consultant-tools/core": "^1.0.0",
    "@mcp-consultant-tools/powerplatform": "^1.0.0",
    "@mcp-consultant-tools/azure-devops": "^1.0.0"
  }
}
```

2. Update import statements (see [Programmatic Usage](#programmatic-usage) section above)

3. Run `npm install` to update dependencies

## 🚀 New Features in v15

While maintaining backward compatibility, v15 adds:

1. **Independent versioning** - Services can release updates independently
2. **Smaller footprint** - Install only the services you need
3. **Better organization** - Clear package boundaries
4. **Faster installs** - Reduced dependency tree
5. **Monorepo benefits** - Shared tooling and build configuration

## 📖 Version Mapping

| v14 Package | v15 Equivalent | Status |
|-------------|----------------|--------|
| mcp-consultant-tools@14.x | mcp-consultant-tools@15.x | ✅ Backward compatible |
| N/A | @mcp-consultant-tools/core@1.x | ✅ New |
| N/A | @mcp-consultant-tools/powerplatform@1.x | ✅ New |
| N/A | @mcp-consultant-tools/azure-devops@1.x | ✅ New |
| N/A | @mcp-consultant-tools/figma@1.x | ✅ New |
| N/A | @mcp-consultant-tools/application-insights@1.x | ✅ New |
| N/A | @mcp-consultant-tools/log-analytics@1.x | ✅ New |
| N/A | @mcp-consultant-tools/azure-sql@1.x | ✅ New |
| N/A | @mcp-consultant-tools/service-bus@1.x | ✅ New |
| N/A | @mcp-consultant-tools/sharepoint@1.x | ✅ New |
| N/A | @mcp-consultant-tools/github-enterprise@1.x | ✅ New |

## 🆘 Troubleshooting

### "Cannot find module '@mcp-consultant-tools/core'"

**Problem**: Using v15 packages but haven't installed them

**Solution**: Run `npm install @mcp-consultant-tools/core` (or the specific package you need)

### "Tools are missing after upgrade"

**Problem**: Using individual packages but some integrations not configured

**Solution**: Either:
1. Switch to complete package: `npx mcp-consultant-tools`
2. Install missing individual packages: `npx @mcp-consultant-tools/powerplatform`

### "Module not found: 'mcp-consultant-tools'"

**Problem**: Updated imports but didn't update package.json

**Solution**: Update dependencies to use scoped packages (`@mcp-consultant-tools/*`)

## 📚 Additional Resources

- **[README.md](README.md)** - Complete package documentation
- **[CLAUDE.md](CLAUDE.md)** - Development and architecture guide
- **[CHANGELOG.md](CHANGELOG.md)** - Full version history
- **[Package Documentation](packages/)** - Individual package READMEs
  - [PowerPlatform](packages/powerplatform/README.md)
  - [Azure DevOps](packages/azure-devops/README.md)
  - [Figma](packages/figma/README.md)
  - [Application Insights](packages/application-insights/README.md)
  - [Log Analytics](packages/log-analytics/README.md)
  - [Azure SQL](packages/azure-sql/README.md)
  - [Service Bus](packages/service-bus/README.md)
  - [SharePoint](packages/sharepoint/README.md)
  - [GitHub Enterprise](packages/github-enterprise/README.md)

## 💬 Support

- **Issues**: https://github.com/klemensms/mcp-consultant-tools/issues
- **Discussions**: https://github.com/klemensms/mcp-consultant-tools/discussions
- **npm**: https://www.npmjs.com/org/mcp-consultant-tools

---

**Questions?** Open an issue on GitHub or check the package documentation for your specific integration.
