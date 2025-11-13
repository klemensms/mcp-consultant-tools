# Release vX.Y.Z-beta.1

**Note:** This is a beta release template. Remove `-beta.1` from title and beta config section when finalizing for production.

## Breaking Changes

List any changes that require user action or may break existing configurations:

- Environment variable `OLD_NAME` renamed to `NEW_NAME` - update your `.env` files
- Tool `deprecated_tool` removed - use `new_tool` instead
- Minimum Node.js version increased from 16 to 18

*If no breaking changes, write:* None

## New Features

List new capabilities and integrations:

- Added SharePoint Online integration (15 tools, 5 prompts)
- New tool: `servicebus-inspect-dlq` - analyze dead-letter queue messages
- New prompt: `analyze-powerplatform-performance` - comprehensive performance analysis
- Support for Azure SQL connection pooling with configurable limits

**Beta Testing Configuration:**

For integrations that were updated in this release, provide beta testing configuration examples:

```json
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["mcp-consultant-tools@beta"],
      "env": {
        "SHAREPOINT_TENANT_ID": "your-tenant-id",
        "SHAREPOINT_CLIENT_ID": "your-client-id",
        "SHAREPOINT_CLIENT_SECRET": "your-secret",
        "SHAREPOINT_SITES": "site1,site2"
      }
    }
  }
}
```

Or for specific package testing:

```json
{
  "mcpServers": {
    "sharepoint": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/sharepoint@beta"],
      "env": {
        "SHAREPOINT_TENANT_ID": "your-tenant-id",
        "SHAREPOINT_CLIENT_ID": "your-client-id",
        "SHAREPOINT_CLIENT_SECRET": "your-secret"
      }
    }
  }
}
```

**Testing checklist:**
- [ ] Configure beta using examples above
- [ ] Test all new SharePoint tools
- [ ] Verify authentication works
- [ ] Test with real MCP client (Claude Desktop)

*If no new features, write:* None

## Changes to Existing Features

List improvements, fixes, and modifications to existing functionality:

- Improved error messages for authentication failures across all integrations
- PowerPlatform split into 3 security-isolated packages (read-only, customization, data)
- Service Bus message inspection now displays full message body and custom properties
- Enhanced retry logic for npm registry verification in publish script
- GitHub Enterprise branch detection now uses improved caching

*If no changes, write:* None

---

## Notes for Creating Release Notes

### Workflow

1. **After beta publishing:** Create `vX.Y.Z-beta.1.md` with:
   - All changes (breaking, new features, improvements)
   - Beta testing configuration for updated integrations
   - Testing checklist

2. **After beta iterations:** Update release notes:
   - Update version in filename (beta.1 → beta.2)
   - Add any new fixes to "Changes to Existing Features"
   - Update beta config if needed

3. **Before production release:** Finalize release notes:
   - Rename: `vX.Y.Z-beta.md` → `vX.Y.Z.md`
   - Remove `-beta.X` from title
   - Remove "Beta Testing Configuration" section
   - Remove testing checklist
   - Add release date: `Released: 2025-11-13`
   - Review and polish all sections

### Target Audience

End users (developers using the packages), not package maintainers

### Style

TLDR format - concise, scannable, actionable

### What to Include

- Changes users need to know about
- New capabilities they can use
- Breaking changes requiring action
- Improvements to existing features
- Beta config for integrations being tested (beta only)

### What to Exclude

- Internal refactoring that doesn't affect users
- Code structure changes
- Build process improvements
- Minor dependency updates (unless they fix important issues)

### Tips

- Start with breaking changes (most important)
- Group related changes together
- Include tool/prompt counts for new integrations
- Link to detailed docs for complex features
- Use active voice and clear language
- For beta: Provide complete config examples
- For production: Remove all beta references
