# Azure Log Analytics Workspace Integration Documentation

**📦 Package:** `@mcp-consultant-tools/log-analytics`
**🔒 Security:** Production-safe (read-only access to log data)

Complete guide to using the Azure Log Analytics Workspace integration with MCP Consultant Tools.

---

## ⚡ Quick Start

### MCP Client Configuration

Get started quickly with this minimal configuration. Just replace the placeholder values with your actual credentials:

#### For VS Code

Add this to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "log-analytics": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/log-analytics", "mcp-loganalytics"],
      "env": {
        // Required (choose ONE option)
        // Option 1: Single workspace
        "LOGANALYTICS_WORKSPACE_ID": "your-workspace-id",
        // Option 2: Multiple workspaces (JSON array)
        // "LOGANALYTICS_RESOURCES": "[{\"id\":\"prod\",\"workspaceId\":\"xxx\",\"name\":\"Production\"}]",

        // Required for Entra ID auth (can reuse App Insights credentials)
        "LOGANALYTICS_TENANT_ID": "your-tenant-id",
        "LOGANALYTICS_CLIENT_ID": "your-client-id",
        "LOGANALYTICS_CLIENT_SECRET": "your-client-secret",

        // Optional (defaults shown)
        "LOGANALYTICS_AUTH_METHOD": "entra-id"
      }
    }
  }
}
```

**Note:** If you already have Application Insights configured, Log Analytics can automatically reuse those credentials (`APPINSIGHTS_TENANT_ID`, `APPINSIGHTS_CLIENT_ID`, `APPINSIGHTS_CLIENT_SECRET`).

#### For Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "log-analytics": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/log-analytics", "mcp-loganalytics"],
      "env": {
        // Required (choose ONE option)
        // Option 1: Single workspace
        "LOGANALYTICS_WORKSPACE_ID": "your-workspace-id",
        // Option 2: Multiple workspaces (JSON array)
        // "LOGANALYTICS_RESOURCES": "[{\"id\":\"prod\",\"workspaceId\":\"xxx\",\"name\":\"Production\"}]",

        // Required for Entra ID auth (can reuse App Insights credentials)
        "LOGANALYTICS_TENANT_ID": "your-tenant-id",
        "LOGANALYTICS_CLIENT_ID": "your-client-id",
        "LOGANALYTICS_CLIENT_SECRET": "your-client-secret",

        // Optional (defaults shown)
        "LOGANALYTICS_AUTH_METHOD": "entra-id"
      }
    }
  }
}
```

#### Test Your Setup

After configuring, test the connection by listing available workspaces:

```javascript
// Ask Claude: "What Log Analytics workspaces are available?"
// Or use the workspace summary prompt:
await mcpClient.invoke("loganalytics-workspace-summary", {
  workspaceId: "your-workspace-id",
  timespan: "PT1H"
});
```

**Need credentials?** See the [Detailed Setup](#detailed-setup) section below for Azure AD service principal creation and role assignment instructions.

---

## 🎯 Key Features for Consultants

### Automated Workflows (Prompts)

This package includes **5 pre-built prompts** that generate formatted, human-readable reports from Log Analytics data. These prompts are designed for consultants and first responders who need quick insights without writing KQL queries.

#### Azure Functions & App Services Analysis Prompts

1. 🔥 **`loganalytics-function-troubleshooting`** - **MOST VALUABLE** - Analyzes Azure Function executions, failures, and performance with comprehensive error analysis and recommendations
   - Example: `"Troubleshoot the ProcessOrders function"`
   - Includes: Execution summary, error patterns, failure analysis, performance metrics, actionable recommendations

2. **`loganalytics-workspace-summary`** - Comprehensive workspace health summary with function statistics and top errors
   - Example: `"Generate a health summary for the production workspace"`
   - Includes: Workspace overview, function execution stats, error frequency analysis

3. **`loganalytics-function-performance-report`** - Performance analysis with execution duration trends and optimization recommendations
   - Example: `"Analyze performance of all functions in the last 6 hours"`
   - Includes: Execution statistics, duration analysis, success rates, optimization tips

4. **`loganalytics-security-analysis`** - Security analysis report with authentication events and suspicious activity detection
   - Example: `"Check for security issues in the last 24 hours"`
   - Includes: Authentication failures, suspicious patterns, security recommendations

5. **`loganalytics-logs-report`** - Formatted logs report for any table with insights and patterns
   - Example: `"Show me recent events from FunctionAppLogs"`
   - Includes: Log entries, pattern analysis, severity distribution

### Log Query Tools

Beyond prompts, this package provides **9 specialized tools** for querying log data:

- **`loganalytics-list-workspaces`** - List all configured Log Analytics workspaces
- **`loganalytics-get-metadata`** - Get schema metadata (tables and columns)
- **`loganalytics-execute-query`** - Execute custom KQL queries
- **`loganalytics-get-function-logs`** - Get logs for specific Azure Functions with severity filtering
- **`loganalytics-get-function-errors`** - Get error logs with exception details
- **`loganalytics-get-function-stats`** - Get execution statistics with success/failure rates
- **`loganalytics-get-function-invocations`** - Get function invocation history
- **`loganalytics-get-recent-events`** - Get recent events from any table
- **`loganalytics-search-logs`** - Search logs across tables or within specific tables

---

## Table of Contents

1. [Overview](#overview)
   - [What is Azure Log Analytics?](#what-is-azure-log-analytics)
   - [Why Use This Integration?](#why-use-this-integration)
   - [Key Features](#key-features)
2. [Detailed Setup](#detailed-setup)
   - [Prerequisites](#prerequisites)
   - [Authentication Methods](#authentication-methods)
   - [Entra ID (OAuth 2.0) Setup](#entra-id-oauth-20-setup)
   - [Environment Variables](#environment-variables)
3. [Tools](#tools)
   - [loganalytics-list-workspaces](#loganalytics-list-workspaces)
   - [loganalytics-get-metadata](#loganalytics-get-metadata)
   - [loganalytics-execute-query](#loganalytics-execute-query)
   - [loganalytics-get-function-logs](#loganalytics-get-function-logs)
   - [loganalytics-get-function-errors](#loganalytics-get-function-errors)
   - [loganalytics-get-function-stats](#loganalytics-get-function-stats)
   - [loganalytics-get-function-invocations](#loganalytics-get-function-invocations)
   - [loganalytics-get-recent-events](#loganalytics-get-recent-events)
   - [loganalytics-search-logs](#loganalytics-search-logs)
4. [Prompts](#prompts)
   - [loganalytics-workspace-summary](#loganalytics-workspace-summary)
   - [loganalytics-function-troubleshooting](#loganalytics-function-troubleshooting)
   - [loganalytics-function-performance-report](#loganalytics-function-performance-report)
   - [loganalytics-security-analysis](#loganalytics-security-analysis)
   - [loganalytics-logs-report](#loganalytics-logs-report)
5. [Usage Examples](#usage-examples)
   - [Example 1: Investigating Azure Function Failures](#example-1-investigating-azure-function-failures)
   - [Example 2: Performance Analysis](#example-2-performance-analysis)
   - [Example 3: Security Audit](#example-3-security-audit)
   - [Example 4: Cross-Table Log Correlation](#example-4-cross-table-log-correlation)
   - [Example 5: Custom KQL Queries](#example-5-custom-kql-queries)
6. [Best Practices](#best-practices)
   - [Security](#security)
   - [Performance](#performance)
   - [Multi-Workspace Management](#multi-workspace-management)
7. [Troubleshooting](#troubleshooting)
   - [Common Errors](#common-errors)
   - [Query Errors](#query-errors)
   - [Rate Limiting](#rate-limiting)

---

## Overview

### What is Azure Log Analytics?

Azure Log Analytics is a log aggregation and analysis service that provides:
- **Centralized log management** for Azure Functions, App Services, VMs, and other resources
- **KQL-powered querying** with powerful Kusto Query Language
- **Azure Functions diagnostics** with FunctionAppLogs table
- **Cross-service correlation** with requests, dependencies, traces, exceptions tables
- **Custom log collection** from applications and infrastructure
- **Security monitoring** and compliance auditing

**Primary Use Case**: Troubleshoot Azure Functions and App Services using powerful KQL queries against centralized logs.

### Why Use This Integration?

The Log Analytics integration enables AI assistants to:
1. **Troubleshoot Azure Functions**: Query function logs, errors, and execution statistics
2. **Analyze Performance**: Identify slow functions and execution patterns
3. **Monitor Security**: Track authentication failures and suspicious activity
4. **Generate Incident Reports**: Auto-generate comprehensive troubleshooting guides
5. **Cross-Service Correlation**: Correlate logs across multiple tables and resources
6. **Custom Analysis**: Execute KQL queries for advanced investigations

**Primary Use Case**: Rapid troubleshooting of Azure Function failures and performance issues by analyzing execution logs and error patterns.

### Key Features

**Azure Functions Specialization:**
- Get function logs with severity filtering
- Get function errors with exception details
- Get function execution statistics (success rate, error count)
- Get function invocation history
- Search across all function logs

**Comprehensive Table Access:**
- `FunctionAppLogs` - Azure Function execution logs
- `requests` - HTTP requests (for HTTP-triggered functions)
- `traces` - Diagnostic traces
- `exceptions` - Application exceptions
- `dependencies` - External calls (APIs, databases)
- `customEvents` - Custom application events

**Multi-Workspace Support:**
- Query multiple Log Analytics workspaces
- Active/inactive flags for quick resource toggles
- Centralized configuration with JSON arrays

**Shared Credentials:**
- Automatic fallback to Application Insights credentials
- Single Azure AD app registration for both services
- Reduced configuration complexity

**Two Authentication Methods:**
- **Entra ID (OAuth 2.0)**: Higher rate limits, better security (recommended)
- **API Key**: Simpler setup, lower limits (deprecated)

---

## Detailed Setup

### Prerequisites

1. **Azure subscription** with Log Analytics workspace
2. **Log Analytics Reader role** (for Entra ID auth) or API key access
3. **Workspace ID** (from Azure Portal → Log Analytics workspaces → Properties)
4. For Entra ID auth: Service principal with client ID, client secret, tenant ID
5. For API Key auth: Generated API key (deprecated)

### Authentication Methods

**Entra ID (OAuth 2.0) - Recommended**
- ✅ Higher rate limits (60 requests/minute per user)
- ✅ No daily cap
- ✅ Better security (token-based, automatic expiry)
- ✅ Can share credentials with Application Insights
- ❌ More complex setup

**API Key Authentication - Deprecated**
- ⚠️ Deprecated by Microsoft - use Entra ID for new implementations
- ✅ Simple setup
- ❌ Lower rate limits (15 requests/minute)
- ❌ Daily cap (1,500 requests per day)

### Entra ID (OAuth 2.0) Setup

#### Option 1: Create New Service Principal

```bash
# Create service principal
az ad sp create-for-rbac --name "MCP-Consultant-Tools-LogAnalytics" --skip-assignment
```

#### Option 2: Reuse Application Insights Service Principal

**If you already have Application Insights configured**, you can reuse the same service principal credentials.

#### Assign Log Analytics Reader Role

```bash
# Get workspace resource ID
az monitor log-analytics workspace show \
  --workspace-name YourWorkspaceName \
  --resource-group YourResourceGroup \
  --query id --output tsv

# Assign role
az role assignment create \
  --assignee YOUR_SERVICE_PRINCIPAL_CLIENT_ID \
  --role "Log Analytics Reader" \
  --scope "/subscriptions/SUB_ID/resourceGroups/RG_NAME/providers/Microsoft.OperationalInsights/workspaces/WORKSPACE_NAME"
```

#### Configure Environment Variables

```bash
# Option 1: Log Analytics-specific credentials
export LOGANALYTICS_AUTH_METHOD="entra-id"
export LOGANALYTICS_TENANT_ID="your-tenant-id"
export LOGANALYTICS_CLIENT_ID="your-service-principal-client-id"
export LOGANALYTICS_CLIENT_SECRET="your-service-principal-secret"
export LOGANALYTICS_RESOURCES='[
  {
    "id": "prod-functions",
    "name": "Production Functions",
    "workspaceId": "12345678-1234-1234-1234-123456789abc",
    "active": true,
    "description": "Production Azure Functions logs"
  }
]'

# Option 2: Shared credentials (reuse Application Insights credentials)
export APPINSIGHTS_TENANT_ID="your-tenant-id"
export APPINSIGHTS_CLIENT_ID="your-service-principal-client-id"
export APPINSIGHTS_CLIENT_SECRET="your-service-principal-secret"
export LOGANALYTICS_RESOURCES='[{"id":"prod-functions","name":"Production Functions","workspaceId":"workspace-id","active":true}]'
# Log Analytics will automatically use APPINSIGHTS_* credentials
```

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `LOGANALYTICS_AUTH_METHOD` | No | Authentication method ("entra-id" or "api-key") | "entra-id" |
| `LOGANALYTICS_TENANT_ID` | Yes (Entra ID) | Azure tenant ID (or uses APPINSIGHTS_TENANT_ID) | - |
| `LOGANALYTICS_CLIENT_ID` | Yes (Entra ID) | Service principal client ID (or uses APPINSIGHTS_CLIENT_ID) | - |
| `LOGANALYTICS_CLIENT_SECRET` | Yes (Entra ID) | Service principal client secret (or uses APPINSIGHTS_CLIENT_SECRET) | - |
| `LOGANALYTICS_RESOURCES` | Yes | JSON array of Log Analytics workspaces | - |
| `LOGANALYTICS_WORKSPACE_ID` | Yes (single-workspace fallback) | Workspace ID (GUID) | - |

---

## Tools

### loganalytics-list-workspaces

List all configured Log Analytics workspaces (active and inactive).

**Parameters:** None

**Returns:**
```typescript
{
  workspaces: Array<{
    id: string;
    name: string;
    workspaceId: string;
    active: boolean;
    description?: string;
  }>;
}
```

**Use Cases:** Discover available workspaces, verify configuration, check active/inactive status

---

### loganalytics-get-metadata

Get schema metadata (tables and columns) for a Log Analytics workspace.

**Parameters:**
- `workspaceId` (required): Workspace identifier from configuration

**Returns:** Table and column schema information

**Use Cases:** Discover available tables, explore table schemas, validate column names for KQL queries

---

### loganalytics-execute-query

Execute custom KQL query against a Log Analytics workspace.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `query` (required): KQL query string
- `timespan` (optional): ISO 8601 duration (e.g., "PT1H", "P1D", "PT12H")

**Timespan Format:**
- `PT15M` - 15 minutes
- `PT1H` - 1 hour
- `PT12H` - 12 hours
- `P1D` - 1 day
- `P7D` - 7 days

**Example:**
```typescript
{
  "workspaceId": "prod-functions",
  "query": "FunctionAppLogs | where FunctionName == 'ProcessOrders' | where SeverityLevel >= 3 | order by TimeGenerated desc | take 10",
  "timespan": "PT24H"
}
```

**Use Cases:** Custom KQL queries, complex log analysis, custom aggregations

---

### loganalytics-get-function-logs

Get logs for a specific Azure Function with optional filtering.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (optional): Filter by function name
- `timespan` (optional): ISO 8601 duration (default: "PT1H")
- `severityLevel` (optional): Minimum severity (0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical)
- `limit` (optional): Maximum records to return (default: 100)

**Example:**
```typescript
// Get error and critical logs for ProcessOrders function
{
  "workspaceId": "prod-functions",
  "functionName": "ProcessOrders",
  "timespan": "PT12H",
  "severityLevel": 3,
  "limit": 50
}
```

**Use Cases:** View function execution logs, filter by severity level, debug function issues

---

### loganalytics-get-function-errors

Get error logs for Azure Functions (ExceptionDetails present).

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (optional): Filter by function name
- `timespan` (optional): ISO 8601 duration (default: "PT1H")
- `limit` (optional): Maximum records to return (default: 100)

**Use Cases:** Troubleshoot function failures, analyze exception patterns, review stack traces

---

### loganalytics-get-function-stats

Get execution statistics for Azure Functions.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (optional): Filter by function name (if omitted, returns stats for all functions)
- `timespan` (optional): ISO 8601 duration (default: "PT1H")

**Returns:** Statistics with execution count, error count, success rate

**Example Response:**
```json
{
  "tables": [
    {
      "columns": [
        { "name": "FunctionName", "type": "string" },
        { "name": "TotalExecutions", "type": "long" },
        { "name": "ErrorCount", "type": "long" },
        { "name": "SuccessCount", "type": "long" },
        { "name": "SuccessRate", "type": "real" }
      ],
      "rows": [
        ["ProcessOrders", 1250, 15, 1235, 98.8],
        ["SendNotifications", 3420, 2, 3418, 99.94],
        ["GenerateReports", 180, 45, 135, 75.0]
      ]
    }
  ]
}
```

**Use Cases:** Monitor function health, track success/failure rates, identify problematic functions

---

### loganalytics-get-function-invocations

Get Azure Function invocation records from requests and traces tables.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (optional): Filter by function name
- `timespan` (optional): ISO 8601 duration (default: "PT1H")
- `limit` (optional): Maximum records to return (default: 100)

**Use Cases:** Track function execution history, monitor HTTP-triggered functions, analyze invocation patterns

---

### loganalytics-get-recent-events

Get recent events from any Log Analytics table (generic log retrieval).

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `tableName` (required): Table name (e.g., "FunctionAppLogs", "requests", "traces")
- `timespan` (optional): ISO 8601 duration (default: "PT1H")
- `limit` (optional): Maximum records to return (default: 100)

**Use Cases:** Explore any table in workspace, recent event monitoring, custom table queries

---

### loganalytics-search-logs

Search logs across tables or within a specific table (cross-table search).

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `searchText` (required): Text to search for
- `tableName` (optional): Specific table to search (default: all tables using "*")
- `timespan` (optional): ISO 8601 duration (default: "PT1H")
- `limit` (optional): Maximum records to return (default: 100)

**Example:**
```typescript
// Search for "timeout" across all tables
{
  "workspaceId": "prod-functions",
  "searchText": "timeout",
  "timespan": "PT24H"
}

// Search within specific table
{
  "workspaceId": "prod-functions",
  "searchText": "connection refused",
  "tableName": "FunctionAppLogs",
  "timespan": "PT6H"
}
```

**Use Cases:** Search for error messages, find specific events, cross-table log correlation

---

## Prompts

### loganalytics-workspace-summary

Generate comprehensive workspace health summary.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `timespan` (optional): Time range (default: PT1H)

**Returns:** Markdown report with workspace health overview, function statistics, top errors, recommendations

---

### loganalytics-function-troubleshooting

Generate comprehensive troubleshooting report for a specific function.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (required): Function name
- `timespan` (optional): Time range (default: PT1H)

**Returns:** Markdown report with execution summary, error patterns, recommendations

---

### loganalytics-function-performance-report

Generate performance analysis report.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `functionName` (optional): Filter by function name
- `timespan` (optional): Time range (default: PT1H)

**Returns:** Markdown report with performance insights and optimization recommendations

---

### loganalytics-security-analysis

Generate security analysis report.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `timespan` (optional): Time range (default: PT24H)

**Returns:** Markdown report with authentication events, suspicious activity detection, recommendations

---

### loganalytics-logs-report

Generate formatted logs report for any table.

**Parameters:**
- `workspaceId` (required): Workspace identifier
- `tableName` (required): Table name
- `timespan` (optional): Time range (default: PT1H)
- `limit` (optional): Maximum records (default: 100)

**Returns:** Markdown-formatted report with log entries and insights

---

## Usage Examples

### Example 1: Investigating Azure Function Failures

**Scenario:** Critical Azure Function starts failing, need quick diagnosis.

```javascript
// Get recent errors for the ProcessOrders function
await mcpClient.invoke("loganalytics-get-function-errors", {
  workspaceId: "prod-functions",
  functionName: "ProcessOrders",
  timespan: "PT6H",
  limit: 20
});
```

**AI Analysis:**
"Found 15 errors in last 6 hours. 80% are database timeouts (System.TimeoutException), 20% are HTTP request timeouts. Errors started 3 hours ago. All errors from same database server. Recommend checking database connection pool exhaustion."

---

### Example 2: Performance Analysis

**Scenario:** Identify slow functions and optimization opportunities.

```javascript
// Get execution statistics for all functions
await mcpClient.invoke("loganalytics-get-function-stats", {
  workspaceId: "prod-functions",
  timespan: "PT24H"
});
```

**AI Analysis:**
"GenerateReports has 75% success rate (needs attention) with 45 errors out of 180 executions. Most errors: 'Memory limit exceeded'. Average execution time: 45 seconds. Recommend implementing pagination, adding caching, and increasing memory allocation to 2GB."

---

### Example 3: Security Audit

**Scenario:** Monitor for security issues and authentication failures.

```javascript
// Generate security analysis report
await mcpClient.invoke("loganalytics-security-analysis", {
  workspaceId: "prod-functions",
  timespan: "PT24H"
});
```

**AI Analysis:**
"Detected 15 failed auth attempts from IP 203.0.113.42 within 5-minute window using invalid API keys. Potential brute force attack. Recommend blocking IP, rotating compromised API keys, enabling rate limiting (max 5 attempts per minute), and setting up alerts for similar patterns."

---

### Example 4: Cross-Table Log Correlation

**Scenario:** Search across multiple tables to correlate events.

```javascript
// Search for "timeout" errors across all tables
await mcpClient.invoke("loganalytics-search-logs", {
  workspaceId: "prod-functions",
  searchText: "timeout",
  timespan: "PT12H",
  limit: 100
});
```

**AI Analysis:**
"Found 25 timeout events across 3 tables: FunctionAppLogs (15), requests (8), dependencies (2). All timeouts occurred between 10:00-11:00 UTC when external API (api.example.com) was down. Recommend implementing circuit breaker pattern."

---

### Example 5: Custom KQL Queries

**Scenario:** Advanced analysis with custom KQL.

```javascript
// Find functions with declining success rates
await mcpClient.invoke("loganalytics-execute-query", {
  workspaceId: "prod-functions",
  query: `
    FunctionAppLogs
    | where TimeGenerated > ago(7d)
    | summarize
        TotalExecutions = count(),
        ErrorCount = countif(ExceptionDetails != ""),
        SuccessRate = round(100.0 * countif(ExceptionDetails == "") / count(), 2)
      by FunctionName, bin(TimeGenerated, 1d)
    | order by TimeGenerated desc, SuccessRate asc
  `,
  "timespan": "P7D"
});
```

**AI Analysis:**
"ProcessOrders success rate declined from 99.5% (Day 1-3) to 97.2% (Day 4-7). New deployment on day 4 introduced bug. GenerateReports has consistently low 75% success rate and needs immediate optimization."

---

## Best Practices

### Security

**Credential Management:**
- ✅ Use Entra ID (OAuth) for production, not API keys
- ✅ Share credentials with Application Insights (single service principal)
- ✅ Assign minimal required roles (Log Analytics Reader)
- ✅ Store credentials in environment variables, never in code
- ❌ Never commit credentials to version control

**Access Control:**
- Use Azure RBAC to control workspace access
- Separate service principals for dev/prod environments
- Review role assignments periodically

### Performance

**Rate Limits:**
- **Entra ID Auth**: 60 requests/minute per user (recommended)
- **API Key Auth**: 15 requests/minute, 1500 requests/day (deprecated)
- Implement exponential backoff for retries
- Cache query results when appropriate

**Query Optimization:**
- Use shortest timespan needed
- Use `limit` parameter to cap result sizes
- Use KQL `where` clauses early in query pipeline
- Use `summarize` for aggregation, not returning all rows

### Multi-Workspace Management

**Resource Organization:**
- Use descriptive workspace IDs: `"prod-functions"`, `"staging-functions"`
- Use active/inactive flags for quick toggles
- Document each workspace with `description` field

**Shared Credentials:**
- Use same service principal for Application Insights and Log Analytics
- Configure once with `APPINSIGHTS_*` credentials
- Log Analytics automatically falls back to Application Insights credentials

---

## Troubleshooting

### Common Errors

#### Error: "Missing required Log Analytics configuration"

**Cause:** Missing environment variables.

**Solution:**
1. Check that `LOGANALYTICS_RESOURCES` or `LOGANALYTICS_WORKSPACE_ID` is set
2. For Entra ID: Verify tenant ID, client ID, client secret (or fallback to APPINSIGHTS_* credentials)
3. Verify no typos in variable names (case-sensitive)

---

#### Error: "Workspace not found"

**Cause:** Invalid workspace ID or inactive workspace.

**Solution:**
1. List available workspaces: `loganalytics-list-workspaces`
2. Verify workspace ID is a GUID (not workspace name)
3. Check if workspace is active (`active: true`)
4. Get workspace ID from Azure Portal → Log Analytics workspaces → Properties → Workspace ID

---

#### Error: "401 Unauthorized"

**Cause:** Invalid credentials or missing permissions.

**Solution for Entra ID:**
1. Verify service principal credentials are correct
2. Check that service principal has "Log Analytics Reader" role on workspace
3. Verify tenant ID matches your Azure AD tenant
4. Check if client secret has expired (regenerate if needed)

**Role Assignment Verification:**
```bash
az role assignment list \
  --assignee YOUR_SERVICE_PRINCIPAL_CLIENT_ID \
  --resource-group YOUR_RESOURCE_GROUP
```

---

#### Error: "403 Forbidden"

**Cause:** Insufficient permissions on Log Analytics workspace.

**Solution:**
1. Verify service principal has "Log Analytics Reader" or "Reader" role
2. Assign role at workspace, resource group, or subscription level
3. Check if Conditional Access policies are blocking access

**Assign Log Analytics Reader Role:**
```bash
az role assignment create \
  --assignee YOUR_SERVICE_PRINCIPAL_CLIENT_ID \
  --role "Log Analytics Reader" \
  --scope "/subscriptions/SUB_ID/resourceGroups/RG_NAME/providers/Microsoft.OperationalInsights/workspaces/WORKSPACE_NAME"
```

---

### Query Errors

#### Error: "Syntax error in KQL query"

**Cause:** Invalid KQL syntax.

**Solution:**
1. Test query in Azure Portal → Log Analytics workspaces → Logs
2. Verify table names are correct (use `loganalytics-get-metadata`)
3. Check column names match schema

**Common KQL Mistakes:**
```kql
// ❌ WRONG: Missing pipe operator
FunctionAppLogs where TimeGenerated > ago(1h)

// ✅ CORRECT: Pipe operator required
FunctionAppLogs | where TimeGenerated > ago(1h)
```

---

#### Error: "Query timeout"

**Cause:** Query is too slow or returning too much data.

**Solution:**
1. Reduce timespan (e.g., `PT1H` instead of `P7D`)
2. Add `take` operator to limit rows: `| take 1000`
3. Use `where` clauses early in query
4. Use `summarize` for aggregation instead of returning all rows

---

### Rate Limiting

#### Error: "429 Too Many Requests"

**Cause:** Exceeded Log Analytics API rate limits.

**Solution:**
1. **Upgrade to Entra ID** if using API key (60 req/min vs 15 req/min)
2. Implement exponential backoff
3. Check `Retry-After` header in response
4. Cache frequently accessed data
5. Reduce query frequency

---

**For additional help:**
- Azure Log Analytics Documentation: https://docs.microsoft.com/azure/azure-monitor/logs/log-analytics-overview
- KQL Query Language Reference: https://docs.microsoft.com/azure/data-explorer/kusto/query/
- GitHub Issues: https://github.com/anthropics/mcp-consultant-tools/issues

---
