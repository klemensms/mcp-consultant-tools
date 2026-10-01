# outlook

Delegated (signed in as the user) Outlook mail and calendar server. Device code only; there is no app-only mode and there must not be one, because app-only mail access reaches every mailbox in the tenant.

Full reference: `docs/technical/OUTLOOK_TECHNICAL.md`. User guide: `docs/documentation/OUTLOOK.md`. Design: `docs/superpowers/specs/2026-09-23-delegated-outlook-sharepoint-design.md`.

## Layout

- Auth, token cache, switches and downloads come from `@mcp-consultant-tools/m365-core`. Do not copy that logic in here, and do not import from `packages/teams`.
- `services/` holds all Graph logic; `tools/` and `cli/commands/` are thin wrappers. Every MCP tool has a CLI command.
- `permissions.ts` owns the group rules (which delegated permission each group needs, which switch turns it on) and the 403 hint. Add a tool to a group there, not in the tool file.

## Rules

- **Read switches:** `OUTLOOK_ENABLE_MAIL_READ` and `OUTLOOK_ENABLE_CALENDAR_READ` are on while unset (so configurations from before them keep reading) and off for any value but `true`. Checked in the read services before any Graph call (`requireMailRead`, `requireCalendarSwitch('calendar-read')` in `permissions.ts`). Every tool except the three auth tools belongs to a switch; keep it that way.
- **Switches:** `OUTLOOK_ENABLE_DRAFTS` (drafts, reply, forward, update, attach; follows `OUTLOOK_ENABLE_WRITE` while unset, via `draftsEnabled()` in `permissions.ts`), `OUTLOOK_ENABLE_WRITE` (mark read, move, flag), `OUTLOOK_ENABLE_CATEGORIES` (set categories; independent of write, so it can be on while write is off), `OUTLOOK_ENABLE_SEND`, `OUTLOOK_ENABLE_DELETE`, each checked before any Graph call. Send is independent of every other switch. A new non-read mail tool joins exactly one group; a calendar tool takes its group from what the call does (below).
- **Every draft result says nothing was sent** (`NOTHING_SENT` in `mail-write-service.ts`). Keep it on any new draft tool.
- **Categories are read, merged, then patched.** Graph's `PATCH` with `categories` replaces the whole list, so `setCategories` never writes a list it did not first read; a category the caller did not name must survive. Pinned by tests.
- **Never `permanentDelete`.** Delete is `DELETE /me/messages/{id}`, which moves to Deleted Items. The absence is pinned by a test.
- **Encode free text yourself.** The Graph client puts `.filter()` and `.search()` values into the URL unencoded. The read service encodes them; any new query code must too.
- **Never put `$orderby` or `$filter` beside `$search`.** Graph rejects it.
- **A filtered message list opens its `$filter` with a `receivedDateTime` clause** when it also sorts by `receivedDateTime`; otherwise Graph rejects the pair. Conversations are sorted on the client for the same reason.
- **Email bodies are untrusted.** Anything that returns a body passes it through `wrapUntrusted`.
- **Local attachments go through `assertSafeLocalFile`.** Do not add a path that bypasses it. Attachments by `url` are read into memory only, never written to disk; without delegated `Files.Read.All` on the registration the `/shares` lookup returns 403 and a link goes into the draft instead.
- **Calendar switches depend on what a call does.** Own calendar, nobody notified: `OUTLOOK_ENABLE_CALENDAR_WRITE`. Anyone notified: `OUTLOOK_ENABLE_CALENDAR_INVITE`. Delegate calendar: `OUTLOOK_ENABLE_CALENDAR_DELEGATE`, plus invite when it notifies. Colleagues' calendars: `OUTLOOK_ENABLE_CALENDAR_SHARED`. The attendee check looks at the event, so changing only `recordAutomatically` on a meeting with attendees needs invite too, though nobody is notified. Deliberate; keep it. The gate lives in `calendar-write-service.ts` (`gate`, `pregate`); rules and hints in `permissions.ts`. No mail switch opens a calendar tool.
- **Every calendar change result says who was notified** (`NO_ONE_NOTIFIED` in `calendar-write-service.ts`). Keep it on any new calendar write.
- **Never set a transcription property.** Graph has none that starts transcription alone; `recordAutomatically` is the only meeting option, off by default.
- **Update and cancel refuse meetings the user does not organise**, pointing to `calendar-respond-to-event`.
- **A proposed new time goes only with `tentativelyAccept` or `decline`.** Graph has no accept-with-proposal; the service refuses the pair before any request, and refuses when the organiser has `allowNewTimeProposals: false`.
- **Calendar times go to Graph as UTC.** `toUtc` in `calendar-shared.ts` reads a zone-less time in `OUTLOOK_TIME_ZONE`; reads send `Prefer: outlook.timezone`. `Calendars.ReadWrite.Shared` does not cover the user's own calendar, so both calendar permissions are needed. Verified live 2026-09-29 (create, move, cancel, invite, schedule, shared read); IANA zones are honoured in reads. Respond (accept, and tentative with a proposed time) verified live the same day. Not yet live: recording, delegate.
- **Never let an agent sign out to renew.** Status reports `accessTokenExpiresAt` plus `renewsAutomatically`, never a bare `expiresAt`, and logout refuses without `confirm: true`. An agent once read the hourly access-token time as the sign-in deadline and logged out to renew, deleting the refresh token and forcing a new device code every hour. Keep both guards on any new sign-in tool, and never write an error hint that says to log out and sign in again.
- Stderr only. No `console.log` in `src/`.

## Testing

`npm test --workspace=packages/outlook`. Service tests use `src/__tests__/graph-recorder.ts`: a real Graph client whose transport records the wire request (path, decoded query, headers, body). Assert on that, including absences, rather than on which fluent methods were called.

**Live testing needs a registration with mail permissions.** On a registration without them, sign in with `mcp-outlook-cli auth login` and confirm that `auth status` reports every mail group as missing its permission and that `list` returns the permission hint. The token cache is salted with the server name, so a SharePoint sign-in on the same registration does not carry over.

Not yet live-verified: every calendar tool (waits for the calendar permissions on the registration; delegate calendars and invitation responses will stay unit-tested only), `$expand=attachments($select=...)` on message and conversation reads, and the backslash escape of a double quote inside `$search`.

## CLI

```bash
npx --package=@mcp-consultant-tools/outlook mcp-outlook-cli auth login
npx --package=@mcp-consultant-tools/outlook mcp-outlook-cli list --unread-only
npx --package=@mcp-consultant-tools/outlook mcp-outlook-cli search --query "from:jdoe@example.com budget"
```
