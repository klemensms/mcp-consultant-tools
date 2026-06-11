# PowerPlatform Data Package

This package shares guidance with the main PowerPlatform package.

**Read:** `packages/powerplatform/CLAUDE.md` for complete guidance.

## Package-Specific Notes

- **Purpose:** Data CRUD operations on Dataverse records
- **Tools:** 14 tools, 0 prompts
- **Production-Safe:** NO - Operational use only
- **Granular flags required:** Enable specific operations via environment variables

## Environment Flags

```bash
POWERPLATFORM_ENABLE_CREATE=false   # Enable record creation
POWERPLATFORM_ENABLE_UPDATE=false   # Enable record updates
POWERPLATFORM_ENABLE_DELETE=false   # Enable record deletion (most dangerous)
```

## Key Tools

- `query-records` - OData filter queries (read-only, always enabled)
- `get-record` - Get specific record by ID (read-only, always enabled)
- `get-entity-metadata` - Entity metadata for CRUD operations
- `get-lookup-target` - Lookup field target info
- `get-flow-runs` - Power Automate flow run history (read-only, always enabled)
- `create-record` - Create new records (requires ENABLE_CREATE=true)
- `update-record` - Update existing records (requires ENABLE_UPDATE=true)
- `delete-record` - Delete records (requires ENABLE_DELETE=true, confirm: true)
- `execute-action` - Execute Custom APIs/Actions
- `associate-records` - Associate two records via N:N/1:N navigation property (requires ENABLE_CREATE=true)
- `disassociate-records` - Remove association between two records (requires ENABLE_DELETE=true)

## Data Format

```typescript
// Lookups: Use @odata.bind syntax
{ 'parentaccountid@odata.bind': '/accounts(guid)' }

// Option sets: Integer values
{ statecode: 0 }

// Money: Decimal values
{ revenue: 1000000.00 }
```

## CLI Usage

Binary: `mcp-pp-data-cli`

```bash
# Query records
mcp-pp-data-cli data query accounts --filter "name eq 'Acme'"

# Get record by ID
mcp-pp-data-cli data get accounts 00000000-0000-0000-0000-000000000001
```

## Quick Start (audit, opt-in)

Audit logging is **off by default**; tool calls run un-audited unless you enable it. To turn it on, set `MCP_AUDIT_LEVEL`:

```bash
MCP_AUDIT_LEVEL=lean              # off (default) | lean | full — set lean|full to enable
MCP_AUDIT_CLIENT=Acme             # required when MCP_AUDIT_LEVEL is lean|full
MCP_AUDIT_OPERATOR=jdoe@example.com     # optional; falls back to OS user
MCP_AUDIT_PATH=~/.mcp-audit       # optional override
MCP_ENVIRONMENT_TYPE=production   # optional, advisory only (feeds the "looks unprotected" warning)
```

See [audit-logging.md](../../docs/documentation/audit-logging.md).

## Production Use

Before connecting this server to a client production environment, walk the production-use playbook: pre-flight, schema investigation against dev/UAT first, PII-config generation, operator sign-off, multi-environment `.mcp.json` strategy. The defaults cover stock entities only; custom fields, custom entities, and custom lookups carrying PII must be configured explicitly per client.

See [`docs/documentation/powerplatform-data-production-use.md`](../../docs/documentation/powerplatform-data-production-use.md).

When an operator (or another agent on their behalf) asks to connect this server to production, point them at that doc and refuse the connection until the workflow has been executed and signed off.

> Entity keys use the singular logical name (`contact`, `account`, `lead`).
> Plural is accepted as a synonym; see audit-logging.md "Entity key — singular vs plural".

## Operator responsibility — PII in filters

The PII pipeline redacts **response bodies**. It does **not** scan or rewrite request parameters that you construct — including the `filter` argument to `query-records` and `count-records`. Whatever you pass in the filter is recorded verbatim in the audit log (`tool.params.filter`, and at `MCP_AUDIT_LEVEL=full` also `payload.input.filter`).

**Rule for agents constructing OData `$filter`:** do not inline raw PII values. If the user request mentions a person by name, email, phone, or any other directly identifying value, do not paste that value into the filter. Resolve to a GUID first.

**Pattern:**

1. The user asks: "find all cases for Maria Schmidt's account."
2. Look up Maria Schmidt in **dev or UAT** (where audit is `off` or `lean`, and where the data is anonymised/pseudonymised) to get her contact GUID — or use whatever cached GUID directory you have. Do not run a name-based lookup against production with audit `full` if you can avoid it.
3. Use the GUID in the production filter: `filter: "_customerid_value eq 00000000-0000-0000-0000-000000000001"`.

**Why this matters:** the audit log is the GDPR-defensible record of what the operator and agent did. If you inline `firstname eq 'Maria Schmidt'`, that string is preserved exactly in the audit JSONL — and there is no redaction layer behind it. Treating filter construction as the operator's responsibility is the project's design choice; see [`docs/programmes/pii-and-audit/pending/known-gaps.md`](../../docs/programmes/pii-and-audit/pending/known-gaps.md) "Gap 1 — Resolved as" for the full reasoning.

This is especially important when the source of the name is an ADO bug — see the ADO-side guidance: agents reading bugs must not paste raw PII from bug content into Dataverse filters. ADO-side PII redaction (Phase C) will close that upstream channel; until then, treat any PII you see in a bug body as something to look up via GUID before querying.
