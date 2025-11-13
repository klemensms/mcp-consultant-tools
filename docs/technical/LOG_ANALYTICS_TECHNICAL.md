# Azure Log Analytics Workspace - Technical Documentation

> **Cross-References:**
> - User Guide: [docs/documentation/LOG_ANALYTICS.md](../documentation/LOG_ANALYTICS.md)
> - Main Documentation: [CLAUDE.md](../../CLAUDE.md#azure-log-analytics-workspace-integration)
> - Source Code: [src/LogAnalyticsService.ts](../../src/LogAnalyticsService.ts)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Authentication Methods](#authentication-methods)
- [Configuration](#configuration)
- [Available Tools (10 total)](#available-tools-10-total)
- [Available Prompts (5 total)](#available-prompts-5-total)
- [Service Implementation](#service-implementation)
- [Service Integration](#service-integration)
- [Formatting Utilities](#formatting-utilities)
- [Log Analytics Tables](#log-analytics-tables)
- [Use Cases](#use-cases)
- [Error Handling](#error-handling)
- [Security Considerations](#security-considerations)
- [Query Optimization](#query-optimization)
- [Design Patterns](#design-patterns)

---

## Overview

The Azure Log Analytics Workspace integration provides powerful log querying capabilities for Azure Functions, App Services, and other Azure resources using KQL (Kusto Query Language). The integration is designed for troubleshooting, performance analysis, and security monitoring with comprehensive support for Azure Functions diagnostics.

## Architecture

The Log Analytics integration provides access to Azure Log Analytics workspaces through the Log Analytics Query API using KQL.

**Service Class:** `LogAnalyticsService` ([src/LogAnalyticsService.ts](../../src/LogAnalyticsService.ts))
- Manages authentication (Entra ID OAuth or API Key)
- Executes KQL queries via Log Analytics Query API
- Provides helper methods for Azure Functions troubleshooting
- Supports multiple workspaces with active/inactive flags
- Implements shared credential fallback to Application Insights credentials

## Authentication Methods

### 1. Microsoft Entra ID (OAuth 2.0) - Recommended for Production
- Higher rate limits (60 requests/minute per user)
- No daily cap
- Better security (token-based, automatic expiry)
- Uses `@azure/msal-node` (same pattern as Application Insights)
- Requires "Log Analytics Reader" role on workspaces

### 2. API Key Authentication - Simpler for Single Workspaces
- Lower rate limits (15 requests/minute per key)
- Daily cap of 1,500 requests per key
- Deprecated by Microsoft - use Entra ID for new implementations
- Requires "Read" permission

## Configuration

Supports two configuration modes:
1. Multi-workspace (JSON array in `LOGANALYTICS_RESOURCES`)
2. Single-workspace fallback (`LOGANALYTICS_WORKSPACE_ID`)

Each workspace has an `active` flag for quick toggling without removing configuration.

### Shared Credentials

The service implements automatic fallback to Application Insights credentials:
```typescript
const LOGANALYTICS_CONFIG: LogAnalyticsConfig = {
  // Falls back to APPINSIGHTS_* if LOGANALYTICS_* not provided
  tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
  clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
  clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
};
```

This allows users with both integrations to use a single Azure AD app registration.

## Available Tools (10 total)

1. **`loganalytics-list-workspaces`** - List configured workspaces (active and inactive)
2. **`loganalytics-get-metadata`** - Get workspace schema (tables and columns)
3. **`loganalytics-execute-query`** - Execute custom KQL queries
4. **`loganalytics-get-function-logs`** - Get Azure Function logs with filtering
5. **`loganalytics-get-function-errors`** - Get function error logs (ExceptionDetails present)
6. **`loganalytics-get-function-stats`** - Get execution statistics (count, success rate)
7. **`loganalytics-get-function-invocations`** - Get function invocation records
8. **`loganalytics-get-recent-events`** - Get recent events from any table (generic)
9. **`loganalytics-search-logs`** - Search logs across tables (cross-table search)
10. **`loganalytics-test-workspace-access`** (BONUS) - Validate workspace access

## Available Prompts (5 total)

1. **`loganalytics-workspace-summary`** - Workspace health overview with all functions
2. **`loganalytics-function-troubleshooting`** - Comprehensive function troubleshooting
3. **`loganalytics-function-performance-report`** - Performance analysis with recommendations
4. **`loganalytics-security-analysis`** (BONUS) - Security event analysis and compliance
5. **`loganalytics-logs-report`** - Formatted logs with insights for any table

## Service Implementation

**File:** [src/LogAnalyticsService.ts](../../src/LogAnalyticsService.ts)

### Core Architecture

```typescript
class LogAnalyticsService {
  // Private MSAL client for token acquisition
  private msalClient: ConfidentialClientApplication | null = null;

  // Token caching (5-minute buffer before expiry)
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  // Configuration
  private config: LogAnalyticsConfig;
  private readonly baseUrl = 'https://api.loganalytics.io/v1';

  // Core methods
  async executeQuery(resourceId, query, timespan?): Promise<QueryResult>
  async getMetadata(resourceId): Promise<MetadataResult>
  async testWorkspaceAccess(resourceId): Promise<TestResult>

  // Azure Functions helpers
  async getFunctionLogs(resourceId, functionName?, timespan?, severityLevel?, limit?)
  async getFunctionErrors(resourceId, functionName?, timespan?, limit?)
  async getFunctionStats(resourceId, functionName?, timespan?)
  async getFunctionInvocations(resourceId, functionName?, timespan?, limit?)

  // Generic helpers
  async getRecentEvents(resourceId, tableName, timespan?, limit?)
  async searchLogs(resourceId, searchText, tableName?, timespan?, limit?)

  // Utility methods
  convertTimespanToKQL(iso8601Duration): string
  validateQuery(query): { valid: boolean; error?: string }
}
```

### Token Management
- Uses MSAL for OAuth 2.0 authentication with scope `https://api.loganalytics.io/.default`
- Implements token caching with 5-minute buffer before expiry
- Automatic token refresh on expiration

### KQL Query Execution

```typescript
async executeQuery(resourceId: string, query: string, timespan?: string): Promise<QueryResult> {
  const resource = this.getResourceById(resourceId);
  const headers = await this.getAuthHeaders(resource);
  const url = `${this.baseUrl}/workspaces/${resource.workspaceId}/query`;

  const requestBody: any = { query };
  if (timespan) requestBody.timespan = timespan;

  const response = await axios.post(url, requestBody, {
    headers,
    timeout: 30000
  });

  return response.data;
}
```

## Service Integration

**File:** [src/index.ts](../../src/index.ts)

### Configuration Parsing

```typescript
const LOGANALYTICS_CONFIG: LogAnalyticsConfig = {
  resources: [], // Parsed from JSON
  authMethod: (process.env.LOGANALYTICS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
  tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
  clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
  clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
};

// Parse multi-workspace configuration
if (process.env.LOGANALYTICS_RESOURCES) {
  LOGANALYTICS_CONFIG.resources = JSON.parse(process.env.LOGANALYTICS_RESOURCES);
}
// Fallback to single-workspace configuration
else if (process.env.LOGANALYTICS_WORKSPACE_ID) {
  LOGANALYTICS_CONFIG.resources = [{
    id: 'default',
    name: 'Default Workspace',
    workspaceId: process.env.LOGANALYTICS_WORKSPACE_ID,
    active: true,
    apiKey: process.env.LOGANALYTICS_API_KEY
  }];
}
```

### Lazy Initialization Pattern

```typescript
let logAnalyticsService: LogAnalyticsService | null = null;

function getLogAnalyticsService(): LogAnalyticsService {
  if (!logAnalyticsService) {
    // Validate required configuration
    const missingConfig: string[] = [];
    if (LOGANALYTICS_CONFIG.resources.length === 0) {
      missingConfig.push("LOGANALYTICS_RESOURCES or LOGANALYTICS_WORKSPACE_ID");
    }
    // ... more validation

    if (missingConfig.length > 0) {
      throw new Error(`Missing required Log Analytics configuration: ${missingConfig.join(", ")}`);
    }

    logAnalyticsService = new LogAnalyticsService(LOGANALYTICS_CONFIG);
    console.error("Log Analytics Workspace service initialized");
  }
  return logAnalyticsService;
}
```

## Formatting Utilities

**File:** [src/utils/loganalytics-formatters.ts](../../src/utils/loganalytics-formatters.ts)

The Log Analytics formatters transform raw query results into human-readable analysis:

### Key Formatters
- `formatTableAsMarkdown()` - Convert query results to markdown tables
- `formatTableAsCSV()` - Convert results to CSV format
- `analyzeLogs()` - Generic log analysis with severity distribution
- `analyzeFunctionLogs()` - Azure Function-specific log analysis
- `analyzeFunctionErrors()` - Error pattern detection and exception analysis
- `analyzeFunctionStats()` - Statistics analysis with success rates
- `generateRecommendations()` - AI-driven recommendations based on analysis
- `sanitizeErrorMessage()` - Security sanitization (removes credentials)
- `parseTimespan()` - ISO 8601 duration validation
- `getTimespanPresets()` - Common timespan presets

### Example Analysis Output

```typescript
analyzeFunctionLogs(logsTable) => {
  insights: [
    "- Total function log entries: 125",
    "- Unique functions: 3",
    "- Error count: 8",
    "- Success rate: 93.6%",
    "- Severity distribution:",
    "  - Information: 80",
    "  - Warning: 12",
    "  - Error: 8"
  ]
}

generateRecommendations({ errorCount: 8, successRate: 93.6 }) => [
  "⚠️ Success rate below 95% - consider implementing retry logic",
  "🔍 Investigate error patterns to identify root causes"
]
```

## Log Analytics Tables

When configuring Log Analytics for Azure Functions, users typically query these tables:

| Table | Description | Common Queries |
|-------|-------------|----------------|
| `FunctionAppLogs` | Azure Function execution logs | Error analysis, troubleshooting |
| `requests` | Incoming HTTP requests | HTTP-triggered function monitoring |
| `dependencies` | Outbound calls (APIs, DBs) | External dependency failures |
| `traces` | Diagnostic traces | Debug output |
| `exceptions` | Application exceptions | Exception troubleshooting |
| `customEvents` | Custom events | Feature usage tracking |

## Use Cases

### Azure Functions Troubleshooting
- Recent error analysis by function
- Exception pattern detection
- Function execution statistics
- Performance monitoring

### KQL Query Execution
- Custom queries against any table
- Multi-table joins and aggregations
- Trend analysis over time

### Cross-Service Correlation
- Correlate Application Insights telemetry with Log Analytics logs
- Combine function logs with dependency failures
- Timeline analysis across multiple data sources

### Security Monitoring
- Authentication failure detection
- Suspicious pattern identification
- Security event analysis
- Compliance reporting

## Error Handling

The service implements comprehensive error handling:

### Authentication Errors (401/403)
- Clear messages about missing credentials
- Permission requirements (Log Analytics Reader role)
- Configuration validation
- Shared credential fallback

### Rate Limiting (429)
- Retry-after header parsing
- Clear messages about current limits
- Recommendations for auth method upgrade (API key → Entra ID)

### Query Errors
- KQL syntax error detection with hints
- Semantic error detection (invalid columns/tables)
- Timeout handling (30-second default)
- Network error detection
- Suggestions to use `loganalytics-get-metadata` for schema discovery

### Workspace Errors
- Workspace not found with available workspaces list
- Inactive workspace detection with activation instructions
- Configuration validation
- Workspace ID format validation (GUID)

## Security Considerations

### Credential Management
- Never log credentials or tokens
- Store tokens in memory only (never persist)
- Clear tokens on service disposal
- Support for `.env` files for local development
- Shared credential pattern with Application Insights

### Query Safety
- Read-only operations only (no write/update/delete)
- Query size limits (max 10KB recommended)
- Result size limits (max 10,000 rows per query)
- No dangerous KQL keywords allowed (invoke, execute, evaluate)
- Validation before execution

### Data Sanitization
- Sanitize error messages (remove connection strings, API keys, workspace IDs)
- Redact sensitive data in query results (optional)
- Truncate large results automatically

### RBAC and Permissions

**For Entra ID authentication**, the service principal must have:
- "Log Analytics Reader" or "Reader" role on Log Analytics workspace
- Role can be assigned at workspace or resource group level

**For API Key authentication (deprecated)**:
- API key must have "Read" permission
- Keys can be scoped to specific workspaces

## Query Optimization

### Timespan Conversion

The service automatically converts ISO 8601 durations to KQL format:
```typescript
convertTimespanToKQL('PT1H') // → '1h'
convertTimespanToKQL('P1D')  // → '1d'
convertTimespanToKQL('PT30M') // → '30m'
```

### Common Timespan Presets
- `PT15M` → 15 minutes
- `PT1H` → 1 hour
- `PT12H` → 12 hours
- `P1D` → 1 day
- `P7D` → 7 days
- `P30D` → 30 days

### Query Best Practices
- Use `summarize` and `top` operators to limit result sizes
- Set reasonable time ranges
- Cache metadata queries
- Use `take` to limit row counts
- Use `where` clauses early in query pipeline
- Avoid `select *` - specify needed columns

### FunctionAppLogs Table Schema

```kql
FunctionAppLogs
| getschema

// Common columns:
TimeGenerated: datetime
FunctionName: string
Message: string
SeverityLevel: int  // 0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical
ExceptionDetails: string
HostInstanceId: string
```

## Design Patterns

### Lazy Initialization
- Service initialized on first tool/prompt invocation
- Validates configuration before initialization
- Caches access tokens with automatic refresh

### Shared Credentials
- Automatic fallback from LOGANALYTICS_* to APPINSIGHTS_* environment variables
- Single app registration supports both integrations
- Reduces configuration complexity

### Multi-Workspace Support
- JSON array configuration with active/inactive flags
- Quick toggle without removing configuration
- Resource-based query routing

### Helper Methods

All helper methods wrap KQL queries:
- `getFunctionLogs()` → `FunctionAppLogs | where ...`
- `getFunctionErrors()` → `FunctionAppLogs | where ExceptionDetails != ""`
- `getFunctionStats()` → `FunctionAppLogs | summarize ...`
- `searchLogs()` → `* | where * contains "text"`

### Audit Logging

All queries are logged with execution time:
```typescript
auditLogger.log({
  operation: 'execute-query',
  operationType: 'READ',
  resourceId: resource.id,
  componentType: 'Query',
  success: true,
  parameters: { query: query.substring(0, 500), timespan },
  executionTimeMs: timer()
});
```

---

**Related Documentation:**
- [User Guide: Log Analytics](../documentation/LOG_ANALYTICS.md)
- [Technical: Application Insights](./APPLICATION_INSIGHTS_TECHNICAL.md)
- [Main Documentation: CLAUDE.md](../../CLAUDE.md)
