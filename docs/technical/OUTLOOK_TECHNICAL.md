# Outlook - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     User-facing summary: docs/documentation/OUTLOOK.md -->

<overview>

## Overview

`@mcp-consultant-tools/outlook` gives an agent delegated (signed in as the user) access to that user's own Outlook mailbox and calendar, and to colleagues' calendars shared with them, through Microsoft Graph. Device code is the only sign-in mode: app-only mail access would reach every mailbox in the tenant and is out of scope.

- **Binaries:** `mcp-outlook` (MCP server, stdio) and `mcp-outlook-cli` (CLI with the same capabilities).
- **Tools:** 31. Twenty-two prefixed `mail-` in seven groups (auth, read, drafts, write, categories, send, delete) and nine prefixed `calendar-` (five reads, four changes).
- **Switches:** drafts, write, send and delete are each off by default; drafts follows write while its own switch is unset. Read is the only group that works out of the box.
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
│   ├── mail-write-service.ts # drafts, attachments, mark read, move, flag, categories, delete
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
| `OUTLOOK_ENABLE_DRAFTS` | follows `OUTLOOK_ENABLE_WRITE` | Drafts group. While unset or empty it follows `OUTLOOK_ENABLE_WRITE`, so a configuration from before the split behaves as it did; once set, only its own value counts (`false` turns drafts off even with write on). |
| `OUTLOOK_ENABLE_WRITE` | `false` | Write group (mark read, move, flag). |
| `OUTLOOK_ENABLE_CATEGORIES` | `false` | Categories group (`mail-set-categories`). Independent of write in both directions. |
| `OUTLOOK_ENABLE_SEND` | `false` | Send group. Independent of write: send works with write off, and write does not unlock send. |
| `OUTLOOK_ENABLE_DELETE` | `false` | Delete group. |
| `OUTLOOK_DOWNLOAD_DIR` | `~/Downloads/mcp-outlook` | Attachment download folder, created with mode 0700. |
| `OUTLOOK_MAX_ATTACHMENT_MB` | `25` | Size cap for `mail-add-draft-attachment`, checked before a local file is read or a linked file is downloaded. |
| `OUTLOOK_ENABLE_CALENDAR_SHARED` | `false` | Reading colleagues' calendars shared with the user. |
| `OUTLOOK_ENABLE_CALENDAR_WRITE` | `false` | Calendar changes on the user's own calendar that notify nobody. |
| `OUTLOOK_ENABLE_CALENDAR_INVITE` | `false` | Any calendar change that notifies another person: invitations, updates, cancellations, responses. |
| `OUTLOOK_ENABLE_CALENDAR_DELEGATE` | `false` | Any change on a calendar the user is a delegate on (plus invite when it notifies). |
| `OUTLOOK_TIME_ZONE` | the machine's zone | IANA zone (e.g. `Europe/London`) that times without a zone are read in, and that reads ask Graph to return times in. |

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
| drafts | `Mail.ReadWrite` | `OUTLOOK_ENABLE_DRAFTS` (follows `OUTLOOK_ENABLE_WRITE` while unset) |
| write | `Mail.ReadWrite` | `OUTLOOK_ENABLE_WRITE` |
| categories | `Mail.ReadWrite` | `OUTLOOK_ENABLE_CATEGORIES` |
| send | `Mail.Send` | `OUTLOOK_ENABLE_SEND` |
| delete | `Mail.ReadWrite` | `OUTLOOK_ENABLE_DELETE` |

The drafts entry also carries `followsWrite` (whether `OUTLOOK_ENABLE_DRAFTS` is unset) and `attachFromLink: { needs, granted }`, which says whether the sign-in carries one of `Files.Read.All`, `Files.ReadWrite.All`, `Sites.Read.All`, `Sites.ReadWrite.All` and so whether a linked file can be attached rather than only linked.

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
| `mail-list-categories` | none | `GET /me/outlook/masterCategories`: the mailbox's defined categories as `{ displayName, color }`. Microsoft documents `MailboxSettings.Read` for this call; verified live 2026-09-29 to succeed on a sign-in carrying `Mail.ReadWrite` and no `MailboxSettings` permission. A 403 gets the read-group hint. |
| `mail-list-messages` | `folder?`, `top?`, `unreadOnly?`, `from?`, `since?`, `until?`, `hasAttachments?` | `GET /me/mailFolders/{folder}/messages`, folder default `inbox` (well-known name or id). `top` default 20, capped at 50. Filters combine into one `$filter`, ordered `receivedDateTime desc`. Returns summaries. |
| `mail-search-messages` | `query`, `top?` | `$search="<query>"` across the mailbox, relevance order. Supports KQL (`from:`, `subject:`, `hasattachments:true`, `received>=2026-09-01`). |
| `mail-get-message` | `id` | Sender, recipients, body as text, attachment list with ids. Body wrapped as untrusted content. |
| `mail-get-conversation` | `conversationId` | Every message in the thread, oldest first, each with body and attachments. |
| `mail-download-attachment` | `messageId`, `attachmentId` | Saves a file attachment to `OUTLOOK_DOWNLOAD_DIR` and returns the absolute path, size and type. |

Every summary (list, search, get, conversation) carries `categories`, the category names on the message, `[]` when it has none.

**Graph query rules the read service follows** (each is pinned by a unit test):

- **`$search` is never combined with `$orderby` or `$filter`.** Graph rejects the combination. Search results come back in relevance order.
- **When a list is filtered, the filter opens with a `receivedDateTime` clause.** Graph accepts `$filter` with `$orderby` on messages only when the sort property also leads the filter.
- **Conversations are sorted oldest first on the client.** Filtering on `conversationId` and ordering by `receivedDateTime` in one request trips the same rule.
- **Free text in `$filter` and `$search` is percent-encoded by the service.** The Graph client puts `.filter()` and `.search()` values into the URL unencoded, which turned a plus-addressed sender into a space and cut search text at an `&`.
- **A single quote in a conversation id is doubled; a double quote inside search text is escaped with a backslash.**

</tool-group>

<tool-group name="write">

### Drafts (`OUTLOOK_ENABLE_DRAFTS=true`, or `OUTLOOK_ENABLE_WRITE=true` while drafts is unset) and write (`OUTLOOK_ENABLE_WRITE=true`)

The five draft tools form the drafts group; mark read, move and flag form the write group. Every draft tool's result carries `note: "Saved as a draft. Nothing was sent."`

| Tool | Parameters | Behaviour |
|---|---|---|
| `mail-create-draft` | `to`, `cc?`, `bcc?`, `subject`, `body`, `format?`, `importance?` | New draft in Drafts. Returns id and web link. Nothing is sent. |
| `mail-create-reply-draft` | `messageId`, `replyAll?`, `body`, `format?` | Calls `createReply` or `createReplyAll` with an empty body, reads the draft back, then sets the body to your text followed by the existing quoted thread, so the thread survives. |
| `mail-create-forward-draft` | `messageId`, `to`, `body?`, `format?` | Forward draft with an optional note above the forwarded message. |
| `mail-update-draft` | `draftId`, `to?`, `cc?`, `bcc?`, `subject?`, `body?`, `format?` | A given body replaces the whole body. |
| `mail-add-draft-attachment` | `draftId`, `filePath` or `url` (exactly one) | `filePath`: a local file through the local-file guard. `url`: an https SharePoint or OneDrive link, looked up with `GET /shares/u!{base64url}/driveItem` on the Outlook sign-in; a folder is refused; the bytes are fetched into memory from `@microsoft.graph.downloadUrl` (no Authorization header) and never written to disk. On a 403 from `/shares` the link is put into the draft body instead, before Outlook's `appendonsend` / `divRplyFwdMsg` separator so it sits under the user's text and above any quoted thread, and the result is `{ attached: false, linkInserted: true, url, reason }` naming `Files.Read.All`. Either source: 3 MB or under, one `POST .../attachments` with base64 `contentBytes`; above 3 MB, `createUploadSession`, then `PUT` chunks in multiples of 320 KiB with `Content-Range`; above `OUTLOOK_MAX_ATTACHMENT_MB`, refused before the bytes are read. A real attachment returns `{ attached: true, attachmentId?, name, size }`. |
| `mail-mark-read` | `messageId`, `isRead` | Sets the read state. |
| `mail-move-message` | `messageId`, `destinationFolder` | Well-known name (`archive`, `deleteditems`, `inbox`, `drafts`) or a folder id. The message gets a new id, which is returned. |
| `mail-flag-message` | `messageId`, `flag` | `flagged`, `complete` or `notFlagged`. |

### Categories (`OUTLOOK_ENABLE_CATEGORIES=true`)

| Tool | Parameters | Behaviour |
|---|---|---|
| `mail-set-categories` | `messageId`, `add?`, `remove?` | Graph's `PATCH /me/messages/{id}` with `categories` replaces the whole list, so the service reads the current list (`$select=categories`), removes the names in `remove`, appends the names in `add` that are not already there, and patches the merged list. Categories the caller did not name are always kept. Names match without regard to case and an existing name keeps its spelling. No `PATCH` is sent when nothing would change. Refused before any call with nothing to add or remove, or with a name in both lists. Returns `{ messageId, before, categories, changed }`. A name not in `mail-list-categories` is set on the message but has no colour. Verified live 2026-09-29: added an existing category to a message that had one, read it back, removed it, and the message ended with exactly its original category. |

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

<tool-group name="calendar">

### Calendar

**Permissions.** `Calendars.ReadWrite` covers the user's own calendar and `getSchedule`. `Calendars.ReadWrite.Shared` covers colleagues' shared calendars, delegate calendars and `findMeetingTimes`; it does not cover the user's own calendar, so both are needed. `OnlineMeetings.ReadWrite` is needed only for `recordAutomatically`. `mail-auth-status` reports each calendar group under `access.calendar`.

**Switches depend on what a call does, not on which tool it is.** On the user's own calendar, a change that notifies nobody needs `OUTLOOK_ENABLE_CALENDAR_WRITE` and a change that notifies anyone needs `OUTLOOK_ENABLE_CALENDAR_INVITE`. On a calendar the user is a delegate on (`calendarOwner` set), every change needs `OUTLOOK_ENABLE_CALENDAR_DELEGATE`, plus invite when it notifies. Graph sends invitations, updates and cancellations the moment the call is made; there is no draft meeting. Update and cancel first refuse when no switch could allow the change, then read the event (one `GET`) to learn whether it has attendees, then check the exact switch before changing anything. Every change result says who was notified, or `No one was notified.` The attendee check is on the event, not on the fields changed: setting only `recordAutomatically` on a meeting with attendees still needs `OUTLOOK_ENABLE_CALENDAR_INVITE`, although Graph notifies nobody for that change. This is deliberate; do not loosen it.

**Times.** A time without `Z` or an offset is read in `OUTLOOK_TIME_ZONE` and sent to Graph as UTC (`{ dateTime, timeZone: 'UTC' }`). Reads send `Prefer: outlook.timezone="<zone>"`; each event returns the zone its times are in. **Verified live on 2026-09-29:** create, read, move and delete of an own appointment (no one notified); invite, move and cancel of a one-attendee Teams meeting (the attendee notified each time); `getSchedule`, `findMeetingTimes`, `calendar-list-calendars` and reading a colleague's shared calendar. Reads came back in the IANA zone requested (`Europe/London`), so `Prefer: outlook.timezone` accepts IANA names. A read seconds after create already carried the Teams join URL. Accept and a `tentativelyAccept` with `proposedNewTime` were verified the same day; Outlook sent the organiser a "New Time Proposed" message carrying the comment. Not yet exercised live: `recordAutomatically`, delegate calendars.

| Tool | Parameters | Switch | Behaviour |
|---|---|---|---|
| `calendar-list-calendars` | none | none | `GET /me/calendars`. |
| `calendar-list-events` | `start`, `end`, `user?`, `top?` (default 50, max 200) | shared when `user` is set | `GET /me/calendarView` or `/users/{user}/calendarView`, oldest first. Each occurrence is listed; `seriesMasterId` names its series. |
| `calendar-get-event` | `eventId`, `user?` | shared when `user` is set | One event with attendee responses; the body is wrapped as untrusted content. |
| `calendar-get-schedule` | `people`, `start`, `end`, `intervalMinutes?` (default 30) | none | `POST /me/calendar/getSchedule`. Works for anyone in the organisation; subjects only where their settings allow. |
| `calendar-find-meeting-times` | `attendees`, `durationMinutes`, `start`, `end`, `maxCandidates?` | none | `POST /me/findMeetingTimes`, working hours, every attendee required. Needs `Calendars.ReadWrite.Shared`. |
| `calendar-create-event` | `subject`, `start`, `end`, `attendees?`, `optionalAttendees?`, `location?`, `body?`, `teamsMeeting?`, `recordAutomatically?`, `showAs?`, `calendarOwner?` | write, or invite with attendees | `POST .../events`. A meeting with attendees gets a Teams link unless `teamsMeeting` is false. |
| `calendar-update-event` | `eventId` plus any field to change; `attendees` replaces the list | write, or invite when the event has or gets attendees | `PATCH .../events/{id}` with only the fields given. An occurrence id changes one occurrence; a `seriesMasterId` changes the series. Refuses meetings the user does not organise. |
| `calendar-cancel-event` | `eventId`, `comment?` | invite with attendees, else write | With attendees: `POST .../events/{id}/cancel` with the comment. Without: `DELETE .../events/{id}`, which moves it to Deleted Items. `permanentDelete` is never called. Refuses meetings the user does not organise. |
| `calendar-respond-to-event` | `eventId`, `response` (`accept`, `tentativelyAccept`, `decline`), `comment?`, `proposedStart?`, `proposedEnd?` | invite | `POST .../events/{id}/{response}` with `sendResponse: true`. Refuses meetings the user organises. A proposed time is sent as `proposedNewTime` (UTC); Graph takes it only with `tentativelyAccept` or `decline`, so it is refused with `accept`, when only one end is given, and when the event has `allowNewTimeProposals: false`. |

**Recording.** `recordAutomatically` is off by default. When true, after the event exists the server finds its Teams meeting (`GET /me/onlineMeetings?$filter=JoinWebUrl eq '...'`) and patches `recordAutomatically` on it; it takes effect only before the meeting starts. A failed recording step never hides a sent invitation: the result still says who was notified, then why recording was not set. On a delegate calendar it is skipped with a message. The server never sets any transcription property: Graph has none that starts transcription alone.

</tool-group>

</tool-reference>

<content-handling>

## Content Handling

- **Inbound HTML to text (`htmlToText`):** links become `[label](href)` unless the label is the URL itself; `<style>`, `<script>`, `<head>` and `display:none` elements are dropped; paragraphs and `<br>` become line breaks; table rows become one line each; images become `[image]`.
- **Untrusted wrapper (`wrapUntrusted`):** `mail-get-message`, `mail-get-conversation` and `calendar-get-event` wrap each body in a labelled block stating that it came from an email and is data, not instructions. An incoming email can carry text aimed at the agent; the wrapper is what tells the agent not to act on it.
- **Outbound (`markdownToHtml`):** `marked` then `dompurify` over `jsdom`.

</content-handling>

<security>

## Security Controls

- **Off by default.** A switched-off tool stays registered, makes no Graph call and throws `<Capability> is disabled. Set <VAR>=true to enable.`, so the agent can tell the user what to turn on.
- **Drafts cannot send.** The drafts switch and the send switch are independent; a draft-only configuration (`OUTLOOK_ENABLE_DRAFTS=true`, send off) prepares mail that only a person can send.
- **Local-file guard (`assertSafeLocalFile`).** Resolves the real path, following symlinks, and refuses anything outside the home directory, any path with a segment starting with `.` (so `~/.ssh`, `~/.aws` and similar), and credential-shaped names: `.env*`, `id_*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`. A symlink inside home that points outside it is refused.
- **Downloads stay in one folder.** Attachment names are sanitised so `../` or `/` cannot escape `OUTLOOK_DOWNLOAD_DIR`; an existing file is never overwritten (`name (1).ext`, `name (2).ext`, ...). Embedded Outlook items (`itemAttachment`) and cloud-file links (`referenceAttachment`) are refused with a message naming the type.
- **No standing credential.** No client secret or certificate; the server can only do what the signed-in user can do, in that user's own mailbox.
- **Invitations are gated separately from calendar writes.** `OUTLOOK_ENABLE_CALENDAR_WRITE` alone can never notify another person, and no mail switch opens any calendar tool.
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
| `folders`, `categories`, `list`, `search`, `get`, `thread`, `attachment` | the seven read tools |
| `draft`, `reply`, `forward`, `update-draft`, `attach` (`--file` or `--url`) | the five draft tools |
| `mark-read`, `move`, `flag` | the three write tools |
| `set-categories` (`--add`, `--remove`, comma-separated) | `mail-set-categories` |
| `send-draft`, `send` | the two send tools |
| `delete` (needs `--confirm`) | `mail-delete-message` |
| `calendar calendars`, `events`, `event`, `schedule`, `find-times` | the five calendar read tools |
| `calendar create`, `update`, `cancel`, `respond` | the four calendar change tools |

With the global `--json` flag, stdout carries the full JSON alone and the cache path goes to stderr; `--env-file` loads the environment from a file. `--no-cache` is accepted but ignored: reads always write the cache.

</cli>

<testing>

## Testing

- `npm test --workspace=packages/outlook`.
- Service tests drive a **real Graph client over a recording transport** (`src/__tests__/graph-recorder.ts`), so they assert on the request that would go on the wire: path, decoded query options, headers and body. That is what lets a test pin an absence, such as no `$orderby` beside `$search`, and what caught the unencoded `$filter` values.
- **Calendar not yet live-verified:** everything waits for the calendar permissions on the registration. Once they land, delegate calendars and responding to an invitation stay unit-tested only, and whether Graph honours an IANA zone in `Prefer: outlook.timezone` is checked in the first live read.
- **Not yet live-verified** (they follow the documented shape and wait for a registration with mail permissions): `$expand=attachments($select=id,name,size,contentType,isInline)` on message and conversation reads, and the backslash escape of a double quote inside `$search`. If `$expand` is rejected beside `$filter` on a conversation, the fallback is one attachments call per message.

</testing>
