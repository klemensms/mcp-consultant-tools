# Reading and editing SharePoint files in place, and draft-only Outlook

Date: 2026-09-28. Status: approved design, build in progress. Plan: `docs/superpowers/plans/2026-09-28-sharepoint-content-and-outlook-drafts.md`. Builds on `docs/superpowers/specs/2026-09-23-delegated-outlook-sharepoint-design.md`.

## Goal

Let an agent read and change the content of SharePoint and OneDrive files without copying them to the local disk, and let it prepare Outlook drafts, attachments included, while being unable to send them. Nothing a user does not switch on can change a file or send a message.

## Principle: nothing lands on disk

Every new tool works in memory. Excel goes through the Graph workbook API, which reads and writes cells on the server. Word, PowerPoint and text files are fetched as bytes into memory, parsed or patched there, and written back as a new version of the same file. No new tool writes a temporary file. `spo-download-file` stays as it is for the cases that genuinely need a local copy.

## SharePoint: content tools

All tools take the same file locator the existing tools take (a sharing link or URL resolved with `spo-resolve-link`, or `driveId` plus `itemId`), work in sign-in mode and in client-credentials mode, and have a matching `mcp-spo-cli content ...` command.

| Format | Read tool | Write tool | How |
|---|---|---|---|
| Text: `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.yaml`, `.html` | `spo-read-text` | `spo-write-text` | Read returns the UTF-8 content and the file's eTag. Write replaces the whole content of an existing file. |
| Excel: `.xlsx`, `.xlsm` | `spo-read-excel` | `spo-write-excel` | Read lists worksheets, or returns values, text and formulas for a range address or the used range. Write sets values or formulas on a range. Both go through `/workbook`, so nothing is downloaded and live co-authors see the change as it happens. |
| Word: `.docx` | `spo-read-word` | `spo-edit-word` | Read returns the document as Markdown (headings, lists, tables) with a numbered anchor per paragraph. Edit applies a list of operations: replace text, insert a paragraph before or after an anchor, append a paragraph, delete a paragraph. |
| PowerPoint: `.pptx` | `spo-read-powerpoint` | `spo-edit-powerpoint` | Read returns each slide's title, text boxes and speaker notes. Edit replaces text on a slide or in its notes. |

### Rules that hold for every write

1. **Stale-write guard.** Word, PowerPoint and text writes send the eTag from the read (`If-Match`) and refuse with a clear message when the file changed in between, so an agent never overwrites a colleague's edit. A write without an eTag is refused.
2. **Formatting is preserved outside the edited text.** Word and PowerPoint edits patch the document XML and leave everything else byte-for-byte alone. A replacement that spans runs with different formatting takes the first run's formatting, and the tool says so in its result.
3. **Every write is reversible.** Each one creates a new version in the file's version history, and the result says which version it created.
4. **Size cap.** Word, PowerPoint and text tools refuse files over `SHAREPOINT_CONTENT_MAX_MB` (default 25) rather than hold a very large file in memory.

### Creating new files

Two routes, one for simple files and one for complex ones.

1. **`spo-create-file`** creates a blank Word, Excel or PowerPoint file, or a text or Markdown file with the content given, at a folder path. The blank Office files are minimal valid documents generated in memory. It never replaces an existing file, and it is governed by `SHAREPOINT_CONTENT_WRITE` for that format. The content tools above then fill it in.
2. **Build locally, then upload.** A complex file (a formatted Excel model, a designed deck) is best built by a script on the user's machine and uploaded. `spo-upload-file` today takes the file's content as a string in the tool call, which does not work for a real Office file. It gains a `localPath` input: a file inside the user's home folder, checked with the same guard the Outlook attach tool uses, streamed from disk to SharePoint so its content never passes through the conversation. It stays governed by `SHAREPOINT_ENABLE_WRITE`, as it is today. The local file is the user's own, so the tool leaves it where it is.

### Settings

| Setting | Default | Meaning |
|---|---|---|
| `SHAREPOINT_CONTENT_READ` | `text,excel,word,powerpoint` | Formats the read tools may open. `none` turns every content read off. |
| `SHAREPOINT_CONTENT_WRITE` | `none` | Formats the write tools may change. `all`, or any comma list of the four. |
| `SHAREPOINT_CONTENT_MAX_MB` | `25` | In-memory size cap. |

These are independent of `SHAREPOINT_ENABLE_WRITE` and `SHAREPOINT_ENABLE_DELETE`, which keep governing file operations (upload, copy, move, rename, create folder, delete). So a user can let an agent edit cells and paragraphs without also letting it move or rename files. A switched-off tool stays registered, refuses to run and names the setting that enables it, as every existing SharePoint switch does.

## Outlook: drafts without send

What exists already: draft, reply-draft, forward-draft, update-draft and attach are behind `OUTLOOK_ENABLE_WRITE`; send and send-draft are behind `OUTLOOK_ENABLE_SEND`, which is independent. What changes:

1. **Drafts get their own switch.** New `OUTLOOK_ENABLE_DRAFTS` covers creating, editing and attaching to drafts. `OUTLOOK_ENABLE_WRITE` keeps covering mailbox organising (mark read, move, flag). When `OUTLOOK_ENABLE_DRAFTS` is unset it follows `OUTLOOK_ENABLE_WRITE`, so an existing configuration behaves exactly as before.
2. **Attach a SharePoint or OneDrive file without touching the disk.** `mail-add-draft-attachment` gains a `url` input (a SharePoint or OneDrive link) alongside `filePath`. The server fetches the bytes into memory and attaches them, using the upload session above 3 MB as it does today. See the open question on permissions below.
3. **Every draft tool states in its result that nothing was sent.**

## Testing

Unit tests first (vitest), with Graph mocked, for every tool, every switch and the stale-write guard. Then the MCP local tester against the built servers. Then live tests against a dedicated test folder and the tester's own mailbox, never anything else: SharePoint writes only to fixture files the tests create in that folder; Outlook drafts only addressed to the signed-in user, deleted afterwards, and never sent.

## Out of scope

Building rich Office content through the tools (formatting, charts, slide layouts), which the build-locally-then-upload route covers; adding or reordering slides; Word comments and tracked changes; Excel charts and pivot tables. Each can follow once the in-place editing has been used for a while.

## Open question

Attaching a SharePoint file to an Outlook draft needs the Outlook app registration to read files, a delegated `Files.Read.All` grant it does not have today. Without it, the `url` input can only put a link to the file in the draft body.
