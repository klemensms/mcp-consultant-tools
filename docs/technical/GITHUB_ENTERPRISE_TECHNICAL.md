# GitHub Enterprise Cloud Integration - Technical Documentation

> **Cross-References:**
> - User Guide: [docs/documentation/GITHUB_ENTERPRISE.md](../documentation/GITHUB_ENTERPRISE.md)
> - Main Documentation: [CLAUDE.md](../../CLAUDE.md)
> - Service Implementation: [src/GitHubEnterpriseService.ts](../../src/GitHubEnterpriseService.ts)
> - Formatter Utilities: [src/utils/ghe-formatters.ts](../../src/utils/ghe-formatters.ts)

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Available Tools (22 total)](#available-tools-22-total)
- [Available Prompts (5 total)](#available-prompts-5-total)
- [Service Implementation](#service-implementation)
- [Token Management](#token-management)
- [Branch Auto-Detection with Typo Handling](#branch-auto-detection-with-typo-handling)
- [Caching Strategy](#caching-strategy)
- [Formatters](#formatters)
- [Use Cases](#use-cases)
- [Error Handling](#error-handling)
- [Security Considerations](#security-considerations)
- [Integration Patterns](#integration-patterns)

## Overview

The GitHub Enterprise Cloud integration enables AI-assisted bug troubleshooting by correlating source code in GitHub with deployed PowerPlatform plugins and Azure DevOps work items. It provides comprehensive access to repositories, branches, commits, pull requests, and code search.

**Primary Use Case:** Investigate bugs by finding source code related to ADO work items, analyzing recent changes, and correlating with deployed plugins.

## Architecture

The GitHub Enterprise integration provides access to GitHub Enterprise Cloud repositories through the GitHub REST API v3.

**Service Class:** `GitHubEnterpriseService` ([src/GitHubEnterpriseService.ts](../../src/GitHubEnterpriseService.ts))
- Manages authentication (PAT or GitHub App)
- Executes API requests via Octokit client
- Implements branch auto-detection with typo handling
- Provides response caching with configurable TTL
- Supports multiple repositories with active/inactive flags

**Authentication Methods:**
1. **Personal Access Token (PAT)** - Recommended for individual use
   - Simpler configuration
   - Single token for all repositories
   - Scopes: `repo` (required), `read:org` (optional)
   - No expiration (unless revoked)

2. **GitHub App** - Advanced for organization-wide deployments
   - Higher API rate limits
   - Installation-level access control
   - Automatic token refresh (1-hour expiry)
   - Requires app registration and private key

**Configuration:**
Supports multi-repository configuration with JSON array:
```json
GHE_REPOS=[{
  "id": "plugin-core",
  "owner": "myorg",
  "repo": "PluginCore",
  "defaultBranch": "release/9.0",
  "active": true,
  "description": "Core plugins"
}]
```

## Available Tools (22 total)

**Repository Management:**
1. **`ghe-list-repos`** - List configured repositories with status
2. **`ghe-clear-cache`** - Clear cached responses (pattern/repo-based)

**Branch Operations:**
3. **`ghe-list-branches`** - List branches with protection status filter
4. **`ghe-get-default-branch`** - Auto-detect branch with typo handling
5. **`ghe-get-branch-details`** - Branch metadata and commit info
6. **`ghe-compare-branches`** - Compare branches with file changes
7. **`ghe-create-branch`** - Create branch (requires `GHE_ENABLE_CREATE=true`)

**File Operations:**
8. **`ghe-get-file`** - Get file content with auto-branch detection
9. **`ghe-list-files`** - List directory contents
10. **`ghe-get-directory-structure`** - Recursive directory tree
11. **`ghe-get-file-history`** - File commit history
12. **`ghe-update-file`** - Update file (requires `GHE_ENABLE_WRITE=true`)
13. **`ghe-create-file`** - Create file (requires `GHE_ENABLE_CREATE=true`)

**Commit Operations:**
14. **`ghe-get-commits`** - Commit history with filters (author, path, date range)
15. **`ghe-get-commit-details`** - Detailed commit info with file changes
16. **`ghe-get-commit-diff`** - Unified diff format for commit
17. **`ghe-search-commits`** - Search by message/hash (supports #1234 work item refs)

**Pull Request Operations:**
18. **`ghe-list-pull-requests`** - List PRs with state/branch filters
19. **`ghe-get-pull-request`** - PR details with metadata
20. **`ghe-get-pr-files`** - Files changed in PR

**Search Operations:**
21. **`ghe-search-code`** - Search code across repos with path/extension filters
22. **`ghe-search-repos`** - Search repositories by name/description

## Available Prompts (5 total)

1. **`ghe-repo-overview`** - Repository overview with branch analysis and recent commits
2. **`ghe-code-search-report`** - Formatted code search results with relevance scoring
3. **`ghe-branch-comparison-report`** - Branch comparison with deployment checklist
4. **`ghe-troubleshooting-guide`** - Bug troubleshooting with cross-service correlation
5. **`ghe-deployment-report`** - Deployment-ready report with rollback plan

## Service Implementation

**Core Architecture:**
```typescript
export class GitHubEnterpriseService {
  private config: GitHubEnterpriseConfig;
  private octokit: Octokit | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;
  private cache: Map<string, { data: any; expires: number }> = new Map();

  // Authentication
  private async initializeOctokit(): Promise<void>
  private async getAccessToken(): Promise<string>

  // Caching
  private getCacheKey(method, repo, resource, params?): string
  private getCached<T>(key: string): T | null
  private setCached(key: string, data: any): void
  clearCache(pattern?: string, repoId?: string): number

  // Core methods
  async getDefaultBranch(repoId, userSpecified?): Promise<BranchSelection>
  async listBranches(repoId, protectedOnly?): Promise<any[]>
  async getFile(repoId, path, branch?): Promise<any>
  async searchCode(query, repoId?, path?, extension?): Promise<any>
  async getCommits(repoId, branch?, since?, until?, author?, path?, limit?): Promise<any[]>
  async compareBranches(repoId, base, head): Promise<any>
  // ... 15 more methods
}
```

## Token Management

- **PAT**: Direct token usage (no expiration logic)
- **GitHub App**: Token caching with 5-minute buffer before 1-hour expiry
- **Automatic token refresh** on expiration

## Branch Auto-Detection with Typo Handling

One of the key features is intelligent branch detection:

**Algorithm:**
1. **User-specified branch** (highest priority) - Use if provided
2. **Configured default** - Use `defaultBranch` from repo config
3. **Auto-detect release branch** - Find highest version `release/X.Y` branch
   - Case-insensitive matching (`Release/`, `RELEASE/`, `release/`)
   - Version parsing and comparison (9.0 > 8.0)
   - Graceful fallback if no release branches
4. **Repository default** - Query GitHub API for default branch
5. **Fallback to main/master** - If all else fails

**Example:**
```typescript
const branchInfo = await service.getDefaultBranch('plugin-core', 'release/9.0');
// Returns:
{
  branch: 'release/9.0',
  reason: 'User-specified branch',
  confidence: 'high',
  alternatives: ['release/8.0', 'main']
}
```

**Typo Handling:**
If user specifies `relase/9.0` (typo), the service:
1. Attempts exact match (fails)
2. Tries case-insensitive match
3. Suggests similar branch names
4. Falls back to auto-detection
5. Returns selected branch with `confidence: 'medium'`

## Caching Strategy

**Response Caching:**
```typescript
// Cache key format: {method}:{owner}/{repo}:{resource}:{params}
"GET:myorg/PluginCore:branches:{}"
"GET:myorg/PluginCore:file:src/Plugins/ContactPlugin.cs"
```

**Cache Configuration:**
- `GHE_ENABLE_CACHE=true` - Enable/disable caching
- `GHE_CACHE_TTL=300` - Time-to-live in seconds (default: 5 minutes)

**Cache Clearing:**
```typescript
// Clear all cache
await service.clearCache();

// Clear cache for specific repo
await service.clearCache({ repoId: 'plugin-core' });

// Clear cache for specific file pattern
await service.clearCache({ pattern: 'ContactPlugin.cs' });
```

**Developer Workflow:**
1. Make code changes and push to GitHub
2. Clear cache: `ghe-clear-cache` tool
3. Query updated code: `ghe-get-file` or `ghe-search-code`

## Formatters

**File:** [src/utils/ghe-formatters.ts](../../src/utils/ghe-formatters.ts)

Markdown formatters transform GitHub API responses:

- `formatBranchListAsMarkdown()` - Branch table with commit info
- `formatCommitHistoryAsMarkdown()` - Commit timeline
- `formatCodeSearchResultsAsMarkdown()` - Search results with relevance
- `formatPullRequestsAsMarkdown()` - PR table with state icons
- `formatFileTreeAsMarkdown()` - Directory tree visualization
- `formatDirectoryContentsAsMarkdown()` - File listing table
- `analyzeBranchComparison()` - Extract insights from branch diff
- `generateDeploymentChecklist()` - Auto-generate deployment tasks
- `formatCommitDetailsAsMarkdown()` - Commit details with file table
- `formatPullRequestDetailsAsMarkdown()` - PR details with stats
- `formatRepositoryOverviewAsMarkdown()` - Comprehensive repo report
- `sanitizeErrorMessage()` - Remove sensitive tokens from errors

## Use Cases

**Bug Troubleshooting (Cross-Service):**
1. User reports bug via ADO work item #1234
2. Query ADO: `get-work-item` → Get bug description
3. Search commits: `ghe-search-commits` with "AB#1234" → Find related commits
4. Get commit details: `ghe-get-commit-details` → See code changes
5. Get current code: `ghe-get-file` → Verify current implementation
6. Check deployed plugin: `get-plugin-assembly-complete` → Verify deployment
7. Analyze logs: `appinsights-get-exceptions` → Check for runtime errors
8. Generate report: `ghe-troubleshooting-guide` prompt

**Deployment Analysis:**
1. Compare branches: `ghe-compare-branches` (release/9.0 vs main)
2. Review file changes: Analyze modified plugins
3. Generate checklist: `ghe-deployment-report` prompt
4. Verify build: Check plugin DLLs in artifacts
5. Deploy to PowerPlatform: `update-plugin-assembly`
6. Merge to main: `git merge` after successful deployment

**Code Review Workflow:**
1. List PRs: `ghe-list-pull-requests` with state=open
2. Get PR details: `ghe-get-pull-request`
3. Get PR files: `ghe-get-pr-files` → See changes
4. Review commits: `ghe-get-commits` in PR branch
5. Generate report: `ghe-branch-comparison-report` prompt

## Error Handling

The service implements comprehensive error handling:

**Authentication Errors (401/403):**
- Clear messages about missing/invalid credentials
- Token expiration detection with refresh retry
- Permission requirements (repo scope)

**Rate Limiting (429):**
- Retry-after header parsing
- Clear messages about current limits
- Recommendations for auth method upgrade (PAT → GitHub App)

**Branch Errors:**
- Branch not found with similar suggestions
- Default branch auto-detection fallback
- Typo-tolerant branch matching

**File Errors:**
- File not found with directory listing
- File too large (exceeds `GHE_MAX_FILE_SIZE`)
- Binary file detection

**Search Errors:**
- Empty results with query suggestions
- Invalid query syntax with examples
- Search scope too broad warnings

## Security Considerations

**Credential Management:**
- Never log tokens or credentials
- Store tokens in memory only (never persist)
- Clear tokens on service disposal
- Support for `.env` files for local development

**Write Operations Safety:**
- Write operations disabled by default
- Require explicit environment flags:
  - `GHE_ENABLE_WRITE=true` for updates
  - `GHE_ENABLE_CREATE=true` for creates
- No delete operations (too dangerous)
- Commit messages include user context

**Repository Access:**
- Only configured repositories accessible
- Active/inactive toggle for quick access control
- Repository-level permissions enforced by GitHub

**Token Sanitization:**
- Sanitize error messages (remove `ghp_*` tokens)
- Remove sensitive data from logs
- Truncate long responses automatically

## Integration Patterns

**PowerPlatform Correlation:**
```typescript
// Find plugin source code
const plugin = await getPluginAssemblyComplete('PluginCore');
const sourceFile = await gheService.getFile('plugin-core', 'src/Plugins/ContactPlugin.cs');
// Compare deployed vs source
```

**Azure DevOps Correlation:**
```typescript
// Find work item code changes
const workItem = await getWorkItem('Project', 1234);
const commits = await gheService.searchCommits('plugin-core', 'AB#1234');
// Trace work item to code changes
```

**Application Insights Correlation:**
```typescript
// Investigate exception
const exceptions = await appInsightsService.getRecentExceptions('prod-api');
const code = await gheService.searchCode(exceptions[0].type, 'plugin-core');
// Find source of exception
```
