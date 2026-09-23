# SharePoint Online

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/SHAREPOINT_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/sharepoint`

MCP server for SharePoint Online - browse sites, document libraries, files, and folders via Microsoft Graph API. Read-only by default; write and delete require explicit feature flags.

Two ways to sign in: **app-only** (a client secret is configured; the server acts as the app on configured sites) or **sign-in mode** (no secret; you sign in with a device code and the server acts as you, on any site, OneDrive or Teams library you can open).

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both - only the wrapper key and the file differ.

### VS Code - recommended (1Password)

Credentials are resolved at runtime via biometric authentication - no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

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
        "SHAREPOINT_ENABLE_DELETE": "false",
        "SHAREPOINT_AUTH_MODE": "",
        "SHAREPOINT_DOWNLOAD_DIR": ""
      }
    }
  }
}
```

### VS Code - alternative (local credentials)

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
        "SHAREPOINT_ENABLE_DELETE": "false",
        "SHAREPOINT_AUTH_MODE": "",
        "SHAREPOINT_DOWNLOAD_DIR": ""
      }
    }
  }
}
```

### Sign-in mode (device code, no secret)

```json
{
  "servers": {
    "sharepoint": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/sharepoint", "mcp-spo"],
      "env": {
        "SHAREPOINT_TENANT_ID": "your-tenant-id",
        "SHAREPOINT_CLIENT_ID": "your-client-id",
        "SHAREPOINT_CLIENT_SECRET": "",
        "SHAREPOINT_AUTH_MODE": "",
        "SHAREPOINT_SITE_URL": "",
        "SHAREPOINT_SITES": "",
        "SHAREPOINT_DOWNLOAD_DIR": "",
        "SHAREPOINT_MAX_DOWNLOAD_SIZE_MB": "50",
        "SHAREPOINT_MAX_UPLOAD_SIZE_MB": "100",
        "SHAREPOINT_ENABLE_WRITE": "false",
        "SHAREPOINT_ENABLE_DELETE": "false"
      }
    }
  }
}
```

| Variable | Default | Meaning |
|---|---|---|
| `SHAREPOINT_CLIENT_SECRET` | empty | Set: app-only. Empty: sign-in mode. |
| `SHAREPOINT_AUTH_MODE` | inferred | Optional override: `client-credentials` or `device-code`. |
| `SHAREPOINT_SITE_URL` / `SHAREPOINT_SITES` | empty | Required in app-only mode. Optional in sign-in mode, where any site URL works and these only act as named shortcuts. |
| `SHAREPOINT_DOWNLOAD_DIR` | `~/Downloads/mcp-sharepoint` | Where `spo-download-file` saves with `saveToDisk`. |

The sign-in mode app registration needs "Allow public client flows" on, no secret, and delegated Microsoft Graph `User.Read`, `offline_access` and `Sites.ReadWrite.All` with admin consent. `Sites.ReadWrite.All` alone covers file search, OneDrive and every tool below; no `Files.*` permission is needed.

**Site options:** set a single `SHAREPOINT_SITE_URL`, or supply `SHAREPOINT_SITES` - a JSON array of `{id, name, siteUrl, active}` objects - for multiple sites. Provide one or the other.

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "sharepoint": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Sign-in mode tools

| Tool | Description |
|------|-------------|
| `spo-authenticate` | Start sign-in: returns a URL and a one-time code (the CLI's `auth login` waits for it) |
| `spo-auth-status` | Sign-in state and granted permissions; in app-only mode reports that no sign-in is needed |
| `spo-logout` | Sign out and delete the cached sign-in |
| `spo-search-files` | Full-text Microsoft Search across every site, OneDrive and Teams file you can open (KQL supported) |
| `spo-resolve-link` | Turn any SharePoint or OneDrive URL, including a sharing link, into a drive and item id |
| `spo-find-sites` | Find sites by keyword, or resolve one from its URL |
| `spo-get-my-drive` | Your own OneDrive: drive id, web URL, quota, and the site URL to pass as `siteId` |
| `spo-list-my-drive` | List your OneDrive root or a folder by path |

In sign-in mode every existing tool that takes a `siteId` also accepts a full site URL, including your OneDrive's `siteUrl` from `spo-get-my-drive`.

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
- **`spo-search-items` is filename/metadata only.** For full-text search across Word, PowerPoint, Excel, PDF and text files, use `spo-search-files` in sign-in mode. A newly uploaded file can take several minutes to appear in its results.
- **`spo-download-file` can save to disk and convert to PDF.** `saveToDisk` writes to `SHAREPOINT_DOWNLOAD_DIR` and returns the path instead of the content; `convertToPdf` returns a PDF rendering of a Word, PowerPoint or Excel file, so an agent can read it without an Office parser.
- **A non-empty folder may refuse to delete.** Where a retention policy applies, deleting a folder that still holds files fails with "Request was cancelled by event received ... it's possible that it's on hold". Delete the files first, then the empty folder.
- **Sign-in is cached encrypted on your machine** at `~/.mcp-consultant-tools/sharepoint-token-cache-{clientId}.enc` and renews silently; the CLI and the MCP server share it.
- **PowerPlatform integration requires the meta package.** `spo-get-crm-doc-locs`, `spo-validate-doc-loc`, and `spo-verify-doc-mig` require PowerPlatform credentials and only work when running inside `mcp-consultant-tools` (meta package), not the standalone `mcp-spo` server.

## Coming later (not yet active)

These tuning variables are documented in older config examples but **not yet wired up** - the server never reads them from the environment, so setting them currently has no effect and fixed built-in values are used. They are documented here so the intended configuration surface isn't lost:

| Variable | Purpose (planned) |
|----------|-------------------|
| `SHAREPOINT_MAX_SEARCH_RESULTS` | Max results returned by a search request |
| `SHAREPOINT_CACHE_TTL` | Cache lifetime (seconds) |
