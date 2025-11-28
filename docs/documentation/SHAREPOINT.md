# SharePoint Online Integration Documentation

**📦 Package:** `@mcp-consultant-tools/sharepoint`
**🔒 Security:** Production-safe (read-only access to SharePoint sites and documents)

Complete guide to using the SharePoint Online integration with MCP Consultant Tools.

---

## ⚡ Quick Start

### MCP Client Configuration

Get started quickly with this minimal configuration. Just replace the placeholder values with your actual credentials:

#### For VS Code

Add this to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "sharepoint": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/sharepoint", "mcp-spo"],
      "env": {
        // Required - Authentication (all required)
        "SHAREPOINT_TENANT_ID": "your-tenant-id",
        "SHAREPOINT_CLIENT_ID": "your-client-id",
        "SHAREPOINT_CLIENT_SECRET": "your-client-secret",

        // Required - Site configuration (choose ONE option)
        // Option 1: Single site
        "SHAREPOINT_SITE_URL": "https://yourtenant.sharepoint.com/sites/yoursite"
        // Option 2: Multiple sites (JSON array)
        // "SHAREPOINT_SITES": "[{\"id\":\"main\",\"siteUrl\":\"https://tenant.sharepoint.com/sites/main\",\"name\":\"Main Site\"}]"
      }
    }
  }
}
```

#### For Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sharepoint": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/sharepoint", "mcp-spo"],
      "env": {
        // Required - Authentication (all required)
        "SHAREPOINT_TENANT_ID": "your-tenant-id",
        "SHAREPOINT_CLIENT_ID": "your-client-id",
        "SHAREPOINT_CLIENT_SECRET": "your-client-secret",

        // Required - Site configuration (choose ONE option)
        // Option 1: Single site
        "SHAREPOINT_SITE_URL": "https://yourtenant.sharepoint.com/sites/yoursite"
        // Option 2: Multiple sites (JSON array)
        // "SHAREPOINT_SITES": "[{\"id\":\"main\",\"siteUrl\":\"https://tenant.sharepoint.com/sites/main\",\"name\":\"Main Site\"}]"
      }
    }
  }
}
```

#### Test Your Setup

After configuring, test the connection by listing available sites:

```javascript
// Ask Claude: "List all SharePoint sites"
// Or use the site-structure prompt:
await mcpClient.invoke("sharepoint-site-structure", {
  siteId: "main-site"
});
```

**Need credentials?** See the [Detailed Setup](#detailed-setup) section below for Azure AD app registration and SharePoint permissions instructions.

---

## 🎯 Key Features for Consultants

### Automated Workflows (Prompts)

This package includes **10 pre-built prompts** that generate formatted, human-readable reports from SharePoint sites and documents. These prompts are designed for consultants who need quick insights without writing code.

#### Site & Document Analysis Prompts

1. 🔥 **`sharepoint-site-structure`** - **MOST VALUABLE** - Shows complete site structure with libraries, lists, and permissions. Essential for site validation and migration planning.
   - Example: `"Show me the structure of the main SharePoint site"`
   - Includes: Site metadata, all document libraries with quotas, folder structure, permissions overview
   - **Use Case:** Site auditing, migration validation, document location verification

2. **`spo-site-overview`** - Comprehensive site overview with drives, recent activity, and statistics
   - Example: `"Give me an overview of the main site"`
   - Includes: Site information, document libraries, recent file activity, storage statistics

3. **`spo-library-details`** - Detailed library report with quota, permissions, and recent items
   - Example: `"Show me details about the Documents library"`
   - Includes: Library metadata, quota usage with warnings, recent documents, folder structure

4. **`spo-document-search`** - Formatted search results with relevance and filtering
   - Example: `"Search for project proposal documents"`
   - Includes: Search results, file metadata, relevance scores, quick access links

5. **`spo-recent-activity`** - Recent document activity report with user attribution
   - Example: `"What files were modified in the last 7 days?"`
   - Includes: Timeline of modifications, user activity summary, file type breakdown

#### PowerPlatform Integration Prompts

6. **`spo-validate-crm-integration`** - PowerPlatform document location validation report
   - Example: `"Validate the document location configuration for this account"`
   - Includes: CRM configuration, SharePoint validation, issues found, remediation steps

7. **`spo-document-location-audit`** - Comprehensive audit of all document locations for an entity/record
   - Example: `"Audit all document locations for the account entity"`
   - Includes: Location list, validation status, health summary, recommendations

8. **`spo-migration-verification-report`** - Detailed migration verification with file-by-file comparison
   - Example: `"Verify the migration from old location to new location"`
   - Includes: Migration summary, missing files, size mismatches, recommendations

#### Troubleshooting Prompts

9. **`spo-setup-validation-guide`** - Interactive setup validation checklist and troubleshooting
   - Example: `"Validate my SharePoint setup"`
   - Includes: Configuration checklist, permission verification, connectivity tests

10. **`spo-troubleshooting-guide`** - Common SharePoint integration issues and solutions
    - Example: `"Help me troubleshoot SharePoint connection issues"`
    - Includes: Common errors, root cause analysis, step-by-step solutions

11. **`spo-powerplatform-integration-health`** - Overall health check for PowerPlatform-SharePoint integration
    - Example: `"Check the health of PowerPlatform SharePoint integration"`
    - Includes: Document locations health, misconfiguration detection, recommendations

**Why site-structure is most valuable:**
- Shows complete site topology in one view (libraries, folders, permissions)
- Essential for validating PowerPlatform document location configurations
- Critical for migration planning and verification
- Reveals empty folders and misconfigured paths
- Provides quota usage and capacity planning insights

### Document & Library Tools

Beyond prompts, this package provides **15 specialized tools** for accessing SharePoint data:

**Site Management:**
- **`spo-list-sites`** - List all configured SharePoint sites
- **`spo-test-connection`** - Test connectivity and return site information

**Document Libraries (Drives):**
- **`spo-list-drives`** - List all document libraries in a site
- **`spo-get-drive-info`** - Get detailed library information with quota

**Files & Folders:**
- **`spo-list-items`** - List files and folders in a library or folder
- **`spo-get-item`** - Get detailed file or folder information
- **`spo-get-item-by-path`** - Get item by path instead of ID
- **`spo-get-folder-tree`** - Get recursive folder structure (tree view)
- **`spo-search-items`** - Search for files and folders
- **`spo-get-recent-items`** - Get recently modified files

**PowerPlatform Validation:**
- **`spo-get-crm-document-locations`** - Get SharePoint document locations from Dataverse
- **`spo-validate-document-location`** - Validate PowerPlatform document location configuration
- **`spo-verify-document-migration`** - Verify document migration between locations

---

## Table of Contents

1. [Overview](#overview)
   - [What is SharePoint Online?](#what-is-sharepoint-online)
   - [Key Features](#key-features)
2. [Detailed Setup](#detailed-setup)
   - [Prerequisites](#prerequisites)
   - [Authentication: Entra ID via Microsoft Graph API](#authentication-entra-id-via-microsoft-graph-api)
   - [Environment Configuration](#environment-configuration)
   - [Claude Desktop Configuration](#claude-desktop-configuration)
   - [Local Development/Testing Configuration](#local-developmenttesting-configuration)
   - [VS Code (Claude Code) Configuration](#vs-code-claude-code-configuration)
3. [Tools](#tools)
   - [Site Management Tools](#site-management-tools)
   - [Drive (Document Library) Tools](#drive-document-library-tools)
   - [File and Folder Tools](#file-and-folder-tools)
   - [PowerPlatform Validation Tools](#powerplatform-validation-tools)
4. [Prompts](#prompts)
5. [Usage Examples](#usage-examples)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### What is SharePoint Online?

SharePoint Online is Microsoft's cloud-based collaboration and document management platform:
- **Document management** with version control and metadata
- **Team collaboration** with sites, libraries, and lists
- **Enterprise content management** with compliance and governance
- **Integration with Microsoft 365** (Teams, OneDrive, Power Platform)
- **Microsoft Graph API** for programmatic access

**Primary Use Case**: Access SharePoint sites and documents; validate PowerPlatform document location configurations; verify document migrations.

### Key Features

**Document Access:**
- ✅ List sites with metadata (creation date, owner, description)
- ✅ List document libraries (drives) with quota information
- ✅ Browse files and folders recursively
- ✅ Get file metadata (size, modified date, creator)
- ✅ Search documents across sites
- ✅ Get file download URLs

**PowerPlatform Integration:**
- ✅ Validate document location configurations from Dataverse
- ✅ Verify folders exist at configured paths
- ✅ Detect empty or misconfigured folders
- ✅ Compare source/target folders for migrations
- ✅ Calculate migration success rates

**Performance & Security:**
- 🔒 Token-based authentication via Microsoft Graph API
- 🔒 Automatic token refresh (5-minute buffer)
- 🔒 Response caching with configurable TTL (5-minute default)
- 🔒 Site ID caching for fast lookups
- 🔒 Audit logging of all operations

---

## Detailed Setup

### Prerequisites

1. **SharePoint Online tenant** (Microsoft 365 subscription)
2. **SharePoint sites** with document libraries
3. **Azure AD app registration** for authentication
4. **Permissions** on SharePoint sites for the service principal

### Authentication: Entra ID via Microsoft Graph API

SharePoint Online **requires Entra ID authentication** via Microsoft Graph API. There is no alternative authentication method.

#### Step 1: Create Azure AD App Registration

1. Go to Azure Portal → **Azure Active Directory** → **App registrations**
2. Click **New registration**
3. **Name**: `MCP-SharePoint-Reader`
4. **Supported account types**: Single tenant
5. Click **Register**
6. Note the **Application (client) ID** and **Directory (tenant) ID**

#### Step 2: Create Client Secret

1. In the app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. **Description**: `MCP SharePoint Access`
4. **Expires**: Choose appropriate expiration (12 months recommended)
5. Click **Add**
6. **Copy the secret value immediately** (it won't be shown again)

#### Step 3: Grant API Permissions

1. Go to **API permissions**
2. Click **Add a permission** → **Microsoft Graph** → **Application permissions**
3. Add these permissions:
   - `Sites.Read.All` - Read items in all site collections
4. Click **Grant admin consent** (requires Global Administrator or Privileged Role Administrator)
5. Verify status shows "Granted for [your tenant]"

#### Step 4: Grant SharePoint Site Access

The app registration needs explicit access to SharePoint sites:

**Option A: Grant access to all sites (recommended for testing)**
```powershell
# Install PnP PowerShell module
Install-Module -Name PnP.PowerShell -Force

# Connect to SharePoint admin center
Connect-PnPOnline -Url "https://yourtenant-admin.sharepoint.com" -Interactive

# Grant app full control to all sites
Grant-PnPAzureADAppSitePermission -AppId "your-app-client-id" -DisplayName "MCP SharePoint Reader" -Site "https://yourtenant.sharepoint.com" -Permissions FullControl
```

**Option B: Grant access to specific sites (recommended for production)**
```powershell
# Connect to specific site
Connect-PnPOnline -Url "https://yourtenant.sharepoint.com/sites/yoursite" -Interactive

# Add service principal to site members
Set-PnPWebPermission -User "your-app-client-id" -AddRole "Read"
```

### Environment Configuration

#### Multi-Site Configuration (Recommended)

Configure multiple SharePoint sites with active/inactive flags:

```json
SHAREPOINT_TENANT_ID=your-tenant-id
SHAREPOINT_CLIENT_ID=your-client-id
SHAREPOINT_CLIENT_SECRET=your-client-secret
SHAREPOINT_SITES=[
  {
    "id": "main-site",
    "name": "Main SharePoint Site",
    "siteUrl": "https://yourtenant.sharepoint.com/sites/main",
    "active": true,
    "description": "Primary collaboration site",
    "defaultDriveId": "optional-default-library-id"
  },
  {
    "id": "project-site",
    "name": "Project Documents",
    "siteUrl": "https://yourtenant.sharepoint.com/sites/projects",
    "active": true,
    "description": "Project documentation site"
  },
  {
    "id": "archive-site",
    "name": "Archive Site",
    "siteUrl": "https://yourtenant.sharepoint.com/sites/archive",
    "active": false,
    "description": "Historical documents (inactive)"
  }
]
```

#### Optional Configuration

```bash
# Cache configuration
SHAREPOINT_CACHE_TTL=300              # Cache TTL in seconds (default: 300 = 5 minutes)

# Search configuration
SHAREPOINT_MAX_SEARCH_RESULTS=100    # Max search results (default: 100)
```

### Claude Desktop Configuration

Add SharePoint configuration to your Claude Desktop config:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sharepoint": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/sharepoint", "mcp-spo"],
      "env": {
        "SHAREPOINT_TENANT_ID": "your-tenant-id",
        "SHAREPOINT_CLIENT_ID": "your-client-id",
        "SHAREPOINT_CLIENT_SECRET": "your-client-secret",
        "SHAREPOINT_SITES": "[{\"id\":\"main\",\"name\":\"Main Site\",\"siteUrl\":\"https://yourtenant.sharepoint.com/sites/main\",\"active\":true}]"
      }
    }
  }
}
```

### Local Development/Testing Configuration

For local testing with your development build:

```json
{
  "mcpServers": {
    "sharepoint-local": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-consultant-tools/packages/sharepoint/build/index.js"],
      "env": {
        "SHAREPOINT_TENANT_ID": "your-tenant-id",
        "SHAREPOINT_CLIENT_ID": "your-client-id",
        "SHAREPOINT_CLIENT_SECRET": "your-client-secret",
        "SHAREPOINT_SITES": "[{\"id\":\"main\",\"name\":\"Main Site\",\"siteUrl\":\"https://yourtenant.sharepoint.com/sites/main\",\"active\":true}]"
      }
    }
  }
}
```

**Note:** Replace `/absolute/path/to/mcp-consultant-tools` with your actual repository path.

### VS Code (Claude Code) Configuration

Add to `.vscode/settings.json` or workspace settings:

```json
{
  "mcp.servers": {
    "sharepoint": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/sharepoint", "mcp-spo"],
      "env": {
        "SHAREPOINT_TENANT_ID": "your-tenant-id",
        "SHAREPOINT_CLIENT_ID": "your-client-id",
        "SHAREPOINT_CLIENT_SECRET": "your-client-secret",
        "SHAREPOINT_SITES": "[{\"id\":\"main\",\"name\":\"Main Site\",\"siteUrl\":\"https://yourtenant.sharepoint.com/sites/main\",\"active\":true}]"
      }
    }
  }
}
```

---

## Tools

The SharePoint integration provides **15 tools** for accessing sites, libraries, files, and PowerPlatform validation.

### Site Management Tools

#### `spo-list-sites`
List all configured SharePoint sites with status.

**Parameters:**
- None

**Returns:**
```json
{
  "sites": [
    {
      "id": "main-site",
      "name": "Main SharePoint Site",
      "siteUrl": "https://yourtenant.sharepoint.com/sites/main",
      "active": true,
      "description": "Primary collaboration site"
    }
  ]
}
```

**Example:**
```javascript
await mcpClient.invoke("spo-list-sites");
```

---

#### `spo-test-connection`
Test connectivity to a SharePoint site and return site information.

**Parameters:**
- `siteId` (string, required): Site ID from configuration (e.g., "main-site")

**Returns:**
```json
{
  "success": true,
  "siteInfo": {
    "id": "contoso.sharepoint.com,12345678-...,abcdef01-...",
    "webUrl": "https://contoso.sharepoint.com/sites/main",
    "displayName": "Main Site",
    "description": "Primary collaboration site",
    "createdDateTime": "2024-01-01T00:00:00Z",
    "lastModifiedDateTime": "2024-11-10T00:00:00Z"
  },
  "timestamp": "2024-11-10T12:00:00Z"
}
```

**Example:**
```javascript
await mcpClient.invoke("spo-test-connection", {
  siteId: "main-site"
});
```

---

### Drive (Document Library) Tools

#### `spo-list-drives`
List all document libraries (drives) in a SharePoint site.

**Parameters:**
- `siteId` (string, required): Site ID from configuration

**Returns:**
```json
{
  "drives": [
    {
      "id": "b!Abc123...",
      "name": "Documents",
      "description": "Default document library",
      "webUrl": "https://contoso.sharepoint.com/sites/main/Shared Documents",
      "driveType": "documentLibrary",
      "createdDateTime": "2024-01-01T00:00:00Z",
      "quota": {
        "total": 1099511627776,
        "used": 524288000,
        "remaining": 1098987339776,
        "state": "normal"
      }
    }
  ]
}
```

**Example:**
```javascript
await mcpClient.invoke("spo-list-drives", {
  siteId: "main-site"
});
```

---

#### `spo-get-drive-info`
Get detailed information about a specific document library.

**Parameters:**
- `siteId` (string, required): Site ID from configuration
- `driveId` (string, required): Drive (library) ID

**Returns:**
```json
{
  "id": "b!Abc123...",
  "name": "Documents",
  "webUrl": "https://contoso.sharepoint.com/sites/main/Shared Documents",
  "quota": {
    "total": 1099511627776,
    "used": 524288000,
    "remaining": 1098987339776,
    "state": "normal"
  },
  "owner": {
    "user": {
      "displayName": "Site Owner",
      "email": "owner@contoso.com"
    }
  }
}
```

**Example:**
```javascript
await mcpClient.invoke("spo-get-drive-info", {
  siteId: "main-site",
  driveId: "b!Abc123..."
});
```

---

### File and Folder Tools

#### `spo-list-items`
List files and folders in a document library or folder.

**Parameters:**
- `siteId` (string, required): Site ID from configuration
- `driveId` (string, required): Drive (library) ID
- `itemId` (string, optional): Folder item ID (omit for library root)

**Returns:**
```json
{
  "items": [
    {
      "id": "01ABC...",
      "name": "Proposal.docx",
      "webUrl": "https://contoso.sharepoint.com/sites/main/Shared Documents/Proposal.docx",
      "size": 45678,
      "createdDateTime": "2024-11-01T10:00:00Z",
      "lastModifiedDateTime": "2024-11-05T14:30:00Z",
      "file": {
        "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }
    },
    {
      "id": "01DEF...",
      "name": "Archive",
      "webUrl": "https://contoso.sharepoint.com/sites/main/Shared Documents/Archive",
      "createdDateTime": "2024-10-01T09:00:00Z",
      "folder": {
        "childCount": 15
      }
    }
  ]
}
```

**Example:**
```javascript
// List library root
await mcpClient.invoke("spo-list-items", {
  siteId: "main-site",
  driveId: "b!Abc123..."
});

// List specific folder
await mcpClient.invoke("spo-list-items", {
  siteId: "main-site",
  driveId: "b!Abc123...",
  itemId: "01DEF..."
});
```

---

#### `spo-get-item`
Get detailed information about a specific file or folder.

**Parameters:**
- `siteId` (string, required): Site ID from configuration
- `driveId` (string, required): Drive (library) ID
- `itemId` (string, required): File or folder item ID

**Returns:**
```json
{
  "id": "01ABC...",
  "name": "Proposal.docx",
  "webUrl": "https://contoso.sharepoint.com/sites/main/Shared Documents/Proposal.docx",
  "size": 45678,
  "createdDateTime": "2024-11-01T10:00:00Z",
  "lastModifiedDateTime": "2024-11-05T14:30:00Z",
  "createdBy": {
    "user": {
      "displayName": "John Doe",
      "email": "john@contoso.com"
    }
  },
  "lastModifiedBy": {
    "user": {
      "displayName": "Jane Smith",
      "email": "jane@contoso.com"
    }
  },
  "file": {
    "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "hashes": {
      "sha256Hash": "abc123..."
    }
  }
}
```

**Example:**
```javascript
await mcpClient.invoke("spo-get-item", {
  siteId: "main-site",
  driveId: "b!Abc123...",
  itemId: "01ABC..."
});
```

---

#### `spo-get-item-by-path`
Get a file or folder by its path instead of ID.

**Parameters:**
- `siteId` (string, required): Site ID from configuration
- `driveId` (string, required): Drive (library) ID
- `path` (string, required): Path to file/folder (e.g., "/Folder/Subfolder/File.docx")

**Returns:** Same as `spo-get-item`

**Example:**
```javascript
await mcpClient.invoke("spo-get-item-by-path", {
  siteId: "main-site",
  driveId: "b!Abc123...",
  path: "/Archive/2024/Proposal.docx"
});
```

---

#### `spo-get-folder-tree`
Get recursive folder structure (tree view) with all nested files and folders.

**Parameters:**
- `siteId` (string, required): Site ID from configuration
- `driveId` (string, required): Drive (library) ID
- `itemId` (string, optional): Starting folder ID (omit for library root)
- `maxDepth` (number, optional): Maximum recursion depth (default: 10)

**Returns:**
```json
{
  "item": {
    "id": "01ROOT...",
    "name": "Documents",
    "folder": { "childCount": 3 }
  },
  "children": [
    {
      "item": {
        "id": "01ABC...",
        "name": "File1.docx",
        "file": { "mimeType": "application/..." }
      }
    },
    {
      "item": {
        "id": "01DEF...",
        "name": "Subfolder",
        "folder": { "childCount": 2 }
      },
      "children": [
        {
          "item": {
            "id": "01GHI...",
            "name": "File2.xlsx",
            "file": { "mimeType": "application/..." }
          }
        }
      ]
    }
  ]
}
```

**Example:**
```javascript
await mcpClient.invoke("spo-get-folder-tree", {
  siteId: "main-site",
  driveId: "b!Abc123...",
  maxDepth: 5
});
```

---

#### `spo-search-items`
Search for files and folders across a SharePoint site.

**Parameters:**
- `siteId` (string, required): Site ID from configuration
- `query` (string, required): Search query text
- `driveId` (string, optional): Limit search to specific library

**Returns:**
```json
{
  "items": [
    {
      "id": "01ABC...",
      "name": "Proposal.docx",
      "webUrl": "https://contoso.sharepoint.com/sites/main/Shared Documents/Proposal.docx",
      "size": 45678,
      "file": { "mimeType": "application/..." }
    }
  ],
  "totalCount": 1
}
```

**Example:**
```javascript
// Search entire site
await mcpClient.invoke("spo-search-items", {
  siteId: "main-site",
  query: "project proposal"
});

// Search specific library
await mcpClient.invoke("spo-search-items", {
  siteId: "main-site",
  query: "budget",
  driveId: "b!Abc123..."
});
```

---

#### `spo-get-recent-items`
Get recently modified files from a document library.

**Parameters:**
- `siteId` (string, required): Site ID from configuration
- `driveId` (string, required): Drive (library) ID
- `days` (number, optional): Number of days to look back (default: 7)

**Returns:**
```json
{
  "items": [
    {
      "id": "01ABC...",
      "name": "Proposal.docx",
      "lastModifiedDateTime": "2024-11-09T14:30:00Z",
      "size": 45678,
      "lastModifiedBy": {
        "user": {
          "displayName": "Jane Smith",
          "email": "jane@contoso.com"
        }
      }
    }
  ]
}
```

**Example:**
```javascript
// Last 7 days (default)
await mcpClient.invoke("spo-get-recent-items", {
  siteId: "main-site",
  driveId: "b!Abc123..."
});

// Last 30 days
await mcpClient.invoke("spo-get-recent-items", {
  siteId: "main-site",
  driveId: "b!Abc123...",
  days: 30
});
```

---

### PowerPlatform Validation Tools

#### `spo-get-crm-document-locations`
Get SharePoint document locations configured in PowerPlatform Dataverse.

**Parameters:**
- `entityName` (string, optional): Filter by entity logical name (e.g., "account", "contact")
- `recordId` (string, optional): Filter by specific record ID

**Returns:**
```json
{
  "locations": [
    {
      "sharepointdocumentlocationid": "12345678-...",
      "name": "Account Documents",
      "absoluteurl": "https://contoso.sharepoint.com/sites/main/Documents/account_abc",
      "relativeurl": "account_abc",
      "regardingobjectid": {
        "id": "abcdef01-...",
        "logicalName": "account"
      },
      "statecode": 0,
      "statuscode": 1
    }
  ]
}
```

**Example:**
```javascript
// All document locations
await mcpClient.invoke("spo-get-crm-document-locations");

// For specific entity
await mcpClient.invoke("spo-get-crm-document-locations", {
  entityName: "account"
});

// For specific record
await mcpClient.invoke("spo-get-crm-document-locations", {
  entityName: "account",
  recordId: "abcdef01-1234-5678-9abc-def012345678"
});
```

---

#### `spo-validate-document-location`
Validate that a PowerPlatform document location configuration matches actual SharePoint structure.

**Parameters:**
- `documentLocationId` (string, required): GUID of sharepointdocumentlocation record

**Returns:**
```json
{
  "documentLocationId": "12345678-...",
  "documentLocationName": "Account Documents",
  "crmConfig": {
    "absoluteUrl": "https://contoso.sharepoint.com/sites/main/Documents/account_abc",
    "relativeUrl": "account_abc",
    "regardingEntity": "account",
    "regardingRecordId": "abcdef01-...",
    "isActive": true
  },
  "spoValidation": {
    "siteExists": true,
    "folderExists": true,
    "folderAccessible": true,
    "fileCount": 12,
    "isEmpty": false
  },
  "status": "valid",
  "issues": [],
  "recommendations": []
}
```

**Possible Status Values:**
- `valid` - Configuration is correct and folder is accessible
- `warning` - Configuration is correct but folder is empty or has minor issues
- `error` - Configuration is incorrect or folder is inaccessible

**Example:**
```javascript
await mcpClient.invoke("spo-validate-document-location", {
  documentLocationId: "12345678-abcd-1234-5678-abcdef012345"
});
```

---

#### `spo-verify-document-migration`
Verify that documents migrated successfully between two SharePoint locations.

**Parameters:**
- `sourceSiteId` (string, required): Source site ID
- `sourcePath` (string, required): Source folder path (e.g., "/Documents/Archive")
- `targetSiteId` (string, required): Target site ID
- `targetPath` (string, required): Target folder path (e.g., "/Documents/Migrated")

**Returns:**
```json
{
  "source": {
    "path": "/Documents/Archive",
    "fileCount": 150,
    "totalSize": 524288000,
    "files": [...]
  },
  "target": {
    "path": "/Documents/Migrated",
    "fileCount": 148,
    "totalSize": 520192000,
    "files": [...]
  },
  "comparison": {
    "missingFiles": ["report_old.pdf", "data_2022.xlsx"],
    "extraFiles": [],
    "sizeMismatches": [
      { "name": "archive.zip", "sourceSize": 1048576, "targetSize": 1048500 }
    ],
    "modifiedDateMismatches": []
  },
  "successRate": 98.67,
  "status": "incomplete"
}
```

**Status Values:**
- `complete` - All files migrated successfully
- `incomplete` - Some files missing or size mismatches (50-99% success)
- `failed` - Migration failed (<50% success)

**Example:**
```javascript
await mcpClient.invoke("spo-verify-document-migration", {
  sourceSiteId: "main-site",
  sourcePath: "/Documents/Archive/2023",
  targetSiteId: "archive-site",
  targetPath: "/Documents/2023"
});
```

---

## Prompts

The SharePoint integration provides **10 prompts** for formatted, context-rich reports.

### `spo-site-overview`
Comprehensive site overview with drives, recent activity, and statistics.

**Parameters:**
- `siteId` (string, required): Site ID from configuration

**Output:**
- Site information (name, URL, creation date)
- Document libraries with quota usage
- Recent file activity
- Storage statistics

---

### `spo-library-details`
Detailed library report with quota, permissions, and recent items.

**Parameters:**
- `siteId` (string, required): Site ID
- `driveId` (string, required): Drive (library) ID

**Output:**
- Library metadata
- Quota usage with warnings
- Recent document activity (last 7 days)
- Top-level folder structure

---

### `spo-document-search`
Formatted search results with relevance and filtering.

**Parameters:**
- `siteId` (string, required): Site ID
- `query` (string, required): Search query
- `driveId` (string, optional): Limit to specific library

**Output:**
- Search results with highlighting
- File metadata (size, type, modified date)
- Relevance scores
- Quick access links

---

### `spo-recent-activity`
Recent document activity report with user attribution.

**Parameters:**
- `siteId` (string, required): Site ID
- `driveId` (string, required): Drive (library) ID
- `days` (string, optional): Number of days (default: "7")

**Output:**
- Timeline of recent modifications
- User activity summary
- File type breakdown
- Activity trends

---

### `spo-validate-crm-integration`
PowerPlatform document location validation report.

**Parameters:**
- `documentLocationId` (string, required): Document location ID from Dataverse

**Output:**
- CRM configuration details
- SharePoint validation results
- Issues found (if any)
- Recommendations for fixes
- Step-by-step remediation guide

---

### `spo-document-location-audit`
Comprehensive audit of all document locations for an entity/record.

**Parameters:**
- `entityName` (string, optional): Entity logical name
- `recordId` (string, optional): Record ID

**Output:**
- List of all document locations
- Validation status for each location
- Health summary (valid/warning/error counts)
- Overall recommendations

---

### `spo-migration-verification-report`
Detailed migration verification report with file-by-file comparison.

**Parameters:**
- `sourceSiteId` (string, required): Source site ID
- `sourcePath` (string, required): Source folder path
- `targetSiteId` (string, required): Target site ID
- `targetPath` (string, required): Target folder path

**Output:**
- Migration summary (success rate, file counts)
- Missing files list
- Size mismatch details
- Timeline analysis
- Recommendations for remediation

---

### `spo-setup-validation-guide`
Interactive setup validation checklist and troubleshooting guide.

**Parameters:**
- `siteId` (string, required): Site ID to validate

**Output:**
- Configuration checklist
- Permission verification
- Connectivity tests
- Common setup issues
- Step-by-step fixes

---

### `spo-troubleshooting-guide`
Common SharePoint integration issues and solutions.

**Parameters:**
- `siteId` (string, optional): Site ID for context
- `errorMessage` (string, optional): Specific error to troubleshoot

**Output:**
- Common error scenarios
- Root cause analysis
- Step-by-step solutions
- Prevention tips

---

### `spo-powerplatform-integration-health`
Overall health check for PowerPlatform-SharePoint integration.

**Parameters:**
- `siteId` (string, optional): Limit to specific site

**Output:**
- All document locations health status
- Misconfiguration detection
- Empty folder warnings
- Integration recommendations
- Best practices compliance

---

## Usage Examples

### Example 1: Browse SharePoint Site

```javascript
// 1. List available sites
const sites = await mcpClient.invoke("spo-list-sites");
console.log("Available sites:", sites.sites);

// 2. Test connection to specific site
const connection = await mcpClient.invoke("spo-test-connection", {
  siteId: "main-site"
});
console.log("Site info:", connection.siteInfo);

// 3. List document libraries
const drives = await mcpClient.invoke("spo-list-drives", {
  siteId: "main-site"
});
console.log("Libraries:", drives.drives);

// 4. Browse library contents
const items = await mcpClient.invoke("spo-list-items", {
  siteId: "main-site",
  driveId: drives.drives[0].id
});
console.log("Files and folders:", items.items);
```

---

### Example 2: Search for Documents

```javascript
// Search for files containing "proposal"
const searchResults = await mcpClient.invoke("spo-search-items", {
  siteId: "main-site",
  query: "proposal budget 2024"
});

console.log(`Found ${searchResults.items.length} documents`);

searchResults.items.forEach(item => {
  console.log(`- ${item.name} (${item.size} bytes)`);
  console.log(`  URL: ${item.webUrl}`);
});
```

---

### Example 3: Validate PowerPlatform Document Location

```javascript
// 1. Get all document locations for an account
const locations = await mcpClient.invoke("spo-get-crm-document-locations", {
  entityName: "account",
  recordId: "abcdef01-1234-5678-9abc-def012345678"
});

console.log(`Found ${locations.length} document locations`);

// 2. Validate each location
for (const location of locations) {
  const validation = await mcpClient.invoke("spo-validate-document-location", {
    documentLocationId: location.sharepointdocumentlocationid
  });

  console.log(`\n${location.name}:`);
  console.log(`  Status: ${validation.status}`);
  console.log(`  Site exists: ${validation.spoValidation.siteExists}`);
  console.log(`  Folder exists: ${validation.spoValidation.folderExists}`);
  console.log(`  File count: ${validation.spoValidation.fileCount}`);

  if (validation.issues.length > 0) {
    console.log(`  Issues:`);
    validation.issues.forEach(issue => console.log(`    - ${issue}`));
  }

  if (validation.recommendations.length > 0) {
    console.log(`  Recommendations:`);
    validation.recommendations.forEach(rec => console.log(`    - ${rec}`));
  }
}
```

---

### Example 4: Verify Document Migration

```javascript
// Verify migration from old location to new location
const verification = await mcpClient.invoke("spo-verify-document-migration", {
  sourceSiteId: "main-site",
  sourcePath: "/Documents/Archive/2023",
  targetSiteId: "archive-site",
  targetPath: "/Documents/Historical/2023"
});

console.log("Migration Verification Report");
console.log("==============================");
console.log(`Source: ${verification.source.fileCount} files (${verification.source.totalSize} bytes)`);
console.log(`Target: ${verification.target.fileCount} files (${verification.target.totalSize} bytes)`);
console.log(`Success Rate: ${verification.successRate}%`);
console.log(`Status: ${verification.status}`);

if (verification.comparison.missingFiles.length > 0) {
  console.log(`\nMissing Files (${verification.comparison.missingFiles.length}):`);
  verification.comparison.missingFiles.forEach(file => console.log(`  - ${file}`));
}

if (verification.comparison.sizeMismatches.length > 0) {
  console.log(`\nSize Mismatches (${verification.comparison.sizeMismatches.length}):`);
  verification.comparison.sizeMismatches.forEach(mismatch => {
    console.log(`  - ${mismatch.name}: ${mismatch.sourceSize} → ${mismatch.targetSize}`);
  });
}
```

---

### Example 5: Get Recent Activity Report (Prompt)

```javascript
// Use prompt for formatted report
const report = await mcpClient.getPrompt("spo-recent-activity", {
  siteId: "main-site",
  driveId: "b!Abc123...",
  days: "30"
});

// Report is formatted as markdown with:
// - Timeline of recent changes
// - User activity breakdown
// - File type statistics
// - Trend analysis
console.log(report);
```

---

## Best Practices

### Performance Optimization

**1. Use Caching Effectively**
- Default cache TTL is 5 minutes
- Adjust `SHAREPOINT_CACHE_TTL` based on update frequency
- Clear cache after major changes

**2. Limit Search Scope**
- Always specify `driveId` when possible for searches
- Use specific search queries (avoid "*")
- Configure `SHAREPOINT_MAX_SEARCH_RESULTS` appropriately

**3. Minimize Recursive Operations**
- Use `maxDepth` parameter for folder trees
- Avoid full site traversal
- Prefer path-based access over item ID when known

### Security Best Practices

**1. Principle of Least Privilege**
- Grant `Sites.Read.All` only (no write permissions)
- Limit site access to required sites only
- Use separate app registrations for different environments

**2. Credential Management**
- Rotate client secrets regularly (12-month expiry recommended)
- Never commit secrets to source control
- Use environment-specific configurations

**3. Audit and Monitoring**
- Review audit logs regularly
- Monitor API usage quotas
- Set up alerts for authentication failures

### Integration Patterns

**1. PowerPlatform Document Locations**
- Validate configurations before migration
- Use `spo-validate-document-location` in automated workflows
- Schedule periodic validation checks

**2. Document Migration**
- Always verify migrations with `spo-verify-document-migration`
- Test with small batches first
- Keep detailed migration logs

**3. Cross-Service Correlation**
- Combine with PowerPlatform tools for entity-level document access
- Use with Azure DevOps for project documentation integration
- Leverage with Application Insights for usage tracking

---

## Troubleshooting

### Common Errors

#### 1. "Missing required SharePoint configuration"

**Error:**
```
Error: Missing required SharePoint configuration: SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET
```

**Solution:**
- Verify all three environment variables are set
- Check for typos in variable names
- Ensure no extra whitespace in values

**Test:**
```bash
echo $SHAREPOINT_TENANT_ID
echo $SHAREPOINT_CLIENT_ID
echo "Secret is set: $([ -n "$SHAREPOINT_CLIENT_SECRET" ] && echo 'yes' || echo 'no')"
```

---

#### 2. "Site not found or access denied"

**Error:**
```
Error: Site with URL 'https://contoso.sharepoint.com/sites/main' not found or access denied
```

**Root Causes:**
- App registration lacks permissions on the site
- Site URL is incorrect
- Site doesn't exist

**Solution:**

**Step 1: Verify Site URL**
- Open site in browser and check URL
- Ensure URL includes `/sites/{sitename}`
- Check for typos

**Step 2: Grant Site Access**
```powershell
# Install PnP PowerShell
Install-Module -Name PnP.PowerShell -Force

# Connect to site
Connect-PnPOnline -Url "https://yourtenant.sharepoint.com/sites/yoursite" -Interactive

# Add app to site with Read permission
Set-PnPWebPermission -User "your-app-client-id" -AddRole "Read"
```

**Step 3: Verify Permissions**
- Go to Site Settings → Site Permissions
- Find your app registration
- Verify it has at least "Read" permission

---

#### 3. "Unauthorized: Access token validation failure"

**Error:**
```
Error: Unauthorized: Access token validation failure
```

**Root Causes:**
- API permissions not granted
- Admin consent not provided
- Client secret expired

**Solution:**

**Step 1: Check API Permissions**
- Azure Portal → App Registration → API Permissions
- Verify `Sites.Read.All` is listed
- Check status shows "Granted for [tenant]"

**Step 2: Grant Admin Consent**
- Click "Grant admin consent for [tenant]"
- Requires Global Administrator role
- Wait 5-10 minutes for propagation

**Step 3: Verify Client Secret**
- Azure Portal → App Registration → Certificates & secrets
- Check secret expiration date
- Create new secret if expired
- Update `SHAREPOINT_CLIENT_SECRET` environment variable

---

#### 4. "InvalidAuthenticationToken: Token is expired"

**Error:**
```
Error: InvalidAuthenticationToken: Lifetime validation failed, the token is expired
```

**Root Cause:**
- Cached token has expired
- Token refresh failed

**Solution:**
- Service automatically refreshes tokens
- If error persists, restart MCP server
- Check client secret is valid

---

#### 5. "Site is not in configured sites list"

**Error:**
```
Error: Site with URL 'https://contoso.sharepoint.com/sites/unknown' is not configured in SHAREPOINT_SITES
```

**Solution:**
Add site to `SHAREPOINT_SITES` configuration:
```json
{
  "id": "new-site",
  "name": "New Site",
  "siteUrl": "https://yourtenant.sharepoint.com/sites/unknown",
  "active": true
}
```

---

#### 6. "Document library not found"

**Error:**
```
Error: Document library 'Documents' not found in site
```

**Root Causes:**
- Library name is case-sensitive
- Library doesn't exist
- Path is incorrect

**Solution:**

**Step 1: List all libraries**
```javascript
const drives = await mcpClient.invoke("spo-list-drives", {
  siteId: "main-site"
});
console.log(drives.drives.map(d => d.name));
```

**Step 2: Use correct library name**
- Use exact name from list (case-sensitive)
- Common names: "Documents", "Shared Documents", "Site Assets"

---

#### 7. "PowerPlatform validation fails for existing folder"

**Error:**
```
Validation status: error
Issues: Folder not accessible at path: /Documents/account_abc
```

**Root Causes:**
- Path format is incorrect
- Folder was deleted or moved
- Library name changed

**Solution:**

**Step 1: Check CRM Configuration**
- Verify `absoluteurl` field in sharepointdocumentlocation record
- Ensure URL format: `https://tenant.sharepoint.com/sites/site/Library/Folder`

**Step 2: Verify Folder Exists**
- Open SharePoint site in browser
- Navigate to expected location
- Check folder exists and is accessible

**Step 3: Fix Path if Needed**
- Update `absoluteurl` in Dataverse record
- Ensure path matches actual SharePoint structure

---

### Performance Issues

#### Slow Site Listing

**Symptom:** `spo-list-sites` takes >5 seconds

**Cause:** Too many configured sites

**Solution:**
- Set `active: false` for unused sites
- Remove old/archived sites from configuration
- Use separate configurations per environment

---

#### Search Timeouts

**Symptom:** `spo-search-items` times out or returns incomplete results

**Cause:** Too many results or complex query

**Solution:**
- Use more specific search terms
- Limit search to specific library with `driveId`
- Reduce `SHAREPOINT_MAX_SEARCH_RESULTS`
- Use `spo-get-item-by-path` if path is known

---

### Integration Issues

#### PowerPlatform Service Not Available

**Symptom:** `spo-get-crm-document-locations` fails with "PowerPlatform service not initialized"

**Cause:** PowerPlatform integration not configured

**Solution:**
- Verify PowerPlatform environment variables are set
- PowerPlatform tools and SharePoint tools work independently
- Only validation tools require both services

---

## Additional Resources

### Microsoft Graph API Documentation
- [Sites API Reference](https://learn.microsoft.com/en-us/graph/api/resources/site)
- [Drives API Reference](https://learn.microsoft.com/en-us/graph/api/resources/drive)
- [Items API Reference](https://learn.microsoft.com/en-us/graph/api/resources/driveitem)

### SharePoint Online
- [SharePoint Online Limits](https://learn.microsoft.com/en-us/office365/servicedescriptions/sharepoint-online-service-description/sharepoint-online-limits)
- [SharePoint Developer Documentation](https://learn.microsoft.com/en-us/sharepoint/dev/)

### PowerPlatform Integration
- [SharePoint Document Location Entity](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/sharepointdocumentlocation)
- [Document Management Configuration](https://learn.microsoft.com/en-us/power-platform/admin/enable-sharepoint-document-management-specific-entities)

---

## Support

For issues, questions, or feature requests:
- GitHub Issues: [mcp-consultant-tools](https://github.com/anthropics/mcp-consultant-tools/issues)
- Documentation: [MCP Consultant Tools Docs](https://github.com/anthropics/mcp-consultant-tools)

---

**Last Updated**: 2024-11-10
**Version**: 11.0.0
