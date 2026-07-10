# Scope: Package → MCP-binary → CLI-binary lookup table. Load when authoring an MCP server config, debugging "binary not found" errors, or adding a new package row (mirror it in `cli-architecture.md`'s verification loop too).

## npx Args Format (IMPORTANT)

**Always use the explicit `--package` format** when the package name differs from the binary name:

```json
"args": ["-y", "--package=@mcp-consultant-tools/PACKAGE", "BINARY"]
```

This explicitly tells npx which package to install and which binary to run. The short format `["-y", "@mcp-consultant-tools/PACKAGE"]` relies on npx inferring the binary, which can be inconsistent.

## Package to Binary Mapping

| Package | MCP Binary | CLI Binary |
|---------|-----------|------------|
| `@mcp-consultant-tools/powerplatform` | `mcp-consultant-tools-powerplatform` | `mcp-pp-cli` |
| `@mcp-consultant-tools/powerplatform-customization` | `mcp-pp-custom` | `mcp-pp-custom-cli` |
| `@mcp-consultant-tools/powerplatform-data` | `mcp-pp-data` | `mcp-pp-data-cli` |
| `@mcp-consultant-tools/azure-devops` | `mcp-ado` | `mcp-ado-cli` |
| `@mcp-consultant-tools/azure-devops-admin` | `mcp-ado-admin` | `mcp-ado-admin-cli` |
| `@mcp-consultant-tools/log-analytics` | `mcp-loganalytics` | `mcp-loganalytics-cli` |
| `@mcp-consultant-tools/application-insights` | `mcp-appins` | `mcp-appins-cli` |
| `@mcp-consultant-tools/azure-sql` | `mcp-sql` | `mcp-sql-cli` |
| `@mcp-consultant-tools/service-bus` | `mcp-sb` | `mcp-sb-cli` |
| `@mcp-consultant-tools/sharepoint` | `mcp-spo` | `mcp-spo-cli` |
| `@mcp-consultant-tools/figma` | `mcp-figma` | `mcp-figma-cli` |
| `@mcp-consultant-tools/github-enterprise` | `mcp-ghe` | `mcp-ghe-cli` |
| `@mcp-consultant-tools/azure-b2c` | `mcp-azure-b2c` | `mcp-azure-b2c-cli` |
| `@mcp-consultant-tools/azure-management` | `mcp-azure-mgmt` | `mcp-azure-mgmt-cli` |
| `@mcp-consultant-tools/azure-defender` | `mcp-defender` | `mcp-defender-cli` |
| `@mcp-consultant-tools/entra-id` | `mcp-entra` | `mcp-entra-cli` |
| `@mcp-consultant-tools/azure-storage` | `mcp-storage` | `mcp-storage-cli` |
| `@mcp-consultant-tools/azure-data-factory` | `mcp-adf` | `mcp-adf-cli` |
| `@mcp-consultant-tools/fabric` | `mcp-fabric` | `mcp-fabric-cli` |
| `@mcp-consultant-tools/1password` | `mcp-op` | `mcp-op-cli` |
| `@mcp-consultant-tools/rest-api` | `mcp-rest-api` | `mcp-rest-api-cli` |
| `@mcp-consultant-tools/teams` | `mcp-teams` | `mcp-teams-cli` |
| `@mcp-consultant-tools/computer-use` *(sibling repo)* | `mcp-cu` | `mcp-cu-cli` |
| `mcp-consultant-tools` (meta) | `mcp-consultant-tools` | `mcp-tools-cli` |

## Example Configuration

```json
{
  "mcpServers": {
    "log-analytics": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/log-analytics@beta", "mcp-loganalytics"],
      "env": {
        "REQUIRED_VAR": "value",
        "OPTIONAL_VAR": "default-value",
        "FEATURE_FLAG": "false"
      }
    }
  }
}
```

When providing MCP server configuration examples (e.g., for `claude_desktop_config.json`), **always include ALL environment variables** with their default values, including optional ones, unless instructed otherwise. This helps users understand all available options.
