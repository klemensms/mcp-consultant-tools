# Service Bus Package Guide

## Overview

Azure Service Bus integration for read-only message inspection and DLQ analysis.

- **Tools:** 8 tools, 5 prompts
- **Authentication:** Entra ID (recommended) or Connection String
- **Read-Only:** Message peek only, no receive/delete

## Environment Configuration

```bash
# Authentication method
SERVICEBUS_AUTH_METHOD=entra-id  # or 'connection-string'

# Entra ID authentication (recommended)
SERVICEBUS_TENANT_ID=your-azure-tenant-id
SERVICEBUS_CLIENT_ID=your-azure-app-client-id
SERVICEBUS_CLIENT_SECRET=your-azure-app-client-secret

# Multi-namespace configuration (JSON array)
SERVICEBUS_RESOURCES=[{"id":"prod","name":"Production","namespace":"prod-namespace.servicebus.windows.net","active":true}]

# Single namespace fallback
SERVICEBUS_NAMESPACE=prod-namespace.servicebus.windows.net
SERVICEBUS_CONNECTION_STRING=Endpoint=sb://...

# Security options
SERVICEBUS_SANITIZE_MESSAGES=false  # Set true for PII protection
SERVICEBUS_MAX_PEEK_MESSAGES=100
SERVICEBUS_MAX_SEARCH_MESSAGES=500
```

## Key Tools

- `list-queues` - List available queues
- `peek-messages` - Peek queue messages (non-destructive)
- `peek-dlq` - Peek dead-letter queue
- `get-queue-health` - Queue statistics
- `search-messages` - Search by content/properties

## DLQ Analysis

Dead-letter queue inspection for troubleshooting:
- View failed messages without removal
- Analyze failure reasons
- Track message patterns

## Reference

See `docs/technical/SERVICE_BUS_TECHNICAL.md` for detailed implementation.

## CLI Usage

Binary: `mcp-sb-cli`

```bash
# List queues
mcp-sb-cli namespace list-queues prod

# Peek messages
mcp-sb-cli queue peek prod my-queue --max-count 10
```
