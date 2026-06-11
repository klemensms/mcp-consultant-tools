# SharePoint Online

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/SHAREPOINT_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/sharepoint`

MCP server for SharePoint Online — browse sites, document libraries, files, and folders via Microsoft Graph API. Read-only by default; write and delete require explicit feature flags.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "sharepoint": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/sharepoint@beta", "mcp-spo"],
      "env": {
        "SHAREPOINT_TENANT_ID": "op://Work/SharePoint-App-Registration/tenantid",
        "SHAREPOINT_CLIENT_ID": "op://Work/SharePoint-App-Registration/username",
        "SHAREPOINT_CLIENT_SECRET": "op://Work/SharePoint-App-Registration/password",
        "SHAREPOINT_SITE_URL": "https://yourtenant.sharepoint.com/sites/yoursite",
        "SHAREPOINT_SITES": "",
        "SHAREPOINT_MAX_DOWNLOAD_SIZE_MB": "50",
        "SHAREPOINT_MAX_UPLOAD_SIZE_MB": "100",
        "SHAREPOINT_ENABLE_WRITE": "false",
        "SHAREPOINT_ENABLE_DELETE": "false"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "sharepoint": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/sharepoint", "mcp-spo"],
      "env": {
        "SHAREPOINT_TENANT_ID": "your-tenant-id",
        "SHAREPOINT_CLIENT_ID": "your-client-id",
        "SHAREPOINT_CLIENT_SECRET": "your-client-secret",
        "SHAREPOINT_SITE_URL": "https://yourtenant.sharepoint.com/sites/yoursite",
        "SHAREPOINT_SITES": "[{\"id\":\"intranet\",\"name\":\"Intranet\",\"siteUrl\":\"https://tenant.sharepoint.com/sites/intranet\",\"active\":true}]",
        "SHAREPOINT_MAX_DOWNLOAD_SIZE_MB": "50",
        "SHAREPOINT_MAX_UPLOAD_SIZE_MB": "100",
        "SHAREPOINT_ENABLE_WRITE": "false",
        "SHAREPOINT_ENABLE_DELETE": "false"
      }
    }
  }
}
```

**Site options:** set a single `SHAREPOINT_SITE_URL`, or supply `SHAREPOINT_SITES` — a JSON array of `{id, name, siteUrl, active}` objects — for multiple sites. Provide one or the other.

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "sharepoint": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `spo-site-overview` | Site metadata and list of document libraries formatted as markdown |
| `spo-library-details` | Library details plus recent activity for the last 30 days |
| `spo-document-search` | Search results formatted as markdown |
| `spo-recent-activity` | Recent file changes in a library for a configurable number of days |
| `spo-validate-crm-integration` | Validation report for a PowerPlatform document location |
| `spo-document-location-audit` | Audit of all CRM document locations with insights and recommendations |
| `spo-migration-verification-report` | Migration verification report comparing source and target folders |
| `spo-setup-validation-guide` | Step-by-step guide for validating the initial setup |
| `spo-troubleshooting-guide` | Error-specific troubleshooting guide (optionally filtered by error type) |
| `spo-powerplatform-integration-health` | Health check for the PowerPlatform-SharePoint integration |

## Notable Behavior

- **Feature flags gate write and delete separately.** `SHAREPOINT_ENABLE_WRITE=true` enables upload, create-folder, move, copy, and rename. `SHAREPOINT_ENABLE_DELETE=true` enables delete independently. Delete also requires `confirm: true` at call time.
- **Download encoding is automatic.** Text MIME types (JSON, CSV, XML, plain text, etc.) are returned as UTF-8 strings. Binary files (DOCX, PDF, XLSX, etc.) are returned as base64.
- **Search is filename/metadata only.** `spo-search-items` does not perform full-text content search.
- **PowerPlatform integration requires the meta package.** `spo-get-crm-doc-locs`, `spo-validate-doc-loc`, and `spo-verify-doc-mig` require PowerPlatform credentials and only work when running inside `mcp-consultant-tools` (meta package), not the standalone `mcp-spo` server.

## Coming later (not yet active)

These tuning variables are documented in older config examples but **not yet wired up** — the server never reads them from the environment, so setting them currently has no effect and fixed built-in values are used. They are documented here so the intended configuration surface isn't lost:

| Variable | Purpose (planned) |
|----------|-------------------|
| `SHAREPOINT_MAX_SEARCH_RESULTS` | Max results returned by a search request |
| `SHAREPOINT_CACHE_TTL` | Cache lifetime (seconds) |
