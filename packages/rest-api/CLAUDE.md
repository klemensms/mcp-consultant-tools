# REST API Package Guide

## Overview

Generic REST API testing with OAuth2 client credentials support.

- **Purpose:** Test arbitrary REST APIs with authentication
- **Authentication:** OAuth2, Bearer Token, Basic Auth, API Key
- **Discovery:** OpenAPI/Swagger integration

## Environment Configuration

```bash
# Required: Base URL
REST_BASE_URL=https://your-api.example.com/api

# OAuth2 Client Credentials (recommended for Azure/Entra ID)
OAUTH2_TOKEN_URL=https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
OAUTH2_CLIENT_ID=your-client-id
OAUTH2_CLIENT_SECRET=your-client-secret
OAUTH2_SCOPE=api://your-app-id/.default
OAUTH2_GRANT_TYPE=client_credentials

# Alternative: Static Bearer Token
# AUTH_BEARER=your-jwt-token

# Alternative: Basic Auth
# AUTH_BASIC_USERNAME=username
# AUTH_BASIC_PASSWORD=password

# Alternative: API Key
# AUTH_APIKEY_HEADER_NAME=X-Api-Key
# AUTH_APIKEY_VALUE=your-key

# Optional settings
REST_RESPONSE_SIZE_LIMIT=10000  # 10KB
REST_ENABLE_SSL_VERIFY=true
REST_TIMEOUT=30000

# Host-override allowlist (security). The per-request `host` parameter may only
# target the REST_BASE_URL origin by default — this stops the configured
# credentials being sent to an arbitrary host. List additional comma-separated
# origins here to permit them. Leave unset to lock to the base URL only.
# REST_ALLOWED_HOSTS=https://staging-api.example.com,https://other-api.example.com

# Custom headers (prefix with HEADER_)
HEADER_Accept=application/json

# OpenAPI discovery
REST_OPENAPI_URL=https://api.example.com/swagger/v1/swagger.json
```

## Key Tools

- `rest-get` - GET request
- `rest-post` - POST request
- `rest-put` - PUT request
- `rest-patch` - PATCH request
- `rest-delete` - DELETE request
- `list-endpoints` - List discovered endpoints (from OpenAPI)

## OAuth2 Token Caching

Tokens are automatically:
- Acquired on first request
- Cached until near expiration
- Refreshed transparently

## CLI Usage

Binary: `mcp-rest-api-cli`

```bash
# GET request
mcp-rest-api-cli rest get /api/users

# POST request
mcp-rest-api-cli rest post /api/users '{"name":"John"}'
```
