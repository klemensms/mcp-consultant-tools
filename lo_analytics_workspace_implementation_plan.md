# Azure Log Analytics Workspace Integration - Implementation Plan

## Overview

Extend the MCP server to provide intelligent access to Azure Log Analytics workspaces, enabling AI assistants to query and analyze Azure Functions logs and other application telemetry. This integration will follow the same architectural patterns as the existing Application Insights integration.

## Business Value

- **Troubleshooting**: Query Azure Functions logs directly from AI assistant context
- **Performance Analysis**: Analyze function execution times, failures, and patterns
- **Error Investigation**: Search and analyze exceptions and error traces
- **Correlation**: Cross-reference logs with Application Insights telemetry
- **Operational Insights**: Monitor application health and identify issues proactively

## Architecture Overview

### Service Layer
- **Class**: `LogAnalyticsService` (new file: `src/LogAnalyticsService.ts`)
- **Authentication**: Microsoft Entra ID OAuth 2.0 using `@azure/msal-node`
- **API**: Azure Log Analytics Query API (`https://api.loganalytics.io/v1`)
- **Query Language**: KQL (Kusto Query Language)
- **Pattern**: Same as `ApplicationInsightsService` for consistency

### Integration Pattern
```
AI Assistant Request
    ↓
MCP Tool/Prompt
    ↓
LogAnalyticsService
    ↓
Authentication (MSAL OAuth)
    ↓
Log Analytics Query API (KQL)
    ↓
Result Processing & Formatting
    ↓
Response to AI Assistant
```

---

## Implementation Tasks

### Phase 1: Research & Design (2-4 hours)

#### Task 1.1: Research Log Analytics API
- [ ] Review Azure Log Analytics Query API documentation
- [ ] Understand authentication requirements (OAuth vs API Key)
- [ ] Identify API endpoints and request/response formats
- [ ] Review rate limits and quotas
- [ ] Document API reference: https://learn.microsoft.com/en-us/rest/api/loganalytics/

#### Task 1.2: Research Azure Functions Logging Tables
- [ ] Identify relevant Log Analytics tables for Azure Functions:
  - `FunctionAppLogs` - Function execution logs
  - `AppTraces` - Application traces
  - `AppExceptions` - Exceptions and errors
  - `AppDependencies` - Outbound dependency calls
  - `AppRequests` - HTTP requests (for HTTP-triggered functions)
  - `AppMetrics` - Custom metrics
- [ ] Document table schemas and key columns
- [ ] Identify filtering strategies (time, function name, severity, etc.)

#### Task 1.3: Review KQL Query Patterns
- [ ] Common queries for Azure Functions troubleshooting:
  - Recent function executions by name
  - Function errors and exceptions
  - Function execution duration (performance)
  - Function invocation count and success rate
  - Dependency failures from functions
  - Trace logs filtered by severity
- [ ] Time range filtering patterns
- [ ] Aggregation and summarization patterns
- [ ] Join patterns across tables

#### Task 1.4: Design Configuration Schema
- [ ] Define environment variables:
  ```
  LOGANALYTICS_WORKSPACES (JSON array with workspace configs)
  LOGANALYTICS_WORKSPACE_ID (fallback for single workspace)
  LOGANALYTICS_CLIENT_ID (Entra ID app registration)
  LOGANALYTICS_CLIENT_SECRET (Entra ID app secret)
  LOGANALYTICS_TENANT_ID (Azure tenant ID)
  ```
- [ ] Design workspace configuration structure:
  ```typescript
  interface LogAnalyticsWorkspaceConfig {
    id: string;           // Unique identifier (e.g., "prod-functions")
    name: string;         // Display name
    workspaceId: string;  // Log Analytics workspace ID
    active: boolean;      // Enable/disable without removing config
  }
  ```

---

### Phase 2: Service Implementation (4-6 hours)

#### Task 2.1: Create LogAnalyticsService Class
**File**: `src/LogAnalyticsService.ts`

- [ ] Create class skeleton with configuration interface
- [ ] Implement constructor with workspace config parsing
- [ ] Add workspace validation logic
- [ ] Implement active/inactive workspace filtering

**Template Structure**:
```typescript
import * as msal from '@azure/msal-node';

interface LogAnalyticsWorkspaceConfig {
  id: string;
  name: string;
  workspaceId: string;
  active: boolean;
}

export class LogAnalyticsService {
  private msalClient: msal.ConfidentialClientApplication;
  private workspaces: LogAnalyticsWorkspaceConfig[];
  private cachedToken: { token: string; expiresOn: Date } | null = null;

  constructor(
    clientId: string,
    clientSecret: string,
    tenantId: string,
    workspaces: LogAnalyticsWorkspaceConfig[]
  ) {
    // Initialize MSAL client
    // Parse and validate workspaces
  }

  // Core methods...
}
```

#### Task 2.2: Implement Authentication
- [ ] Initialize MSAL `ConfidentialClientApplication` (same pattern as ApplicationInsightsService)
- [ ] Implement `getAccessToken()` method with token caching
- [ ] Add token refresh logic (5-minute buffer before expiry)
- [ ] Handle authentication errors with clear messages
- [ ] Scope: `https://api.loganalytics.io/.default`

**Reference**: See `ApplicationInsightsService.ts:45-82` for MSAL pattern

#### Task 2.3: Implement Core Query Method
- [ ] Create `executeQuery(workspaceId: string, query: string, timespan?: string)` method
- [ ] Build request to Log Analytics Query API:
  ```
  POST https://api.loganalytics.io/v1/workspaces/{workspaceId}/query
  Authorization: Bearer {token}
  Content-Type: application/json

  {
    "query": "FunctionAppLogs | where TimeGenerated > ago(1h)",
    "timespan": "PT1H"  // Optional ISO 8601 duration
  }
  ```
- [ ] Parse response (tables, rows, columns structure)
- [ ] Handle errors (401, 403, 429, 500)
- [ ] Add retry logic with exponential backoff

**Reference**: See `ApplicationInsightsService.ts:84-145` for query execution pattern

#### Task 2.4: Implement Helper Methods for Azure Functions
- [ ] `getFunctionLogs(workspaceId, functionName, timespan, severityLevel?)`:
  ```kql
  FunctionAppLogs
  | where TimeGenerated > ago(timespan)
  | where FunctionName == '{functionName}'
  | where SeverityLevel >= {severityLevel}  // Optional
  | order by TimeGenerated desc
  | project TimeGenerated, FunctionName, Message, SeverityLevel, HostInstanceId
  ```

- [ ] `getFunctionErrors(workspaceId, functionName, timespan)`:
  ```kql
  FunctionAppLogs
  | where TimeGenerated > ago(timespan)
  | where FunctionName == '{functionName}'
  | where SeverityLevel >= 3  // Error, Critical
  | order by TimeGenerated desc
  | project TimeGenerated, FunctionName, Message, ExceptionType, ExceptionMessage
  ```

- [ ] `getFunctionExecutionStats(workspaceId, functionName, timespan)`:
  ```kql
  FunctionAppLogs
  | where TimeGenerated > ago(timespan)
  | where FunctionName == '{functionName}'
  | summarize
      TotalExecutions = count(),
      SuccessCount = countif(SeverityLevel < 3),
      ErrorCount = countif(SeverityLevel >= 3),
      AvgDuration = avg(DurationMs),
      P50Duration = percentile(DurationMs, 50),
      P95Duration = percentile(DurationMs, 95)
  ```

- [ ] `searchFunctionLogs(workspaceId, searchText, timespan, functionName?)`:
  ```kql
  FunctionAppLogs
  | where TimeGenerated > ago(timespan)
  | where FunctionName == '{functionName}'  // Optional
  | where Message contains '{searchText}'
  | order by TimeGenerated desc
  ```

- [ ] `getFunctionInvocations(workspaceId, functionName, timespan)`:
  ```kql
  AppRequests
  | where TimeGenerated > ago(timespan)
  | where OperationName contains '{functionName}'
  | order by TimeGenerated desc
  | project TimeGenerated, OperationName, Success, DurationMs, ResultCode
  ```

#### Task 2.5: Implement Workspace Management Methods
- [ ] `listWorkspaces()`: Return all configured workspaces (active and inactive)
- [ ] `getWorkspace(workspaceId)`: Get specific workspace config
- [ ] `getActiveWorkspaces()`: Return only active workspaces
- [ ] Validate workspace IDs against configured list

#### Task 2.6: Add Utility Methods
- [ ] `convertTimespanToKQL(iso8601Duration)`: Convert PT1H → 1h, P1D → 1d
- [ ] `validateQuery(query)`: Basic KQL syntax validation
- [ ] `formatQueryResults(response)`: Transform API response to simplified structure
- [ ] `getMetadata(workspaceId)`: Get workspace schema (tables and columns)

**Reference**: See `ApplicationInsightsService.ts:360-380` for timespan conversion

---

### Phase 3: MCP Integration (3-4 hours)

#### Task 3.1: Register Service in MCP Server
**File**: `src/index.ts`

- [ ] Add service instance variable (lazy initialization):
  ```typescript
  let logAnalyticsService: LogAnalyticsService | null = null;
  ```

- [ ] Create initialization function:
  ```typescript
  function getLogAnalyticsService(): LogAnalyticsService {
    if (!logAnalyticsService) {
      // Validate environment variables
      // Parse workspace configuration
      // Initialize service
    }
    return logAnalyticsService;
  }
  ```

- [ ] Add configuration validation helper
- [ ] Handle missing/invalid configuration gracefully

**Reference**: See `index.ts:137-178` for ApplicationInsights initialization pattern

#### Task 3.2: Implement Core Tools (5 tools)

**Tool 1: `loganalytics-list-workspaces`**
- Description: "List all configured Log Analytics workspaces"
- Parameters: None
- Returns: Array of workspace configs with active/inactive status

**Tool 2: `loganalytics-get-metadata`**
- Description: "Get Log Analytics workspace schema (tables and columns)"
- Parameters: `{ workspaceId: string }`
- Returns: Workspace metadata (tables, columns, types)

**Tool 3: `loganalytics-execute-query`**
- Description: "Execute custom KQL query against Log Analytics workspace"
- Parameters:
  ```typescript
  {
    workspaceId: string;
    query: string;        // KQL query
    timespan?: string;    // ISO 8601 duration (PT1H, P1D, etc.)
  }
  ```
- Returns: Query results (tables with rows and columns)

**Tool 4: `loganalytics-get-function-logs`**
- Description: "Get logs for a specific Azure Function"
- Parameters:
  ```typescript
  {
    workspaceId: string;
    functionName: string;
    timespan?: string;     // Default: PT1H
    severityLevel?: number; // 0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical
  }
  ```
- Returns: Function log entries with timestamp, message, severity

**Tool 5: `loganalytics-get-function-errors`**
- Description: "Get error logs for a specific Azure Function"
- Parameters:
  ```typescript
  {
    workspaceId: string;
    functionName: string;
    timespan?: string;     // Default: PT1H
  }
  ```
- Returns: Error logs with exception details

**Tool 6: `loganalytics-search-logs`**
- Description: "Search function logs by text content"
- Parameters:
  ```typescript
  {
    workspaceId: string;
    searchText: string;
    timespan?: string;     // Default: PT1H
    functionName?: string; // Optional function filter
    severityLevel?: number; // Optional severity filter
  }
  ```
- Returns: Matching log entries

**Tool 7: `loganalytics-get-function-stats`**
- Description: "Get execution statistics for Azure Function"
- Parameters:
  ```typescript
  {
    workspaceId: string;
    functionName: string;
    timespan?: string;     // Default: PT1H
  }
  ```
- Returns: Execution count, success rate, duration statistics (avg, p50, p95)

**Tool 8: `loganalytics-get-function-invocations`**
- Description: "Get function invocation history (from AppRequests table)"
- Parameters:
  ```typescript
  {
    workspaceId: string;
    functionName: string;
    timespan?: string;     // Default: PT1H
  }
  ```
- Returns: Invocation records with success/failure, duration, result codes

**Implementation Checklist for Each Tool**:
- [ ] Add Zod schema for parameter validation
- [ ] Implement tool handler with try/catch
- [ ] Call appropriate LogAnalyticsService method
- [ ] Format response consistently
- [ ] Handle errors with user-friendly messages
- [ ] Add JSDoc comments with examples

**Reference**: See `index.ts:1868-2025` for Application Insights tool examples

#### Task 3.3: Implement Prompts (4-5 prompts)

**Prompt 1: `loganalytics-function-logs-report`**
- Description: "Formatted report of function logs with timeline and insights"
- Parameters: Same as `loganalytics-get-function-logs`
- Returns: Markdown report with:
  - Function execution timeline
  - Log distribution by severity
  - Recent errors (if any)
  - Recommendations

**Prompt 2: `loganalytics-function-troubleshooting`**
- Description: "Comprehensive troubleshooting guide for function issues"
- Parameters:
  ```typescript
  {
    workspaceId: string;
    functionName: string;
    timespan?: string;
  }
  ```
- Returns: Markdown report combining:
  - Recent errors and exceptions
  - Execution statistics
  - Performance metrics
  - Common issues and recommendations

**Prompt 3: `loganalytics-function-performance-report`**
- Description: "Performance analysis report for Azure Function"
- Parameters: Same as `loganalytics-get-function-stats`
- Returns: Markdown report with:
  - Execution count and success rate
  - Duration percentiles (p50, p95, p99)
  - Slow executions
  - Performance trends
  - Optimization recommendations

**Prompt 4: `loganalytics-workspace-summary`**
- Description: "Summary of all functions in workspace"
- Parameters:
  ```typescript
  {
    workspaceId: string;
    timespan?: string;
  }
  ```
- Returns: Markdown report with:
  - List of active functions
  - Error summary by function
  - Top errors by frequency
  - Overall health status

**Implementation Checklist for Each Prompt**:
- [ ] Define prompt template with placeholders
- [ ] Implement prompt handler
- [ ] Call relevant tools to gather data
- [ ] Use formatting utilities to create markdown
- [ ] Add insights and recommendations
- [ ] Handle edge cases (no data, errors)

**Reference**: See `index.ts:2028-2140` for Application Insights prompt examples

#### Task 3.4: Create Formatting Utilities
**File**: `src/utils/loganalytics-formatters.ts`

- [ ] `formatTableAsMarkdown(results)`: Convert query results to markdown tables
- [ ] `formatLogEntry(log)`: Format single log entry with timestamp, severity, message
- [ ] `formatFunctionStats(stats)`: Format execution statistics
- [ ] `analyzeLogs(logs)`: Extract insights from log data
  - Error patterns
  - Severity distribution
  - Time-based patterns
  - Common exception types
- [ ] `generateRecommendations(analysis)`: Generate actionable recommendations

**Reference**: See `src/utils/appinsights-formatters.ts` for similar utilities

---

### Phase 4: Configuration & Environment (1-2 hours)

#### Task 4.1: Update Environment Configuration
- [ ] Add Log Analytics variables to `.env.example`:
  ```bash
  # Azure Log Analytics Configuration (Optional)
  LOGANALYTICS_WORKSPACES=[{"id":"prod-functions","name":"Production Functions","workspaceId":"12345678-1234-1234-1234-123456789012","active":true}]

  # Or single workspace fallback
  LOGANALYTICS_WORKSPACE_ID=12345678-1234-1234-1234-123456789012

  # Authentication (Entra ID OAuth)
  LOGANALYTICS_CLIENT_ID=your-app-registration-client-id
  LOGANALYTICS_CLIENT_SECRET=your-app-registration-client-secret
  LOGANALYTICS_TENANT_ID=your-azure-tenant-id
  ```

- [ ] Document configuration precedence:
  1. `LOGANALYTICS_WORKSPACES` (multi-workspace, preferred)
  2. `LOGANALYTICS_WORKSPACE_ID` (single workspace fallback)

#### Task 4.2: Add TypeScript Interfaces
- [ ] Define `LogAnalyticsWorkspaceConfig` interface
- [ ] Define query result interfaces
- [ ] Define log entry interfaces
- [ ] Export interfaces for use in other modules

---

### Phase 5: Documentation (3-4 hours)

#### Task 5.1: Update README.md
- [ ] Add Log Analytics to overview section
- [ ] Update tool count (currently 96 → 104+)
- [ ] Update prompt count (currently 18 → 22+)
- [ ] Add Log Analytics to features list
- [ ] Add configuration example for workspaces
- [ ] Add quick start example

**Location**: Lines 1-50 (Overview section)

#### Task 5.2: Update SETUP.md
- [ ] Add "Azure Log Analytics Setup" section after Application Insights
- [ ] Document Azure portal steps:
  1. Navigate to Log Analytics workspace
  2. Get workspace ID from "Properties" blade
  3. Assign app registration "Monitoring Reader" role
  4. Configure environment variables
- [ ] Add screenshots (if possible):
  - Log Analytics workspace properties
  - IAM role assignment
- [ ] Add troubleshooting section:
  - 401 errors (missing/invalid credentials)
  - 403 errors (insufficient permissions)
  - Common configuration mistakes
- [ ] Add workspace ID validation steps

**Location**: After line 200 (Application Insights section)

#### Task 5.3: Update TOOLS.md
- [ ] Add "Log Analytics Tools" section (8 tools)
- [ ] Document each tool with:
  - Description
  - Parameters (with types and defaults)
  - Return value structure
  - Example usage
- [ ] Add "Log Analytics Prompts" section (4-5 prompts)
- [ ] Document each prompt with:
  - Description
  - Parameters
  - Output format
  - Use cases
- [ ] Update table of contents

**Location**: After Application Insights tools/prompts sections

#### Task 5.4: Update USAGE.md
- [ ] Add "Azure Functions Troubleshooting with Log Analytics" section
- [ ] Provide real-world examples:
  - **Example 1**: Investigating function errors
    ```
    User: "Why is the ProcessOrders function failing?"
    AI: Uses loganalytics-get-function-errors → analyzes logs → identifies issue
    ```
  - **Example 2**: Performance analysis
    ```
    User: "Is the SendEmail function slow?"
    AI: Uses loganalytics-get-function-stats → shows p95 duration → recommends optimization
    ```
  - **Example 3**: Searching logs
    ```
    User: "Find all logs mentioning 'timeout' in the last hour"
    AI: Uses loganalytics-search-logs → returns matching entries
    ```
  - **Example 4**: Comprehensive troubleshooting
    ```
    User: "Full health check for DataSync function"
    AI: Uses loganalytics-function-troubleshooting prompt → generates report
    ```
- [ ] Add correlation example (Log Analytics + Application Insights)
- [ ] Add workspace management example

**Location**: After Application Insights usage examples

#### Task 5.5: Update CLAUDE.md
- [ ] Add "Log Analytics Integration" section to Architecture
- [ ] Document service architecture:
  - Authentication flow (MSAL OAuth)
  - Query API interaction
  - Helper methods
  - Multi-workspace support
- [ ] Document data filtering and query optimization
- [ ] Add KQL query patterns section
- [ ] Document table schemas for Azure Functions
- [ ] Add security considerations:
  - Credential management
  - Query safety (read-only, size limits)
  - Data sanitization
  - RBAC requirements ("Monitoring Reader" role)
- [ ] Document error handling patterns
- [ ] Add integration patterns section (how it works with other services)

**Location**: After Application Insights architecture section

---

### Phase 6: Testing & Validation (2-3 hours)

#### Task 6.1: Unit Testing
- [ ] Test LogAnalyticsService initialization
  - Valid configuration
  - Invalid configuration (missing variables)
  - Multi-workspace vs single-workspace fallback
- [ ] Test authentication
  - Token acquisition
  - Token caching
  - Token refresh
  - Authentication errors (401, 403)
- [ ] Test query execution
  - Valid queries
  - Invalid queries (syntax errors)
  - Empty results
  - Large results (pagination if needed)
- [ ] Test helper methods
  - Function logs retrieval
  - Error filtering
  - Statistics calculation
  - Search functionality

#### Task 6.2: Integration Testing
- [ ] Test MCP tool invocations
  - Each tool with valid parameters
  - Each tool with invalid parameters
  - Error handling and user-friendly messages
- [ ] Test MCP prompt invocations
  - Each prompt with sample data
  - Markdown formatting validation
  - Recommendations generation
- [ ] Test workspace management
  - List workspaces
  - Active/inactive filtering
  - Workspace validation

#### Task 6.3: End-to-End Testing
- [ ] Configure test environment with real Log Analytics workspace
- [ ] Deploy test Azure Function with logging
- [ ] Execute common scenarios:
  - Get recent function logs
  - Search for specific error message
  - Analyze function performance
  - Generate troubleshooting report
- [ ] Validate query results against Azure portal
- [ ] Test rate limiting and retry logic

#### Task 6.4: Error Handling Testing
- [ ] Test missing credentials
- [ ] Test invalid workspace IDs
- [ ] Test insufficient permissions (403)
- [ ] Test rate limiting (429)
- [ ] Test network errors
- [ ] Test malformed queries
- [ ] Validate error messages are user-friendly

---

### Phase 7: Audit Logging & Security (1-2 hours)

#### Task 7.1: Implement Audit Logging
- [ ] Log all query executions with:
  - Workspace ID
  - Query text (sanitized, no sensitive data)
  - Timestamp
  - Success/failure
  - Execution duration
- [ ] Use existing audit logger pattern (`src/utils/auditLogger.ts`)
- [ ] Follow stdout suppression rules (use stderr for logs)

**Reference**: See `ApplicationInsightsService.ts` for audit logging pattern

#### Task 7.2: Security Hardening
- [ ] Validate all user inputs (workspace IDs, queries, parameters)
- [ ] Implement query size limits (max 10KB)
- [ ] Implement result size limits (max 10,000 rows)
- [ ] Sanitize query strings (no dangerous KQL keywords if needed)
- [ ] Never log credentials or tokens
- [ ] Redact sensitive data from error messages

#### Task 7.3: RBAC Documentation
- [ ] Document required Azure permissions:
  - "Monitoring Reader" role on Log Analytics workspace
  - Assignment can be at workspace or resource group level
- [ ] Document how to verify permissions in Azure portal
- [ ] Add troubleshooting for permission errors

---

### Phase 8: Build & Deployment (1 hour)

#### Task 8.1: Update Package Dependencies
- [ ] Verify `@azure/msal-node` version (already installed for App Insights)
- [ ] Add any new dependencies if needed
- [ ] Update `package.json` if needed
- [ ] Run `npm install` to update lock file

#### Task 8.2: Build Testing
- [ ] Run `npm run build` to compile TypeScript
- [ ] Verify no compilation errors
- [ ] Check output in `build/` directory
- [ ] Test with `npm start` locally

#### Task 8.3: Local MCP Testing
- [ ] Update Claude Desktop config with Log Analytics environment variables
- [ ] Restart Claude Desktop
- [ ] Test tool invocations through MCP
- [ ] Verify JSON-RPC protocol compliance (no stdout pollution)
- [ ] Test error handling through MCP client

---

## Environment Variables Summary

```bash
# Azure Log Analytics Configuration (Optional)
LOGANALYTICS_WORKSPACES=[{"id":"prod-functions","name":"Production Functions","workspaceId":"12345678-1234-1234-1234-123456789012","active":true}]

# Or single workspace fallback
LOGANALYTICS_WORKSPACE_ID=12345678-1234-1234-1234-123456789012

# Authentication (Entra ID OAuth) - Shared with App Insights if same app registration
LOGANALYTICS_CLIENT_ID=your-app-registration-client-id
LOGANALYTICS_CLIENT_SECRET=your-app-registration-client-secret
LOGANALYTICS_TENANT_ID=your-azure-tenant-id
```

**Note**: If using the same app registration for both Application Insights and Log Analytics, you can reuse the same CLIENT_ID, CLIENT_SECRET, and TENANT_ID variables. The server should support this configuration reuse.

---

## Tools & Prompts Summary

### Tools (8 total)
1. `loganalytics-list-workspaces` - List configured workspaces
2. `loganalytics-get-metadata` - Get workspace schema
3. `loganalytics-execute-query` - Execute custom KQL query
4. `loganalytics-get-function-logs` - Get function logs with filtering
5. `loganalytics-get-function-errors` - Get function error logs
6. `loganalytics-search-logs` - Search logs by text
7. `loganalytics-get-function-stats` - Get execution statistics
8. `loganalytics-get-function-invocations` - Get invocation history

### Prompts (4 total)
1. `loganalytics-function-logs-report` - Formatted logs report
2. `loganalytics-function-troubleshooting` - Comprehensive troubleshooting guide
3. `loganalytics-function-performance-report` - Performance analysis
4. `loganalytics-workspace-summary` - Workspace health summary

**Total New MCP Capabilities**: 12 (8 tools + 4 prompts)

---

## Success Criteria

- [ ] All 8 tools implemented and tested
- [ ] All 4 prompts implemented and tested
- [ ] All 5 documentation files updated
- [ ] Integration with existing services (PowerPlatform, Azure DevOps, Figma, App Insights)
- [ ] Local testing successful
- [ ] Build passes without errors
- [ ] No stdout pollution (MCP protocol compliance)
- [ ] Error handling comprehensive and user-friendly
- [ ] Authentication working with Monitoring Reader permissions
- [ ] Query execution working with KQL
- [ ] Multi-workspace support working
- [ ] Timespan filtering working (PT1H, P1D, etc.)
- [ ] Function name filtering working
- [ ] Security review passed (no credential leaks, input validation)

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Research & Design | 2-4 hours | None |
| Phase 2: Service Implementation | 4-6 hours | Phase 1 |
| Phase 3: MCP Integration | 3-4 hours | Phase 2 |
| Phase 4: Configuration | 1-2 hours | Phase 2 |
| Phase 5: Documentation | 3-4 hours | Phases 2, 3 |
| Phase 6: Testing | 2-3 hours | Phases 2, 3 |
| Phase 7: Security & Audit | 1-2 hours | Phases 2, 3 |
| Phase 8: Build & Deployment | 1 hour | All phases |

**Total Estimated Time**: 17-26 hours (2-3 days of focused work)

---

## Risk Mitigation

### Technical Risks
- **API Rate Limits**: Implement retry logic with exponential backoff
- **Large Result Sets**: Implement result size limits and pagination if needed
- **Token Expiry**: Implement token caching with refresh (5-minute buffer)
- **Query Performance**: Provide guidance on efficient KQL queries in docs

### Security Risks
- **Credential Exposure**: Never log tokens/secrets, use environment variables only
- **Injection Attacks**: Validate and sanitize all query inputs
- **Unauthorized Access**: Require proper RBAC (Monitoring Reader role)
- **Data Leakage**: Sanitize error messages, redact sensitive data

### Operational Risks
- **Configuration Complexity**: Provide clear setup docs with screenshots
- **Breaking Changes**: Follow semver, document any breaking changes
- **Testing Coverage**: Implement comprehensive unit and integration tests
- **Documentation Drift**: Update all 5 docs simultaneously

---

## Post-Implementation Tasks

- [ ] Create GitHub release notes
- [ ] Update npm package version (minor bump: `npm version minor`)
- [ ] Publish to npm: `npm publish`
- [ ] Create example queries repository
- [ ] Gather user feedback
- [ ] Monitor usage patterns
- [ ] Identify common use cases for future helper methods
- [ ] Consider adding preset queries for common scenarios

---

## References

### Azure Documentation
- [Log Analytics Query API](https://learn.microsoft.com/en-us/rest/api/loganalytics/)
- [KQL Language Reference](https://learn.microsoft.com/en-us/azure/data-explorer/kusto/query/)
- [Azure Functions Logging](https://learn.microsoft.com/en-us/azure/azure-functions/functions-monitoring)
- [Log Analytics Tables](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/tables-category)

### Codebase References
- Application Insights integration: `src/ApplicationInsightsService.ts`
- MSAL authentication pattern: `src/PowerPlatformService.ts:45-82`
- Tool implementation pattern: `src/index.ts:1868-2025`
- Prompt implementation pattern: `src/index.ts:2028-2140`
- Formatting utilities: `src/utils/appinsights-formatters.ts`

---

## Notes

- This integration follows the same architectural patterns as Application Insights for consistency
- Authentication uses the same MSAL OAuth pattern as PowerPlatform and App Insights
- All integrations remain optional - users can configure only the services they need
- The implementation should be backward compatible - no breaking changes
- Consider reusing authentication credentials if the same app registration is used for both App Insights and Log Analytics