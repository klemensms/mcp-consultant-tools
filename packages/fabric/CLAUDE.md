# Fabric Package Guide

## Overview

Microsoft Fabric integration for workspaces, capacities, items, OneLake shortcuts, domains, and tenant-wide admin inventory.

- **Tools:** 27 tools, 2 prompts
- **Authentication:** Azure AD (Entra) service principal — client credentials flow
- **Token scope:** `https://api.fabric.microsoft.com/.default` (covers core + admin APIs)

## Environment Configuration

```bash
# Azure AD service principal (required)
FABRIC_TENANT_ID=your-azure-tenant-id
FABRIC_CLIENT_ID=your-app-client-id
FABRIC_CLIENT_SECRET=your-client-secret

# Write protection (default: all disabled)
FABRIC_ENABLE_WRITE=false    # create/update + assign operations
FABRIC_ENABLE_DELETE=false   # delete workspaces, items, shortcuts
```

> **Env var naming:** this package uses the `FABRIC_*` prefix to match the
> sibling-package convention (`SHAREPOINT_*`, `AZUREDEVOPS_*`, `TEAMS_*`) rather
> than the cross-repo contract's `MCP_{PACKAGE}_*` form. Sibling consistency
> wins per the build spec.

## Base URLs

- Core / items API: `https://api.fabric.microsoft.com/v1`
- Admin API: `https://api.fabric.microsoft.com/v1/admin`

The `FabricClient` routes a request to the admin base URL when `{ admin: true }`
is passed. `domain` and `admin` tools always use the admin API.

## Tool Categories

### Workspaces (8 tools)
- `fabric-list-workspaces`, `fabric-get-workspace`
- `fabric-create-workspace`, `fabric-update-workspace` *(write)*
- `fabric-delete-workspace` *(delete)*
- `fabric-list-workspace-role-assignments`
- `fabric-add-workspace-role-assignment`, `fabric-remove-workspace-role-assignment` *(write)*

### Capacities (4 tools)
- `fabric-list-capacities`, `fabric-get-capacity`
- `fabric-assign-workspace-to-capacity`, `fabric-unassign-workspace-from-capacity` *(write)*

### Items (8 tools)
- `fabric-list-items`, `fabric-get-item`
- `fabric-create-item`, `fabric-update-item` *(write)*
- `fabric-delete-item` *(delete)*
- `fabric-create-lakehouse`, `fabric-create-warehouse`, `fabric-create-notebook` *(write)*

### Shortcuts (3 tools)
- `fabric-list-shortcuts`
- `fabric-create-shortcut` *(write)*
- `fabric-delete-shortcut` *(delete)*

### Domains (4 tools — admin API)
- `fabric-list-domains`, `fabric-get-domain`
- `fabric-assign-domain-workspaces`, `fabric-unassign-domain-workspaces` *(write)*

### Admin (3 tools — admin API, read-only)
- `fabric-admin-list-workspaces`, `fabric-admin-list-items`, `fabric-admin-get-tenant-settings`

## Write Protection

Mutations are **disabled by default** and gated by two feature flags:

- **FABRIC_ENABLE_WRITE=true** — create/update workspaces, items, shortcuts; assign capacities, domains, and workspace roles
- **FABRIC_ENABLE_DELETE=true** — delete workspaces, items, and shortcuts (separate flag for extra safety)

Gating is enforced in `FabricClient.checkWriteEnabled()` / `checkDeleteEnabled()`,
called by the services before any mutating request.

## Key Implementation Details

### get-capacity has no dedicated route

The Fabric REST API has no per-capacity GET endpoint. `CapacityService.getCapacity`
filters the `/capacities` list client-side.

### Admin API response envelopes

Admin endpoints use inconsistent envelopes: `/admin/domains` returns `{ domains }`,
`/admin/items` returns `{ itemEntities }` (with `value` as a fallback). These are
handled explicitly in `DomainService` / `AdminService` rather than through the
generic `FabricClient.listAll` (`value` + `continuationToken`).

### Long-running operations

Create operations may return HTTP 202 with a `Location` header. `FabricClient.request`
surfaces these as `{ accepted: true, status: 202, location, retryAfter }` rather
than throwing.

## File Structure

```
src/
  index.ts                  # MCP server entry + registerFabricTools()
  cli.ts                    # CLI entry point
  context-factory.ts        # Shared ServiceContext factory
  types.ts                  # ServiceContext interface
  fabric-auth-provider.ts   # Entra service-principal token acquisition
  fabric-client.ts          # axios HTTP client (core + admin base URLs)
  tool-examples.ts          # descWithExamples helpers
  services/                 # Business logic (one service per domain)
  tools/                    # Thin MCP tool wrappers (one file per domain)
  cli/
    output.ts               # CLI output wrapper (.mcp-fabric-cache)
    commands/               # Thin Commander wrappers (one file per domain)
  prompts/                  # MCP prompts
```

## CLI Usage

Binary: `mcp-fabric-cli`. Commands are domain-grouped and mirror the MCP tools 1:1.

```bash
mcp-fabric-cli --mcp-server fabric workspace list
mcp-fabric-cli item list <workspaceId> --type Lakehouse
mcp-fabric-cli admin get-tenant-settings
mcp-fabric-cli --json domain list
```
