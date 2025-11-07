Claude’s Plan
Azure Application Insights Integration Implementation Plan
Overview
Add Azure Application Insights integration to the MCP server, enabling AI assistants to query telemetry data, exceptions, performance metrics, and logs for troubleshooting. All Application Insights resources will be configurable with active/inactive flags for quick toggling.
Architecture Decisions
1. Configuration Approach
Support multiple Application Insights resources via JSON array in APPINSIGHTS_RESOURCES environment variable
Each resource has: id, name, appId, active (boolean), apiKey (optional), description
Fallback to single-resource configuration for simplicity (APPINSIGHTS_APP_ID)
Active/inactive flag enables quick resource toggling without config removal
2. Authentication
Primary: Microsoft Entra ID (OAuth 2.0 via MSAL) - better rate limits (60 req/min), aligns with PowerPlatform pattern
Fallback: API Key authentication - simpler setup (15 req/min limit)
Configurable via APPINSIGHTS_AUTH_METHOD environment variable
3. Service Architecture
Create ApplicationInsightsService.ts following existing service patterns
Lazy initialization (only create service when first tool/prompt is invoked)
Token caching with automatic refresh
Query execution via Application Insights Query API (KQL)
Implementation Plan
Phase 1: Core Service Class
Files to create:
src/ApplicationInsightsService.ts - Main service class
Key methods:
getAccessToken() - MSAL authentication (reuse PowerPlatform pattern)
getAuthHeaders() - Return headers based on auth method
executeQuery(resourceId, query, timespan) - Execute KQL queries
getMetadata(resourceId) - Get schema information
getActiveResources() - Filter active resources
Helper methods: getRecentExceptions(), getSlowRequests(), getFailedDependencies(), getOperationPerformance(), getTracesBySeverity(), getAvailabilityResults(), getCustomEvents()
Phase 2: MCP Tools (10 total)
Files to modify:
src/index.ts - Add tool registrations
Tools to implement:
appinsights-list-resources - List configured resources
appinsights-get-metadata - Get schema metadata
appinsights-execute-query - Execute custom KQL queries
appinsights-get-exceptions - Get recent exceptions
appinsights-get-slow-requests - Get slow HTTP requests
appinsights-get-operation-performance - Get performance summary
appinsights-get-failed-dependencies - Get failed dependencies
appinsights-get-traces - Get diagnostic traces
appinsights-get-availability - Get availability test results
appinsights-get-custom-events - Get custom events
Phase 3: MCP Prompts (5 total)
Files to modify:
src/index.ts - Add prompt registrations
src/utils/appinsights-formatters.ts - Formatting utilities (NEW)
Prompts to implement:
appinsights-exception-summary - Exception summary report
appinsights-performance-report - Performance analysis report
appinsights-dependency-health - Dependency health report
appinsights-availability-report - Availability and uptime report
appinsights-troubleshooting-guide - Comprehensive troubleshooting guide
Formatting utilities:
formatTableAsMarkdown() - Convert query results to markdown tables
analyzeExceptions() - Extract insights from exception data
analyzePerformance() - Extract insights from performance data
Phase 4: Configuration & Environment
Files to modify:
src/index.ts - Add configuration parsing and service initialization
README.md - Add Application Insights section
CLAUDE.md - Add architecture documentation
Environment variables:
APPINSIGHTS_AUTH_METHOD=entra-id|api-key
APPINSIGHTS_TENANT_ID=<tenant-id>
APPINSIGHTS_CLIENT_ID=<client-id>
APPINSIGHTS_CLIENT_SECRET=<client-secret>
APPINSIGHTS_RESOURCES=[{"id":"prod-api","name":"Production API","appId":"...","active":true}]

# Or single resource fallback:
APPINSIGHTS_APP_ID=<app-id>
APPINSIGHTS_API_KEY=<api-key>
Phase 5: Error Handling & Security
Security measures:
Query validation (prevent dangerous KQL keywords)
Query size limits (max 10KB)
Result size limits (max 10,000 rows)
Sanitize error messages (remove credentials)
Respect active/inactive resource flags
Read-only operations only
Error handling:
Authentication failures (401/403)
Rate limiting (429) with retry-after
KQL syntax/semantic errors
Network timeouts
Resource not found errors
Phase 6: Testing & Documentation
Testing:
Unit tests for ApplicationInsightsService methods
Integration tests with real Application Insights resources
MCP tool tests
Documentation:
README.md: Setup guide, configuration examples, tool/prompt listings
CLAUDE.md: Architecture details, use cases, examples
Setup guide for Azure permissions (Monitoring Reader role)
File Changes Summary
New Files:
src/ApplicationInsightsService.ts (~600 lines)
src/utils/appinsights-formatters.ts (~200 lines)
Modified Files:
src/index.ts - Add configuration, service initialization, 10 tools, 5 prompts (~800 lines added)
README.md - Add Application Insights section (~100 lines)
CLAUDE.md - Add architecture documentation (~200 lines)
package.json - Update version for release
Estimated Effort
Phase 1-2: 2-3 days (service + basic tools)
Phase 3: 1-2 days (prompts + formatting)
Phase 4-6: 2-3 days (config, docs, testing)
Total: ~1 week
Success Criteria
✅ All 10 tools working and tested
✅ All 5 prompts generating useful reports
✅ Both auth methods (Entra ID + API Key) working
✅ Multi-resource configuration working
✅ Active/inactive toggling working
✅ Documentation complete
✅ Integration follows existing codebase patterns
Next Steps After Approval
Create ApplicationInsightsService.ts with authentication
Implement query execution and helper methods
Register 10 MCP tools in index.ts
Implement 5 MCP prompts with formatting
Update documentation (README.md, CLAUDE.md)
Test with real Application Insights resources
Publish as release 6.0