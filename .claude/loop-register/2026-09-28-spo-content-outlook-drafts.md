# Loop register: SharePoint content tools and draft-only Outlook

Chain for `docs/superpowers/plans/2026-09-28-sharepoint-content-and-outlook-drafts.md`. Origin commit `f0ec717`. Append items; change only `State`.

### ⚑1 · Attaching a SharePoint file to an Outlook draft needs a permission the Outlook app registration lacks
- **Kind:** deferred
- **Hop:** origin · f0ec717
- **State:** open (hop 3: `mail-auth-status` on the final local config still shows `attachFromLink.granted: false`. hop 2: task 9 built both paths; the live test ran the link fallback on a 403, so the grant is still missing. `mail-auth-status` now shows it as `drafts.attachFromLink.granted`)
- **Matters because:** without delegated `Files.Read.All` on the Outlook app registration, task 9's `url` attachment can only insert a link, never the file. The maintainer is raising the grant; task 9 builds both paths so nothing waits on it, and the live test should record which path ran.

### ⚑2 · Live test mail goes only to confirmed recipients
- **Kind:** decision
- **Hop:** origin · f0ec717
- **State:** open
- **Matters because:** the maintainer allowed labelled test mail to themself and to two colleagues, but one colleague's name came through dictation and matches no known person. Until it is confirmed, send tests only to the maintainer and the one confirmed colleague (details in the handoff, not here, since this repo is public).

### ⚑3 · A styled Word insert shows as Normal when the document does not define that style
- **Kind:** deferred
- **Hop:** 1 · 2504569
- **State:** partly closed (hop 1): blank Word files from spo-create-file define the heading and list styles; adding a missing style to an existing document stays deferred
- **Matters because:** a live test document had no `Heading2` in its styles part, so `spo-edit-word` inserted the paragraph with the style reference and warned that Word shows it as Normal. Task 7's blank `.docx` must define the common heading and list styles so styled inserts work in files the tools create. Adding a missing built-in style definition on insert is a possible later improvement.

### ⚑4 · Release notes for this chain wait for the next beta
- **Kind:** deferred
- **Hop:** 2 · task 10
- **State:** open
- **Matters because:** the newest per-iteration file (beta.23) is already published, and release notes are written only by `/product-releasenotes beta`, never by hand. The SharePoint content tools, `spo-upload-file` `localPath`, and the Outlook drafts switch with attach-by-link have no release-notes entry until that runs at the next beta. `OUTLOOK_ENABLE_DRAFTS` is not breaking (unset follows `OUTLOOK_ENABLE_WRITE`), so no upgrade block is needed for it.
