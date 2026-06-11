# Release Notes

This folder follows the **master-doc model** documented in the root `CLAUDE.md`.

## What's at the top level

Only the release notes a current consumer might care about:

- **Current production master** — `v{MAJOR}.0.0.md` for the currently-released major version.
- **Current beta master** — `v{MAJOR+1}.0.0.md` for the in-flight release branch (if any).
- **Current beta per-iteration files** — `v{MAJOR+1}.0.0-beta.N.md` for each beta drop on the active release branch.

All older release notes — every previous production master, every previous per-iteration file, plus the legacy templates — live in [`archive/`](archive/).

## When does a file move to `archive/`?

When a release is promoted from beta to production, the `/release_workflow` slash command:

1. Moves the now-superseded production master from the previous major version to `archive/`.
2. Moves all per-iteration files for the just-released version to `archive/`.
3. Leaves the just-promoted version's master at the top level (now showing as `Released`).

When a new beta cycle starts on `release/{X+1}.0`, its master and per-iteration files appear at the top level alongside the still-current production master.

## Filenames

| Pattern | Example | Meaning |
|---|---|---|
| `v{MAJOR}.0.0.md` | `v31.0.0.md` | Master release notes for an entire major version. Single source of truth. |
| `v{MAJOR}.0.0-beta.{N}.md` | `v31.0.0-beta.2.md` | Per-iteration agent-level audit trail for a specific beta drop. |
| `v{MAJOR}.0.0-beta.{N}-{slug}.md` | `v30.0.0-beta.16-ado-work-item-images.md` | Selective beta drop scoped to a specific feature (older convention used during v28–v30, kept in archive). |

The `*-legacy.md` suffix in `archive/` marks files that had a name collision when the v1–v30 history was migrated from the previous `docs/release_notes/` folder; the `-legacy` copy is the older variant of the same filename.
