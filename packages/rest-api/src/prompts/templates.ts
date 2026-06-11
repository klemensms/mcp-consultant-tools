/**
 * REST API prompt templates
 */

export function getRestApiGuidePrompt(): string {
  return `# REST API Testing Guide

## Overview

This MCP server enables testing REST API endpoints with comprehensive authentication support, including automatic JWT token generation via OAuth2 client credentials flow.

## Available Tools

### 1. rest-request
Execute a single HTTP request to any REST endpoint.

**Parameters:**
- \`method\`: HTTP method (GET, POST, PUT, DELETE, PATCH)
- \`endpoint\`: API path (e.g., "/users", "/api/v1/orders")
- \`body\`: Request body for POST/PUT/PATCH (optional)
- \`headers\`: Additional headers (optional)
- \`host\`: Override base URL (optional)

**Example:**
\`\`\`json
{
  "method": "POST",
  "endpoint": "/api/users",
  "body": { "name": "John", "email": "john@example.com" }
}
\`\`\`

### 2. rest-config
Get current service configuration summary.

### 3. rest-refresh-token
Force refresh OAuth2 token (clears cache).

### 4. rest-batch-request
Execute multiple requests sequentially.

## Authentication Methods

### OAuth2 Client Credentials (Recommended for APIs)
Automatically acquires and caches JWT tokens. Tokens are refreshed when expired.

Required environment variables:
- \`OAUTH2_TOKEN_URL\`: Token endpoint URL
- \`OAUTH2_CLIENT_ID\`: Client ID
- \`OAUTH2_CLIENT_SECRET\`: Client secret
- \`OAUTH2_SCOPE\`: OAuth2 scope

### Static Bearer Token
For pre-acquired tokens:
- \`AUTH_BEARER\`: The bearer token value

### Basic Authentication
- \`AUTH_BASIC_USERNAME\`: Username
- \`AUTH_BASIC_PASSWORD\`: Password

### API Key
- \`AUTH_APIKEY_HEADER_NAME\`: Header name
- \`AUTH_APIKEY_VALUE\`: API key value

## Configuration

### Required
- \`REST_BASE_URL\`: Base URL for all requests

### Optional
- \`REST_RESPONSE_SIZE_LIMIT\`: Max response size in bytes (default: 10000)
- \`REST_ENABLE_SSL_VERIFY\`: SSL verification (default: true)
- \`REST_TIMEOUT\`: Request timeout in ms (default: 30000)
- \`HEADER_*\`: Custom headers (e.g., HEADER_Accept=application/json)

## Best Practices

1. **Use OAuth2 for production APIs** - Automatic token management
2. **Set appropriate response limits** - Prevent memory issues
3. **Use custom headers wisely** - Don't put secrets in headers
4. **Enable SSL verification** - Only disable for development
`;
}

export function getRestApiTroubleshootPrompt(): string {
  return `# REST API Troubleshooting Guide

## Common Issues and Solutions

### 1. Authentication Failures

**Symptom:** 401 Unauthorized or 403 Forbidden responses

**Solutions:**
- For OAuth2: Check token URL, client ID, client secret, and scope
- Use \`rest-refresh-token\` to force a new token
- Verify scope matches API requirements
- Check if credentials have expired

### 2. Connection Issues

**Symptom:** ECONNREFUSED, ETIMEDOUT, or network errors

**Solutions:**
- Verify REST_BASE_URL is correct
- Check if API is accessible from your network
- For self-signed certs, set REST_ENABLE_SSL_VERIFY=false (dev only)
- Increase REST_TIMEOUT for slow APIs

### 3. Response Truncation

**Symptom:** Response body appears cut off

**Solution:** Increase REST_RESPONSE_SIZE_LIMIT environment variable

### 4. Token Expiration

**Symptom:** Requests work initially then fail with 401

**Solution:**
- OAuth2 tokens are auto-refreshed, but you can force with rest-refresh-token
- For static bearer tokens, manually update AUTH_BEARER

### 5. CORS Issues

**Note:** MCP servers run server-side, so CORS doesn't apply.
If you see CORS-related errors, the issue is elsewhere.

## Debugging Steps

1. Use \`rest-config\` to verify current configuration
2. Try a simple GET request first
3. Check response timing for network issues
4. Examine response headers for error details
5. Use \`rest-refresh-token\` if auth seems stale

## Environment Variable Reference

\`\`\`bash
# Required
REST_BASE_URL=https://api.example.com

# OAuth2 (recommended)
OAUTH2_TOKEN_URL=https://login.example.com/oauth2/token
OAUTH2_CLIENT_ID=your-client-id
OAUTH2_CLIENT_SECRET=your-secret
OAUTH2_SCOPE=api://your-app/.default

# Alternative: Static bearer
AUTH_BEARER=your-token

# Alternative: Basic auth
AUTH_BASIC_USERNAME=user
AUTH_BASIC_PASSWORD=pass

# Alternative: API key
AUTH_APIKEY_HEADER_NAME=X-Api-Key
AUTH_APIKEY_VALUE=your-key

# Optional settings
REST_RESPONSE_SIZE_LIMIT=50000
REST_ENABLE_SSL_VERIFY=true
REST_TIMEOUT=60000

# Custom headers
HEADER_Accept=application/json
HEADER_X-Custom=value
\`\`\`
`;
}
