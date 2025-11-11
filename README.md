# MCP Consultant Tools

**Modular Model Context Protocol (MCP) server providing AI-powered access to Microsoft PowerPlatform, Azure DevOps, Figma, Azure monitoring services, databases, and GitHub Enterprise.**

[![npm version](https://badge.fury.io/js/mcp-consultant-tools.svg)](https://www.npmjs.com/package/mcp-consultant-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎯 Overview

MCP Consultant Tools v15 is a **modular monorepo** with 11 independently published npm packages under the `@mcp-consultant-tools` organization. Use individual packages for specific integrations or install the complete meta-package for everything.

**Total Capabilities:** 172 tools + 47 prompts across 10 service integrations

## 📦 Package Architecture

### Core Package
- **[@mcp-consultant-tools/core](packages/core)** - Shared utilities, MCP helpers, audit logging

### Service Packages (Standalone)
| Package | Integration | Tools | Prompts | Size |
|---------|-------------|-------|---------|------|
| **[@mcp-consultant-tools/powerplatform](packages/powerplatform)** | PowerPlatform/Dataverse | 65 | 12 | 328KB |
| **[@mcp-consultant-tools/sharepoint](packages/sharepoint)** | SharePoint Online | 15 | 5 | 188KB |
| **[@mcp-consultant-tools/github-enterprise](packages/github-enterprise)** | GitHub Enterprise | 22 | 5 | 152KB |
| **[@mcp-consultant-tools/figma](packages/figma)** | Figma Design | 2 | 0 | 312KB |
| **[@mcp-consultant-tools/service-bus](packages/service-bus)** | Azure Service Bus | 8 | 5 | 128KB |
| **[@mcp-consultant-tools/azure-sql](packages/azure-sql)** | Azure SQL Database | 11 | 3 | 108KB |
| **[@mcp-consultant-tools/log-analytics](packages/log-analytics)** | Log Analytics | 10 | 5 | 92KB |
| **[@mcp-consultant-tools/azure-devops](packages/azure-devops)** | Azure DevOps | 18 | 6 | 76KB |
| **[@mcp-consultant-tools/application-insights](packages/application-insights)** | Application Insights | 10 | 5 | 76KB |

### Meta-Package (All Services)
- **[mcp-consultant-tools](packages/meta)** - Complete package with all integrations

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

### Configuration

#### Claude Desktop (All Services)
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
```bash
npm install @mcp-consultant-tools/core @mcp-consultant-tools/powerplatform
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform"],
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
**📖 [Full PowerPlatform Documentation](docs/documentation/POWERPLATFORM.md)**

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
      "args": ["@mcp-consultant-tools/azure-devops"],
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
      "args": ["@mcp-consultant-tools/sharepoint"],
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
      "args": ["@mcp-consultant-tools/github-enterprise"],
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
      "args": ["@mcp-consultant-tools/application-insights"],
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
      "args": ["@mcp-consultant-tools/log-analytics"],
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
      "args": ["@mcp-consultant-tools/azure-sql"],
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
      "args": ["@mcp-consultant-tools/service-bus"],
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
      "args": ["@mcp-consultant-tools/figma"],
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
