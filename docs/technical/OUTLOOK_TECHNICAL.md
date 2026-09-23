# Outlook - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     User-facing summary: docs/documentation/OUTLOOK.md -->

<overview>

## Overview

`@mcp-consultant-tools/outlook` gives an agent delegated (signed in as the user) access to that user's own Outlook mailbox through Microsoft Graph. Device code is the only sign-in mode: app-only mail access would reach every mailbox in the tenant and is out of scope.

- **Binaries:** `mcp-outlook` (MCP server, stdio) and `mcp-outlook-cli` (CLI with the same capabilities).
- **Tools:** 20, all prefixed `mail-`, in five groups: auth, read, write, send, delete.
- **Switches:** write, send and delete are each off by default. Read is the only group that works out of the box.
- **Auth plumbing:** `@mcp-consultant-tools/m365-core` (shared with the SharePoint server's device-code mode).

</overview>

<architecture>

## Package Structure

```
packages/outlook/src/
├── index.ts                  # MCP server entry (stdio)
├── cli.ts                    # CLI entry
├── context-factory.ts        # Lazy ServiceContext: auth, mail, write, send
├── types.ts                  # MailSummary, MailDetail, ServiceContext
├── permissions.ts            # Permission groups, mail-auth-status access table, 403 hints
├── mail-content.ts           # htmlToText, markdownToHtml, wrapUntrusted
├── local-file-guard.ts       # assertSafeLocalFile for draft attachments
├── download.ts               # saveFileAttachment (file attachments only)
├── services/
│   ├── mail-read-service.ts  # folders, list, search, get, conversation, attachment
│   ├── mail-write-service.ts # drafts, attachments, mark read, move, flag, delete
│   └── mail-send-service.ts  # send draft, send new
├── tools/                    # Thin MCP wrappers: auth, read, write, send, delete
└── cli/commands/             # Thin Commander wrappers: auth, read, write, send
```

Layering follows the repo rule: business logic in `services/`, thin MCP wrappers in `tools/`, thin CLI wrappers in `cli/`, sharing one ServiceContext from `context-factory.ts`.

## ServiceContext

Services are created on first use, so the server starts and lists its tools without any configuration; a missing `OUTLOOK_TENANT_ID` or `OUTLOOK_CLIENT_ID` surfaces as a clear error on the first call that needs Graph.

## Environment Variables

| Variable | Default | Effect |
|---|---|---|
| `OUTLOOK_TENANT_ID` | required | Entra tenant id. |
| `OUTLOOK_CLIENT_ID` | required | App registration with "Allow public client flows" on and delegated mail permissions. |
| `OUTLOOK_ENABLE_WRITE` | `false` | Write group. |
| `OUTLOOK_ENABLE_SEND` | `false` | Send group. Independent of write: send works with write off, and write does not unlock send. |
| `OUTLOOK_ENABLE_DELETE` | `false` | Delete group. |
| `OUTLOOK_DOWNLOAD_DIR` | `~/Downloads/mcp-outlook` | Attachment download folder, created with mode 0700. |
| `OUTLOOK_MAX_ATTACHMENT_MB` | `25` | Size cap for `mail-add-draft-attachment`, checked before the file is read. |

Only the exact string `true` enables a switch (`TRUE`, `1` and unset are all off).

</architecture>

<authentication>

## Authentication

- MSAL `PublicClientApplication`, device-code flow, authority `https://login.microsoftonline.com/{tenantId}`.
- **Scope requested:** `https://graph.microsoft.com/.default`, never a hand-written list. Entra issues whatever the registration has admin consent for, so an ungranted permission breaks only the tools that need it instead of failing sign-in.
- **Token cache:** AES-256-GCM encrypted MSAL cache at `~/.mcp-consultant-tools/outlook-token-cache-{clientId}.enc`, mode 0600. The server name is part of both the file name and the key salt, so the SharePoint server's cache cannot be reused here even on the same registration: Outlook needs its own sign-in.
- **The CLI and the MCP server share the cache file.** `mcp-outlook-cli auth login` signs in the MCP server too.
- **Order on every call:** in-memory token, then silent refresh from the cached refresh token, then a pending device-code flow, then an error telling the agent to call `mail-authenticate`.

<auth-status-states>

### Auth Status States

| State | Meaning |
|---|---|
| `authenticated` | A valid token, or one renewed silently. |
| `pending` | A device code has been issued and the user has not finished signing in. |
| `expired` | A cache file exists but the refresh token is no longer accepted; sign in again. |
| `not_authenticated` | No sign-in yet. |

`mail-auth-status` also decodes the token's `scp` claim (for display only, never for an access decision) and reports, per group, which permission it needs, whether the sign-in carries it, and whether its switch is on:

| Group | Needs any of | Switch |
|---|---|---|
| read | `Mail.Read`, `Mail.ReadWrite` | none |
| write | `Mail.ReadWrite` | `OUTLOOK_ENABLE_WRITE` |
| send | `Mail.Send` | `OUTLOOK_ENABLE_SEND` |
| delete | `Mail.ReadWrite` | `OUTLOOK_ENABLE_DELETE` |

</auth-status-states>

</authentication>

<tool-reference>

## Tool Reference

<tool-group name="auth">

### Auth (always on)

| Tool | Parameters | Behaviour |
|---|---|---|
| `mail-authenticate` | none | Starts a device-code sign-in and returns the URL and code at once; completion runs in the background. A second call while one is pending returns the same code. |
| `mail-auth-status` | none | State, account, expiry, granted permissions and the per-group access table above. |
| `mail-logout` | none | Removes the account and deletes the cache file. Signs the CLI out too. |

</tool-group>

<tool-group name="read">

### Read (always on)

| Tool | Parameters | Behaviour |
|---|---|---|
| `mail-list-folders` | none | Top-level folders with `unreadItemCount` and `totalItemCount`. |
| `mail-list-messages` | `folder?`, `top?`, `unreadOnly?`, `from?`, `since?`, `until?`, `hasAttachments?` | `GET /me/mailFolders/{folder}/messages`, folder default `inbox` (well-known name or id). `top` default 20, capped at 50. Filters combine into one `$filter`, ordered `receivedDateTime desc`. Returns summaries. |
| `mail-search-messages` | `query`, `top?` | `$search="<query>"` across the mailbox, relevance order. Supports KQL (`from:`, `subject:`, `hasattachments:true`, `received>=2026-09-01`). |
| `mail-get-message` | `id` | Sender, recipients, body as text, attachment list with ids. Body wrapped as untrusted content. |
| `mail-get-conversation` | `conversationId` | Every message in the thread, oldest first, each with body and attachments. |
| `mail-download-attachment` | `messageId`, `attachmentId` | Saves a file attachment to `OUTLOOK_DOWNLOAD_DIR` and returns the absolute path, size and type. |

**Graph query rules the read service follows** (each is pinned by a unit test):

- **`$search` is never combined with `$orderby` or `$filter`.** Graph rejects the combination. Search results come back in relevance order.
- **When a list is filtered, the filter opens with a `receivedDateTime` clause.** Graph accepts `$filter` with `$orderby` on messages only when the sort property also leads the filter.
- **Conversations are sorted oldest first on the client.** Filtering on `conversationId` and ordering by `receivedDateTime` in one request trips the same rule.
- **Free text in `$filter` and `$search` is percent-encoded by the service.** The Graph client puts `.filter()` and `.search()` values into the URL unencoded, which turned a plus-addressed sender into a space and cut search text at an `&`.
- **A single quote in a conversation id is doubled; a double quote inside search text is escaped with a backslash.**

</tool-group>

<tool-group name="write">

### Write (`OUTLOOK_ENABLE_WRITE=true`)

| Tool | Parameters | Behaviour |
|---|---|---|
| `mail-create-draft` | `to`, `cc?`, `bcc?`, `subject`, `body`, `format?`, `importance?` | New draft in Drafts. Returns id and web link. Nothing is sent. |
| `mail-create-reply-draft` | `messageId`, `replyAll?`, `body`, `format?` | Calls `createReply` or `createReplyAll` with an empty body, reads the draft back, then sets the body to your text followed by the existing quoted thread, so the thread survives. |
| `mail-create-forward-draft` | `messageId`, `to`, `body?`, `format?` | Forward draft with an optional note above the forwarded message. |
| `mail-update-draft` | `draftId`, `to?`, `cc?`, `bcc?`, `subject?`, `body?`, `format?` | A given body replaces the whole body. |
| `mail-add-draft-attachment` | `draftId`, `filePath` | Local file through the local-file guard. 3 MB or under: one `POST .../attachments` with base64 `contentBytes`. Above 3 MB: `createUploadSession`, then `PUT` chunks in multiples of 320 KiB with `Content-Range`. Above `OUTLOOK_MAX_ATTACHMENT_MB`: refused before the file is read. |
| `mail-mark-read` | `messageId`, `isRead` | Sets the read state. |
| `mail-move-message` | `messageId`, `destinationFolder` | Well-known name (`archive`, `deleteditems`, `inbox`, `drafts`) or a folder id. The message gets a new id, which is returned. |
| `mail-flag-message` | `messageId`, `flag` | `flagged`, `complete` or `notFlagged`. |

`format` is `markdown` (default), `text` or `html`. Markdown and HTML are converted to sanitised HTML with the same allowlist as the Teams server; a `<script>` never reaches the posted body. Recipients are email addresses, validated before any call; there is no directory lookup, because the registration carries no directory permission.

</tool-group>

<tool-group name="send">

### Send (`OUTLOOK_ENABLE_SEND=true`)

| Tool | Parameters | Behaviour |
|---|---|---|
| `mail-send-draft` | `draftId` | `POST /me/messages/{id}/send`. Real mail, cannot be undone. |
| `mail-send` | as `mail-create-draft` | `POST /me/sendMail` with `saveToSentItems: true`. Real mail, cannot be undone. Prefer a draft when the user should review first. |

</tool-group>

<tool-group name="delete">

### Delete (`OUTLOOK_ENABLE_DELETE=true`)

| Tool | Parameters | Behaviour |
|---|---|---|
| `mail-delete-message` | `messageId`, `confirm` | Refuses without `confirm: true`. Sends `DELETE /me/messages/{id}`, which moves the message to Deleted Items where it can be recovered. `permanentDelete` is never called. |

</tool-group>

</tool-reference>

<content-handling>

## Content Handling

- **Inbound HTML to text (`htmlToText`):** links become `[label](href)` unless the label is the URL itself; `<style>`, `<script>`, `<head>` and `display:none` elements are dropped; paragraphs and `<br>` become line breaks; table rows become one line each; images become `[image]`.
- **Untrusted wrapper (`wrapUntrusted`):** `mail-get-message` and `mail-get-conversation` wrap each body in a labelled block stating that it came from an email and is data, not instructions. An incoming email can carry text aimed at the agent; the wrapper is what tells the agent not to act on it.
- **Outbound (`markdownToHtml`):** `marked` then `dompurify` over `jsdom`.

</content-handling>

<security>

## Security Controls

- **Off by default.** A switched-off tool stays registered, makes no Graph call and throws `<Capability> is disabled. Set <VAR>=true to enable.`, so the agent can tell the user what to turn on.
- **Local-file guard (`assertSafeLocalFile`).** Resolves the real path, following symlinks, and refuses anything outside the home directory, any path with a segment starting with `.` (so `~/.ssh`, `~/.aws` and similar), and credential-shaped names: `.env*`, `id_*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`. A symlink inside home that points outside it is refused.
- **Downloads stay in one folder.** Attachment names are sanitised so `../` or `/` cannot escape `OUTLOOK_DOWNLOAD_DIR`; an existing file is never overwritten (`name (1).ext`, `name (2).ext`, ...). Embedded Outlook items (`itemAttachment`) and cloud-file links (`referenceAttachment`) are refused with a message naming the type.
- **No standing credential.** No client secret or certificate; the server can only do what the signed-in user can do, in that user's own mailbox.
- **No MCP stdout.** All logging goes to stderr.

</security>

<error-handling>

## Error Handling

A 403 from Graph becomes a message naming the delegated permission the tool needs, saying that an administrator grants it on the app registration with admin consent, that signing in again does not add it, and pointing at `mail-auth-status`:

```
Microsoft Graph refused this request (403 Forbidden). The sign-in does not carry the delegated Mail.Read or Mail.ReadWrite permission this needs. An administrator grants it on the app registration, with admin consent; signing in again does not add it. Call mail-auth-status to see which permissions the sign-in carries.
```

Other Graph errors are passed through with their message.

</error-handling>

<cli>

## CLI Architecture

`mcp-outlook-cli` maps every MCP tool:

| CLI | MCP tool |
|---|---|
| `auth login` / `auth status` / `auth logout` | `mail-authenticate` (blocks up to 15 minutes until sign-in completes) / `mail-auth-status` / `mail-logout` |
| `folders`, `list`, `search`, `get`, `thread`, `attachment` | the six read tools |
| `draft`, `reply`, `forward`, `update-draft`, `attach`, `mark-read`, `move`, `flag` | the eight write tools |
| `send-draft`, `send` | the two send tools |
| `delete` (needs `--confirm`) | `mail-delete-message` |

With the global `--json` flag, stdout carries the full JSON alone and the cache path goes to stderr; `--env-file` loads the environment from a file. `--no-cache` is accepted but ignored: reads always write the cache.

</cli>

<testing>

## Testing

- `npm test --workspace=packages/outlook`.
- Service tests drive a **real Graph client over a recording transport** (`src/__tests__/graph-recorder.ts`), so they assert on the request that would go on the wire: path, decoded query options, headers and body. That is what lets a test pin an absence, such as no `$orderby` beside `$search`, and what caught the unencoded `$filter` values.
- **Not yet live-verified** (they follow the documented shape and wait for a registration with mail permissions): `$expand=attachments($select=id,name,size,contentType,isInline)` on message and conversation reads, and the backslash escape of a double quote inside `$search`. If `$expand` is rejected beside `$filter` on a conversation, the fallback is one attachments call per message.

</testing>
