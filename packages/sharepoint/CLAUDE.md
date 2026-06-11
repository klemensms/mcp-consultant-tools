# SharePoint Package Guide

## Overview

SharePoint Online integration for site, library, file access, and file management.

- **Tools:** 16-22 tools (depends on feature flags), 10 prompts
- **Authentication:** Entra ID via Microsoft Graph API
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

## Write Protection

Write tools are **disabled by default** and require explicit feature flags:

- **SHAREPOINT_ENABLE_WRITE=true** - Enables upload, create folder, move, copy, rename
- **SHAREPOINT_ENABLE_DELETE=true** - Enables delete (separate flag for extra safety)
- Delete also requires `confirm: true` parameter as an additional safety mechanism
- App registration needs `Files.ReadWrite.All` permission for write operations

## PowerPlatform Integration

SharePoint service validates document locations referenced in Dataverse:
- Verify document library exists
- Check file accessibility
- Validate permissions

## File Structure

```
src/
  index.ts                           # Slim orchestrator (~130 lines)
  SharePointService.ts               # Core service
  services/
    FileOperationsService.ts         # File management operations
  tools/
    prompts.ts                       # 10 prompt registrations
    read-tools.ts                    # 16 read tools
    write-tools.ts                   # 6 write tools
  types/
    sharepoint-types.ts              # All type definitions
  utils/
    sharepoint-formatters.ts         # Markdown formatters
    tool-examples.ts                 # descWithExamples helper
```

## Reference

See `docs/technical/SHAREPOINT_TECHNICAL.md` for detailed implementation.

## CLI Usage

Binary: `mcp-spo-cli`

```bash
# List sites
mcp-spo-cli read list-sites

# List document libraries
mcp-spo-cli read list-drives intranet

# Search files
mcp-spo-cli read search intranet "report 2024"
```
