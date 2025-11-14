# GitHub Enterprise Integration

**📦 Package:** `@mcp-consultant-tools/github-enterprise`
**🔒 Security:** Production-safe (read-only by default, write operations opt-in)

Complete guide for the GitHub Enterprise Cloud integration in MCP Consultant Tools.

---

## ⚡ Quick Start

### MCP Client Configuration

Get started quickly with this minimal configuration. Just replace the placeholder values with your actual credentials:

#### For VS Code

Add this to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "github-enterprise": {
      "command": "npx",
      "args": ["-y", "mcp-consultant-tools@latest"],
      "env": {
        "GITHUB_TOKEN": "your-personal-access-token",
        "GITHUB_ENTERPRISE_URL": "https://github.yourcompany.com"
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
    "github-enterprise": {
      "command": "npx",
      "args": ["-y", "mcp-consultant-tools@latest"],
      "env": {
        "GITHUB_TOKEN": "your-personal-access-token",
        "GITHUB_ENTERPRISE_URL": "https://github.yourcompany.com"
      }
    }
  }
}
```

#### Test Your Setup

After configuring, test the connection by listing configured repositories:

```javascript
// Ask Claude: "List all configured GitHub repositories"
// Or use the repo-overview prompt:
await mcpClient.callPrompt("ghe-repo-overview", {
  repoId: "plugin-core"
});
```

**Need credentials?** See the [Detailed Setup](#setup) section below for personal access token (PAT) and GitHub App setup instructions.

---

## 🎯 Key Features for Consultants

### Automated Workflows (Prompts)

This package includes **5 pre-built prompts** that generate formatted, human-readable reports from GitHub repositories. These prompts are designed for consultants who need quick insights without navigating the GitHub web interface.

#### Repository Analysis Prompts

1. **`ghe-repo-overview`** - Comprehensive repository overview with branch analysis and recent commits
   - Example: `"Give me an overview of the plugin-core repository"`
   - Includes: Repository metadata, branch list, recent commits, file structure

2. **`ghe-code-search-report`** - Format code search results with relevance scoring
   - Example: `"Find all usages of ContactPlugin class"`
   - Includes: Search results grouped by repository, code snippets with highlighting

3. **`ghe-branch-comparison-report`** - Compare two branches with deployment checklist
   - Example: `"Compare main and release/9.0 branches"`
   - Includes: Commits ahead/behind, changed files, deployment checklist

4. **`ghe-deployment-report`** - Deployment-ready report with rollback plan
   - Example: `"Generate deployment report for release/9.0"`
   - Includes: Deployment summary, commits, risk assessment, rollback plan

5. 🔥 **`github-cross-service-correlation`** - **MOST VALUABLE** - Correlates GitHub commits with Azure DevOps work items and Application Insights deployments
   - Example: `"Troubleshoot work item #1234 across all services"`
   - Includes: Work item details, related commits, code changes, deployment status, runtime errors
   - **Use Case:** End-to-end bug troubleshooting from work item → code → deployment → runtime

**Why the cross-service-correlation prompt is most valuable:**
- Traces bugs from Azure DevOps work items through GitHub commits to deployment and runtime
- Correlates "AB#1234" commit references with work item details
- Verifies deployed code matches repository code
- Identifies runtime errors in Application Insights related to code changes
- Generates comprehensive troubleshooting reports impossible with individual tools
- Perfect for production incident investigation and root cause analysis

### Repository Query Tools

Beyond prompts, this package provides **22 specialized tools** for repository access:

**Repository & Branch Management (6 tools)**
- `ghe-list-repos` - List all configured repositories
- `ghe-list-branches` - List all branches for a repository
- `ghe-get-default-branch` - Auto-detect default branch with typo handling
- `ghe-get-branch-details` - Get detailed branch information
- `ghe-compare-branches` - Compare two branches with file changes
- `ghe-search-repos` - Search repositories by name or description

**File Operations (5 tools)**
- `ghe-get-file` - Get file content from repository
- `ghe-search-code` - Search code across repositories
- `ghe-list-files` - List files in a directory
- `ghe-get-directory-structure` - Get recursive directory tree
- `ghe-get-file-history` - Get commit history for specific file

**Commit & History (5 tools)**
- `ghe-get-commits` - Get commit history for a branch
- `ghe-get-commit-details` - Get detailed commit information
- `ghe-search-commits` - Search commits by message or hash (supports AB#1234)
- `ghe-get-commit-diff` - Get detailed diff for a commit
- `ghe-compare-branches` - Compare branches and show changes

**Pull Requests (3 tools)**
- `ghe-list-pull-requests` - List pull requests for repository
- `ghe-get-pull-request` - Get detailed PR information
- `ghe-get-pr-files` - Get files changed in a PR

**Write Operations (3 tools)** - ⚠️ Disabled by default
- `ghe-create-branch` - Create a new branch
- `ghe-update-file` - Update file content
- `ghe-create-file` - Create a new file

**Cache Management (1 tool)**
- `ghe-clear-cache` - Clear cached GitHub API responses

---

## Table of Contents

- [Overview](#overview)
- [Detailed Setup](#setup)
  - [Prerequisites](#prerequisites)
  - [Authentication Methods](#authentication-methods)
  - [Repository Configuration](#repository-configuration)
  - [Environment Variables](#environment-variables)
- [Tools (22 Total)](#tools-22-total)
  - [Repository & Branch Management](#repository--branch-management)
  - [File Operations](#file-operations)
  - [Commit & History](#commit--history)
  - [Pull Requests](#pull-requests)
  - [Write Operations](#write-operations)
  - [Cache Management](#cache-management)
- [Prompts (5 Total)](#prompts-5-total)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

The GitHub Enterprise integration enables AI-assisted bug troubleshooting and code analysis by providing comprehensive access to your GitHub repositories. It's designed to work seamlessly with other integrations (PowerPlatform, Azure DevOps, Application Insights) for complete development lifecycle visibility.

### Primary Use Case: Cross-Service Bug Troubleshooting

The killer feature is **correlating bugs across your entire stack**:

1. **Start with Azure DevOps work item** (#1234) describing a bug
2. **Find related GitHub commits** by searching for "AB#1234" references
3. **Analyze code changes** in the commits
4. **Check deployed PowerPlatform plugins** to verify the code is deployed
5. **Review Application Insights exceptions** for runtime errors
6. **Generate comprehensive troubleshooting report** with all findings

This end-to-end correlation is impossible with individual tools but trivial with AI assistance.

### Key Features

- **22 tools** for comprehensive GitHub access
- **5 prompts** for formatted, AI-friendly analysis
- **Branch auto-detection** with typo handling (release/9.0 vs relase/9.0)
- **Response caching** (5-minute TTL) to reduce API calls
- **Multi-repository support** with active/inactive toggles
- **PAT or GitHub App authentication**
- **Read-only by default** (write operations opt-in)
- **Work item correlation** (search commits for #1234 references)

### Supported Environments

- ✅ **GitHub Enterprise Cloud** (https://github.yourcompany.com)
- ✅ **GitHub.com** (https://github.com) - also supported
- ❌ **GitHub Enterprise Server** (on-premises) - not tested but may work

---

## Setup

### Prerequisites

- **GitHub Enterprise Cloud account** or GitHub.com account
- **Repository access** (read permission required, write optional)
- **MCP-compatible client** (Claude Desktop, VS Code with Claude Code, etc.)
- **Node.js 16 or later** (if running locally)

### Authentication Methods

Choose one:

#### Option 1: Personal Access Token (PAT) - Recommended for Individual Use

**Advantages:**
- ✅ Simpler setup (5 minutes)
- ✅ Works immediately
- ✅ Good for personal use

**Disadvantages:**
- ❌ Lower rate limits (5000 req/hour)
- ❌ Requires manual token rotation
- ❌ Access to all repos you can access (not scoped)

**Setup Steps:**

1. Go to GitHub Enterprise → Click your profile photo → **Settings**
2. Navigate to **Developer settings** (bottom of left sidebar)
3. Click **Personal access tokens** → **Tokens (classic)**
4. Click **Generate new token** → **Generate new token (classic)**
5. Set token description: `MCP Consultant Tools`
6. Set expiration: **90 days** (recommended for security)
7. Select scopes:
   - ✅ **repo** (full control of private repositories) - **Required**
   - ✅ **read:org** (read organization membership) - **Optional** but recommended
8. Click **Generate token**
9. **Copy the token immediately** (format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
10. Store it securely in your environment variables

**Security Notes:**
- PATs have full access to all repositories you can access
- Never commit tokens to version control
- Rotate tokens every 90 days
- Use environment variables or secret management

#### Option 2: GitHub App - Advanced for Organization-Wide Deployments

**Advantages:**
- ✅ Higher rate limits (5000 req/hour per installation)
- ✅ Installation-scoped access (specific repos only)
- ✅ Automatic token refresh (1-hour expiry)
- ✅ Better audit trail

**Disadvantages:**
- ❌ More complex setup (30 minutes)
- ❌ Requires organization admin permissions
- ❌ Overkill for individual use

**Setup Steps:**

1. **Create GitHub App:**
   - Go to **Organization Settings** → **Developer settings** → **GitHub Apps**
   - Click **New GitHub App**
   - Set name: `MCP Consultant Tools`
   - Set homepage URL: Your organization URL
   - Disable webhook: Uncheck **Active**
   - Set permissions:
     - Repository permissions:
       - **Contents**: Read-only (required)
       - **Metadata**: Read-only (required)
       - **Pull requests**: Read-only (optional)
   - Click **Create GitHub App**
   - Copy the **App ID** → `GHE_APP_ID`

2. **Generate Private Key:**
   - In the GitHub App settings, scroll to **Private keys**
   - Click **Generate a private key**
   - Download the `.pem` file
   - Copy the entire contents → `GHE_APP_PRIVATE_KEY`

3. **Install the App:**
   - Go to your GitHub App page
   - Click **Install App** in left sidebar
   - Select your organization
   - Choose **Only select repositories** and select repos you need
   - Click **Install**
   - Copy the **Installation ID** from the URL:
     - URL format: `https://github.com/organizations/yourorg/settings/installations/12345678`
     - The number `12345678` is your `GHE_APP_INSTALLATION_ID`

### Repository Configuration

Configure which repositories the MCP server can access using a JSON array:

**Single Repository Example:**
```json
[
  {
    "id": "plugin-core",
    "owner": "yourorg",
    "repo": "PluginCore",
    "defaultBranch": "release/9.0",
    "active": true,
    "description": "Core CRM plugins"
  }
]
```

**Multi-Repository Example:**
```json
[
  {
    "id": "plugin-core",
    "owner": "yourorg",
    "repo": "PluginCore",
    "defaultBranch": "release/9.0",
    "active": true,
    "description": "Core CRM plugins"
  },
  {
    "id": "custom-workflows",
    "owner": "yourorg",
    "repo": "CustomWorkflows",
    "defaultBranch": "main",
    "active": true,
    "description": "Custom workflow assemblies"
  },
  {
    "id": "shared-libraries",
    "owner": "yourorg",
    "repo": "SharedLibraries",
    "active": false,
    "description": "Inactive - shared utility libraries"
  }
]
```

**Field Descriptions:**
- `id` (required, string): Unique identifier for this repo (user-friendly, e.g., "plugin-core")
- `owner` (required, string): Organization or user name
- `repo` (required, string): Repository name
- `defaultBranch` (optional, string): Default branch to use (empty = auto-detect from release/* branches)
- `active` (required, boolean): Enable/disable without removing config
- `description` (optional, string): Human-readable description

**Branch Auto-Detection:**
If `defaultBranch` is empty or not specified, the service will:
1. List all branches
2. Find branches matching `release/*` (case-insensitive)
3. Parse version numbers (e.g., release/9.0, release/8.0)
4. Select the highest version (9.0 > 8.0)
5. Fall back to `main` or `master` if no release branches found

### Environment Variables

**Required Variables:**

```bash
# Base URL
GHE_URL="https://github.yourcompany.com"  # Or https://github.com for GitHub.com

# Authentication (choose PAT or GitHub App)
GHE_AUTH_METHOD="pat"  # or "github-app"

# PAT Authentication
GHE_PAT="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# GitHub App Authentication (if using github-app)
# GHE_APP_ID="123456"
# GHE_APP_INSTALLATION_ID="12345678"
# GHE_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
# MIIEpAIBAAKCAQEA...
# -----END RSA PRIVATE KEY-----"

# Repository Configuration
GHE_REPOS='[{"id":"plugin-core","owner":"yourorg","repo":"PluginCore","defaultBranch":"release/9.0","active":true}]'
```

**Optional Variables:**

```bash
# API Version
GHE_API_VERSION="2022-11-28"  # Default value

# Caching
GHE_ENABLE_CACHE="true"  # Enable response caching (default: true)
GHE_CACHE_TTL="300"      # Cache TTL in seconds (default: 300 = 5 minutes)

# Write Operations (disabled by default for safety)
GHE_ENABLE_WRITE="false"   # Allow file updates (default: false)
GHE_ENABLE_CREATE="false"  # Allow branch/file creation (default: false)

# Performance Tuning
GHE_MAX_FILE_SIZE="1048576"     # Max file size in bytes (default: 1MB)
GHE_MAX_SEARCH_RESULTS="100"    # Max search results (default: 100)
```

**Complete Configuration Example (Claude Desktop):**

```json
{
  "mcpServers": {
    "github-enterprise": {
      "command": "npx",
      "args": ["-y", "mcp-consultant-tools@latest"],
      "env": {
        "GHE_URL": "https://github.yourcompany.com",
        "GHE_PAT": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "GHE_AUTH_METHOD": "pat",
        "GHE_REPOS": "[{\"id\":\"plugin-core\",\"owner\":\"yourorg\",\"repo\":\"PluginCore\",\"defaultBranch\":\"release/9.0\",\"active\":true}]",
        "GHE_ENABLE_CACHE": "true",
        "GHE_CACHE_TTL": "300",
        "GHE_ENABLE_WRITE": "false",
        "GHE_ENABLE_CREATE": "false"
      }
    }
  }
}
```

---

## Tools (22 Total)

### Repository & Branch Management

#### ghe-list-repos

List all configured repositories with their status.

**Parameters:**
None

**Returns:**
Array of repositories with:
- `id` (string): Repository identifier
- `owner` (string): Organization/user name
- `repo` (string): Repository name
- `defaultBranch` (string): Configured default branch
- `active` (boolean): Active status
- `description` (string): Repository description

**Example:**
```javascript
await mcpClient.invoke("ghe-list-repos", {});
```

**Response:**
```json
[
  {
    "id": "plugin-core",
    "owner": "yourorg",
    "repo": "PluginCore",
    "defaultBranch": "release/9.0",
    "active": true,
    "description": "Core CRM plugins"
  }
]
```

**Use Cases:**
- Verify repository configuration
- Check which repos are active
- List all accessible repositories

---

#### ghe-list-branches

List all branches for a repository.

**Parameters:**
- `repoId` (string, required): Repository identifier from configuration
- `protectedOnly` (boolean, optional): Filter by protection status

**Returns:**
Array of branches with:
- `name` (string): Branch name
- `protected` (boolean): Protection status
- `commit` (object): Latest commit info

**Example:**
```javascript
await mcpClient.invoke("ghe-list-branches", {
  repoId: "plugin-core",
  protectedOnly: false
});
```

**Use Cases:**
- List all branches in a repository
- Find protected branches
- Discover available release branches

---

#### ghe-get-default-branch

Auto-detect default branch for a repository with intelligent fallback and typo handling.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `userSpecified` (string, optional): Override auto-detection with specific branch

**Returns:**
- `branch` (string): Selected branch name
- `reason` (string): Selection reason
- `confidence` (string): Confidence level (high/medium/low)
- `alternatives` (array): Alternative branches
- `message` (string): Human-readable message

**Example:**
```javascript
await mcpClient.invoke("ghe-get-default-branch", {
  repoId: "plugin-core"
});
```

**Response:**
```json
{
  "branch": "release/9.0",
  "reason": "auto-detected: highest release version (9.0)",
  "confidence": "medium",
  "alternatives": ["release/8.0", "main"],
  "message": "Auto-selected 'release/9.0'. If this is incorrect, specify a different branch explicitly."
}
```

**Auto-Detection Logic:**
1. User-specified branch (highest priority)
2. Configured defaultBranch from GHE_REPOS
3. Auto-detect release branch (highest version from release/*)
4. Repository default branch
5. Fallback to main/master

**Typo Handling:**
If you specify `relase/9.0` (typo), the service will:
1. Try exact match (fails)
2. Try case-insensitive match
3. Suggest similar branch names
4. Fall back to auto-detection

**Use Cases:**
- Auto-select latest release branch
- Handle typos gracefully
- Provide alternatives when uncertain

---

#### ghe-get-branch-details

Get detailed information about a specific branch.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `branch` (string, required): Branch name

**Returns:**
- `name` (string): Branch name
- `protected` (boolean): Protection status
- `commit` (object): Latest commit details (SHA, message, author, date)

**Example:**
```javascript
await mcpClient.invoke("ghe-get-branch-details", {
  repoId: "plugin-core",
  branch: "release/9.0"
});
```

**Use Cases:**
- Check branch protection status
- Get latest commit on a branch
- Verify branch exists

---

#### ghe-compare-branches

Compare two branches and show file changes.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `base` (string, required): Base branch name
- `head` (string, required): Head branch name (to compare against base)

**Returns:**
- `ahead_by` (number): Commits ahead
- `behind_by` (number): Commits behind
- `status` (string): Comparison status
- `commits` (array): Commits in head not in base
- `files` (array): Changed files with additions/deletions

**Example:**
```javascript
await mcpClient.invoke("ghe-compare-branches", {
  repoId: "plugin-core",
  base: "main",
  head: "release/9.0"
});
```

**Use Cases:**
- Pre-deployment analysis
- Identify changes between branches
- Generate deployment checklists
- Review what will be merged

---

#### ghe-search-repos

Search repositories by name or description.

**Parameters:**
- `query` (string, required): Search query
- `owner` (string, optional): Filter by organization/owner

**Returns:**
- `total_count` (number): Total results
- `items` (array): Repository results with name, description, URL

**Example:**
```javascript
await mcpClient.invoke("ghe-search-repos", {
  query: "plugin",
  owner: "yourorg"
});
```

**Use Cases:**
- Discover repositories
- Find repos by keyword
- Audit organization repositories

---

### File Operations

#### ghe-get-file

Get file content from a repository.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `path` (string, required): File path (e.g., "src/Plugins/ContactPlugin.cs")
- `branch` (string, optional): Branch name (defaults to auto-detected branch)

**Returns:**
- `name` (string): File name
- `path` (string): Full path
- `sha` (string): File SHA
- `size` (number): File size in bytes
- `encoding` (string): Encoding (usually "base64")
- `content` (string): Base64-encoded content
- `decodedContent` (string): Decoded UTF-8 content
- `branch` (string): Branch used

**Example:**
```javascript
await mcpClient.invoke("ghe-get-file", {
  repoId: "plugin-core",
  path: "src/Plugins/ContactPlugin.cs",
  branch: "release/9.0"
});
```

**File Size Limit:**
- Default max: 1 MB (configurable via `GHE_MAX_FILE_SIZE`)
- Files larger than limit return an error
- Use GitHub's blob API directly for very large files

**Use Cases:**
- View source code
- Analyze specific files
- Compare file versions across branches
- Verify deployed code matches repository

---

#### ghe-search-code

Search code across repositories.

**Parameters:**
- `query` (string, required): Search query
- `repoId` (string, optional): Limit to specific repository
- `path` (string, optional): Filter by file path pattern
- `extension` (string, optional): Filter by file extension (e.g., "cs", "js")

**Returns:**
- `total_count` (number): Total results
- `items` (array): Search results with file path, repository, and code snippet

**Example:**
```javascript
await mcpClient.invoke("ghe-search-code", {
  query: "class ContactPlugin",
  repoId: "plugin-core",
  extension: "cs"
});
```

**Search Query Syntax:**
- Literal text: `ContactPlugin`
- Class definition: `class ContactPlugin`
- Function call: `Execute(`
- Combine with filters: Query automatically includes `repo:owner/repo` and `extension:cs`

**Use Cases:**
- Find implementation of specific classes/functions
- Search for API usage
- Locate code patterns
- Discover dependencies

---

#### ghe-list-files

List files in a directory.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `path` (string, optional): Directory path (empty = root)
- `branch` (string, optional): Branch name

**Returns:**
Array of files/directories with:
- `name` (string): File/directory name
- `path` (string): Full path
- `type` (string): "file" or "dir"
- `size` (number): File size (if type=file)
- `sha` (string): SHA hash

**Example:**
```javascript
await mcpClient.invoke("ghe-list-files", {
  repoId: "plugin-core",
  path: "src/Plugins",
  branch: "release/9.0"
});
```

**Use Cases:**
- Browse repository structure
- List plugin files
- Discover available modules

---

#### ghe-get-directory-structure

Get recursive directory tree structure.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `path` (string, optional): Starting directory path
- `branch` (string, optional): Branch name
- `depth` (number, optional): Recursion depth limit (default: 3)

**Returns:**
- `tree` (array): Recursive tree structure
- `branch` (string): Branch used

**Example:**
```javascript
await mcpClient.invoke("ghe-get-directory-structure", {
  repoId: "plugin-core",
  path: "src",
  depth: 2
});
```

**Depth Limit:**
- Default: 3 levels deep
- Prevents excessive API calls for large repos
- Set to 1 for shallow listing

**Use Cases:**
- Visualize repository structure
- Generate documentation
- Understand codebase organization

---

#### ghe-get-file-history

Get commit history for a specific file.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `path` (string, required): File path
- `branch` (string, optional): Branch name
- `limit` (number, optional): Max commits (default: 50)

**Returns:**
Array of commits that modified the file:
- `sha` (string): Commit SHA
- `commit` (object): Commit details (message, author, date)
- `author` (object): Author info
- `committer` (object): Committer info

**Example:**
```javascript
await mcpClient.invoke("ghe-get-file-history", {
  repoId: "plugin-core",
  path: "src/Plugins/ContactPlugin.cs",
  limit: 10
});
```

**Use Cases:**
- Track file changes over time
- Find when bug was introduced
- Identify who modified specific code

---

### Commit & History

#### ghe-get-commits

Get commit history for a branch.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `branch` (string, optional): Branch name (defaults to auto-detected)
- `since` (string, optional): ISO 8601 date (e.g., "2025-01-01T00:00:00Z")
- `until` (string, optional): ISO 8601 date
- `author` (string, optional): Filter by author
- `path` (string, optional): Filter by file path
- `limit` (number, optional): Max commits (default: 50)

**Returns:**
Array of commits with:
- `sha` (string): Commit SHA
- `commit` (object): Commit message, author, date
- `author` (object): Author info
- `committer` (object): Committer info

**Example:**
```javascript
await mcpClient.invoke("ghe-get-commits", {
  repoId: "plugin-core",
  branch: "release/9.0",
  since: "2025-01-01T00:00:00Z",
  limit: 20
});
```

**Use Cases:**
- Review recent changes
- Audit commits by author
- Find commits in date range

---

#### ghe-get-commit-details

Get detailed information about a specific commit.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `sha` (string, required): Commit SHA

**Returns:**
- `sha` (string): Commit SHA
- `commit` (object): Full commit details
- `files` (array): Changed files with additions/deletions/changes
- `stats` (object): Overall stats (additions, deletions, total)

**Example:**
```javascript
await mcpClient.invoke("ghe-get-commit-details", {
  repoId: "plugin-core",
  sha: "abc123def456"
});
```

**Use Cases:**
- Analyze specific commit
- Review code changes
- Verify what was deployed

---

#### ghe-search-commits

Search commits by message or hash (supports work item references).

**Parameters:**
- `query` (string, required): Search query (supports "AB#1234" for ADO work items)
- `repoId` (string, optional): Limit to specific repository
- `author` (string, optional): Filter by author
- `since` (string, optional): ISO 8601 date
- `until` (string, optional): ISO 8601 date

**Returns:**
- `total_count` (number): Total results
- `items` (array): Matching commits

**Example:**
```javascript
await mcpClient.invoke("ghe-search-commits", {
  query: "AB#1234",
  repoId: "plugin-core"
});
```

**Work Item Correlation:**
If you reference Azure DevOps work items in commit messages using `AB#1234` format, you can:
1. Get work item details from ADO
2. Search GitHub commits for "AB#1234"
3. Find all code changes related to the work item

**Use Cases:**
- Find commits related to work item
- Search by commit message keyword
- Correlate bugs with code changes

---

#### ghe-get-commit-diff

Get detailed diff for a commit in unified format.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `sha` (string, required): Commit SHA
- `format` (string, optional): "diff" or "patch" (default: "diff")

**Returns:**
String with unified diff format showing all changes.

**Example:**
```javascript
await mcpClient.invoke("ghe-get-commit-diff", {
  repoId: "plugin-core",
  sha: "abc123def456",
  format: "diff"
});
```

**Use Cases:**
- Review exact code changes
- Generate code review reports
- Export diffs for documentation

---

### Pull Requests

#### ghe-list-pull-requests

List pull requests for a repository.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `state` (string, optional): "open", "closed", or "all" (default: "open")
- `base` (string, optional): Filter by base branch
- `head` (string, optional): Filter by head branch
- `sort` (string, optional): "created", "updated", or "popularity" (default: "created")
- `limit` (number, optional): Max results (default: 30)

**Returns:**
Array of pull requests with:
- `number` (number): PR number
- `title` (string): PR title
- `state` (string): "open" or "closed"
- `user` (object): Author info
- `created_at` (string): Creation date
- `updated_at` (string): Last update date

**Example:**
```javascript
await mcpClient.invoke("ghe-list-pull-requests", {
  repoId: "plugin-core",
  state: "open",
  base: "main"
});
```

**Use Cases:**
- Review open PRs
- Find PRs targeting specific branch
- Audit PR history

---

#### ghe-get-pull-request

Get detailed pull request information.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `prNumber` (number, required): PR number

**Returns:**
- `number` (number): PR number
- `title` (string): PR title
- `body` (string): PR description
- `state` (string): "open" or "closed"
- `merged` (boolean): Merge status
- `base` (object): Base branch info
- `head` (object): Head branch info
- `user` (object): Author info
- `created_at`, `updated_at`, `merged_at` (string): Timestamps

**Example:**
```javascript
await mcpClient.invoke("ghe-get-pull-request", {
  repoId: "plugin-core",
  prNumber: 42
});
```

**Use Cases:**
- Review PR details
- Check merge status
- Analyze PR metadata

---

#### ghe-get-pr-files

Get files changed in a pull request.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `prNumber` (number, required): PR number

**Returns:**
Array of changed files with:
- `filename` (string): File path
- `status` (string): "added", "modified", "removed", "renamed"
- `additions` (number): Lines added
- `deletions` (number): Lines deleted
- `changes` (number): Total changes
- `patch` (string): Diff patch

**Example:**
```javascript
await mcpClient.invoke("ghe-get-pr-files", {
  repoId: "plugin-core",
  prNumber: 42
});
```

**Use Cases:**
- Review PR changes
- Generate deployment checklist
- Analyze PR scope

---

### Write Operations

**⚠️ WARNING:** Write operations are disabled by default. Enable with environment flags:
- `GHE_ENABLE_WRITE=true` - Allow file updates
- `GHE_ENABLE_CREATE=true` - Allow branch/file creation

#### ghe-create-branch

Create a new branch.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `branchName` (string, required): New branch name
- `fromBranch` (string, optional): Source branch (defaults to auto-detected)

**Returns:**
- `ref` (string): Git reference (refs/heads/branchName)
- `sha` (string): Commit SHA

**Example:**
```javascript
await mcpClient.invoke("ghe-create-branch", {
  repoId: "plugin-core",
  branchName: "feature/new-validation",
  fromBranch: "release/9.0"
});
```

**Requires:** `GHE_ENABLE_CREATE=true`

**Use Cases:**
- Create feature branches
- Branch from specific release
- Automate branching workflow

---

#### ghe-update-file

Update file content.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `path` (string, required): File path
- `content` (string, required): New file content (UTF-8)
- `message` (string, required): Commit message
- `branch` (string, required): Target branch
- `sha` (string, required): Current file SHA (for conflict detection)

**Returns:**
- `commit` (object): Commit info
- `content` (object): Updated file info

**Example:**
```javascript
await mcpClient.invoke("ghe-update-file", {
  repoId: "plugin-core",
  path: "src/Plugins/ContactPlugin.cs",
  content: "// Updated code here",
  message: "Fix validation bug",
  branch: "feature/bug-fix",
  sha: "abc123def456"
});
```

**Requires:** `GHE_ENABLE_WRITE=true`

**Conflict Detection:**
The `sha` parameter ensures you're updating the version you expect. If the file changed since you read it, the update will fail.

**Use Cases:**
- Apply automated fixes
- Update configuration files
- Patch code issues

---

#### ghe-create-file

Create a new file.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `path` (string, required): File path
- `content` (string, required): File content (UTF-8)
- `message` (string, required): Commit message
- `branch` (string, required): Target branch

**Returns:**
- `commit` (object): Commit info
- `content` (object): Created file info

**Example:**
```javascript
await mcpClient.invoke("ghe-create-file", {
  repoId: "plugin-core",
  path: "src/Plugins/NewPlugin.cs",
  content: "// New plugin code",
  message: "Add new plugin",
  branch: "feature/new-plugin"
});
```

**Requires:** `GHE_ENABLE_CREATE=true`

**Use Cases:**
- Generate new files
- Create configuration files
- Scaffold code

---

### Cache Management

#### ghe-clear-cache

Clear cached GitHub API responses.

**Parameters:**
- `pattern` (string, optional): Clear only cache entries matching this pattern (e.g., "ContactPlugin.cs")
- `repoId` (string, optional): Clear cache for specific repository only

**Returns:**
- `cleared` (number): Number of cache entries cleared

**Example:**
```javascript
// Clear all cache
await mcpClient.invoke("ghe-clear-cache", {});

// Clear cache for specific repo
await mcpClient.invoke("ghe-clear-cache", {
  repoId: "plugin-core"
});

// Clear cache for specific file pattern
await mcpClient.invoke("ghe-clear-cache", {
  pattern: "ContactPlugin.cs"
});
```

**Use Cases:**
- Force refresh after pushing code changes
- Clear stale data
- Troubleshoot caching issues

**Developer Workflow:**
1. Make code changes and push to GitHub
2. Clear cache: `ghe-clear-cache`
3. Query updated code: `ghe-get-file` or `ghe-search-code`

---

## Prompts (5 Total)

Prompts return formatted, markdown-based reports optimized for AI analysis.

### ghe-repo-overview

Generate comprehensive repository overview with branch analysis and recent commits.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `branch` (string, optional): Branch to analyze

**Returns:**
Markdown report with:
- Repository metadata
- Branch list with protection status
- Recent commits (last 10)
- File structure overview
- Recommendations

**Example:**
```javascript
await mcpClient.callPrompt("ghe-repo-overview", {
  repoId: "plugin-core"
});
```

**Use Cases:**
- Onboard new developers
- Generate repository documentation
- Understand codebase structure

---

### ghe-code-search-report

Format code search results with relevance scoring.

**Parameters:**
- `query` (string, required): Search query
- `repoId` (string, optional): Limit to specific repository

**Returns:**
Markdown report with:
- Search summary
- Results grouped by repository
- Code snippets with highlighting
- Relevance scores
- File paths with line numbers

**Example:**
```javascript
await mcpClient.callPrompt("ghe-code-search-report", {
  query: "class ContactPlugin",
  repoId: "plugin-core"
});
```

**Use Cases:**
- Find implementation examples
- Locate API usage
- Generate code references

---

### ghe-branch-comparison-report

Compare two branches with deployment checklist.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `base` (string, required): Base branch
- `head` (string, required): Head branch

**Returns:**
Markdown report with:
- Branch comparison summary (X commits ahead, Y commits behind)
- All commits with messages
- All changed files with stats
- Deployment checklist (generated from changes)
- Rollback plan

**Example:**
```javascript
await mcpClient.callPrompt("ghe-branch-comparison-report", {
  repoId: "plugin-core",
  base: "main",
  head: "release/9.0"
});
```

**Use Cases:**
- Pre-deployment planning
- Generate release notes
- Create deployment runbook

---

### ghe-deployment-report

Deployment-ready report with rollback plan.

**Parameters:**
- `repoId` (string, required): Repository identifier
- `branch` (string, required): Branch to deploy

**Returns:**
Markdown report with:
- Deployment summary (what's being deployed)
- All commits since last deployment
- Changed files with risk assessment
- Pre-deployment checklist
- Deployment steps
- Verification steps
- Rollback plan

**Example:**
```javascript
await mcpClient.callPrompt("ghe-deployment-report", {
  repoId: "plugin-core",
  branch: "release/9.0"
});
```

**Use Cases:**
- Generate deployment runbook
- Create change request documentation
- Plan rollback strategy

---

### github-cross-service-correlation

**⭐ KILLER FEATURE:** Bug troubleshooting with cross-service correlation.

**Parameters:**
- `workItemId` (number, required): Azure DevOps work item ID
- `project` (string, required): ADO project name
- `repoId` (string, optional): GitHub repository to search

**Returns:**
Markdown report with:
1. **Work Item Details** (from Azure DevOps)
   - Title, description, state, assigned to
2. **Related Commits** (from GitHub)
   - All commits mentioning "AB#1234"
   - Code changes in each commit
3. **Deployed Code Status** (from PowerPlatform)
   - Plugin assembly version
   - Deployment timestamp
4. **Runtime Errors** (from Application Insights)
   - Recent exceptions matching error patterns
5. **Troubleshooting Steps** (AI-generated)
6. **Root Cause Analysis** (AI-inferred)
7. **Recommended Fixes**

**Example:**
```javascript
await mcpClient.callPrompt("github-cross-service-correlation", {
  workItemId: 1234,
  project: "MyProject",
  repoId: "plugin-core"
});
```

**Full Workflow:**
1. User reports bug → ADO work item #1234 created
2. AI uses `github-cross-service-correlation` prompt
3. Service calls:
   - `get-work-item` (ADO) → Get bug description
   - `ghe-search-commits` → Find commits with "AB#1234"
   - `ghe-get-commit-details` → Analyze code changes
   - `ghe-get-file` → Verify current code
   - `get-plugin-assembly-complete` (PowerPlatform) → Check deployment
   - `appinsights-get-exceptions` → Find runtime errors
4. AI correlates all data and generates comprehensive report

**Use Cases:**
- Investigate production bugs
- Trace bug from report → code → deployment → runtime
- Generate incident reports

---

## Usage Examples

### Example 1: Bug Troubleshooting (Cross-Service)

**Scenario:** A user reports a bug via Azure DevOps work item #1234. You need to investigate.

**Workflow:**

```
1. Get work item details
   Tool: get-work-item (Azure DevOps)
   → "Contact creation fails with null reference exception"

2. Find related commits
   Tool: ghe-search-commits
   Query: "AB#1234"
   → Found 2 commits: abc123, def456

3. Analyze code changes
   Tool: ghe-get-commit-details
   → See ContactPlugin.cs was modified

4. Get current source code
   Tool: ghe-get-file
   Path: "src/Plugins/ContactPlugin.cs"
   → Verify the fix is in the code

5. Check deployment status
   Tool: get-plugin-assembly-complete (PowerPlatform)
   → Assembly version 1.0.0.5, deployed 2 hours ago

6. Check runtime errors
   Tool: appinsights-get-exceptions (Application Insights)
   → NullReferenceException still occurring after deployment

7. Generate comprehensive report
   Prompt: github-cross-service-correlation
   → AI correlates all findings and provides recommendations
```

**Result:** Discovered that the fix was committed but deployed assembly is outdated. Solution: Redeploy latest code.

---

### Example 2: Code Search and Analysis

**Scenario:** You need to find all usages of a deprecated API method.

```javascript
// Search for API usage
const results = await mcpClient.invoke("ghe-search-code", {
  query: "LegacyContactService.Create",
  repoId: "plugin-core",
  extension: "cs"
});

// Get formatted report
const report = await mcpClient.callPrompt("ghe-code-search-report", {
  query: "LegacyContactService.Create",
  repoId: "plugin-core"
});

// Review each file
for (const item of results.items) {
  const file = await mcpClient.invoke("ghe-get-file", {
    repoId: "plugin-core",
    path: item.path
  });
  // Analyze file content
}
```

---

### Example 3: Pre-Deployment Analysis

**Scenario:** Compare release branch against main to plan deployment.

```javascript
// Compare branches
const comparison = await mcpClient.invoke("ghe-compare-branches", {
  repoId: "plugin-core",
  base: "main",
  head: "release/9.0"
});

console.log(`Deploying ${comparison.ahead_by} commits`);
console.log(`${comparison.files.length} files changed`);

// Get deployment report
const report = await mcpClient.callPrompt("ghe-deployment-report", {
  repoId: "plugin-core",
  branch: "release/9.0"
});

// Report includes:
// - All commits to deploy
// - Changed files with risk assessment
// - Deployment checklist
// - Rollback plan
```

---

### Example 4: Track File History

**Scenario:** Find when a bug was introduced in a specific file.

```javascript
// Get file history
const history = await mcpClient.invoke("ghe-get-file-history", {
  repoId: "plugin-core",
  path: "src/Plugins/ContactPlugin.cs",
  limit: 50
});

// Review each commit
for (const commit of history) {
  console.log(`${commit.sha.substring(0, 7)} - ${commit.commit.message}`);

  // Get detailed diff
  const diff = await mcpClient.invoke("ghe-get-commit-diff", {
    repoId: "plugin-core",
    sha: commit.sha
  });
  // Analyze diff for bug introduction
}
```

---

## Best Practices

### Security

1. **Use PAT for individual use, GitHub App for organization-wide deployments**
   - PAT is simpler but has broader access
   - GitHub App is scoped to specific repos

2. **Rotate PATs every 90 days**
   - Set expiration date when creating
   - Use calendar reminders

3. **Never commit tokens to version control**
   - Use environment variables
   - Add `.env` to `.gitignore`

4. **Use minimal scopes**
   - PAT: Only `repo` and `read:org` (not `admin:org`)
   - GitHub App: Only `Contents: Read` and `Metadata: Read`

5. **Keep write operations disabled unless needed**
   - Default: `GHE_ENABLE_WRITE=false`
   - Only enable for automation workflows

### Performance

1. **Enable caching** (default: enabled)
   - Reduces API calls
   - Improves response time
   - Default TTL: 5 minutes

2. **Clear cache after pushing code changes**
   ```javascript
   await mcpClient.invoke("ghe-clear-cache", {
     repoId: "plugin-core"
   });
   ```

3. **Use specific branch names to avoid auto-detection overhead**
   ```javascript
   // Better (specific)
   await mcpClient.invoke("ghe-get-file", {
     repoId: "plugin-core",
     path: "src/file.cs",
     branch: "release/9.0"  // ✅ Explicit
   });

   // Slower (auto-detection)
   await mcpClient.invoke("ghe-get-file", {
     repoId: "plugin-core",
     path: "src/file.cs"  // ❌ Auto-detects every time
   });
   ```

4. **Limit search results**
   - Default: 100 results
   - Increase only if needed

### Repository Configuration

1. **Use meaningful repository IDs**
   ```json
   {
     "id": "plugin-core",  // ✅ Clear
     "id": "repo1"         // ❌ Unclear
   }
   ```

2. **Set defaultBranch for active development branches**
   ```json
   {
     "defaultBranch": "release/9.0"  // ✅ Explicit
   }
   ```

3. **Use active/inactive flags instead of removing repos**
   ```json
   {
     "id": "old-repo",
     "active": false  // ✅ Keep config, disable access
   }
   ```

### Code Correlation

1. **Reference work items in commit messages**
   ```
   Fix contact validation bug

   - Added null check for email field
   - Updated error message

   AB#1234
   ```

2. **Use consistent work item reference format**
   - Azure DevOps: `AB#1234`
   - GitHub Issues: `#1234`

3. **Search commits by work item ID**
   ```javascript
   await mcpClient.invoke("ghe-search-commits", {
     query: "AB#1234",
     repoId: "plugin-core"
   });
   ```

---

## Troubleshooting

### Authentication Errors

**Error:** `Authentication failed. Check your PAT or GitHub App credentials.`

**Solutions:**
1. Verify token is correct (PAT starts with `ghp_`)
2. Check token hasn't expired
3. Verify token has `repo` scope
4. For GitHub App: Check App ID, Installation ID, and private key

---

### Repository Not Found

**Error:** `Repository 'plugin-core' not found. Available repositories: none`

**Solutions:**
1. Check `GHE_REPOS` is properly formatted JSON
2. Verify repository ID matches configuration
3. Check repository is marked `active: true`
4. Validate owner/repo names are correct

---

### Branch Not Found

**Error:** `Branch "release/9.0" not found in yourorg/PluginCore.`

**Solutions:**
1. Verify branch name is spelled correctly
2. Use `ghe-list-branches` to see available branches
3. Try auto-detection by omitting `branch` parameter
4. Check branch exists in GitHub web UI

---

### Rate Limit Exceeded

**Error:** `Rate limit exceeded. Resets at [timestamp].`

**Solutions:**
1. Wait for rate limit to reset
2. Upgrade from PAT to GitHub App authentication (higher limits)
3. Enable caching to reduce API calls (`GHE_ENABLE_CACHE=true`)
4. Use more specific queries to reduce result counts

---

### File Too Large

**Error:** `File size (2000000 bytes) exceeds maximum allowed size (1048576 bytes).`

**Solutions:**
1. Increase file size limit: `GHE_MAX_FILE_SIZE=2097152` (2MB)
2. Use GitHub's raw file URL directly
3. Download file externally and analyze locally

---

### Cache Issues

**Problem:** Seeing stale data after pushing code changes.

**Solution:**
```javascript
// Clear cache for specific repo
await mcpClient.invoke("ghe-clear-cache", {
  repoId: "plugin-core"
});

// Or clear all cache
await mcpClient.invoke("ghe-clear-cache", {});
```

---

### Write Operations Disabled

**Error:** `File updates are disabled. Set GHE_ENABLE_WRITE=true to enable.`

**Solution:**
Set environment variable:
```bash
GHE_ENABLE_WRITE=true
```

**Warning:** Only enable write operations if you need automated file modifications.

---

## Summary

The GitHub Enterprise integration provides:

- ✅ **22 tools** for comprehensive repository access
- ✅ **5 prompts** for formatted analysis
- ✅ **Cross-service correlation** with ADO, PowerPlatform, Application Insights
- ✅ **Branch auto-detection** with intelligent fallback
- ✅ **Response caching** for performance
- ✅ **Multi-repository support** with active/inactive toggles
- ✅ **PAT or GitHub App authentication**
- ✅ **Read-only by default** (write operations opt-in)
- ✅ **Work item correlation** (AB#1234 references)

**Primary Use Case:** Bug troubleshooting with end-to-end visibility from work item → commits → code → deployment → runtime errors.

For more information, see:
- [Main README](../../README.md) - Quick start and overview
- [SETUP Guide](../../SETUP.md) - Complete setup instructions
- [CLAUDE Architecture](../../CLAUDE.md) - Technical implementation details
