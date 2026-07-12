# Message Center Package Guide

## Overview

MCP server for Microsoft 365 **Service Health** and **Message Center**: per-service health
overviews, service-health issues (incidents and advisories), post-incident review (PIR)
documents, and Message Center posts (planned changes, required actions, advisories).

**Tools:** 7 (all read-only) | **Prompts:** 2 | **Auth:** Message Center service principal → Microsoft Graph

There are no write operations and no feature flags. Nothing in this package mutates anything.

## Environment Configuration

```bash
# Required - all three.
MESSAGE_CENTER_TENANT_ID=your-tenant-id
MESSAGE_CENTER_CLIENT_ID=your-client-id
MESSAGE_CENTER_CLIENT_SECRET=your-client-secret
```

**Deliberately NOT the shared `AZURE_*` block** used by `azure-management` and `azure-defender`.
Those need subscription RBAC; this needs Microsoft Graph *directory* permissions, so it is
usually a different app registration. There is no subscription ID. Same rule as `entra-id`.

## Required Graph Permissions

| Permission | Type | Purpose |
|------------|------|---------|
| `ServiceHealth.Read.All` | Application | Health overviews, issues, and incident reports |
| `ServiceMessage.Read.All` | Application | Message Center posts |

Both must be **application** permissions with admin consent (client credentials, no signed-in
user). Delegated access is possible but additionally requires the signed-in user to hold an
Entra admin role — this package uses app-only.

## Tools

- `m365-list-service-health` — status of every subscribed M365 service (call first to learn the exact service names)
- `m365-get-service-health` — one service in detail, with its issues expanded
- `m365-list-health-issues` — service-health issues, filters: `service`, `classification`, `isResolved`
- `m365-get-health-issue` — one issue by ID (e.g. `EX226792`)
- `m365-get-incident-report` — the PIR document for a resolved issue
- `m365-list-messages` — Message Center posts, filters: `category`, `severity`, `service`, `isMajorChange`
- `m365-get-message` — one message by ID (e.g. `MC172851`)

Tool names are prefixed `m365-` so they do not collide with any other package's bare names in
the meta aggregator.

## Things that will bite you

**Microsoft Graph does not filter these collections server-side.** `$filter`/`$orderby`/`$count`
are undocumented for `serviceAnnouncement`, and Graph's own known-issues page warns unsupported
query parameters "might fail silently" — a 200 OK with the FULL result, as if the filter were
absent. The source this was ported from built `$filter=service eq '...' and classification eq
'...' and isResolved eq ...` plus `$orderby`, then reported the returned count as the filtered
total: a wrong-but-plausible answer on an assurance tool. **Every filter here is client-side**
(`utils/filters.ts` + the `matches*` predicates), and the client sends no `$filter`/`$search`/
`$count`/`$top`. Do not "optimise" a filter into a `$filter` — you will get a false result.

**Enum casing disagrees between Microsoft's docs and Microsoft's live payloads.** The schema
tables document camelCase (`advisory`, `stayInformed`, `normal`); every example payload is
PascalCase (`Advisory`, `StayInformed`, `Normal`). **Every enum comparison is case-insensitive**
(`equalsIgnoreCase`). A case-sensitive compare against the documented spelling would silently
match zero rows on live data. Keep it case-insensitive.

**Resolved-ness comes from `isResolved`, never from `status`.** `serviceHealthIssue.isResolved`
is the authoritative Boolean. The `status` enum has ~18 values (6 reserved/unemitted) and its
wire casing is unreliable — do not derive resolved-ness from it. `serviceHealth` (the per-service
overview) has NO `isResolved`; only `status`.

**`get-service-health` resolves the name against the fetched list, it does not put it in the URL.**
The `healthOverviews/{key}` URL key is the *display name string* ("Exchange Online"), and there is
also a separate stable-ish `id` ("Exchange"). A wrong key is a 404. So the service fetches the
whole list with `$expand=issues` and matches case-insensitively on **both** `service` and `id`;
an unknown name returns the list of available services, not a bare not-found.

**The PIR document is a file stream, and only exists for `postIncidentReviewPublished` issues.**
`get-incident-report` decodes it as UTF-8 text when it can, else base64 (`format` says which).
For any other issue Graph errors — surfaced as a clear message, not an empty document.

**`@odata.nextLink` is used verbatim.** No `.top()`, no `$skiptoken` extraction. `$top` is
undocumented for this API and "might return an error"; the default page size plus nextLink is safe
and these collections are small. Every list returns `truncated` honestly when `maxResults` cut it.

**The only caller value that reaches a URL is a service-announcement ID.** Issue/message IDs are
validated by `assertAnnouncementId` (letters and digits only) before they land in a path segment.
No OData `$filter` is built from caller input, so there is no string literal to escape.

**A message body or incident report may quote a tenant name or an admin email.** This is a
read-only tool over Microsoft-sourced content; it does not redact. Do not paste real PIR text or a
real message body into a public-repo fixture — use placeholders (`Contoso`, `jdoe@example.com`).

## Architecture Notes

- Auth mirrors `packages/entra-id`: `@azure/identity` + `@microsoft/microsoft-graph-client`, not
  `@azure/msal-node`. No new dependency. `Client.initWithMiddleware` supplies Graph's retry handler.
- Services compose over `MessageCenterClient`, so pagination and error normalisation apply once.
- There is exactly **one** `createServiceContext()`, in `context-factory.ts`, imported by both
  `index.ts` and `cli.ts`. Do not replicate `azure-sql`'s duplicate private copy.
- The tenant and client IDs are never logged.

## Testing

```bash
npm run build --workspace=packages/message-center
npm test --workspace=packages/message-center   # 46 tests, no live API
```

Services take an injected client, so tests use plain stub objects — **zero `vi.mock`**. Pure
predicates (`matchesIssue`, `matchesMessage`, `findServiceHealth`, `decodeIncidentReport`,
`equalsIgnoreCase`, `sortByLastModifiedDesc`) are tested directly, including the casing gap and
the resolved/major boolean boundaries.

**Not verified against a live Microsoft 365 tenant.** The Graph contract is checked against
Microsoft's published v1.0 schemas and mocked responses only. In particular, the documented-vs-wire
enum casing and the exact query-option support are the two facts most worth re-confirming against a
real tenant — the client-side, case-insensitive design is built to be correct either way.

## Reference

See `docs/technical/MESSAGE_CENTER_TECHNICAL.md` for the full reference.

## CLI Usage

Binary: `mcp-message-center-cli`. Command name = tool name minus the `m365-` prefix, grouped by domain.

```bash
mcp-message-center-cli health list-service-health
mcp-message-center-cli health get-service-health "Exchange Online"
mcp-message-center-cli health list-health-issues --is-resolved false --classification incident
mcp-message-center-cli health get-health-issue EX226792
mcp-message-center-cli health get-incident-report EX226792

mcp-message-center-cli message list-messages --category planForChange --is-major-change true
mcp-message-center-cli message get-message MC172851
```
