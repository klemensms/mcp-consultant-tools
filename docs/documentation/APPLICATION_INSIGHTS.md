# Azure Application Insights Integration Documentation

Complete guide to using the Azure Application Insights integration with MCP Consultant Tools.

---

## Table of Contents

1. [Overview](#overview)
   - [What is Azure Application Insights?](#what-is-azure-application-insights)
   - [Why Use This Integration?](#why-use-this-integration)
   - [Key Features](#key-features)
2. [Setup](#setup)
   - [Prerequisites](#prerequisites)
   - [Authentication Methods](#authentication-methods)
   - [Entra ID (OAuth 2.0) Authentication](#entra-id-oauth-20-authentication)
   - [API Key Authentication](#api-key-authentication)
   - [Environment Variables](#environment-variables)
   - [Configuration Examples](#configuration-examples)
3. [Tools](#tools)
   - [appinsights-list-resources](#appinsights-list-resources)
   - [appinsights-get-metadata](#appinsights-get-metadata)
   - [appinsights-execute-query](#appinsights-execute-query)
   - [appinsights-get-exceptions](#appinsights-get-exceptions)
   - [appinsights-get-slow-requests](#appinsights-get-slow-requests)
   - [appinsights-get-operation-performance](#appinsights-get-operation-performance)
   - [appinsights-get-failed-dependencies](#appinsights-get-failed-dependencies)
   - [appinsights-get-traces](#appinsights-get-traces)
   - [appinsights-get-availability](#appinsights-get-availability)
   - [appinsights-get-custom-events](#appinsights-get-custom-events)
4. [Prompts](#prompts)
   - [appinsights-exception-summary](#appinsights-exception-summary)
   - [appinsights-performance-report](#appinsights-performance-report)
   - [appinsights-dependency-health](#appinsights-dependency-health)
   - [appinsights-availability-report](#appinsights-availability-report)
   - [appinsights-troubleshooting-guide](#appinsights-troubleshooting-guide)
5. [Usage Examples](#usage-examples)
   - [Example 1: Troubleshoot Production Exceptions](#example-1-troubleshoot-production-exceptions)
   - [Example 2: Performance Analysis](#example-2-performance-analysis)
   - [Example 3: Monitor External Dependencies](#example-3-monitor-external-dependencies)
   - [Example 4: SLA Monitoring with Availability Tests](#example-4-sla-monitoring-with-availability-tests)
   - [Example 5: Execute Custom KQL Queries](#example-5-execute-custom-kql-queries)
   - [Example 6: First-Responder Incident Guide](#example-6-first-responder-incident-guide)
   - [Example 7: List and Select Resources](#example-7-list-and-select-resources)
   - [Example 8: Get Schema and Available Tables](#example-8-get-schema-and-available-tables)
6. [Best Practices](#best-practices)
   - [Security](#security)
   - [Performance](#performance)
   - [Query Optimization](#query-optimization)
   - [Multi-Resource Management](#multi-resource-management)
7. [Troubleshooting](#troubleshooting)
   - [Common Errors](#common-errors)
   - [Authentication Issues](#authentication-issues)
   - [Query Errors](#query-errors)
   - [Rate Limiting](#rate-limiting)

---

## Overview

### What is Azure Application Insights?

Azure Application Insights is an Application Performance Management (APM) service that provides:
- **Real-time telemetry monitoring** for web applications and services
- **Exception tracking and diagnostics** for production issues
- **Performance monitoring** with request duration and throughput metrics
- **Dependency tracking** for external APIs, databases, and Azure services
- **Custom event and metric tracking** for business KPIs
- **Availability monitoring** with uptime tests from multiple locations
- **Log analytics** with powerful KQL (Kusto Query Language) queries

**Telemetry Data Tables:**
- `requests` - Incoming HTTP requests
- `dependencies` - Outbound calls (APIs, databases, etc.)
- `exceptions` - Application exceptions with stack traces
- `traces` - Diagnostic logs and traces
- `customEvents` - Custom application events
- `customMetrics` - Custom metrics and counters
- `pageViews` - Client-side page views
- `browserTimings` - Client-side performance
- `availabilityResults` - Availability test results
- `performanceCounters` - System performance metrics

### Why Use This Integration?

The Application Insights integration enables AI assistants to:
1. **Troubleshoot Production Issues**: Query exceptions, slow requests, and dependency failures
2. **Analyze Application Performance**: Identify bottlenecks and optimization opportunities
3. **Monitor External Dependencies**: Track health of APIs, databases, and third-party services
4. **Generate Incident Reports**: Auto-generate comprehensive troubleshooting guides
5. **Track SLA Compliance**: Monitor uptime and availability metrics
6. **Custom Analysis**: Execute KQL queries for advanced investigations

**Primary Use Case**: Rapid troubleshooting of production incidents by correlating telemetry data across exceptions, performance metrics, and dependencies.

### Key Features

**Comprehensive Telemetry Access:**
- Exception tracking with stack traces and context
- Request performance with duration percentiles (P50, P95, P99)
- Dependency monitoring for external calls
- Diagnostic traces with severity filtering
- Availability test results
- Custom events and metrics

**Powerful Querying:**
- Execute custom KQL queries for advanced analysis
- Pre-built helper methods for common scenarios
- Time-range filtering with ISO 8601 durations
- Result limiting for manageable output
- Schema exploration for table discovery

**Multi-Resource Support:**
- Query multiple Application Insights resources
- Active/inactive flags for quick resource toggles
- Centralized configuration with JSON arrays
- Resource-based query routing

**Two Authentication Methods:**
- **Entra ID (OAuth 2.0)**: Higher rate limits, better security (60 req/min, no daily cap)
- **API Key**: Simpler setup, lower limits (15 req/min, 1500 req/day)

**AI-Friendly Output:**
- Markdown-formatted reports via prompts
- Structured JSON data via tools
- Exception insights and recommendations
- Performance analysis with actionable insights
- Dependency health summaries

---

## Setup

### Prerequisites

Before using the Application Insights integration, ensure you have:
1. **Azure subscription** with Application Insights resources
2. **Monitoring Reader role** (for Entra ID auth) or API key access
3. **Application Insights Application ID** (from Azure Portal → Application Insights → API Access)
4. For Entra ID auth: Service principal with client ID, client secret, tenant ID
5. For API Key auth: Generated API key with "Read telemetry" permission

### Authentication Methods

The Application Insights integration supports two authentication methods:

**Entra ID (OAuth 2.0) - Recommended for Production**
- ✅ Higher rate limits (60 requests/minute per user)
- ✅ No daily cap
- ✅ Better security (token-based, automatic expiry)
- ✅ Centralized identity management
- ✅ Can share credentials with Log Analytics integration
- ❌ More complex setup (requires service principal)

**API Key Authentication - Simpler for Getting Started**
- ✅ Simple setup (just generate key in portal)
- ✅ No service principal needed
- ❌ Lower rate limits (15 requests/minute per key)
- ❌ Daily cap (1,500 requests per key per day)
- ❌ Less secure (long-lived key)
- ❌ Deprecated by Microsoft for new implementations

**Recommendation**: Use Entra ID for production environments. Use API Key for quick testing or single-resource scenarios.

---

### Entra ID (OAuth 2.0) Authentication

**Recommended for production use with multiple resources and better security.**

#### Step 1: Create Service Principal

You can create a new service principal or reuse an existing one (like PowerPlatform or Log Analytics service principal).

**Using Azure CLI:**

```bash
# Create service principal
az ad sp create-for-rbac --name "MCP-Consultant-Tools-AppInsights" --skip-assignment

# Output will contain:
# {
#   "appId": "87654321-4321-4321-4321-cba987654321",    # → APPINSIGHTS_CLIENT_ID
#   "password": "your-client-secret",                    # → APPINSIGHTS_CLIENT_SECRET
#   "tenant": "12345678-1234-1234-1234-123456789abc"    # → APPINSIGHTS_TENANT_ID
# }
```

**Using Azure Portal:**

1. Go to Azure Portal → Azure Active Directory
2. Navigate to "App registrations" → "New registration"
3. Enter name: "MCP-Consultant-Tools-AppInsights"
4. Click "Register"
5. Note the **Application (client) ID** (`APPINSIGHTS_CLIENT_ID`)
6. Note the **Directory (tenant) ID** (`APPINSIGHTS_TENANT_ID`)
7. Go to "Certificates & secrets" → "New client secret"
8. Add description, set expiration, click "Add"
9. Copy the **secret value** immediately (`APPINSIGHTS_CLIENT_SECRET`)

#### Step 2: Assign Monitoring Reader Role

The service principal needs "Monitoring Reader" or "Reader" role on each Application Insights resource.

**Using Azure CLI:**

```bash
# Get Application Insights resource ID
az monitor app-insights component show \
  --app YourAppInsightsName \
  --resource-group YourResourceGroup \
  --query id --output tsv

# Assign role (use resource ID from above)
az role assignment create \
  --assignee YOUR_SERVICE_PRINCIPAL_CLIENT_ID \
  --role "Monitoring Reader" \
  --scope "/subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/YOUR_RESOURCE_GROUP/providers/microsoft.insights/components/YOUR_APP_INSIGHTS_NAME"
```

**Using Azure Portal:**

1. Go to Azure Portal → Application Insights → Your resource
2. Navigate to "Access control (IAM)" in left sidebar
3. Click "Add" → "Add role assignment"
4. Select role: **"Monitoring Reader"** (or "Reader")
5. Click "Next"
6. Click "Select members"
7. Search for your service principal name ("MCP-Consultant-Tools-AppInsights")
8. Select it and click "Select"
9. Click "Review + assign"

**Repeat for all Application Insights resources you want to query.**

#### Step 3: Get Application Insights Application ID

1. Go to Azure Portal → Application Insights → Your resource
2. Navigate to "API Access" in left sidebar (under "Configure" section)
3. Copy the **Application ID** (GUID format)

This is your `appId` for the resource configuration (next step).

#### Step 4: Configure Environment Variables

Set the following environment variables:

```bash
# Authentication method
export APPINSIGHTS_AUTH_METHOD="entra-id"

# Service principal credentials
export APPINSIGHTS_TENANT_ID="your-tenant-id"
export APPINSIGHTS_CLIENT_ID="your-service-principal-client-id"
export APPINSIGHTS_CLIENT_SECRET="your-service-principal-secret"

# Application Insights resources (JSON array)
export APPINSIGHTS_RESOURCES='[
  {
    "id": "prod-api",
    "name": "Production API",
    "appId": "12345678-1234-1234-1234-123456789abc",
    "active": true,
    "description": "Production API Application Insights"
  },
  {
    "id": "prod-web",
    "name": "Production Web",
    "appId": "87654321-4321-4321-4321-cba987654321",
    "active": true,
    "description": "Production Web Application Insights"
  }
]'
```

**JSON Format for `APPINSIGHTS_RESOURCES`:**

```json
[
  {
    "id": "resource-identifier",           // Your choice - used in queries
    "name": "Human Readable Name",         // Descriptive name
    "appId": "app-id-from-portal",         // Application ID from step 3
    "active": true,                        // true/false flag
    "description": "Optional description"  // Optional
  }
]
```

**Multi-Resource Benefits:**
- Query multiple environments (production, staging, development)
- Quick toggles with `active` flag (no need to remove configuration)
- Centralized credential management (one service principal for all resources)

---

### API Key Authentication

**Simpler setup for single resources or testing. Deprecated by Microsoft for new implementations.**

#### Step 1: Generate API Key

1. Go to Azure Portal → Application Insights → Your resource
2. Navigate to "API Access" in left sidebar (under "Configure" section)
3. Click "+ Create API key"
4. Enter description: "MCP Consultant Tools"
5. Check permission: ✅ **"Read telemetry"**
6. Click "Generate key"
7. **Copy the API key immediately** (you won't be able to see it again)

#### Step 2: Get Application Insights Application ID

1. Still in "API Access" page
2. Copy the **Application ID** (GUID format)

#### Step 3: Configure Environment Variables

For single-resource configuration:

```bash
# Authentication method
export APPINSIGHTS_AUTH_METHOD="api-key"

# Application Insights Application ID
export APPINSIGHTS_APP_ID="12345678-1234-1234-1234-123456789abc"

# API Key
export APPINSIGHTS_API_KEY="your-generated-api-key-here"
```

For multi-resource configuration with API keys:

```bash
export APPINSIGHTS_AUTH_METHOD="api-key"
export APPINSIGHTS_RESOURCES='[
  {
    "id": "prod-api",
    "name": "Production API",
    "appId": "12345678-1234-1234-1234-123456789abc",
    "active": true,
    "apiKey": "api-key-for-this-resource"
  }
]'
```

**Security Note:**
- API keys have full "Read telemetry" access
- Rotate them regularly (every 90 days recommended)
- Don't commit them to version control
- Monitor usage in Azure Portal → Application Insights → API Access → Usage

---

### Environment Variables

Configure these environment variables for Application Insights integration:

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `APPINSIGHTS_AUTH_METHOD` | No | Authentication method ("entra-id" or "api-key") | "entra-id" |
| `APPINSIGHTS_TENANT_ID` | Yes (Entra ID) | Azure tenant ID | - |
| `APPINSIGHTS_CLIENT_ID` | Yes (Entra ID) | Service principal client ID | - |
| `APPINSIGHTS_CLIENT_SECRET` | Yes (Entra ID) | Service principal client secret | - |
| `APPINSIGHTS_RESOURCES` | Yes | JSON array of Application Insights resources | - |
| `APPINSIGHTS_APP_ID` | Yes (single-resource fallback) | Application Insights application ID | - |
| `APPINSIGHTS_API_KEY` | Yes (API key auth) | Application Insights API key | - |

**Configuration Priority:**
1. If `APPINSIGHTS_RESOURCES` is set: Uses multi-resource configuration
2. If `APPINSIGHTS_APP_ID` is set: Uses single-resource fallback configuration
3. If neither: Throws configuration error on first tool/prompt invocation

**Shared Credentials with Log Analytics:**
The Application Insights credentials can be shared with Log Analytics integration. Log Analytics will automatically fall back to `APPINSIGHTS_*` credentials if Log Analytics-specific credentials are not provided.

---

### Configuration Examples

#### Claude Desktop (macOS/Linux) - Published Package

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "application-insights": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/application-insights"],
      "env": {
        "APPINSIGHTS_AUTH_METHOD": "entra-id",
        "APPINSIGHTS_TENANT_ID": "your-tenant-id",
        "APPINSIGHTS_CLIENT_ID": "your-client-id",
        "APPINSIGHTS_CLIENT_SECRET": "your-client-secret",
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod-api\",\"name\":\"Production API\",\"appId\":\"your-app-id\",\"active\":true}]"
      }
    }
  }
}
```

#### Claude Desktop - Local Development/Testing

For local testing with your development build:

```json
{
  "mcpServers": {
    "appinsights-local": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-consultant-tools/packages/application-insights/build/index.js"],
      "env": {
        "APPINSIGHTS_AUTH_METHOD": "entra-id",
        "APPINSIGHTS_TENANT_ID": "your-tenant-id",
        "APPINSIGHTS_CLIENT_ID": "your-client-id",
        "APPINSIGHTS_CLIENT_SECRET": "your-client-secret",
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod-api\",\"name\":\"Production API\",\"appId\":\"your-app-id\",\"active\":true}]"
      }
    }
  }
}
```

**Note:** Replace `/absolute/path/to/mcp-consultant-tools` with your actual repository path.

#### VS Code Extension

Edit `.vscode/settings.json`:

```json
{
  "mcp.servers": {
    "application-insights": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/application-insights"],
      "env": {
        "APPINSIGHTS_AUTH_METHOD": "entra-id",
        "APPINSIGHTS_TENANT_ID": "your-tenant-id",
        "APPINSIGHTS_CLIENT_ID": "your-client-id",
        "APPINSIGHTS_CLIENT_SECRET": "your-client-secret",
        "APPINSIGHTS_RESOURCES": "[{\"id\":\"prod-api\",\"name\":\"Production API\",\"appId\":\"your-app-id\",\"active\":true}]"
      }
    }
  }
}
```

#### Local Development (.env file)

Create a `.env` file in the project root:

```bash
# Entra ID Authentication (Recommended)
APPINSIGHTS_AUTH_METHOD=entra-id
APPINSIGHTS_TENANT_ID=your-tenant-id
APPINSIGHTS_CLIENT_ID=your-service-principal-client-id
APPINSIGHTS_CLIENT_SECRET=your-service-principal-secret
APPINSIGHTS_RESOURCES='[{"id":"prod-api","name":"Production API","appId":"app-id-from-portal","active":true},{"id":"prod-web","name":"Production Web","appId":"another-app-id","active":true}]'
```

**Security:** Never commit `.env` files to version control. Add `.env` to your `.gitignore`.

---

## Tools

The Application Insights integration provides 10 tools for telemetry querying and analysis.

### appinsights-list-resources

List all configured Application Insights resources (active and inactive).

**Purpose:**
View available Application Insights resources with their active/inactive status.

**Parameters:**
- None

**Returns:**

```typescript
{
  resources: Array<{
    id: string;                  // Resource identifier (used in queries)
    name: string;                // Human-readable name
    appId: string;               // Application Insights Application ID
    active: boolean;             // Active/inactive status
    description?: string;        // Optional description
  }>;
  totalCount: number;            // Total resources configured
  activeCount: number;           // Number of active resources
  authMethod: string;            // "entra-id" or "api-key"
}
```

**Example:**

```javascript
await mcpClient.invoke("appinsights-list-resources", {});
```

**Sample Output:**

```json
{
  "resources": [
    {
      "id": "prod-api",
      "name": "Production API",
      "appId": "12345678-1234-1234-1234-123456789abc",
      "active": true,
      "description": "Production API Application Insights"
    },
    {
      "id": "staging-api",
      "name": "Staging API",
      "appId": "11111111-2222-3333-4444-555555555555",
      "active": false,
      "description": "Staging API (inactive)"
    }
  ],
  "totalCount": 2,
  "activeCount": 1,
  "authMethod": "entra-id"
}
```

**Use Cases:**
- Discover available resources for querying
- Check which resources are active
- Verify configuration before running queries
- Get resource IDs for other tool calls

---

### appinsights-get-metadata

Get schema metadata (tables and columns) for an Application Insights resource.

**Purpose:**
Discover available telemetry tables and their column schemas before writing KQL queries.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID (use `appinsights-list-resources` to find IDs) |

**Returns:**

```typescript
{
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;              // "datetime", "string", "real", "bool", "int", "long"
      description?: string;
    }>;
  }>;
}
```

**Example:**

```javascript
await mcpClient.invoke("appinsights-get-metadata", {
  resourceId: "prod-api"
});
```

**Sample Output:**

```json
{
  "tables": [
    {
      "name": "requests",
      "columns": [
        { "name": "timestamp", "type": "datetime" },
        { "name": "id", "type": "string" },
        { "name": "name", "type": "string" },
        { "name": "duration", "type": "real" },
        { "name": "resultCode", "type": "string" },
        { "name": "success", "type": "bool" },
        { "name": "operation_Name", "type": "string" },
        { "name": "operation_Id", "type": "string" },
        { "name": "cloud_RoleName", "type": "string" }
      ]
    },
    {
      "name": "exceptions",
      "columns": [
        { "name": "timestamp", "type": "datetime" },
        { "name": "type", "type": "string" },
        { "name": "outerMessage", "type": "string" },
        { "name": "innermostMessage", "type": "string" },
        { "name": "operation_Name", "type": "string" },
        { "name": "operation_Id", "type": "string" }
      ]
    },
    {
      "name": "dependencies",
      "columns": [
        { "name": "timestamp", "type": "datetime" },
        { "name": "name", "type": "string" },
        { "name": "target", "type": "string" },
        { "name": "type", "type": "string" },
        { "name": "duration", "type": "real" },
        { "name": "success", "type": "bool" },
        { "name": "resultCode", "type": "string" }
      ]
    }
  ]
}
```

**Use Cases:**
- Discover available telemetry tables
- Verify column names before writing KQL queries
- Understand data types for query filters
- Explore custom columns and dimensions

---

### appinsights-execute-query

Execute a custom KQL (Kusto Query Language) query against Application Insights.

**Purpose:**
Run advanced KQL queries for custom analysis and investigation.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `query` | string | Yes | KQL query string |
| `timespan` | string | No | Time range (e.g., 'PT1H' for 1 hour, 'P1D' for 1 day) |

**Timespan Format (ISO 8601 Duration):**
- `PT15M` - 15 minutes
- `PT1H` - 1 hour
- `PT12H` - 12 hours
- `P1D` - 1 day
- `P7D` - 7 days

**Returns:**

```typescript
{
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
    }>;
    rows: Array<Array<any>>;  // Array of row data
  }>;
}
```

**Example:**

```javascript
// Query for exceptions in the last hour
await mcpClient.invoke("appinsights-execute-query", {
  resourceId: "prod-api",
  query: "exceptions | where timestamp > ago(1h) | take 10 | project timestamp, type, outerMessage",
  timespan: "PT1H"
});
```

**Advanced Example:**

```javascript
// Find requests with specific error codes
await mcpClient.invoke("appinsights-execute-query", {
  resourceId: "prod-api",
  query: `
    requests
    | where timestamp > ago(1h)
    | where resultCode startswith "5"
    | summarize Count=count() by resultCode, operation_Name
    | order by Count desc
  `,
  timespan: "PT1H"
});
```

**Returns raw KQL results:**

```json
{
  "tables": [
    {
      "name": "PrimaryResult",
      "columns": [
        { "name": "resultCode", "type": "string" },
        { "name": "operation_Name", "type": "string" },
        { "name": "Count", "type": "long" }
      ],
      "rows": [
        ["503", "POST /api/orders", 15],
        ["500", "GET /api/customers", 8],
        ["504", "POST /api/payments", 3]
      ]
    }
  ]
}
```

**Use Cases:**
- Advanced telemetry analysis
- Custom aggregations and summaries
- Correlation across multiple telemetry types
- Ad-hoc investigation of specific patterns

**Common KQL Patterns:**

```kql
// Time-based filtering
requests | where timestamp > ago(1h)

// Aggregation
exceptions | summarize count() by type

// Joining tables
requests
| where resultCode startswith "5"
| join (exceptions | where timestamp > ago(1h)) on operation_Id

// Performance analysis
requests
| summarize percentiles(duration, 50, 95, 99) by name
```

---

### appinsights-get-exceptions

Get recent exceptions from Application Insights with timestamps, types, and messages.

**Purpose:**
Quickly retrieve exception data for troubleshooting production issues.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `timespan` | string | No | Time range (default: PT1H) |
| `limit` | number | No | Maximum number of results (default: 50) |

**Returns:**

```typescript
{
  exceptions: Array<{
    timestamp: string;           // ISO 8601 datetime
    type: string;                // Exception type (e.g., "NullReferenceException")
    outerMessage: string;        // Exception message
    innermostMessage: string;    // Innermost exception message
    operation_Name: string;      // Operation/request name
    operation_Id: string;        // Correlation ID
    cloud_RoleName: string;      // Service/role name
  }>;
  count: number;                 // Total exceptions returned
}
```

**Example:**

```javascript
await mcpClient.invoke("appinsights-get-exceptions", {
  resourceId: "prod-api",
  timespan: "PT12H",
  limit: 100
});
```

**Sample Output:**

```json
{
  "exceptions": [
    {
      "timestamp": "2024-01-15T14:32:15Z",
      "type": "NullReferenceException",
      "outerMessage": "Object reference not set to an instance of an object",
      "innermostMessage": "Object reference not set to an instance of an object",
      "operation_Name": "POST /api/orders",
      "operation_Id": "abc123def456",
      "cloud_RoleName": "OrderAPI"
    },
    {
      "timestamp": "2024-01-15T14:31:58Z",
      "type": "TimeoutException",
      "outerMessage": "The operation has timed out",
      "innermostMessage": "Connection timeout after 30000ms",
      "operation_Name": "GET /api/customers",
      "operation_Id": "xyz789ghi012",
      "cloud_RoleName": "CustomerAPI"
    }
  ],
  "count": 2
}
```

**Use Cases:**
- First-responder exception analysis
- Identify most frequent exception types
- Correlate exceptions with deployments
- Track exception trends over time

---

### appinsights-get-slow-requests

Get slow HTTP requests (above duration threshold) from Application Insights.

**Purpose:**
Identify performance bottlenecks by finding slow requests.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `durationThresholdMs` | number | No | Duration threshold in milliseconds (default: 5000) |
| `timespan` | string | No | Time range (default: PT1H) |
| `limit` | number | No | Maximum number of results (default: 50) |

**Returns:**

```typescript
{
  slowRequests: Array<{
    timestamp: string;
    name: string;                // Request name (e.g., "GET /api/customers")
    duration: number;            // Duration in milliseconds
    resultCode: string;          // HTTP status code
    success: boolean;            // Success flag
    operation_Id: string;        // Correlation ID
    cloud_RoleName: string;      // Service/role name
  }>;
  count: number;
  thresholdMs: number;           // Threshold used for filtering
}
```

**Example:**

```javascript
await mcpClient.invoke("appinsights-get-slow-requests", {
  resourceId: "prod-web",
  durationThresholdMs: 3000,  // 3 seconds
  timespan: "PT6H",
  limit: 25
});
```

**Sample Output:**

```json
{
  "slowRequests": [
    {
      "timestamp": "2024-01-15T14:30:00Z",
      "name": "GET /api/customers/search",
      "duration": 18934,
      "resultCode": "200",
      "success": true,
      "operation_Id": "abc123def456",
      "cloud_RoleName": "CustomerAPI"
    },
    {
      "timestamp": "2024-01-15T14:25:00Z",
      "name": "POST /api/orders",
      "duration": 8234,
      "resultCode": "200",
      "success": true,
      "operation_Id": "xyz789ghi012",
      "cloud_RoleName": "OrderAPI"
    }
  ],
  "count": 2,
  "thresholdMs": 3000
}
```

**Use Cases:**
- Performance bottleneck identification
- Optimize slow API endpoints
- Monitor SLA compliance (e.g., P95 < 1s)
- Correlate slow requests with infrastructure changes

---

### appinsights-get-operation-performance

Get performance summary by operation (request count, avg duration, percentiles).

**Purpose:**
Analyze performance metrics aggregated by operation name.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `timespan` | string | No | Time range (default: PT1H) |

**Returns:**

```typescript
{
  operations: Array<{
    operation_Name: string;
    RequestCount: number;
    AvgDuration: number;         // Average duration in ms
    P50Duration: number;         // Median duration
    P95Duration: number;         // 95th percentile
    P99Duration: number;         // 99th percentile
    FailureCount: number;
    SuccessRate: number;         // Percentage (0-100)
  }>;
}
```

**Example:**

```javascript
await mcpClient.invoke("appinsights-get-operation-performance", {
  resourceId: "prod-api",
  timespan: "P1D"  // Last 24 hours
});
```

**Sample Output:**

```json
{
  "operations": [
    {
      "operation_Name": "GET /api/customers/search",
      "RequestCount": 1523,
      "AvgDuration": 8234,
      "P50Duration": 5420,
      "P95Duration": 12450,
      "P99Duration": 18900,
      "FailureCount": 0,
      "SuccessRate": 100.00
    },
    {
      "operation_Name": "POST /api/orders",
      "RequestCount": 4521,
      "AvgDuration": 245,
      "P50Duration": 180,
      "P95Duration": 450,
      "P99Duration": 1200,
      "FailureCount": 15,
      "SuccessRate": 99.67
    }
  ]
}
```

**Use Cases:**
- Identify slowest operations
- Monitor performance regression
- Track operation failure rates
- Analyze performance percentiles for SLA compliance
- Prioritize optimization efforts

---

### appinsights-get-failed-dependencies

Get failed dependency calls (external APIs, databases, etc.) from Application Insights.

**Purpose:**
Monitor external service health and identify integration issues.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `timespan` | string | No | Time range (default: PT1H) |
| `limit` | number | No | Maximum number of results (default: 50) |

**Returns:**

```typescript
{
  failedDependencies: Array<{
    timestamp: string;
    name: string;                // Dependency call name
    target: string;              // Target host/service
    type: string;                // Type (HTTP, SQL, Azure blob, etc.)
    duration: number;            // Duration in ms
    resultCode: string;          // Response code
    operation_Id: string;        // Correlation ID
    cloud_RoleName: string;      // Service/role name
  }>;
  count: number;
}
```

**Example:**

```javascript
await mcpClient.invoke("appinsights-get-failed-dependencies", {
  resourceId: "prod-api",
  timespan: "PT2H",
  limit: 100
});
```

**Sample Output:**

```json
{
  "failedDependencies": [
    {
      "timestamp": "2024-01-15T14:32:00Z",
      "name": "POST /charge",
      "target": "payment-gateway.company.com",
      "type": "HTTP",
      "duration": 30000,
      "resultCode": "504",
      "operation_Id": "abc123def456",
      "cloud_RoleName": "PaymentService"
    },
    {
      "timestamp": "2024-01-15T14:30:15Z",
      "name": "SELECT * FROM orders",
      "target": "crm.database.windows.net",
      "type": "SQL",
      "duration": 5000,
      "resultCode": "",
      "operation_Id": "xyz789ghi012",
      "cloud_RoleName": "OrderAPI"
    }
  ],
  "count": 2
}
```

**Use Cases:**
- Identify external service issues
- Monitor third-party API reliability
- Track database connection failures
- Correlate with operation failures
- Circuit breaker implementation decisions

---

### appinsights-get-traces

Get diagnostic traces/logs from Application Insights filtered by severity level.

**Purpose:**
Retrieve application logs and diagnostic traces for debugging.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `severityLevel` | number | No | Minimum severity level (default: 2) |
| `timespan` | string | No | Time range (default: PT1H) |
| `limit` | number | No | Maximum number of results (default: 100) |

**Severity Levels:**
- `0` = Verbose
- `1` = Information
- `2` = Warning
- `3` = Error
- `4` = Critical

**Returns:**

```typescript
{
  traces: Array<{
    timestamp: string;
    message: string;
    severityLevel: number;
    operation_Name: string;
    operation_Id: string;
    cloud_RoleName: string;
  }>;
  count: number;
}
```

**Example:**

```javascript
await mcpClient.invoke("appinsights-get-traces", {
  resourceId: "prod-api",
  severityLevel: 3,  // Error level and above
  timespan: "PT4H",
  limit: 200
});
```

**Sample Output:**

```json
{
  "traces": [
    {
      "timestamp": "2024-01-15T14:32:15Z",
      "message": "Database connection pool exhausted",
      "severityLevel": 3,
      "operation_Name": "GET /api/customers",
      "operation_Id": "abc123def456",
      "cloud_RoleName": "CustomerAPI"
    },
    {
      "timestamp": "2024-01-15T14:30:00Z",
      "message": "Payment gateway timeout after 30s",
      "severityLevel": 4,
      "operation_Name": "POST /api/payments",
      "operation_Id": "xyz789ghi012",
      "cloud_RoleName": "PaymentService"
    }
  ],
  "count": 2
}
```

**Use Cases:**
- Debug application issues with log messages
- Filter critical errors from noise
- Correlate logs with exceptions and requests
- Monitor application health with custom log messages

---

### appinsights-get-availability

Get availability test results and uptime statistics from Application Insights.

**Purpose:**
Monitor uptime and SLA compliance with availability test data.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `timespan` | string | No | Time range (default: PT24H) |

**Returns:**

```typescript
{
  availabilityTests: Array<{
    name: string;                // Test name
    TotalTests: number;          // Total test runs
    SuccessCount: number;        // Successful tests
    FailureCount: number;        // Failed tests
    AvgDuration: number;         // Average duration in ms
    SuccessRate: number;         // Percentage (0-100)
  }>;
}
```

**Example:**

```javascript
await mcpClient.invoke("appinsights-get-availability", {
  resourceId: "prod-web",
  timespan: "P7D"  // Last 7 days
});
```

**Sample Output:**

```json
{
  "availabilityTests": [
    {
      "name": "Homepage Health Check",
      "TotalTests": 1440,
      "SuccessCount": 1438,
      "FailureCount": 2,
      "AvgDuration": 234,
      "SuccessRate": 99.86
    },
    {
      "name": "API Ping Test (US East)",
      "TotalTests": 1440,
      "SuccessCount": 1440,
      "FailureCount": 0,
      "AvgDuration": 156,
      "SuccessRate": 100.00
    },
    {
      "name": "API Ping Test (EU West)",
      "TotalTests": 1440,
      "SuccessCount": 1432,
      "FailureCount": 8,
      "AvgDuration": 289,
      "SuccessRate": 99.44
    }
  ]
}
```

**Use Cases:**
- Monitor uptime percentage
- Track availability test failures
- Identify geographic issues
- Verify SLA compliance (e.g., 99.9% uptime)
- Alert on availability degradation

---

### appinsights-get-custom-events

Get custom application events from Application Insights.

**Purpose:**
Track and analyze custom business events and feature usage.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `eventName` | string | No | Filter by specific event name |
| `timespan` | string | No | Time range (default: PT1H) |
| `limit` | number | No | Maximum number of results (default: 100) |

**Returns:**

```typescript
{
  customEvents: Array<{
    timestamp: string;
    name: string;
    customDimensions: object;    // Custom properties
    operation_Id: string;
    cloud_RoleName: string;
  }>;
  count: number;
}
```

**Example:**

```javascript
await mcpClient.invoke("appinsights-get-custom-events", {
  resourceId: "prod-api",
  eventName: "OrderPlaced",
  timespan: "P1D",
  limit: 500
});
```

**Sample Output:**

```json
{
  "customEvents": [
    {
      "timestamp": "2024-01-15T14:32:00Z",
      "name": "OrderPlaced",
      "customDimensions": {
        "orderId": "ORD-12345",
        "customerId": "CUST-67890",
        "totalAmount": 299.99,
        "itemCount": 3
      },
      "operation_Id": "abc123def456",
      "cloud_RoleName": "OrderAPI"
    }
  ],
  "count": 1
}
```

**Use Cases:**
- Track business events (orders, signups, payments)
- Monitor feature usage
- Analyze user behavior
- Custom KPI tracking
- A/B test result analysis

---

## Prompts

The Application Insights integration provides 5 prompts for formatted, human-readable reports.

### appinsights-exception-summary

Generate comprehensive exception summary report with insights and recommendations.

**Purpose:**
First-responder analysis for production exceptions with actionable insights.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `timespan` | string | No | Time range (default: PT1H) |
| `limit` | number | No | Maximum exceptions to include (default: 50) |

**Returns:**
Markdown-formatted report with:
- Key insights summary
- Recent exceptions table
- Exception types frequency analysis
- Recommendations for investigation

**Example:**

```javascript
await mcpClient.callPrompt("appinsights-exception-summary", {
  resourceId: "production-api",
  timespan: "PT1H"
});
```

**Sample Output:**

```markdown
# Application Insights Exception Summary Report

**Resource**: production-api
**Time Range**: PT1H

## Key Insights

- Found 3 unique exception type(s)
- Total exceptions: 47
- Most affected operation: POST /api/orders (42 exceptions)

## Recent Exceptions

| timestamp | type | outerMessage | operation_Name | cloud_RoleName |
| --- | --- | --- | --- | --- |
| 2024-01-15T14:32:15Z | NullReferenceException | Object reference not set | POST /api/orders | OrderAPI |
| 2024-01-15T14:31:58Z | NullReferenceException | Object reference not set | POST /api/orders | OrderAPI |

## Exception Types (Frequency)

| type | Count |
| --- | --- |
| NullReferenceException | 42 |
| TimeoutException | 3 |
| SqlException | 2 |

## Recommendations

- Review the most frequent exception types to identify systemic issues
- Investigate exceptions in critical operations first
- Check for patterns in timestamps (e.g., deployment times, peak traffic)
- Use operation_Id to correlate exceptions with requests and dependencies
```

**Use Cases:**
- First-responder exception analysis
- Incident triage and prioritization
- Root cause investigation
- Exception trend analysis

---

### appinsights-performance-report

Generate comprehensive performance analysis with recommendations.

**Purpose:**
Identify performance bottlenecks and optimization opportunities.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `timespan` | string | No | Time range (default: PT1H) |
| `durationThreshold` | number | No | Slow request threshold in ms (default: 5000) |

**Returns:**
Markdown-formatted report with:
- Key performance insights
- Operation performance summary
- Slowest requests
- Performance recommendations

**Example:**

```javascript
await mcpClient.callPrompt("appinsights-performance-report", {
  resourceId: "production-api",
  timespan: "PT6H"
});
```

**Sample Output:**

```markdown
# Application Insights Performance Report

**Resource**: production-api
**Time Range**: PT6H

## Key Insights

- Slowest operation: GET /api/customers/search (avg: 8234ms)
- Operation with most failures: POST /api/orders (15 failures)

## Operation Performance Summary

| operation_Name | RequestCount | AvgDuration | P95Duration | P99Duration | FailureCount |
| --- | --- | --- | --- | --- | --- |
| GET /api/customers/search | 1523 | 8234 | 12450 | 18900 | 0 |
| POST /api/orders | 4521 | 245 | 450 | 1200 | 15 |
| GET /api/products | 8932 | 45 | 120 | 250 | 0 |

## Slowest Requests (>5s)

| timestamp | name | duration | resultCode | cloud_RoleName |
| --- | --- | --- | --- | --- |
| 2024-01-15T14:30:00Z | GET /api/customers/search | 18934 | 200 | CustomerAPI |
| 2024-01-15T14:25:00Z | GET /api/customers/search | 15234 | 200 | CustomerAPI |

## Performance Recommendations

- Focus optimization efforts on operations with high P95/P99 duration
- Investigate operations with high failure counts
- Monitor operations with high request counts for scalability issues
- Use operation_Id to trace slow requests through dependencies
```

**Use Cases:**
- Performance optimization planning
- SLA compliance verification
- Capacity planning
- Performance regression detection

---

### appinsights-dependency-health

Generate dependency health report with success rates.

**Purpose:**
Monitor external service health and identify integration issues.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `timespan` | string | No | Time range (default: PT1H) |
| `limit` | number | No | Maximum failed dependencies (default: 50) |

**Returns:**
Markdown-formatted report with:
- Key dependency insights
- Failed dependencies table
- Dependency success rates
- Recommendations

**Example:**

```javascript
await mcpClient.callPrompt("appinsights-dependency-health", {
  resourceId: "production-api",
  timespan: "PT1H"
});
```

**Sample Output:**

```markdown
# Application Insights Dependency Health Report

**Resource**: production-api
**Time Range**: PT1H

## Key Insights

- Affected targets: 2
- Total failed dependency calls: 18
- Most failing target: payment-gateway.company.com (15 failures)

## Failed Dependencies

| timestamp | name | target | type | duration | resultCode | cloud_RoleName |
| --- | --- | --- | --- | --- | --- | --- |
| 2024-01-15T14:32:00Z | POST /charge | payment-gateway.company.com | HTTP | 30000 | 504 | PaymentService |
| 2024-01-15T14:31:45Z | POST /charge | payment-gateway.company.com | HTTP | 30000 | 504 | PaymentService |

## Dependency Success Rates

| target | type | Total | Failed | AvgDuration | SuccessRate |
| --- | --- | --- | --- | --- | --- |
| payment-gateway.company.com | HTTP | 150 | 15 | 2450 | 90.00 |
| crm.database.windows.net | SQL | 4523 | 3 | 45 | 99.93 |
| storage.blob.core.windows.net | Azure blob | 892 | 0 | 23 | 100.00 |

## Recommendations

- Investigate dependencies with success rates below 99%
- Check if external service degradation matches known incidents
- Review timeout configurations for slow dependencies
- Consider implementing circuit breakers for unreliable dependencies
```

**Use Cases:**
- External service monitoring
- Third-party API reliability tracking
- Circuit breaker configuration
- Vendor SLA verification

---

### appinsights-availability-report

Generate availability and uptime report.

**Purpose:**
Track uptime and SLA compliance with availability test results.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `timespan` | string | No | Time range (default: PT24H) |

**Returns:**
Markdown-formatted report with:
- Availability test results
- Success rates
- Recommendations

**Example:**

```javascript
await mcpClient.callPrompt("appinsights-availability-report", {
  resourceId: "production-web",
  timespan: "PT24H"
});
```

**Sample Output:**

```markdown
# Application Insights Availability Report

**Resource**: production-web
**Time Range**: PT24H

## Availability Test Results

| name | TotalTests | SuccessCount | FailureCount | AvgDuration | SuccessRate |
| --- | --- | --- | --- | --- | --- |
| Homepage Health Check | 1440 | 1438 | 2 | 234 | 99.86 |
| API Ping Test (US East) | 1440 | 1440 | 0 | 156 | 100.00 |
| API Ping Test (EU West) | 1440 | 1432 | 8 | 289 | 99.44 |

## Recommendations

- Investigate any tests with success rates below 99.9%
- Review failed tests for patterns (geographic, time-based)
- Consider adding availability tests for critical endpoints if missing
- Set up alerts for availability degradation
```

**Use Cases:**
- SLA compliance monitoring
- Uptime tracking
- Geographic availability analysis
- Alert configuration

---

### appinsights-troubleshooting-guide

Generate comprehensive troubleshooting workflow for production incidents.

**Purpose:**
First-responder guide with complete health status and investigation steps.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `timespan` | string | No | Time range (default: PT1H) |

**Returns:**
Markdown-formatted report with:
- Health status overview
- Top exceptions
- Slowest requests
- Failed dependencies
- Detailed troubleshooting workflow
- KQL queries for further investigation
- Mitigation recommendations

**Example:**

```javascript
await mcpClient.callPrompt("appinsights-troubleshooting-guide", {
  resourceId: "production-api",
  timespan: "PT1H"
});
```

**Sample Output:**

```markdown
# Application Insights Troubleshooting Guide

**Resource**: production-api
**Time Range**: PT1H

## Health Status Overview

- 🔴 **Exceptions**: 47 exceptions detected
- 🟡 **Performance**: 12 slow requests (>5s)
- 🟡 **Dependencies**: 18 dependency failures

## Top Exceptions

| type | Count | operation_Name |
| --- | --- | --- |
| NullReferenceException | 42 | POST /api/orders |
| TimeoutException | 3 | GET /api/customers |
| SqlException | 2 | POST /api/inventory |

## Slowest Requests

| operation_Name | duration | resultCode |
| --- | --- | --- |
| GET /api/customers/search | 18934 | 200 |
| GET /api/customers/search | 15234 | 200 |

## Failed Dependencies

| target | type | FailureCount |
| --- | --- | --- |
| payment-gateway.company.com | HTTP | 15 |
| crm.database.windows.net | SQL | 3 |

## Troubleshooting Workflow

### Step 1: Identify the Root Cause

1. **Check for exceptions**
   - Review top exception types and affected operations
   - Look for correlation with recent deployments

2. **Analyze performance degradation**
   - Identify which operations are slow
   - Check if slowness coincides with dependency failures

3. **Verify external dependencies**
   - Check if third-party services are degraded
   - Review timeout and retry configurations

### Step 2: Investigate Further

Use these KQL queries for deeper investigation:

```kql
// Find all operations affected by NullReferenceException
exceptions
| where type == "NullReferenceException"
| summarize count() by operation_Name, cloud_RoleName
| order by count_ desc

// Trace request flow with operation_Id
union requests, dependencies, exceptions
| where operation_Id == "YOUR_OPERATION_ID"
| project timestamp, itemType, name, success, resultCode, duration
| order by timestamp asc
```

### Step 3: Mitigate and Monitor

- Roll back recent deployments if exceptions started after deployment
- Enable circuit breakers for failing dependencies
- Increase timeout values if seeing timeout exceptions
- Scale up resources if seeing performance degradation under load

## Next Steps

1. Create incident work item in Azure DevOps
2. Notify on-call engineer if issue persists
3. Review and update runbooks based on findings
4. Set up alerts to catch similar issues earlier
```

**Use Cases:**
- Production incident response
- First-responder troubleshooting
- Incident triage and escalation
- Runbook generation

---

## Usage Examples

### Example 1: Troubleshoot Production Exceptions

**Scenario**: Users report errors in production. Quickly investigate with Application Insights.

**Natural Language Request:**
```
User: "Check for exceptions in the production API in the last hour"
```

**AI Assistant Actions:**

```javascript
// Get comprehensive exception summary with insights
await mcpClient.callPrompt("appinsights-exception-summary", {
  resourceId: "production-api",
  timespan: "PT1H"
});
```

**AI Analysis:**
"Found 47 exceptions in the last hour, primarily NullReferenceException (42 occurrences) affecting the POST /api/orders operation. This suggests a recent code change or data issue in the order processing logic. Recommend immediate investigation of the OrderAPI service, focusing on null checks in the order creation flow."

---

### Example 2: Performance Analysis

**Scenario**: Identify slow operations and optimize performance.

**Natural Language Request:**
```
User: "What are the slowest API endpoints in the last 6 hours?"
```

**AI Assistant Actions:**

```javascript
// Generate comprehensive performance report
await mcpClient.callPrompt("appinsights-performance-report", {
  resourceId: "production-api",
  timespan: "PT6H"
});
```

**AI Analysis:**
"The slowest operation is GET /api/customers/search with an average duration of 8234ms and P99 of 18900ms (18.9 seconds). This is significantly above acceptable thresholds. The high P95/P99 suggests occasional very slow queries, likely due to missing database indexes or inefficient query patterns. Recommend adding database indexes on customer search fields and implementing pagination."

---

### Example 3: Monitor External Dependencies

**Scenario**: Track health of external services and APIs.

**Natural Language Request:**
```
User: "Are there any issues with our payment gateway integration?"
```

**AI Assistant Actions:**

```javascript
// Check dependency health for external integrations
await mcpClient.callPrompt("appinsights-dependency-health", {
  resourceId: "production-api",
  timespan: "PT1H"
});
```

**AI Analysis:**
"The payment gateway (payment-gateway.company.com) has a success rate of only 90% in the last hour, with 15 failures out of 150 calls. All failures are HTTP 504 (Gateway Timeout) after 30 seconds. This indicates the payment gateway is experiencing performance issues or is temporarily degraded. Recommend implementing a circuit breaker pattern and reducing timeout from 30s to 15s to fail faster."

---

### Example 4: SLA Monitoring with Availability Tests

**Scenario**: Track uptime and availability for SLA compliance.

**Natural Language Request:**
```
User: "What's our uptime in the last 24 hours?"
```

**AI Assistant Actions:**

```javascript
// Get 24-hour availability report
await mcpClient.callPrompt("appinsights-availability-report", {
  resourceId: "production-web",
  timespan: "PT24H"
});
```

**AI Analysis:**
"Overall availability is 99.86% for the Homepage Health Check (1438/1440 successful tests). The EU West ping test shows 99.44% availability (1432/1440), indicating potential regional issues. The 8 failures in EU West warrant investigation to ensure we meet our 99.9% SLA target."

---

### Example 5: Execute Custom KQL Queries

**Scenario**: Advanced analysis with custom KQL queries.

**Natural Language Request:**
```
User: "Show me all 5xx errors by endpoint in the last hour"
```

**AI Assistant Actions:**

```javascript
// Find requests with specific error codes
await mcpClient.invoke("appinsights-execute-query", {
  resourceId: "production-api",
  query: `
    requests
    | where timestamp > ago(1h)
    | where resultCode startswith "5"
    | summarize Count=count() by resultCode, operation_Name
    | order by Count desc
  `,
  timespan: "PT1H"
});
```

**Result:**
```json
{
  "tables": [
    {
      "name": "PrimaryResult",
      "columns": [
        { "name": "resultCode", "type": "string" },
        { "name": "operation_Name", "type": "string" },
        { "name": "Count", "type": "long" }
      ],
      "rows": [
        ["503", "POST /api/orders", 15],
        ["500", "GET /api/customers", 8],
        ["504", "POST /api/payments", 3]
      ]
    }
  ]
}
```

**AI Analysis:**
"Most 5xx errors are 503 Service Unavailable on POST /api/orders (15 occurrences), suggesting the order service is overloaded or experiencing issues. The 8x 500 Internal Server Error on GET /api/customers indicates a code issue. Recommend investigating both endpoints, prioritizing the order service due to higher error count."

---

### Example 6: First-Responder Incident Guide

**Scenario**: Production issues occur, need comprehensive troubleshooting guide.

**Natural Language Request:**
```
User: "Generate a complete troubleshooting guide for the production API"
```

**AI Assistant Actions:**

```javascript
// Generate complete troubleshooting workflow
await mcpClient.callPrompt("appinsights-troubleshooting-guide", {
  resourceId: "production-api",
  timespan: "PT1H"
});
```

**AI Analysis:**
"Generated comprehensive troubleshooting guide with:
- Health status: 🔴 Exceptions (47), 🟡 Performance (12 slow), 🟡 Dependencies (18 failures)
- Root cause investigation steps focusing on NullReferenceException in order processing
- KQL queries for correlation analysis
- Mitigation steps including rollback considerations and circuit breaker implementation
- Next steps for incident escalation and runbook updates"

---

### Example 7: List and Select Resources

**Scenario**: Multiple Application Insights resources configured, need to select one.

**Natural Language Request:**
```
User: "What Application Insights resources are available?"
```

**AI Assistant Actions:**

```javascript
// List all active Application Insights resources
await mcpClient.invoke("appinsights-list-resources", {});
```

**Result:**
```json
{
  "resources": [
    {
      "id": "production-api",
      "name": "Production API",
      "appId": "12345678-1234-1234-1234-123456789abc",
      "active": true,
      "description": "Main production API telemetry"
    },
    {
      "id": "production-web",
      "name": "Production Web App",
      "appId": "87654321-4321-4321-4321-cba987654321",
      "active": true,
      "description": "Customer-facing web application"
    },
    {
      "id": "staging-api",
      "name": "Staging API",
      "appId": "abcdef12-3456-7890-abcd-ef1234567890",
      "active": false,
      "description": "Staging environment API (inactive)"
    }
  ],
  "totalCount": 3,
  "activeCount": 2,
  "authMethod": "entra-id"
}
```

**AI Analysis:**
"You have 3 configured Application Insights resources, with 2 currently active (production-api and production-web). The staging-api resource is inactive. You can query the production API or web app for telemetry data."

---

### Example 8: Get Schema and Available Tables

**Scenario**: Before writing custom KQL queries, check available tables.

**Natural Language Request:**
```
User: "What telemetry tables are available for the production API?"
```

**AI Assistant Actions:**

```javascript
// Get metadata (schema) for Application Insights resource
await mcpClient.invoke("appinsights-get-metadata", {
  resourceId: "production-api"
});
```

**Result:**
```json
{
  "tables": [
    {
      "name": "requests",
      "columns": [
        { "name": "timestamp", "type": "datetime" },
        { "name": "id", "type": "string" },
        { "name": "name", "type": "string" },
        { "name": "duration", "type": "real" },
        { "name": "resultCode", "type": "string" },
        { "name": "success", "type": "bool" }
      ]
    },
    {
      "name": "exceptions",
      "columns": [
        { "name": "timestamp", "type": "datetime" },
        { "name": "type", "type": "string" },
        { "name": "outerMessage", "type": "string" }
      ]
    }
  ]
}
```

**AI Analysis:**
"Available telemetry tables include: requests (HTTP requests with duration and status), exceptions (application exceptions), dependencies (external calls), traces (diagnostic logs), customEvents (business events), and more. You can now write KQL queries using these table schemas."

---

## Best Practices

### Security

**Credential Management:**
- ✅ Use Entra ID (OAuth) for production, not API keys
- ✅ Store credentials in environment variables, never in code
- ✅ Rotate API keys every 90 days if using them
- ✅ Use separate service principals for different environments (prod/staging)
- ✅ Assign minimal required roles (Monitoring Reader, not Contributor)
- ✅ Use `.env` files for local development (add to `.gitignore`)
- ❌ Never commit credentials to version control
- ❌ Never share service principal secrets in chat/email
- ❌ Never log credentials or tokens

**Access Control:**
- Use Azure RBAC to control who can create/read telemetry
- Separate service principals for development vs production
- Review role assignments periodically
- Revoke unused service principals

**Data Privacy:**
- Configure data retention periods appropriately (default: 90 days)
- Use sampling for high-volume applications to reduce costs
- Mask sensitive data in custom dimensions (PII, secrets, tokens)
- Consider GDPR compliance for user data

---

### Performance

**Rate Limits:**
- **Entra ID Auth**: 60 requests/minute per user (recommended)
- **API Key Auth**: 15 requests/minute per key, 1500 requests/day (limited)
- Implement exponential backoff for retries
- Cache query results when appropriate

**Query Optimization:**
- Use `timespan` parameter to limit query scope
- Use `limit` parameter to cap result sizes
- Use KQL `summarize` and `top` operators for aggregation
- Avoid `select *` - specify needed columns only
- Use `where` clauses early in query pipeline

**Token Caching:**
- Entra ID tokens are cached for 1 hour
- Automatic refresh with 5-minute buffer before expiry
- No action needed - handled automatically by service

---

### Query Optimization

**Timespan Best Practices:**
- **Use shortest timespan needed** - reduces query time and cost
- **Common patterns**:
  - Real-time monitoring: `PT15M` (15 minutes)
  - Incident investigation: `PT1H` - `PT6H` (1-6 hours)
  - Trend analysis: `P1D` - `P7D` (1-7 days)
  - Historical analysis: `P30D` (30 days max recommended)

**Result Limiting:**
- Always use `limit` parameter for large result sets
- Default limits:
  - Exceptions: 50
  - Slow requests: 50
  - Traces: 100
  - Custom events: 100
- Use KQL `take` operator for custom queries

**KQL Query Patterns:**

```kql
// GOOD: Efficient query with early filtering
requests
| where timestamp > ago(1h)
| where resultCode startswith "5"
| where success == false
| summarize count() by operation_Name
| top 10 by count_

// BAD: Inefficient query (filters late, no limits)
requests
| summarize count() by operation_Name
| where count_ > 10
| order by count_ desc
```

---

### Multi-Resource Management

**Resource Organization:**
- Use descriptive resource IDs: `"prod-api"`, `"prod-web"`, `"staging-api"`
- Group by environment: Production, Staging, Development
- Use active/inactive flags for quick toggles
- Document each resource with `description` field

**Active/Inactive Flags:**
- Set `active: false` to temporarily disable a resource (no need to delete config)
- Useful for:
  - Disabling staging environments outside business hours
  - Temporarily excluding noisy resources
  - Cost optimization (reduce API calls)

**Shared Credentials:**
- Use same service principal for Application Insights and Log Analytics
- Configure once with `APPINSIGHTS_*` credentials
- Log Analytics automatically falls back to Application Insights credentials
- Reduces configuration complexity

---

## Troubleshooting

### Common Errors

#### Error: "Missing required Application Insights configuration"

**Cause:** Missing or invalid environment variables.

**Solution:**
1. Check that either `APPINSIGHTS_RESOURCES` or `APPINSIGHTS_APP_ID` is set
2. For Entra ID: Verify `APPINSIGHTS_TENANT_ID`, `APPINSIGHTS_CLIENT_ID`, `APPINSIGHTS_CLIENT_SECRET` are set
3. For API Key: Verify `APPINSIGHTS_API_KEY` is set
4. Ensure `APPINSIGHTS_AUTH_METHOD` matches your setup ("entra-id" or "api-key")
5. Verify no typos in variable names (case-sensitive)

**Verification:**
```bash
# Check environment variables (don't run in production!)
echo $APPINSIGHTS_RESOURCES
echo $APPINSIGHTS_AUTH_METHOD
```

---

#### Error: "Resource not found: [resourceId]"

**Cause:** Invalid resource ID or inactive resource.

**Solution:**
1. List available resources: `appinsights-list-resources`
2. Verify resource ID matches configuration
3. Check if resource is active (`active: true`)
4. Verify spelling and case-sensitivity

**Example Fix:**
```bash
# Check if resource exists and is active
await mcpClient.invoke("appinsights-list-resources", {});

# If resource is inactive, set active: true in configuration
```

---

#### Error: "401 Unauthorized"

**Cause:** Invalid credentials or missing permissions.

**Solution for Entra ID:**
1. Verify service principal credentials are correct
2. Check that service principal has "Monitoring Reader" role on Application Insights resource
3. Verify tenant ID matches your Azure AD tenant
4. Check if service principal client secret has expired (regenerate if needed)

**Solution for API Key:**
1. Verify API key is correct (copy/paste carefully)
2. Check if API key has been revoked in Azure Portal
3. Verify Application ID matches the resource
4. Regenerate API key if needed

**Role Assignment Verification:**
```bash
# Check role assignments for service principal
az role assignment list \
  --assignee YOUR_SERVICE_PRINCIPAL_CLIENT_ID \
  --resource-group YOUR_RESOURCE_GROUP
```

---

#### Error: "403 Forbidden"

**Cause:** Insufficient permissions on Application Insights resource.

**Solution:**
1. Verify service principal has "Monitoring Reader" or "Reader" role
2. Role can be assigned at:
   - Resource level (specific Application Insights resource)
   - Resource group level (all resources in group)
   - Subscription level (all resources in subscription)
3. Check if Conditional Access policies are blocking access
4. Verify service principal is not disabled in Azure AD

**Assign Monitoring Reader Role:**
```bash
az role assignment create \
  --assignee YOUR_SERVICE_PRINCIPAL_CLIENT_ID \
  --role "Monitoring Reader" \
  --scope "/subscriptions/SUB_ID/resourceGroups/RG_NAME/providers/microsoft.insights/components/APP_INSIGHTS_NAME"
```

---

### Authentication Issues

#### Service Principal Client Secret Expired

**Symptoms:**
- "401 Unauthorized" after credentials were working
- "AADSTS7000222: The provided client secret keys are expired"

**Solution:**
1. Go to Azure Portal → Azure Active Directory → App registrations
2. Find your service principal
3. Navigate to "Certificates & secrets"
4. Delete expired secret
5. Create new client secret
6. Update `APPINSIGHTS_CLIENT_SECRET` environment variable
7. Restart MCP server

---

#### API Key Not Working

**Symptoms:**
- "401 Unauthorized" with API key auth
- "Invalid API key" errors

**Solution:**
1. Go to Azure Portal → Application Insights → API Access
2. Verify API key is not revoked
3. Check "Read telemetry" permission is enabled
4. Regenerate API key if needed
5. Update `APPINSIGHTS_API_KEY` environment variable
6. Verify `APPINSIGHTS_APP_ID` matches the resource

**Common Mistakes:**
- ❌ Copying API key with extra spaces
- ❌ Using API key from different Application Insights resource
- ❌ Setting `APPINSIGHTS_AUTH_METHOD="entra-id"` but using API key
- ❌ Using OAuth token in `APPINSIGHTS_API_KEY` (should be in `APPINSIGHTS_OAUTH_TOKEN`)

---

### Query Errors

#### Error: "Syntax error in KQL query"

**Cause:** Invalid KQL syntax in custom query.

**Solution:**
1. Test query in Azure Portal → Application Insights → Logs
2. Verify table names are correct (use `appinsights-get-metadata`)
3. Check column names match schema
4. Ensure proper KQL syntax (operators, functions)

**Common KQL Mistakes:**
```kql
// ❌ WRONG: Missing pipe operator
requests where timestamp > ago(1h)

// ✅ CORRECT: Pipe operator required
requests | where timestamp > ago(1h)

// ❌ WRONG: Invalid column name
requests | where requestName == "GET /api/orders"

// ✅ CORRECT: Column name is "name", not "requestName"
requests | where name == "GET /api/orders"
```

---

#### Error: "Query timeout"

**Cause:** Query is too slow or returning too much data.

**Solution:**
1. Reduce timespan (e.g., `PT1H` instead of `P7D`)
2. Add `take` operator to limit rows: `| take 1000`
3. Use `where` clauses early in query
4. Avoid expensive operations (`join`, `union` on large tables)
5. Use `summarize` for aggregation instead of returning all rows

---

### Rate Limiting

#### Error: "429 Too Many Requests"

**Cause:** Exceeded Application Insights API rate limits.

**Solution:**

**For API Key Auth (15 req/min, 1500 req/day):**
1. **Upgrade to Entra ID** (60 req/min, no daily cap)
2. Implement rate limiting in client
3. Add delay between requests
4. Cache query results

**For Entra ID Auth (60 req/min):**
1. Implement exponential backoff
2. Check `Retry-After` header in response
3. Cache frequently accessed data
4. Reduce query frequency

**Rate Limit Headers:**
- `X-RateLimit-Limit`: Total requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets

---

**For additional help:**
- Azure Application Insights Documentation: https://docs.microsoft.com/azure/azure-monitor/app/app-insights-overview
- KQL Query Language Reference: https://docs.microsoft.com/azure/data-explorer/kusto/query/
- GitHub Issues: https://github.com/anthropics/mcp-consultant-tools/issues

---
