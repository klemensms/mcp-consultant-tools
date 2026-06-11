# PowerPlatform (Read-Only)

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/POWERPLATFORM_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/powerplatform`

Production-safe MCP server providing read-only access to Dynamics 365 / Dataverse metadata, plugins, flows, workflows, forms, solutions, and integration audit tooling. No write operations, no schema modifications, no data changes.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "powerplatform": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform@beta", "mcp-consultant-tools-powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "op://Work/PP-App-Registration/username",
        "POWERPLATFORM_TENANT_ID": "op://Work/PP-App-Registration/tenantid",
        "POWERPLATFORM_CLIENT_SECRET": "op://Work/PP-App-Registration/password"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "powerplatform": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform", "mcp-consultant-tools-powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "powerplatform": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

**Authentication modes:**
- **Service principal:** Set `POWERPLATFORM_CLIENT_SECRET`. Best for automation and CI/CD.
- **Interactive (SSO):** Omit `POWERPLATFORM_CLIENT_SECRET`. Browser opens on first use; tokens cached ~90 days. Requires app registration with "Allow public client flows" enabled and `Dynamics CRM / user_impersonation` delegated permission.

## Prompts

| Prompt | Description |
|--------|-------------|
| `entity-overview` | Comprehensive overview of an entity with key fields, relationships, and usage patterns |
| `attribute-details` | Detailed attribute information with data types, constraints, and best practices |
| `query-template` | OData query templates with filter examples and optimization tips |
| `relationship-map` | Visual relationship map showing parent/child and N:N relationships |
| `plugin-deployment-report` | Plugin deployment validation with automatic issue detection |
| `entity-plugin-pipeline-report` | Plugin execution pipeline showing order and configuration |
| `flows-report` | Power Automate flows inventory grouped by state |
| `workflows-report` | Classic workflows inventory with trigger configuration |
| `business-rules-report` | Business rules inventory by entity and state |
| `app-overview` | Comprehensive overview of a model-driven app including components and configuration |
| `dataverse-best-practices-report` | Formatted Dataverse validation report (use with `validate-dataverse` tool) |
| `integration-audit-report` | Comprehensive integration audit report with drill-down capability |

## Notable Behavior

- **`get-flows` filters by default:** Excludes Customer Insights (CXP_ prefix), SYSTEM-modified flows, and Copilot for Sales flows. Use `excludeCustomerInsights: false` etc. to include them. Response includes exclusion statistics.
- **`validate-dataverse` validates publisher prefix compliance:** Pass your `publisherPrefix` (e.g., `"sic_"`) to check naming conventions, lookup naming, option set scope, required columns, and entity icons across a solution or specific entities.
- **`gen-integration-audit` is the top-level audit tool:** Aggregates service endpoints, webhooks, flow complexity, environment variables, and plugin inventory into a single Markdown report. Use `outputFormat: "summary"` to surface only flagged items.
- **Flow/workflow definition tools support `summary` mode:** Pass `summary: true` to `get-flow-definition` or `get-workflow-definition` for a parsed, reduced-size summary instead of raw JSON/XAML.

## Related Packages

- [POWERPLATFORM_CUSTOMIZATION.md](POWERPLATFORM_CUSTOMIZATION.md) - Schema modifications (entities, attributes, plugins, solutions)
- [POWERPLATFORM_DATA.md](POWERPLATFORM_DATA.md) - Record CRUD and action execution
