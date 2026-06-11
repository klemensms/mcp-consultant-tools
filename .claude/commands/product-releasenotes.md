---
name: product-releasenotes
description: Generate or update the consolidated release notes for the current release branch in @mcp-consultant-tools. Applies the master-doc model and breaking-change pattern, and produces a Teams-ready announcement.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Bash
arguments:
  - name: mode
    description: "'beta' (default — update master + per-iteration beta file, output Teams message for beta channel), 'production' (finalize master with release date, output Teams message for production), or 'check' (read-only — show what would change without writing)."
    required: false
---

You are generating or updating release notes for the **@mcp-consultant-tools** monorepo.

This repo follows a **master-doc model**: ONE consolidated, user-facing release-notes file per release branch (`docs/release-notes/v{MAJOR}.0.0.md`), kept up to date as betas land. Per-iteration files (`docs/release-notes/v{VERSION}.md`, e.g. `v31.0.0-beta.2.md`) capture agent-level audit detail.

Mode is `{{mode}}` (default `beta`).

---

## Step 1: Detect state

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if ! [[ "$BRANCH" =~ ^release/[0-9]+(\.[0-9]+)?$ ]]; then
  echo "ERROR: Not on a release branch (got $BRANCH). Aborting."
  exit 1
fi

MAJOR=$(echo "$BRANCH" | sed 's|release/||;s|\..*||')
CORE_VERSION=$(grep '"version"' packages/core/package.json | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
REPO_URL=$(git remote get-url origin | sed -E 's|git@github.com:|https://github.com/|; s|\.git$||')

MASTER_FILE="docs/release-notes/v${MAJOR}.0.0.md"
ITERATION_FILE="docs/release-notes/v${CORE_VERSION}.md"

echo "Branch:    $BRANCH"
echo "Version:   $CORE_VERSION"
echo "Master:    $MASTER_FILE  $([ -f "$MASTER_FILE" ] && echo '(exists)' || echo '(NEW)')"
echo "Iteration: $ITERATION_FILE  $([ -f "$ITERATION_FILE" ] && echo '(exists)' || echo '(NEW)')"
echo "Repo URL:  $REPO_URL"
```

Read the master file if it exists. Read the iteration file if it exists.

## Step 2: Aggregate commits

Find the commit where the previous master content was last updated, or the branch's divergence from main:

```bash
LAST_TOUCH=$(git log -n 1 --format=%H -- "$MASTER_FILE" 2>/dev/null)
if [ -z "$LAST_TOUCH" ]; then
  LAST_TOUCH=$(git merge-base "$BRANCH" main)
fi

git log --pretty=format:"%h %ai %s%n%b%n---END---" "$LAST_TOUCH"..HEAD
```

Identify packages with version changes since the last master touch:

```bash
git diff --name-only "$LAST_TOUCH"..HEAD -- 'packages/*/package.json' | xargs -I{} sh -c \
  'pkg=$(dirname {} | xargs basename); ver=$(grep "\"version\"" {} | head -1 | sed "s/.*\"\([^\"]*\)\".*/\1/"); echo "$pkg: $ver"'
```

Packages with version changes are the **functionally-changed set**. Workspace lockstep means others may also bump, but functional changes are confined to this set.

## Step 3: Detect breaking changes

A change is **breaking** if it requires user-side action to keep working. Examples:
- New required env vars on existing MCP servers (refuse-to-start contracts).
- Removed or renamed tools.
- Changed return shapes that callers depend on.
- Removed env vars (configuration migration).
- Changed default behaviour (e.g. opt-in becomes opt-out).

Examples that are **NOT** breaking:
- New optional env vars that default to current behaviour.
- New tools.
- Bug fixes whose old behaviour was already broken.
- Internal refactors with no public surface change.

Identify the **affected packages** — the set of MCP packages whose `.mcp.json` consumer needs to do something. This is usually a subset of the functionally-changed set (e.g. `core` changes but no consumer touches `core` directly).

## Step 4: Update the master file

The master file is the user-facing single source of truth for the release branch. Use these sections (omit any with no content), in this order:

```
# Release Notes: v{MAJOR}.0.0

**Status:** {one of: "In beta. Currently shipping as v{CORE_VERSION} on the `beta` npm tag." | "Released — v{X.Y.Z} on the `latest` npm tag (date: YYYY-MM-DD)."}
**Branch:** `release/{X.Y}`
**First beta:** YYYY-MM-DD
**Production release date:** {YYYY-MM-DD or TBD}

> Master release notes for this branch. Updated as new betas land. Per-iteration agent-level detail lives in `v{X.Y.Z}-beta.N.md` files referenced under [Beta history](#beta-history).

---

## ⚠️ This release contains breaking changes
   {ONLY IF breaking changes exist}

   If your `.mcp.json` uses any of the affected packages, your config needs updating before v{MAJOR} will start.

   - **Don't want to read further?** Copy the block under [⚡ Quick upgrade](#-quick-upgrade--copy-paste-for-your-claude-agent) into a fresh Claude conversation. Your agent will scan your configs, propose changes, and show you a diff before writing.
   - **Want the details?** Continue reading after the upgrade block.

## ⚡ Quick upgrade — copy-paste for your Claude agent
   {ONLY IF breaking changes exist}

   {short prose: which packages, why this is needed}

   ```text
   Read {REPO_URL}/blob/{BRANCH}/{MASTER_FILE}
   (the v{MAJOR}.0.0 release notes for @mcp-consultant-tools/*).

   Then scan every MCP server config you can find on this machine — project-level
   .mcp.json, ~/.claude.json, Claude Desktop's claude_desktop_config.json, and any
   other config locations the local agent host is known to use. Identify any
   servers whose `args` reference these packages:

     {affected-packages bullet list, fully-qualified scoped names}

   For each match, follow the upgrade guide in the release notes:

     1. Add {required env var #1} ...
     2. Add {required env var #2} ...
     3. {optional env vars as applicable}

   Show me a diff for each file before writing anything. If you cannot classify
   a server config with confidence, ask before guessing.
   ```

## Overview
## Highlights
## ⚠️ Upgrade Notes / Breaking Changes
## 🚀 New Features
## ✨ Enhancements / Functional Improvements
## 🔧 Technical Improvements / Architecture
## ⚙️ Performance & Scalability
## 🧩 Configuration, Metadata & Validation
## 🧪 Testing & Quality Assurance
## 🛠 DevOps, Pipelines & Infrastructure
## 🐛 Bug Fixes
## 📚 Documentation
## Packages Released
## What's NOT in v{MAJOR} (deferred)
## Known Issues
## Verified
## Migration
## Beta history
```

Rules:
- Only include sections that have content.
- The two breaking-change sections (⚠️ + ⚡) appear **only** when breaking changes exist.
- Use emoji headers exactly as shown.
- Tone: present tense, professional, concise. Avoid "comprehensive", "seamless", "full support".
- Aggregate related commits into single bullets — don't list every micro-change.
- Group bug fixes by area, not by commit.
- Include `Related work items: #xxxx, #yyyy` at the end of relevant sections when commit messages reference work items. Deduplicate.

When **updating** an existing master file, MERGE the new content into existing sections — don't overwrite. The master accretes content as new betas land. If a previous beta already documented something, leave it; just add the delta.

## Step 5: Update the per-iteration file (beta mode only)

Create or update `docs/release-notes/v{CORE_VERSION}.md` with a focused changelog for THIS iteration only. This is for agent audit trail, NOT user reading. Structure:

```
# Release Notes: v{CORE_VERSION}

**Date:** YYYY-MM-DD
**Branch:** `release/{X.Y}`
**Status:** {Local testing | Published to beta | Promoted to latest}

> Per-iteration agent-level detail. The user-facing single source of truth is [`v{MAJOR}.0.0.md`](v{MAJOR}.0.0.md).

## ⚡ Quick upgrade — copy-paste for your Claude agent
   {if this iteration introduces breaking changes — same block as master}

## Overview

{What changed in THIS iteration only.}

## Changes Implemented

- {detailed bullet list of commits, ordered logically}

## Testing

{What was verified, what was not}

## Known Issues

{Issues found in this iteration only}
```

## Step 6: Production-mode finalization

If `mode == production`:
1. Update master status banner from `In beta...` → `Released — v{X.Y.Z} on the `latest` npm tag (date: YYYY-MM-DD)`.
2. Add the production release date.
3. Update GitHub URLs in the agent block from `release/{X.Y}` → `main` (after merge, the file lives on main).
4. Do NOT delete or rewrite per-iteration beta files.
5. Do NOT regenerate content from scratch — the master already has it.

## Step 7: Output the Teams message

After writing files, print a single fenced code block ready to copy-paste into Teams. Pick the right format:

### Breaking changes — beta mode

```text
⚠️ Breaking changes just shipped to the @beta channel for @mcp-consultant-tools (v{CORE_VERSION}).

If your .mcp.json uses any of these MCP servers, your config needs updating:
{affected-packages bullet list}

Release notes (paste-ready agent prompt at the top — let your agent do the work):
{REPO_URL}/blob/{BRANCH}/{MASTER_FILE}
```

### Breaking changes — production mode

```text
🚀 v{MAJOR}.0.0 is now live on the `latest` channel for @mcp-consultant-tools.

This release contains breaking changes. If your .mcp.json uses any of these MCP servers and you haven't already upgraded from beta, your config needs updating:
{affected-packages bullet list}

Release notes (paste-ready agent prompt at the top — let your agent do the work):
{REPO_URL}/blob/main/{MASTER_FILE}
```

### No breaking changes — beta mode

```text
ℹ️ New beta of @mcp-consultant-tools: v{CORE_VERSION}.

No action required — drop-in upgrade.
{one-line summary of what's new}

Release notes: {REPO_URL}/blob/{BRANCH}/{MASTER_FILE}
```

### No breaking changes — production mode

```text
🚀 v{MAJOR}.0.0 is now live on `latest` for @mcp-consultant-tools.

No breaking changes — drop-in upgrade.
{one-line summary}

Release notes: {REPO_URL}/blob/main/{MASTER_FILE}
```

## Step 8: Final summary to user

Print to terminal:
- Files updated/created (paths)
- Whether breaking changes were detected
- The Teams message (in a fenced code block, ready to copy-paste)
- Reminder: "Now run `/release_workflow_beta` (or `/release_workflow` for production) to publish."

Do NOT commit or push — the workflow command handles that.

---

## Important rules

- **Don't fabricate.** Only document changes you can find evidence of in commits, version diffs, or files. If you suspect a change is breaking but can't find evidence, ask the user.
- **Master file is canonical.** Per-iteration files supplement it; never replace.
- **Teams message is mandatory output.** Even if no breaking changes, produce the appropriate informational variant. The maintainer posts these to your internal Teams.
- **Don't include the upgrade block when there's no breaking change.** It would train users to ignore it.
- **One copy-pasteable Teams block.** No surrounding commentary inside the code fence — keep it clean for paste.
- **Verify auto-derived URLs.** The repo URL must be `https://github.com/...`, never SSH form. The branch in URLs is `release/X.Y` for beta mode, `main` for production mode.
