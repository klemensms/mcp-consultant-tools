# GitHub Enterprise - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/GITHUB_ENTERPRISE.md -->

<overview>

The GitHub Enterprise integration enables repository access, branch management, PR workflows, and code search via the GitHub REST API v3. It is designed for cross-service bug investigation — correlating source code with ADO work items, PowerPlatform plugin deployments, and Application Insights exceptions.

**Primary use case:** Investigate bugs by finding source code related to ADO work items, analyzing recent changes, and correlating with deployed plugins.

**Package:** `@mcp-consultant-tools/github-enterprise`
**Binaries:** MCP: `mcp-ghe` | CLI: `mcp-ghe-cli`
**Tool count:** 22–37 tools depending on feature flags; 5 prompts (always available)

</overview>

<architecture>

<service-layers>

**Entry point:** `packages/github-enterprise/src/index.ts`

**Service classes (in `services/`):**
- `GitHubEnterpriseService` (`base-service.ts`) — Authentication, HTTP requests, caching, repository registry
- `RepoService` (`repo-service.ts`) — Branches, files, commits, directory structure, code search
- `PrService` (`pr-service.ts`) — Pull request read and write operations

**Tool registrations (in `tools/`):**
- `registerRepoTools(server, ctx)` — All repo, branch, file, commit, and search tools
- `registerPrTools(server, ctx)` — All PR read and conditional write tools

**Prompts (in `prompts/`):**
- `registerGhePrompts(server, ctx)` — 5 structured output prompts

**ServiceContext (`types.ts`):**
```typescript
export interface ServiceContext {
  readonly repo: RepoService;
  readonly pr: PrService;
}
```

Both services are lazy-initialized: `RepoService` and `PrService` receive the `GitHubEnterpriseService` base instance in their constructors.

</service-layers>

<authentication>

<auth-method name="pat" label="Personal Access Token (recommended)">

- Set `GHE_TOKEN` to a GitHub PAT
- Required scopes: `repo` (for private repositories); `read:org` (optional, for org-level operations)
- Tokens do not expire unless revoked
- Used directly as the `Authorization: token {GHE_TOKEN}` header on every request
- No token caching needed (stateless)

</auth-method>

<auth-method name="github-app" label="GitHub App (advanced)">

- Higher API rate limits than PAT
- Installation-level access control
- Tokens expire after 1 hour; the service caches tokens with a 5-minute safety buffer (`tokenExpirationTime = currentTime + 55 * 60 * 1000`)
- Requires: `appId`, `appPrivateKey`, `appInstallationId` (not configurable via env in the current implementation — PAT is the only supported auth method via env vars)

</auth-method>

**Current env-var implementation:** Only PAT (`GHE_TOKEN`) is wired in `index.ts`. The `GitHubEnterpriseConfig` type supports `authMethod: 'pat' | 'github-app'`, but `index.ts` always sets `authMethod: 'pat'`.

</authentication>

<repository-config>

`GHE_REPOS` must be a JSON array. Each entry:

```json
[
  {
    "id": "plugin-core",
    "owner": "myorg",
    "repo": "PluginCore",
    "defaultBranch": "release/9.0",
    "active": true,
    "description": "Core plugin library"
  }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Short identifier used in all tool calls as `repoId` |
| `owner` | Yes | GitHub organization or username |
| `repo` | Yes | Repository name |
| `active` | Yes | Set to `false` to temporarily disable without removing |
| `defaultBranch` | No | Skips auto-detection if set |
| `description` | No | Human-readable label shown in `ghe-list-repos` |

`getRepoById(repoId)` throws if the repo is not found or has `active: false`.

</repository-config>

<environment-variables>

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GHE_TOKEN` | Yes | — | Personal access token |
| `GHE_REPOS` | Yes | — | JSON array of repo configs |
| `GHE_BASE_URL` | No | `https://github.com` | GitHub instance URL; set to your GHE Server URL for self-hosted |
| `GHE_API_VERSION` | No | `2022-11-28` | GitHub REST API version header |
| `GHE_ENABLE_CACHE` | No | `true` | Enable in-memory response caching |
| `GHE_CACHE_TTL` | No | `300` | Cache TTL in seconds |
| `GHE_MAX_FILE_SIZE` | No | `1048576` | Max file size in bytes (1 MB) |
| `GHE_MAX_SEARCH_RESULTS` | No | `100` | Max search results per query |
| `GHE_ENABLE_WRITE` | No | `false` | Enable `ghe-update-file` |
| `GHE_ENABLE_CREATE` | No | `false` | Enable `ghe-create-branch`, `ghe-create-file`, `ghe-create-pull-request` |
| `GHE_ENABLE_PR_WRITE` | No | `false` | Enable all 11 PR write tools |

**GHE_BASE_URL for self-hosted:** Set to `https://github.yourcompany.com`. The API URL is constructed as `{GHE_BASE_URL}/api/v3`.

</environment-variables>

</architecture>

<tool-reference>

<tool-counts>

Tool availability depends on feature flags:

| Condition | Tools enabled |
|-----------|--------------|
| Always | 22 base tools + 3 PR read tools = **25** |
| `GHE_ENABLE_PR_WRITE=true` | + 11 PR write tools = **36** |
| `GHE_ENABLE_CREATE=true` | + 1 create-PR tool = **37** (or 26 without PR write) |

</tool-counts>

<tool-group name="repository-management">

### Repository Management

**`ghe-list-repos`**
Lists all configured repositories (active and inactive). No parameters. Returns repo metadata including constructed GitHub URL.

**`ghe-clear-cache`**
Clears in-memory API response cache. Use after pushing code changes before querying updated content.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | string (optional) | Clear only entries matching this substring (e.g., `ContactPlugin.cs`) |
| `repoId` | string (optional) | Scope clearing to a specific repository |

Returns count of cleared cache entries.

</tool-group>

<tool-group name="branch-operations">

### Branch Operations

**`ghe-list-branches`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID from configuration |
| `protectedOnly` | boolean (optional) | `true` = protected branches only; `false` = unprotected only; omit = all |

**`ghe-get-default-branch`**
Runs the branch auto-detection algorithm (see Branch Auto-Detection section). Returns selected branch, reason, confidence level, and alternatives.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `userSpecified` | string (optional) | Override auto-detection; throws if branch does not exist |

**`ghe-get-branch-details`**
Returns full branch metadata: protection status, last commit SHA, commit message, author, date.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `branch` | string | Branch name |

**`ghe-compare-branches`**
Compares two branches using GitHub's compare API. Returns commits ahead/behind, changed files, and diff insights via `analyzeBranchComparison()`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `base` | string | Base branch |
| `head` | string | Head branch |

**`ghe-create-branch`** _(requires `GHE_ENABLE_CREATE=true`)_

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `branchName` | string | Name for the new branch |
| `fromBranch` | string (optional) | Source branch; defaults to auto-detected default |

</tool-group>

<tool-group name="file-operations">

### File Operations

**`ghe-get-file`**
Retrieves file content. Base64-encoded content is decoded to UTF-8 (`decodedContent` field). Throws if file exceeds `GHE_MAX_FILE_SIZE`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `path` | string | File path (e.g., `src/Plugins/ContactPlugin.cs`) |
| `branch` | string (optional) | Branch; defaults to auto-detected |

**`ghe-list-files`**
Lists directory contents (files and subdirectories).

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `path` | string (optional) | Directory path; defaults to root |
| `branch` | string (optional) | Branch; defaults to auto-detected |

**`ghe-get-dir-structure`**
Recursive directory tree traversal up to `depth` levels.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `path` | string (optional) | Starting path; defaults to root |
| `branch` | string (optional) | Branch; defaults to auto-detected |
| `depth` | number (optional) | Max recursion depth; default 3 |

**`ghe-get-file-history`**
Returns commit history for a specific file (implemented as `getCommits()` filtered by path).

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `path` | string | File path |
| `branch` | string (optional) | Branch; defaults to auto-detected |
| `limit` | number (optional) | Max commits; default 50 |

**`ghe-update-file`** _(requires `GHE_ENABLE_WRITE=true`)_
Content is base64-encoded before sending. `sha` is required for optimistic concurrency — get it from `ghe-get-file` first.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `path` | string | File path |
| `content` | string | New file content (plain text) |
| `message` | string | Commit message |
| `branch` | string | Target branch |
| `sha` | string | Current file SHA (prevents overwriting concurrent changes) |

**`ghe-create-file`** _(requires `GHE_ENABLE_CREATE=true`)_

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `path` | string | File path |
| `content` | string | File content (plain text) |
| `message` | string | Commit message |
| `branch` | string | Target branch |

</tool-group>

<tool-group name="commit-operations">

### Commit Operations

**`ghe-get-commits`**
Returns commit history with optional filters.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `branch` | string (optional) | Branch; defaults to auto-detected |
| `since` | string (optional) | ISO 8601 date (e.g., `2025-01-01T00:00:00Z`) |
| `until` | string (optional) | ISO 8601 date |
| `author` | string (optional) | Filter by author username |
| `path` | string (optional) | Filter to commits affecting this file path |
| `limit` | number (optional) | Max commits; default 50 |

**`ghe-get-commit-details`**
Full commit info including changed files with additions/deletions.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `sha` | string | Commit SHA |

**`ghe-get-commit-diff`**
Returns unified diff for a commit using the GitHub diff/patch accept header (fetched via `axios`, not Octokit).

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `sha` | string | Commit SHA |
| `format` | `'diff'` or `'patch'` (optional) | Default: `diff` |

**`ghe-search-commits`**
Searches commit messages using GitHub search API. Supports work item references (`AB#1234`, `#1234`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search string (e.g., `AB#1234`, `fix login`) |
| `repoId` | string (optional) | Scope to specific repo |
| `author` | string (optional) | Filter by author |
| `since` | string (optional) | ISO 8601 date |
| `until` | string (optional) | ISO 8601 date |

</tool-group>

<tool-group name="search-operations">

### Search Operations

**`ghe-search-code`**
Searches code content across configured repositories. Builds a GitHub code search query with optional `repo:`, `path:`, and `extension:` qualifiers. Search results are not cached (`useCache: false`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search query (e.g., `class ContactPlugin`) |
| `repoId` | string (optional) | Limit to specific repository |
| `path` | string (optional) | Filter by file path pattern |
| `extension` | string (optional) | Filter by file extension (e.g., `cs`, `ts`) |

**`ghe-search-repos`**
Searches repository names/descriptions using GitHub repository search API.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search query |
| `owner` | string (optional) | Filter to a specific organization (`org:` qualifier) |

</tool-group>

<tool-group name="pr-read-operations">

### Pull Request Read Operations (always available)

**`ghe-list-pull-requests`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `state` | `'open'`, `'closed'`, `'all'` (optional) | Default: `open` |
| `base` | string (optional) | Filter by base branch |
| `head` | string (optional) | Filter by head branch |
| `sort` | `'created'`, `'updated'`, `'popularity'` (optional) | Default: `created` |
| `limit` | number (optional) | Default: 30 |

**`ghe-get-pull-request`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |

**`ghe-get-pr-files`**
Returns list of changed files with status (added/modified/removed/renamed) and line counts.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |

**`ghe-list-pr-reviews`**
Lists all submitted reviews with state (APPROVED, CHANGES_REQUESTED, COMMENTED) and reviewer.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |

**`ghe-list-pr-comments`**
Lists general PR comments (issue comments). Does not include inline review comments.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |

**`ghe-get-pr-diff`**
Returns unified diff for the entire PR using GitHub diff accept header.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |

</tool-group>

<tool-group name="pr-write-operations">

### Pull Request Write Operations (requires `GHE_ENABLE_PR_WRITE=true`)

**`ghe-submit-pr-review`**
Submits a review. `REQUEST_CHANGES` requires a `body`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |
| `event` | `'APPROVE'`, `'REQUEST_CHANGES'`, `'COMMENT'` | Review action |
| `body` | string (optional) | Review comment; required for `REQUEST_CHANGES` |
| `commitId` | string (optional) | Review specific commit; defaults to latest |

**`ghe-add-pr-comment`**
Adds a general comment (issue comment) to the PR conversation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |
| `body` | string | Comment body (markdown supported) |

**`ghe-add-review-comment`**
Adds an inline comment on a specific file/line in the diff.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |
| `body` | string | Comment body |
| `commitId` | string | SHA of the commit to comment on |
| `path` | string | File path relative to repo root |
| `line` | number (optional) | Line number in the diff |
| `side` | `'LEFT'`, `'RIGHT'` (optional) | `LEFT` = old file; `RIGHT` = new file |
| `startLine` | number (optional) | Start line for multi-line comment |
| `startSide` | `'LEFT'`, `'RIGHT'` (optional) | Start side for multi-line comment |

**`ghe-merge-pull-request`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |
| `mergeMethod` | `'merge'`, `'squash'`, `'rebase'` (optional) | Default: `merge` |
| `commitTitle` | string (optional) | Override merge commit title |
| `commitMessage` | string (optional) | Override merge commit message |
| `sha` | string (optional) | HEAD SHA for optimistic concurrency check |

**`ghe-reply-to-review-comment`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |
| `commentId` | number | ID of the comment to reply to |
| `body` | string | Reply body |

**`ghe-update-pull-request`**
Any combination of title, body, state, or base can be updated in a single call.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |
| `title` | string (optional) | New title |
| `body` | string (optional) | New description |
| `state` | `'open'`, `'closed'` (optional) | Change PR state |
| `base` | string (optional) | Change target branch |

**`ghe-request-pr-reviewers`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |
| `reviewers` | string[] (optional) | GitHub usernames |
| `teamReviewers` | string[] (optional) | Team slugs |

**`ghe-remove-pr-reviewers`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |
| `reviewers` | string[] (optional) | Usernames to remove |
| `teamReviewers` | string[] (optional) | Team slugs to remove |

**`ghe-add-pr-labels`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |
| `labels` | string[] | Label names to add |

**`ghe-remove-pr-label`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |
| `label` | string | Label name to remove |

**`ghe-close-pull-request`**
Closes a PR without merging (sets state to `closed`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `prNumber` | number | PR number |

</tool-group>

<tool-group name="pr-create">

### PR Creation (requires `GHE_ENABLE_CREATE=true`)

**`ghe-create-pull-request`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoId` | string | Repository ID |
| `title` | string | PR title |
| `head` | string | Source branch (contains your changes) |
| `base` | string | Target branch (where to merge into) |
| `body` | string (optional) | PR description (markdown supported) |
| `draft` | boolean (optional) | Create as draft; default false |

</tool-group>

</tool-reference>

<prompts>

All 5 prompts are always available regardless of feature flags.

| Prompt | Parameters | What it does |
|--------|-----------|--------------|
| `ghe-repo-overview` | `repoId` | Fetches branches, default branch, and 10 recent commits; formats as structured repository report |
| `ghe-code-search-report` | `query`, `repoId?`, `extension?` | Runs code search and formats results with relevance context |
| `ghe-branch-comparison-report` | `repoId`, `base`, `head` | Compares branches; shows commits to deploy, changed files (capped at 20), and deployment checklist |
| `ghe-troubleshooting-guide` | `repoId`, `searchQuery`, `branch?` | Runs parallel code search + commit search; generates recommendations for bug investigation |
| `ghe-deployment-report` | `repoId`, `fromBranch?`, `toBranch?` | Generates deployment steps, rollback plan, and testing checklist; groups files by top-level directory |

Prompts call service methods directly and return structured `user` role messages for downstream LLM processing.

</prompts>

<key-behaviors>

<behavior name="branch-auto-detection">

When no branch is specified, `getDefaultBranch(repoId)` runs this algorithm in order:

1. **User-specified** — Validates the branch exists; throws with available branch list if not found
2. **Configured default** — Uses `defaultBranch` from the repo's `GHE_REPOS` entry (`confidence: 'high'`)
3. **Release branch auto-detect** — Finds all branches matching `release/` (case-insensitive), parses the version number, picks the highest (`confidence: 'medium'`)
4. **Fallback to main/master** — Uses `main` or `master` if no release branches found (`confidence: 'low'`)
5. **Error** — Throws with list of available branches if none of the above work

The response always includes `branch`, `reason`, `confidence`, and optionally `alternatives` and `message`. When `confidence` is not `'high'`, the message advises the user to specify a branch explicitly if the auto-detected one is wrong.

</behavior>

<behavior name="response-caching">

GET requests are cached in memory by default:

```
Cache key format: {method}:{repoId}:{endpoint}:{params}
Example: "GET:plugin-core:repos/myorg/PluginCore/branches:{}"
```

- Cache is keyed by `repoId`, endpoint, and params
- TTL defaults to `GHE_CACHE_TTL` seconds (default 300)
- `useCache: false` is set on all search endpoints (`search/code`, `search/commits`, `search/repositories`)
- `ghe-clear-cache` clears by pattern, by repoId, or all at once
- Developer workflow: push changes → `ghe-clear-cache` → query updated content

</behavior>

<behavior name="write-operation-guards">

Write tools enforce feature flags at the service layer (not just at tool registration):

```typescript
// In RepoService
async createBranch(...) {
  if (!this.base.config.enableCreate) {
    throw new Error('Branch creation is disabled. Set GHE_ENABLE_CREATE=true to enable.');
  }
  // ...
}
```

This means the service-level check fires even if the tool were registered without the flag check. PR write tools are only registered at server startup when `GHE_ENABLE_PR_WRITE === 'true'`.

</behavior>

<behavior name="file-content-encoding">

Files from `getFile()` are returned as base64 from the GitHub API. The service decodes them:

```typescript
if (file.encoding === 'base64') {
  file.decodedContent = Buffer.from(file.content, 'base64').toString('utf-8');
}
```

`ghe-update-file` and `ghe-create-file` accept plain text; the service base64-encodes before sending.

</behavior>

</key-behaviors>

<error-handling>

All errors from `makeRequest()` map HTTP status codes to human-readable messages:

| Status / Code | Error message |
|---------------|--------------|
| 401 | `Authentication failed. Check your PAT or GitHub App credentials.` |
| 403 (rate limit) | `Rate limit exceeded. Resets at {resetDate}.` (parses `x-ratelimit-reset` header) |
| 403 (other) | `Access denied. Check repository permissions.` |
| 404 | `Resource not found: {endpoint}` |
| 422 | `Validation failed: {message}` |
| `ENOTFOUND`/`ECONNREFUSED` | `Network error: Unable to reach GitHub Enterprise at {baseUrl}. Check your connection and GHE_URL.` |
| `ETIMEDOUT` | `Request timeout. GitHub Enterprise API is slow to respond.` |

Branch not found (`getDefaultBranch` with user-specified branch): throws with full list of available branches.

Repository not found or inactive: throws with list of configured repo IDs.

File too large: throws with actual size vs. configured max and instruction to increase `GHE_MAX_FILE_SIZE`.

</error-handling>

<security>

- Tokens are never logged. Error sanitization removes `ghp_*` patterns from messages.
- Tokens are held only in memory (never persisted to disk).
- Only repositories listed in `GHE_REPOS` are accessible. Tools cannot access arbitrary repos.
- Repos with `"active": false` are inaccessible even if listed.
- No delete operations are implemented.
- All write operations require explicit opt-in via environment flags.
- Commit messages for file write operations must be provided by the caller.

</security>

<integration-patterns>

<pattern name="bug-investigation">

Cross-service bug investigation workflow:

1. Get work item: `get-work-item` (ADO) → extract bug description and affected component
2. Search commits: `ghe-search-commits` with `AB#1234` or component name → find related code changes
3. Get commit details: `ghe-get-commit-details` → inspect file changes
4. Get current code: `ghe-get-file` → verify current implementation
5. Check deployed plugin: `get-plugin-assembly-complete` (PowerPlatform) → verify deployment state
6. Analyze logs: `appinsights-get-exceptions` (App Insights) → check runtime errors
7. Generate report: `ghe-troubleshooting-guide` prompt

</pattern>

<pattern name="deployment-analysis">

Pre-deployment branch comparison workflow:

1. Compare branches: `ghe-compare-branches` (`release/9.0` vs `main`)
2. Review changed files: analyze modified plugins from comparison result
3. Generate checklist: `ghe-deployment-report` prompt
4. Verify plugin DLLs in artifacts
5. Deploy to PowerPlatform: `update-plugin-assembly`
6. Merge to main after successful deployment

</pattern>

<pattern name="code-review">

PR review workflow:

1. List open PRs: `ghe-list-pull-requests` with `state: open`
2. Get PR details: `ghe-get-pull-request`
3. Get changed files: `ghe-get-pr-files`
4. Get diff: `ghe-get-pr-diff`
5. Generate comparison report: `ghe-branch-comparison-report` prompt
6. Submit review: `ghe-submit-pr-review` (requires `GHE_ENABLE_PR_WRITE=true`)

</pattern>

</integration-patterns>

<formatters>

All tool output goes through markdown formatters in `src/utils/ghe-formatters.ts`:

| Formatter | Used by |
|-----------|---------|
| `formatBranchListAsMarkdown()` | `ghe-list-branches` |
| `formatCommitHistoryAsMarkdown()` | `ghe-get-commits`, `ghe-search-commits`, `ghe-compare-branches` |
| `formatCodeSearchResultsAsMarkdown()` | `ghe-search-code` |
| `formatPullRequestsAsMarkdown()` | `ghe-list-pull-requests` |
| `formatPullRequestDetailsAsMarkdown()` | `ghe-get-pull-request`, `ghe-update-pull-request`, `ghe-close-pull-request` |
| `formatFileTreeAsMarkdown()` | `ghe-get-dir-structure` |
| `formatDirectoryContentsAsMarkdown()` | `ghe-list-files` |
| `formatCommitDetailsAsMarkdown()` | `ghe-get-commit-details` |
| `analyzeBranchComparison()` | `ghe-compare-branches`, `ghe-branch-comparison-report` prompt |
| `generateDeploymentChecklist()` | `ghe-branch-comparison-report`, `ghe-deployment-report` prompts |
| `formatPrReviewsAsMarkdown()` | `ghe-list-pr-reviews` |
| `formatPrCommentsAsMarkdown()` | `ghe-list-pr-comments` |
| `formatReviewResultAsMarkdown()` | `ghe-submit-pr-review` |
| `formatPrCommentResultAsMarkdown()` | `ghe-add-pr-comment`, `ghe-add-review-comment`, `ghe-reply-to-review-comment` |
| `formatMergeResultAsMarkdown()` | `ghe-merge-pull-request` |
| `formatReviewerRequestAsMarkdown()` | `ghe-request-pr-reviewers` |
| `formatLabelsAsMarkdown()` | `ghe-add-pr-labels` |
| `formatPrCreationAsMarkdown()` | `ghe-create-pull-request` |
| `formatRepositoryOverviewAsMarkdown()` | `ghe-repo-overview` prompt |

</formatters>

<cli-architecture>

<file-structure>

```
packages/github-enterprise/src/
  cli.ts                          # Entry point (#!/usr/bin/env node)
  context-factory.ts              # Shared createServiceContext() for CLI use
  cli/
    output.ts                     # outputResult(), handleCliError(), cache dir: .mcp-ghe-cache
    commands/
      index.ts                    # registerAllCommands() aggregator
      repo-commands.ts            # repo list, search-repos, clear-cache
      branch-commands.ts          # branch list, default, details, compare, create
      file-commands.ts            # file get, list, tree, history, search, update, create
      commit-commands.ts          # commit list, details, diff, search
      pr-commands.ts              # all PR operations
```

</file-structure>

<command-groups>

| Group | Subcommands | Corresponding MCP tools |
|-------|-------------|------------------------|
| `repo` | `list`, `search-repos`, `clear-cache` | `ghe-list-repos`, `ghe-search-repos`, `ghe-clear-cache` |
| `branch` | `list`, `default`, `details`, `compare`, `create` | `ghe-list-branches`, `ghe-get-default-branch`, `ghe-get-branch-details`, `ghe-compare-branches`, `ghe-create-branch` |
| `file` | `get`, `list`, `tree`, `history`, `search`, `update`, `create` | `ghe-get-file`, `ghe-list-files`, `ghe-get-dir-structure`, `ghe-get-file-history`, `ghe-search-code`, `ghe-update-file`, `ghe-create-file` |
| `commit` | `list`, `details`, `diff`, `search` | `ghe-get-commits`, `ghe-get-commit-details`, `ghe-get-commit-diff`, `ghe-search-commits` |
| `pr` | `list`, `get`, `files`, `reviews`, `comments`, `diff`, `create`, `update`, `close`, `merge`, `submit-review`, `add-comment`, `add-review-comment`, `reply-comment`, `request-reviewers`, `remove-reviewers`, `add-labels`, `remove-label` | All 22 PR tools |

</command-groups>

<cli-examples>

```bash
# List configured repos
mcp-ghe-cli repo list

# Get a file from a specific branch
mcp-ghe-cli file get plugin-core src/Plugins/ContactPlugin.cs --branch release/9.0

# Search code
mcp-ghe-cli file search "class ContactPlugin" --repo-id plugin-core --extension cs

# List open PRs
mcp-ghe-cli pr list --repo-id plugin-core --state open

# Submit a PR review
mcp-ghe-cli pr submit-review --repo-id plugin-core --pr-number 42 --event APPROVE

# Raw JSON output
mcp-ghe-cli --json commit list --repo-id plugin-core --limit 10

# Use custom env file
mcp-ghe-cli --env-file .env.prod branch list --repo-id plugin-core
```

</cli-examples>

<parameter-mapping>

| MCP Tool (Zod) | CLI Command (Commander) |
|----------------|------------------------|
| Required `z.string()` | `--required-flag <value>` (requiredOption) |
| Optional `z.string().optional()` | `--flag <value>` (option) |
| Optional `z.boolean().optional()` | `--flag` (boolean flag) |
| Optional `z.number().optional()` | `--count <n>` (parseInt in action) |
| `z.array(z.string())` | `--flag <json>` (JSON.parse in action) |

</parameter-mapping>

</cli-architecture>
