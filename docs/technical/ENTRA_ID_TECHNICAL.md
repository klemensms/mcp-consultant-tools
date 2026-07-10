# Microsoft Entra ID - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/ENTRA_ID.md -->

<overview>

The Entra ID integration audits app registrations through the Microsoft Graph v1.0 REST API: which client secrets and certificates are expiring or expired, and what each app registration is permitted to do. Every tool is read-only; the package has no write operations and no feature flags.

**Package:** `@mcp-consultant-tools/entra-id`
**Binaries:** `mcp-entra` (MCP server), `mcp-entra-cli` (CLI)
**Total tools:** 2 (all read-only)
**Prompts:** 2
**Auth:** Entra ID service principal (`ClientSecretCredential`) against `https://graph.microsoft.com`

</overview>

<architecture>

## Architecture

**Client layer:**
- `EntraIdClient` — wraps `Client.initWithMiddleware` from `@microsoft/microsoft-graph-client`, authenticated by `TokenCredentialAuthenticationProvider` over `ClientSecretCredential`. Graph's own middleware chain supplies the retry handler (429/503, honouring `Retry-After`), so this class carries no retry loop. It paginates `@odata.nextLink`, caches resource service principals, and normalises Graph errors into messages that name the missing grant.

Auth mirrors `packages/azure-b2c` (`@azure/identity` + `@microsoft/microsoft-graph-client`). Seven other packages in this repo wire `@azure/msal-node` by hand; azure-b2c is the closer precedent — Graph, client credentials, read-only — and needs no additional dependency.

**Service class** (takes an injected `EntraIdClient`, so pagination and error normalisation apply once):
- `AppRegistrationService` — list and get, plus the pure mappers and predicates below

`ServiceContext` exposes one lazy getter. There is exactly **one** `createServiceContext()` (in `context-factory.ts`), imported by both `index.ts` and `cli.ts`.

**Pure, unit-tested functions** (no Graph client required):
- `classifyCredential(endDateTime, now, thresholdDays)` — the expiry state machine. `now` is injected, never read from the clock inside.
- `toSecretInfo` / `toCertificateInfo` / `toSummary` / `countCredentials`
- `matchesFilter(summary, filter, credentialType)` / `matchesName(summary, nameContains)`
- `collectRedirectUris` / `resolvePermissions`
- `isGuid` / `assertGuid`

**Source layout:**
```
packages/entra-id/src/
  index.ts                        # MCP server entry + registerEntraIdTools()
  cli.ts                          # CLI entry point
  context-factory.ts              # Single shared createServiceContext() for MCP + CLI
  types.ts                        # ServiceContext interface
  entra-client.ts                 # EntraIdClient + statusCodeOf + PaginatedResult
  models/
    entra-types.ts                # Graph response shapes + derived output shapes
  utils/
    credential-status.ts          # classifyCredential (pure, clock-injected)
    guid.ts                       # isGuid / assertGuid
    __tests__/*.test.ts
  services/
    app-registration-service.ts   # AppRegistrationService + pure mappers/predicates
    __tests__/app-registration-service.test.ts
  tools/
    tool-helpers.ts               # runTool() response shape, READ_ONLY annotations
    app-registration-tools.ts     # 2 tools
  prompts/
    templates.ts                  # 2 prompt templates
  cli/
    output.ts                     # .mcp-entra-cache wrapper
    commands/                     # app group
  __tests__/entra-client.test.ts
```

</architecture>

<graph-query-contract>

## Graph query contract

Verified against Microsoft Learn on 2026-07-10. Graph v1.0; there is no api-version parameter.

| Fact | Consequence for this package |
|------|------------------------------|
| `passwordCredentials` and `keyCredentials` appear **nowhere** in the filterable-properties table for `/applications` | No `$filter` on credential expiry is possible. **Every credential filter is client-side.** |
| `$filter` on `/applications` has no `contains` operator | `nameContains` is client-side too. `startsWith` exists, but a prefix match is not what a consultant asking "which app is called *payments*" wants. |
| Graph returns **only** what `$select` names | `LIST_SELECT` and `DETAIL_SELECT` both include `passwordCredentials` and `keyCredentials`. Forgetting them yields applications with no credentials and an audit that reads "nothing is expiring". |
| `$top` maximum is 999; the default page size is 100 | `EntraIdClient.PAGE_SIZE = 999`, to keep a whole-tenant scan to as few round trips as possible. |
| `@odata.nextLink` must be used verbatim; extracting `$skiptoken` or appending `$top` is unsupported | `paginate()` passes the nextLink straight to `.api()` with no `.select()` and no `.top()`. |
| Custom headers (e.g. `ConsistencyLevel`) are **not** carried onto nextLink requests | Irrelevant here: this package sends no `ConsistencyLevel` header, because it uses no `$search`, no `ne`/`not`/`endsWith`, and no `$filter`+`$orderby` combination. |
| `$count=true` and `$search` **silently no-op** (200 OK, missing `@odata.count`) without `ConsistencyLevel: eventual` | Avoided entirely by not using them. This is the trap that returns a plausible-looking wrong answer rather than an error. |
| `appId` is a supported alternate key on both `application` and `servicePrincipal` | `GET /applications(appId='{guid}')` and `GET /servicePrincipals(appId='{guid}')` are used directly, rather than an `$filter=appId eq '...'` scan. |
| `secretText` is returned **only** by the call that creates a secret | A GET can never reveal a secret's value. Only `hint` (first three characters) is available. |
| `key` (raw certificate bytes) is always `null` on a list call, even when `$select`-ed | Not read. `endDateTime` and `keyId` are sufficient for expiry auditing. |

Sources: [application resource](https://learn.microsoft.com/en-us/graph/api/resources/application), [List applications](https://learn.microsoft.com/en-us/graph/api/application-list), [Advanced query capabilities](https://learn.microsoft.com/en-us/graph/aad-advanced-queries#application-properties), [Paging](https://learn.microsoft.com/en-us/graph/paging).

</graph-query-contract>

<tool-reference>

## Tools

Both tools carry `readOnlyHint: true, openWorldHint: true`. Both are tenant-scoped.

<tool name="entra-list-app-registrations">
Audit app registrations for expiring or expired client secrets and certificates.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `filter` | enum | No | `no-credentials` \| `expiring-credentials` \| `expired-credentials`. Omit to return every app registration. |
| `credentialType` | enum | No | `any` (default) \| `secret` \| `certificate`. Narrows which collections `filter` inspects. |
| `expiryDays` | int ≥ 0 | No | Days ahead that count as expiring (default 30). `0` flags only already-expired credentials. Also sets `status` on every credential returned. |
| `nameContains` | string | No | Case-insensitive substring match on `displayName`. Client-side. |
| `maxResults` | int ≥ 1 | No | Maximum app registrations to return. Omit for all. |

Returns `{ applications, total, truncated, expiryDays }`. Each application carries `objectId`, `appId`, `displayName`, `secrets[]`, `certificates[]`, and `credentialCounts` (`secrets`, `certificates`, `expired`, `expiring`, `active`, `unknown`).

`$select`: `id, appId, displayName, passwordCredentials, keyCredentials`. API permissions and redirect URIs are deliberately **not** fetched here — they belong to `entra-get-app-registration`, and resolving them would cost one extra Graph call per distinct resource app on every list.
</tool>

<tool name="entra-get-app-registration">
Full detail for one app registration.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `appIdOrObjectId` | string | Yes | Object ID or application (client) ID. Must be a GUID; a non-GUID is rejected before any Graph call. |
| `expiryDays` | int ≥ 0 | No | Threshold used to set `status` on each credential (default 30). |

Returns the list shape plus `createdDateTime`, `signInAudience`, `redirectUris[]`, `apiPermissions[]`, `exposedScopes[]`.

Lookup order: `GET /applications/{id}` first, then `GET /applications(appId='{id}')` on a 404. **Only a 404 triggers the fallback** — a 403 surfaces as a permission error.

Permission resolution: each distinct `requiredResourceAccess[].resourceAppId` is resolved in parallel via `GET /servicePrincipals(appId='{guid}')`, matching `resourceAccess[].id` against `appRoles[]` (type `Role` → Application) or `oauth2PermissionScopes[]` (type `Scope` → Delegated). A permission that cannot be resolved is returned with `unresolved: true` and its raw GUID as `permissionName`.
</tool>

</tool-reference>

<credential-classification>

## Credential classification

`classifyCredential(endDateTime, now, thresholdDays)` returns exactly one of four statuses. They are mutually exclusive, so a filter needs no "and not already expired" guard.

| Condition | Status | `daysUntilExpiry` |
|-----------|--------|-------------------|
| `endDateTime` absent, empty, or unparseable | `unknown` | `null` |
| `endDateTime - now <= 0` | `expired` | negative or 0 |
| `0 < endDateTime - now <= thresholdDays` | `expiring` | 0…thresholdDays |
| otherwise | `active` | > 0 |

Two invariants worth preserving:

1. **The threshold is compared in milliseconds, never in rounded days.** Rounding first would pull a credential expiring in 30 days + 1 hour into a 30-day window. `daysUntilExpiry` is `Math.floor`-ed for display only; a credential with 23 hours left reports `0` and status `expiring`.
2. **A credential is invalid *at* `endDateTime`.** Exactly-now is `expired`, not `expiring` with zero days left.

`now` is a required parameter. The source this was ported from called `new Date()` inside the per-credential mapper, so a long scan could straddle a day boundary and no boundary could be pinned in a test.

</credential-classification>

<known-limitations>

## Known limitations

**Service-principal credentials are not scanned.** An `application` and its `servicePrincipal` hold two independent `passwordCredentials`/`keyCredentials` collections in Microsoft Graph. This package reads the app registration's. Credentials added directly to a service principal — via `Add-MgServicePrincipalPassword`, or on a managed identity / legacy service principal with no backing app registration — will not appear. **An empty result is therefore not proof that nothing in the tenant is expiring.** Both tool descriptions say so. Covering them would mean a second `/servicePrincipals` scan correlated by `appId`; it is a deliberate scope decision, not an oversight.

**Every filter scans the whole tenant.** Graph cannot filter on credential expiry or on a name substring, so a filtered list fetches all app registrations (999 per page) before trimming to `maxResults`. Truncating the fetch first would hide matches beyond the cut. `truncated: true` means `maxResults` cut the *filtered* list; the scan itself was complete.

**Not verified against a live tenant.** Every Graph path, `$select`, alternate-key form and response shape is checked against Microsoft's published v1.0 schemas and unit-tested against a mocked client. No call in this package has run against a real Entra ID tenant.

**`$select`-ing `keyCredentials` carries a documented throttling limit of 150 requests per minute per tenant.** This package issues one request per page (999 apps), so a tenant would need ~150,000 app registrations to approach it. Relevant only if per-application detail is ever fetched in a loop.

</known-limitations>

<query-safety>

## Query safety

This package builds **no** OData `$filter` and **no** `$search` from caller input. The only caller-supplied value that reaches a Graph URL is an app registration's object ID or appId, and both are GUIDs — so `assertGuid()` is a complete defence and there is no string literal left to escape.

`nameContains` never reaches Graph; it is matched client-side. That is why a payload such as `x') or startswith(displayName,'` is rejected by `entra-get-app-registration` (not a GUID) and simply matches nothing in `entra-list-app-registrations`.

`resolvePermissions` reads `resourceAppId` from Graph rather than from a caller, but that value still lands in a URL, so `getServicePrincipalByAppId()` shape-checks it and returns `null` rather than issuing the request when it is not a GUID.

</query-safety>

<pagination>

## Pagination

`EntraIdClient.paginate(path, select, maxResults?)` returns `{ items, truncated }`.

It requests `$top=999` on the first page, then follows `@odata.nextLink` verbatim. When `maxResults` is set, it stops as soon as it holds one row more than the limit — that extra row is what makes `truncated` honest without a second request. A total that exactly equals `maxResults` reports `truncated: false`, because the row that would have proved truncation never arrived.

`AppRegistrationService.listAppRegistrations` passes `maxResults` down to `paginate` **only when no client-side filter is set**. With a filter, it passes `undefined` (full scan) and trims afterwards.

</pagination>

<error-handling>

## Error handling

`EntraIdClient.enhanceError(error, operation)` maps Graph's `statusCode`:

| Status | Message names |
|--------|---------------|
| 401 | `ENTRA_ID_TENANT_ID`, `ENTRA_ID_CLIENT_ID`, `ENTRA_ID_CLIENT_SECRET` |
| 403 | The missing `Application.Read.All` application permission and the need for admin consent |
| 404 | Not found, with the original message |
| 429 | Throttling by Microsoft Graph |
| other | `Failed while {operation}: {message}` |

Missing configuration is detected in `createServiceContext()` before any request and lists **every** missing variable at once, so a user fixes them in one pass rather than one per run. Tools return it as a structured `isError` response rather than crashing the server.

`getServicePrincipalByAppId` deliberately swallows its errors and returns `null`: a resource whose service principal is absent from the tenant must not fail the whole `get`, it must degrade to unresolved permission GUIDs.

</error-handling>

<security>

## Security

- **Read-only.** No tool mutates anything; there are no write operations and no feature flags.
- **No identifiers logged.** The tenant ID and client ID are never written to stderr — they land in transcripts, logs and CI output. `context-factory.ts` logs only `Entra ID client initialized`.
- **Secrets cannot be exfiltrated.** Graph returns a secret's value only to the call that created it; this package only ever GETs.
- **Least privilege.** `Application.Read.All` is the narrowest application permission that reads `/applications` and `/servicePrincipals`. No `Directory.Read.All` is required.
- **GUID validation before URL construction** — see `<query-safety>`.

</security>

<testing>

## Testing

```bash
npm run build --workspace=packages/entra-id
npm test --workspace=packages/entra-id   # 77 tests, no live API
```

`@azure/identity` and `@microsoft/microsoft-graph-client` are mocked at the module boundary, so the suite runs offline. ESM mocking in this repo requires `vi.mock(...)` followed by a **top-level `await import()`** of the module under test — a static import binds before the mock applies. See `src/__tests__/entra-client.test.ts`.

Service tests inject a stub client object rather than mocking the Graph SDK, so the filter and truncation logic is tested without any transport concern.

</testing>

<cli-architecture>

## CLI Architecture

Binary: `mcp-entra-cli`. Command name = tool name minus the `entra-` prefix, grouped by domain. Parity is 1:1 with the MCP tools.

```bash
mcp-entra-cli app list-app-registrations
mcp-entra-cli app list-app-registrations --filter expired-credentials
mcp-entra-cli app list-app-registrations --filter expiring-credentials --expiry-days 90
mcp-entra-cli app list-app-registrations --filter no-credentials --credential-type secret
mcp-entra-cli app list-app-registrations --name-contains payments --max-results 20
mcp-entra-cli app get-app-registration aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
mcp-entra-cli app get-app-registration aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee --expiry-days 60
```

Global flags (`--json`, `--no-cache`, `--env-file`, `--mcp-config`, `--mcp-server`) come from `createCliProgram` in `@mcp-consultant-tools/core`. Full JSON output is cached to `.context/.mcp-entra-cache/`.

`parseEnum` rejects an unknown `--filter` or `--credential-type` and names the allowed values, rather than passing it through to a client-side filter where it would match nothing and read as "no findings". `--expiry-days 0` is valid (only already-expired); `--max-results 0` is not.

</cli-architecture>

<troubleshooting>

## Troubleshooting

| Symptom | Cause |
|---------|-------|
| `Missing Entra ID configuration: ...` | One or more of the three env vars is unset. All are listed at once. |
| `Forbidden ... needs the Application.Read.All application permission` | The permission is missing, or was added as *delegated* rather than *application*, or admin consent was never granted. |
| Every app reports zero secrets and zero certificates | A `$select` that omits the credential collections. Both `LIST_SELECT` and `DETAIL_SELECT` must name them. |
| `App registration not found: {guid}` | The GUID matched neither an object ID nor an appId in this tenant. |
| `appIdOrObjectId must be a GUID` | A display name was passed. Use `entra-list-app-registrations --name-contains` to find the GUID first. |
| An app you know has an expiring secret is missing from `expiring-credentials` | Check whether the credential sits on the **service principal** rather than the app registration — see `<known-limitations>`. |
| A permission shows a raw GUID with `unresolved: true` | The resource's service principal is absent from the tenant, or unreadable. The grant still exists; only its name is unknown. |

</troubleshooting>
