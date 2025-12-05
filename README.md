# MCP Consultant Tools

**Modular Model Context Protocol (MCP) server providing AI-powered access to Microsoft PowerPlatform, Azure DevOps, Figma, Azure monitoring services, databases, and GitHub Enterprise.**

[![npm version](https://badge.fury.io/js/mcp-consultant-tools.svg)](https://www.npmjs.com/package/mcp-consultant-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎯 Overview

MCP Consultant Tools v15 is a **modular monorepo** with **15 independently published npm packages** under the `@mcp-consultant-tools` organization. Use individual packages for specific integrations or install the complete meta-package for everything.

**Total Capabilities:** 188 tools + 52 prompts across 12 service integrations

## 📦 Package Architecture

### Core Package
- **[@mcp-consultant-tools/core](packages/core)** - Shared utilities, MCP helpers, audit logging

### Service Packages (Standalone)
| Package | Integration | Tools | Prompts | Size | Security |
|---------|-------------|-------|---------|------|----------|
| **[@mcp-consultant-tools/powerplatform](packages/powerplatform)** | PowerPlatform/Dataverse (Read-Only) | 40 | 11 | 280KB | ✅ Production-Safe |
| **[@mcp-consultant-tools/powerplatform-customization](packages/powerplatform-customization)** | PowerPlatform Schema Changes | 45 | 0 | 295KB | ⚠️ Dev/Config Only |
| **[@mcp-consultant-tools/powerplatform-data](packages/powerplatform-data)** | PowerPlatform Data CRUD | 3 | 0 | 185KB | ⚠️ Requires Explicit Permissions |
| **[@mcp-consultant-tools/sharepoint](packages/sharepoint)** | SharePoint Online | 15 | 5 | 188KB | ✅ Read-Only |
| **[@mcp-consultant-tools/github-enterprise](packages/github-enterprise)** | GitHub Enterprise | 22 | 5 | 152KB | ✅ Read-Only (default) |
| **[@mcp-consultant-tools/figma](packages/figma)** | Figma Design | 2 | 0 | 312KB | ✅ Read-Only |
| **[@mcp-consultant-tools/service-bus](packages/service-bus)** | Azure Service Bus | 8 | 5 | 128KB | ✅ Read-Only (peek) |
| **[@mcp-consultant-tools/azure-sql](packages/azure-sql)** | Azure SQL Database | 11 | 3 | 108KB | ✅ Read-Only |
| **[@mcp-consultant-tools/log-analytics](packages/log-analytics)** | Log Analytics | 10 | 5 | 92KB | ✅ Read-Only |
| **[@mcp-consultant-tools/azure-devops](packages/azure-devops)** | Azure DevOps | 18 | 6 | 76KB | ✅ Read-Only (default) |
| **[@mcp-consultant-tools/application-insights](packages/application-insights)** | Application Insights | 10 | 5 | 76KB | ✅ Read-Only |
| **[@mcp-consultant-tools/rest-api](packages/rest-api)** | REST API (OAuth2) | 4 | 2 | 45KB | ✅ Read-Only |
| **[@mcp-consultant-tools/azure-b2c](packages/azure-b2c)** | Azure AD B2C | 11 | 2 | 65KB | ✅ Read-Only (default) |

### Meta-Package (All Services)
- **[mcp-consultant-tools](packages/meta)** - Complete package with all integrations

## 🔒 PowerPlatform Security-Focused Split

The PowerPlatform integration is split into **3 security-isolated packages** following the principle of least privilege:

| Package | Use Case | Tools | Production-Safe? |
|---------|----------|-------|------------------|
| **powerplatform** | Read-only access | 38 | ✅ **YES** - Install in production |
| **powerplatform-customization** | Schema changes (entities, attributes, forms, solutions) | 45 | ⚠️ **NO** - Dev/config environments only |
| **powerplatform-data** | Data CRUD operations | 3 | ⚠️ **NO** - Operational environments only |

**Security Model (v21+):** Security is enforced through package selection. Install only the packages you need per environment:
- **Production:** `@mcp-consultant-tools/powerplatform` only (read-only, zero risk)
- **Development:** Add `powerplatform-customization` for schema work
- **Operational:** Add `powerplatform-data` for data management

**Why split?**
- **Security**: Install only the capabilities you need
- **Safety**: Reduce risk of accidental schema changes or data modifications in production
- **Compliance**: Easier to audit and approve specific capabilities
- **Flexibility**: Mix and match based on environment needs

**Migration**: Existing `@mcp-consultant-tools/powerplatform` users: Your package now contains only read-only tools. To access schema changes or data CRUD, install the additional packages.

## 🚀 Quick Start

### Option 1: Install Complete Package (All Integrations)
```bash
npm install mcp-consultant-tools
```

### Option 2: Install Individual Packages (Cherry-Pick)
```bash
# Install only what you need
npm install @mcp-consultant-tools/core
npm install @mcp-consultant-tools/powerplatform
npm install @mcp-consultant-tools/azure-devops
# ... etc
```

### Configuration Modes

There are **two ways** to run MCP servers depending on your use case:

#### 🌐 Production/Published Packages (npx)
Use `npx` with published packages from npm. Requires `--package` flag and binary name for scoped packages.

**When to use:** Production deployments, Claude Desktop, VSCode MCP extension

#### 💻 Local Development/Testing (node)
Use `node` with direct file paths. No `--package` flag needed.

**When to use:** Local development, testing unpublished changes, debugging

---

#### Claude Desktop (All Services - npx)
```json
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["mcp-consultant-tools"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenv.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",

        "AZUREDEVOPS_ORGANIZATION": "your-org",
        "AZUREDEVOPS_PAT": "your-pat",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",

        "FIGMA_API_KEY": "your-figma-token"
      }
    }
  }
}
```

## 📦 Individual Integration Setup

Each integration can be installed and configured independently. Choose only what you need:

### PowerPlatform/Dataverse

The PowerPlatform integration is split into **3 security-isolated packages**:

#### 1. Read-Only Access (Production-Safe)
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/powerplatform
```

**Claude Desktop / VSCode Config:**
```json
{
  "mcpServers": {
    "powerplatform-readonly": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform", "mcp-pp"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenv.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-azure-app-secret",
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id"
      }
    }
  }
}
```

#### 2. Schema Customization (Dev/Config Environments Only)
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/powerplatform-customization
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "powerplatform-customization": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-customization", "mcp-pp-custom"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenv.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-azure-app-secret",
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id",
        "POWERPLATFORM_ENABLE_CUSTOMIZATION": "true"
      }
    }
  }
}
```

#### 3. Data CRUD Operations (Operational Use)
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/powerplatform-data
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "powerplatform-data": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-data", "mcp-pp-data"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenv.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-azure-app-secret",
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id",
        "POWERPLATFORM_ENABLE_CREATE": "true",
        "POWERPLATFORM_ENABLE_UPDATE": "true",
        "POWERPLATFORM_ENABLE_DELETE": "true"
      }
    }
  }
}
```

**📖 Documentation:**
- **[PowerPlatform Read-Only](docs/documentation/POWERPLATFORM.md)** - Metadata exploration, querying, plugins/workflows
- **[PowerPlatform Customization](docs/documentation/POWERPLATFORM_CUSTOMIZATION.md)** - Schema changes, entity/attribute creation
- **[PowerPlatform Data](docs/documentation/POWERPLATFORM_DATA.md)** - Record creation, updates, deletions

---

#### 💻 Local Development Example (PowerPlatform)

For local development and testing (e.g., testing changes before publishing):

```json
{
  "mcpServers": {
    "powerplatform-readonly-local": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-consultant-tools/packages/powerplatform/build/index.js"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenv.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-azure-app-secret",
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id"
      }
    }
  }
}
```

**Note:** Replace `/absolute/path/to/mcp-consultant-tools` with your actual repository path. Use this format for:
- Testing local changes before publishing
- Debugging during development
- Running from a git clone instead of npm

---

### Azure DevOps
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/azure-devops
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-devops", "mcp-ado"],
      "env": {
        "AZUREDEVOPS_ORGANIZATION": "your-organization-name",
        "AZUREDEVOPS_PAT": "your-personal-access-token",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2"
      }
    }
  }
}
```
**📖 [Full Azure DevOps Documentation](docs/documentation/AZURE_DEVOPS.md)**

### SharePoint Online
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/sharepoint
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "sharepoint": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/sharepoint", "mcp-spo"],
      "env": {
        "SHAREPOINT_SITES": "[{\"id\":\"main\",\"name\":\"Main Site\",\"siteUrl\":\"https://yourtenant.sharepoint.com/sites/yoursite\",\"active\":true}]",
        "SHAREPOINT_TENANT_ID": "your-azure-tenant-id",
        "SHAREPOINT_CLIENT_ID": "your-azure-app-client-id",
        "SHAREPOINT_CLIENT_SECRET": "your-azure-app-secret"
      }
    }
  }
}
```
**📖 [Full SharePoint Documentation](docs/documentation/SHAREPOINT.md)**

### GitHub Enterprise
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/github-enterprise
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "github-enterprise": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/github-enterprise", "mcp-ghe"],
      "env": {
        "GHE_REPOS": "[{\"id\":\"my-repo\",\"owner\":\"myorg\",\"repo\":\"MyRepository\",\"defaultBranch\":\"main\",\"active\":true}]",
        "GHE_TOKEN": "your-github-personal-access-token"
      }
    }
  }
}
```
**📖 [Full GitHub Enterprise Documentation](docs/documentation/GITHUB_ENTERPRISE.md)**

### Application Insights
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/application-insights
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "application-insights": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/application-insights", "mcp-appins"],
      "env": {
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod\",\"name\":\"Production\",\"appId\":\"your-app-insights-app-id\",\"active\":true}]",
        "APPINSIGHTS_TENANT_ID": "your-azure-tenant-id",
        "APPINSIGHTS_CLIENT_ID": "your-azure-app-client-id",
        "APPINSIGHTS_CLIENT_SECRET": "your-azure-app-secret"
      }
    }
  }
}
```
**📖 [Full Application Insights Documentation](docs/documentation/APPLICATION_INSIGHTS.md)**

### Log Analytics
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/log-analytics
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "log-analytics": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/log-analytics", "mcp-loganalytics"],
      "env": {
        "LOGANALYTICS_RESOURCES": "[{\"id\":\"prod\",\"name\":\"Production\",\"workspaceId\":\"your-workspace-id\",\"active\":true}]",
        "LOGANALYTICS_TENANT_ID": "your-azure-tenant-id",
        "LOGANALYTICS_CLIENT_ID": "your-azure-app-client-id",
        "LOGANALYTICS_CLIENT_SECRET": "your-azure-app-secret"
      }
    }
  }
}
```
**📖 [Full Log Analytics Documentation](docs/documentation/LOG_ANALYTICS.md)**

### Azure SQL Database
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/azure-sql
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "azure-sql": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-sql", "mcp-sql"],
      "env": {
        "AZURE_SQL_SERVERS": "[{\"id\":\"prod\",\"name\":\"Production\",\"server\":\"yourserver.database.windows.net\",\"port\":1433,\"active\":true,\"databases\":[{\"name\":\"YourDatabase\",\"active\":true}],\"username\":\"your-username\",\"password\":\"your-password\"}]"
      }
    }
  }
}
```
**📖 [Full Azure SQL Documentation](docs/documentation/AZURE_SQL.md)**

### Azure Service Bus
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/service-bus
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "service-bus": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/service-bus", "mcp-sb"],
      "env": {
        "SERVICEBUS_RESOURCES": "[{\"id\":\"prod\",\"name\":\"Production\",\"namespace\":\"yournamespace.servicebus.windows.net\",\"active\":true}]",
        "SERVICEBUS_TENANT_ID": "your-azure-tenant-id",
        "SERVICEBUS_CLIENT_ID": "your-azure-app-client-id",
        "SERVICEBUS_CLIENT_SECRET": "your-azure-app-secret"
      }
    }
  }
}
```
**📖 [Full Service Bus Documentation](docs/documentation/SERVICE_BUS.md)**

### Figma
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/figma
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/figma", "mcp-figma"],
      "env": {
        "FIGMA_API_KEY": "your-figma-personal-access-token"
      }
    }
  }
}
```
**📖 [Full Figma Documentation](docs/documentation/FIGMA.md)**

---

## 🔧 Service Integrations (Overview)

### PowerPlatform/Dataverse
Entity metadata, plugin inspection, workflows, business rules, data CRUD operations, and customization management.

**Key Features:**
- 65 tools for metadata exploration and data operations
- Plugin deployment validation
- Workflow and flow inspection
- Best practices validation
- Entity icon management with Fluent UI

### Azure DevOps
Wiki search, work item management, and WIQL queries.

**Key Features:**
- 18 tools for wikis and work items
- Full-text wiki search
- Work item CRUD with comments
- WIQL query execution
- Efficient string replacement in wiki pages

### Figma
Design data extraction and component analysis.

**Key Features:**
- Comprehensive design data extraction
- AI-friendly JSON transformation
- Component and style deduplication
- Depth-limited tree traversal

### Application Insights & Log Analytics
Azure monitoring, telemetry analysis, and log troubleshooting.

**Key Features:**
- 20 combined tools for Azure monitoring
- Exception analysis and performance monitoring
- Azure Functions troubleshooting
- KQL query execution
- Cross-service correlation

### Azure SQL Database
Database schema exploration and read-only queries.

**Key Features:**
- 11 tools for schema inspection
- Read-only SQL query execution
- Comprehensive security controls
- Table, view, procedure, and trigger inspection

### Azure Service Bus
Queue monitoring and dead letter queue analysis.

**Key Features:**
- 8 tools for queue inspection
- Read-only message peeking
- Dead letter queue analysis
- Session-enabled queue support

### SharePoint Online
Site management, document libraries, and PowerPlatform validation.

**Key Features:**
- 15 tools for SharePoint operations
- Document location validation
- Migration verification
- Microsoft Graph API integration

### GitHub Enterprise
Repository access, commit history, and code search.

**Key Features:**
- 22 tools for GitHub operations
- Branch auto-detection with typo handling
- Code search across repositories
- Pull request inspection
- Work item correlation (AB#1234)

## 📚 Documentation

- **[Migration Guide](MIGRATION_GUIDE.md)** - Upgrading from v14 to v15
- **[Development Guide](CLAUDE.md)** - Architecture and development patterns
- **Package Documentation:**
  - [PowerPlatform](packages/powerplatform/README.md)
  - [Azure DevOps](packages/azure-devops/README.md)
  - [Figma](packages/figma/README.md)
  - [Application Insights](packages/application-insights/README.md)
  - [Log Analytics](packages/log-analytics/README.md)
  - [Azure SQL](packages/azure-sql/README.md)
  - [Service Bus](packages/service-bus/README.md)
  - [SharePoint](packages/sharepoint/README.md)
  - [GitHub Enterprise](packages/github-enterprise/README.md)

## 🏗️ Monorepo Structure

```
mcp-consultant-tools/
├── packages/
│   ├── core/                  # Shared utilities
│   ├── powerplatform/         # PowerPlatform/Dataverse
│   ├── azure-devops/          # Azure DevOps
│   ├── figma/                 # Figma
│   ├── application-insights/  # Application Insights
│   ├── log-analytics/         # Log Analytics
│   ├── azure-sql/             # Azure SQL Database
│   ├── service-bus/           # Azure Service Bus
│   ├── sharepoint/            # SharePoint Online
│   ├── github-enterprise/     # GitHub Enterprise
│   └── meta/                  # Complete package
├── package.json               # Workspace root
└── tsconfig.base.json         # Shared TypeScript config
```

## 🔐 Security & Permissions

All integrations require appropriate credentials and permissions:

- **PowerPlatform:** Azure AD app with Dynamics CRM permissions
- **Azure DevOps:** Personal Access Token (PAT) with read/write scopes
- **Figma:** Personal Access Token or OAuth
- **Azure Services:** Service Principal with appropriate RBAC roles
- **GitHub Enterprise:** PAT with repo scope or GitHub App

See individual package documentation for detailed permission requirements.

## 🛠️ Development

### Build All Packages
```bash
npm install
npm run build
```

### Build Individual Package
```bash
cd packages/powerplatform
npm run build
```

### Publish Packages
```bash
# Publish all packages in dependency order
./scripts/publish-all.sh
```

## 📊 Version History

- **v15.0.0** (Current) - Modular monorepo architecture with 11 independently published packages
- **v14.0.0** - Azure SQL Database multi-server support
- **v13.0.0** - SharePoint Online integration
- **v12.0.0** - Service Bus integration
- **v11.0.0** - GitHub Enterprise integration
- **v10.0.0** - Log Analytics integration

See [CHANGELOG.md](CHANGELOG.md) for complete history.

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🔗 Links

- **GitHub:** https://github.com/klemensms/mcp-consultant-tools
- **npm:** https://www.npmjs.com/org/mcp-consultant-tools
- **Issues:** https://github.com/klemensms/mcp-consultant-tools/issues
- **Model Context Protocol:** https://modelcontextprotocol.io

## 💡 Use Cases

**PowerPlatform Development:**
- Explore entity metadata and relationships
- Validate plugin deployments for PRs
- Inspect workflow and flow definitions
- Manage entity customizations programmatically

**Azure DevOps Automation:**
- Search wiki documentation
- Manage work items with AI assistance
- Execute WIQL queries
- Correlate work items with code changes

**Figma Design Analysis:**
- Extract design tokens and component definitions
- Document design systems
- AI-assisted design QA
- Design-to-code workflows

**Azure Monitoring & Troubleshooting:**
- Analyze Application Insights exceptions
- Troubleshoot Azure Functions with Log Analytics
- Monitor Service Bus queue health
- Investigate SQL database schemas

**Cross-Service Workflows:**
- Correlate bugs (ADO) → code (GitHub) → deployed plugins (PowerPlatform) → runtime errors (App Insights)
- Trace document flows: PowerPlatform → SharePoint validation
- Monitor message flows: Service Bus → Application Insights

---

**Built with ❤️ for AI-assisted software development**
