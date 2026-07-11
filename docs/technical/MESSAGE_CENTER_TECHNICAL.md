# Microsoft 365 Message Center & Service Health - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/MESSAGE_CENTER.md -->

<overview>

The Message Center integration reads Microsoft 365 Service Health and Message Center through the Microsoft Graph v1.0 Service Communications API (`/admin/serviceAnnouncement/*`): per-service health overviews, service-health issues (incidents and advisories), post-incident review (PIR) documents, and Message Center posts. Every tool is read-only; the package has no write operations and no feature flags.

**Package:** `@mcp-consultant-tools/message-center`
**Binaries:** `mcp-message-center` (MCP server), `mcp-message-center-cli` (CLI)
**Total tools:** 7 (all read-only)
**Prompts:** 2
**Auth:** Message Center service principal (`ClientSecretCredential`) against `https://graph.microsoft.com`
**Tool prefix:** `m365-`

</overview>

<architecture>

## Architecture

**Client layer:**
- `MessageCenterClient` — wraps `Client.initWithMiddleware` from `@microsoft/microsoft-graph-client`, authenticated by `TokenCredentialAuthenticationProvider` over `ClientSecretCredential`. Graph's own middleware chain supplies the retry handler (429/503, honouring `Retry-After`), so this class carries no retry loop. It exposes `get()` (single resource, optional `$expand`), `paginate()` (follows `@odata.nextLink`, honest `truncated`), `getRaw()` (binary body for the PIR stream), and `enhanceError()` (maps 401/403/404/429 to messages that name the missing grant).

Auth mirrors `packages/entra-id` (`@azure/identity` + `@microsoft/microsoft-graph-client`) — the closest sibling: Graph, client credentials, read-only. No additional dependency.

**Service classes** (each takes an injected `MessageCenterClient`, so pagination and error normalisation apply once):
- `HealthService` — service-health overviews, issues, incident report
- `MessageService` — Message Center posts

`ServiceContext` exposes two lazy getters (`health`, `messages`). There is exactly **one** `createServiceContext()` (in `context-factory.ts`), imported by both `index.ts` and `cli.ts`.

**Pure, unit-tested functions** (no Graph client required):
- `matchesIssue(issue, options)` / `matchesMessage(message, options)` — client-side, case-insensitive filter predicates
- `findServiceHealth(services, nameOrId)` — case-insensitive match on the display name or the id
- `decodeIncidentReport(buffer, issueId)` — text/base64 sniffing for the PIR stream
- `equalsIgnoreCase` / `includesIgnoreCase` / `someIncludesIgnoreCase` / `sortByLastModifiedDesc`
- `isAnnouncementId` / `assertAnnouncementId`

**Source layout:**
```
packages/message-center/src/
  index.ts                        # MCP server entry + registerMessageCenterTools()
  cli.ts                          # CLI entry point
  context-factory.ts              # Single shared createServiceContext() for MCP + CLI
  types.ts                        # ServiceContext interface
  message-center-client.ts        # MessageCenterClient + statusCodeOf + PaginatedResult
  models/
    message-center-types.ts       # Graph response shapes + option/result shapes
  utils/
    announcement-id.ts            # isAnnouncementId / assertAnnouncementId
    filters.ts                    # case-insensitive matching + sortByLastModifiedDesc
    __tests__/*.test.ts
  services/
    health-service.ts             # HealthService + pure predicates
    message-service.ts            # MessageService + pure predicate
    __tests__/*.test.ts
  tools/
    tool-helpers.ts               # runTool() response shape, READ_ONLY annotations
    health-tools.ts               # 5 tools
    message-tools.ts              # 2 tools
  prompts/
    templates.ts                  # 2 prompt templates
  cli/
    output.ts                     # .mcp-message-center-cache wrapper
    commands/                     # health + message groups
```

</architecture>

<graph-query-contract>

## Graph query contract

Verified against Microsoft Learn on 2026-07-11. Graph v1.0; all seven endpoints are GA (no `beta` needed; the beta schemas are identical). There is no api-version parameter.

| Fact | Consequence for this package |
|------|------------------------------|
| Server-side `$filter`/`$orderby`/`$count`/`$search` are **undocumented** for the `issues` and `messages` collections, and Graph's known-issues page warns unsupported query parameters "might fail silently" (200 OK, full result) | **Every filter and ordering is client-side.** The client sends no `$filter`/`$search`/`$count`. The source this was ported from built these server-side and reported the returned count as the filtered total. |
| `$top` is undocumented for these collections and "might return an error" | `paginate()` sends no `$top`; it follows `@odata.nextLink` from the default page. The collections are small. |
| Enum casing differs between the docs (camelCase: `advisory`, `stayInformed`, `normal`) and every example payload (PascalCase: `Advisory`, `StayInformed`, `Normal`) | **Every enum comparison is case-insensitive** (`equalsIgnoreCase`). A case-sensitive check would silently match zero rows on live data. |
| `serviceHealthIssue.isResolved` is a Boolean and is the authoritative resolved flag | Resolved/unresolved is derived from `isResolved`, never from the `status` enum. `serviceHealth` (overview) has no `isResolved` — only `status`. |
| `serviceHealth` id vs `service`: the URL key for a single healthOverview is the **display-name string** ("Exchange Online"); the `id` ("Exchange") is separate | `get-service-health` fetches `healthOverviews?$expand=issues` and matches the caller's value case-insensitively on **both** `service` and `id`, rather than putting it in the URL path (a wrong key would be a 404 reported as not-found). |
| The only two ways to reach issues are the top-level `/issues` collection and `$expand=issues`; there is **no** `/healthOverviews/{service}/issues` sub-collection. Both return identical `serviceHealthIssue` objects | `list-health-issues` uses `/issues`; `get-service-health` uses `$expand=issues`. |
| `messages.services` and `issue.service` are **display-name strings**, not stable ids/enums | Service filters are case-insensitive substring matches; the tool descriptions point callers at `m365-list-service-health` for exact names. |
| The PIR is `GET /issues/{id}/incidentReport`, returning a **file stream**, and exists only for issues with status `postIncidentReviewPublished` (errors otherwise) | `getRaw()` fetches it as an ArrayBuffer; `decodeIncidentReport` returns text or base64. A missing PIR surfaces as a clear error. |
| `@odata.nextLink` must be used verbatim | `paginate()` passes it straight to `.api()` with no mutation. |

Sources: [Service Communications API overview](https://learn.microsoft.com/en-us/graph/api/resources/service-communications-api-overview), [serviceHealth](https://learn.microsoft.com/en-us/graph/api/resources/servicehealth), [serviceHealthIssue](https://learn.microsoft.com/en-us/graph/api/resources/servicehealthissue), [serviceUpdateMessage](https://learn.microsoft.com/en-us/graph/api/resources/serviceupdatemessage), [incidentReport](https://learn.microsoft.com/en-us/graph/api/servicehealthissue-incidentreport), [Known issues](https://learn.microsoft.com/en-us/graph/known-issues), [Paging](https://learn.microsoft.com/en-us/graph/paging).

</graph-query-contract>

<tool-reference>

## Tools

All seven tools carry `readOnlyHint: true, openWorldHint: true`.

<tool name="m365-list-service-health">
Status of every subscribed Microsoft 365 service (`GET /admin/serviceAnnouncement/healthOverviews`). One row per service (`id`, `service`, `status`). No issue expansion — call `m365-get-service-health` for a single service's issues.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `maxResults` | int ≥ 1 | No | Maximum services to return. Omit for all. |

Returns `{ services, total, truncated }`.
</tool>

<tool name="m365-get-service-health">
Detailed health of one service, with its issues (`GET /admin/serviceAnnouncement/healthOverviews?$expand=issues`, matched locally).

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `service` | string | Yes | Display name ("Exchange Online") or id ("Exchange"), case-insensitive. An unknown name returns the list of available services. |

Returns the matched `serviceHealth` object including `issues[]`.
</tool>

<tool name="m365-list-health-issues">
Service-health issues across all services (`GET /admin/serviceAnnouncement/issues`), filtered and ordered client-side (newest first by `lastModifiedDateTime`).

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `service` | string | No | Case-insensitive substring match on the issue's service name. |
| `classification` | enum | No | `advisory` \| `incident`. Compared case-insensitively. |
| `isResolved` | bool | No | `true` = resolved only; `false` = unresolved only. Omit for both. |
| `maxResults` | int ≥ 1 | No | Maximum issues to return, newest first. Omit for all. |

Returns `{ issues, total, truncated }`. When any filter is set, the full collection is scanned before trimming, so `total`/`truncated` describe the filtered set honestly.
</tool>

<tool name="m365-get-health-issue">
Full detail for one issue (`GET /admin/serviceAnnouncement/issues/{id}`).

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `issueId` | string | Yes | Service-announcement ID, e.g. `EX226792`. Letters and digits only; validated before any Graph call. |

Returns the `serviceHealthIssue`, including `posts[]` (update history) and `impactDescription`.
</tool>

<tool name="m365-get-incident-report">
The post-incident review document (`GET /admin/serviceAnnouncement/issues/{id}/incidentReport`).

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `issueId` | string | Yes | Service-announcement ID. Validated before any Graph call. |

Returns `{ issueId, format, content }` where `format` is `text` (UTF-8 decode) or `base64` (binary body). Only issues with status `postIncidentReviewPublished` have a PIR; any other issue returns a clear error.
</tool>

<tool name="m365-list-messages">
Message Center posts (`GET /admin/serviceAnnouncement/messages`), filtered and ordered client-side (newest first).

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `category` | enum | No | `preventOrFixIssue` \| `planForChange` \| `stayInformed`. Case-insensitive. |
| `severity` | enum | No | `normal` \| `high` \| `critical`. Case-insensitive. |
| `service` | string | No | Case-insensitive substring match against any of the message's `services[]`. |
| `isMajorChange` | bool | No | `true` = major changes only; `false` = non-major only. |
| `maxResults` | int ≥ 1 | No | Maximum messages to return, newest first. Omit for all. |

Returns `{ messages, total, truncated }`. Each message carries `body` (itemBody, `contentType: html`), `services[]`, `tags[]`, `isMajorChange`, and `actionRequiredByDateTime`.
</tool>

<tool name="m365-get-message">
Full detail for one message (`GET /admin/serviceAnnouncement/messages/{id}`).

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `messageId` | string | Yes | Message Center ID, e.g. `MC172851`. Letters and digits only; validated before any Graph call. |

Returns the `serviceUpdateMessage`.
</tool>

</tool-reference>

<known-limitations>

## Known limitations

- **Not verified against a live Microsoft 365 tenant.** Every Graph path and response shape is checked against Microsoft's published v1.0 schemas and unit-tested against stubbed clients — but no call in this package has run against a real tenant. Two facts are flagged UNCONFIRMED by Microsoft's own docs and are the most worth re-confirming against a live tenant: (1) the exact wire casing of the status/classification/category/severity enums (schema says camelCase, examples say PascalCase); (2) which server-side query options, if any, these collections honour. The package's client-side, case-insensitive design is built to be correct either way.
- **Client-side filtering means a truncated result under-reports.** A filter scans the whole fetched collection; `maxResults` trims afterwards. `truncated: true` means the counts are a lower bound — omit `maxResults` for a full picture.
- **`serviceUpdateMessage.viewPoint` is null under application permissions** — read/archive/favourite state is a per-user concept and is not available with client-credentials auth.
- **The PIR content-type is not pinned by Microsoft.** `decodeIncidentReport` returns UTF-8 text when the body decodes cleanly, otherwise base64. A binary document (e.g. a Word file) is returned as base64 with `format: "base64"`.
- **No delegated (user) auth.** This package uses app-only client credentials. Delegated access additionally requires the signed-in user to hold an Entra admin role.

</known-limitations>

<pagination>

## Pagination

`paginate()` follows `@odata.nextLink` from the default page (no `$top`). When `maxResults` is set on an **unfiltered** list it stops one row past the limit and reports `truncated: true`. When a filter is set, the whole collection is fetched first (so the filter cannot miss matches beyond page one), then filtered, then trimmed to `maxResults` with an honest `truncated`. The nextLink is passed to `.api()` verbatim.

</pagination>

<error-handling>

## Error handling

`MessageCenterClient.enhanceError` maps Graph failures by `statusCode`:
- **401** → names the three `MESSAGE_CENTER_*` variables to check.
- **403** → names the required `ServiceHealth.Read.All` and `ServiceMessage.Read.All` application permissions.
- **404** → "Not found while …" (used for a missing issue/message, or a missing PIR — the incident-report error additionally mentions `postIncidentReviewPublished`).
- **429** → "Throttled … retry shortly" (Graph's middleware already honours `Retry-After`).

Missing configuration is caught in `createServiceContext` before any network call, returning a structured `isError` result that names each missing variable. Malformed issue/message IDs are rejected by `assertAnnouncementId` before reaching a URL. Unknown enum values are rejected by Zod (MCP) or `parseEnum` (CLI) before the handler runs.

</error-handling>

<security>

## Security

- **Read-only.** All 7 tools are `readOnlyHint: true`; there are no write operations, no feature flags, and no destructive tools.
- **No injection surface.** The only caller value that reaches a URL is a service-announcement ID, shape-validated to letters and digits. No OData `$filter` is built from caller input, so there is no string literal to escape.
- **Least privilege.** `ServiceHealth.Read.All` + `ServiceMessage.Read.All` are the narrowest permissions for this surface.
- **No secret logging.** The tenant and client IDs are never written to stderr.
- **Content is surfaced verbatim.** A message body or PIR may quote a tenant name or admin email; this tool does not redact Microsoft-sourced content. Do not copy real PIR/message text into public-repo fixtures.

</security>

<testing>

## Testing

```bash
npm run build --workspace=packages/message-center
npm test --workspace=packages/message-center   # 46 tests, no live API
```

Services take an injected client, so tests use plain stub objects — **zero `vi.mock`**. Coverage centres on the ported bug class: the docs-vs-wire casing gap (`matchesIssue`/`matchesMessage` matching camelCase filters against PascalCase wire values), the `isResolved`/`isMajorChange` boolean filters (including a missing flag treated as false), truncation honesty (filter scans all, then trims), client-side ordering, case-insensitive service resolution, PIR text/base64 decoding, and ID validation before any network call.

</testing>

<cli-architecture>

## CLI

Binary: `mcp-message-center-cli`. Command name = tool name minus the `m365-` prefix, grouped by domain (`health`, `message`). Global flags: `--json`, `--no-cache`, `--env-file`, `--mcp-config`, `--mcp-server`. Full JSON is cached to `.context/.mcp-message-center-cache/`.

```bash
mcp-message-center-cli health list-service-health
mcp-message-center-cli health get-service-health "Exchange Online"
mcp-message-center-cli health list-health-issues --classification incident --is-resolved false
mcp-message-center-cli health get-health-issue EX226792
mcp-message-center-cli health get-incident-report EX226792
mcp-message-center-cli message list-messages --category planForChange --is-major-change true
mcp-message-center-cli message get-message MC172851
```

CLI option parsing (`parseEnum`, `parseBoolean`, `parsePositiveInt`) rejects bad arguments before any Graph call, matching the MCP layer's Zod validation.

</cli-architecture>

<troubleshooting>

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Missing Message Center configuration: …` | One or more `MESSAGE_CENTER_*` vars unset | Set all three (tenant, client, secret). |
| `Forbidden … ServiceHealth.Read.All and ServiceMessage.Read.All` | Missing/unconsented Graph permissions | Grant both as **application** permissions with admin consent. |
| `Service not found: 'X'. Available services: …` | Wrong service name | Use one of the names listed, or call `m365-list-service-health`. Matching is case-insensitive. |
| `Not found … incident report … postIncidentReviewPublished` | The issue has no published PIR | Only issues with status `postIncidentReviewPublished` have one. |
| A filter returns fewer rows than expected with `truncated: true` | `maxResults` cut the client-side-filtered list | Omit `maxResults`, or raise it, for a full count. |
| `issueId must be a service-announcement ID` | ID contained non-alphanumeric characters | Pass the bare ID, e.g. `EX226792` — no slashes, spaces, or quotes. |

</troubleshooting>
