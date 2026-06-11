# Azure DevOps Local Markdown Items Guide

[[_TOC_]]

**Purpose:** Agentic guide for working with ADO work items via local markdown files - editing, creating, and syncing User Stories and Tasks.

**Why:** Token-efficient alternative to API calls. Edit work items using the `Edit` tool on local files instead of repeated MCP calls. ~10-50x token reduction per work item.

**Default sync folder:** `docs/user-stories/` (configurable via `AZUREDEVOPS_SYNC_FOLDER`)

---

## Quick Reference

| Action                               | MCP Tool                   | File Pattern               | Notes                                       |
|--------------------------------------|----------------------------|----------------------------|---------------------------------------------|
| Pull existing work items             | `sync-work-item-to-file`   | `{id}.md`                  | Downloads from ADO to local                 |
| Pull all children of parent          | `sync-work-item-to-file`   | `{id}.md` (multiple)       | Use `parentId` parameter                    |
| Push changes to ADO                  | `sync-work-item-from-file` | `{id}.md`                  | Updates existing work items                 |
| Create new user story template       | `create-user-story-file`   | `new_{parentId}_{n}.md`    | Creates empty template file                 |
| Push new work items to ADO           | `sync-work-item-from-file` | `new_*.md` (auto-detected) | Creates in ADO, renames to `{id}.md`        |
| Pull tasks for user story            | `sync-tasks-to-file`       | `{parentId}-tasks.md`      | Downloads all tasks under parent            |
| Update/create tasks                  | `sync-tasks-from-file`     | `{parentId}-tasks.md`      | Upsert semantics                            |
| Check field format compatibility     | `check-work-item-markdown` | N/A                        | Verifies markdown vs HTML fields            |
| List locally synced files            | `list-synced-work-items`   | N/A                        | Shows what's been pulled                    |

---

## Tool Reference

### sync-work-item-to-file

**Purpose:** Download work item(s) from ADO and save as local markdown files.

**Parameters:**

| Parameter          | Type       | Required | Default                | Description                                          |
|--------------------|------------|----------|------------------------|------------------------------------------------------|
| `project`          | string     | Yes      | -                      | The ADO project name                                 |
| `workItemIds`      | number[]   | No       | `[]`                   | Specific work item IDs to pull                       |
| `parentId`         | number     | No       | -                      | Pull all children of this parent (e.g., Feature ID)  |
| `childType`        | string     | No       | `"User Story"`         | Filter child type when using `parentId`              |
| `folder`           | string     | No       | `docs/user-stories`    | Override sync folder path                            |
| `includeComments`  | boolean    | No       | `false`                | Also save comments to `{id}-comments.md`             |
| `skipAutoConvert`  | boolean    | No       | `false`                | Skip HTML-to-markdown conversion                     |

**Usage Examples:**

```
# Pull specific work items
sync-work-item-to-file(project: "MyProject", workItemIds: [1044, 1045])

# Pull all User Stories under a Feature
sync-work-item-to-file(project: "MyProject", parentId: 12345)

# Pull all Bugs under a Feature
sync-work-item-to-file(project: "MyProject", parentId: 12345, childType: "Bug")

# Pull with comments
sync-work-item-to-file(project: "MyProject", workItemIds: [1044], includeComments: true)
```

**Behavior:**
1. **Read-only against ADO** — downloads the item; never writes to or modifies it, never bumps its revision.
2. HTML fields are converted to Markdown **in the local file only** (the ADO item keeps its HTML). HTML tables become Markdown pipe tables; complex tables (merged/styled cells) may lose structure and raise a `⚠️ TABLE CONVERSION` warning in the result — re-read with `get-work-item` to verify before editing.
3. `skipAutoConvert: true` skips conversion; items whose body fields are still HTML are then reported under `skipped` rather than written with blank fields.

---

### sync-work-item-from-file

**Purpose:** Upload local markdown changes back to ADO. Auto-detects and creates new work items from `new_*.md` files.

**Requires:** `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`

**Parameters:**

| Parameter          | Type       | Required | Default             | Description                                       |
|--------------------|------------|----------|---------------------|---------------------------------------------------|
| `project`          | string     | Yes      | -                   | The ADO project name                              |
| `workItemIds`      | number[]   | No       | `[]`                | Specific IDs to push (optional - new files auto-detected) |
| `folder`           | string     | No       | `docs/user-stories` | Override sync folder path                         |
| `skipAutoConvert`  | boolean    | No       | `false`             | Skip HTML-to-markdown conversion                  |

**Usage Examples:**

```
# Push specific work items
sync-work-item-from-file(project: "MyProject", workItemIds: [1044, 1045])

# Push all changes (including new_*.md files)
sync-work-item-from-file(project: "MyProject")
```

**Behavior:**
1. For files with `id` in frontmatter: Updates existing work item in ADO
2. For `new_*.md` files: Creates new work item, then renames file to `{newId}.md`
3. Auto-converts HTML fields to markdown format unless `skipAutoConvert: true`

---

### create-user-story-file

**Purpose:** Create a new user story template file locally. Edit it, then push to ADO using `sync-work-item-from-file`.

**Parameters:**

| Parameter   | Type     | Required | Default             | Description                              |
|-------------|----------|----------|---------------------|------------------------------------------|
| `project`   | string   | Yes      | -                   | The ADO project name                     |
| `parentId`  | number   | Yes      | -                   | Parent Feature ID for the new story      |
| `folder`    | string   | No       | `docs/user-stories` | Override sync folder path                |

**Usage Example:**

```
create-user-story-file(project: "MyProject", parentId: 12345)
# Creates: docs/user-stories/new_12345_1.md
```

---

### sync-tasks-to-file

**Purpose:** Download all tasks under a parent User Story to a local markdown file.

**Parameters:**

| Parameter          | Type       | Required | Default             | Description                                  |
|--------------------|------------|----------|---------------------|----------------------------------------------|
| `project`          | string     | Yes      | -                   | The ADO project name                         |
| `parentIds`        | number[]   | Yes      | -                   | Parent User Story IDs to fetch tasks for     |
| `folder`           | string     | No       | `docs/user-stories` | Override sync folder path                    |
| `skipAutoConvert`  | boolean    | No       | `false`             | Skip HTML-to-markdown conversion             |

**Usage Example:**

```
sync-tasks-to-file(project: "MyProject", parentIds: [1044, 1045])
# Creates: docs/user-stories/1044-tasks.md, 1045-tasks.md
```

---

### sync-tasks-from-file

**Purpose:** Push local task changes back to ADO. Uses upsert semantics - updates existing tasks and creates new ones.

**Requires:** `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`

**Parameters:**

| Parameter          | Type       | Required | Default             | Description                              |
|--------------------|------------|----------|---------------------|------------------------------------------|
| `project`          | string     | Yes      | -                   | The ADO project name                     |
| `parentIds`        | number[]   | Yes      | -                   | Parent User Story IDs to sync tasks for  |
| `folder`           | string     | No       | `docs/user-stories` | Override sync folder path                |
| `skipAutoConvert`  | boolean    | No       | `false`             | Skip HTML-to-markdown conversion         |

**Usage Example:**

```
sync-tasks-from-file(project: "MyProject", parentIds: [1044])
```

**Behavior:**
- `## Task #ID` sections: Updated in ADO
- `## NEW TASK` sections: Created in ADO, header updated to `## Task #ID`

---

### check-work-item-markdown

**Purpose:** Check if work item fields are markdown (syncable) or HTML format.

**Parameters:**

| Parameter      | Type       | Required | Description                     |
|----------------|------------|----------|---------------------------------|
| `project`      | string     | Yes      | The ADO project name            |
| `workItemIds`  | number[]   | Yes      | Work item IDs to check          |

**Usage Example:**

```
check-work-item-markdown(project: "MyProject", workItemIds: [1044, 1045])
```

**Note:** HTML fields auto-convert to Markdown in the local file on pull (read-only — ADO is not modified), so this tool no longer gates syncing. It stays useful for inspection — e.g. spotting which items hold HTML tables before you pull and edit them.

---

### list-synced-work-items

**Purpose:** List work items that have been synced to local markdown files.

**Parameters:**

| Parameter | Type   | Required | Default             | Description               |
|-----------|--------|----------|---------------------|---------------------------|
| `folder`  | string | No       | `docs/user-stories` | Override sync folder path |

**Usage Example:**

```
list-synced-work-items()
```

---

## File Locations

```
docs/user-stories/
├── 1044.md              # Synced User Story #1044
├── 1045.md              # Synced User Story #1045
├── 1044-tasks.md        # Tasks under User Story #1044
├── 1044-comments.md     # Comments (read-only)
├── new_12345_1.md       # NEW User Story under Feature #12345
└── new_12345_2.md       # Another NEW User Story under Feature #12345
```

---

## Workflow: Edit Existing Work Items

### Step 1: Pull work item(s) to local files

```
sync-work-item-to-file(project: "ProjectName", workItemIds: [1044, 1045])
```

Creates `docs/user-stories/1044.md` and `1045.md`.

### Step 2: Edit the markdown file

Use the `Edit` tool to modify content:
- Title (in frontmatter)
- Description section
- Acceptance Criteria section
- Additional fields (How to Test, Deployment Information, etc.)

### Step 3: Push changes back to ADO

```
sync-work-item-from-file(project: "ProjectName", workItemIds: [1044, 1045])
```

---

## Workflow: Pull All User Stories Under a Feature

### Pull all children at once

```
sync-work-item-to-file(project: "ProjectName", parentId: 12345)
```

This queries ADO for all User Stories where `System.Parent = 12345` and creates individual files for each.

### Pull a different child type

```
sync-work-item-to-file(project: "ProjectName", parentId: 12345, childType: "Bug")
```

---

## Workflow: Create New User Stories

### Step 1: Create a template file

```
create-user-story-file(project: "ProjectName", parentId: 12345)
```

Creates `docs/user-stories/new_12345_1.md` with template content.

### Step 2: Edit the template

Use the `Edit` tool to set:
- `title` in frontmatter (required)
- `storyPoints`, `moscow`, `tags` as needed (add to frontmatter if desired)
- Description content
- Acceptance Criteria content

**Template format:**
```markdown
---
title: New User Story Title
type: User Story
state: New
parent: 12345
---
<!-- Optional frontmatter fields (add to YAML above if needed):
storyPoints: 3
moscow: Should Have
tags:
- tag1
- tag2
-->

> Parent: **#12345** - Feature Title
> Project: ProjectName

# Description

[Your description here]

---

# Acceptance Criteria

[Your acceptance criteria here]
```

### Step 3: Push to ADO

```
sync-work-item-from-file(project: "ProjectName")
```

The tool:
1. Auto-detects all `new_*.md` files
2. Creates each as a new work item in ADO with parent link
3. Renames file to `{newId}.md`
4. Updates frontmatter with `id`, `lastSyncedRevision`, `url`

---

## Workflow: Tasks Under User Stories

### Pull tasks

```
sync-tasks-to-file(project: "ProjectName", parentIds: [1044])
```

Creates `docs/user-stories/1044-tasks.md` with all tasks.

### Edit existing tasks

Modify fields in existing `## Task #ID` sections:
- `**Title**:`
- `**State**:` (New, In Progress, Done)
- `**Original Estimate**:`, `**Remaining Work**:`, `**Completed Work**:`
- `### Description` content

### Add new tasks

Add a new section at the end of the file:

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

### Push task changes

```
sync-tasks-from-file(project: "ProjectName", parentIds: [1044])
```

Updates existing tasks and creates new ones. New tasks get their `## NEW TASK` header replaced with `## Task #ID`.

---

## File Formats

### Work Item File (`{id}.md`)

```markdown
---
id: 1044
title: Web | Feature Name
type: User Story
state: Active
url: https://dev.azure.com/org/project/_workitems/edit/1044
assignedTo: Developer Name
storyPoints: 5
parent: 12345
moscow: Must Have
tags:
- backend
- api
areaPath: Project\Area
iterationPath: Project\Sprint1
lastSyncedRevision: 22
lastSyncedAt: 2026-01-15T10:30:00Z
---

# Description

Description content here...

---

# Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

---

# How to Test

Testing instructions...

---

# Deployment Information

Deployment notes...
```

### New Work Item File (`new_{parentId}_{n}.md`)

```markdown
---
title: New User Story Title
type: User Story
state: New
parent: 12345
storyPoints: 3
moscow: Should Have
tags:
- feature
---

> Parent: **#12345** - Feature Title
> Project: ProjectName

# Description

Description here...

---

# Acceptance Criteria

Criteria here...
```

### Tasks File (`{parentId}-tasks.md`)

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

---

## Field Reference

### Work Item Frontmatter Fields

| Field                 | Type     | Required        | Notes                                    |
|-----------------------|----------|-----------------|------------------------------------------|
| `id`                  | number   | For existing    | Missing = new item                       |
| `title`               | string   | Yes             | Work item title                          |
| `type`                | string   | Yes             | "User Story", "Bug", etc.                |
| `state`               | string   | Yes             | "New", "Active", "Resolved", "Closed"    |
| `parent`              | number   | For new         | Parent work item ID                      |
| `storyPoints`         | number   | No              | Story points estimate                    |
| `moscow`              | string   | No              | "Must Have", "Should Have", etc.         |
| `tags`                | string[] | No              | List of tags                             |
| `areaPath`            | string   | No              | Inherited from parent if not set         |
| `iterationPath`       | string   | No              | Inherited from parent if not set         |
| `assignedTo`          | string   | No              | Display name (read-only on update)       |
| `url`                 | string   | Auto            | ADO URL (auto-populated)                 |
| `lastSyncedRevision`  | number   | Auto            | Tracks sync state                        |
| `lastSyncedAt`        | string   | Auto            | ISO timestamp of last sync               |

### Task Fields

| Field                  | Type   | Notes                                      |
|------------------------|--------|--------------------------------------------|
| `**Title**`            | string | Task title                                 |
| `**State**`            | string | "New", "In Progress", "Done"               |
| `**Assigned To**`      | string | Display name (read-only for updates)       |
| `**Original Estimate**`| number | Hours                                      |
| `**Remaining Work**`   | number | Hours                                      |
| `**Completed Work**`   | number | Hours                                      |
| `**Effort**`           | number | Effort points                              |
| `**Revision**`         | number | Sync tracking (auto-managed)               |

### Content Sections

| Section                   | ADO Field                                      | Notes                    |
|---------------------------|------------------------------------------------|--------------------------|
| `# Description`           | `System.Description`                           | Main description         |
| `# Acceptance Criteria`   | `Microsoft.VSTS.Common.AcceptanceCriteria`     | AC content               |
| `# How to Test`           | `Custom.HowToTest` or similar                  | Testing instructions     |
| `# Predeployment Steps`   | `Custom.PredeploymentSteps` or similar         | Pre-deploy checklist     |
| `# Postdeployment Steps`  | `Custom.PostdeploymentSteps` or similar        | Post-deploy checklist    |
| `# Deployment Information`| `Custom.DeploymentInformation` or similar      | Deployment notes         |

---

## Important Notes

1. **HTML → Markdown conversion:** On **pull**, HTML fields convert to Markdown **in the local file only** — the pull is read-only and never modifies the ADO item. On **push**, edited fields are written back as Markdown (the point at which a field's ADO format changes). `skipAutoConvert: true` disables conversion on either side. HTML tables become Markdown pipe tables; complex tables (merged/styled cells) may lose structure and raise a lossy-conversion warning, with the ADO original preserved.

2. **Comments:** Comments files (`{id}-comments.md`) are read-only. Pull with `includeComments: true` but cannot push.

3. **Write Permission:** Creating/updating requires `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`.

4. **Inheritance:** New work items inherit `areaPath` and `iterationPath` from their parent if not specified.

5. **File Naming:**
   - Existing items: `{id}.md`
   - New items: `new_{parentId}_{index}.md` (auto-increments)
   - Tasks: `{parentId}-tasks.md`

6. **Auto-detection:** `sync-work-item-from-file` automatically finds and processes all `new_*.md` files without needing to specify them.

7. **Empty Optional Fields:** When creating new work items, omit optional fields from frontmatter rather than leaving them empty. Empty values can cause issues.

---

## Error Handling

| Error                           | Cause                                | Resolution                                              |
|---------------------------------|--------------------------------------|---------------------------------------------------------|
| "parent field required"         | New file missing parent ID           | Add `parent: {featureId}` to frontmatter                |
| "title field required"          | New file missing title               | Add `title: Your Title` to frontmatter                  |
| "File not found"                | Specified ID not synced locally      | Pull first with `sync-work-item-to-file`                |
| "Write not enabled"             | Missing env var                      | Set `AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true`           |
| "Invalid work item markdown"    | Malformed frontmatter                | Ensure `---` delimiters and valid YAML                  |
| "HTML in ADO - skipAutoConvert" | Field is HTML and auto-convert off   | Remove `skipAutoConvert: true` or convert manually      |

---

## Common Agent Workflows

### Agent needs to update a single User Story

```
1. sync-work-item-to-file(project: "P", workItemIds: [1044])
2. Edit tool on docs/user-stories/1044.md
3. sync-work-item-from-file(project: "P", workItemIds: [1044])
```

### Agent needs to create multiple User Stories under a Feature

```
1. create-user-story-file(project: "P", parentId: 12345)  # Creates new_12345_1.md
2. create-user-story-file(project: "P", parentId: 12345)  # Creates new_12345_2.md
3. Edit tool on each file to set title, description, AC
4. sync-work-item-from-file(project: "P")  # Pushes all new_*.md files
```

### Agent needs to add tasks to a User Story

```
1. sync-tasks-to-file(project: "P", parentIds: [1044])
2. Edit tool on docs/user-stories/1044-tasks.md to add ## NEW TASK sections
3. sync-tasks-from-file(project: "P", parentIds: [1044])
```

### Agent needs to review and update multiple stories under a Feature

```
1. sync-work-item-to-file(project: "P", parentId: 12345)  # Pulls all children
2. list-synced-work-items()  # See what was pulled
3. Edit tool on each file as needed
4. sync-work-item-from-file(project: "P")  # Pushes all changes
```

---

## Version History

| Version | Date       | Author | Changes                                          |
|---------|------------|--------|--------------------------------------------------|
| 1.0     | 2026-01-14 | KS     | Initial version                                  |
| 1.1     | 2026-01-16 | KS     | Added tool reference, common workflows, expanded |
