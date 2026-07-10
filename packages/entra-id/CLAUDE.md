# Entra ID Package Guide

## Overview

MCP server for Microsoft Entra ID app-registration audit: client secret and certificate expiry, API permissions, redirect URIs, exposed scopes.

**Tools:** 2 (all read-only) | **Prompts:** 2 | **Auth:** Entra ID service principal → Microsoft Graph

There are no write operations and no feature flags. Nothing in this package mutates the directory.

## Environment Configuration

```bash
# Required - all three.
ENTRA_ID_TENANT_ID=your-tenant-id
ENTRA_ID_CLIENT_ID=your-client-id
ENTRA_ID_CLIENT_SECRET=your-client-secret
```

**Deliberately NOT the shared `AZURE_*` block** used by `azure-management` and `azure-defender`. Those need subscription RBAC (`Reader` / `Security Reader`); this needs a Microsoft Graph *directory* permission, so it is usually a different app registration. There is no subscription ID.

## Required Graph Permissions

| Permission | Type | Purpose |
|------------|------|---------|
| `Application.Read.All` | Application | Both tools, plus the `servicePrincipals` read that names API permissions |

Least privilege — there is nothing narrower. Must be an **application** permission with admin consent (client credentials, no signed-in user).

## Tools

- `entra-list-app-registrations` — audit credentials across the tenant; filters `no-credentials` / `expiring-credentials` / `expired-credentials`, narrowed by `credentialType`, thresholded by `expiryDays`, name-matched by `nameContains`
- `entra-get-app-registration` — one app in full: secrets, certificates, redirect URIs, API permissions, exposed scopes

## Things that will bite you

**A certificate is a credential.** The ported source filtered on secrets only, so an app whose sole credential was a certificate expiring tomorrow matched `no-secrets` and never matched `expiring-secrets` — a false all-clear. Here, `filter` covers both collections unless `credentialType` narrows it. If you touch `matchesFilter`, keep `credentialsFor()` in front of it.

**An empty result is not a clean bill of health.** An `application` and its `servicePrincipal` hold **separate** credential collections in Graph. This package reads the app registration's only. Credentials added straight to a service principal (`Add-MgServicePrincipalPassword`, managed identities) are invisible here. Both tool descriptions say so; keep it that way.

**Graph cannot filter on credential expiry.** `passwordCredentials` / `keyCredentials` appear nowhere in the filterable-properties table for `/applications`. Every filter is client-side and scans the whole tenant. Do not "optimise" it into a `$filter` — you will get a 400, or worse, a 200 with the wrong rows.

**Graph returns only what `$select` names.** `LIST_SELECT` and `DETAIL_SELECT` both include `passwordCredentials` and `keyCredentials`. Drop them and every app looks credential-free and the audit reads "nothing is expiring".

**`$count=true` and `$search` silently no-op without `ConsistencyLevel: eventual`** — 200 OK, no error, missing count. This package avoids both entirely, which is why it sends no custom headers and does not have to re-attach them on `@odata.nextLink` requests (Graph does not carry them over).

**`@odata.nextLink` is used verbatim.** No `.select()`, no `.top()`, no `$skiptoken` extraction. Mutating it is explicitly unsupported.

**`classifyCredential` takes `now` as a parameter.** Never call `Date.now()` inside it. A credential is expired *at* `endDateTime` (`<= 0` remaining), and the threshold is compared in milliseconds, not in rounded days.

**Only a 404 justifies the appId fallback in `getAppRegistration`.** The ported source caught every error from the object-id lookup, so a 403 from a missing `Application.Read.All` grant was reported as "app not found".

**Graph never returns a secret's value** — only a three-character `hint`. `keyCredential.key` is always `null` on a list call. Neither is read.

## Architecture Notes

- Auth mirrors `packages/azure-b2c`: `@azure/identity` + `@microsoft/microsoft-graph-client`, not `@azure/msal-node` (which seven other packages use by hand). No new dependency.
- `Client.initWithMiddleware` supplies Graph's retry handler, so `EntraIdClient` has no retry loop of its own.
- Services compose over `EntraIdClient`, so pagination and error normalisation apply once.
- There is exactly **one** `createServiceContext()`, in `context-factory.ts`, imported by both `index.ts` and `cli.ts`. Do not replicate `azure-sql`'s duplicate private copy.
- No OData `$filter` or `$search` is built from caller input. The only caller value reaching a URL is a GUID, validated by `assertGuid()`. That is why there is no string-escaper here (unlike `azure-defender`'s `kql.ts`).
- The tenant and client IDs are never logged.

## Testing

```bash
npm run build --workspace=packages/entra-id
npm test --workspace=packages/entra-id   # 77 tests, no live API
```

`@azure/identity` and `@microsoft/microsoft-graph-client` are mocked at the module boundary (`vi.mock` + top-level `await import()`), so the suite runs offline. Service tests inject a stub client object instead.

**Not verified against a live Entra ID tenant.** The Graph contract is checked against Microsoft's published v1.0 schemas and mocked responses only.

## Reference

See `docs/technical/ENTRA_ID_TECHNICAL.md` for the full reference.

## CLI Usage

Binary: `mcp-entra-cli`. Command name = tool name minus the `entra-` prefix, grouped by domain.

```bash
mcp-entra-cli app list-app-registrations --filter expired-credentials
mcp-entra-cli app list-app-registrations --filter expiring-credentials --expiry-days 90
mcp-entra-cli app list-app-registrations --filter no-credentials --credential-type secret
mcp-entra-cli app list-app-registrations --name-contains payments --max-results 20

mcp-entra-cli app get-app-registration aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
```
