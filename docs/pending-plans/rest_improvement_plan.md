# REST API Package Improvement Plan

**Package:** `@mcp-consultant-tools/rest-api`
**Created:** 2024-11-30
**Status:** Pending Implementation

This document tracks features from the original `dkmaker-mcp-rest-api` package that are not yet implemented in our REST API integration, plus additional enhancements identified during development.

---

## Missing Features from Original

### 1. MCP Resources (Documentation Endpoints)

**Priority:** Medium
**Effort:** Low

The original tool provides MCP resources that serve as in-context documentation:

```typescript
// Original resources
"rest-api://examples"         // Usage examples
"rest-api://response-format"  // Response format documentation
"rest-api://config"           // Configuration reference
```

**Implementation Plan:**

1. Add resource handlers to `index.ts`:

```typescript
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// In registerRestApiTools():
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "rest-api://examples",
      name: "REST API Usage Examples",
      description: "Detailed examples of using the REST API testing tool",
      mimeType: "text/markdown"
    },
    {
      uri: "rest-api://response-format",
      name: "Response Format Documentation",
      description: "Documentation of response structure and fields",
      mimeType: "text/markdown"
    },
    {
      uri: "rest-api://config",
      name: "Configuration Reference",
      description: "All configuration options and environment variables",
      mimeType: "text/markdown"
    }
  ]
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  // Read markdown from src/resources/ directory
});
```

2. Create resource files:
   - `src/resources/examples.md`
   - `src/resources/response-format.md`
   - `src/resources/config.md`

3. Update build to copy resources to `build/resources/`

**Why implement:** Enables AI assistants to read documentation in-context without external lookups.

---

## Additional Enhancements (Not in Original)

### 2. Request History Tool

**Priority:** Low
**Effort:** Medium

Add tool to view recent request history for debugging:

```typescript
server.tool(
  "rest-history",
  "Get history of recent REST API requests",
  { limit: z.number().optional() },
  async ({ limit = 10 }) => {
    return requestHistory.slice(-limit);
  }
);
```

**Benefits:**
- Debug failed requests
- Compare request/response patterns
- Audit API usage

---

### 3. Response Caching

**Priority:** Medium
**Effort:** Medium

Cache GET responses to reduce API calls:

```typescript
interface CacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  maxEntries: number;
}

// Environment variables
REST_CACHE_ENABLED=true
REST_CACHE_TTL=300
REST_CACHE_MAX_ENTRIES=100
```

**Benefits:**
- Faster repeated requests
- Reduced API rate limit usage
- Better for exploration workflows

---

### 4. Request Retry with Backoff

**Priority:** Medium
**Effort:** Low

Add automatic retry for transient failures:

```typescript
interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[]; // e.g., [429, 503, 504]
}

// Environment variables
REST_RETRY_MAX_ATTEMPTS=3
REST_RETRY_INITIAL_DELAY=1000
REST_RETRY_MAX_DELAY=10000
```

**Benefits:**
- Handle rate limits gracefully
- Survive temporary outages
- More reliable batch operations

---

### 5. OpenAPI/Swagger Integration

**Priority:** Low
**Effort:** High

Load OpenAPI spec for endpoint discovery:

```typescript
server.tool(
  "rest-discover",
  "Discover available endpoints from OpenAPI spec",
  { tag: z.string().optional() },
  async ({ tag }) => {
    // Parse OpenAPI spec and return matching endpoints
  }
);

// Environment variable
REST_OPENAPI_URL=https://api.example.com/openapi.json
```

**Benefits:**
- Auto-discover available endpoints
- Parameter validation from spec
- Better AI assistance with API exploration

---

### 6. Response Streaming (Large Payloads)

**Priority:** Low
**Effort:** High

Stream large responses instead of loading into memory:

```typescript
interface StreamConfig {
  enabled: boolean;
  thresholdBytes: number;
}

// For responses > threshold, stream to temp file
REST_STREAM_THRESHOLD=1000000  // 1MB
```

**Benefits:**
- Handle large API responses
- Reduce memory pressure
- Better for data export APIs

---

### 7. Request Templates

**Priority:** Low
**Effort:** Medium

Save and reuse request templates:

```typescript
server.tool(
  "rest-template-save",
  "Save a request as a reusable template",
  {
    name: z.string(),
    request: RequestOptionsSchema
  },
  async ({ name, request }) => {
    templates.set(name, request);
  }
);

server.tool(
  "rest-template-use",
  "Execute a saved template with optional overrides",
  {
    name: z.string(),
    overrides: z.object({}).optional()
  },
  async ({ name, overrides }) => {
    const template = templates.get(name);
    return service.request({ ...template, ...overrides });
  }
);
```

**Benefits:**
- Quick access to common requests
- Consistent API testing patterns
- Reduce repetitive input

---

### 8. GraphQL Support

**Priority:** Medium
**Effort:** Medium

Enhanced support for GraphQL endpoints:

```typescript
server.tool(
  "rest-graphql",
  "Execute a GraphQL query or mutation",
  {
    query: z.string(),
    variables: z.object({}).optional(),
    operationName: z.string().optional()
  },
  async ({ query, variables, operationName }) => {
    return service.request({
      method: "POST",
      endpoint: "/graphql",
      body: { query, variables, operationName }
    });
  }
);
```

**Benefits:**
- Better DX for GraphQL APIs
- Automatic query/mutation formatting
- Variable substitution

---

## Implementation Priority

| Feature | Priority | Effort | Impact |
|---------|----------|--------|--------|
| MCP Resources | Medium | Low | High |
| Response Caching | Medium | Medium | Medium |
| Request Retry | Medium | Low | High |
| GraphQL Support | Medium | Medium | Medium |
| Request History | Low | Medium | Low |
| OpenAPI Integration | Low | High | Medium |
| Response Streaming | Low | High | Low |
| Request Templates | Low | Medium | Low |

---

## Next Steps

1. **Phase 1 (v23.0):** Implement MCP Resources
2. **Phase 2 (v24.0):** Add Request Retry and Response Caching
3. **Phase 3 (Future):** Consider GraphQL and OpenAPI based on user feedback

---

## Related Files

- Implementation: [packages/rest-api/src/](../../packages/rest-api/src/)
- Documentation: [docs/documentation/REST_API.md](../documentation/REST_API.md)
- Technical Guide: [docs/technical/REST_API_TECHNICAL.md](../technical/REST_API_TECHNICAL.md)
