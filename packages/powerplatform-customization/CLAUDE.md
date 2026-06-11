# PowerPlatform Customization Package

This package shares guidance with the main PowerPlatform package.

**Read:** `packages/powerplatform/CLAUDE.md` for complete guidance.

## Package-Specific Notes

- **Purpose:** Schema changes (entities, attributes, relationships, plugins, forms, views)
- **Tools:** 88 tools, 2 prompts
- **Production-Safe:** NO - Dev/config environments only
- **No flags required:** Package installation = explicit intent to customize

## Key Tools

- `create-entity`, `update-entity`, `delete-entity`
- `create-attribute`, `update-attribute`, `delete-attribute`
- `create-one-to-many-relationship`, `create-many-to-many-relationship`
- `create-plugin-assembly`, `register-plugin-step`, `register-plugin-image`
- `deploy-plugin-complete` (orchestration)
- `create-form`, `update-form`, `create-view`, `update-view`
- `download-form-to-file`, `deploy-form-file`, `diff-form-file` (source-controlled form XML workflow)
- `create-web-resource`, `update-web-resource`, `deploy-web-resource-file` (from local file)
- `publish-customizations`, `publish-entity`
- `create-service-endpoint`, `update-service-endpoint`, `delete-service-endpoint`
- `register-webhook` (orchestration: endpoint + SDK step in one call)
- `get-flow-runs`, `update-flow-definition`, `cancel-flow-run`, `resubmit-flow-run`

## CLI Usage

Binary: `mcp-pp-custom-cli`

```bash
# Create entity
mcp-pp-custom-cli entity create MyEntity --display-name "My Entity"

# Create attribute
mcp-pp-custom-cli attribute create myentity myfield --type String

# Source-controlled form XML workflow
mcp-pp-custom-cli form download ./docs/forms/contact-main.xml \
  --entity contact --form-name Contact --form-type Main
mcp-pp-custom-cli form diff ./docs/forms/contact-main.xml
mcp-pp-custom-cli form deploy ./docs/forms/contact-main.xml \
  --expected-version 68965459 --solution MyCustomSolution
```
