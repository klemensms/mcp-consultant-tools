# Plan: SharePoint content tools and draft-only Outlook

Design: `docs/superpowers/specs/2026-09-28-sharepoint-content-and-outlook-drafts-design.md` (approved 2026-09-28). Branch `release/35.0`.

## Status

| # | Task | State |
|---|---|---|
| 1 | Content settings and format gating | done |
| 2 | Content service core: item locator, in-memory read, If-Match write, version report | done |
| 3 | Text read and write tools | done |
| 4 | Excel read and write through `/workbook` | done |
| 5 | Word read (Markdown with paragraph anchors) and edit operations | done |
| 6 | PowerPoint read and text replace | done |
| 7 | `spo-create-file` (blank Office files generated in memory, text with content) | done |
| 8 | `spo-upload-file` `localPath` input with the home-folder guard | done |
| 9 | Outlook: `OUTLOOK_ENABLE_DRAFTS` split, attach from a SharePoint or OneDrive `url` | done |
| 10 | Docs: technical docs, user docs, package CLAUDE.md, release-notes "Changes Implemented" | done (release notes deferred to `/product-releasenotes beta`, register ⚑4) |
| 11 | Live verification, then the maintainer's local config | todo |

Mark a task `done` here in the same commit that finishes it.

## Conventions every task follows

- Layering: logic in `packages/sharepoint/src/services/content/`, thin MCP wrappers in `src/tools/content-tools.ts`, thin CLI wrappers in `src/cli/commands/content-commands.ts` (`mcp-spo-cli content <verb>`). Every MCP tool gets a CLI command.
- Tests first, in `src/__tests__/`, using `recordingGraph` from `graph-recorder.ts` so tests assert the request on the wire. `npm test --workspace=packages/sharepoint` must pass before a task is done.
- No `console.log` in `src/`. No temporary files: Word, PowerPoint and text bytes stay in memory.
- `packages/sharepoint` pins `@mcp-consultant-tools/core` at `33.0.0`; do not add exports to `core` for this work.
- Dependencies: `fflate` (zip) and `@xmldom/xmldom` (XML DOM that round-trips untouched nodes), added to `packages/sharepoint` only.
- Sanctioned placeholders only in code, tests and docs (`contoso.sharepoint.com`, `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`). No real site, drive, item or person names.

## Task notes

1. `src/services/content/content-access.ts`: parse `SHAREPOINT_CONTENT_READ` (default all four), `SHAREPOINT_CONTENT_WRITE` (default none), `SHAREPOINT_CONTENT_MAX_MB` (default 25). Accept `all`, `none`, or a comma list of `text`, `excel`, `word`, `powerpoint`; reject unknown names with the allowed list. Map a file extension to a format. A disabled call throws a message naming the setting and the value that enables it.
2. Every content tool takes either `url` (resolved with `DiscoveryService.resolveLink`) or `driveId` plus `itemId`. Read returns `eTag`, `webUrl`, `name`, `lastModifiedDateTime`. Writes send `If-Match: <eTag>`; a 412 becomes "the file changed since it was read; read it again". After a write, report the newest entry of `/items/{id}/versions`.
3. `spo-read-text`, `spo-write-text`. Size cap applies.
4. `spo-read-excel` (no `range`: list worksheets with used-range address; with `worksheet` and optional `range`: `values`, `text`, `formulas`), `spo-write-excel` (`worksheet`, `range`, `values` or `formulas` as a 2D array whose shape must match the range). Use a workbook session (`createSession` with `persistChanges: true`) for writes and close it.
5. `spo-read-word`: paragraphs in body order, headings as `#`, list items as `-`, tables as Markdown tables, each block prefixed with its anchor `[p12]`. `spo-edit-word` operations: `replace` (text, replacement, optional `all`), `insertAfter` / `insertBefore` (anchor, text, optional `style` such as `Heading2`), `append`, `delete` (anchor). A match spanning runs keeps the first run's formatting; say so in the result.
6. `spo-read-powerpoint`: per slide, title, other text and notes. `spo-edit-powerpoint`: `replace` on slides and notes, optional `slide` number.
7. Blank `.docx`, `.xlsx`, `.pptx` built from minimal XML parts zipped with `fflate`; must open in Office for the web, and the new `.xlsx` must accept `spo-write-excel`. Text and Markdown take `content`. Conflict behaviour `fail`.
8. Reuse the Outlook package's home-folder guard (copy `packages/outlook/src/local-file-guard.ts` into SharePoint; do not import across packages). Stream from disk, upload session above 4 MB. `content` and `localPath` are mutually exclusive.
9. `OUTLOOK_ENABLE_DRAFTS` gates draft, reply, forward, update-draft, attach; unset follows `OUTLOOK_ENABLE_WRITE`. `OUTLOOK_ENABLE_WRITE` keeps mark-read, move, flag. `mail-add-draft-attachment` gains `url`: fetch bytes into memory with the Outlook sign-in (`/shares/{encoded}/driveItem/content`); on 403, insert a link to the file into the draft body instead and say that `Files.Read.All` is needed for a real attachment. `mail-auth-status` reports the new group.
10. `docs/technical/SHAREPOINT_TECHNICAL.md`, `docs/documentation/sharepoint.md`, the Outlook equivalents, `packages/sharepoint/CLAUDE.md`, and the current per-iteration release-notes file.
11. Live run against the test environment named in the handoff, then set the maintainer's local config as the handoff says.
