# REST API - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/REST_API.md -->

<overview>

The `@mcp-consultant-tools/rest-api` package provides 6 MCP tools and 2 prompts for making arbitrary HTTP calls. It supports four authentication methods with automatic OAuth2 client credentials flow, configurable response size limits, persistent custom headers via `HEADER_*` env vars, and optional OpenAPI/Swagger-based endpoint discovery.

**Binaries:**
- MCP server: `mcp-rest-api`
- CLI: `mcp-rest-api-cli`

**Tool count:** 6 tools, 2 prompts

</overview>

<architecture>

```
MCP Client (Claude, etc.)
        │ stdio (JSON-RPC)
        ▼
MCP Server Layer (index.ts)
  ├── Tools: rest-request, rest-config, rest-refresh-token,
  │          rest-batch-request, rest-list-endpoints, rest-get-schema
  └── Prompts: rest-api-guide, rest-api-troubleshoot
        │ TypeScript
        ▼
Service Layer (RestApiService)
  ├── Token management (OAuth2 flow, caching, auto-refresh)
  ├── HTTP request execution (fetch() + AbortController timeout)
  ├── Header injection and sanitization
  ├── Response size limiting and truncation
  └── OpenAPI spec fetching and caching
        │ HTTPS
        ▼
External API (Data API Builder, REST services, etc.)
```

**Package structure:**
```
packages/rest-api/src/
  index.ts                    # MCP entry point + registerRestApiTools()
  context-factory.ts          # Shared createServiceContext() for CLI
  types.ts                    # ServiceContext interface
  tool-examples.ts            # descWithExamples() + example arrays
  cli.ts                      # CLI entry point
  models/
    api-types.ts              # RestApiConfig, RequestOptions, RequestResult,
                              # EndpointDefinition, FieldDefinition, EntitySchema
  services/
    rest-api-service.ts       # RestApiService class (all HTTP logic)
    openapi-parser.ts         # OpenAPI/Swagger spec parser
  tools/
    rest-tools.ts             # registerRestTools()
  prompts/
    templates.ts              # getRestApiGuidePrompt(), getRestApiTroubleshootPrompt()
  cli/
    output.ts                 # Cache dir: .mcp-rest-api-cache
    commands/
      rest-commands.ts        # registerRestCommands()
```

</architecture>

<environment-configuration>

<required-variables>

| Variable | Description |
|----------|-------------|
| `REST_BASE_URL` | Base URL for all requests. Trailing slashes are stripped automatically. |

</required-variables>

<authentication>

Only one authentication method should be configured. Priority order when multiple are detected:

1. **OAuth2 client credentials** (highest priority)
2. **Static bearer token**
3. **Basic authentication**
4. **API key**

If multiple methods are configured, a warning is logged to stderr and only the highest-priority method is used.

<auth-method name="oauth2">

**Variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `OAUTH2_TOKEN_URL` | Yes | Token endpoint (e.g., `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`) |
| `OAUTH2_CLIENT_ID` | Yes | Client ID |
| `OAUTH2_CLIENT_SECRET` | Yes | Client secret |
| `OAUTH2_SCOPE` | Yes | OAuth2 scope (e.g., `api://your-app-id/.default`) |
| `OAUTH2_GRANT_TYPE` | No | Grant type (default: `client_credentials`) |
| `OAUTH2_ADDITIONAL_PARAMS` | No | JSON string of additional token request params (e.g., `{"resource":"https://api.example.com"}`) |

All four required variables (`OAUTH2_TOKEN_URL`, `OAUTH2_CLIENT_ID`, `OAUTH2_CLIENT_SECRET`, `OAUTH2_SCOPE`) must be present to activate OAuth2 mode. If any are missing, OAuth2 is not used and the next method in priority order is checked.

**Token lifecycle:** Token is POST-requested to `OAUTH2_TOKEN_URL` with `Content-Type: application/x-www-form-urlencoded`. The response `expires_in` field determines the cache duration. The token is refreshed when `expiresAt > Date.now() + 5 * 60 * 1000` (5-minute buffer). If the token response is missing `expires_in`, 3600 seconds (1 hour) is assumed.

</auth-method>

<auth-method name="bearer">

| Variable | Description |
|----------|-------------|
| `AUTH_BEARER` | Static JWT or bearer token value. Sent as `Authorization: Bearer {value}`. |

</auth-method>

<auth-method name="basic">

| Variable | Description |
|----------|-------------|
| `AUTH_BASIC_USERNAME` | Username |
| `AUTH_BASIC_PASSWORD` | Password |

Both must be set. Credentials are base64-encoded and sent as `Authorization: Basic {base64}`.

</auth-method>

<auth-method name="apikey">

| Variable | Description |
|----------|-------------|
| `AUTH_APIKEY_HEADER_NAME` | Header name to use (e.g., `X-Api-Key`) |
| `AUTH_APIKEY_VALUE` | API key value |

Both must be set. The key value is sent as-is in the specified header.

</auth-method>

</authentication>

<optional-variables>

| Variable | Default | Description |
|----------|---------|-------------|
| `REST_RESPONSE_SIZE_LIMIT` | `10000` | Max response body size in bytes before truncation |
| `REST_ENABLE_SSL_VERIFY` | `true` | Set to `false` to disable SSL certificate verification (dev only) |
| `REST_TIMEOUT` | `30000` | Request timeout in milliseconds |
| `REST_OPENAPI_URL` | — | URL to fetch OpenAPI/Swagger spec for endpoint discovery |

</optional-variables>

<custom-headers>

Any environment variable prefixed with `HEADER_` is parsed and injected into every outgoing request. The prefix is stripped to form the header name:

```
HEADER_Accept          → Accept: application/json
HEADER_X-API-Version   → X-API-Version: 2.0
HEADER_Custom-Client   → Custom-Client: my-client
```

Parsing is case-insensitive for the prefix (`HEADER_` or `header_` both work). These headers are applied before per-request headers, so per-request headers can override them.

</custom-headers>

</environment-configuration>

<tool-reference>

<tool name="rest-request">

**Description:** Execute a single HTTP request with automatic authentication. Returns full request/response details including timing and sanitized headers.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `method` | enum | Yes | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` |
| `endpoint` | string | Yes | Path only — do not include the full URL (e.g., `/api/users`). Full URLs are rejected with an error. |
| `body` | any | No | Request body for POST/PUT/PATCH. Objects are JSON-serialized. `Content-Type: application/json` is set automatically if not provided. |
| `headers` | object | No | Per-request headers. Merged on top of custom headers from env. Do not use for auth — configure auth via env vars. |
| `host` | string | No | Override base URL for this request only. Trailing slashes are stripped. |

**Validation:** If `endpoint` matches `/^(https?:\/\/|www\.)/i`, the tool returns an error immediately without making a request.

**Response structure:**
```json
{
  "request": {
    "url": "https://api.example.com/users",
    "method": "GET",
    "headers": { "Authorization": "[REDACTED]" },
    "body": null,
    "authMethod": "oauth2"
  },
  "response": {
    "statusCode": 200,
    "statusText": "OK",
    "timing": "245ms",
    "headers": { "content-type": "application/json" },
    "body": { ... }
  },
  "validation": {
    "isError": false,
    "messages": ["Request completed successfully"]
  }
}
```

`validation.isError` is `true` when `statusCode >= 400`. HTTP errors are not thrown — they are returned in the response with `isError: true`.

</tool>

<tool name="rest-config">

**Description:** Get the current service configuration summary. Safe to display — no secrets are included.

**Parameters:** None

**Response:**
```json
{
  "baseUrl": "https://api.example.com",
  "authMethod": "oauth2",
  "sslVerification": true,
  "responseSizeLimit": 10000,
  "customHeaderCount": 2,
  "oauth2TokenUrl": "https://login.microsoftonline.com/.../oauth2/v2.0/token",
  "openApiUrl": "https://api.example.com/swagger/v1/swagger.json"
}
```

`oauth2TokenUrl` and `openApiUrl` fields are only present when the respective config is active.

</tool>

<tool name="rest-refresh-token">

**Description:** Force refresh the OAuth2 access token by clearing the in-memory cache. A new token will be acquired on the next request. Only applicable when using OAuth2 authentication.

**Parameters:** None

**Behavior:** If the current auth method is not `oauth2`, returns an error: `Token refresh only available for OAuth2 authentication. Current auth method: {method}`.

**Response:**
```json
{
  "message": "OAuth2 token cache cleared. A new token will be acquired on the next request."
}
```

</tool>

<tool name="rest-batch-request">

**Description:** Execute multiple HTTP requests sequentially. Each request follows the same structure as `rest-request`. Results include a summary of success/failure counts.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `requests` | array | Yes | Array of request objects (same shape as `rest-request` params) |
| `stopOnError` | boolean | No | Stop on first failure (HTTP error or exception). Default: `false`. |

**Failure detection:** A request is considered failed if `validation.isError` is `true` (HTTP 4xx/5xx) or if an exception is thrown during execution.

**Response:**
```json
{
  "totalRequests": 3,
  "executedRequests": 3,
  "successfulRequests": 2,
  "results": [
    { "index": 0, "endpoint": "/users", "success": true, "result": { ... } },
    { "index": 1, "endpoint": "/orders", "success": true, "result": { ... } },
    { "index": 2, "endpoint": "/invalid", "success": false, "error": "404 Not Found" }
  ]
}
```

</tool>

<tool name="rest-list-endpoints">

**Description:** List all available REST API endpoints discovered from the OpenAPI/Swagger spec at `REST_OPENAPI_URL`. Requires `REST_OPENAPI_URL` to be configured; returns an empty list with an explanatory message if not set.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter` | string | No | Case-insensitive substring match against endpoint path, entity name, or description |

**Response:**
```json
{
  "baseUrl": "https://api.example.com",
  "endpointCount": 42,
  "endpoints": [
    {
      "path": "/users",
      "methods": ["GET", "POST"],
      "entityName": "User",
      "description": "User management endpoint"
    }
  ],
  "source": "OpenAPI spec from https://api.example.com/swagger/v1/swagger.json"
}
```

**OpenAPI caching:** The spec is fetched once and cached for 5 minutes (`OPENAPI_CACHE_TTL = 5 * 60 * 1000`). Concurrent fetch requests are deduplicated via a shared promise.

</tool>

<tool name="rest-get-schema">

**Description:** Get field definitions for a specific entity from the OpenAPI spec. Returns field names, types, required status, nullable status, and any foreign key or enum constraints. Requires `REST_OPENAPI_URL`.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `entity` | string | Yes | Entity name — singular or plural, case-insensitive |

**Entity matching:** Checks `key`, `entityName`, and `pluralName` fields in the parsed schema (all lowercased for comparison).

**Response:**
```json
{
  "entityName": "User",
  "pluralName": "users",
  "endpoint": "/users",
  "primaryKey": "id",
  "fields": [
    {
      "name": "id",
      "type": "Guid",
      "required": false,
      "nullable": false
    },
    {
      "name": "email",
      "type": "string",
      "required": true,
      "nullable": false,
      "maxLength": 255
    }
  ],
  "example": { "email": "user@example.com" }
}
```

If `REST_OPENAPI_URL` is not configured, returns error: `No schema configuration available. Configure REST_OPENAPI_URL pointing to your API's OpenAPI/Swagger spec.`

If entity is not found, returns error: `Entity '{entity}' not found. Use rest-list-endpoints to see available entities.`

</tool>

</tool-reference>

<prompts>

| Prompt | Function | Content |
|--------|----------|---------|
| `rest-api-guide` | `getRestApiGuidePrompt()` | Overview of all tools, auth methods, configuration reference, and best practices |
| `rest-api-troubleshoot` | `getRestApiTroubleshootPrompt()` | Common issues (401, connection refused, truncation, token expiry), debugging steps, full env var reference |

</prompts>

<service-implementation>

<token-management>

Token caching is in-memory only (never persisted to disk). Server restart clears all cached tokens.

**OAuth2 flow (RFC 6749 Section 4.4):**
1. On each auth header request, check `cachedToken.expiresAt > Date.now() + 5 * 60 * 1000`
2. If valid, return cached token
3. Otherwise, POST to `OAUTH2_TOKEN_URL` with `grant_type`, `client_id`, `client_secret`, `scope`, and any `additionalParams`
4. Cache `access_token` with `expiresAt = Date.now() + expires_in * 1000`
5. If `expires_in` is absent, default to 3600 seconds

**Token refresh:** `clearTokenCache()` sets `this.cachedToken = null`. The next `getAuthHeader()` call triggers a fresh acquisition.

</token-management>

<request-pipeline>

Header merge order (later overrides earlier):
1. `config.customHeaders` (from `HEADER_*` env vars)
2. `requestHeaders` (per-request `headers` parameter)
3. Auth header (from configured auth method)
4. `Content-Type: application/json` (auto-added for POST/PUT/PATCH with body, if not already set)

Timeout is implemented via `AbortController`. `AbortError` is translated to: `Request timeout after {timeout}ms`.

</request-pipeline>

<header-sanitization>

All headers in responses are sanitized before returning:

- `Authorization` header → `[REDACTED]`
- API key header (matching `config.apiKey.headerName`) → `[REDACTED]`
- Safe headers (shown as-is): `accept`, `accept-language`, `content-type`, `user-agent`, `cache-control`, `if-match`, `if-none-match`, `if-modified-since`, `if-unmodified-since`
- All other headers → `[REDACTED]`

Per-request headers passed explicitly by the caller are shown unsanitized (the agent already knows what it sent).

</header-sanitization>

<response-truncation>

Response size is measured as `Buffer.from(responseText).length` (byte count, not character count).

When `bodySize > sizeLimit`:
- String bodies are sliced: `responseBody.slice(0, sizeLimit)`
- Object bodies are JSON-stringified then sliced
- `validation.messages` gets an additional entry: `Response truncated: {sizeLimit} of {bodySize} bytes returned due to size limit`
- `validation.truncated` is populated with `{ originalSize, returnedSize, truncationPoint, sizeLimit }`

</response-truncation>

<ssl-configuration>

When `REST_ENABLE_SSL_VERIFY=false`, a custom `https.Agent({ rejectUnauthorized: false })` is created in the constructor. This agent is used for all subsequent requests.

Warning: Never disable SSL verification in production environments.

</ssl-configuration>

<openapi-caching>

The OpenAPI spec is fetched from `REST_OPENAPI_URL` and cached with a 5-minute TTL. Concurrent fetch calls share a single `openApiFetchPromise` to avoid duplicate network requests. The cache is invalidated on `clearOpenApiCache()` (not currently exposed as an MCP tool).

</openapi-caching>

</service-implementation>

<error-handling>

<error-categories>

| Category | Behavior |
|----------|----------|
| Configuration error | Thrown at service init time (e.g., missing `REST_BASE_URL`) |
| Authentication error | Tool returns `isError: true` with OAuth2 error detail |
| Network error / timeout | Tool returns `isError: true` with timeout/connection message |
| HTTP 4xx/5xx | Returned in response with `validation.isError: true` — not thrown |
| OpenAPI fetch error | Tool returns `isError: true` with fetch error detail |

</error-categories>

All catch blocks in tool handlers call `createErrorResponse(error, 'tool-name')` which sets `isError: true` in the MCP response.

</error-handling>

<data-api-builder-integration>

Azure Data API Builder (DAB) APIs are a primary use case for this package. DAB exposes standard REST endpoints and optionally a GraphQL endpoint.

**Recommended configuration:**
```json
{
  "REST_BASE_URL": "https://your-dab-app.azurewebsites.net/api",
  "OAUTH2_TOKEN_URL": "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token",
  "OAUTH2_CLIENT_ID": "your-app-registration-client-id",
  "OAUTH2_CLIENT_SECRET": "your-client-secret",
  "OAUTH2_SCOPE": "api://your-dab-app-id/.default",
  "REST_OPENAPI_URL": "https://your-dab-app.azurewebsites.net/api/swagger/v1/swagger.json"
}
```

**Standard DAB REST patterns:**
```
GET  /entity-name          List all records
GET  /entity-name/id       Get by primary key
POST /entity-name          Create record
PUT  /entity-name/id       Full update
DELETE /entity-name/id     Delete record
```

**OData query parameters (append to endpoint):**
```
/products?$filter=price gt 100
/orders?$select=id,status&$top=10
/users?$orderby=createdAt desc
```

**GraphQL endpoint:**
```
POST /graphql
body: { "query": "{ entityName { field1 field2 } }" }
```

</data-api-builder-integration>

<cli-architecture>

The CLI reuses the same `RestApiService` and `ServiceContext` as the MCP server.

**Command groups:**

| Command | Maps to MCP Tool | Description |
|---------|-----------------|-------------|
| `request <method> <endpoint>` | `rest-request` | Execute HTTP request |
| `config` | `rest-config` | Show configuration summary |
| `refresh-token` | `rest-refresh-token` | Clear OAuth2 token cache |
| `batch <requests-json>` | `rest-batch-request` | Sequential batch requests |
| `list-endpoints` | `rest-list-endpoints` | List endpoints from OpenAPI spec |
| `get-schema <entity>` | `rest-get-schema` | Get entity field schema |

**CLI-specific behavior:**

- `batch` accepts either a JSON string or a file path. It tries `JSON.parse()` first, then falls back to `readFileSync()`.
- `request` accepts `-H key=value` (repeatable) for per-request headers. The collector splits on the first `=`, allowing values that contain `=`.
- Output: summary to stdout + full JSON cached to `.mcp-rest-api-cache/`
- Global flags: `--json` (raw JSON output), `--no-cache` (skip cache write), `--env-file <path>` (custom .env file)

**CLI examples:**
```bash
# GET request
mcp-rest-api-cli request GET /api/users

# POST with JSON body
mcp-rest-api-cli request POST /api/orders --body '{"productId":"123","quantity":2}'

# Request with custom headers
mcp-rest-api-cli request GET /api/users -H "X-Request-ID=abc123" -H "Accept-Language=en-US"

# Override base URL
mcp-rest-api-cli request GET /health --host https://staging-api.example.com

# Batch from JSON string
mcp-rest-api-cli batch '[{"method":"GET","endpoint":"/users"},{"method":"GET","endpoint":"/orders"}]'

# Batch from file
mcp-rest-api-cli batch ./requests.json --stop-on-error

# Configuration summary
mcp-rest-api-cli config

# Refresh OAuth2 token
mcp-rest-api-cli refresh-token

# List endpoints (with filter)
mcp-rest-api-cli list-endpoints --filter users

# Get entity schema
mcp-rest-api-cli get-schema User

# JSON output
mcp-rest-api-cli --json request GET /api/users
```

</cli-architecture>

<security>

- OAuth2 tokens are cached in memory only — never written to disk. Server restart clears all cached tokens.
- Authorization headers and API key headers are replaced with `[REDACTED]` in all tool responses.
- Do not store secrets in `HEADER_*` variables — use the dedicated auth env vars instead.
- `REST_ENABLE_SSL_VERIFY=false` disables certificate verification for all requests. Use only in development with self-signed certificates.
- Response bodies may contain sensitive data. Consider `REST_RESPONSE_SIZE_LIMIT` carefully — increasing the limit returns more data to the agent context.

</security>

<performance>

- **Token caching:** Reduces OAuth2 token acquisition to ~1 request per hour (or per token lifetime).
- **OpenAPI caching:** Spec is fetched once per 5 minutes; concurrent requests share a single fetch promise.
- **Response limits:** Prevents memory exhaustion from large API responses.
- **Timeout control:** `AbortController` ensures requests do not hang indefinitely.
- **Lazy initialization:** `RestApiService` is created on first tool call, not at server startup.

</performance>

<testing>

**Local testing:**
```bash
# Build
npm run build --workspace=packages/rest-api

# Test with public echo API (no auth required)
REST_BASE_URL=https://httpbin.org node packages/rest-api/build/index.js

# MCP inspector
npx @modelcontextprotocol/inspector packages/rest-api/build/index.js

# CLI help
node packages/rest-api/build/cli.js --help
node packages/rest-api/build/cli.js request --help
```

**Minimal .env for testing:**
```bash
REST_BASE_URL=https://httpbin.org
```

**Azure/Entra ID OAuth2 test config:**
```bash
REST_BASE_URL=https://your-api.azurewebsites.net
OAUTH2_TOKEN_URL=https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
OAUTH2_CLIENT_ID=test-client-id
OAUTH2_CLIENT_SECRET=test-secret
OAUTH2_SCOPE=api://test-app/.default
```

</testing>
