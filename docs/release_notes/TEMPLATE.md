# Release vX.Y.Z

Released: YYYY-MM-DD

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

**Target audience:** End users (developers using the packages), not package maintainers

**Style:** TLDR format - concise, scannable, actionable

**What to include:**
- Changes users need to know about
- New capabilities they can use
- Breaking changes requiring action
- Improvements to existing features

**What to exclude:**
- Internal refactoring that doesn't affect users
- Code structure changes
- Build process improvements
- Minor dependency updates (unless they fix important issues)

**Tips:**
- Start with breaking changes (most important)
- Group related changes together
- Include tool/prompt counts for new integrations
- Link to detailed docs for complex features
- Use active voice and clear language
