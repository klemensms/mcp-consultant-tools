# Delegated (sign-in as me) access for Outlook mail and SharePoint documents

Date: 2026-09-23. Status: approved design, build in progress. Plan: `docs/superpowers/plans/2026-09-23-delegated-outlook-sharepoint.md`.

## Goal

Let an agent read and act on a user's own Outlook mailbox and SharePoint documents, signed in as that user, the same way the Teams server already works. Every capability beyond reading sits behind its own switch, and every switch is off by default, so the user can turn features on one at a time while exploring.

## Decisions

1. **Three servers, three app registrations.** Teams, Outlook and SharePoint each stay a separate server with its own app registration, so each can be approved, audited and revoked on its own. Merging later stays possible; splitting a merged one is harder.
2. **SharePoint is an extension of the existing `sharepoint` package, not a new package.** One SharePoint server, two ways to authenticate, the same concept as the PowerPlatform packages: **a client secret present means app-only (client credentials, today's behaviour); no secret means device code, signed in as the user.** `SHAREPOINT_AUTH_MODE=client-credentials|device-code` overrides the inference. App-only behaviour must not change.
3. **Outlook is a new package, `@mcp-consultant-tools/outlook`**, binaries `mcp-outlook` and `mcp-outlook-cli`. Device code only. App-only mail access would reach every mailbox in the tenant and is out of scope.
4. **Shared delegated auth lives in a new internal package, `@mcp-consultant-tools/m365-core`.** It holds the encrypted MSAL token cache and the device-code flow, ported from `packages/teams/src/auth/token-cache.ts` and the auth half of `packages/teams/src/services/teams-service.ts`. `core` stays free of MSAL, which is why this is its own package, the same reasoning as `powerplatform-core`. **Teams is not migrated onto it** in this work; Teams is working and stays untouched.
5. **Request `https://graph.microsoft.com/.default`, not a fixed scope list.** Entra then issues whatever the registration has admin consent for. A permission that has not been granted breaks only the tools that need it, with a clear 403 hint, instead of failing sign-in and taking the whole server down (the failure mode documented in `packages/teams/CLAUDE.md` § Scope Boundary). `auth-status` decodes the token's `scp` claim and reports which permissions are present and which switch groups they unlock.
6. **Switches follow the existing SharePoint pattern.** A switched-off tool is still registered, refuses to run, and names the environment variable that enables it, so an agent can tell the user what to turn on. Delete also requires `confirm: true`.
7. **Every MCP tool has a matching CLI command** (repo rule). The CLI and the MCP server share one token cache file, so a sign-in through `auth login` on the CLI also signs in the MCP server.

## Authentication (both servers, device-code mode)

- MSAL `PublicClientApplication`, device-code flow, authority `https://login.microsoftonline.com/{tenantId}`.
- Token cache: AES-256-GCM encrypted MSAL cache at `~/.mcp-consultant-tools/{server}-token-cache-{clientId}.enc`, mode 0600, one file per server, so two servers on the same registration never share or overwrite a cache.
- Order on every call: in-memory token, then silent refresh from the cached refresh token, then a pending device-code flow, then "not authenticated, call authenticate". `InteractionRequiredAuthError` means the refresh token is dead and a new sign-in is needed.
- Tools: `authenticate` (returns URL and code, completes in the background), `auth-status` (state plus granted permissions), `logout` (clears account and cache file). Tool name prefixes below.
- No client secret, no certificate. The server holds no standing credential and can only ever do what the signed-in user can do.

## SharePoint (existing package, extended)

Environment, added to what exists today:

| Variable | Meaning |
|---|---|
| `SHAREPOINT_CLIENT_SECRET` | Present: app-only, as today. Absent: device code. |
| `SHAREPOINT_AUTH_MODE` | Optional override: `client-credentials` or `device-code`. |
| `SHAREPOINT_SITES` / `SHAREPOINT_SITE_URL` | Required in app-only mode as today. **Optional in device-code mode**, where they act as named shortcuts. |
| `SHAREPOINT_DOWNLOAD_DIR` | Where downloads are saved to disk. Default `~/Downloads/mcp-sharepoint`. |
| `SHAREPOINT_ENABLE_WRITE`, `SHAREPOINT_ENABLE_DELETE` | Unchanged. Both default `false`. |

Behaviour in device-code mode:

- Every existing tool that takes a configured `siteId` also accepts a full site URL, so any site the user can reach works without editing config.
- New auth tools: `spo-authenticate`, `spo-auth-status`, `spo-logout`. In app-only mode they report that no sign-in is needed.
- New read tools (always on):
  - `spo-search-files` - Microsoft Search (`POST /search/query`, `entityTypes: ["driveItem"]`) across every SharePoint site, OneDrive and Teams file the user can see. Returns name, site, path, web URL, last modified, drive and item ids, and the hit summary.
  - `spo-resolve-link` - takes any SharePoint or OneDrive URL, including a sharing link, and returns the drive item (via `/shares/{encoded}/driveItem`), so a pasted link becomes something the other tools can act on.
  - `spo-find-sites` - search sites by keyword, or resolve one by URL.
  - `spo-list-my-recent` and `spo-list-shared-with-me` - only if the Microsoft Learn reference shows these endpoints are still supported; if they are deprecated or retired, drop them and say so in the package docs.
- `spo-download-file` gains two optional parameters: `saveToDisk` (write to `SHAREPOINT_DOWNLOAD_DIR`, return the absolute path) and `convertToPdf` (Graph `?format=pdf` for Word, PowerPoint and Excel), so an agent can read an Office document without a local parser.
- Existing write tools (upload, create folder, move, copy, rename) and the delete tool work unchanged under a delegated token, behind the existing switches.

## Outlook (new package)

Environment:

| Variable | Meaning |
|---|---|
| `OUTLOOK_TENANT_ID`, `OUTLOOK_CLIENT_ID` | Required. The Outlook app registration. |
| `OUTLOOK_ENABLE_WRITE` | Drafts and mailbox organising. Default `false`. |
| `OUTLOOK_ENABLE_SEND` | Sending. Default `false`. Independent of write. |
| `OUTLOOK_ENABLE_DELETE` | Deleting. Default `false`. |
| `OUTLOOK_DOWNLOAD_DIR` | Where attachments are saved. Default `~/Downloads/mcp-outlook`. |
| `OUTLOOK_MAX_ATTACHMENT_MB` | Cap for attaching a local file to a draft. Default `25`. |

Tools, all prefixed `mail-`:

| Group | Switch | Tools |
|---|---|---|
| Auth | always on | `mail-authenticate`, `mail-auth-status`, `mail-logout` |
| Read | always on | `mail-list-folders`, `mail-list-messages` (folder, top, unread only, from, date range, has attachments), `mail-search-messages` (KQL `$search`), `mail-get-message` (body as text, recipients, attachment list), `mail-get-conversation` (whole thread by `conversationId`), `mail-download-attachment` (saves to disk, returns the path) |
| Write | `OUTLOOK_ENABLE_WRITE` | `mail-create-draft`, `mail-create-reply-draft` (reply or reply-all, new text above the quoted thread), `mail-create-forward-draft`, `mail-update-draft`, `mail-add-draft-attachment` (local file; upload session above 3 MB), `mail-mark-read`, `mail-move-message`, `mail-flag-message` |
| Send | `OUTLOOK_ENABLE_SEND` | `mail-send-draft` (send an existing draft by id), `mail-send` (compose and send in one call, saved to Sent Items) |
| Delete | `OUTLOOK_ENABLE_DELETE` | `mail-delete-message` (moves to Deleted Items, recoverable; needs `confirm: true`). No permanent delete. |

Content rules:

- Outbound bodies are written in markdown and converted to sanitised HTML (`marked` + `dompurify`, the same allowlist as Teams' `message-content.ts`), or passed as plain text.
- Inbound HTML bodies are flattened to readable text. Links keep their URL as `[label](href)`. Styles, scripts, hidden elements and images are dropped, with a placeholder for images.
- Recipients are email addresses. No directory lookup, because the Outlook registration will not carry a directory permission.

## Security controls

- **Every switch off by default.** Read is the only thing that works out of the box.
- **Email content is untrusted input.** `mail-get-message` and `mail-get-conversation` wrap message bodies in a clearly labelled block stating that the content came from an email and is data, not instructions, because an incoming email can carry text aimed at the agent.
- **Local-file guard for attachments.** `mail-add-draft-attachment` resolves the real path (following symlinks) and refuses anything outside the user's home directory, anything with a path segment starting with `.`, and credential-shaped files (`.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_*`). That stops an injected instruction attaching a key file to an email.
- **Downloads go to one fixed folder per server.** File names are sanitised so a hostile attachment name cannot write outside that folder.
- **403 hints name the missing permission** and say it is an app registration matter, not a sign-in problem.
- **No MCP stdout.** Stderr only, per repo rule.

## Out of scope

Calendar, contacts, shared mailboxes, mail rules, creating sharing links, permanent delete, migrating Teams onto `m365-core`, publishing to npm (local testing first).

## Testing

- Unit tests (vitest) stub the Graph client and assert the exact path, query and body for every call, including query options an endpoint rejects (see `packages/teams/CLAUDE.md` § Testing for why absences are pinned too). Fixtures for response shapes are captured live wherever the permission exists, not copied from documentation.
- SharePoint is tested live against a test site the user supplied, signed in against an existing registration that already carries delegated `Sites.ReadWrite.All`. Write and delete tests use one disposable folder, removed afterwards.
- Outlook is tested live only once its registration has mail permissions. Until then it signs in and every mail tool returns the missing-permission hint, which is itself checked.
- App-only SharePoint behaviour gets a regression check: with a secret configured, the server starts in client-credentials mode and the existing tools are unchanged.

## What to request from your IT administrator

Two new delegated app registrations, one per server, set up like the Teams one. The full request, with the permission tables, is the last section of the plan: `docs/superpowers/plans/2026-09-23-delegated-outlook-sharepoint.md` § What to request from your IT administrator.
