# Azure DevOps Package Guide

## Overview

Azure DevOps integration for wiki access, work item management, pull requests, build troubleshooting, and local work item sync.

- **Tools:** 58 tools (65 with PR write enabled), 4 prompts
- **Authentication:** Personal Access Token (PAT) or Entra ID App Registration (client credentials)

> **Admin Tools:** For pipelines, service connections, agent pools, and environments, see `@mcp-consultant-tools/azure-devops-admin`

## Downstream skill — keep in sync

The work-item sync surface (file format, annotation rules, push/pull semantics, gotchas) is mirrored in the `ado-pulling-pushing-items-m` skill at:

`<your-skills-directory>/ado-pulling-pushing-items-m/SKILL.md`

When you change anything that affects how `sync-work-item-to-file` / `sync-work-item-from-file` / `sync-tasks-*` parse, serialize, or round-trip data — especially the annotation parser, the markdown serializer, or any field-mapping behaviour — also update that skill. The skill's "Critical Gotchas" and "Annotation-driven sync format" sections are the agent-facing contract for what's safe to do in a synced markdown file. Drift between this package and the skill produces silent data-loss bugs in client workflows.

## Bug content is analysed by AI — PII rule

Bug bodies, repro steps, and comments are routinely read by AI agents (this package's `get-work-item`, `query-work-items`, and the `sync-work-item-to-file` flow all surface that text directly into the agent's context). Anyone raising or editing a bug must treat the content as agent-visible:

- Do **not** paste raw PII into bug content — names, emails, phone numbers, addresses, dates of birth, or any directly identifying member/customer IDs.
- Replace each such value with a **reference ID** (CRM contact GUID, member number, account ID). The agent resolves those via the appropriate MCP tool, with the destination system's redaction pipeline applied at fetch time.
- Redact PII in screenshots before attaching.

**Why this is binding on bug authors and not just the agent:** raw PII pasted into a bug ends up in the agent's context. If the agent then constructs a Dataverse `query-records` filter from that string, the filter is recorded verbatim in the audit log — there's no platform-side redaction over filter parameters. Closing the channel at the bug-authoring step is the cleanest control. See `packages/powerplatform-data/CLAUDE.md` "Operator responsibility — PII in filters" and `docs/documentation/audit-logging.md` "Operator responsibility — filter parameters and PII" for the full picture. ADO-side PII redaction is on the Phase C roadmap; this rule is the operator-side control until it lands.

## Environment Configuration

```bash
# Required
AZUREDEVOPS_ORGANIZATION=your-organization-name
AZUREDEVOPS_PROJECTS=Project1,Project2

# Authentication (choose one)
# Option A: Personal Access Token
AZUREDEVOPS_PAT=your-personal-access-token-here

# Option B: Entra ID App Registration (overrides PAT if both set)
AZUREDEVOPS_TENANT_ID=your-tenant-id
AZUREDEVOPS_CLIENT_ID=your-client-id
AZUREDEVOPS_CLIENT_SECRET=your-client-secret

# Optional
AZUREDEVOPS_API_VERSION=7.1

# Write permissions (all default to false)
AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=false
AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=false
AZUREDEVOPS_ENABLE_WIKI_WRITE=false
AZUREDEVOPS_ENABLE_WIKI_DELETE=false
AZUREDEVOPS_ENABLE_PR_WRITE=false

# Comment format for work item comments
AZUREDEVOPS_COMMENT_FORMAT=markdown  # or 'html' for legacy orgs

# Work Item Sync (local markdown files)
AZUREDEVOPS_SYNC_FOLDER=docs/user-stories  # Default folder for synced files
AZUREDEVOPS_SYNC_AUTO_COMMIT=false          # Auto-commit pulled files to git

# Sync templates (annotation-driven file format, v30.0.0-beta.18+)
MCP_ADO_SYNC_TEMPLATE_DIR=                  # Optional: override built-in per-type templates
                                             # Provide a directory containing {type-slug}.md
                                             # (user-story.md, bug.md, task.md, feature.md, epic.md).
                                             # Unset = use built-ins shipped with the package.

# Legacy custom-field overrides (v30.0.0-beta.16 and earlier — parse-only after beta.18)
# These env vars are consulted ONLY when reading pre-annotation files so legacy
# heading → refname fallback resolves to your custom field GUIDs. New installs
# should instead ship custom templates via MCP_ADO_SYNC_TEMPLATE_DIR.
AZUREDEVOPS_SYNC_FIELD_HOW_TO_TEST=Custom.Howtotest
AZUREDEVOPS_SYNC_FIELD_DEPLOYMENT_INFO=Custom.Deploymentinformation
AZUREDEVOPS_SYNC_FIELD_PREDEPLOY=Custom.7519d1bc-5305-4905-822b-2b380e61b154
AZUREDEVOPS_SYNC_FIELD_POSTDEPLOY=Custom.abd6763f-a242-4938-85ed-bda419e34e7e
```

## Test Environment

**No pre-configured test environment.** Ask user before using any ADO tools to avoid modifying their projects.

## URL Construction

**Use `get-configuration` tool** to retrieve the configured organization and projects. Never guess these values.

**URL patterns:**
- Work items: `https://dev.azure.com/{organization}/{project}/_workitems/edit/{id}`
- PRs: `https://dev.azure.com/{organization}/{project}/_git/{repo}/pullrequest/{id}`
- Wiki: `https://dev.azure.com/{organization}/{project}/_wiki/wikis/{wikiName}/{pagePath}`

**Always call `get-configuration` first** when you need to construct URLs or determine which project a work item belongs to.

## Key Implementation Details

### Wiki Path Conversion

Azure DevOps wikis use URL-encoded paths. The service handles conversion:
- Display path: `/Setup/Authentication`
- API path: `/Setup%2FAuthentication`

The `get-wiki-page` and `update-wiki-page` tools accept human-readable paths and convert automatically.

### String Replacement Tool

`azuredevops-str-replace-wiki-page` provides targeted wiki edits:
- Finds unique string in page content
- Replaces with new content
- Preserves rest of page
- `replace_all: true` for multiple occurrences

Safer than full page replacement for small changes.

### Wiki Page File Sync

`save-wiki-page-to-file` and `upload-wiki-page-from-file` provide token-efficient wiki editing:
- Download: saves wiki page as local `.md` file with YAML frontmatter
- Edit: agent uses Edit tool on the local file
- Upload: reads frontmatter metadata and pushes content back to ADO

```bash
# 1. Download wiki page to local file
save-wiki-page-to-file(project, wikiId, "/Setup/Auth", "./wiki-auth.md")

# 2. Edit locally with Edit tool...

# 3. Upload back to ADO
upload-wiki-page-from-file("./wiki-auth.md")
```

Frontmatter includes: project, wikiId, pagePath, version (etag), lastDownloaded.

### Work Item WIQL Queries

```sql
SELECT [System.Id], [System.Title], [System.State]
FROM WorkItems
WHERE [System.TeamProject] = 'MyProject'
  AND [System.State] = 'Active'
  AND [System.AssignedTo] = @Me
ORDER BY [System.ChangedDate] DESC
```

## Pull Request Tools (v27+)

Read-only tools (always available):
- `list-repositories` - List Git repos in project
- `list-pull-requests` - List PRs with status filter
- `get-pull-request` - Get PR details, reviewers, votes
- `get-pull-request-threads` - Get comments/discussions
- `get-pull-request-commits` - Get commits in PR
- `get-pull-request-changes` - Get file changes

Write tools (require `AZUREDEVOPS_ENABLE_PR_WRITE=true`):
- `add-pull-request-thread` - Add comment/feedback
- `create-pull-request` - Create a new PR
- `update-pull-request` - Update title/description/status/draft
- `complete-pull-request` - Merge with strategy options (squash, rebase, etc.)
- `add-pr-reviewer` - Add or remove reviewers
- `vote-pull-request` - Submit vote (approve/reject/etc.)
- `reply-to-pr-thread` - Reply to thread + optionally update status

### URL Parsing Helper

Given a PR URL like `https://dev.azure.com/org/Project/_git/Repo/pullrequest/123`:
- project = "Project"
- repositoryId = "Repo" (or use `list-repositories` to get GUID)
- pullRequestId = 123

### Vote Values

| Vote | Label |
|------|-------|
| -10 | Rejected |
| -5 | Waiting for author |
| 0 | No response |
| 5 | Approved with suggestions |
| 10 | Approved |

## Work Item Sync Tools (v27+)

Token-efficient local editing by syncing ADO work items to markdown files.

**Benefits:**
- ~10-50x token reduction per work item
- Edit with standard `Edit` tool instead of API calls
- Track changes with git

**Tools:**
- `sync-work-item-to-file` - Pull work item(s) to local markdown. Can also pull all children of a parent (e.g., all User Stories under a Feature)
- `sync-work-item-from-file` - Push local changes back to ADO. Auto-detects new_*.md files to create new work items (requires `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`)
- `create-work-item-file` - Create a new work item template file locally for any type (User Story, Bug, Feature, Epic, Task). Parent is optional.
- `create-user-story-file` - Backward-compatible alias for `create-work-item-file` with type='User Story' (requires parentId)
- `check-work-item-markdown` - Inspect whether fields are markdown or HTML (HTML fields still sync — they auto-convert to markdown locally on pull; this tool no longer gates syncing)
- `list-synced-work-items` - List locally synced files

**Workflow: Edit Existing Work Items**
```bash
# 1. Check if work item is syncable (markdown not HTML)
check-work-item-markdown(project, [1044])

# 2. Pull to local file
sync-work-item-to-file(project, [1044])
# Creates: docs/user-stories/1044.md

# 3. Edit the file with Edit tool
# ...make changes...

# 4. Push back to ADO
sync-work-item-from-file(project, [1044])
```

**Workflow: Pull All User Stories Under a Feature**
```bash
# Pull all User Stories under Feature #12345
sync-work-item-to-file(project, parentId: 12345)
# Creates: docs/user-stories/1044.md, 1045.md, 1046.md, etc.

# Or pull a specific type
sync-work-item-to-file(project, parentId: 12345, childType: "Bug")
```

**Workflow: Create New Work Items (Any Type)**
```bash
# 1a. Create a User Story under a Feature (with parent)
create-work-item-file(project, parentId: 12345, workItemType: "User Story")
# Creates: docs/user-stories/new_12345_1.md

# 1b. Create a standalone Feature (no parent)
create-work-item-file(project, workItemType: "Feature")
# Creates: docs/user-stories/new_1.md

# 2. Edit the file to add title, description, and acceptance criteria
# ...make changes...

# 3. Push to ADO (auto-detects new_*.md files)
sync-work-item-from-file(project)
# Creates the work item in ADO (with parent link if specified)
# Renames file to {newId}.md (e.g., 1047.md)
```

**File Format (v30.0.0-beta.18+ — annotation-driven):**

Two channels:
1. **Frontmatter keys** are ADO reference names (with friendly aliases for the common ones).
2. **Body sections** are tagged with `<!-- ado-field: REFNAME -->` on the line after the `##` heading.

```markdown
---
id: 1044
type: User Story
parent: 12345
url: https://dev.azure.com/...
title: Web | Feature Name
state: Active
assignedTo: Jane Doe
areaPath: Project\Area
iterationPath: Project\Sprint 42
moscow: Must
priority: 2
storyPoints: 5
Custom.ConsultancyProcess: Discovery
Custom.ACProgress: Draft
lastSyncedRevision: 22
lastSyncedAt: 2026-04-24T10:00:00Z
---

## Description
<!-- ado-field: System.Description -->

Your description content...

## Acceptance Criteria
<!-- ado-field: Microsoft.VSTS.Common.AcceptanceCriteria -->

Your AC content...

## Agentic Data
<!-- ado-field: Custom.AgenticData -->

Anything the agent wants to persist on the work item.
```

**Frontmatter alias table** (all friendly keys resolve to refnames):

| Alias | Refname |
|-------|---------|
| `title` | `System.Title` |
| `state` | `System.State` |
| `assignedTo` | `System.AssignedTo` |
| `areaPath` | `System.AreaPath` |
| `iterationPath` | `System.IterationPath` |
| `tags` | `System.Tags` (array) |
| `priority` | `Microsoft.VSTS.Common.Priority` |
| `severity` | `Microsoft.VSTS.Common.Severity` |
| `storyPoints` | `Microsoft.VSTS.Scheduling.StoryPoints` |
| `remainingWork` | `Microsoft.VSTS.Scheduling.RemainingWork` |
| `effort` | `Microsoft.VSTS.Scheduling.Effort` |
| `moscow` | `Custom.MoSCoW` |

Any key that doesn't match an alias is treated as a raw refname (e.g.
`Custom.ConsultancyProcess: "Discovery"`). Adding a new ADO custom field to
sync is just adding one line — no code change.

**Reserved frontmatter keys** (not sent to ADO): `id`, `type`, `project`,
`parent`, `url`, `lastSyncedRevision`, `lastSyncedAt`.

**Body sections** map heading-content to a single refname. The
`<!-- ado-field: REFNAME -->` comment MUST be the first non-empty line after
the `##` heading. A `##` heading WITHOUT this comment is **not** treated as
a section boundary — it is preserved as content of whichever annotated
section currently encloses it. This means a field body (e.g. Repro Steps)
may contain its own `##` headings without truncating the field on push.

**Templates per work item type** (`create-work-item-file` uses these):

| Type | Body sections |
|------|---------------|
| User Story | Description, Acceptance Criteria, Agentic Data |
| Bug | Repro Steps (→ `Microsoft.VSTS.TCM.ReproSteps`), System Info, Agentic Data |
| Task | Description |
| Feature | Description, Acceptance Criteria, Agentic Data |
| Epic | Description, Acceptance Criteria, Agentic Data |

Override any template by setting `MCP_ADO_SYNC_TEMPLATE_DIR` to a directory
containing `{type-slug}.md` files. Placeholder `{{project}}` is substituted
in default values at render time.

**File Format (New Work Item with Parent - `new_{parentId}_{seq}.md`):**
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

**Legacy files** (generated pre-beta.18, no annotations) continue to parse
via a legacy heading→refname fallback:

| Legacy heading | Refname |
|----------------|---------|
| `# Description` (non-Bug) | `System.Description` |
| `# Description` (Bug type) | `Microsoft.VSTS.TCM.ReproSteps` — fixes a long-standing bug |
| `# Repro Steps` | `Microsoft.VSTS.TCM.ReproSteps` |
| `# Acceptance Criteria` | `Microsoft.VSTS.Common.AcceptanceCriteria` |
| `# How to Test` | `Custom.Howtotest` (overridable via `AZUREDEVOPS_SYNC_FIELD_HOW_TO_TEST` at legacy-parse time) |
| `# Deployment Information` / `# Predeployment Steps` / `# Postdeployment Steps` | As per legacy env vars (preserved for legacy parse only) |

Pulling a legacy file rewrites it in the annotated format on the next pull.
No migration command required; `sync-work-item-to-file` does it as a side
effect.

**Limitations:**
- HTML body fields auto-convert to Markdown — on **pull** in the local file only (read-only; the ADO item is never modified or revision-bumped). On **push**, only fields you actually edited are written back (as Markdown); a field you didn't touch keeps its original ADO HTML. The push compares your local Markdown against the Markdown the pull would produce, so an unedited HTML field — including a complex table — is left untouched (`buildPatchOperations` / `buildTaskPatchOperations` change-detection). HTML tables become Markdown pipe tables; complex tables raise a lossy-conversion warning with the ADO original preserved (`sync-work-item-to-file` returns `conversionWarnings`)
- Comments are read-only (can pull but not push) — but image references in comment bodies ARE downloaded and rewritten on pull
- Task sync (task-serializer.ts) still uses the pre-annotation format — out of scope for this change

### Image attachments (v30.0.0-beta.16+)

Embedded `<img>` tags pointing at `_apis/wit/attachments/{guid}` are now first-class on sync.

**Pull:**
- Each ADO attachment in any field (Description, Repro Steps, AC, custom HTML, comments) is downloaded to `{syncFolder}/{workItemId}/attachments/{guid}-{filename}`.
- The `src` is rewritten to `./attachments/{guid}-{filename}` so any markdown viewer renders the image inline.
- A manifest at `{syncFolder}/{workItemId}/.attachments.json` records each attachment's GUID, original ADO URL, and local path.
- Already-downloaded attachments are not re-fetched on subsequent pulls (manifest hit).

**Push:**
- Manifest hits → src rewritten back to original ADO URL (no re-upload, ADO sees no attachment change).
- New local images (e.g. dropped in by the agent) → uploaded via `_apis/wit/attachments`, recorded in the manifest, src rewritten to the new ADO URL.
- Removed local images → simply not referenced in pushed HTML. The ADO attachment is **never deleted** (manifest entry stays; agent decides what's referenced).

**Standalone upload:**
```bash
upload-work-item-attachment(project, filePath: "/tmp/screenshot.png", workItemId: 73702)
# → { url, id, fileName, embedUrl }
# Embed embedUrl in any <img src="..."> inside a comment, AC, custom field, etc.
```

When `workItemId` is provided, the upload is recorded in that work item's manifest so the next sync push recognises it as already on ADO.

CLI equivalent: `mcp-ado-cli work-item upload-attachment <project> <filePath> [--work-item-id <id>]`.

Requires `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`.

### Repro Steps as a synced field (v30.0.0-beta.16+)

`Microsoft.VSTS.TCM.ReproSteps` (used primarily by Bug work items) now syncs alongside Description and Acceptance Criteria. A new `# Repro Steps` section appears between Description and AC in pulled markdown when the field is non-empty. HTML ReproSteps gets the same read-only, local auto-convert-to-markdown treatment on pull as Description (the ADO field keeps its HTML until edited and pushed). `ParsedWorkItemFile.reproSteps: string` is the new property.

## Build Troubleshooting Tools

Read-only tools for investigating build/pipeline failures:

- `get-build-status` - Get build status with optional timeline/logs
- `get-build-timeline` - Step-by-step breakdown with filtering
- `get-build-logs` - List logs or get specific log content

**Usage:**
```bash
# Quick status check
get-build-status(project="MyProject", buildId=12345)

# See what failed (default scope='problems' shows only errors/warnings)
get-build-status(project="MyProject", buildId=12345, detail="timeline")

# Get specific log content
get-build-logs(project="MyProject", buildId=12345, logId=7)
```

**Timeline Scopes:**
- `problems` (default) - Only errors, warnings, failures
- `stages` - Stage-level summary
- `jobs` - Stages + jobs
- `all` - Everything (can be large)

> **Note:** These tools are also available in `azure-devops-admin`. If you update these, also update the other package.

## Task Sync Tools (v27.0.0-beta.2+)

Sync tasks under a User Story with **upsert** semantics (update existing, create new).

**Tools:**
- `sync-tasks-to-file` - Pull all tasks for parent User Story(s) to local markdown
- `sync-tasks-from-file` - Push local task changes back to ADO (update/create)

**Task Fields Supported:**
- Title, Description
- Original Estimate, Remaining Work, Completed Work (hours)
- Effort, State

**Workflow:**
```bash
# 1. Pull all tasks for a User Story
sync-tasks-to-file(project, [12345])
# Creates: docs/user-stories/12345-tasks.md

# 2. Edit tasks or add new ones in the file
# - Existing tasks: ## Task #12347
# - New tasks: ## NEW TASK

# 3. Push changes back (upsert)
sync-tasks-from-file(project, [12345])
# - Updates existing tasks
# - Creates new tasks and updates file with IDs
```

**File Format:**
```markdown
---
parentId: 12345
parentTitle: API | User Story Title
project: Acme
lastSyncedAt: 2026-01-14T10:30:00Z
---

# Tasks for User Story #12345

---

## Task #12347
**Title**: Implement API endpoint
**State**: In Progress
**Assigned To**: Jane Doe
**Original Estimate**: 5
**Remaining Work**: 3
**Completed Work**: 2
**Effort**: 1
**Revision**: 1

### Description

Task description here...

---

## NEW TASK
**Title**: Add integration tests
**State**: New
**Assigned To**:
**Original Estimate**: 2
**Remaining Work**: 2
**Completed Work**: 0
**Effort**: 1

### Description

New task description...
```

## Checklist Tools (v28+)

Read/write tools for the `mohitbagra/workitem-checklist` Azure DevOps extension. Checklists are stored in the Extension Data Service, not in work item fields.

**Read tools (always available):**
- `get-checklist` - Get merged checklist for a work item (template + overrides + custom items)
- `get-checklist-template` - Get default template for a work item type
- `list-checklist-templates` - List all templates in a project
- `get-checklist-report` - Completion report across work items (cross-references with ADO work items)

**Write tools (require `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`):**
- `update-checklist-item` - Update state of a checklist item (New/In Progress/Blocked/N/A/Completed)
- `add-checklist-item` - Add custom item to shared checklist
- `remove-checklist-item` - Remove custom item from shared checklist
- `update-checklist-template` - Update default template for a work item type

**Usage:**
```bash
# Get checklist for a work item
get-checklist(project="MyProject", workItemId=1055)

# Mark item as completed
update-checklist-item(project="MyProject", workItemId=1055, itemId="1748659733038", state="Completed")

# Get completion report for all active User Stories
get-checklist-report(project="MyProject", workItemType="User Story", workItemState="Active")
```

**Key concepts:**
- Templates define standard items per work item type (e.g., all User Stories get the same checklist)
- Overrides store per-work-item state (completed, in progress, etc.)
- Custom items are additional items added to specific work items
- The merge-on-read pattern combines template + overrides + custom items at read time

## Test Management Tools (v30+)

Tools for creating and managing automated test runs via the ADO Test Management API (`_apis/test/`). Uses the Basic license endpoint — does NOT require the Azure Test Plans extension.

**Key design decisions:**
- All runs set `isAutomated: true` to bypass the Test Plan requirement
- Test case ↔ run links use Hyperlinks (ADO doesn't support artifact links to test runs)
- Test case ↔ story links use `Microsoft.VSTS.Common.TestedBy` relation type

**Tools:**
- `create-test-run` - Create automated test run (no Test Plan needed)
- `add-test-results` - Add per-step/per-case results with outcomes
- `complete-test-run` - Mark run as completed, get summary
- `get-test-runs` - List runs with state/date filters
- `get-test-run-results` - Get detailed results for a run
- `get-test-case-history` - Run history for a Test Case work item
- `link-test-case` - Link test case to story (TestedBy) and/or run (Hyperlink)

**Workflow:**
```bash
# 1. Create a test run
create-test-run(project="MyProject", name="Plugin Test — #1928 — 2026-04-10")

# 2. Add results
add-test-results(project="MyProject", runId=175, results=[
  { title: "Validate required fields", outcome: "Passed", comment: "All 4 fields validated" },
  { title: "Check duplicate detection", outcome: "Failed", comment: "Expected error not thrown" }
])

# 3. Complete the run
complete-test-run(project="MyProject", runId=175, comment="7/8 passed, 1 duplicate detection failure")

# 4. Link test case to story and run
link-test-case(project="MyProject", testCaseId=1930, storyId=1928, runId=175, runSummary="7/8 Passed")
```

**Key gotchas:**
- `isAutomated: true` is set automatically — no Test Plan needed
- `_apis/testplan/` endpoints require Azure Test Plans license (extra cost) — these tools avoid them
- Test run ↔ work item links are Hyperlinks, not artifact links (ADO limitation)
- `testCase.id` on results doesn't create backlinks on the work item — use `link-test-case` explicitly

## Reference

See `docs/technical/AZURE_DEVOPS_TECHNICAL.md` for detailed implementation.

## CLI Usage

Binary: `mcp-ado-cli`

```bash
# List wikis
mcp-ado-cli wiki list MyProject

# Get work item
mcp-ado-cli work-item get MyProject 12345

# List pull requests
mcp-ado-cli pull-request list MyProject --repository MyRepo

# Test runs
mcp-ado-cli test create-run MyProject "Plugin Test — #1928"
mcp-ado-cli test list-runs MyProject --state Completed
mcp-ado-cli test run-results MyProject 175
mcp-ado-cli test case-history MyProject 1930
mcp-ado-cli test link-case MyProject 1930 --story-id 1928 --run-id 175

# JSON output
mcp-ado-cli --json wiki list MyProject
```
