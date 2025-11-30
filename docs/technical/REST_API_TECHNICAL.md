# REST API Technical Implementation Guide

This document provides detailed technical implementation information for developers working with the `@mcp-consultant-tools/rest-api` package.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Client                              │
│                   (Claude, etc.)                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ stdio (JSON-RPC)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server Layer                          │
│                      (index.ts)                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Tool Handlers:                                       │   │
│  │  - rest-request                                       │   │
│  │  - rest-config                                        │   │
│  │  - rest-refresh-token                                 │   │
│  │  - rest-batch-request                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Prompt Handlers:                                     │   │
│  │  - rest-api-guide                                     │   │
│  │  - rest-api-troubleshoot                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ TypeScript
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Service Layer                              │
│                (RestApiService.ts)                           │
│  ┌──────────────────────┐  ┌─────────────────────────────┐ │
│  │  Token Management    │  │  HTTP Request Execution     │ │
│  │  - OAuth2 flow       │  │  - fetch() with timeout     │ │
│  │  - Token caching     │  │  - Header injection         │ │
│  │  - Auto-refresh      │  │  - Response processing      │ │
│  └──────────────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   External API                               │
│           (Data API Builder, REST services, etc.)            │
└─────────────────────────────────────────────────────────────┘
```

## Service Implementation

### RestApiService Class

The `RestApiService` class encapsulates all REST API functionality:

```typescript
interface RestApiConfig {
  baseUrl: string;
  responseSizeLimit?: number;    // Default: 10000 bytes
  enableSslVerify?: boolean;     // Default: true
  timeout?: number;              // Default: 30000ms
  bearerToken?: string;
  basicAuth?: { username: string; password: string };
  apiKey?: { headerName: string; value: string };
  oauth2?: {
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    scope: string;
    grantType?: string;          // Default: "client_credentials"
    additionalParams?: Record<string, string>;
  };
  customHeaders?: Record<string, string>;
}
```

### OAuth2 Client Credentials Flow

The OAuth2 implementation follows RFC 6749 Section 4.4:

```typescript
private async getOAuth2Token(): Promise<string> {
  // Check cached token validity (5 minute buffer before expiry)
  if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return this.cachedToken.accessToken;
  }

  // Build token request
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", oauth2.clientId);
  params.append("client_secret", oauth2.clientSecret);
  params.append("scope", oauth2.scope);

  // POST to token endpoint
  const response = await fetch(oauth2.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  // Parse and cache response
  const tokenResponse = await response.json();
  this.cachedToken = {
    accessToken: tokenResponse.access_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  };

  return this.cachedToken.accessToken;
}
```

### Token Caching Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                     Token Lifecycle                           │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  T=0          T=55min        T=60min (expiry)                │
│   │              │               │                            │
│   │   VALID      │  REFRESH      │  EXPIRED                   │
│   │   ZONE       │  ZONE         │                            │
│   │              │  (5min buffer)│                            │
│   ▼              ▼               ▼                            │
│  ┌──────────────┬───────────────┬──────────────────┐         │
│  │ Return       │ Acquire new   │ Acquire new      │         │
│  │ cached       │ token before  │ token            │         │
│  │ token        │ request       │                  │         │
│  └──────────────┴───────────────┴──────────────────┘         │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**Key Points:**
- Tokens are cached in memory only (not persisted)
- 5-minute buffer ensures tokens don't expire mid-request
- Failed token refresh throws error immediately
- `clearTokenCache()` forces immediate refresh

## Request Execution

### Request Pipeline

```typescript
async request(options: RequestOptions): Promise<RequestResult> {
  // 1. Normalize endpoint
  const normalizedEndpoint = `/${endpoint.replace(/^\/+|\/+$/g, "")}`;

  // 2. Build URL
  const fullUrl = `${baseUrl}${normalizedEndpoint}`;

  // 3. Merge headers (custom → request → auth)
  const headers = { ...customHeaders, ...requestHeaders };

  // 4. Add auth header
  const authHeader = await this.getAuthHeader();
  if (authHeader) headers[authHeader.name] = authHeader.value;

  // 5. Execute with timeout
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);

  // 6. Process response
  const response = await fetch(fullUrl, { ...options, signal: controller.signal });

  // 7. Apply size limit
  if (bodySize > sizeLimit) {
    responseBody = responseBody.slice(0, sizeLimit);
  }

  return { request, response, validation };
}
```

### Header Sanitization

Headers are sanitized before returning to prevent credential exposure:

```typescript
private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const safeHeaders = new Set([
    "accept", "accept-language", "content-type",
    "user-agent", "cache-control", "if-match", "if-none-match"
  ]);

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      sanitized[key] = "[REDACTED]";
    } else if (safeHeaders.has(key.toLowerCase())) {
      sanitized[key] = value;
    } else {
      sanitized[key] = "[REDACTED]";
    }
  }
  return sanitized;
}
```

## Tool Implementation Details

### rest-request Tool

The primary tool for executing HTTP requests:

```typescript
server.tool(
  "rest-request",
  "Test a REST API endpoint with automatic authentication...",
  {
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
    endpoint: z.string(),
    body: z.any().optional(),
    headers: z.record(z.string()).optional(),
    host: z.string().optional(),
  },
  async ({ method, endpoint, body, headers, host }) => {
    // Validate endpoint format
    if (/^(https?:\/\/|www\.)/i.test(endpoint)) {
      throw new Error("Invalid endpoint format...");
    }

    const result = await service.request({ method, endpoint, body, headers, host });
    return createSuccessResponse(result);
  }
);
```

### rest-batch-request Tool

Executes multiple requests with optional error handling:

```typescript
server.tool(
  "rest-batch-request",
  "Execute multiple REST API requests sequentially...",
  {
    requests: z.array(z.object({...})),
    stopOnError: z.boolean().optional(),
  },
  async ({ requests, stopOnError = false }) => {
    const results = [];

    for (let i = 0; i < requests.length; i++) {
      try {
        const result = await service.request(requests[i]);
        results.push({ index: i, success: !result.validation.isError, result });

        if (stopOnError && result.validation.isError) break;
      } catch (error) {
        results.push({ index: i, success: false, error: error.message });
        if (stopOnError) break;
      }
    }

    return createSuccessResponse({
      totalRequests: requests.length,
      executedRequests: results.length,
      successfulRequests: results.filter(r => r.success).length,
      results,
    });
  }
);
```

## Environment Configuration

### Configuration Priority

```typescript
function buildConfigFromEnv(): RestApiConfig {
  // 1. OAuth2 (highest priority)
  if (OAUTH2_TOKEN_URL && OAUTH2_CLIENT_ID && OAUTH2_CLIENT_SECRET && OAUTH2_SCOPE) {
    config.oauth2 = {...};
  }
  // 2. Static bearer
  else if (AUTH_BEARER) {
    config.bearerToken = AUTH_BEARER;
  }
  // 3. Basic auth
  else if (AUTH_BASIC_USERNAME && AUTH_BASIC_PASSWORD) {
    config.basicAuth = {...};
  }
  // 4. API key
  else if (AUTH_APIKEY_HEADER_NAME && AUTH_APIKEY_VALUE) {
    config.apiKey = {...};
  }
}
```

### Custom Header Parsing

Headers are parsed from `HEADER_*` environment variables:

```typescript
function getCustomHeadersFromEnv(): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (/^HEADER_/i.test(key) && value !== undefined) {
      // HEADER_Accept → Accept
      const headerName = key.replace(/^HEADER_/i, "");
      headers[headerName] = value;
    }
  }

  return headers;
}
```

## Error Handling

### Error Categories

1. **Configuration Errors** - Missing required environment variables
2. **Authentication Errors** - OAuth2/credential failures
3. **Network Errors** - Connection, timeout, DNS failures
4. **HTTP Errors** - 4xx/5xx responses (not thrown, returned in result)

### Error Response Format

```typescript
interface ErrorResponse {
  content: [{
    type: "text",
    text: "Error during rest-request: OAuth2 token request failed: 401 Unauthorized"
  }],
  isError: true
}
```

## Response Size Limiting

Response bodies are truncated when exceeding the configured limit:

```typescript
const bodySize = Buffer.from(responseText).length;
const sizeLimit = config.responseSizeLimit || 10000;

if (bodySize > sizeLimit) {
  responseBody = responseBody.slice(0, sizeLimit);
  validation.messages.push(
    `Response truncated: ${sizeLimit} of ${bodySize} bytes returned`
  );
  validation.truncated = {
    originalSize: bodySize,
    returnedSize: sizeLimit,
    truncationPoint: sizeLimit,
    sizeLimit,
  };
}
```

## SSL/TLS Configuration

### Disabling Certificate Verification

For development with self-signed certificates:

```typescript
if (!config.enableSslVerify) {
  this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
}
```

**Warning:** Never disable in production environments.

## Testing

### Local Testing

```bash
# Build
cd packages/rest-api
npm run build

# Test with .env file
node --env-file=.env build/index.js

# Test specific tool via MCP inspector
npx @modelcontextprotocol/inspector build/index.js
```

### Test Environment Variables

```bash
# Minimal test configuration
REST_BASE_URL=https://httpbin.org

# With OAuth2 (for Azure/Entra ID)
REST_BASE_URL=https://your-api.azurewebsites.net
OAUTH2_TOKEN_URL=https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
OAUTH2_CLIENT_ID=test-client-id
OAUTH2_CLIENT_SECRET=test-secret
OAUTH2_SCOPE=api://test-app/.default
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@mcp-consultant-tools/core` | Shared utilities, MCP helpers |
| `@modelcontextprotocol/sdk` | MCP protocol implementation |
| `zod` | Input validation schemas |

## Performance Considerations

1. **Token Caching** - Reduces auth overhead to ~1 request per hour
2. **Response Limits** - Prevents memory exhaustion
3. **Timeout Control** - Prevents hung requests
4. **Lazy Initialization** - Service created on first use only

## Future Enhancements

- [ ] Response caching for repeated requests
- [ ] Rate limiting support
- [ ] Request retry with backoff
- [ ] Response streaming for large payloads
- [ ] OpenAPI specification integration
