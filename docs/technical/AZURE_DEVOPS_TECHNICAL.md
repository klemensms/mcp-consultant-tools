# Azure DevOps - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/AZURE_DEVOPS.md -->

<overview>

**Package:** `@mcp-consultant-tools/azure-devops`
**Binary (MCP):** `mcp-ado`
**Binary (CLI):** `mcp-ado-cli`
**Tools:** 47 base tools + up to 6 PR write tools (53 total when enabled)
**Prompts:** 4
**Services:** wiki, workItem, pullRequest, build, variableGroup, sync, configuration, checklist

Reference package for the v28 Service-Tool-Prompt architecture. All other packages follow the same patterns established here.

> **Admin package:** For pipelines, service connections, agent pools, and environments, see `@mcp-consultant-tools/azure-devops-admin`.

</overview>

<authentication>

## Authentication

Authentication uses a **Personal Access Token (PAT)** passed via the `AZUREDEVOPS_PAT` environment variable. The PAT must have appropriate scopes for the operations used.

### PAT Scope Requirements

| Operation group | Required scope |
|----------------|---------------|
| Wiki read | `vso.wiki` |
| Wiki write | `vso.wiki_write` |
| Work item read | `vso.work` |
| Work item write | `vso.work_write` |
| Code (repos, PRs) read | `vso.code` |
| Code (PRs) write | `vso.code_write` |
| Build read | `vso.build` |
| Variable groups read | `vso.variablegroups_read` |
| Extension data (checklists) | `vso.extension_data` |
| Extension data write | `vso.extension_data_write` |

</authentication>

<environment-variables>

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `AZUREDEVOPS_ORGANIZATION` | Azure DevOps organization name (from URL: `dev.azure.com/{org}`) |
| `AZUREDEVOPS_PAT` | Personal Access Token |
| `AZUREDEVOPS_PROJECTS` | Comma-separated list of accessible project names |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AZUREDEVOPS_API_VERSION` | `7.1` | Azure DevOps REST API version |
| `AZUREDEVOPS_COMMENT_FORMAT` | `markdown` | Comment format: `markdown` or `html`. Set to `html` for legacy orgs that auto-convert markdown to HTML |
| `AZUREDEVOPS_SYNC_FOLDER` | `docs/user-stories` | Local folder path for work item sync files |
| `AZUREDEVOPS_SYNC_AUTO_COMMIT` | `false` | Auto-commit pulled work item files to git |

### Feature Flags (Write Operations)

All write operations are disabled by default. Enable per-domain:

| Variable | Default | Enables |
|----------|---------|---------|
| `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE` | `false` | Create/update work items, add/update comments, checklist write, sync push |
| `AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE` | `false` | Delete work items |
| `AZUREDEVOPS_ENABLE_WIKI_WRITE` | `false` | Create/update/str-replace wiki pages |
| `AZUREDEVOPS_ENABLE_WIKI_DELETE` | `false` | Delete wiki pages |
| `AZUREDEVOPS_ENABLE_PR_WRITE` | `false` | Create/update/complete PRs, manage reviewers, vote, reply |

</environment-variables>

<url-patterns>

## URL Patterns and Configuration

Always use `get-configuration` to retrieve the configured organization and projects. Never guess these values.

| Resource | URL pattern |
|---------|-------------|
| Work item | `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}` |
| Pull request | `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}` |
| Wiki page | `https://dev.azure.com/{org}/{project}/_wiki/wikis/{wikiName}/{pagePath}` |
| Build | `https://dev.azure.com/{org}/{project}/_build/results?buildId={id}` |

### Extracting Parameters from a PR URL

```
https://dev.azure.com/org/Project/_git/RepoName/pullrequest/123
                       ↓           ↓         ↓
                    project   repositoryId  pullRequestId
```

The `repositoryId` accepts both GUID and name. Use `list-repositories` to resolve GUIDs if needed.

</url-patterns>

<tool-reference>

## Tool Reference

<tool-group name="configuration">

### Configuration Tools (1 tool)

| Tool | Description |
|------|-------------|
| `get-configuration` | Show configured organization, projects, and enabled feature flags |

Use `get-configuration` first when constructing URLs or when the project name is unknown.

</tool-group>

<tool-group name="wiki">

### Wiki Tools (10 tools)

| Tool | Requires flag | Description |
|------|--------------|-------------|
| `get-wikis` | — | List all wikis in a project |
| `search-wiki-pages` | — | Full-text search across wiki pages with highlighting |
| `get-wiki-page` | — | Retrieve page content; auto-converts git paths to wiki paths |
| `get-wiki-tree` | — | Page hierarchy (paths + ids, no content) under a path — full-wiki enumeration |
| `create-wiki-page` | `ENABLE_WIKI_WRITE` | Create a new wiki page |
| `update-wiki-page` | `ENABLE_WIKI_WRITE` | Update page; auto-fetches version if not provided |
| `ado-str-replace-wiki` | `ENABLE_WIKI_WRITE` | Replace specific string without rewriting entire page |
| `delete-wiki-page` | `ENABLE_WIKI_DELETE` | Permanently delete a page and all sub-pages |
| `download-wiki-attachment` | — | Download a single wiki attachment to disk |
| `download-wiki-page-attachments` | — | Download all attachments referenced in a page |

#### Wiki Path Conversion

Azure DevOps wikis have two path formats that are incompatible:

| Format | Example |
|--------|---------|
| Git path (from search) | `/Release-Notes/Page-Name.md` |
| Wiki path (for get-page) | `/Release Notes/Page Name` |

The service automatically handles conversion:
- `search-wiki-pages` returns both `gitPath` (original) and `path` (converted wiki path)
- `get-wiki-page` detects git paths (ending with `.md`) and auto-converts them

#### Sub-page Enumeration (`recursionLevel` / `get-wiki-tree`)

The ADO Pages API only populates child pages when `recursionLevel` is requested (its default is `none`). `get-wiki-page` accepts an optional `recursionLevel` parameter (`none` | `oneLevel` | `full`) passed through to the REST call; `subPages` is included in the response only when `oneLevel`/`full` is requested. When it isn't, the response carries a `subPagesNote` explaining how to populate it — a bare empty `subPages: []` no longer masquerades as "no children".

For enumerating a wiki's structure, prefer `get-wiki-tree` (CLI: `wiki tree`): it wraps `pages?recursionLevel=full&includeContent=false` and returns a slim recursive tree (`id`, `path`, `gitItemPath`, `url`, `subPages`) plus a `pageCount` — the whole hierarchy without pulling any page bodies. Optional `pagePath` scopes the enumeration to a subtree; `depth: 'oneLevel'` limits it to direct children.

```typescript
private convertGitPathToWikiPath(gitPath: string): string {
  return gitPath
    .replace(/\.md$/, '')      // Remove .md extension
    .replace(/-/g, ' ')         // Replace dashes with spaces
    .replace(/%2D/gi, '-');     // Decode %2D back to -
}
```

#### String Replacement Tool (`ado-str-replace-wiki`)

Enables efficient wiki updates by replacing specific strings without rewriting the entire page. Achieves approximately 98% token reduction for common update scenarios (e.g., date/version updates).

**Algorithm:**
1. Validate write permission
2. Fetch current page content and version
3. Count occurrences of `old_str`
4. Enforce uniqueness (error if multiple matches and `replace_all=false`)
5. Perform replacement
6. Update with version conflict retry (1 retry max using fresh content)
7. Return unified diff output

**Key behaviors:**
- `replace_all=false` (default): `old_str` must appear exactly once — prevents accidental bulk replacements
- `replace_all=true`: Replaces all occurrences
- Version conflicts are automatically retried with fresh page content
- Output includes unified diff showing exactly what changed

**Common use cases:**

```javascript
// Cross-environment date update (98% token savings)
for (const env of ['DEV', 'UAT', 'PROD']) {
  await ado-str-replace-wiki({
    project: 'Acme',
    wikiId: 'Acme.wiki',
    pagePath: `/SharePoint-Online/04-${env}-Configuration`,
    old_str: 'Last Verified: November 5, 2025',
    new_str: 'Last Verified: November 10, 2025'
  });
}

// Replace all occurrences
await ado-str-replace-wiki({ ..., replace_all: true, old_str: 'TODO', new_str: 'DONE' });
```

**Error messages:**
- `String not found: "..."` — shows page excerpt to help locate the issue
- `String appears N times. Use replace_all=true or make old_str unique.` — lists matching line numbers

</tool-group>

<tool-group name="work-item">

### Work Item Tools (10 tools)

| Tool | Requires flag | Description |
|------|--------------|-------------|
| `get-work-item` | — | Get a work item by ID with full details |
| `query-work-items` | — | Query using WIQL (Work Item Query Language) |
| `run-saved-query` | — | Execute a saved query by GUID |
| `get-saved-query` | — | Get saved query metadata and WIQL text without executing |
| `get-work-item-comments` | — | Get discussion/comments for a work item |
| `add-work-item-comment` | `ENABLE_WORK_ITEM_WRITE` | Add a comment |
| `update-work-item-comment` | `ENABLE_WORK_ITEM_WRITE` | Update an existing comment |
| `update-work-item` | `ENABLE_WORK_ITEM_WRITE` | Update fields using JSON Patch operations |
| `create-work-item` | `ENABLE_WORK_ITEM_WRITE` | Create with optional parent relationship |
| `delete-work-item` | `ENABLE_WORK_ITEM_DELETE` | Delete a work item |

#### WIQL Query Syntax

```sql
SELECT [System.Id], [System.Title], [System.State]
FROM WorkItems
WHERE [System.TeamProject] = 'MyProject'
  AND [System.State] = 'Active'
  AND [System.AssignedTo] = @Me
ORDER BY [System.ChangedDate] DESC
```

Common field references: `[System.Id]`, `[System.Title]`, `[System.State]`, `[System.WorkItemType]`, `[System.AssignedTo]`, `[System.Parent]`. Use `@Me` for the current user.

#### JSON Patch Operations for `update-work-item`

```json
[
  { "op": "replace", "path": "/fields/System.State", "value": "Active" },
  { "op": "add", "path": "/fields/System.Description", "value": "Updated content" },
  { "op": "remove", "path": "/fields/System.Tags" }
]
```

The tool automatically injects markdown format operations for large text fields (Description, Acceptance Criteria) unless `skipAutoConvert: true` is set.

#### Work Item Parent Relationships (`create-work-item`)

Two approaches for setting parent during creation:

**Simple (recommended):** Use `parentId` parameter — creates `System.LinkTypes.Hierarchy-Reverse` relation in a single API call.

**Advanced:** Use `relations` array for multiple or non-parent relationships:

```json
{
  "relations": [
    { "rel": "System.LinkTypes.Hierarchy-Reverse", "url": "https://dev.azure.com/org/project/_apis/wit/workItems/1133" },
    { "rel": "System.LinkTypes.Related", "url": "https://dev.azure.com/org/project/_apis/wit/workItems/1050" }
  ]
}
```

**Common relation types:**

| Type | Direction |
|------|-----------|
| `System.LinkTypes.Hierarchy-Reverse` | Child → Parent |
| `System.LinkTypes.Hierarchy-Forward` | Parent → Child |
| `System.LinkTypes.Related` | Related items |
| `System.LinkTypes.Dependency-Forward` | Successor (this blocks linked) |
| `System.LinkTypes.Dependency-Reverse` | Predecessor (this is blocked by linked) |

#### Comment Format

By default, comments are sent as Markdown. Set `AZUREDEVOPS_COMMENT_FORMAT=html` to auto-convert Markdown to HTML for legacy organizations.

#### `run-saved-query` Detail Levels

| Value | Returns |
|-------|---------|
| `summary` (default) | ID, Title, Assigned To, State, Severity, Priority, Tags, Story Points, Resolved Reason |
| `full` | All fields expanded |
| Custom `fields` array | Only specified ADO field reference names |

</tool-group>

<tool-group name="pull-request">

### Pull Request Tools (6 read + up to 6 write = 12 tools)

**Read tools (always available):**

| Tool | Description |
|------|-------------|
| `list-repositories` | List Git repositories in a project |
| `list-pull-requests` | List PRs with status filter |
| `get-pull-request` | Get PR details, reviewers, votes |
| `get-pull-request-threads` | Get comments and discussions |
| `get-pull-request-commits` | Get commits included in the PR |
| `get-pull-request-changes` | Get file changes (by iteration) |

**Write tools (require `AZUREDEVOPS_ENABLE_PR_WRITE=true`):**

| Tool | Description |
|------|-------------|
| `add-pull-request-thread` | Add a comment or review thread |
| `create-pull-request` | Create a new PR with title, description, reviewers, draft mode |
| `update-pull-request` | Update title, description, status (abandon/reactivate), draft state |
| `complete-pull-request` | Merge PR with strategy selection |
| `add-pr-reviewer` | Add or remove reviewers |
| `vote-pull-request` | Submit a vote |
| `reply-to-pr-thread` | Reply to a thread and/or update thread status |

#### Merge Strategy Values

| Strategy | API Value | Description |
|----------|-----------|-------------|
| `squash` | 2 | Squash all commits into one (default) |
| `noFastForward` | 1 | Create a merge commit |
| `rebase` | 3 | Rebase source onto target |
| `rebaseMerge` | 4 | Rebase with merge commit |

#### Vote Values

| Vote | Label |
|------|-------|
| -10 | Rejected |
| -5 | Waiting for author |
| 0 | No response |
| 5 | Approved with suggestions |
| 10 | Approved |

#### Thread Status Values

`active`, `fixed`, `wontFix`, `closed`, `byDesign`, `pending`

#### Implementation Notes

- `repositoryId` accepts both GUID and repository name
- `get-pull-request-changes` without an iteration automatically fetches the latest iteration
- Inline comments: provide both `filePath` and `lineNumber` (right side of diff)
- Voting requires `vso.code_write` scope and resolves the authenticated user via `_apis/connectionData`

#### API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{project}/_apis/git/repositories` | GET | List repositories |
| `/{project}/_apis/git/repositories/{repoId}/pullrequests` | GET/POST | List/create PRs |
| `/{project}/_apis/git/repositories/{repoId}/pullrequests/{prId}` | GET/PATCH | Get/update/complete PR |
| `/{project}/_apis/git/repositories/{repoId}/pullrequests/{prId}/threads` | GET/POST | Get/add threads |
| `/{project}/_apis/git/repositories/{repoId}/pullrequests/{prId}/threads/{threadId}/comments` | POST | Reply to thread |
| `/{project}/_apis/git/repositories/{repoId}/pullrequests/{prId}/reviewers/{id}` | PUT/DELETE | Add/remove/vote reviewer |
| `/{project}/_apis/git/repositories/{repoId}/pullrequests/{prId}/commits` | GET | Get commits |
| `/{project}/_apis/git/repositories/{repoId}/pullrequests/{prId}/iterations` | GET | List iterations |
| `/{project}/_apis/git/repositories/{repoId}/pullrequests/{prId}/iterations/{id}/changes` | GET | Get file changes |
| `_apis/connectionData` | GET | Resolve authenticated user for voting |

</tool-group>

<tool-group name="build">

### Build Tools (4 tools)

| Tool | Description |
|------|-------------|
| `get-build-status` | Get build status; optional `detail` parameter adds timeline or logs inline |
| `get-build-timeline` | Step-by-step breakdown with `scope` filtering |
| `get-build-logs` | Without `logId`: list available logs. With `logId`: return that log's content |
| `build-issues` | Every warning and error, read from the timeline's `issues[]` (no log download) |

#### `build-issues` semantics

Azure DevOps emits `issue.type` as the lowercase `error` or `warning` only. Each
timeline record also carries `errorCount`/`warningCount`, which are **independent
of `issues[]`** — a record can report a count with no message attached.

| Field | Meaning |
|-------|---------|
| `totalErrors` / `totalWarnings` | Issues actually listed, with messages. Always cover the whole build, even when `severity` narrows the listing |
| `timelineCounters` | The server's own tally, summed across every record |
| `countersExceedListedIssues` | `true` when the server counted problems it attached no message to — the listed detail is then a subset |

`recordType` is passed through verbatim: Microsoft documents the timeline record
`type` as an untyped string with no published enum, so this tool never filters on it.

#### Timeline Scope Values

| Scope | Returns |
|-------|---------|
| `problems` (default) | Only errors, warnings, failures |
| `stages` | Stage-level summary |
| `jobs` | Stages and jobs |
| `all` | Everything (can be large) |

The `get-build-timeline` and `get-build-logs` tool descriptions include sub-agent hints encouraging delegation when handling large builds or verbose logs.

> **Note:** These tools are also available in `@mcp-consultant-tools/azure-devops-admin`. Changes to these tools must be kept in sync across both packages.

</tool-group>

<tool-group name="variable-group">

### Variable Group Tools (5 tools)

| Tool | Description |
|------|-------------|
| `get-variable-groups` | List variable groups in a project |
| `get-variable-group` | Get a specific variable group and its variables |
| `compare-variable-groups` | Side-by-side diff of two groups |
| `compare-environments` | Detect `<base>-<env>` families and diff each environment against the first |
| `variable-group-summary` | Per-group variable and secret **counts** |

#### Secret handling

Azure DevOps returns a secret as `{ "isSecret": true, "value": null }` and **omits
`isSecret` entirely** for a normal variable.

- `get-variable-group(s)` mask a secret's value to the literal `***SECRET***`.
- The three comparison/summary tools read the **raw** API payload and branch on
  `isSecret`, never on the value. A variable that is secret on either side is
  listed by name under `secretsSkipped` and its values are never read, so even if
  the API returned a real value it could not reach the output. This is covered by
  a unit test that asserts a planted secret value appears nowhere in the result.
- Diffing the masked output would be wrong in the other direction too: two
  *different* secrets both render as `***SECRET***` and would compare equal.
- `secretPresenceDifferences` reports a variable that is a secret on one side and
  plaintext on the other — a real drift finding that leaks nothing.

#### `compare-environments` and the empty-result trap

Environment detection matches the **longest** suffix from `environmentSuffixes`
(default: `-dev -development -qa -uat -staging -stage -test -prod -production`),
so `-production` is never mistaken for `-prod`. A team using `-prd` or `_dev`
would otherwise match nothing, forever, with no error — so the tool returns:

| Field | Meaning |
|-------|---------|
| `unmatchedGroups` | Groups whose name fit no suffix. A long list here explains an empty result |
| `incompleteSets` | Families with a single environment (nothing to diff against) |
| `environmentSuffixes` | The suffixes actually used, echoed back |

</tool-group>

<tool-group name="git">

### Git Tools (2 tools)

| Tool | Description |
|------|-------------|
| `list-branches` | Branches in a repository, with the tip commit SHA |
| `latest-release-branch` | Newest `release/*` branch by version |

Refs API facts (api-version `7.1`): `filter` is a **prefix** match; `name` comes
back as the **full** ref (`refs/heads/main`); a ref carries `objectId` and **no
date**; `$top` caps at 1000 and further pages arrive via the
`x-ms-continuationtoken` **response header**.

`list-branches` follows that header until `maxResults` is met and sets
`truncated: true` when the server still had more — a partial list is never
reported as complete.

#### What "latest" means

`latest-release-branch` sorts by **version name**, digit-aware, descending — so
`release/10` beats `release/9` (a plain lexical sort gets this backwards). Because
the refs API exposes no commit date, this does **not** mean "most recently
committed".

A branch with no digit in its name (`release/next`) cannot be ranked against
`release/35.0`; letting it win would be arbitrary. Such branches are excluded from
candidacy and reported under `ignoredNonVersionBranches` rather than silently
dropped. When every candidate is unrankable, `branchName` is `null`.

</tool-group>

<tool-group name="sync">

### Work Item Sync Tools (8 tools)

Token-efficient local editing by syncing ADO work items to/from markdown files. Achieves 10-50x token reduction compared to repeated API calls.

| Tool | Requires flag | Description |
|------|--------------|-------------|
| `sync-work-item-to-file` | — | Download work item(s) to local markdown (read-only — converts HTML→Markdown in the local file; ADO is not modified) |
| `sync-work-item-from-file` | `ENABLE_WORK_ITEM_WRITE` | Upload local changes to ADO; auto-detects `new_*.md` files |
| `create-work-item-file` | — | Create a template file for any work item type (parent optional) |
| `create-user-story-file` | — | Alias for `create-work-item-file` with type='User Story' (requires parentId) |
| `check-work-item-markdown` | — | Check if work item fields are markdown or HTML format |
| `list-synced-work-items` | — | List files in the sync folder |
| `sync-tasks-to-file` | — | Download tasks under parent User Story(s) to tasks file |
| `sync-tasks-from-file` | `ENABLE_WORK_ITEM_WRITE` | Push task changes with upsert semantics |

See the [Work Item Sync Workflow Guide](#work-item-sync-workflow-guide) section below for detailed usage patterns, file formats, and field references.

</tool-group>

<tool-group name="checklist">

### Checklist Tools (8 tools)

Tools for the `mohitbagra/workitem-checklist` Azure DevOps extension. Checklists are stored in the Extension Data Service, not in work item fields. The extension must be installed in the organization.

**Merge-on-read pattern:** `get-checklist` combines the WIT default template with per-work-item state overrides and custom items at read time.

**Read tools (always available):**

| Tool | Description |
|------|-------------|
| `get-checklist` | Get merged checklist for a work item with completion status |
| `get-checklist-template` | Get the default template for a work item type |
| `list-checklist-templates` | List all templates in a project |
| `get-checklist-report` | Completion report across work items; sorted by least complete first |

**Write tools (require `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`):**

| Tool | Description |
|------|-------------|
| `update-checklist-item` | Update state of a checklist item; records completedBy and timestamp when set to 'Completed' |
| `add-checklist-item` | Add a custom item to a work item's shared checklist (max 128 characters) |
| `remove-checklist-item` | Remove a custom item (only custom items, not template items) |
| `update-checklist-template` | Replace all template items for a work item type |

**Checklist item states:** `New`, `In Progress`, `Blocked`, `N/A`, `Completed`

**Concepts:**
- Templates define standard items per work item type (e.g., all User Stories get the same checklist)
- Overrides store per-work-item state changes
- Custom items are additional items added to specific work items only
- Template items cannot be removed (only state can be updated)

</tool-group>

<tool-group name="test-management">

### Test Management Tools (7 tools)

Tools for ADO Test Management API (`_apis/test/`). Uses the Basic license endpoint — does NOT require the Azure Test Plans extension (`_apis/testplan/`).

**Key design:** All runs set `isAutomated: true` to bypass the Test Plan requirement. Test run links use Hyperlinks (ADO has no artifact link support for test runs).

**Core lifecycle:**

| Tool | Description |
|------|-------------|
| `create-test-run` | Create automated test run. Optionally links test case work items via hyperlinks |
| `add-test-results` | Add per-step/per-case results with outcomes (Passed, Failed, NotExecuted, Blocked, NotApplicable) |
| `complete-test-run` | Mark run as completed, returns pass/fail summary |

**Query & history:**

| Tool | Description |
|------|-------------|
| `get-test-runs` | List runs with state/date filters |
| `get-test-run-results` | Detailed results for a specific run, filterable by outcome |
| `get-test-case-history` | Run history for a Test Case work item; searches recent completed runs |

**Linking:**

| Tool | Description |
|------|-------------|
| `link-test-case` | Link test case to story (Microsoft.VSTS.Common.TestedBy) and/or run (Hyperlink). Idempotent |

**API endpoints used:** `_apis/test/runs` (POST, PATCH, GET), `_apis/test/runs/{id}/results` (POST, GET), `_apis/wit/workitems/{id}` (PATCH for relations)

**Gotchas:**
- `isAutomated: true` is required for runs without a Test Plan — the tool sets this automatically
- `_apis/testplan/` requires Azure Test Plans license (extra cost) — these tools avoid it entirely
- `vstfs:///TestManagement/TcmTestRun/{id}` is NOT a valid artifact URI — use Hyperlinks instead
- `testCase.id` on results doesn't create visible backlinks on the work item — use `link-test-case` explicitly
- Test Case work items use `Microsoft.VSTS.TCM.Steps` for structured test steps (XML format)
- Test Case states follow their own workflow (Design → Ready → Closed)

</tool-group>

</tool-reference>

<prompts>

## Prompts

| Prompt | Parameters | Description |
|--------|-----------|-------------|
| `wiki-search-results` | `searchText`, `project?`, `maxResults?` | Search and format wiki results with content snippets |
| `wiki-page-content` | `project`, `wikiId`, `pagePath` | Get formatted wiki page with navigation context |
| `work-item-summary` | `project`, `workItemId` | Get comprehensive work item summary including comments (two concurrent API calls) |
| `work-items-query-report` | `project`, `wiql`, `maxResults?` | Execute WIQL and return results grouped by state/type |

</prompts>

<work-item-sync-workflow-guide>

## Work Item Sync Workflow Guide

This section documents the complete agentic workflow for syncing ADO work items to/from local markdown files. The sync approach reduces token usage by 10-50x per work item compared to API calls.

**Default sync folder:** `docs/user-stories/` (configurable via `AZUREDEVOPS_SYNC_FOLDER`)

<sync-quick-reference>

### Quick Reference

| Action | MCP Tool | File Pattern | Notes |
|--------|----------|--------------|-------|
| Pull existing work items | `sync-work-item-to-file` | `{id}.md` | Downloads from ADO |
| Pull all children of parent | `sync-work-item-to-file` | `{id}.md` (multiple) | Use `parentId` parameter |
| Push changes to ADO | `sync-work-item-from-file` | `{id}.md` | Updates existing work items |
| Create new template | `create-work-item-file` | `new_{parentId}_{n}.md` or `new_{n}.md` | Template for any type |
| Push new items to ADO | `sync-work-item-from-file` | `new_*.md` (auto-detected) | Creates in ADO, renames to `{id}.md` |
| Pull tasks for user story | `sync-tasks-to-file` | `{parentId}-tasks.md` | Downloads all tasks under parent |
| Update/create tasks | `sync-tasks-from-file` | `{parentId}-tasks.md` | Upsert semantics |
| Check field format | `check-work-item-markdown` | N/A | Inspection only; HTML auto-converts on pull (read-only), no longer gates syncing |
| List local files | `list-synced-work-items` | N/A | Shows what is in sync folder |

</sync-quick-reference>

<sync-tool-parameters>

### Tool Parameters

#### `sync-work-item-to-file`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `project` | string | Yes | — | ADO project name |
| `workItemIds` | number[] | No | `[]` | Specific work item IDs to pull |
| `parentId` | number | No | — | Pull all children of this parent |
| `childType` | string | No | `"User Story"` | Filter child type when using `parentId` |
| `folder` | string | No | sync folder | Override sync folder path |
| `includeComments` | boolean | No | `false` | Save comments to `{id}-comments.md` |
| `skipAutoConvert` | boolean | No | `false` | Skip HTML-to-markdown conversion |

**Pull behavior:**
1. **Read-only against ADO** — downloads the item; never writes to or modifies it, never bumps its revision.
2. HTML fields convert to Markdown **in the local file only** (the ADO item keeps its HTML). HTML tables become Markdown pipe tables; complex tables (merged/styled cells) may lose structure and raise a `⚠️ TABLE CONVERSION` warning (`conversionWarnings` in the result) — re-read with `get-work-item` to verify before editing.
3. `skipAutoConvert: true`: items whose body fields are still HTML are reported under `skipped` rather than written with blank fields.

#### `sync-work-item-from-file`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `project` | string | Yes | — | ADO project name |
| `workItemIds` | number[] | No | `[]` | Specific IDs to push (new_*.md auto-detected) |
| `folder` | string | No | sync folder | Override sync folder path |
| `skipAutoConvert` | boolean | No | `false` | Skip HTML-to-markdown conversion |

**Push behavior:**
1. Files with `id` in frontmatter: Updates existing work item in ADO
2. `new_*.md` files: Creates new work item, then renames file to `{newId}.md`
3. Auto-converts HTML fields unless `skipAutoConvert: true`

#### `create-work-item-file`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `project` | string | Yes | — | ADO project name |
| `parentId` | number | No | — | Parent work item ID. Omit for standalone items (Features, Epics) |
| `workItemType` | string | No | `"User Story"` | Work item type: User Story, Bug, Feature, Epic, Task, etc. |
| `folder` | string | No | sync folder | Override sync folder path |

**File naming:**
- With parent: `new_{parentId}_{n}.md` (auto-increments)
- Without parent: `new_{n}.md`

#### `sync-tasks-to-file`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `project` | string | Yes | — | ADO project name |
| `parentIds` | number[] | Yes | — | Parent User Story IDs |
| `folder` | string | No | sync folder | Override sync folder path |
| `skipAutoConvert` | boolean | No | `false` | Skip HTML-to-markdown conversion |

Creates `{parentId}-tasks.md` per parent.

#### `sync-tasks-from-file`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `project` | string | Yes | — | ADO project name |
| `parentIds` | number[] | Yes | — | Parent User Story IDs |
| `folder` | string | No | sync folder | Override sync folder path |
| `skipAutoConvert` | boolean | No | `false` | Skip HTML-to-markdown conversion |

**Upsert behavior:**
- `## Task #ID` sections: Updated in ADO
- `## NEW TASK` sections: Created in ADO, header updated to `## Task #ID`

</sync-tool-parameters>

<sync-file-formats>

### File Formats (v30.0.0-beta.18+ — annotation-driven)

Sync is generic: the markdown file declares which ADO fields its content
maps to, and the sync engine pushes/pulls whatever is declared. Two
channels:

1. **Frontmatter keys** are ADO reference names, with an alias table for the
   common ones (see Alias Table below).
2. **Body `##` sections** are tagged with `<!-- ado-field: REFNAME -->` on
   the line immediately after the heading. Sections without that comment
   are local-only — preserved in the file but not pushed.

Adding a new ADO field to sync requires **zero code change** — just add
it to the template (or inline it in the file).

#### Work Item File (`{id}.md`)

```markdown
---
id: 1044
type: User Story
parent: 12345
url: https://dev.azure.com/org/project/_workitems/edit/1044
title: Web | Feature Name
state: Active
assignedTo: Developer Name
areaPath: Project\Area
iterationPath: Project\Sprint1
moscow: Must
priority: 2
storyPoints: 5
tags:
- backend
- api
Custom.ConsultancyProcess: Discovery
Custom.ACProgress: Draft
lastSyncedRevision: 22
lastSyncedAt: 2026-04-24T10:30:00Z
---

## Description
<!-- ado-field: System.Description -->

Description content here...

## Acceptance Criteria
<!-- ado-field: Microsoft.VSTS.Common.AcceptanceCriteria -->

- [ ] Criterion 1
- [ ] Criterion 2

## Agentic Data
<!-- ado-field: Custom.AgenticData -->

Agent-managed notes go here.
```

#### Alias Table

| Alias | Refname |
|-------|---------|
| `title` | `System.Title` |
| `state` | `System.State` |
| `assignedTo` | `System.AssignedTo` |
| `areaPath` | `System.AreaPath` |
| `iterationPath` | `System.IterationPath` |
| `tags` | `System.Tags` |
| `priority` | `Microsoft.VSTS.Common.Priority` |
| `severity` | `Microsoft.VSTS.Common.Severity` |
| `storyPoints` | `Microsoft.VSTS.Scheduling.StoryPoints` |
| `remainingWork` | `Microsoft.VSTS.Scheduling.RemainingWork` |
| `effort` | `Microsoft.VSTS.Scheduling.Effort` |
| `moscow` | `Custom.MoSCoW` |

Any key that doesn't match an alias is treated as a refname directly
(e.g. `Custom.ConsultancyProcess`). Both forms round-trip cleanly.

**Reserved keys** (sync metadata, never sent to ADO):
`id`, `type`, `project`, `parent`, `url`, `lastSyncedRevision`, `lastSyncedAt`.

#### Per-Type Templates

Built-in templates control the default shape for new files. Override any
template by pointing `MCP_ADO_SYNC_TEMPLATE_DIR` at a directory with
matching filenames.

| Type | Body sections (refname) |
|------|------------------------|
| User Story | Description (`System.Description`), Acceptance Criteria (`Microsoft.VSTS.Common.AcceptanceCriteria`), Agentic Data (`Custom.AgenticData`) |
| Bug | Repro Steps (`Microsoft.VSTS.TCM.ReproSteps`), System Info (`Microsoft.VSTS.TCM.SystemInfo`), Agentic Data (`Custom.AgenticData`) |
| Task | Description (`System.Description`) |
| Feature | Description, Acceptance Criteria, Agentic Data |
| Epic | Description, Acceptance Criteria, Agentic Data |

#### Field Discovery

When `sync-work-item-to-file` pulls an ADO field the template doesn't
mention:
- **Short scalars** → added to frontmatter as a raw refname key (e.g.
  `Microsoft.VSTS.Common.ValueArea: Business`).
- **Long-form text** (newlines, HTML, > 200 chars) → emitted as an extra
  annotated body section using a heading derived from the refname
  (`Custom.Howtotest` → `## Howtotest`).

This makes custom fields added in ADO visible in the next pulled file —
then the user can edit the template to control where future pulls place
them.

#### New Work Item File with Parent (`new_{parentId}_{n}.md`)

```markdown
---
type: User Story
state: New
title: New User Story Title
areaPath: MyProject
iterationPath: MyProject
moscow: Must
Custom.ConsultancyProcess: ""
Custom.ACProgress: ""
Custom.AgenticData: ""
parent: 12345
---

> Parent: **#12345** - Feature Title
> Project: MyProject

## Description
<!-- ado-field: System.Description -->



## Acceptance Criteria
<!-- ado-field: Microsoft.VSTS.Common.AcceptanceCriteria -->



## Agentic Data
<!-- ado-field: Custom.AgenticData -->


```

#### Standalone New Work Item (`new_{n}.md`)

```markdown
---
type: Feature
state: New
title: New Feature Title
areaPath: MyProject
iterationPath: MyProject
Custom.AgenticData: ""
---

> Project: MyProject

## Description
<!-- ado-field: System.Description -->



## Acceptance Criteria
<!-- ado-field: Microsoft.VSTS.Common.AcceptanceCriteria -->



## Agentic Data
<!-- ado-field: Custom.AgenticData -->


```

#### Legacy File Fallback (pre-beta.18)

Files generated before the annotation format still parse correctly. A
legacy heading → refname table kicks in when no `<!-- ado-field: X -->`
annotations are present:

| Legacy heading | Refname |
|----------------|---------|
| `# Description` (non-Bug) | `System.Description` |
| `# Description` (Bug type) | `Microsoft.VSTS.TCM.ReproSteps` — fixes long-standing wrong-field bug |
| `# Repro Steps` | `Microsoft.VSTS.TCM.ReproSteps` |
| `# Acceptance Criteria` | `Microsoft.VSTS.Common.AcceptanceCriteria` |
| `# How to Test` | `Custom.Howtotest` (env-overridable) |
| `# Deployment Information` / `# Predeployment Steps` / `# Postdeployment Steps` | Legacy env-overridable refnames |

Pulling a legacy file rewrites it in the annotated format on the next
pull. No explicit migration command required.

#### Tasks File (`{parentId}-tasks.md`)

```markdown
---
parentId: 1044
parentTitle: User Story Title
project: ProjectName
lastSyncedAt: 2026-01-15T10:30:00Z
---

# Tasks for User Story #1044

---

## Task #2001
**Title**: Implement backend
**State**: In Progress
**Assigned To**: Developer
**Original Estimate**: 8
**Remaining Work**: 4
**Completed Work**: 4
**Effort**: 1
**Revision**: 3

### Description

Backend implementation details...

---

## NEW TASK
**Title**: Write tests
**State**: New
**Assigned To**:
**Original Estimate**: 2
**Remaining Work**: 2
**Completed Work**: 0
**Effort**: 1

### Description

New task description...
```

</sync-file-formats>

<sync-field-reference>

### Field Reference

#### Work Item Frontmatter Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | number | For existing items | Missing = new item |
| `title` | string | Yes | Work item title |
| `type` | string | Yes | "User Story", "Bug", "Feature", "Epic", "Task", etc. |
| `state` | string | Yes | "New", "Active", "Resolved", "Closed" |
| `parent` | number | For new items | Parent work item ID |
| `storyPoints` | number | No | Story points estimate |
| `moscow` | string | No | "Must Have", "Should Have", "Could Have", "Won't Have" |
| `tags` | string[] | No | List of tags |
| `areaPath` | string | No | Inherited from parent if not set |
| `iterationPath` | string | No | Inherited from parent if not set |
| `assignedTo` | string | No | Display name (read-only on update) |
| `url` | string | Auto | ADO URL (auto-populated on pull) |
| `lastSyncedRevision` | number | Auto | Tracks sync state |
| `lastSyncedAt` | string | Auto | ISO timestamp of last sync |

#### Task Fields

| Field | Type | Notes |
|-------|------|-------|
| `**Title**` | string | Task title |
| `**State**` | string | "New", "In Progress", "Done" |
| `**Assigned To**` | string | Display name (read-only for updates) |
| `**Original Estimate**` | number | Hours |
| `**Remaining Work**` | number | Hours |
| `**Completed Work**` | number | Hours |
| `**Effort**` | number | Effort points |
| `**Revision**` | number | Sync tracking (auto-managed) |

#### Content Section to ADO Field Mapping (v30.0.0-beta.18+)

Section-to-field mapping is now **declared inline** with
`<!-- ado-field: REFNAME -->` on the line under each `##` heading. The
engine doesn't have a fixed section table — any refname the ADO project
knows about is syncable.

For reference, the built-in templates map these headings to these refnames
by default:

| Template Heading | ADO Refname | Used By |
|------------------|-------------|---------|
| `## Description` | `System.Description` | User Story / Task / Feature / Epic |
| `## Acceptance Criteria` | `Microsoft.VSTS.Common.AcceptanceCriteria` | User Story / Feature / Epic |
| `## Repro Steps` | `Microsoft.VSTS.TCM.ReproSteps` | Bug |
| `## System Info` | `Microsoft.VSTS.TCM.SystemInfo` | Bug |
| `## Agentic Data` | `Custom.AgenticData` | User Story / Bug / Feature / Epic |

Agents can add any additional `##` section with its own annotation
(e.g. `<!-- ado-field: Custom.ConsultancyProcess -->`) and the content
will round-trip — no code or template change required.

</sync-field-reference>

<sync-html-detection>

### HTML Detection and Auto-Conversion

On **pull**, HTML fields are converted to Markdown **in the local file only** — the pull is read-only and never modifies the ADO item or bumps its revision. On **push**, the fields you edited are written back to ADO as Markdown (the point at which a field's ADO format actually changes). `skipAutoConvert: true` disables conversion. HTML tables are converted to Markdown pipe tables (via `turndown-plugin-gfm`); complex tables (merged/styled cells) may lose structure and raise a lossy-conversion warning (`conversionWarnings` in the pull result), with the ADO original always preserved.

**Detection algorithm:**
1. Check for markdown patterns (headings, bold, lists, links)
2. If found, treat as markdown (even with inline HTML)
3. Otherwise, check for structural HTML patterns
4. If HTML patterns found, apply conversion

**HTML indicators (field is HTML):** `<div>`, `<p>`, `<h1-6>`, `<strong>`, `<em>`, `<ul>`, `<ol>`, `<li>`, `<table>`, `<tr>`, `<td>`

**Markdown indicators (field is markdown):** `# Heading`, `**bold**`, `- list item`, `1. numbered`, `` `code` ``, `[link](url)`

`check-work-item-markdown` is now informational only — it no longer blocks syncing.

</sync-html-detection>

<sync-workflows>

### Common Agent Workflows

<workflow name="edit-single-work-item">

**Update a single work item:**

```
1. sync-work-item-to-file(project: "P", workItemIds: [1044])
2. Edit tool on docs/user-stories/1044.md
3. sync-work-item-from-file(project: "P", workItemIds: [1044])
```

</workflow>

<workflow name="pull-feature-children">

**Pull all User Stories under a Feature:**

```
1. sync-work-item-to-file(project: "P", parentId: 12345)
   # Creates: 1044.md, 1045.md, 1046.md, etc.

2. list-synced-work-items()
   # Confirm what was pulled

3. Edit tool on each file as needed

4. sync-work-item-from-file(project: "P")
   # Pushes all changes
```

Pull a different child type:
```
sync-work-item-to-file(project: "P", parentId: 12345, childType: "Bug")
```

</workflow>

<workflow name="create-new-work-items">

**Create multiple new User Stories under a Feature:**

```
1. create-work-item-file(project: "P", parentId: 12345, workItemType: "User Story")
   # Creates: new_12345_1.md

2. create-work-item-file(project: "P", parentId: 12345, workItemType: "User Story")
   # Creates: new_12345_2.md

3. Edit tool on each file to set title, description, acceptance criteria

4. sync-work-item-from-file(project: "P")
   # Pushes all new_*.md files, renames to {id}.md
```

**Create standalone Feature (no parent):**

```
1. create-work-item-file(project: "P", workItemType: "Feature")
   # Creates: new_1.md

2. Edit file

3. sync-work-item-from-file(project: "P")
```

</workflow>

<workflow name="tasks">

**Add tasks to a User Story:**

```
1. sync-tasks-to-file(project: "P", parentIds: [1044])
   # Creates: docs/user-stories/1044-tasks.md

2. Edit tool on 1044-tasks.md to modify existing tasks or add ## NEW TASK sections

3. sync-tasks-from-file(project: "P", parentIds: [1044])
   # Updates existing, creates new tasks
```

**Add a new task (edit the tasks file):**

```markdown
---

## NEW TASK
**Title**: Task title here
**State**: New
**Assigned To**:
**Original Estimate**: 4
**Remaining Work**: 4
**Completed Work**: 0
**Effort**: 1

### Description

Task description here...
```

</workflow>

</sync-workflows>

<sync-file-structure>

### File Structure in Sync Folder

```
docs/user-stories/
├── 1044.md              # Synced User Story #1044
├── 1045.md              # Synced User Story #1045
├── 1044-tasks.md        # Tasks under User Story #1044
├── 1044-comments.md     # Comments (read-only, pulled with includeComments: true)
├── new_12345_1.md       # NEW User Story under Feature #12345
└── new_12345_2.md       # Another NEW User Story (not yet pushed)
```

</sync-file-structure>

<sync-limitations>

### Limitations

1. **Comments:** Comment files (`{id}-comments.md`) are read-only. Pull with `includeComments: true` but cannot push changes back.
2. **assignedTo is read-only on update:** The `assignedTo` frontmatter field is informational; it cannot be changed via sync (use `update-work-item` with patch operations).
3. **No conflict resolution:** If ADO has newer changes since the last pull, push will overwrite them. Check `lastSyncedRevision` before pushing.
4. **Empty optional fields:** When creating new work items, omit optional fields from frontmatter rather than leaving them empty. Empty values can cause issues.

</sync-limitations>

<sync-errors>

### Error Reference

| Error | Cause | Resolution |
|-------|-------|-----------|
| "parent field required" | New file missing parent ID | Add `parent: {featureId}` to frontmatter |
| "title field required" | New file missing title | Add `title: Your Title` to frontmatter |
| "File not found" | Specified ID not synced locally | Pull first with `sync-work-item-to-file` |
| "Write not enabled" | Missing env var | Set `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true` |
| "Invalid work item markdown" | Malformed frontmatter | Ensure `---` delimiters and valid YAML |

</sync-errors>

</work-item-sync-workflow-guide>

<implementation>

## Implementation Architecture

<service-context>

### ServiceContext

```typescript
export interface ServiceContext {
  readonly client: AzureDevOpsClient;
  readonly wiki: WikiService;
  readonly workItem: WorkItemService;
  readonly pullRequest: PullRequestService;
  readonly build: BuildService;
  readonly variableGroup: VariableGroupService;
  readonly sync: SyncService;
  readonly configuration: ConfigurationService;
  readonly checklist: ChecklistService;
}
```

All services are lazy-initialized via getter properties in `createServiceContext()`. The `context-factory.ts` file mirrors `index.ts` factory for CLI use.

</service-context>

<package-structure>

### Package Structure

```
packages/azure-devops/src/
  index.ts                    # MCP server entry point
  context-factory.ts          # Shared createServiceContext() for CLI
  azure-devops-client.ts      # Authenticated HTTP client
  types.ts                    # ServiceContext interface
  tool-examples.ts            # descWithExamples() + example arrays
  cli.ts                      # CLI entry point (Commander.js)
  models/
    api-types.ts              # Shared TypeScript types
  services/
    wiki-service.ts
    work-item-service.ts
    pull-request-service.ts
    build-service.ts
    variable-group-service.ts
    sync-service.ts
    configuration-service.ts
    checklist-service.ts
  sync/                       # Sync module (used by SyncService)
    html-detection.ts         # HTML vs markdown detection
    markdown-serializer.ts    # Work item ↔ markdown conversion
    file-utils.ts             # File system operations
    git-utils.ts              # Git auto-commit helpers
  tools/
    index.ts                  # registerAllTools() aggregator
    wiki-tools.ts             # 9 wiki tools
    work-item-tools.ts        # 10 work item tools
    pull-request-tools.ts     # 6 read + 6 write PR tools
    build-tools.ts            # 3 build tools
    variable-group-tools.ts   # 2 variable group tools
    sync-tools.ts             # 8 sync tools
    checklist-tools.ts        # 8 checklist tools
    configuration-tools.ts    # 1 configuration tool
  prompts/
    index.ts                  # registerAllPrompts()
    templates.ts              # Prompt formatters
  cli/
    output.ts                 # Cache dir: .mcp-ado-cache
    commands/
      index.ts                # registerAllCommands()
      wiki-commands.ts
      work-item-commands.ts
      pull-request-commands.ts
      build-commands.ts
      variable-group-commands.ts
      sync-commands.ts
      configuration-commands.ts
```

</package-structure>

<type-definitions>

### Key Type Definitions

```typescript
// Build status values
type BuildStatus = 'none' | 'inProgress' | 'completed' | 'cancelling' | 'postponed' | 'notStarted';
type BuildResult = 'none' | 'succeeded' | 'partiallySucceeded' | 'failed' | 'canceled';

// Timeline record
interface TimelineRecord {
  id: string;
  parentId?: string;
  type: 'Stage' | 'Phase' | 'Job' | 'Task' | 'Checkpoint';
  name: string;
  state: 'pending' | 'inProgress' | 'completed';
  result: 'succeeded' | 'succeededWithIssues' | 'failed' | 'canceled' | 'skipped' | 'abandoned';
  startTime?: string;
  finishTime?: string;
  errorCount: number;
  warningCount: number;
}
```

</type-definitions>

</implementation>

<cli-architecture>

## CLI Architecture

The CLI reuses the same services and ServiceContext as the MCP server. Binary: `mcp-ado-cli`.

### Command Groups

| Group | Commands | Maps to Tools |
|-------|----------|--------------|
| `wiki` | list, search, get, tree, create, update, str-replace | get-wikis, search-wiki-pages, get-wiki-page, get-wiki-tree, create-wiki-page, update-wiki-page, ado-str-replace-wiki |
| `work-item` | get, query, run-saved-query, get-saved-query, comments, add-comment, update-comment, update, create, delete | All work item tools |
| `pull-request` | list, get, files, comments, create, update, complete, vote, reply, add-thread | All PR tools |
| `build` | status, timeline, logs | get-build-status, get-build-timeline, get-build-logs |
| `variable-group` | list, get | get-variable-groups, get-variable-group |
| `sync` | pull, push, create-file, check, list, pull-tasks, push-tasks | All sync tools |
| `checklist` | get, template, list-templates, report, update-item, add-item, remove-item, update-template | All checklist tools |
| `test` | create-run, add-results, complete-run, list-runs, run-results, case-history, link-case | All test management tools |
| `configuration` | show | get-configuration |

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Raw JSON output (bypasses summary) |
| `--no-cache` | Skip writing to cache directory |
| `--env-file <path>` | Custom .env file path |

### Output Pattern

Summary written to stdout. Full JSON cached to `.context/.mcp-ado-cache/`.

### Parameter Mapping Convention

| MCP Tool (Zod) | CLI Command (Commander) |
|----------------|------------------------|
| Required `z.string()` | Positional argument: `<arg>` |
| Required `z.number()` | Positional argument `<arg>` (parsed with `parseInt`) |
| Optional `z.string().optional()` | Option flag: `--flag <value>` |
| Optional `z.boolean().optional()` | Boolean flag: `--flag` |
| Optional `z.number().optional()` | Option: `--count <n>` (parsed with `parseInt`) |
| Complex `z.object()` | JSON string argument, parsed with `JSON.parse()` |

### Example Commands

```bash
# Wiki
mcp-ado-cli wiki list MyProject
mcp-ado-cli wiki get-page MyProject Acme.wiki "/Setup/Authentication"
mcp-ado-cli wiki str-replace MyProject Acme.wiki "/Page" "old text" "new text"

# Work items
mcp-ado-cli work-item get MyProject 1044
mcp-ado-cli work-item query MyProject "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'"

# Pull requests
mcp-ado-cli pull-request list MyProject --repository MyRepo
mcp-ado-cli pull-request get MyProject MyRepo 123

# Sync
mcp-ado-cli sync pull MyProject --work-item-ids 1044,1045
mcp-ado-cli sync push MyProject
mcp-ado-cli sync pull-tasks MyProject --parent-ids 1044

# Test management
mcp-ado-cli test create-run MyProject "Plugin Test — #1928"
mcp-ado-cli test add-results MyProject 175 '[{"title":"Validate fields","outcome":"Passed"}]'
mcp-ado-cli test complete-run MyProject 175
mcp-ado-cli test list-runs MyProject --state Completed
mcp-ado-cli test run-results MyProject 175
mcp-ado-cli test case-history MyProject 1930
mcp-ado-cli test link-case MyProject 1930 --story-id 1928 --run-id 175

# JSON output
mcp-ado-cli --json wiki list MyProject
```

</cli-architecture>

<security>

## Security Considerations

1. **Secrets masking:** Variable values marked `isSecret` are never returned in API responses
2. **Write isolation:** Each write domain has its own feature flag — enable only what is needed for the task
3. **PAT scope minimum:** Request only the PAT scopes required for your operations
4. **No test environment:** Always confirm the target project with the user before write operations — there is no pre-configured safe test environment
5. **Sync folder:** The sync folder writes to the local filesystem; ensure it is within the project working directory and not accidentally committed with sensitive data

</security>
