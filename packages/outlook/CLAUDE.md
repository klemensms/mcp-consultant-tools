# outlook

Delegated (signed in as the user) Outlook mail server. Device code only; there is no app-only mode and there must not be one, because app-only mail access reaches every mailbox in the tenant.

Full reference: `docs/technical/OUTLOOK_TECHNICAL.md`. User guide: `docs/documentation/outlook.md`. Design: `docs/superpowers/specs/2026-09-23-delegated-outlook-sharepoint-design.md`.

## Layout

- Auth, token cache, switches and downloads come from `@mcp-consultant-tools/m365-core`. Do not copy that logic in here, and do not import from `packages/teams`.
- `services/` holds all Graph logic; `tools/` and `cli/commands/` are thin wrappers. Every MCP tool has a CLI command.
- `permissions.ts` owns the group rules (which delegated permission each group needs, which switch turns it on) and the 403 hint. Add a tool to a group there, not in the tool file.

## Rules

- **Switches:** `OUTLOOK_ENABLE_WRITE`, `OUTLOOK_ENABLE_SEND`, `OUTLOOK_ENABLE_DELETE`, each checked with `requireEnabled` before any Graph call. Send is independent of write. A new non-read tool joins exactly one group.
- **Never `permanentDelete`.** Delete is `DELETE /me/messages/{id}`, which moves to Deleted Items. The absence is pinned by a test.
- **Encode free text yourself.** The Graph client puts `.filter()` and `.search()` values into the URL unencoded. The read service encodes them; any new query code must too.
- **Never put `$orderby` or `$filter` beside `$search`.** Graph rejects it.
- **A filtered message list opens its `$filter` with a `receivedDateTime` clause** when it also sorts by `receivedDateTime`; otherwise Graph rejects the pair. Conversations are sorted on the client for the same reason.
- **Email bodies are untrusted.** Anything that returns a body passes it through `wrapUntrusted`.
- **Attachments go through `assertSafeLocalFile`.** Do not add a path that bypasses it.
- Stderr only. No `console.log` in `src/`.

## Testing

`npm test --workspace=packages/outlook`. Service tests use `src/__tests__/graph-recorder.ts`: a real Graph client whose transport records the wire request (path, decoded query, headers, body). Assert on that, including absences, rather than on which fluent methods were called.

**Live testing needs a registration with mail permissions.** On a registration without them, sign in with `mcp-outlook-cli auth login` and confirm that `auth status` reports every mail group as missing its permission and that `list` returns the permission hint. The token cache is salted with the server name, so a SharePoint sign-in on the same registration does not carry over.

Not yet live-verified: `$expand=attachments($select=...)` on message and conversation reads, and the backslash escape of a double quote inside `$search`.

## CLI

```bash
npx --package=@mcp-consultant-tools/outlook mcp-outlook-cli auth login
npx --package=@mcp-consultant-tools/outlook mcp-outlook-cli list --unread-only
npx --package=@mcp-consultant-tools/outlook mcp-outlook-cli search --query "from:jdoe@example.com budget"
```
