# REST API Integration Documentation

**Package:** `@mcp-consultant-tools/rest-api`

MCP server for REST API testing with comprehensive authentication support, including automatic OAuth2 client credentials flow for JWT token generation.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Setup Guide](#setup-guide)
- [Configuration Reference](#configuration-reference)
- [Authentication Methods](#authentication-methods)
- [Available Tools](#available-tools)
- [Available Prompts](#available-prompts)
- [Usage Examples](#usage-examples)
- [Data API Builder (DAB) Integration](#data-api-builder-dab-integration)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

---

## Overview

The REST API integration enables AI assistants to test and interact with HTTP REST endpoints. Unlike basic REST clients, this integration supports automatic JWT token generation via OAuth2 client credentials flow, making it ideal for enterprise APIs protected by Azure AD/Entra ID.

**Key differentiator:** Automatic token acquisition and caching - no need to manually obtain and manage bearer tokens.

### Tool & Prompt Summary

| Type | Count |
|------|-------|
| Tools | 4 |
| Prompts | 2 |

---

## Features

- **HTTP Methods**: Full support for GET, POST, PUT, DELETE, PATCH
- **OAuth2 Client Credentials**: Automatic JWT token acquisition with intelligent caching
- **Token Refresh**: Automatic refresh before expiration, manual refresh available
- **Multiple Auth Methods**: OAuth2, static bearer, basic auth, API key
- **Response Management**: Configurable size limits with smart truncation
- **SSL Control**: Enable/disable certificate verification
- **Custom Headers**: Configure persistent headers via environment variables
- **Batch Operations**: Execute multiple requests in sequence
- **Request Timing**: Detailed timing information for performance analysis

---

## Setup Guide

### Prerequisites

- Node.js 18.0.0 or higher
- API endpoint to test
- Authentication credentials (varies by method)

### Installation Options

#### Option 1: Run with npx (Recommended - macOS/Linux)

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/rest-api"],
      "env": {
        "REST_BASE_URL": "https://your-api.example.com"
      }
    }
  }
}
```

#### Option 2: Global Installation

```bash
npm install -g @mcp-consultant-tools/rest-api
```

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "mcp-rest-api",
      "env": {
        "REST_BASE_URL": "https://your-api.example.com"
      }
    }
  }
}
```

#### Option 3: Windows Installation

> **Note:** Due to path resolution issues on Windows, use the full path instead of npx.

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "node",
      "args": [
        "C:/Users/<YourUsername>/AppData/Roaming/npm/node_modules/@mcp-consultant-tools/rest-api/build/index.js"
      ],
      "env": {
        "REST_BASE_URL": "https://your-api.example.com"
      }
    }
  }
}
```

#### Option 4: Local Development

```bash
git clone https://github.com/klemensms/mcp-consultant-tools.git
cd mcp-consultant-tools
npm install
npm run build
```

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "node",
      "args": ["/path/to/mcp-consultant-tools/packages/rest-api/build/index.js"],
      "env": {
        "REST_BASE_URL": "https://your-api.example.com"
      }
    }
  }
}
```

### Configuration File Locations

| Platform | Client | Configuration Path |
|----------|--------|-------------------|
| **macOS** | Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **macOS** | Cline (VSCode) | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| **Windows** | Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Windows** | Cline (VSCode) | `C:\Users\<Username>\AppData\Roaming\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json` |
| **Linux** | Claude Desktop | `~/.config/Claude/claude_desktop_config.json` |

---

## Configuration Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `REST_BASE_URL` | Base URL for all API requests | `https://api.example.com/v1` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REST_RESPONSE_SIZE_LIMIT` | `10000` | Maximum response body size in bytes |
| `REST_ENABLE_SSL_VERIFY` | `true` | Enable SSL certificate verification |
| `REST_TIMEOUT` | `30000` | Request timeout in milliseconds |

### Custom Headers

Add persistent headers by prefixing with `HEADER_`:

```bash
HEADER_Accept=application/json
HEADER_X-Custom-Header=custom-value
HEADER_Cache-Control=no-cache
```

---

## Authentication Methods

### 1. OAuth2 Client Credentials (Recommended)

Best for enterprise APIs protected by Azure AD/Entra ID. Automatically acquires and caches JWT tokens.

```bash
# Required OAuth2 variables
OAUTH2_TOKEN_URL=https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token
OAUTH2_CLIENT_ID=your-client-id
OAUTH2_CLIENT_SECRET=your-client-secret
OAUTH2_SCOPE=api://your-app-id/.default

# Optional
OAUTH2_GRANT_TYPE=client_credentials  # Default
OAUTH2_ADDITIONAL_PARAMS={"resource":"https://api.example.com"}  # JSON string
```

**Token Caching:** Tokens are cached until 5 minutes before expiration, then automatically refreshed.

### 2. Static Bearer Token

For pre-acquired tokens or simple token-based APIs:

```bash
AUTH_BEARER=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Basic Authentication

For APIs using HTTP Basic auth:

```bash
AUTH_BASIC_USERNAME=your-username
AUTH_BASIC_PASSWORD=your-password
```

### 4. API Key Authentication

For APIs using custom header-based authentication:

```bash
AUTH_APIKEY_HEADER_NAME=X-Api-Key
AUTH_APIKEY_VALUE=your-api-key-value
```

### Authentication Priority

If multiple methods are configured, the order of precedence is:
1. OAuth2 Client Credentials
2. Static Bearer Token
3. Basic Authentication
4. API Key

---

## Available Tools

### rest-request

Execute a single HTTP request with automatic authentication.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `method` | enum | Yes | HTTP method: GET, POST, PUT, DELETE, PATCH |
| `endpoint` | string | Yes | API path (e.g., "/users", "/api/orders") |
| `body` | object/string | No | Request body for POST/PUT/PATCH |
| `headers` | object | No | Additional headers for this request |
| `host` | string | No | Override base URL for this request |

**Response Structure:**

```json
{
  "request": {
    "url": "https://api.example.com/users",
    "method": "GET",
    "headers": { "Authorization": "[REDACTED]" },
    "authMethod": "oauth2"
  },
  "response": {
    "statusCode": 200,
    "statusText": "OK",
    "timing": "245ms",
    "headers": { "content-type": "application/json" },
    "body": { "users": [...] }
  },
  "validation": {
    "isError": false,
    "messages": ["Request completed successfully"]
  }
}
```

---

### rest-config

Get the current service configuration summary.

**Parameters:** None

**Response:**

```json
{
  "baseUrl": "https://api.example.com",
  "authMethod": "oauth2",
  "sslVerification": true,
  "responseSizeLimit": 10000,
  "customHeaderCount": 2,
  "oauth2TokenUrl": "https://login.microsoftonline.com/.../oauth2/v2.0/token"
}
```

---

### rest-refresh-token

Force refresh the OAuth2 access token cache.

**Parameters:** None

**Response:**

```json
{
  "message": "OAuth2 token cache cleared. A new token will be acquired on the next request."
}
```

**Note:** Only applicable when using OAuth2 authentication.

---

### rest-batch-request

Execute multiple HTTP requests sequentially.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `requests` | array | Yes | Array of request configurations |
| `stopOnError` | boolean | No | Stop on first error (default: false) |

**Request Configuration:**
Each item in the array follows the same structure as `rest-request`.

**Response:**

```json
{
  "totalRequests": 3,
  "executedRequests": 3,
  "successfulRequests": 2,
  "results": [
    { "index": 0, "endpoint": "/users", "success": true, "result": {...} },
    { "index": 1, "endpoint": "/orders", "success": true, "result": {...} },
    { "index": 2, "endpoint": "/invalid", "success": false, "error": "404 Not Found" }
  ]
}
```

---

## Available Prompts

### rest-api-guide

Comprehensive guide for using the REST API testing tools. Includes:
- Tool descriptions and parameters
- Authentication method details
- Configuration options
- Best practices

### rest-api-troubleshoot

Troubleshooting guide for common issues:
- Authentication failures
- Connection problems
- Response truncation
- Token expiration

---

## Usage Examples

### Example 1: Simple GET Request

```json
{
  "method": "GET",
  "endpoint": "/users"
}
```

### Example 2: GET with Query Parameters

```json
{
  "method": "GET",
  "endpoint": "/users?role=admin&status=active"
}
```

### Example 3: POST with JSON Body

```json
{
  "method": "POST",
  "endpoint": "/api/orders",
  "body": {
    "productId": "123",
    "quantity": 2
  }
}
```

### Example 4: PUT Request (Update)

```json
{
  "method": "PUT",
  "endpoint": "/users/123",
  "body": {
    "name": "Updated Name",
    "status": "inactive"
  }
}
```

### Example 5: PATCH Request (Partial Update)

```json
{
  "method": "PATCH",
  "endpoint": "/users/123",
  "body": {
    "status": "active"
  }
}
```

### Example 6: DELETE Request

```json
{
  "method": "DELETE",
  "endpoint": "/users/123"
}
```

### Example 7: Override Base URL

Use the `host` parameter to send a request to a different server:

```json
{
  "method": "GET",
  "endpoint": "/health",
  "host": "https://staging-api.example.com"
}
```

> **Note:** The `host` must be a valid URL with protocol (http/https). Trailing slashes are removed automatically.

### Example 8: Custom Headers Per Request

```json
{
  "method": "GET",
  "endpoint": "/protected-resource",
  "headers": {
    "X-Request-ID": "test-123",
    "Accept-Language": "en-US",
    "X-Custom-Header": "custom-value"
  }
}
```

### Example 9: Batch Workflow

Execute multiple requests in sequence:

```json
{
  "requests": [
    { "method": "GET", "endpoint": "/products" },
    { "method": "POST", "endpoint": "/orders", "body": { "productId": "123" } },
    { "method": "GET", "endpoint": "/orders/latest" }
  ],
  "stopOnError": true
}
```

### Example 10: Full Configuration (MCP Client)

Complete configuration with all features:

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/rest-api"],
      "env": {
        "REST_BASE_URL": "https://api.example.com",
        "OAUTH2_TOKEN_URL": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        "OAUTH2_CLIENT_ID": "your-client-id",
        "OAUTH2_CLIENT_SECRET": "your-secret",
        "OAUTH2_SCOPE": "api://your-app/.default",
        "REST_ENABLE_SSL_VERIFY": "true",
        "REST_RESPONSE_SIZE_LIMIT": "50000",
        "REST_TIMEOUT": "60000",
        "HEADER_Accept": "application/json",
        "HEADER_X-API-Version": "2.0",
        "HEADER_Custom-Client": "my-client"
      }
    }
  }
}
```

---

## Response Format

All requests return a structured response with request details, response data, and validation info.

### Successful Response

```json
{
  "request": {
    "url": "https://api.example.com/users",
    "method": "GET",
    "headers": {
      "Accept": "application/json",
      "Authorization": "[REDACTED]"
    },
    "authMethod": "oauth2"
  },
  "response": {
    "statusCode": 200,
    "statusText": "OK",
    "timing": "245ms",
    "headers": {
      "content-type": "application/json",
      "x-request-id": "abc123"
    },
    "body": {
      "users": [...]
    }
  },
  "validation": {
    "isError": false,
    "messages": ["Request completed successfully"]
  }
}
```

### Error Response (HTTP 4xx/5xx)

```json
{
  "request": { ... },
  "response": {
    "statusCode": 404,
    "statusText": "Not Found",
    "timing": "52ms",
    "headers": { ... },
    "body": { "error": "User not found" }
  },
  "validation": {
    "isError": true,
    "messages": ["Request failed with status 404"]
  }
}
```

### Truncated Response

When response exceeds `REST_RESPONSE_SIZE_LIMIT`:

```json
{
  "request": { ... },
  "response": {
    "statusCode": 200,
    "statusText": "OK",
    "timing": "1250ms",
    "headers": { ... },
    "body": "[truncated data...]"
  },
  "validation": {
    "isError": false,
    "messages": [
      "Request completed successfully",
      "Response truncated: 10000 of 156000 bytes returned due to size limit"
    ],
    "truncated": {
      "originalSize": 156000,
      "returnedSize": 10000,
      "truncationPoint": 10000,
      "sizeLimit": 10000
    }
  }
}
```

### Header Sanitization

For security, sensitive headers are redacted in responses:
- `Authorization` header → `[REDACTED]`
- API key headers → `[REDACTED]`
- Custom headers with secrets → `[REDACTED]`

Safe headers are shown in full: `Accept`, `Content-Type`, `Cache-Control`, etc.

---

## Data API Builder (DAB) Integration

This integration is particularly useful for Azure Data API Builder (DAB) APIs.

### DAB Configuration Example

```json
{
  "mcpServers": {
    "dab-api": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/rest-api"],
      "env": {
        "REST_BASE_URL": "https://your-dab-app.azurewebsites.net/api",
        "OAUTH2_TOKEN_URL": "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token",
        "OAUTH2_CLIENT_ID": "your-app-registration-client-id",
        "OAUTH2_CLIENT_SECRET": "your-client-secret",
        "OAUTH2_SCOPE": "api://your-dab-app-id/.default"
      }
    }
  }
}
```

### DAB-Specific Queries

**GraphQL Endpoint:**
```
POST /graphql with body containing GraphQL query
```

**REST Endpoints:**
```
GET /entity-name          # List all
GET /entity-name/id       # Get by ID
POST /entity-name         # Create
PUT /entity-name/id       # Update
DELETE /entity-name/id    # Delete
```

### OData Query Parameters

DAB supports OData query parameters:

```
GET /products?$filter=price gt 100
GET /orders?$select=id,status&$top=10
GET /users?$orderby=createdAt desc
```

---

## Troubleshooting

### 401 Unauthorized

**Possible Causes:**
- Invalid or expired credentials
- Wrong OAuth2 scope
- Client ID/secret mismatch

**Solutions:**
1. Verify OAuth2 credentials in Azure portal
2. Use `rest-refresh-token` to clear cached token
3. Check scope format (usually `api://app-id/.default`)

### Connection Refused / Timeout

**Possible Causes:**
- Wrong base URL
- Network/firewall issues
- API server down

**Solutions:**
1. Verify `REST_BASE_URL` is correct
2. Test URL in browser/curl
3. Increase `REST_TIMEOUT` for slow APIs

### Response Truncated

**Cause:** Response exceeds `REST_RESPONSE_SIZE_LIMIT`

**Solution:** Increase limit:
```bash
REST_RESPONSE_SIZE_LIMIT=100000  # 100KB
```

### SSL Certificate Errors

**Cause:** Self-signed or invalid certificates

**Solution (Development Only):**
```bash
REST_ENABLE_SSL_VERIFY=false
```

**Warning:** Never disable in production!

### Token Refresh Issues

**Symptoms:** Requests work, then fail with 401

**Solutions:**
1. OAuth2 auto-refreshes, but try `rest-refresh-token`
2. Check token lifetime in Azure portal
3. Verify clock sync on server

---

## Security Considerations

### Credential Storage

- **Never commit credentials** to source control
- Use environment variables or secret management
- Rotate client secrets periodically

### SSL Verification

- **Always enable** SSL verification in production
- Only disable for development with self-signed certs
- Consider proper certificate chain for internal APIs

### Response Data

- Response bodies may contain sensitive data
- Be cautious with `REST_RESPONSE_SIZE_LIMIT` increases
- Review what data is being requested

### Token Security

- OAuth2 tokens are cached in memory only
- Tokens are not persisted to disk
- Server restart clears all cached tokens

### Header Security

- Auth headers are redacted in responses
- Avoid putting secrets in custom `HEADER_*` variables
- Use proper auth methods instead

---

## Version History

| Version | Changes |
|---------|---------|
| 22.0.0 | Initial release with OAuth2 client credentials support |
