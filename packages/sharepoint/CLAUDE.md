# SharePoint Package Guide

## Overview

SharePoint Online integration for site, library, file access, and file management.

- **Tools:** 30 tools, all registered whatever the switches (a switched-off tool refuses and names its variable), 10 prompts
- **Authentication:** two modes, chosen by `resolveAuthMode` in `src/auth-mode.ts`: a client secret present means app-only (client credentials); no secret means sign-in mode (device code, acting as the user). `SHAREPOINT_AUTH_MODE=client-credentials|device-code` overrides the inference.
- **Integration:** Validates PowerPlatform document locations

## Environment Configuration

```bash
# Entra ID authentication (can reuse other Azure creds)
SHAREPOINT_TENANT_ID=your-azure-tenant-id
SHAREPOINT_CLIENT_ID=your-azure-app-client-id
SHAREPOINT_CLIENT_SECRET=your-azure-app-client-secret

# Multi-site configuration (JSON array)
SHAREPOINT_SITES=[{"id":"intranet","name":"Company Intranet","siteUrl":"https://tenant.sharepoint.com/sites/intranet","active":true}]

# Single-site fallback
SHAREPOINT_SITE_URL=https://tenant.sharepoint.com/sites/intranet

# Optional settings
SHAREPOINT_CACHE_TTL=300              # 5 minutes
SHAREPOINT_MAX_SEARCH_RESULTS=100
SHAREPOINT_SEARCH_TIMEOUT=30000

# Sign-in mode (no SHAREPOINT_CLIENT_SECRET): sites are optional, any site URL works
SHAREPOINT_AUTH_MODE=                 # optional override: client-credentials | device-code
SHAREPOINT_DOWNLOAD_DIR=              # default ~/Downloads/mcp-sharepoint (spo-download-file saveToDisk)

# Write protection (default: all disabled)
SHAREPOINT_ENABLE_WRITE=false         # Upload, create folder, move, copy, rename
SHAREPOINT_ENABLE_DELETE=false         # Delete (separate, more dangerous)
SHAREPOINT_MAX_DOWNLOAD_SIZE_MB=50     # Download size limit
SHAREPOINT_MAX_UPLOAD_SIZE_MB=100      # Upload size limit
```

## Tool Categories

### Read Tools (16 tools, always available)
- `spo-list-sites` - List configured sites
- `spo-get-site-info` - Site metadata
- `spo-test-connection` - Test connectivity
- `spo-list-drives` - Document libraries in site
- `spo-get-drive-info` - Library details
- `spo-clear-cache` - Clear cached responses
- `spo-list-items` - Files/folders in library
- `spo-get-item` - Item metadata by ID
- `spo-get-item-by-path` - Item metadata by path
- `spo-search-items` - Search files
- `spo-get-recent-items` - Recent changes
- `spo-get-folder-structure` - Recursive folder tree
- `spo-get-crm-doc-locs` - CRM document locations
- `spo-validate-doc-loc` - Validate document location
- `spo-verify-doc-mig` - Verify migration
- `spo-download-file` - Download file content (text as UTF-8, binary as base64)

### Write Tools (5 tools, requires SHAREPOINT_ENABLE_WRITE=true)
- `spo-upload-file` - Upload file to library
- `spo-create-folder` - Create folder
- `spo-move-item` - Move file/folder
- `spo-copy-item` - Copy file/folder
- `spo-rename-item` - Rename file/folder

### Delete Tool (1 tool, requires SHAREPOINT_ENABLE_DELETE=true)
- `spo-delete-item` - Delete file/folder (requires confirm=true)

### Sign-in mode tools (8 tools, device-code mode; app-only refuses or reports no sign-in needed)
- `spo-authenticate`, `spo-auth-status`, `spo-logout` - device-code sign-in through `@mcp-consultant-tools/m365-core`
- `spo-search-files` - full-text Microsoft Search (`POST /search/query`, `driveItem`), returns `{ total, moreResultsAvailable, hits }` so an agent can page with `from`
- `spo-resolve-link` - any SharePoint or OneDrive URL or sharing link to a drive item (`/shares/u!{base64url}/driveItem`)
- `spo-find-sites` - sites by keyword, or one site by URL
- `spo-get-my-drive`, `spo-list-my-drive` - the user's own OneDrive (`/me/drive`, `/me/drive/root/children`, `/me/drive/root:/{path}:/children`)

## Sign-in mode

- Every tool that takes a `siteId` also accepts a full site URL: `/sites/{name}`, `/teams/{name}`, or a OneDrive `/personal/{name}` URL (the `siteUrl` that `spo-get-my-drive` returns). Item tools address `/drives/{driveId}/...`, so they work on OneDrive given its drive id.
- **Permission measured live:** delegated `Sites.ReadWrite.All` alone covers file search (including OneDrive hits), OneDrive and every read, write and delete tool. No `Files.*` permission is needed.
- Token cache: `~/.mcp-consultant-tools/sharepoint-token-cache-{clientId}.enc`, shared by the CLI and the MCP server, salted with the server name (so it is never shared with the Outlook server).
- `spo-download-file` takes `saveToDisk` (writes to `SHAREPOINT_DOWNLOAD_DIR`, returns the path, sanitised name) and `convertToPdf` (`/content?format=pdf`, Word, PowerPoint and Excel only).
- App-only behaviour is unchanged; a regression test pins that a secret builds the confidential client and never constructs the delegated one.

## Gotchas

- **Upload conflict behaviour is a query parameter.** `@microsoft.graph.conflictBehavior` on `PUT .../content` goes in the query string; as a header it is not a legal header name and fetch throws before the request leaves the machine. In a `createUploadSession` or create-folder body it is a body property.
- **The Graph client does not encode `.filter()` / `.search()` values.** Encode free text yourself. This package's query strings are already encoded.
- **Search indexing lags.** A newly uploaded file can take several minutes to appear in `spo-search-files`; an empty result right after an upload is not a permission failure.
- **A retention policy can refuse deleting a non-empty folder** with "Request was cancelled by event received ... it's possible that it's on hold". Delete the files first, then the empty folder.
- **Tests:** `src/__tests__/fake-graph.ts` drops headers and query options, so it cannot see a bad header or a missing query parameter. Tests that care about the wire request use `src/__tests__/graph-recorder.ts`, a real Graph client over a recording transport.

## Not built: recent and shared-with-me

`spo-list-my-recent` and `spo-list-shared-with-me` were specified but not built: Microsoft Learn marks both Graph endpoints (`drive: recent`, `drive: sharedWithMe`) deprecated, operating degraded until November 2026 and returning no data after that. Use `spo-search-files` instead.

## Write Protection

Write tools are **disabled by default** and require explicit feature flags:

- **SHAREPOINT_ENABLE_WRITE=true** - Enables upload, create folder, move, copy, rename
- **SHAREPOINT_ENABLE_DELETE=true** - Enables delete (separate flag for extra safety)
- Delete also requires `confirm: true` parameter as an additional safety mechanism
- In sign-in mode, delegated `Sites.ReadWrite.All` is enough for every write and delete tool (measured live)

## PowerPlatform Integration

SharePoint service validates document locations referenced in Dataverse:
- Verify document library exists
- Check file accessibility
- Validate permissions

## File Structure

```
src/
  index.ts                           # MCP server entry
  cli.ts                             # CLI entry
  auth-mode.ts                       # resolveAuthMode: app-only or device code
  context-factory.ts                 # Shared ServiceContext
  services/
    sharepoint-service.ts            # Auth (both modes), site resolution, sites and drives
    list-service.ts                  # Items, search by name, folder tree, CRM document locations
    file-operations-service.ts       # Download, upload, create folder, move, copy, rename, delete
    discovery-service.ts             # Sign-in mode: file search, links, sites, OneDrive
  tools/
    read-tools.ts                    # 16 read tools
    write-tools.ts                   # 5 write tools + 1 delete tool
    auth-tools.ts                    # 3 sign-in tools
    discovery-tools.ts               # 5 sign-in mode discovery and OneDrive tools
  prompts/                           # 10 prompt registrations
  cli/commands/                      # auth, read, write, discovery
  types/sharepoint-types.ts
  utils/                             # formatters, descWithExamples helper
```

## Reference

See `docs/technical/SHAREPOINT_TECHNICAL.md` for detailed implementation.

## CLI Usage

Binary: `mcp-spo-cli`

```bash
# App-only: list configured sites and a site's libraries
mcp-spo-cli list-sites
mcp-spo-cli list-drives --site-id intranet

# Sign-in mode: sign in once, then search everything you can open
mcp-spo-cli auth login
mcp-spo-cli search-files --query "budget filetype:xlsx"
mcp-spo-cli get-my-drive
mcp-spo-cli download-file --site-id https://contoso.sharepoint.com/sites/example --drive-id <driveId> --item-id <itemId> --convert-to-pdf --save-to-disk
```

The global `--json` flag is listed but currently ignored: the CLI always prints its summary and writes the full JSON to `.context/.mcp-spo-cache/`. Read that file.
