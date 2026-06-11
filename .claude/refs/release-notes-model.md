# Scope: Release-notes lifecycle for `release/X.0` branches — master + per-iteration files, breaking-change conventions, and how `/product-releasenotes` updates them. Load when cutting a beta, promoting to production, or when authoring/updating any file under `docs/release-notes/`.

## Files per release branch (e.g. `release/31.0`)

| File | Role | Lifecycle |
|---|---|---|
| `docs/release-notes/v{MAJOR}.0.0.md` | **Master.** Canonical, user-facing reference for the entire release branch. | Created on first beta. Updated on EVERY beta. Status banner flips to "Released" on production promotion. Moves to `archive/` when the next major version ships to production. |
| `docs/release-notes/v{MAJOR}.0.0-beta.N.md` | **Per-iteration audit trail.** Detailed changelog for a specific beta drop. | Created when each beta is cut. Never edited after the beta is published. Moves to `archive/` when the version is promoted from beta to production. |

## Top level vs `archive/`

`docs/release-notes/` shows ONLY what a current consumer cares about — the current production master and the in-flight beta. Everything older lives in `docs/release-notes/archive/`. See [`docs/release-notes/README.md`](../../docs/release-notes/README.md) for the full lifecycle.

## Hard rules

1. **The master file is updated on every beta and on production promotion.** No exceptions. Users get one URL they can rely on for "what's in v{MAJOR}".
2. **Never copy-and-rename a beta file to create the master.** The master is canonical from the first beta — production promotion only flips the status banner and adjusts URLs.
3. **Per-iteration files are not user-facing.** Don't link to them from documentation or Teams messages — link to the master.
4. **Breaking-change pattern is mandatory.** When a release introduces breaking changes, the master MUST contain (in this order, before `## Overview`):
   - A `## ⚠️ This release contains breaking changes` paragraph telling readers they can either hand the upgrade prompt to an agent or read on.
   - A `## ⚡ Quick upgrade — copy-paste for your Claude agent` block with a fenced code prompt that names the affected packages and the required user-side changes. The prompt URL points at this master file.
5. **No agent block when there's no breaking change.** Including it for cosmetic releases trains users to ignore it.

## How to update master + per-iteration files

Use `/product-releasenotes beta` (or `/product-releasenotes production` for promotion). The slash command:
- Auto-detects the current release branch and version.
- Aggregates commits since the last master update.
- Updates both the master and the per-iteration file in one pass.
- Detects breaking changes from commit content + version diffs.
- Inserts the warning paragraph and agent block when breaking changes exist.
- Outputs a Teams-ready announcement to copy-paste into the internal release channel.

`/release_workflow_beta` and `/release_workflow` both call `/product-releasenotes` as their step 1. Direct invocation of `/product-releasenotes` is also fine when iterating on the notes between publishes.

## Day-to-day commits during development

**Don't update the per-iteration file mid-development with every commit.** Commit messages are the audit log between betas. `/product-releasenotes beta` aggregates them on the next beta cut. Keep commits small and well-described and the slash command does the rest.
