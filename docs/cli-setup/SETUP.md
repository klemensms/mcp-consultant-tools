# CLI Tools Setup Guide

Install the MCP Consultant Tools CLI on your machine so that AI agents (and you) can query Azure DevOps, PowerPlatform/Dataverse, Azure SQL, Log Analytics, SharePoint, and 15+ other services directly from the terminal.

## Quick Start

### macOS / Linux

```bash
curl -sL https://raw.githubusercontent.com/klemensms/mcp-consultant-tools/main/docs/cli-setup/install-cli-tools.sh | bash
```

Or clone and run locally:
```bash
git clone https://github.com/klemensms/mcp-consultant-tools.git
bash mcp-consultant-tools/docs/cli-setup/install-cli-tools.sh
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/klemensms/mcp-consultant-tools/main/docs/cli-setup/install-cli-tools.ps1 | iex
```

Or clone and run locally:
```powershell
git clone https://github.com/klemensms/mcp-consultant-tools.git
.\mcp-consultant-tools\docs\cli-setup\install-cli-tools.ps1
```

### Prerequisites

- **Node.js LTS** (v20+): [nodejs.org](https://nodejs.org/) or `winget install OpenJS.NodeJS.LTS`

## What Gets Installed

19 CLI tools covering all MCP Consultant Tools integrations:

| CLI Binary | Integration | What it does |
|-----------|-------------|-------------|
| `mcp-ado-cli` | Azure DevOps | Work items, wikis, PRs, builds |
| `mcp-ado-admin-cli` | Azure DevOps Admin | Pipelines, service connections, pools |
| `mcp-pp-cli` | PowerPlatform | Metadata, flows, views, forms (read-only) |
| `mcp-pp-custom-cli` | PowerPlatform Customization | Schema changes, solutions, publishing |
| `mcp-pp-data-cli` | PowerPlatform Data | Record CRUD, actions |
| `mcp-sql-cli` | Azure SQL | Queries, stored procedures, schema |
| `mcp-loganalytics-cli` | Log Analytics | KQL queries across workspaces |
| `mcp-appins-cli` | Application Insights | Logs, metrics, exceptions |
| `mcp-azure-mgmt-cli` | Azure Management | Functions, App Services, Key Vault |
| `mcp-storage-cli` | Azure Storage | Blobs, files, queues, tables |
| `mcp-adf-cli` | Azure Data Factory | Pipelines, triggers, datasets |
| `mcp-spo-cli` | SharePoint | Lists, documents, sites |
| `mcp-ghe-cli` | GitHub Enterprise | Repos, PRs, issues, code search |
| `mcp-azure-b2c-cli` | Azure AD B2C | Users, policies, applications |
| `mcp-sb-cli` | Service Bus | Queues, topics, messages |
| `mcp-figma-cli` | Figma | Design data extraction |
| `mcp-op-cli` | 1Password | Vaults, items, secrets |
| `mcp-rest-api-cli` | REST API | Generic OAuth2-authenticated REST calls |
| `mcp-teams-cli` | Microsoft Teams | Messages, channels |

## Updating

Re-run the same install script. It's idempotent — already-installed tools get updated to the latest version.

```bash
# macOS/Linux
bash install-cli-tools.sh

# Windows
.\install-cli-tools.ps1
```

## Checking Installed Versions

```bash
# macOS/Linux
bash install-cli-tools.sh --check

# Windows
.\install-cli-tools.ps1 -Check
```

## Authentication

CLI tools need credentials to connect to services. Two options:

### Option A: `.env` file (recommended for per-project setup)

Create a `.env` file with the required variables and pass it to any CLI tool:

```bash
mcp-ado-cli --env-file .env work-item get MyProject 12345
```

### Option B: `.mcp.json` file (recommended if you also use MCP servers)

If you have an `.mcp.json` configured for MCP servers, CLI tools can read credentials directly from it:

```bash
mcp-ado-cli --mcp-server my-ado-server work-item get MyProject 12345
```

This reads the `env` block from the named server in `.mcp.json` — same credentials, zero duplication.

### Getting Credentials

Ask your team lead for the `.mcp.json` or `.env` file for your client/environment. These are typically stored in 1Password and contain the client IDs, secrets, and connection strings needed to authenticate.

---

## Agent Prompt

Copy-paste the prompt below into your agent's instructions (CLAUDE.md, system prompt, etc.) to enable CLI tool usage. The agent will be able to install/update tools and use them with any `.env` or `.mcp.json` file you provide.

---

### Prompt: CLI Tools for Investigation

````
## CLI Tools Available

You have access to MCP Consultant Tools CLI — a set of 19 CLI tools for querying Azure DevOps, PowerPlatform/Dataverse, Azure SQL, Log Analytics, Application Insights, SharePoint, GitHub Enterprise, Azure Storage, Azure Data Factory, Azure B2C, Service Bus, Figma, 1Password, REST APIs, and Microsoft Teams.

### Installation / Update

If tools are not yet installed or need updating, install them **one at a time** using npm:

```bash
npm install -g @mcp-consultant-tools/azure-devops@beta
npm install -g @mcp-consultant-tools/powerplatform@beta
# ... etc. for each package needed
```

To install ALL 19 tools at once, run each of these commands (they are independent — run them sequentially):

```bash
npm install -g @mcp-consultant-tools/1password@beta
npm install -g @mcp-consultant-tools/application-insights@beta
npm install -g @mcp-consultant-tools/azure-b2c@beta
npm install -g @mcp-consultant-tools/azure-data-factory@beta
npm install -g @mcp-consultant-tools/azure-devops@beta
npm install -g @mcp-consultant-tools/azure-devops-admin@beta
npm install -g @mcp-consultant-tools/azure-management@beta
npm install -g @mcp-consultant-tools/azure-sql@beta
npm install -g @mcp-consultant-tools/azure-storage@beta
npm install -g @mcp-consultant-tools/figma@beta
npm install -g @mcp-consultant-tools/github-enterprise@beta
npm install -g @mcp-consultant-tools/log-analytics@beta
npm install -g @mcp-consultant-tools/powerplatform@beta
npm install -g @mcp-consultant-tools/powerplatform-customization@beta
npm install -g @mcp-consultant-tools/powerplatform-data@beta
npm install -g @mcp-consultant-tools/rest-api@beta
npm install -g @mcp-consultant-tools/service-bus@beta
npm install -g @mcp-consultant-tools/sharepoint@beta
npm install -g @mcp-consultant-tools/teams@beta
```

Alternatively, if an install script is available locally, run it with bash:
- macOS/Linux: `bash docs/cli-setup/install-cli-tools.sh` (from the mcp-consultant-tools repo)
- Windows PowerShell: `.\docs\cli-setup\install-cli-tools.ps1`

**Important:** The bash script requires `bash` to be invoked explicitly (e.g., `bash script.sh`). It works with Bash 3.2+ (macOS default).

Check what's installed: run the script with `--check` (bash) or `-Check` (PowerShell), or just run any binary with `--version`.

### Using the CLI Tools

Every tool supports `--help` for discovering available commands:
```
mcp-ado-cli --help              # List all command groups
mcp-ado-cli work-item --help    # List commands in a group
```

### Authentication

Pass credentials via one of:
- `--env-file /path/to/.env` — reads key=value pairs from a .env file
- `--mcp-server SERVER_NAME` — reads the env block from the nearest `.mcp.json` for that server name
- `--mcp-server SERVER_NAME --mcp-config /path/to/.mcp.json` — explicit config path

### Available CLI Binaries

| Binary | Package | Integration |
|--------|---------|-------------|
| `mcp-ado-cli` | `azure-devops` | Azure DevOps (work items, wikis, PRs, builds) |
| `mcp-ado-admin-cli` | `azure-devops-admin` | Azure DevOps Admin (pipelines, service connections) |
| `mcp-pp-cli` | `powerplatform` | PowerPlatform read-only (metadata, flows, views) |
| `mcp-pp-custom-cli` | `powerplatform-customization` | PowerPlatform customization (schema, solutions) |
| `mcp-pp-data-cli` | `powerplatform-data` | PowerPlatform data CRUD (records, actions) |
| `mcp-sql-cli` | `azure-sql` | Azure SQL (queries, stored procedures, schema) |
| `mcp-loganalytics-cli` | `log-analytics` | Log Analytics (KQL queries) |
| `mcp-appins-cli` | `application-insights` | Application Insights (logs, metrics) |
| `mcp-azure-mgmt-cli` | `azure-management` | Azure Management (Functions, App Services, Key Vault) |
| `mcp-storage-cli` | `azure-storage` | Azure Storage (blobs, files, queues, tables) |
| `mcp-adf-cli` | `azure-data-factory` | Azure Data Factory (pipelines, triggers) |
| `mcp-spo-cli` | `sharepoint` | SharePoint (lists, documents, sites) |
| `mcp-ghe-cli` | `github-enterprise` | GitHub Enterprise (repos, PRs, code search) |
| `mcp-azure-b2c-cli` | `azure-b2c` | Azure AD B2C (users, policies) |
| `mcp-sb-cli` | `service-bus` | Service Bus (queues, topics) |
| `mcp-figma-cli` | `figma` | Figma (design extraction) |
| `mcp-op-cli` | `1password` | 1Password (vaults, items, secrets) |
| `mcp-rest-api-cli` | `rest-api` | REST API (generic OAuth2 REST calls) |
| `mcp-teams-cli` | `teams` | Microsoft Teams (messages, channels) |

### Output

CLI tools print a summary to stdout and cache full JSON results to `.context/.mcp-*-cache/`. Use `--json` flag for raw JSON output.

### Environment Files

Look for `.env` or `.mcp.json` files in the current directory and child directories. These contain credentials for specific client environments (dev, UAT, prod). Each environment typically has its own file or folder.
````

---

## CLAUDE.md Snippet

For a ready-to-paste snippet that makes agents aware of installed CLI tools, see **[CLAUDE-SNIPPET.md](./CLAUDE-SNIPPET.md)** in this folder. Add its contents to your project's `CLAUDE.md` to give agents full discovery and authentication context.
