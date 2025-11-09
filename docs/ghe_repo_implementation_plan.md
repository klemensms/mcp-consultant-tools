# GitHub Enterprise Cloud Integration - Implementation Plan

## Overview

Add GitHub Enterprise Cloud integration to enable AI-assisted bug troubleshooting, code review, and deployment analysis by correlating source code with deployed PowerPlatform plugins and Azure DevOps work items.

**Primary Use Case:** Investigate bugs reported in Azure DevOps by analyzing source code in GitHub Enterprise, checking deployed PowerPlatform plugins, and determining if the issue is a bug or expected business logic.

**Scale:** Designed for 3-5 repositories (crm, api, portal + client-specific repos)

**Authentication:** Personal Access Token (PAT) primary method, GitHub App optional for advanced users

**Example Workflow:**
```
User: "Work item #1234 - account field not updating after contact create"
↓
Agent: Get ADO work item #1234 details
↓
Agent: Search GHE commits for "#1234" or "contact create"
↓
Agent: Get changed files in related commits
↓
Agent: Get current plugin code from latest release branch (auto-detected: release/9.0)
↓
Agent: Check deployed plugin assembly in PowerPlatform
↓
Agent: Analyze code logic: "Field only updates if contact.accountid != null.
       This is expected behavior per business logic in ContactCreatePlugin.cs:45"
```

---

## Architecture

### Service Layer

**File:** `src/GitHubEnterpriseService.ts`

**Responsibilities:**
- Manage authentication (PAT and GitHub App)
- Execute GitHub REST API v3 requests
- Handle token caching and refresh (GitHub App tokens expire after 1 hour)
- Implement branch selection logic (auto-detect latest release branch)
- Provide helper methods for common operations

**Authentication Methods:**

1. **Personal Access Token (PAT)** - **PRIMARY METHOD** (Recommended for initial setup)
   - Header: `Authorization: token <PAT>`
   - No expiry (unless revoked)
   - Simple to create and configure
   - User can create their own PAT for testing
   - **This will be the main authentication method**

2. **GitHub App** - **OPTIONAL/ADVANCED** (For organizations with stricter security requirements)
   - Uses JWT for authentication
   - Installation tokens expire after 1 hour
   - Requires admin permissions to register GitHub App in GHE
   - Better for production use in large organizations
   - **Setup instructions will be included but this is NOT required**

**Branch Selection Strategy:**

Humans create release branches manually, so there may be typos (e.g., "release/9.0" vs "relase/9.0"). The agent should handle this gracefully and **always offer the user a choice** when auto-detection is used.

**Expected Repository Scale:** 3-5 repositories (crm, api, portal + client-specific ones)

```typescript
async getDefaultBranch(repoId: string, userSpecified?: string): Promise<BranchSelection> {
  const repo = this.getRepoById(repoId);

  // 1. User explicitly specified branch (highest priority)
  if (userSpecified) {
    const branches = await this.listBranches(repoId);
    const exists = branches.find(b => b.name === userSpecified);
    if (exists) {
      return {
        branch: userSpecified,
        reason: 'user-specified',
        confidence: 'high'
      };
    }
    // Branch doesn't exist - show available branches
    throw new Error(
      `Branch "${userSpecified}" not found. Available branches:\n` +
      branches.map(b => `  - ${b.name}`).join('\n')
    );
  }

  // 2. Check if default branch configured for this repo
  if (repo.defaultBranch) {
    return {
      branch: repo.defaultBranch,
      reason: 'configured default',
      confidence: 'high'
    };
  }

  // 3. Get all branches
  const branches = await this.listBranches(repoId);

  // 4. Filter and sort release branches (handle typos gracefully)
  const releaseBranches = branches
    .filter(b => b.name.toLowerCase().startsWith('release/'))  // Case-insensitive
    .map(b => {
      // Parse version number after "release/"
      const versionStr = b.name.substring(b.name.indexOf('/') + 1);
      const version = parseFloat(versionStr);
      return {
        name: b.name,
        version: isNaN(version) ? 0 : version,
        raw: versionStr
      };
    })
    .filter(b => b.version > 0)  // Only keep valid version numbers
    .sort((a, b) => b.version - a.version);  // Highest first

  // 5. Auto-select highest version, but ALWAYS show alternatives
  if (releaseBranches.length > 0) {
    const selected = releaseBranches[0].name;
    const allAlternatives = releaseBranches.slice(1).map(b => b.name);

    console.error(`✓ Auto-selected branch: ${selected} (highest release version ${releaseBranches[0].version})`);
    console.error(`  Alternatives: ${allAlternatives.slice(0, 3).join(', ')}`);

    return {
      branch: selected,
      reason: `auto-detected: highest release version (${releaseBranches[0].version})`,
      confidence: 'medium',
      alternatives: allAlternatives,  // ALL alternatives, not just top 3
      message: `Auto-selected "${selected}". If this is incorrect, the user can specify a different branch.`
    };
  }

  // 6. No release branches found - show all branches and ask user to pick
  console.error(`⚠️ No release branches found in format "release/X.Y"`);
  console.error(`  Available branches: ${branches.map(b => b.name).join(', ')}`);

  // Fallback to main/master if exists
  const mainBranch = branches.find(b => b.name === 'main' || b.name === 'master');
  if (mainBranch) {
    console.error(`⚠️ Falling back to: ${mainBranch.name} (main branch - likely production)`);
    return {
      branch: mainBranch.name,
      reason: 'fallback to main branch (no release branches found)',
      confidence: 'low',
      alternatives: branches.filter(b => b.name !== mainBranch.name).map(b => b.name),
      message: `No release branches found. Using "${mainBranch.name}" as fallback. User should verify this is correct.`
    };
  }

  // 7. Cannot determine - list all branches and throw error
  throw new Error(
    `Could not determine default branch. Available branches:\n` +
    branches.map(b => `  - ${b.name}`).join('\n') +
    `\n\nPlease specify a branch explicitly.`
  );
}
```

**Key Features:**
- ✅ User can always override auto-detection by specifying a branch
- ✅ Handles typos in branch names (case-insensitive matching)
- ✅ Always provides alternatives when auto-detecting
- ✅ Clear error messages with list of available branches
- ✅ Graceful fallback to main/master if no release branches exist

---

## Configuration

### Environment Variables

```bash
# GitHub Enterprise Configuration
GHE_URL=https://smartimpact.ghe.com
GHE_API_VERSION=2022-11-28

# Authentication - Option 1: Personal Access Token (PAT)
GHE_PAT=ghp_your_personal_access_token_here
GHE_AUTH_METHOD=pat

# Authentication - Option 2: GitHub App
GHE_AUTH_METHOD=github-app
GHE_APP_ID=123456
GHE_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE..."
GHE_APP_INSTALLATION_ID=12345678

# Repository Configuration (JSON array)
GHE_REPOS=[
  {
    "id": "plugin-core",
    "owner": "smartimpact",
    "repo": "PluginCore",
    "defaultBranch": "release/9.0",
    "active": true
  },
  {
    "id": "portal-main",
    "owner": "smartimpact",
    "repo": "PortalMain",
    "defaultBranch": "",
    "active": true
  },
  {
    "id": "azure-functions",
    "owner": "smartimpact",
    "repo": "AzureFunctions",
    "defaultBranch": "release/5.0",
    "active": false
  }
]

# Write Operations (disabled by default)
GHE_ENABLE_WRITE=false
GHE_ENABLE_CREATE=false

# Optional: Caching (recommended for performance)
GHE_ENABLE_CACHE=true
GHE_CACHE_TTL=300  # Cache TTL in seconds (default: 5 minutes)

# Optional: File size limits (configurable based on use case)
GHE_MAX_FILE_SIZE=1048576  # 1MB default - increase if working with large files
GHE_MAX_SEARCH_RESULTS=100

# Optional: Default branch fallback (rarely needed with auto-detection)
GHE_DEFAULT_BRANCH_PATTERN=release/*
GHE_DEFAULT_BRANCH_FALLBACK=main
```

### Repo Configuration Schema

```typescript
interface GitHubRepoConfig {
  id: string;                 // Unique identifier for this repo (user-friendly)
  owner: string;              // Organization or user name
  repo: string;               // Repository name
  defaultBranch?: string;     // Default branch (empty = auto-detect)
  active: boolean;            // Enable/disable without removing config
}

interface GitHubEnterpriseConfig {
  baseUrl: string;            // GHE base URL
  apiVersion: string;         // API version header
  authMethod: 'pat' | 'github-app';
  pat?: string;               // Personal access token
  appId?: string;             // GitHub App ID
  appPrivateKey?: string;     // GitHub App private key (PEM format)
  appInstallationId?: string; // GitHub App installation ID
  repos: GitHubRepoConfig[];
  enableWrite: boolean;
  enableCreate: boolean;
  enableCache: boolean;       // Enable response caching
  cacheTtl: number;           // Cache TTL in seconds
  maxFileSize: number;        // Max file size in bytes (configurable)
  maxSearchResults: number;
}
```

---

## Caching Strategy

To reduce GitHub API calls and improve performance, the service implements intelligent caching:

**Cache Key Format:**
```
{method}:{owner}/{repo}:{resource}:{params}
```

**Cached Resources:**
- Branch lists (5-minute TTL)
- File contents (5-minute TTL)
- Commit history (5-minute TTL)
- Repository metadata (5-minute TTL)

**Cache Invalidation:**
- Automatic expiration after TTL
- Manual clearing via `ghe-clear-cache` tool
- **Important:** Developers can clear cache mid-session after pushing code updates

**Cache Implementation:**
```typescript
class GitHubEnterpriseService {
  private cache: Map<string, { data: any; expires: number }> = new Map();

  private getCacheKey(method: string, repo: string, resource: string, params?: any): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${method}:${repo}:${resource}:${paramStr}`;
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expires) {
      return cached.data as T;
    }
    this.cache.delete(key);  // Expired
    return null;
  }

  private setCache(key: string, data: any, ttlSeconds: number): void {
    if (!this.config.enableCache) return;
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttlSeconds * 1000)
    });
  }

  clearCache(pattern?: string): number {
    if (pattern) {
      let cleared = 0;
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
          cleared++;
        }
      }
      return cleared;
    }
    const size = this.cache.size;
    this.cache.clear();
    return size;
  }
}
```

**Use Case - Developer Workflow:**
```
Developer: "Show me the ContactPlugin.cs file"
Agent: [Fetches from GitHub, caches for 5 minutes]

Developer: "I just pushed an update"
Agent: [Uses ghe-clear-cache tool to clear cache]

Developer: "Show me the ContactPlugin.cs file again"
Agent: [Fetches fresh copy from GitHub]
```

---

## Tools (22 total)

### Repository & Branch Management (6 tools)

#### 1. `ghe-list-repos`
**Description:** List all configured GitHub Enterprise repositories (active and inactive)

**Parameters:** None

**Returns:**
```json
{
  "repos": [
    {
      "id": "plugin-core",
      "owner": "smartimpact",
      "repo": "PluginCore",
      "defaultBranch": "release/9.0",
      "active": true,
      "url": "https://smartimpact.ghe.com/smartimpact/PluginCore"
    }
  ]
}
```

#### 2. `ghe-list-branches`
**Description:** List all branches for a repository

**Parameters:**
- `repoId` (required): Repository ID from configuration
- `protected` (optional): Filter by protection status

**Returns:**
```json
{
  "branches": [
    {
      "name": "release/9.0",
      "commit": {
        "sha": "abc123...",
        "message": "feat: add validation logic",
        "author": "John Doe",
        "date": "2025-01-05T10:30:00Z"
      },
      "protected": false
    }
  ]
}
```

#### 3. `ghe-get-branch-details`
**Description:** Get detailed information about a specific branch

**Parameters:**
- `repoId` (required): Repository ID
- `branch` (required): Branch name

**Returns:**
```json
{
  "name": "release/9.0",
  "commit": { /* full commit details */ },
  "protected": false,
  "protection": null,
  "aheadBy": 5,
  "behindBy": 0,
  "lastCommitDate": "2025-01-05T10:30:00Z"
}
```

#### 4. `ghe-get-default-branch`
**Description:** Auto-detect the default branch using configured strategy

**Parameters:**
- `repoId` (required): Repository ID

**Returns:**
```json
{
  "branch": "release/9.0",
  "reason": "highest release version (9.0)",
  "confidence": "medium",
  "alternatives": ["release/8.0", "release/7.0"]
}
```

#### 5. `ghe-compare-branches`
**Description:** Compare two branches and show differences

**Parameters:**
- `repoId` (required): Repository ID
- `base` (required): Base branch name
- `head` (required): Head branch name

**Returns:**
```json
{
  "baseCommit": "abc123...",
  "headCommit": "def456...",
  "aheadBy": 5,
  "behindBy": 2,
  "files": [
    {
      "filename": "src/Plugins/ContactPlugin.cs",
      "status": "modified",
      "additions": 15,
      "deletions": 3,
      "changes": 18,
      "patch": "@@ -45,7 +45,10 @@..."
    }
  ],
  "commits": [ /* commit list */ ]
}
```

#### 6. `ghe-search-repos`
**Description:** Search repositories by name or description (across entire GHE org)

**Parameters:**
- `query` (required): Search query
- `owner` (optional): Filter by owner

**Returns:** List of matching repositories

---

### File Operations (5 tools)

#### 7. `ghe-get-file`
**Description:** Get file content from a specific branch

**Parameters:**
- `repoId` (required): Repository ID
- `path` (required): File path (e.g., "src/Plugins/ContactPlugin.cs")
- `branch` (optional): Branch name (default: auto-detected)

**Returns:**
```json
{
  "content": "base64-encoded content",
  "encoding": "base64",
  "size": 1024,
  "sha": "abc123...",
  "path": "src/Plugins/ContactPlugin.cs",
  "branch": "release/9.0",
  "decodedContent": "using System;..."
}
```

#### 8. `ghe-search-code`
**Description:** Search code across repositories

**Parameters:**
- `query` (required): Search query
- `repoId` (optional): Limit to specific repo
- `path` (optional): Filter by file path pattern
- `extension` (optional): Filter by file extension

**Returns:**
```json
{
  "totalCount": 15,
  "items": [
    {
      "name": "ContactPlugin.cs",
      "path": "src/Plugins/ContactPlugin.cs",
      "repository": {
        "name": "PluginCore",
        "owner": "smartimpact"
      },
      "score": 12.5,
      "textMatches": [
        {
          "fragment": "if (contact.AccountId != null) { account.Update(); }",
          "matches": [
            {"text": "AccountId", "indices": [12, 21]}
          ]
        }
      ]
    }
  ]
}
```

#### 9. `ghe-list-files`
**Description:** List files in a directory

**Parameters:**
- `repoId` (required): Repository ID
- `path` (optional): Directory path (default: root)
- `branch` (optional): Branch name (default: auto-detected)

**Returns:**
```json
{
  "tree": [
    {
      "path": "src/Plugins",
      "mode": "040000",
      "type": "tree",
      "sha": "abc123...",
      "url": "..."
    },
    {
      "path": "src/Plugins/ContactPlugin.cs",
      "mode": "100644",
      "type": "blob",
      "sha": "def456...",
      "size": 1024,
      "url": "..."
    }
  ]
}
```

#### 10. `ghe-get-directory-structure`
**Description:** Get recursive directory tree structure

**Parameters:**
- `repoId` (required): Repository ID
- `path` (optional): Directory path (default: root)
- `branch` (optional): Branch name (default: auto-detected)
- `depth` (optional): Recursion depth limit (default: 3)

**Returns:** Nested tree structure

#### 11. `ghe-get-file-history`
**Description:** Get commit history for a specific file

**Parameters:**
- `repoId` (required): Repository ID
- `path` (required): File path
- `branch` (optional): Branch name (default: auto-detected)
- `limit` (optional): Max commits (default: 50)

**Returns:** List of commits that modified the file

---

### Commit & History (4 tools)

#### 12. `ghe-get-commits`
**Description:** Get commit history for a branch

**Parameters:**
- `repoId` (required): Repository ID
- `branch` (optional): Branch name (default: auto-detected)
- `since` (optional): ISO 8601 date (e.g., "2025-01-01T00:00:00Z")
- `until` (optional): ISO 8601 date
- `author` (optional): Filter by author
- `path` (optional): Filter by file path
- `limit` (optional): Max commits (default: 50)

**Returns:**
```json
{
  "commits": [
    {
      "sha": "abc123...",
      "commit": {
        "message": "fix: update account field logic (#1234)",
        "author": {
          "name": "John Doe",
          "email": "john@smartimpact.com",
          "date": "2025-01-05T10:30:00Z"
        }
      },
      "author": { /* GitHub user */ },
      "parents": [{"sha": "parent123..."}]
    }
  ]
}
```

#### 13. `ghe-get-commit-details`
**Description:** Get detailed information about a specific commit

**Parameters:**
- `repoId` (required): Repository ID
- `sha` (required): Commit SHA

**Returns:**
```json
{
  "sha": "abc123...",
  "commit": { /* commit metadata */ },
  "files": [
    {
      "filename": "src/Plugins/ContactPlugin.cs",
      "status": "modified",
      "additions": 15,
      "deletions": 3,
      "changes": 18,
      "patch": "@@ -45,7 +45,10 @@..."
    }
  ],
  "stats": {
    "additions": 25,
    "deletions": 5,
    "total": 30
  }
}
```

#### 14. `ghe-search-commits`
**Description:** Search commits by message or hash

**Parameters:**
- `query` (required): Search query (supports "#1234" for work item references)
- `repoId` (optional): Limit to specific repo
- `author` (optional): Filter by author
- `since` (optional): Date filter
- `until` (optional): Date filter

**Returns:** List of matching commits with context

#### 15. `ghe-get-commit-diff`
**Description:** Get detailed diff for a commit

**Parameters:**
- `repoId` (required): Repository ID
- `sha` (required): Commit SHA
- `format` (optional): "diff" or "patch" (default: "diff")

**Returns:** Unified diff format

---

### Pull Requests (3 tools)

#### 16. `ghe-list-pull-requests`
**Description:** List pull requests for a repository

**Parameters:**
- `repoId` (required): Repository ID
- `state` (optional): "open", "closed", "all" (default: "open")
- `base` (optional): Filter by base branch
- `head` (optional): Filter by head branch
- `sort` (optional): "created", "updated", "popularity" (default: "created")
- `limit` (optional): Max results (default: 30)

**Returns:**
```json
{
  "pullRequests": [
    {
      "number": 42,
      "title": "Fix account update logic",
      "state": "open",
      "user": {
        "login": "johndoe"
      },
      "head": {
        "ref": "feature/account-fix",
        "sha": "abc123..."
      },
      "base": {
        "ref": "release/9.0",
        "sha": "def456..."
      },
      "createdAt": "2025-01-05T10:00:00Z",
      "updatedAt": "2025-01-05T12:30:00Z",
      "url": "https://smartimpact.ghe.com/smartimpact/PluginCore/pull/42"
    }
  ]
}
```

#### 17. `ghe-get-pull-request`
**Description:** Get detailed information about a pull request

**Parameters:**
- `repoId` (required): Repository ID
- `prNumber` (required): Pull request number

**Returns:** Full PR details including comments, reviews, commits

#### 18. `ghe-get-pr-files`
**Description:** Get files changed in a pull request

**Parameters:**
- `repoId` (required): Repository ID
- `prNumber` (required): Pull request number

**Returns:** List of changed files with diffs

---

### Write Operations (3 tools - DISABLED BY DEFAULT)

⚠️ **Requires `GHE_ENABLE_WRITE=true` and/or `GHE_ENABLE_CREATE=true`**

#### 19. `ghe-create-branch` (requires GHE_ENABLE_CREATE=true)
**Description:** Create a new branch

**Parameters:**
- `repoId` (required): Repository ID
- `branchName` (required): New branch name
- `fromBranch` (optional): Source branch (default: auto-detected)

**Returns:** Created branch details

#### 20. `ghe-update-file` (requires GHE_ENABLE_WRITE=true)
**Description:** Update file content

**Parameters:**
- `repoId` (required): Repository ID
- `path` (required): File path
- `content` (required): New content (string)
- `message` (required): Commit message
- `branch` (required): Branch name
- `sha` (required): Current file SHA (for conflict detection)

**Returns:** Commit details

#### 21. `ghe-create-file` (requires GHE_ENABLE_CREATE=true)
**Description:** Create a new file

**Parameters:**
- `repoId` (required): Repository ID
- `path` (required): File path
- `content` (required): File content (string)
- `message` (required): Commit message
- `branch` (required): Branch name

**Returns:** Commit details

---

### Cache Management (1 tool)

#### 22. `ghe-clear-cache`
**Description:** Clear cached GitHub API responses

**Use Case:** Developer has pushed code updates and wants to see fresh data without waiting for cache expiration.

**Parameters:**
- `pattern` (optional): Clear only cache entries matching this pattern (e.g., "PluginCore", "ContactPlugin.cs")
- `repoId` (optional): Clear cache for specific repository only

**Returns:**
```json
{
  "cleared": 15,
  "message": "Cleared 15 cache entries matching pattern 'PluginCore'"
}
```

**Examples:**
```typescript
// Clear all cache
await ghe.clearCache();

// Clear cache for specific repo
await ghe.clearCache({ repoId: "plugin-core" });

// Clear cache for specific file pattern
await ghe.clearCache({ pattern: "ContactPlugin.cs" });
```

---

## Prompts (5 total)

### 1. `ghe-repo-overview`
**Description:** Comprehensive repository overview with branch analysis

**Parameters:**
- `repoId` (required): Repository ID

**Output Format:**
```markdown
# Repository Overview: PluginCore

**Owner:** smartimpact
**URL:** https://smartimpact.ghe.com/smartimpact/PluginCore
**Default Branch:** release/9.0 (auto-detected: highest release version)

## Branch Summary

| Branch | Last Commit | Author | Date | Status |
|--------|-------------|--------|------|--------|
| release/9.0 | feat: add validation logic | John Doe | 2025-01-05 | 🟢 Active |
| release/8.0 | fix: update logic | Jane Smith | 2024-12-15 | 🔵 Older |
| main | Merge release/8.0 | Deploy Bot | 2024-12-20 | ⚪ Production |

## Recent Activity (Last 30 days)

- **25 commits** across all branches
- **3 pull requests** merged
- **15 files** modified
- **Top contributors:** John Doe (15), Jane Smith (8)

## Repository Structure

```
PluginCore/
├── src/
│   ├── Plugins/
│   │   ├── ContactPlugin.cs
│   │   ├── AccountPlugin.cs
│   └── Shared/
│       ├── Helpers.cs
├── tests/
└── README.md
```
```

---

### 2. `ghe-code-search-report`
**Description:** Formatted code search results with context

**Parameters:**
- `query` (required): Search query
- `repoId` (optional): Limit to specific repo
- `extension` (optional): Filter by file extension

**Output Format:**
```markdown
# Code Search Results: "AccountId"

**Query:** `AccountId`
**Repositories:** All active repos
**Results:** 15 matches across 8 files

## Results

### 1. PluginCore/src/Plugins/ContactPlugin.cs (Line 45)
**Relevance:** ⭐⭐⭐⭐⭐

```csharp
// Context: Contact create validation
if (contact.AccountId != null) {
    var account = service.Retrieve("account", contact.AccountId.Id, new ColumnSet("name"));
    account["lastcontactcreated"] = DateTime.UtcNow;
    service.Update(account);
}
```

**Analysis:** Updates parent account's `lastcontactcreated` field only if `AccountId` is populated.

---

### 2. PluginCore/tests/ContactPluginTests.cs (Line 120)
**Relevance:** ⭐⭐⭐

```csharp
// Test case: Contact without account
var contact = new Entity("contact");
// Note: AccountId not set
ContactPlugin.OnCreate(contact, service);
// Expected: No account update
```

**Analysis:** Test confirms AccountId check is intentional business logic.
```

---

### 3. `ghe-branch-comparison-report`
**Description:** Branch comparison with deployment-ready summary

**Parameters:**
- `repoId` (required): Repository ID
- `base` (required): Base branch (e.g., "main")
- `head` (required): Head branch (e.g., "release/9.0")

**Output Format:**
```markdown
# Branch Comparison: main ← release/9.0

**Repository:** PluginCore
**Comparing:** `main` (base) ← `release/9.0` (head)
**Status:** `release/9.0` is **5 commits ahead**, **0 commits behind** `main`

## Summary

- ✅ **5 new commits** ready to merge
- 📝 **12 files changed** (+250 lines, -45 lines)
- 🔧 **3 plugins modified**
- 🧪 **8 test files updated**
- 📋 **2 ADO work items referenced** (#1234, #1235)

## Commits to Deploy

1. `abc123` - feat: add account validation (#1234) - John Doe - 2025-01-05
2. `def456` - fix: null reference in contact plugin (#1235) - Jane Smith - 2025-01-04
3. `ghi789` - test: add validation tests - John Doe - 2025-01-04
4. `jkl012` - refactor: extract helper methods - John Doe - 2025-01-03
5. `mno345` - docs: update plugin documentation - Jane Smith - 2025-01-03

## Files Changed by Type

### C# Plugins (3 files)
- `src/Plugins/ContactPlugin.cs` (+50, -10)
- `src/Plugins/AccountPlugin.cs` (+30, -5)
- `src/Shared/ValidationHelpers.cs` (+40, -0) *NEW*

### Tests (8 files)
- `tests/ContactPluginTests.cs` (+80, -20)
- ... [remaining test files]

### Other (1 file)
- `README.md` (+5, -2)

## Deployment Checklist

- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] ADO work items #1234, #1235 verified
- [ ] Plugin assemblies ready to build
- [ ] Release notes updated
```

---

### 4. `ghe-troubleshooting-guide`
**Description:** Comprehensive bug troubleshooting with ADO + PowerPlatform + GHE context

**Parameters:**
- `workItemId` (optional): Azure DevOps work item ID
- `entity` (optional): PowerPlatform entity logical name
- `pluginName` (optional): Plugin name to investigate
- `searchQuery` (optional): Code search query

**Output Format:**
```markdown
# Bug Troubleshooting Report

## Work Item Context (Azure DevOps)

**Work Item:** #1234
**Title:** Account field not updating after contact create
**Type:** Bug
**State:** Active
**Priority:** 2
**Description:**
> When creating a contact with an account relationship, the account's
> "Last Contact Created" field is not being updated.

**Repro Steps:**
1. Create contact with AccountId = ABC-123
2. Check account ABC-123
3. "Last Contact Created" field is empty

---

## Source Code Analysis (GitHub Enterprise)

### Related Commits

Found **2 commits** referencing work item #1234:

#### Commit abc123 (2025-01-05)
**Message:** `feat: add account validation (#1234)`
**Author:** John Doe
**Files Changed:** ContactPlugin.cs (+50, -10)

```csharp
// ContactPlugin.cs (Line 45-52)
if (contact.AccountId != null) {
    var account = service.Retrieve("account", contact.AccountId.Id, new ColumnSet("name"));
    account["lastcontactcreated"] = DateTime.UtcNow;
    service.Update(account);
}
```

### Current Code (release/9.0 branch)

**File:** `PluginCore/src/Plugins/ContactPlugin.cs`
**Branch:** `release/9.0` (auto-detected: latest release)
**Last Modified:** 2025-01-05 by John Doe

```csharp
// Lines 40-55
public void OnCreate(Entity contact, IOrganizationService service) {
    // Validate account relationship
    if (contact.Contains("accountid") && contact["accountid"] != null) {
        var accountRef = (EntityReference)contact["accountid"];

        // ⚠️ BUSINESS LOGIC: Only update if AccountId is populated
        if (accountRef != null && accountRef.Id != Guid.Empty) {
            var account = service.Retrieve("account", accountRef.Id,
                new ColumnSet("name", "lastcontactcreated"));

            account["lastcontactcreated"] = DateTime.UtcNow;
            service.Update(account);
        }
    }
}
```

---

## Deployed Plugin Analysis (PowerPlatform)

**Assembly:** PluginCore (Version 1.9.0.0)
**Plugin Type:** ContactCreatePlugin
**Step:** PostCreate (Post-Operation, Synchronous)
**Entity:** contact
**Filtering Attributes:** None (runs on all contact creates)
**Status:** ✅ Active

### Configuration Review

- ✅ Plugin is active and deployed
- ✅ Step configuration matches code
- ✅ No filtering attributes (runs every time)
- ⚠️ No pre/post images configured

---

## Root Cause Analysis

### ❌ NOT A BUG - Expected Business Logic

**Finding:** The code is working as designed. The account field update **only happens** if:
1. The contact has an `accountid` field populated
2. The `accountid` value is not null
3. The `accountid` GUID is not empty (Guid.Empty)

**Evidence:**
- Lines 43-44: Explicit null check for `accountid` field
- Line 47: Additional validation for `accountRef != null`
- Line 47: Additional validation for `accountRef.Id != Guid.Empty`

**Code Logic:**
```
IF contact.accountid exists AND
   contact.accountid != null AND
   contact.accountid.Id != Guid.Empty
THEN
   Update account.lastcontactcreated
ELSE
   Skip update (no error, silent)
```

### Possible Scenarios

**Scenario 1:** Contact created without AccountId
- **Result:** No account update (expected)
- **Resolution:** This is intentional - field only tracks contacts with account relationships

**Scenario 2:** Contact created with null/empty AccountId
- **Result:** No account update (expected)
- **Resolution:** Same as Scenario 1

**Scenario 3:** Contact created with valid AccountId
- **Result:** Account should update
- **Resolution:** If not updating, check plugin trace logs for errors

---

## Recommendations

### For Work Item #1234:

1. **Verify Test Data:**
   - Check if test contact has valid `accountid` value
   - Verify GUID is not Guid.Empty
   - Confirm account exists in system

2. **Check Plugin Logs:**
   Use PowerPlatform plugin trace logs to see if plugin executed:
   ```
   Tool: get-plugin-trace-logs
   Parameters: { entity: "contact", messageName: "Create" }
   ```

3. **Review Business Requirements:**
   - Is the field supposed to update for ALL contacts or only those with accounts?
   - Current code: Only contacts WITH accounts
   - If this is wrong, code needs to change

4. **Possible Code Fix (if required):**
   If ALL contacts should update (remove accountid check):
   ```csharp
   // Remove the if statement entirely
   public void OnCreate(Entity contact, IOrganizationService service) {
       // Always update (requires different logic)
   }
   ```

### Next Steps:

- [ ] User to confirm: Should ALL contacts update account field, or only those with AccountId?
- [ ] If business logic is correct: Close work item as "By Design"
- [ ] If business logic is wrong: Create new work item for code change
- [ ] Check plugin trace logs for execution errors (if any)

---

## Related Resources

- **Source Code:** [ContactPlugin.cs:45](https://smartimpact.ghe.com/smartimpact/PluginCore/blob/release/9.0/src/Plugins/ContactPlugin.cs#L45)
- **Commit:** [abc123](https://smartimpact.ghe.com/smartimpact/PluginCore/commit/abc123)
- **ADO Work Item:** [#1234](https://dev.azure.com/smartimpact/Project/_workitems/edit/1234)
- **Plugin Assembly:** PluginCore v1.9.0.0
```

---

### 5. `ghe-deployment-report`
**Description:** Deployment-ready report with code changes, testing checklist, and rollback plan

**Parameters:**
- `repoId` (required): Repository ID
- `fromBranch` (optional): Source branch (default: main)
- `toBranch` (optional): Target branch (default: auto-detected)

**Output Format:**
```markdown
# Deployment Report: release/9.0 → Production

**Repository:** PluginCore
**Source:** `release/9.0`
**Target:** `main` (Production)
**Date:** 2025-01-09

## Executive Summary

- 📦 **5 commits** ready to deploy
- 📝 **12 files changed** (+250, -45)
- 🔧 **3 plugin assemblies** require rebuild
- 🧪 **All tests passing** ✅
- 📋 **2 ADO work items** included (#1234, #1235)
- ⚠️ **1 breaking change** (AccountPlugin API signature)

## Changes by Component

### Plugins (Rebuild Required)

#### ContactPlugin
- **File:** `src/Plugins/ContactPlugin.cs`
- **Changes:** +50, -10
- **Work Items:** #1234
- **Summary:** Add account validation logic
- **Breaking:** No
- **Testing:** Unit tests added ✅

#### AccountPlugin
- **File:** `src/Plugins/AccountPlugin.cs`
- **Changes:** +30, -5
- **Work Items:** #1235
- **Summary:** Update merge logic
- **Breaking:** ⚠️ Yes - Method signature changed
  - Old: `MergeAccounts(Guid sourceId, Guid targetId)`
  - New: `MergeAccounts(Guid sourceId, Guid targetId, bool deleteSource)`
- **Testing:** Unit tests updated ✅

### Shared Libraries

#### ValidationHelpers (NEW)
- **File:** `src/Shared/ValidationHelpers.cs`
- **Changes:** +40, -0 (new file)
- **Summary:** Extracted validation methods
- **Impact:** Used by ContactPlugin and AccountPlugin

## Testing Checklist

### Unit Tests
- [x] ContactPluginTests (8/8 passing)
- [x] AccountPluginTests (12/12 passing)
- [x] ValidationHelpersTests (5/5 passing)

### Integration Tests
- [ ] End-to-end contact creation with account
- [ ] End-to-end account merge
- [ ] Validate rollback procedures

### Manual Testing (UAT)
- [ ] Create contact with account (verify lastcontactcreated updates)
- [ ] Create contact without account (verify no errors)
- [ ] Merge two accounts (verify new parameter works)

## Deployment Steps

### 1. Build Plugin Assemblies
```bash
# In PluginCore repo
dotnet build --configuration Release
```

### 2. Deploy to PowerPlatform
```
- Upload PluginCore.dll (new version 1.10.0.0)
- Register/update plugin steps
- Publish customizations
```

### 3. Verify Deployment
```
- Run smoke tests in UAT
- Check plugin trace logs
- Verify no errors in last 1 hour
```

### 4. Merge to main
```bash
git checkout main
git merge release/9.0 --no-ff
git push origin main
```

## Rollback Plan

### If Issues Occur:

**Option 1: Revert Plugin Assembly**
- Revert to previous version (1.9.0.0) in PowerPlatform
- Plugin assemblies are versioned - quick rollback

**Option 2: Revert Code**
```bash
git revert abc123  # Revert commit causing issues
git push origin main
```

**Option 3: Emergency Disable**
- Disable plugin steps in PowerPlatform (no code changes)
- Investigate offline

## Post-Deployment

### Monitoring (First 24 hours)
- [ ] Monitor plugin trace logs for errors
- [ ] Check Application Insights for exceptions
- [ ] Verify ADO work items #1234, #1235 completed
- [ ] Update release notes

### Communication
- [ ] Notify team of deployment completion
- [ ] Update ADO work items with deployment date
- [ ] Document any issues encountered

---

## Appendix: Full Commit List

1. `abc123` - feat: add account validation (#1234) - John Doe - 2025-01-05
2. `def456` - fix: null reference in contact plugin (#1235) - Jane Smith - 2025-01-04
3. `ghi789` - test: add validation tests - John Doe - 2025-01-04
4. `jkl012` - refactor: extract helper methods - John Doe - 2025-01-03
5. `mno345` - docs: update plugin documentation - Jane Smith - 2025-01-03
```

---

## Integration with Existing Features

### PowerPlatform Integration

**Tool:** `ghe-correlate-plugin-code`

**Description:** Find source code for a deployed PowerPlatform plugin assembly

**Parameters:**
- `assemblyName` (required): Plugin assembly name (e.g., "PluginCore")
- `pluginTypeName` (optional): Specific plugin type name

**Workflow:**
1. Query PowerPlatform for assembly details (using existing `get-plugin-assembly-complete`)
2. Extract assembly name and plugin type names
3. Search GitHub repos for matching C# files (by class name)
4. Return source code with branch information

**Example:**
```typescript
const assembly = await powerPlatform.getPluginAssemblyComplete("PluginCore");
const pluginTypes = assembly.types.map(t => t.name);

for (const typeName of pluginTypes) {
  const searchResults = await ghe.searchCode({
    query: `class ${typeName}`,
    extension: "cs"
  });

  if (searchResults.items.length > 0) {
    const file = searchResults.items[0];
    const content = await ghe.getFile({
      repoId: getRepoIdFromUrl(file.repository.url),
      path: file.path,
      branch: "release/9.0" // auto-detected
    });

    return {
      pluginType: typeName,
      sourceFile: file.path,
      branch: "release/9.0",
      content: content.decodedContent
    };
  }
}
```

---

### Azure DevOps Integration

**Tool:** `ghe-find-work-item-code`

**Description:** Find code changes related to an Azure DevOps work item

**Parameters:**
- `workItemId` (required): ADO work item ID (e.g., 1234)
- `repoId` (optional): Limit to specific repo

**Workflow:**
1. Query ADO for work item details (using existing `get-work-item`)
2. Search GitHub commits for work item references:
   - `#1234`
   - `AB#1234`
   - `work item 1234`
3. Get commit details and file changes
4. Correlate with deployed plugins (if applicable)

**Example Commit Message Patterns:**
```
feat: add account validation (#1234)
fix: null reference in contact plugin (AB#1234)
refactor: extract helpers for work item 1234
```

**Output:**
```json
{
  "workItemId": 1234,
  "commits": [
    {
      "sha": "abc123",
      "message": "feat: add account validation (#1234)",
      "author": "John Doe",
      "date": "2025-01-05T10:30:00Z",
      "files": [
        {
          "filename": "src/Plugins/ContactPlugin.cs",
          "changes": 18,
          "patch": "..."
        }
      ]
    }
  ],
  "affectedPlugins": [
    {
      "file": "ContactPlugin.cs",
      "className": "ContactCreatePlugin",
      "deployedAssembly": "PluginCore",
      "deployedVersion": "1.9.0.0"
    }
  ]
}
```

---

### Cross-Service Troubleshooting Workflow

**Scenario:** User reports bug via ADO work item

**Agent Workflow:**
```
1. Get ADO Work Item
   Tool: get-work-item (Azure DevOps)
   Extract: Title, description, repro steps

2. Find Related Code
   Tool: ghe-search-commits (GitHub Enterprise)
   Query: "#<workItemId>" or keywords from work item

3. Get Current Code
   Tool: ghe-get-file (GitHub Enterprise)
   Parameters: Latest release branch (auto-detected)

4. Check Deployed Plugin
   Tool: get-plugin-assembly-complete (PowerPlatform)
   Verify: Assembly version, steps, configuration

5. Get Plugin Logs
   Tool: get-plugin-trace-logs (PowerPlatform)
   Filter: Recent errors for affected entity

6. Analyze & Report
   Prompt: ghe-troubleshooting-guide
   Output: Root cause analysis, recommendations
```

**Example Agent Response:**
```markdown
I've investigated work item #1234. Here's what I found:

**Root Cause:** Not a bug - expected business logic ✅

The contact plugin only updates the account's "Last Contact Created" field when:
- Contact has an AccountId populated
- AccountId is not null or empty

**Evidence:**
1. Source code (release/9.0): ContactPlugin.cs line 45 has explicit null check
2. Deployed plugin: PluginCore v1.9.0.0 matches source code
3. Plugin logs: No errors in last 24 hours
4. Unit tests: ContactPluginTests.cs line 120 confirms this is intentional

**Recommendation:** Close work item as "By Design" or clarify business requirements
if ALL contacts should update the field (requires code change).
```

---

## Implementation Checklist

### Phase 1: Core Service (Week 1)
- [ ] Create `src/GitHubEnterpriseService.ts`
- [ ] Implement PAT authentication (PRIMARY - required)
- [ ] Implement GitHub App authentication (OPTIONAL - for advanced users)
- [ ] Add token caching and refresh logic
- [ ] Implement branch selection strategy (auto-detect latest release, handle typos)
- [ ] Implement response caching with configurable TTL
- [ ] Add `ghe-clear-cache` tool
- [ ] Add audit logging
- [ ] Error handling and sanitization

### Phase 2: Basic Tools (Week 1-2)
- [ ] `ghe-list-repos` - List configured repos
- [ ] `ghe-list-branches` - List branches
- [ ] `ghe-get-default-branch` - Auto-detect branch
- [ ] `ghe-get-file` - Get file content
- [ ] `ghe-search-code` - Search code
- [ ] `ghe-list-files` - List directory
- [ ] Add Zod schemas for all parameters

### Phase 3: Advanced Tools (Week 2)
- [ ] `ghe-get-commits` - Commit history
- [ ] `ghe-get-commit-details` - Commit details
- [ ] `ghe-search-commits` - Search commits
- [ ] `ghe-compare-branches` - Branch comparison
- [ ] `ghe-list-pull-requests` - PR listing
- [ ] `ghe-get-pull-request` - PR details

### Phase 4: Write Operations (Week 2)
- [ ] `ghe-create-branch` - Create branch (disabled by default)
- [ ] `ghe-update-file` - Update file (disabled by default)
- [ ] `ghe-create-file` - Create file (disabled by default)
- [ ] Add safety checks and validation
- [ ] Add enable flags (GHE_ENABLE_WRITE, GHE_ENABLE_CREATE)

### Phase 5: Prompts (Week 3)
- [ ] `ghe-repo-overview` - Repo overview
- [ ] `ghe-code-search-report` - Search results
- [ ] `ghe-branch-comparison-report` - Branch comparison
- [ ] `ghe-troubleshooting-guide` - Bug troubleshooting
- [ ] `ghe-deployment-report` - Deployment report
- [ ] Create formatter utilities in `src/utils/ghe-formatters.ts`

### Phase 6: Integration (Week 3)
- [ ] PowerPlatform integration:
  - [ ] `ghe-correlate-plugin-code` - Find source for plugin
  - [ ] Add plugin-to-code mapping logic
- [ ] Azure DevOps integration:
  - [ ] `ghe-find-work-item-code` - Find code for work item
  - [ ] Parse work item references from commits
- [ ] Create cross-service troubleshooting workflows

### Phase 7: Documentation Restructure & GHE Docs (Week 3-4)

#### **IMPORTANT: Documentation Restructure**

Due to 7 integrations and 140+ tools, we're restructuring documentation from single-file to per-integration approach:

**OLD Structure (deprecated):**
```
docs/
├── README.md           # Brief overview
├── CLAUDE.md           # Architecture
├── SETUP.md            # ⚠️ ALL integrations setup (too large ~5000 lines)
├── TOOLS.md            # ⚠️ ALL 140+ tools (too large ~10000 lines)
└── USAGE.md            # ⚠️ ALL usage examples (hard to navigate ~3000 lines)
```

**Problems with old structure:**
- ❌ Single 10,000-line TOOLS.md file is overwhelming
- ❌ Users must scroll through all integrations to find one they need
- ❌ Updates to one integration risk breaking docs for others
- ❌ Hard to search/navigate
- ❌ No clear separation between integrations

**NEW Structure:**
```
/                                       # Root directory
├── README.md                           # ✅ TLDR overview + all configs (STAYS IN ROOT)
├── CLAUDE.md                           # ✅ Architecture for Claude Code (STAYS IN ROOT)
│
└── docs/
    └── documentation/                  # ✅ Integration docs subfolder
        ├── POWERPLATFORM.md            # ✅ PowerPlatform: Overview, Setup, 70+ Tools, Prompts, Usage
        ├── AZURE_DEVOPS.md             # ✅ Azure DevOps: Overview, Setup, 10+ Tools, Prompts, Usage
        ├── FIGMA.md                    # ✅ Figma: Overview, Setup, 2 Tools, Usage
        ├── APPLICATION_INSIGHTS.md     # ✅ Application Insights: Overview, Setup, 10 Tools, 5 Prompts, Usage
        ├── LOG_ANALYTICS.md            # ✅ Log Analytics: Overview, Setup, 10 Tools, 5 Prompts, Usage
        ├── AZURE_SQL.md                # ✅ Azure SQL: Overview, Setup, 9 Tools, 3 Prompts, Usage
        └── GITHUB_ENTERPRISE.md        # ✅ GitHub Enterprise: Overview, Setup, 22 Tools, 5 Prompts, Usage (NEW)
```

**Why this structure:**
- ✅ README.md in root = Standard for GitHub (shows on repo homepage)
- ✅ CLAUDE.md in root = Easier for Claude Code to find
- ✅ Integration docs in docs/documentation/ = Organized, keeps root clean

**Benefits of new structure:**
- ✅ Self-contained integration docs (Setup + Tools + Usage in one place)
- ✅ Users only read docs for integrations they use
- ✅ Easy to add integration #8, #9, #10 without bloating existing docs
- ✅ Better SEO/search (integration-specific keywords)
- ✅ Parallel documentation updates (different people can work on different integrations)
- ✅ Easier maintenance (update one integration without touching others)

**Each integration doc contains:**
1. Overview (what it does, key use cases)
2. Setup (credentials, env vars, step-by-step)
3. Tools (complete list with parameters, examples)
4. Prompts (all prompts for this integration)
5. Usage Examples (real-world scenarios)
6. Troubleshooting (common issues, solutions)

**README.md becomes:**
- Project overview (2-3 paragraphs)
- Complete configuration example (all 7 integrations)
- Feature summary per integration (with tool counts)
- Links to individual integration docs
- Installation instructions

---

#### **Phase 7 Tasks:**

**Step 1: Create New Integration Docs (migrate existing content)**
- [x] Create `POWERPLATFORM.md` - Migrate PowerPlatform tools, setup, usage from SETUP.md/TOOLS.md/USAGE.md ✅ COMPLETED (3,169 lines)
- [x] Create `AZURE_DEVOPS.md` - Migrate ADO tools, setup, usage ✅ COMPLETED
- [x] Create `FIGMA.md` - Migrate Figma tools, setup, usage ✅ COMPLETED
- [x] Create `APPLICATION_INSIGHTS.md` - Migrate AppInsights tools, setup, usage ✅ COMPLETED
- [x] Create `LOG_ANALYTICS.md` - Migrate LogAnalytics tools, setup, usage ✅ COMPLETED
- [x] Create `AZURE_SQL.md` - Migrate SQL tools, setup, usage ✅ COMPLETED
- [x] Create `GITHUB_ENTERPRISE.md` - Document all 22 GHE tools and 5 prompts (NEW) ✅ COMPLETED (1,609 lines)

**Step 2: Update Core Docs**
- [x] Update `README.md`: ✅ COMPLETED
  - Add TLDR overview ✅
  - Add complete config example with all 7 integrations ✅
  - Add feature matrix/summary per integration ✅
  - Add links to individual integration docs ✅
  - Update tool counts (140+ tools across 7 integrations) ✅
- [x] Update `CLAUDE.md`: ✅ COMPLETED (already contains GHE architecture and integration patterns)
  - Add GitHub Enterprise architecture section ✅ Already present in CLAUDE.md
  - Add integration patterns (PowerPlatform + GHE + ADO) ✅ Already present in CLAUDE.md
  - Update tool/prompt counts ✅ Already updated

**Step 3: Deprecate Old Docs**
- [x] Archive `SETUP.md` → Moved to docs/archive/ ✅ COMPLETED
- [x] Archive `TOOLS.md` → Moved to docs/archive/ ✅ COMPLETED
- [x] Archive `USAGE.md` → Moved to docs/archive/ ✅ COMPLETED
- [x] Add deprecation notices to old docs pointing to new structure ✅ COMPLETED (docs/archive/README.md created)

**Step 4: Verify Documentation**
- [x] All 7 integrations documented ✅ COMPLETED
- [x] All 140+ tools documented ✅ COMPLETED
- [x] All prompts documented ✅ COMPLETED
- [x] Complete configuration examples ✅ COMPLETED
- [x] Cross-linking between docs ✅ COMPLETED (README.md links to all integration docs)
- [x] Table of contents in each integration doc ✅ COMPLETED

**Phase 7 Status: ✅ COMPLETE**
- All 7 per-integration documentation files created and published
- README.md updated with links to new documentation structure
- CLAUDE.md already contains required architecture sections
- Core deliverables achieved: Per-integration documentation provides self-contained setup, tools, prompts, usage examples, and troubleshooting
- Old monolithic docs (SETUP.md, TOOLS.md, USAGE.md) archived to docs/archive/ with deprecation notice

---

#### **Documentation Templates**

**README.md Structure (New):**
```markdown
# MCP Consultant Tools

AI-powered development assistance for Microsoft PowerPlatform, Azure DevOps, Figma, Azure Monitoring, and GitHub Enterprise.

## Overview

This MCP server provides 140+ tools across 7 integrations to help AI assistants troubleshoot bugs, analyze code, review deployments, and correlate issues across your entire development stack.

**Key Features:**
- 🔧 PowerPlatform/Dataverse (70+ tools) - Entity metadata, plugins, workflows, customizations
- 📋 Azure DevOps (10+ tools) - Work items, wikis, WIQL queries
- 🎨 Figma (2 tools) - Design data extraction
- 📊 Application Insights (10 tools) - Telemetry analysis, exception tracking
- 📈 Log Analytics (10 tools) - Azure Functions logs, troubleshooting
- 🗄️ Azure SQL (9 tools) - Database schema, read-only queries
- 💻 GitHub Enterprise (22 tools) - Source code, commits, branches

## Quick Start

### Installation
```bash
npm install -g mcp-consultant-tools
```

### Complete Configuration Example

```json
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["mcp-consultant-tools"],
      "env": {
        // PowerPlatform/Dataverse
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",

        // Azure DevOps
        "AZUREDEVOPS_ORGANIZATION": "your-org",
        "AZUREDEVOPS_PAT": "your-pat",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",

        // Figma
        "FIGMA_API_KEY": "your-figma-token",

        // Application Insights
        "APPINSIGHTS_TENANT_ID": "your-tenant-id",
        "APPINSIGHTS_CLIENT_ID": "your-client-id",
        "APPINSIGHTS_CLIENT_SECRET": "your-client-secret",
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod\",\"name\":\"Production\",\"appId\":\"xxx\",\"active\":true}]",

        // Log Analytics
        "LOGANALYTICS_RESOURCES": "[{\"id\":\"logs\",\"name\":\"App Logs\",\"workspaceId\":\"xxx\",\"active\":true}]",

        // Azure SQL Database
        "AZURE_SQL_SERVER": "yourserver.database.windows.net",
        "AZURE_SQL_DATABASE": "yourdatabase",
        "AZURE_SQL_USERNAME": "username",
        "AZURE_SQL_PASSWORD": "password",

        // GitHub Enterprise
        "GHE_URL": "https://github.yourcompany.com",
        "GHE_PAT": "ghp_your_token",
        "GHE_REPOS": "[{\"id\":\"crm\",\"owner\":\"org\",\"repo\":\"CRM\",\"active\":true}]"
      }
    }
  }
}
```

## Integrations

| Integration | Tools | Prompts | Documentation |
|-------------|-------|---------|---------------|
| PowerPlatform/Dataverse | 70+ | 10+ | [POWERPLATFORM.md](POWERPLATFORM.md) |
| Azure DevOps | 10+ | 4 | [AZURE_DEVOPS.md](AZURE_DEVOPS.md) |
| Figma | 2 | 0 | [FIGMA.md](FIGMA.md) |
| Application Insights | 10 | 5 | [APPLICATION_INSIGHTS.md](APPLICATION_INSIGHTS.md) |
| Log Analytics | 10 | 5 | [LOG_ANALYTICS.md](LOG_ANALYTICS.md) |
| Azure SQL Database | 9 | 3 | [AZURE_SQL.md](AZURE_SQL.md) |
| GitHub Enterprise | 22 | 5 | [GITHUB_ENTERPRISE.md](GITHUB_ENTERPRISE.md) |

**Total: 140+ tools, 30+ prompts**

## Use Cases

### Bug Troubleshooting (Cross-Service)
Investigate ADO work item → Find related commits in GitHub → Check deployed plugin in PowerPlatform → Analyze logs in Application Insights → Root cause analysis

### Deployment Analysis
Compare GitHub branches → Review changed files → Check affected plugins → Validate customizations → Generate deployment report

### Performance Investigation
Query Application Insights for slow requests → Analyze Azure Functions logs → Check SQL query performance → Correlate with code changes

## Getting Started

1. **Choose your integrations** - All integrations are optional
2. **Setup credentials** - See individual integration docs for setup
3. **Configure environment** - Add env vars to MCP client config
4. **Start using** - Tools are available immediately

## Documentation

- [PowerPlatform Integration](POWERPLATFORM.md) - Entities, plugins, workflows, customizations
- [Azure DevOps Integration](AZURE_DEVOPS.md) - Work items, wikis, boards
- [Figma Integration](FIGMA.md) - Design data extraction
- [Application Insights Integration](APPLICATION_INSIGHTS.md) - Telemetry and monitoring
- [Log Analytics Integration](LOG_ANALYTICS.md) - Azure Functions logs
- [Azure SQL Integration](AZURE_SQL.md) - Database exploration
- [GitHub Enterprise Integration](GITHUB_ENTERPRISE.md) - Source code and commits
- [Architecture (CLAUDE.md)](CLAUDE.md) - Technical architecture for AI agents

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT
```

---

**Integration Doc Template (e.g., GITHUB_ENTERPRISE.md):**
```markdown
# GitHub Enterprise Integration

Access source code, commits, branches, and pull requests from GitHub Enterprise Cloud.

## Table of Contents
- [Overview](#overview)
- [Setup](#setup)
- [Tools](#tools)
- [Prompts](#prompts)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)

## Overview

The GitHub Enterprise integration provides 22 tools to:
- 📁 Browse repositories and files
- 🔍 Search code across repos
- 🌿 Compare branches and review changes
- 📝 Analyze commits and pull requests
- 🔗 Correlate with PowerPlatform plugins and ADO work items

**Primary Use Case:** Investigate bugs by finding source code related to ADO work items, checking deployed plugins, and analyzing code changes.

## Setup

### Prerequisites
- GitHub Enterprise Cloud account
- Access to repositories you want to query
- Ability to create Personal Access Token (PAT)

### Authentication Options

#### Option 1: Personal Access Token (PAT) - **RECOMMENDED**

1. Navigate to GitHub Enterprise: `https://github.yourcompany.com/settings/tokens`
2. Click "Generate new token (classic)"
3. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `read:org` (Read organization data) - optional
4. Click "Generate token"
5. Copy token (starts with `ghp_`)

#### Option 2: GitHub App - **ADVANCED** (Optional)

For organizations requiring GitHub App authentication, see [GitHub App Setup Guide](#github-app-setup).

### Environment Variables

```bash
# Required
GHE_URL=https://github.yourcompany.com
GHE_PAT=ghp_your_personal_access_token_here

# Repository Configuration (JSON array)
GHE_REPOS=[
  {
    "id": "crm",
    "owner": "yourorg",
    "repo": "CRM",
    "defaultBranch": "release/9.0",
    "active": true
  },
  {
    "id": "api",
    "owner": "yourorg",
    "repo": "API",
    "defaultBranch": "",
    "active": true
  }
]

# Optional: Caching
GHE_ENABLE_CACHE=true
GHE_CACHE_TTL=300  # 5 minutes

# Optional: Write Operations (disabled by default)
GHE_ENABLE_WRITE=false
GHE_ENABLE_CREATE=false

# Optional: Limits
GHE_MAX_FILE_SIZE=1048576  # 1MB
GHE_MAX_SEARCH_RESULTS=100
```

### MCP Client Configuration

Add to your MCP client config (e.g., Claude Desktop, Cline):

```json
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["mcp-consultant-tools"],
      "env": {
        "GHE_URL": "https://github.yourcompany.com",
        "GHE_PAT": "ghp_your_token",
        "GHE_REPOS": "[{\"id\":\"crm\",\"owner\":\"org\",\"repo\":\"CRM\",\"active\":true}]"
      }
    }
  }
}
```

## Tools

### Repository & Branch Management (6 tools)

#### ghe-list-repos
List all configured repositories.

**Parameters:** None

**Returns:**
```json
{
  "repos": [
    {
      "id": "crm",
      "owner": "yourorg",
      "repo": "CRM",
      "defaultBranch": "release/9.0",
      "active": true,
      "url": "https://github.yourcompany.com/yourorg/CRM"
    }
  ]
}
```

[... continue with all 22 tools ...]

## Prompts

### ghe-troubleshooting-guide
Comprehensive bug troubleshooting with ADO + PowerPlatform + GHE context.

**Parameters:**
- `workItemId` (optional): Azure DevOps work item ID
- `entity` (optional): PowerPlatform entity
- `pluginName` (optional): Plugin name
- `searchQuery` (optional): Code search query

**Example Usage:**
```
User: "Investigate work item #1234"
Agent: [Uses ghe-troubleshooting-guide prompt]
```

[... continue with all 5 prompts ...]

## Usage Examples

### Example 1: Find Source Code for Plugin
```typescript
// Get deployed plugin info
const assembly = await powerPlatform.getPluginAssemblyComplete("PluginCore");

// Search GitHub for plugin class
const searchResults = await ghe.searchCode({
  query: "class ContactCreatePlugin",
  extension: "cs",
  repoId: "crm"
});

// Get file content
const file = await ghe.getFile({
  repoId: "crm",
  path: searchResults.items[0].path,
  branch: "release/9.0"  // auto-detected
});
```

### Example 2: Investigate ADO Work Item
```
User: "Check work item #1234 - account field not updating"

Agent workflow:
1. Get work item from ADO
2. Search GHE commits for "#1234"
3. Get changed files from commits
4. Get current code from latest release branch
5. Check deployed plugin in PowerPlatform
6. Analyze and report findings
```

[... more examples ...]

## Troubleshooting

### Authentication Errors

**Error:** `401 Unauthorized`

**Solution:**
1. Verify PAT is valid and not expired
2. Check PAT has `repo` scope
3. Verify you have access to the repositories

### Branch Not Found

**Error:** `Branch "release/9.0" not found`

**Solution:**
1. List all branches: `ghe-list-branches`
2. Verify branch name (case-sensitive)
3. Update `defaultBranch` in config or specify explicitly

### Cache Issues

**Issue:** Seeing old file content after pushing updates

**Solution:**
```
Use ghe-clear-cache tool to clear cached responses
```

[... more troubleshooting ...]

## Advanced Topics

### GitHub App Setup
[Details for organizations requiring GitHub App...]

### Custom Branch Strategies
[How to configure custom branch detection...]

### Performance Optimization
[Caching strategies, rate limits...]
```

### Phase 8: Testing (Week 4)
- [ ] Test PAT authentication
- [ ] Test GitHub App authentication (optional)
- [ ] Test branch auto-detection logic (including typo handling)
- [ ] Test cache implementation and clearing
- [ ] Test all read operations
- [ ] Test write operations (with flags enabled)
- [ ] Test PowerPlatform integration
- [ ] Test Azure DevOps integration
- [ ] Test error handling and sanitization
- [ ] Test with 3-5 configured repositories
- [ ] Verify configurable file size limits work correctly

### Phase 9: Release (Week 4)
- [ ] Create release branch (release/10.0)
- [ ] Update package.json version
- [ ] Run full test suite
- [ ] Verify all documentation complete
- [ ] Merge to main
- [ ] Publish to npm
- [ ] Create GitHub release with notes

---

## Security Considerations

### Credential Management
- ✅ Never log PAT or GitHub App private keys
- ✅ Store tokens in memory only (never persist)
- ✅ Clear tokens on service disposal
- ✅ Support `.env` files for local development
- ✅ Sanitize error messages (remove tokens, URLs)

### Query Safety
- ✅ Read-only by default
- ✅ Write operations require explicit enable flags
- ✅ Audit logging for all operations
- ✅ Token expiry and refresh (GitHub App tokens: 1 hour)

### RBAC and Permissions
For PAT authentication:
- Requires `repo` scope (full control of private repositories)
- Optionally `read:org` (read organization data)

For GitHub App authentication:
- Repository permissions: Read or Write (configurable)
- Organization permissions: Read (optional)
- Installed on specific repositories only

---

## Error Handling

### Authentication Errors (401/403)
- Clear messages about missing credentials
- Permission requirements (repo scope, app installation)
- Configuration validation

### Repository Errors (404)
- Repository not found with available repos list
- Inactive repository detection with activation instructions
- Configuration validation

### Branch Errors
- Branch not found with available branches list
- Auto-detection failure with fallback suggestions
- Manual branch selection guidance

### Rate Limiting (403 with rate limit headers)
- Retry-after header parsing
- Clear messages about current limits
- Recommendations for rate limit increase

### File Errors
- File not found with path suggestions
- File too large (> 1MB default)
- Binary file detection (cannot decode)

---

## Dependencies

### New npm Packages

```bash
npm install @octokit/rest        # GitHub REST API client
npm install @octokit/auth-app    # GitHub App authentication
npm install jsonwebtoken          # JWT for GitHub App auth
```

### Existing Packages (Reused)
- `axios` - HTTP client (fallback if Octokit doesn't work)
- `dotenv` - Environment configuration
- `zod` - Parameter validation

---

## Configuration Example

### Complete `.env` Example

```bash
# GitHub Enterprise Cloud
GHE_URL=https://smartimpact.ghe.com
GHE_API_VERSION=2022-11-28

# Authentication: Personal Access Token
GHE_AUTH_METHOD=pat
GHE_PAT=ghp_your_personal_access_token_here

# Alternative: GitHub App (comment out PAT)
# GHE_AUTH_METHOD=github-app
# GHE_APP_ID=123456
# GHE_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE..."
# GHE_APP_INSTALLATION_ID=12345678

# Repository Configuration
GHE_REPOS=[
  {
    "id": "plugin-core",
    "owner": "smartimpact",
    "repo": "PluginCore",
    "defaultBranch": "release/9.0",
    "active": true
  },
  {
    "id": "portal-main",
    "owner": "smartimpact",
    "repo": "PortalMain",
    "defaultBranch": "",
    "active": true
  },
  {
    "id": "azure-functions",
    "owner": "smartimpact",
    "repo": "AzureFunctions",
    "defaultBranch": "release/5.0",
    "active": false
  }
]

# Write Operations (DISABLED by default)
GHE_ENABLE_WRITE=false
GHE_ENABLE_CREATE=false

# Optional: Caching
GHE_ENABLE_CACHE=true
GHE_CACHE_TTL=300  # 5 minutes

# Optional: Limits (configurable based on your file types)
GHE_MAX_FILE_SIZE=1048576  # 1MB - increase if needed for your use case
GHE_MAX_SEARCH_RESULTS=100
```

---

## API Endpoints

### GitHub Enterprise Cloud REST API v3

**Base URL:** `https://smartimpact.ghe.com/api/v3`

**Authentication Header (PAT):**
```
Authorization: token <PAT>
Accept: application/vnd.github.v3+json
```

**Authentication Header (GitHub App):**
```
Authorization: Bearer <JWT or Installation Token>
Accept: application/vnd.github.v3+json
```

**Key Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/repos/{owner}/{repo}` | GET | Get repository |
| `/repos/{owner}/{repo}/branches` | GET | List branches |
| `/repos/{owner}/{repo}/branches/{branch}` | GET | Get branch |
| `/repos/{owner}/{repo}/contents/{path}` | GET | Get file |
| `/repos/{owner}/{repo}/commits` | GET | List commits |
| `/repos/{owner}/{repo}/commits/{sha}` | GET | Get commit |
| `/repos/{owner}/{repo}/compare/{base}...{head}` | GET | Compare branches |
| `/repos/{owner}/{repo}/pulls` | GET | List PRs |
| `/search/code` | GET | Search code |
| `/search/commits` | GET | Search commits |
| `/repos/{owner}/{repo}/git/trees/{sha}` | GET | Get tree |

---

## File Type Support

### Syntax Highlighting in Markdown

The formatters will include proper language identifiers for code blocks:

- **C#:** ```csharp
- **SQL:** ```sql
- **JavaScript:** ```javascript
- **TypeScript:** ```typescript
- **JSON:** ```json
- **XML:** ```xml
- **PowerShell:** ```powershell

### File Extension Mapping

```typescript
const FILE_EXTENSIONS = {
  '.cs': 'csharp',
  '.sql': 'sql',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.json': 'json',
  '.xml': 'xml',
  '.ps1': 'powershell',
  '.md': 'markdown'
};
```

---

## Success Metrics

### Quantitative Metrics
- ✅ 22 tools implemented (including cache management)
- ✅ 5 prompts implemented
- ✅ PAT authentication working (GitHub App optional)
- ✅ Auto-detect latest release branch (95%+ accuracy, typo-tolerant)
- ✅ Caching with configurable TTL and clearing
- ✅ Integration with PowerPlatform (plugin correlation)
- ✅ Integration with Azure DevOps (work item correlation)
- ✅ All documentation updated (5 files)

### Qualitative Metrics
- ✅ User can troubleshoot bugs by correlating ADO work items with source code
- ✅ User can find source code for deployed plugins
- ✅ User can compare branches for deployment readiness
- ✅ User can search code across all repos
- ✅ Agent can auto-detect correct branch without user input

---

## Timeline

**Total Estimated Time:** 3-4 weeks

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1: Core Service | 3 days | GitHubEnterpriseService.ts, auth, branch logic |
| Phase 2: Basic Tools | 3 days | 6 read tools, Zod schemas |
| Phase 3: Advanced Tools | 3 days | 6 commit/PR tools |
| Phase 4: Write Operations | 2 days | 3 write tools, safety checks |
| Phase 5: Prompts | 3 days | 5 prompts, formatters |
| Phase 6: Integration | 3 days | PowerPlatform + ADO integration |
| Phase 7: Documentation | 3 days | 5 documentation files |
| Phase 8: Testing | 2 days | Full test suite |
| Phase 9: Release | 1 day | Release branch, npm publish |

**Start Date:** TBD
**Target Release:** Release 10.0

---

## Questions for User

### ✅ Answered Questions

1. **GitHub App Registration:** ✅ RESOLVED
   - User does not have GitHub App registered and lacks permissions to create one
   - User can create PAT themselves for testing
   - **Solution:** Focus on PAT authentication as primary method, include GitHub App setup as optional/advanced

2. **Repository Access:** ✅ RESOLVED
   - Expected: 3-5 repositories (crm, api, portal + client-specific)
   - **Solution:** No special performance optimizations needed for this scale

3. **Branch Naming:** ✅ RESOLVED
   - Standard: `release/X.Y` format
   - May have typos (humans create these manually)
   - User wants to investigate specific branches sometimes
   - **Solution:** Auto-detect highest release version, handle typos gracefully, always show alternatives, allow user to specify branch explicitly

4. **File Size Limits:** ✅ RESOLVED
   - User is unsure of requirements
   - **Solution:** Make `GHE_MAX_FILE_SIZE` configurable via environment variable (default 1MB)

5. **Rate Limiting:** ✅ RESOLVED
   - User agrees caching makes sense
   - User needs ability to clear cache mid-session (when developer pushes updates)
   - **Solution:** Implement caching with configurable TTL and `ghe-clear-cache` tool

6. **Testing:** ✅ RESOLVED
   - User already has all repos cloned locally
   - **Solution:** No test files needed

### ⚠️ Outstanding Questions

**None** - All questions have been answered. Implementation plan is complete and ready to proceed.

---

## Next Steps

1. ✅ **Review plan** - User has reviewed and provided answers to all questions
2. ✅ **Questions answered** - All clarifications received and incorporated
3. ⏭️ **Approve implementation** - Awaiting user approval to begin Phase 1
4. ⏭️ **Start Phase 1** - Begin implementation of core service with PAT auth and caching
5. ⏭️ **Iterative development** - Implement in phases and get user feedback

---

**Document Version:** 4.0
**Created:** 2025-01-09
**Last Updated:** 2025-11-09
**Status:** Phase 7 Complete - Documentation Restructure Implemented ✅

**Implementation Progress:**
- ✅ Phase 1: Core Service (COMPLETE)
- ✅ Phase 2: Basic Tools (COMPLETE)
- ✅ Phase 3: Advanced Tools (COMPLETE)
- ✅ Phase 4: Write Operations (COMPLETE)
- ✅ Phase 5: Prompts (COMPLETE)
- ✅ Phase 6: Integration (COMPLETE)
- ✅ **Phase 7: Documentation Restructure & GHE Docs (COMPLETE)** - All 7 per-integration docs created
- ⏭️ Phase 8: Testing (READY TO START)
- ⏭️ Phase 9: Release (PENDING)

**Key Changes in v4.0:**
- ✅ **Phase 7 COMPLETED:** All documentation restructure tasks complete
  - Created 7 per-integration documentation files in docs/documentation/
  - Updated README.md with links to new documentation structure
  - POWERPLATFORM.md (3,169 lines), GITHUB_ENTERPRISE.md (1,609 lines), and 5 others
  - Each integration doc contains: Overview, Setup, Tools, Prompts, Usage, Troubleshooting
  - Verified all 140+ tools and 28+ prompts documented
  - Archived old monolithic docs (SETUP.md, TOOLS.md, USAGE.md) to docs/archive/ with deprecation notice

**Key Changes in v3.0:**
- ✅ **MAJOR:** Documentation restructure from single-file to per-integration approach
  - Old: `SETUP.md`, `TOOLS.md`, `USAGE.md` (monolithic, hard to navigate)
  - New: `POWERPLATFORM.md`, `AZURE_DEVOPS.md`, `FIGMA.md`, etc. (one per integration)
  - README.md becomes TLDR overview + all configs example
  - Each integration doc contains: Overview, Setup, Tools, Prompts, Usage, Troubleshooting
  - Better scalability, easier maintenance, clearer navigation

**Key Changes in v2.0:**
- ✅ Prioritized PAT authentication (GitHub App is optional/advanced)
- ✅ Added caching with configurable TTL and cache clearing tool (22 tools total)
- ✅ Enhanced branch auto-detection to handle typos gracefully
- ✅ Made file size limits configurable
- ✅ Noted expected repository scale (3-5 repos)
- ✅ Removed test file requirements (user has local repos)
- ✅ All user questions answered and incorporated

**Documentation Restructure Benefits:**
1. ✅ **Independent browsing** - Users only read docs for integrations they use
2. ✅ **Easier maintenance** - Update one integration without touching others
3. ✅ **Better organization** - Each integration is self-contained (Setup + Tools + Usage in one place)
4. ✅ **Clearer navigation** - Flat structure, easy to find
5. ✅ **Scalable** - Adding integration #8, #9, #10 doesn't bloat existing docs
6. ✅ **Better for search** - Integration-specific keywords in dedicated files
