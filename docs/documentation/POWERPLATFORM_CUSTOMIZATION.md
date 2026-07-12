# PowerPlatform Customization

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/POWERPLATFORM_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/powerplatform-customization`

MCP server for Dynamics 365 / Dataverse schema modifications: create and manage entities, attributes, relationships, option sets, forms, views, web resources, plugins, flows, and solutions. Not production-safe — use in development and configuration environments only.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "powerplatform-customization": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-customization@beta", "mcp-pp-custom"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "op://Work/PP-App-Registration/username",
        "POWERPLATFORM_CLIENT_SECRET": "op://Work/PP-App-Registration/password",
        "POWERPLATFORM_TENANT_ID": "op://Work/PP-App-Registration/tenantid",
        "PUBLISHER_PREFIX": "contoso_",
        "POWERPLATFORM_DEFAULT_SOLUTION": "YourSolutionUniqueName"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "powerplatform-customization": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-customization", "mcp-pp-custom"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",
        "PUBLISHER_PREFIX": "contoso_",
        "POWERPLATFORM_DEFAULT_SOLUTION": "YourSolutionUniqueName"
      }
    }
  }
}
```

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "powerplatform-customization": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

`PUBLISHER_PREFIX` is required and used at startup to configure the publisher context for all schema operations. `POWERPLATFORM_DEFAULT_SOLUTION` is optional; when set, schema creation tools use it as the default solution if no `solutionUniqueName` is provided per-call.

## Notable Behavior

- **`PUBLISHER_PREFIX` is validated at startup:** If missing, the server fails to start. Provide with or without trailing underscore — it is normalized automatically (e.g., `"contoso"` becomes `"contoso_"`). This prefix is used by naming validation and icon management throughout the package.
- **Most schema changes require publishing:** After `create-entity`, `update-entity`, `create-attribute`, etc., call `publish-customizations` or `publish-entity` to make changes live.
- **`deploy-plugin-complete` is an orchestration tool:** Handles the full plugin deployment workflow in one call — upload DLL, register steps, register images. Use individual tools (`create-plugin-assembly`, `register-plugin-step`, `register-plugin-image`) for incremental updates.
- **`register-webhook` is an orchestration tool:** Creates the service endpoint and SDK message processing step in a single call.
- **`update-entity-icon` auto-publishes:** Uses Fluent UI System Icons from Microsoft's icon library. Icon is published immediately without needing a separate publish step.
- **`document-automation` analyzes and documents flows:** Parses a Power Automate flow's definition, extracts structured metadata (trigger type, tables modified, trigger fields, custom APIs called, action count), and writes it as a YAML frontmatter block into the flow's description. Safe to re-run — existing manual notes below the YAML block are preserved. Also supports classic workflows with automatic deactivate/reactivate via `document-workflow-safe`.

## Related Packages

- [POWERPLATFORM.md](POWERPLATFORM.md) - Read-only metadata, validation, and audit tools
- [POWERPLATFORM_DATA.md](POWERPLATFORM_DATA.md) - Record CRUD and action execution
