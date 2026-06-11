# CLAUDE.md Snippet — MCP Consultant Tools CLI

> **Instructions:** Copy the section below into your project's `CLAUDE.md` file.
> Adjust the authentication section to match how credentials are stored in your project
> (`.env`, `.mcp.json`, or both). Remove tools you don't use if you want a shorter list.

---

```markdown
## CLI Tools Available

21 CLI tools are installed globally for querying Azure, Power Platform, and other services directly from the terminal. All tools are from the `@mcp-consultant-tools` npm packages.

### Quick Reference

| CLI | Integration | What it does |
|-----|-------------|--------------|
| `mcp-ado-cli` | Azure DevOps | Work items, wikis, PRs, builds |
| `mcp-ado-admin-cli` | Azure DevOps Admin | Pipelines, service connections, agent pools |
| `mcp-pp-cli` | PowerPlatform | Metadata, flows, views, forms (read-only) |
| `mcp-pp-custom-cli` | PowerPlatform Customization | Schema changes, solutions, publishing |
| `mcp-pp-data-cli` | PowerPlatform Data | Record CRUD, actions |
| `mcp-sql-cli` | Azure SQL | Queries, stored procedures, schema |
| `mcp-loganalytics-cli` | Log Analytics | KQL queries across workspaces |
| `mcp-appins-cli` | Application Insights | Logs, metrics, exceptions |
| `mcp-azure-mgmt-cli` | Azure Management | Functions, App Services, Key Vault |
| `mcp-storage-cli` | Azure Storage | Blobs, files, queues, tables |
| `mcp-adf-cli` | Azure Data Factory | Pipelines, triggers, datasets |
| `mcp-fabric-cli` | Microsoft Fabric | Workspaces, items, capacities |
| `mcp-spo-cli` | SharePoint | Lists, documents, sites |
| `mcp-ghe-cli` | GitHub Enterprise | Repos, PRs, issues, code search |
| `mcp-azure-b2c-cli` | Azure AD B2C | Users, policies, applications |
| `mcp-sb-cli` | Service Bus | Queues, topics, messages |
| `mcp-figma-cli` | Figma | Design data extraction |
| `mcp-op-cli` | 1Password | Vaults, items, secrets |
| `mcp-rest-api-cli` | REST API | Generic OAuth2-authenticated REST calls |
| `mcp-teams-cli` | Microsoft Teams | Messages, channels |
| `mcp-audit-cli` | Audit log | Verify, quarantine, search |

### Discovery

Run `<binary> --help` for any tool to see its command groups, then `<binary> <group> --help` for specific commands.

```bash
mcp-ado-cli --help                # All command groups
mcp-ado-cli work-item --help      # Commands within a group
mcp-sql-cli query --help          # SQL query commands
```

### Authentication

CLI tools load credentials from `.env` or `.mcp.json` files:

```bash
# Option A: .env file
mcp-ado-cli --env-file .env work-item get MyProject 12345

# Option B: .mcp.json server (reads the env block for that server)
mcp-ado-cli --mcp-server my-ado-server work-item get MyProject 12345
```

Look for `.env` or `.mcp.json` files in the project root or client environment folders. Each environment (dev, UAT, prod) typically has its own credentials file.

### Output

All tools print a summary to stdout and cache full JSON to `.context/.mcp-*-cache/`. Use `--json` for raw JSON output. When large responses are expected, prefer CLI over MCP tools — CLI caches to disk and keeps context clean.

### Installation / Update

If any tools are missing or outdated, install individually:
```bash
npm install -g @mcp-consultant-tools/<package-name>@beta
```

Or install all 21 at once:
```bash
curl -sL https://raw.githubusercontent.com/klemensms/mcp-consultant-tools/main/docs/cli-setup/install-cli-tools.sh | bash
```
```
