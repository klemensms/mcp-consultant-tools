# Application Insights Integration - Technical Documentation

**Part of**: [MCP Consultant Tools](../../README.md)
**Related Documentation**:
- [User Guide](../documentation/APPLICATION_INSIGHTS.md)
- [Main Technical Guide](../../CLAUDE.md)
- [Log Analytics Technical Guide](./LOG_ANALYTICS_TECHNICAL.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
   - [Service Class](#service-class)
   - [Authentication Methods](#authentication-methods)
   - [Configuration](#configuration)
3. [Available Tools](#available-tools)
4. [Available Prompts](#available-prompts)
5. [Telemetry Tables](#telemetry-tables)
6. [Service Integration](#service-integration)
   - [Configuration Parsing](#configuration-parsing)
   - [Lazy Initialization Pattern](#lazy-initialization-pattern)
   - [Helper Methods](#helper-methods)
   - [Formatting Utilities](#formatting-utilities)
7. [Use Cases](#use-cases)
   - [Exception Analysis](#exception-analysis)
   - [Performance Analysis](#performance-analysis)
   - [Dependency Monitoring](#dependency-monitoring)
   - [Troubleshooting](#troubleshooting)
   - [Availability Monitoring](#availability-monitoring)
8. [Error Handling](#error-handling)
   - [Authentication Errors](#authentication-errors-401403)
   - [Rate Limiting](#rate-limiting-429)
   - [Query Errors](#query-errors)
   - [Resource Errors](#resource-errors)
9. [Security Considerations](#security-considerations)
   - [Credential Management](#credential-management)
   - [Query Safety](#query-safety)
   - [Data Sanitization](#data-sanitization)
   - [RBAC and Permissions](#rbac-and-permissions)
10. [Query Optimization](#query-optimization)
    - [Timespan Conversion](#timespan-conversion)
    - [Common Timespan Presets](#common-timespan-presets)
    - [Query Best Practices](#query-best-practices)

---

## Overview

The Application Insights integration enables AI assistants to query and analyze application telemetry data, including exceptions, performance metrics, dependencies, traces, and availability results. The integration supports multiple Application Insights resources with active/inactive toggles for quick configuration changes.

## Architecture

The Application Insights integration provides access to Azure Application Insights telemetry through the Application Insights Query API using KQL (Kusto Query Language).

### Service Class

**Service Class:** `ApplicationInsightsService` ([src/ApplicationInsightsService.ts](../../src/ApplicationInsightsService.ts))
- Manages authentication (Entra ID OAuth or API Key)
- Executes KQL queries via Application Insights Query API
- Provides helper methods for common troubleshooting scenarios
- Supports multiple Application Insights resources with active/inactive flags

### Authentication Methods

1. **Microsoft Entra ID (OAuth 2.0)** - Recommended for production
   - Higher rate limits (60 requests/minute per user)
   - No daily cap
   - Better security (token-based, automatic expiry)
   - Uses `@azure/msal-node` (same pattern as PowerPlatform)
   - Requires "Monitoring Reader" role on Application Insights resources

2. **API Key Authentication** - Simpler for single resources
   - Lower rate limits (15 requests/minute per key)
   - Daily cap of 1,500 requests per key
   - Requires "Read telemetry" permission

### Configuration

Supports two configuration modes:
1. Multi-resource (JSON array in `APPINSIGHTS_RESOURCES`)
2. Single-resource fallback (`APPINSIGHTS_APP_ID`)

Each resource has an `active` flag for quick toggling without removing configuration.

## Available Tools

**10 tools total:**

1. **`appinsights-list-resources`** - List configured resources (active and inactive)
2. **`appinsights-get-metadata`** - Get schema metadata (tables and columns)
3. **`appinsights-execute-query`** - Execute custom KQL queries
4. **`appinsights-get-exceptions`** - Get recent exceptions with types and messages
5. **`appinsights-get-slow-requests`** - Get slow HTTP requests (configurable threshold)
6. **`appinsights-get-operation-performance`** - Get performance summary (count, avg, p50/p95/p99)
7. **`appinsights-get-failed-dependencies`** - Get failed external calls (APIs, databases)
8. **`appinsights-get-traces`** - Get diagnostic traces filtered by severity (0-4)
9. **`appinsights-get-availability`** - Get availability test results and uptime stats
10. **`appinsights-get-custom-events`** - Get custom application events

## Available Prompts

**5 prompts total:**

1. **`appinsights-exception-summary`** - Exception summary report with insights and recommendations
2. **`appinsights-performance-report`** - Performance analysis with slowest operations and recommendations
3. **`appinsights-dependency-health`** - Dependency health with success rates and recommendations
4. **`appinsights-availability-report`** - Availability and uptime report with test results
5. **`appinsights-troubleshooting-guide`** - Comprehensive troubleshooting combining all telemetry sources

## Telemetry Tables

Application Insights stores data in the following tables:

| Table | Description | Common Queries |
|-------|-------------|----------------|
| `requests` | Incoming HTTP requests | Performance, error rates |
| `dependencies` | Outbound calls (APIs, DBs) | External service issues, latency |
| `exceptions` | Application exceptions | Error troubleshooting, stability |
| `traces` | Diagnostic logs | Debug output, informational logs |
| `customEvents` | Custom events | Feature usage, business events |
| `customMetrics` | Custom metrics | Business KPIs, counters |
| `pageViews` | Client page views | User behavior, frontend perf |
| `browserTimings` | Client performance | Frontend load times |
| `availabilityResults` | Availability tests | Uptime monitoring |
| `performanceCounters` | System performance | CPU, memory, disk |

## Service Integration

### Configuration Parsing

**Configuration Parsing** ([src/index.ts](../../src/index.ts)):
```typescript
// Multi-resource configuration
APPINSIGHTS_RESOURCES=[{"id":"prod-api","name":"Production API","appId":"xxx","active":true}]

// Or single-resource fallback
APPINSIGHTS_APP_ID=xxx
APPINSIGHTS_API_KEY=xxx
```

### Lazy Initialization Pattern

- Service initialized on first tool/prompt invocation
- Validates configuration before initialization
- Caches access tokens with automatic refresh (5-minute buffer)

### Helper Methods

All helper methods are in `ApplicationInsightsService`:
- `getRecentExceptions()` - Recent exceptions by timestamp
- `getSlowRequests()` - Requests above duration threshold
- `getFailedDependencies()` - Failed external calls
- `getOperationPerformance()` - Performance aggregates by operation
- `getTracesBySeverity()` - Traces filtered by severity level
- `getAvailabilityResults()` - Availability test summaries
- `getCustomEvents()` - Custom event queries

### Formatting Utilities

**Formatting Utilities** ([src/utils/appinsights-formatters.ts](../../src/utils/appinsights-formatters.ts)):
- `formatTableAsMarkdown()` - Convert query results to markdown tables
- `analyzeExceptions()` - Extract insights from exception data
- `analyzePerformance()` - Extract insights from performance data
- `analyzeDependencies()` - Extract insights from dependency data

## Use Cases

### Exception Analysis

- Recent exceptions by type and frequency
- Exception stack traces and messages
- Exception trends over time
- Operation-level exception analysis

### Performance Analysis

- Slowest operations (requests and dependencies)
- Request duration percentiles (p50, p95, p99)
- Operations by call count
- Performance regression detection

### Dependency Monitoring

- Failed dependency calls with targets
- Slow external dependencies
- Dependency success rates
- External service health verification

### Troubleshooting

- Comprehensive troubleshooting guides
- Operation-level analysis using operation_Id correlation
- Timeline analysis for deployment correlation
- Multi-source telemetry correlation

### Availability Monitoring

- Availability test results
- Uptime percentage calculation
- Failed test analysis
- Geographic availability patterns

## Error Handling

The service implements comprehensive error handling:

### Authentication Errors (401/403)

- Clear messages about missing credentials
- Permission requirements (Monitoring Reader role)
- Configuration validation

### Rate Limiting (429)

- Retry-after header parsing
- Clear messages about current limits
- Recommendations for auth method upgrade

### Query Errors

- KQL syntax error detection with hints
- Semantic error detection (invalid columns/tables)
- Timeout handling (30-second default)
- Network error detection

### Resource Errors

- Resource not found with available resources list
- Inactive resource detection with activation instructions
- Configuration validation

## Security Considerations

### Credential Management

- Never log credentials
- Store tokens in memory only (never persist)
- Clear tokens on service disposal
- Support for `.env` files for local development

### Query Safety

- Read-only operations only (no write/update/delete)
- Query size limits (max 10KB)
- Result size limits (max 10,000 rows)
- No dangerous KQL keywords allowed

### Data Sanitization

- Sanitize error messages (remove connection strings, API keys)
- Redact sensitive data in query results (optional)
- Truncate large results automatically

### RBAC and Permissions

For Entra ID authentication, the service principal must have:
- "Monitoring Reader" or "Reader" role on Application Insights resource
- Role can be assigned at resource or resource group level

For API Key authentication:
- API key must have "Read telemetry" permission
- Keys can be scoped to specific resources

## Query Optimization

### Timespan Conversion

The service converts ISO 8601 durations (PT1H, P1D) to KQL format (1h, 1d) automatically.

### Common Timespan Presets

- `PT15M` → 15 minutes
- `PT1H` → 1 hour
- `PT12H` → 12 hours
- `P1D` → 1 day
- `P7D` → 7 days

### Query Best Practices

- Use `summarize` and `top` operators to limit result sizes
- Set reasonable time ranges
- Cache metadata queries
- Use `take` to limit row counts

---

**Last Updated**: 2025-11-13
**Related Files**:
- [ApplicationInsightsService.ts](../../src/ApplicationInsightsService.ts)
- [appinsights-formatters.ts](../../src/utils/appinsights-formatters.ts)
- [index.ts](../../src/index.ts)
