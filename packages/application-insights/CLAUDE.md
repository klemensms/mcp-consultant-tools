# Application Insights Package Guide

## Overview

Azure Application Insights integration for telemetry analysis and exception tracking.

- **Tools:** 10 tools, 5 prompts
- **Authentication:** Entra ID (recommended) or API Key

## Environment Configuration

```bash
# Authentication method
APPINSIGHTS_AUTH_METHOD=entra-id  # or 'api-key'

# Entra ID authentication (recommended - higher rate limits)
APPINSIGHTS_TENANT_ID=your-azure-tenant-id
APPINSIGHTS_CLIENT_ID=your-azure-app-client-id
APPINSIGHTS_CLIENT_SECRET=your-azure-app-client-secret

# Multi-resource configuration (JSON array)
APPINSIGHTS_RESOURCES=[{"id":"prod-api","name":"Production API","appId":"your-app-id","active":true}]

# Single resource fallback
APPINSIGHTS_APP_ID=your-app-id
APPINSIGHTS_API_KEY=your-api-key
```

## Key Tools

- `query-application-insights` - Run KQL queries
- `get-exceptions` - Retrieve exception telemetry
- `get-requests` - Retrieve request telemetry
- `get-dependencies` - Retrieve dependency calls
- `get-traces` - Retrieve trace logs
- `get-custom-events` - Retrieve custom events

## KQL Query Examples

```kusto
// Failed requests in last hour
requests
| where success == false
| where timestamp > ago(1h)
| summarize count() by name

// Exception breakdown
exceptions
| summarize count() by type, outerMessage
| order by count_ desc
```

## Reference

See `docs/technical/APPLICATION_INSIGHTS_TECHNICAL.md` for detailed implementation.

## CLI Usage

Binary: `mcp-appins-cli`

```bash
# Query Application Insights
mcp-appins-cli appinsights query prod-api "requests | take 10"

# Get exceptions
mcp-appins-cli appinsights exceptions prod-api --timespan PT1H
```
