# Microsoft Fabric - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/FABRIC.md -->

<overview>

The Microsoft Fabric integration provides access to the Fabric REST API — workspaces, capacities, items, OneLake shortcuts, governance domains, and tenant-wide admin inventory. Authentication uses the Azure AD (Entra) service-principal client-credentials flow via `@azure/identity`.

**Package:** `@mcp-consultant-tools/fabric`
**Binaries:** `mcp-fabric` (MCP server), `mcp-fabric-cli` (CLI)
**Tools:** 27 total — workspaces 8, capacities 4, items 8, shortcuts 3, domains 4, admin 3
**Prompts:** 2 — `fabric-workspace-overview`, `fabric-tenant-inventory`

</overview>

<architecture>

## Package Structure

```
packages/fabric/src/
  index.ts                    # MCP server entry point + registerFabricTools()
  cli.ts                      # CLI entry point (Commander.js)
  context-factory.ts          # Shared createServiceContext() for MCP + CLI
  types.ts                    # ServiceContext interface
  fabric-auth-provider.ts     # Entra service-principal token acquisition
  fabric-client.ts            # axios HTTP client (core + admin base URLs)
  tool-examples.ts            # descWithExamples() + domain-specific example arrays
  services/
    index.ts                  # Barrel export
    workspace-service.ts      # WorkspaceService
    capacity-service.ts       # CapacityService
    item-service.ts           # ItemService
    shortcut-service.ts       # ShortcutService
    domain-service.ts         # DomainService (admin API)
    admin-service.ts          # AdminService (admin API)
  tools/
    index.ts                  # registerAllTools() aggregator
    workspace-tools.ts        # 8 workspace tools
    capacity-tools.ts         # 4 capacity tools
    item-tools.ts             # 8 item tools
    shortcut-tools.ts         # 3 shortcut tools
    domain-tools.ts           # 4 domain tools
    admin-tools.ts            # 3 admin tools
  prompts/
    index.ts                  # registerAllPrompts() aggregator
    templates.ts              # fabric-workspace-overview, fabric-tenant-inventory
  cli/
    output.ts                 # Cache dir: .mcp-fabric-cache
    commands/
      index.ts                # registerAllCommands() aggregator
      workspace-commands.ts   # workspace command group
      capacity-commands.ts    # capacity command group
      item-commands.ts        # item command group
      shortcut-commands.ts    # shortcut command group
      domain-commands.ts      # domain command group
      admin-commands.ts       # admin command group
```

## Layering

Standard Service-Tool-Prompt pattern. `services/` holds business logic, `tools/` are thin MCP wrappers, `cli/commands/` are thin Commander wrappers. Both the MCP server (`index.ts`) and CLI (`cli.ts`) build the same `ServiceContext` via `context-factory.ts`.

## ServiceContext

`types.ts` defines a six-service context:

```typescript
export interface ServiceContext {
  readonly client: FabricClient;
  readonly workspaces: WorkspaceService;
  readonly capacities: CapacityService;
  readonly items: ItemService;
  readonly shortcuts: ShortcutService;
  readonly domains: DomainService;
  readonly admin: AdminService;
}
```

All getters are lazy — the `FabricClient` (and therefore environment-variable validation) is constructed on the first service access.

## Environment Variable Validation

Validation occurs in `resolveAuthConfig()` (called by `createServiceContext()` when the client is first accessed):

- `FABRIC_TENANT_ID` — required; throws listing all missing variables if absent
- `FABRIC_CLIENT_ID` — required
- `FABRIC_CLIENT_SECRET` — required
- `FABRIC_ENABLE_WRITE` — optional; `"true"` enables create/update + assign operations (default `false`)
- `FABRIC_ENABLE_DELETE` — optional; `"true"` enables delete operations (default `false`)

</architecture>

<authentication>

## Authentication

Single mode: **Azure AD service principal** (client credentials). `FabricAuthProvider` wraps `ClientSecretCredential` from `@azure/identity` and acquires a token for the scope `https://api.fabric.microsoft.com/.default`. This scope covers both the core API and the admin API.

**Token caching:** the token is cached in-memory and reused until 5 minutes before expiry (`TOKEN_REFRESH_BUFFER_MS`), then transparently re-acquired.

**Required Azure AD App Registration:**
1. Register an application in [Microsoft Entra ID](https://entra.microsoft.com) → App registrations → New registration.
2. Create a client secret under **Certificates & secrets**.
3. In the **Fabric admin portal**, enable **"Service principals can use Fabric APIs"** (optionally scoped to a security group the SP belongs to).
4. Grant the service principal the workspace roles / capacity permissions needed for the resources it should manage.
5. For `domain` and `admin` tools, the SP additionally needs Fabric admin rights and the relevant admin tenant-setting opt-in.

## Base URLs

| API | Base URL | Used by |
|-----|----------|---------|
| Core / items | `https://api.fabric.microsoft.com/v1` | workspaces, capacities, items, shortcuts |
| Admin | `https://api.fabric.microsoft.com/v1/admin` | domains, admin |

`FabricClient` routes a request to the admin base URL when `{ admin: true }` is passed in the request options.

</authentication>

<tool-reference>

## Tool Reference

Every tool returns `isError: true` in the MCP response on failure. Write tools throw before any HTTP call when the relevant feature flag is unset.

<tool-group name="workspaces">

### Workspace Tools

**File:** `packages/fabric/src/tools/workspace-tools.ts`

| Tool | Type | Fabric endpoint | Parameters |
|------|------|-----------------|------------|
| `fabric-list-workspaces` | read | `GET /workspaces` | none |
| `fabric-get-workspace` | read | `GET /workspaces/{id}` | `workspaceId` |
| `fabric-create-workspace` | write | `POST /workspaces` | `displayName`, `description?`, `capacityId?` |
| `fabric-update-workspace` | write | `PATCH /workspaces/{id}` | `workspaceId`, `displayName?`, `description?` |
| `fabric-delete-workspace` | delete | `DELETE /workspaces/{id}` | `workspaceId` |
| `fabric-list-workspace-role-assignments` | read | `GET /workspaces/{id}/roleAssignments` | `workspaceId` |
| `fabric-add-workspace-role-assignment` | write | `POST /workspaces/{id}/roleAssignments` | `workspaceId`, `principalId`, `principalType`, `role` |
| `fabric-remove-workspace-role-assignment` | write | `DELETE /workspaces/{id}/roleAssignments/{principalId}` | `workspaceId`, `principalId` |

`principalType` ∈ `User | Group | ServicePrincipal | ServicePrincipalProfile`. `role` ∈ `Admin | Member | Contributor | Viewer`. List tools auto-follow `continuationToken` pagination and return `{ count, workspaces }` / `{ count, roleAssignments }`.

</tool-group>

<tool-group name="capacities">

### Capacity Tools

**File:** `packages/fabric/src/tools/capacity-tools.ts`

| Tool | Type | Fabric endpoint | Parameters |
|------|------|-----------------|------------|
| `fabric-list-capacities` | read | `GET /capacities` | none |
| `fabric-get-capacity` | read | `GET /capacities` (filtered client-side) | `capacityId` |
| `fabric-assign-workspace-to-capacity` | write | `POST /workspaces/{id}/assignToCapacity` | `workspaceId`, `capacityId` |
| `fabric-unassign-workspace-from-capacity` | write | `POST /workspaces/{id}/unassignFromCapacity` | `workspaceId` |

The Fabric REST API has no per-capacity GET route — `fabric-get-capacity` retrieves the full list and filters by `id`, throwing `Capacity not found` if absent.

</tool-group>

<tool-group name="items">

### Item Tools

**File:** `packages/fabric/src/tools/item-tools.ts`

Items are the generic container for lakehouses, warehouses, notebooks, data pipelines, semantic models, reports, etc.

| Tool | Type | Fabric endpoint | Parameters |
|------|------|-----------------|------------|
| `fabric-list-items` | read | `GET /workspaces/{id}/items` (optional `?type=`) | `workspaceId`, `type?` |
| `fabric-get-item` | read | `GET /workspaces/{id}/items/{itemId}` | `workspaceId`, `itemId` |
| `fabric-create-item` | write | `POST /workspaces/{id}/items` | `workspaceId`, `displayName`, `type`, `description?`, `definition?` |
| `fabric-update-item` | write | `PATCH /workspaces/{id}/items/{itemId}` | `workspaceId`, `itemId`, `displayName?`, `description?` |
| `fabric-delete-item` | delete | `DELETE /workspaces/{id}/items/{itemId}` | `workspaceId`, `itemId` |
| `fabric-create-lakehouse` | write | `POST /workspaces/{id}/lakehouses` | `workspaceId`, `displayName`, `description?` |
| `fabric-create-warehouse` | write | `POST /workspaces/{id}/warehouses` | `workspaceId`, `displayName`, `description?` |
| `fabric-create-notebook` | write | `POST /workspaces/{id}/notebooks` | `workspaceId`, `displayName`, `description?` |

`fabric-create-item` covers any item type via the generic endpoint; the three `create-*` tools use the item-type-specific endpoints where the Fabric API differentiates them.

</tool-group>

<tool-group name="shortcuts">

### Shortcut Tools

**File:** `packages/fabric/src/tools/shortcut-tools.ts`

OneLake shortcuts are zero-copy virtual references into ADLS Gen2, Amazon S3, Dataverse, or other OneLake locations. They live under a data item (typically a lakehouse).

| Tool | Type | Fabric endpoint | Parameters |
|------|------|-----------------|------------|
| `fabric-list-shortcuts` | read | `GET /workspaces/{id}/items/{itemId}/shortcuts` | `workspaceId`, `itemId` |
| `fabric-create-shortcut` | write | `POST /workspaces/{id}/items/{itemId}/shortcuts` | `workspaceId`, `itemId`, `path`, `name`, `target` |
| `fabric-delete-shortcut` | delete | `DELETE /workspaces/{id}/items/{itemId}/shortcuts/{path}/{name}` | `workspaceId`, `itemId`, `shortcutPath`, `shortcutName` |

`target` is the connector-specific target object, e.g. `{ "adlsGen2": { "location": "...", "subpath": "...", "connectionId": "..." } }` or `{ "oneLake": { "workspaceId": "...", "itemId": "...", "path": "..." } }`. The delete tool URL-encodes each path segment of `shortcutPath`.

</tool-group>

<tool-group name="domains">

### Domain Tools (admin API)

**File:** `packages/fabric/src/tools/domain-tools.ts`

Domains are the governance grouping for workspaces. These routes use the Fabric admin API and require Fabric admin rights.

| Tool | Type | Fabric endpoint | Parameters |
|------|------|-----------------|------------|
| `fabric-list-domains` | read | `GET /admin/domains` | none |
| `fabric-get-domain` | read | `GET /admin/domains/{domainId}` | `domainId` |
| `fabric-assign-domain-workspaces` | write | `POST /admin/domains/{domainId}/assignWorkspaces` | `domainId`, `workspaceIds[]` |
| `fabric-unassign-domain-workspaces` | write | `POST /admin/domains/{domainId}/unassignWorkspaces` | `domainId`, `workspaceIds[]` |

`GET /admin/domains` returns a `{ domains: [...] }` envelope (not `value`), handled explicitly in `DomainService`.

</tool-group>

<tool-group name="admin">

### Admin Tools (admin API, read-only)

**File:** `packages/fabric/src/tools/admin-tools.ts`

| Tool | Type | Fabric endpoint | Parameters |
|------|------|-----------------|------------|
| `fabric-admin-list-workspaces` | read | `GET /admin/workspaces` | none |
| `fabric-admin-list-items` | read | `GET /admin/items` | `type?`, `workspaceId?` |
| `fabric-admin-get-tenant-settings` | read | `GET /admin/tenantsettings` | none |

`GET /admin/items` returns an `{ itemEntities: [...] }` envelope (with `value` as a fallback); `AdminService.listItems` paginates explicitly across either key.

</tool-group>

</tool-reference>

<error-handling>

## Error Handling

`FabricClient.request()` maps HTTP failures to friendly error messages; tools catch and return them as `isError: true` MCP responses.

<error-table name="http">

### HTTP Errors

| HTTP Status | Mapped message | Resolution |
|-------------|----------------|------------|
| 401 | Microsoft Fabric authentication failed (401)... | Check service principal credentials and Fabric API access |
| 403 | Microsoft Fabric access denied (403)... | Check workspace role / capacity permission; for admin/domain tools, check Fabric admin rights + tenant-setting opt-in |
| 404 | Microsoft Fabric resource not found: {endpoint} | Verify the workspace/item/capacity/domain ID exists |
| 429 | Microsoft Fabric request was throttled (429)... | Retry after a short delay |
| other | Microsoft Fabric API request failed ({status}): {apiError} | Inspect the API error detail |

</error-table>

<error-table name="config-and-flags">

### Configuration & Feature-Flag Errors

| Error message | Cause | Resolution |
|---------------|-------|------------|
| `Missing Microsoft Fabric authentication. Required variables: ...` | One or more `FABRIC_*` credential vars unset | Set `FABRIC_TENANT_ID`, `FABRIC_CLIENT_ID`, `FABRIC_CLIENT_SECRET` |
| `Failed to acquire Microsoft Fabric access token via Entra ID` | Credentials rejected by Entra | Verify tenant/client/secret and that the SP is enabled for Fabric APIs |
| `Write operations are disabled. Set FABRIC_ENABLE_WRITE=true...` | A write tool called with the flag unset | Set `FABRIC_ENABLE_WRITE=true` |
| `Delete operations are disabled. Set FABRIC_ENABLE_DELETE=true...` | A delete tool called with the flag unset | Set `FABRIC_ENABLE_DELETE=true` |
| `Capacity not found: {id}` | `fabric-get-capacity` ID not in the list endpoint | Use `fabric-list-capacities` to find valid IDs |

</error-table>

</error-handling>

<implementation-details>

<detail name="http-client">

### FabricClient

`fabric-client.ts` is an axios wrapper constructed with the auth config plus `{ enableWrite, enableDelete }`. Responsibilities:

- **`request<T>()`** — acquires the auth header, builds the URL (core or admin base + optional query string), issues the request. HTTP 202 is surfaced as `{ accepted: true, status: 202, location, retryAfter }`; HTTP 204 / empty body returns `null`.
- **`listAll<T>()`** — GETs a collection endpoint and follows `continuationToken` pagination, concatenating each page's `value` array.
- **`checkWriteEnabled()` / `checkDeleteEnabled()`** — throw the feature-flag errors above; called by services before any mutating request.
- Convenience methods: `get`, `post`, `patch`, `del`.

</detail>

<detail name="pagination-envelopes">

### Response Envelopes

The core API uses a consistent `{ value: [...], continuationToken }` envelope, handled generically by `FabricClient.listAll()`. The admin API is inconsistent: `/admin/domains` returns `{ domains }`, `/admin/items` returns `{ itemEntities }` (or `value`). `DomainService` and `AdminService` handle these envelopes explicitly rather than via `listAll()`.

</detail>

<detail name="long-running-operations">

### Long-Running Operations

Some Fabric create operations are asynchronous and return HTTP 202 with a `Location` header (operation status URL) and optionally `Retry-After`. `FabricClient.request()` returns these as an `AcceptedResult` (`{ accepted: true, status: 202, location, retryAfter }`) instead of throwing — the caller/agent can poll the `location` if needed.

</detail>

<detail name="dependencies">

### Dependencies

| Package | Purpose |
|---------|---------|
| `@azure/identity` | `ClientSecretCredential` — Entra service-principal token acquisition |
| `axios` | HTTP client for the Fabric REST API |
| `zod` | Input validation for tool parameters |
| `commander` | CLI framework |
| `@mcp-consultant-tools/core` | `createMcpServer`, `createCliProgram`, `outputResult`, `descWithExamples`, etc. |

</detail>

</implementation-details>

<cli-architecture>

## CLI Architecture

The CLI reuses the services via the same `ServiceContext` pattern as the MCP server. Commands are grouped by domain; every MCP tool has a 1:1 CLI command.

### Command Groups

| Group | Commands | Corresponding MCP tools |
|-------|----------|-------------------------|
| `workspace` | `list`, `get`, `create`, `update`, `delete`, `list-roles`, `add-role`, `remove-role` | the 8 `fabric-*-workspace*` tools |
| `capacity` | `list`, `get`, `assign`, `unassign` | the 4 `fabric-*-capacit*` tools |
| `item` | `list`, `get`, `create`, `update`, `delete`, `create-lakehouse`, `create-warehouse`, `create-notebook` | the 8 `fabric-*-item` / `fabric-create-*` tools |
| `shortcut` | `list`, `create`, `delete` | the 3 `fabric-*-shortcut` tools |
| `domain` | `list`, `get`, `assign-workspaces`, `unassign-workspaces` | the 4 `fabric-*-domain*` tools |
| `admin` | `list-workspaces`, `list-items`, `get-tenant-settings` | the 3 `fabric-admin-*` tools |

### Parameter Mapping

- Required identifiers (`workspaceId`, `itemId`, `capacityId`, `domainId`, `principalId`) are positional `<args>`.
- Optional fields (`description`, `displayName` on update, `type` filter) are `--flags`.
- `shortcut create --target` accepts the connector-specific target object as a JSON string.
- `domain assign-workspaces` / `unassign-workspaces` take a variadic `<workspaceIds...>` list.

### CLI Usage Examples

```bash
# Inherit credentials from an MCP config entry (recommended)
npx --package=@mcp-consultant-tools/fabric@beta mcp-fabric-cli --mcp-server fabric workspace list

# Workspaces
mcp-fabric-cli workspace list
mcp-fabric-cli workspace get cfafbeb1-8037-4d0c-896e-a46fb27ff229
mcp-fabric-cli workspace add-role <workspaceId> \
  --principal-id <guid> --principal-type ServicePrincipal --role Member

# Capacities
mcp-fabric-cli capacity list
mcp-fabric-cli capacity assign <workspaceId> <capacityId>

# Items
mcp-fabric-cli item list <workspaceId> --type Lakehouse
mcp-fabric-cli item create-lakehouse <workspaceId> "My Lakehouse" -d "Bronze layer"

# Shortcuts
mcp-fabric-cli shortcut list <workspaceId> <itemId>
mcp-fabric-cli shortcut create <workspaceId> <itemId> \
  --path Tables --name salesdata \
  --target '{"oneLake":{"workspaceId":"...","itemId":"...","path":"Tables/sales"}}'

# Domains (admin API)
mcp-fabric-cli domain list
mcp-fabric-cli domain assign-workspaces <domainId> <wsId1> <wsId2>

# Admin (admin API, read-only)
mcp-fabric-cli admin list-workspaces
mcp-fabric-cli admin list-items --type Notebook
mcp-fabric-cli admin get-tenant-settings

# Raw JSON output
mcp-fabric-cli --json workspace list
```

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of summary |
| `--no-cache` | Skip writing JSON to the cache directory |
| `--env-file <path>` | Load environment from a custom `.env` file |
| `--mcp-config <path>` | Load environment from an MCP config file (defaults to `./.mcp.json`) |
| `--mcp-server <name>` | Server name in the MCP config to read the `env` block from |

Running with `--mcp-config` but no `--mcp-server` errors and lists the available server names. Output: human-readable summary to stdout + full JSON cached to `.context/.mcp-fabric-cache/`.

</cli-architecture>

<security>

## Security Considerations

- Never commit `FABRIC_CLIENT_SECRET` to version control — use environment variables or 1Password `op://` references.
- Write and delete operations are disabled by default; enable per-environment with `FABRIC_ENABLE_WRITE` / `FABRIC_ENABLE_DELETE` and grant the service principal only the workspace roles it needs (least privilege).
- The `domain` and `admin` tools require Fabric admin rights — scope the service principal's admin access deliberately.
- Tokens are held in-memory only (no disk persistence) and refreshed 5 minutes before expiry.
- Rotate client secrets regularly (Azure recommends 90-day rotation).

</security>
