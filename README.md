# MCP Consultant Tools

**Modular Model Context Protocol (MCP) server providing AI-powered access to Microsoft PowerPlatform, Azure DevOps, Figma, Azure monitoring services, databases, and GitHub Enterprise.**

[![npm version](https://badge.fury.io/js/mcp-consultant-tools.svg)](https://www.npmjs.com/package/mcp-consultant-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

MCP Consultant Tools is a **modular monorepo** with **22 independently published npm packages** under the `@mcp-consultant-tools` organization. Install individual packages for specific integrations or the complete meta-package for everything.

> **PII protection (v32):** A 4-layer redaction pipeline is built into `powerplatform-data`, `azure-devops`, `azure-sql`, `rest-api`, and `azure-b2c` to keep personal data from reaching the US-hosted LLM during MCP tool calls against client production environments. It is **opt-in** — off by default; enable it per server with `PII_PROTECTION=true`. See [docs/documentation/pii-protection.md](docs/documentation/pii-protection.md).

- **PII audit logging (opt-in):** when enabled with `MCP_AUDIT_LEVEL=lean|full`, every Dataverse MCP tool call produces a tamper-evident audit record (Phase A — local file; Phase B — central sync follows).

## Package Architecture

### Core Package
| Package | Description |
|---------|-------------|
| **[@mcp-consultant-tools/core](packages/core)** | Shared utilities, MCP helpers, audit logging |

### Service Packages
| Package | Integration | Tools | CLI Binary | Documentation |
|---------|-------------|-------|-----------|---------------|
| **powerplatform-core** | Shared PowerPlatform services (internal) | N/A | N/A | — |
| **powerplatform** | PowerPlatform/Dataverse (Read-Only) | 51 | `mcp-pp-cli` | [Setup & Usage](docs/documentation/POWERPLATFORM.md) |
| **powerplatform-customization** | PowerPlatform Schema Changes | 85 | `mcp-pp-custom-cli` | [Setup & Usage](docs/documentation/POWERPLATFORM_CUSTOMIZATION.md) |
| **powerplatform-data** | PowerPlatform Data CRUD | 14 | `mcp-pp-data-cli` | [Setup & Usage](docs/documentation/POWERPLATFORM_DATA.md) |
| **azure-devops** | Azure DevOps Wikis, Work Items, PRs, Builds, Branches, Test Runs | 73 | `mcp-ado-cli` | [Setup & Usage](docs/documentation/AZURE_DEVOPS.md) |
| **azure-devops-admin** | Azure DevOps Pipelines, Deploys, Feeds, Service Conns, Pools, Sprint Capacity | 75 | `mcp-ado-admin-cli` | [Setup & Usage](docs/documentation/AZURE_DEVOPS_ADMIN.md) |
| **azure-management** | Azure ARM API (Functions, App Services, Key Vault, SQL, Monitoring, Resource Graph, log streaming) | 42 | `mcp-azure-mgmt-cli` | [Setup & Usage](docs/documentation/AZURE_MANAGEMENT.md) |
| **azure-defender** | Microsoft Defender for Cloud (secure score, assessments, compliance, attack paths) | 12 | `mcp-defender-cli` | [Setup & Usage](docs/documentation/AZURE_DEFENDER.md) |
| **entra-id** | Microsoft Entra ID (app registration audit, secret & certificate expiry) | 2 | `mcp-entra-cli` | [Setup & Usage](docs/documentation/ENTRA_ID.md) |
| **message-center** | Microsoft 365 Service Health & Message Center (health overviews, issues, incident reports, posts) | 7 | `mcp-message-center-cli` | [Setup & Usage](docs/documentation/MESSAGE_CENTER.md) |
| **code-review** | Repository review across Azure DevOps / GitHub Enterprise (.NET EOL scan, NuGet audit, complexity estimate, GitHub Packages) | 10 | `mcp-code-review-cli` | [Setup & Usage](docs/documentation/CODE_REVIEW.md) |
| **sharepoint** | SharePoint Online | 16-22 | `mcp-spo-cli` | [Setup & Usage](docs/documentation/SHAREPOINT.md) |
| **github-enterprise** | GitHub Enterprise | 22 | `mcp-ghe-cli` | [Setup & Usage](docs/documentation/GITHUB_ENTERPRISE.md) |
| **figma** | Figma Design Extraction | 4 | `mcp-figma-cli` | [Setup & Usage](docs/documentation/FIGMA.md) |
| **application-insights** | Application Insights | 10 | `mcp-appins-cli` | [Setup & Usage](docs/documentation/APPLICATION_INSIGHTS.md) |
| **log-analytics** | Log Analytics | 13 | `mcp-loganalytics-cli` | [Setup & Usage](docs/documentation/LOG_ANALYTICS.md) |
| **1password** | 1Password Vault & Item Management | 21 | `mcp-op-cli` | [Setup & Usage](docs/documentation/ONEPASSWORD.md) |
| **azure-sql** | Azure SQL Database | 40 | `mcp-sql-cli` | [Setup & Usage](docs/documentation/AZURE_SQL.md) |
| **service-bus** | Azure Service Bus | 8 | `mcp-sb-cli` | [Setup & Usage](docs/documentation/SERVICE_BUS.md) |
| **azure-b2c** | Azure AD B2C | 11 | `mcp-azure-b2c-cli` | [Setup & Usage](docs/documentation/AZURE_B2C.md) |
| **azure-storage** | Azure Blob, Files, Queue, Table Storage | 47 | `mcp-storage-cli` | [Setup & Usage](docs/documentation/AZURE_STORAGE.md) |
| **azure-data-factory** | Azure Data Factory | 24 | `mcp-adf-cli` | [Setup & Usage](docs/documentation/azure-data-factory.md) |
| **fabric** | Microsoft Fabric (Workspaces, Capacities, Items, Shortcuts, Domains, Admin) | 27 | `mcp-fabric-cli` | [Setup & Usage](docs/documentation/FABRIC.md) |
| **rest-api** | Generic REST API (OAuth2) | 4 | `mcp-rest-api-cli` | [Setup & Usage](docs/documentation/REST_API.md) |
| **teams** | Microsoft Teams messaging | 7 | `mcp-teams-cli` | [Setup & Usage](docs/documentation/TEAMS.md) |

### Meta-Package
| Package | Description |
|---------|-------------|
| **[mcp-consultant-tools](packages/meta)** | Complete package with all integrations |

## Troubleshooting: npx Cache Issues

If you experience authentication failures after switching package versions (e.g., between `@beta` and `@latest`), clear the npx cache:

```bash
npx clear-npx-cache
```

Then restart your MCP client. See [Azure DevOps Troubleshooting](docs/documentation/AZURE_DEVOPS.md#npx-cache-issues) for details.

## Troubleshooting: `npm error code E401` (Unable to authenticate)

**Symptom** — an MCP server fails to start and the stderr tail shows:

```
npm warn Unknown project config "always-auth". This will stop working in the next major version of npm.
npm error code E401
npm error Unable to authenticate, your authentication token seems to be invalid.
npm error To correct this please try logging in again with: npm login
```

**This is npm failing to authenticate to a package registry — not the MCP server crashing.** It happens on machines (common at consulting shops / corporate setups) where npm's **default registry is a private feed** — Azure DevOps Artifacts, GitHub Packages, or an internal Verdaccio/Nexus proxy — usually with `always-auth=true` and a **PAT that has expired**. With `always-auth` on, npm tries to authenticate even when fetching the public `@mcp-consultant-tools/*` packages, and the dead token makes it bomb out before `npx` ever runs. The `always-auth` warning is the giveaway.

### Fix (recommended): pin the scope to the public npm registry

Tell npm that the `@mcp-consultant-tools` scope always comes from public npm, regardless of the default registry. This is non-destructive — it leaves the private feed working for everything else.

1. Open (or create) your **user-level** `.npmrc`:
   - Windows: `C:\Users\<your-username>\.npmrc`
   - macOS / Linux: `~/.npmrc`
2. Add this line:
   ```
   @mcp-consultant-tools:registry=https://registry.npmjs.org/
   ```
3. Verify (run from any directory):
   ```bash
   npm config get @mcp-consultant-tools:registry
   # → should print: https://registry.npmjs.org/

   npm view @mcp-consultant-tools/azure-devops@beta version
   # → should print a version (e.g. 32.0.0-beta.2), NOT "npm error code E401"
   ```
4. In your MCP client, reconnect the server (in Claude Code: `/mcp` → reconnect, or restart the session). The **first launch is slow** while npx fetches the package, then it connects.

### Diagnosing / alternative fixes

- **Confirm the diagnosis** — force the public registry for one call:
  ```bash
  npx --registry=https://registry.npmjs.org -y --package=@mcp-consultant-tools/PACKAGE BINARY --help
  ```
  If that works, it's 100% an `.npmrc` / registry-config issue.
- **Inspect the offending config** — `cat ~/.npmrc` (and any project-level `.npmrc` in the working directory). Look for: `always-auth=true`, a `registry=https://...` pointing at a private feed, `//pkgs.dev.azure.com/...:_authToken=...` (expired PAT), or a stray `@mcp-consultant-tools:registry=` pointing somewhere other than public npm.
- **Check the active default registry** — `npm config get registry` must return `https://registry.npmjs.org/`. If it returns a private feed and the scope pin above isn't an option, that's the root cause.
- **Stored / env-var tokens** — `npm logout` to clear stored tokens, then retry. Also check `env | grep -i npm` — `NPM_CONFIG_REGISTRY`, `NPM_TOKEN`, `NODE_AUTH_TOKEN` override `.npmrc`.

> `npx clear-npx-cache` does **not** help here — the cache isn't the problem, the registry config is.

---

## Install All CLI Tools

Install every CLI tool globally with one command. Ideal for AI agents, investigation workflows, and developers who want all tools available instantly.

```bash
# macOS / Linux
curl -sL https://raw.githubusercontent.com/klemensms/mcp-consultant-tools/main/docs/cli-setup/install-cli-tools.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/klemensms/mcp-consultant-tools/main/docs/cli-setup/install-cli-tools.ps1 | iex
```

After installation, all 21 CLI binaries are in your PATH and ready to use. Pass credentials via `--env-file .env` or `--mcp-server SERVER_NAME` (reads from `.mcp.json`).

**Full setup guide with agent prompt:** [CLI Setup Guide](docs/cli-setup/SETUP.md)

---

## Quick Start

### Option 1: Individual Package (Recommended)
```bash
# Install only what you need
npx @mcp-consultant-tools/powerplatform
```

### Option 2: Complete Package
```bash
# All integrations in one package
npx mcp-consultant-tools
```

### MCP Client Configuration

Each package documentation includes complete setup instructions with configuration examples for Claude Desktop and VS Code. See the **Documentation** column in the table above.

**Example** (PowerPlatform with Claude Desktop):
```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform", "mcp-consultant-tools-powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenv.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

For complete setup including authentication options, permissions, and troubleshooting, see [PowerPlatform Documentation](docs/documentation/POWERPLATFORM.md).

### Option 3: CLI Usage

Every package also includes a Commander.js CLI for shell-based access to the same tools:

```bash
# Run any CLI via npx
npx --package=@mcp-consultant-tools/azure-devops mcp-ado-cli wiki list MyProject

# JSON output mode
npx --package=@mcp-consultant-tools/azure-devops mcp-ado-cli --json wiki list MyProject

# List all available CLIs
npx --package=mcp-consultant-tools mcp-tools-cli list
```

CLI tools use the same environment variables as MCP servers. See the **CLI Binary** column in the package table above.

### CLI Access for AI Agents (Copy-Paste for CLAUDE.md)

If you have MCP servers configured in another repo and want agents/subagents to also use CLI tools (e.g., in hooks, subagents that don't inherit MCP connections, or shell scripts), add this to that repo's `CLAUDE.md`:

> **CLI Tools (for subagents, hooks, and scripting)**
>
> MCP servers are configured for native tool access, but CLI equivalents are also available via `npx` for use in subagents (which don't inherit MCP connections), hooks, and shell scripts. They use the same environment variables already configured for the MCP servers. Run `npx --package=@mcp-consultant-tools/<package> <binary> --help` for available commands. Common CLIs: `mcp-ado-cli` (Azure DevOps), `mcp-pp-cli` (PowerPlatform read-only), `mcp-pp-custom-cli` (PowerPlatform customization), `mcp-pp-data-cli` (PowerPlatform data), `mcp-ado-admin-cli` (ADO pipelines/admin), `mcp-spo-cli` (SharePoint), `mcp-sql-cli` (Azure SQL), `mcp-appins-cli` (Application Insights), `mcp-loganalytics-cli` (Log Analytics), `mcp-storage-cli` (Azure Storage), `mcp-adf-cli` (Data Factory), `mcp-azure-mgmt-cli` (Azure Management), `mcp-ghe-cli` (GitHub Enterprise), `mcp-azure-b2c-cli` (Azure B2C), `mcp-sb-cli` (Service Bus), `mcp-figma-cli` (Figma), `mcp-fabric-cli` (Microsoft Fabric), `mcp-rest-api-cli` (REST API), `mcp-teams-cli` (Teams), `mcp-message-center-cli` (M365 Service Health & Message Center), `mcp-code-review-cli` (repository .NET/NuGet/complexity review), `mcp-audit-cli` (audit log verify/quarantine/search). Use `--json` for raw JSON output suitable for piping.

## PowerPlatform Security Split

The PowerPlatform integration is split into **3 security-isolated packages**:

| Package | Purpose | Production-Safe? |
|---------|---------|------------------|
| **powerplatform** | Read-only access | ✅ YES |
| **powerplatform-customization** | Schema changes | ⚠️ Dev/config only |
| **powerplatform-data** | Data CRUD | ⚠️ Operational use |

Security is enforced through package selection - install only what you need per environment.

## Documentation

### Setup Guides (Start Here)
Each integration has comprehensive documentation with quick start, configuration, tool reference, and examples:

- [PowerPlatform (Read-Only)](docs/documentation/POWERPLATFORM.md)
- [PowerPlatform Customization](docs/documentation/POWERPLATFORM_CUSTOMIZATION.md)
- [PowerPlatform Data CRUD](docs/documentation/POWERPLATFORM_DATA.md)
- [Azure DevOps](docs/documentation/AZURE_DEVOPS.md)
- [Azure DevOps Admin](docs/documentation/AZURE_DEVOPS_ADMIN.md)
- [Azure Management](docs/documentation/AZURE_MANAGEMENT.md)
- [Azure Defender for Cloud](docs/documentation/AZURE_DEFENDER.md)
- [Microsoft Entra ID](docs/documentation/ENTRA_ID.md)
- [Microsoft 365 Message Center](docs/documentation/MESSAGE_CENTER.md)
- [Code Review](docs/documentation/CODE_REVIEW.md)
- [SharePoint Online](docs/documentation/SHAREPOINT.md)
- [GitHub Enterprise](docs/documentation/GITHUB_ENTERPRISE.md)
- [Figma](docs/documentation/FIGMA.md)
- [Application Insights](docs/documentation/APPLICATION_INSIGHTS.md)
- [Log Analytics](docs/documentation/LOG_ANALYTICS.md)
- [Azure SQL](docs/documentation/AZURE_SQL.md)
- [Service Bus](docs/documentation/SERVICE_BUS.md)
- [Azure AD B2C](docs/documentation/AZURE_B2C.md)
- [Azure Data Factory](docs/documentation/azure-data-factory.md)
- [Microsoft Fabric](docs/documentation/FABRIC.md)
- [REST API](docs/documentation/REST_API.md)

### Development & Technical Guides
- [Development Guide (CLAUDE.md)](CLAUDE.md) - Architecture, patterns, contributing
- [Release Process](docs/documentation/RELEASE_PROCESS.md) - Publishing workflow
- [Migration Guide](MIGRATION_GUIDE.md) - Upgrading between major versions

## Development

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

### Local Testing
```json
{
  "mcpServers": {
    "local-dev": {
      "command": "node",
      "args": ["/path/to/mcp-consultant-tools/packages/powerplatform/build/index.js"],
      "env": { "..." }
    }
  }
}
```

## Links

- **npm:** https://www.npmjs.com/org/mcp-consultant-tools
- **GitHub:** https://github.com/klemensms/mcp-consultant-tools
- **Issues:** https://github.com/klemensms/mcp-consultant-tools/issues
- **MCP Protocol:** https://modelcontextprotocol.io

## License

MIT License - see [LICENSE](LICENSE) for details.
