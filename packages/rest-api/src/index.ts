#!/usr/bin/env node

/**
 * @mcp-consultant-tools/rest-api
 *
 * MCP server for REST API testing with OAuth2 client credentials support.
 * Enables AI assistants to test HTTP endpoints with automatic JWT token generation.
 *
 * Features:
 * - HTTP methods: GET, POST, PUT, DELETE, PATCH
 * - Authentication: Static bearer, Basic auth, API key, OAuth2 client credentials
 * - Response size limiting and truncation
 * - SSL verification control
 * - Custom headers support
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import {
  createMcpServer,
  createEnvLoader,
  createErrorResponse,
  createSuccessResponse,
} from "@mcp-consultant-tools/core";
import { RestApiService } from "./RestApiService.js";
import type { RestApiConfig, RequestOptions, EndpointDefinition, EntitySchema, FieldDefinition } from "./RestApiService.js";

// Tool count for documentation
const TOOL_COUNT = 6;
const PROMPT_COUNT = 2;

/**
 * Parse environment variables for custom headers (HEADER_* pattern)
 */
function getCustomHeadersFromEnv(): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerPrefix = /^HEADER_/i;

  for (const [key, value] of Object.entries(process.env)) {
    if (headerPrefix.test(key) && value !== undefined) {
      const headerName = key.replace(headerPrefix, "");
      headers[headerName] = value;
    }
  }

  return headers;
}

/**
 * Build RestApiConfig from environment variables
 */
function buildConfigFromEnv(): RestApiConfig {
  const baseUrl = process.env.REST_BASE_URL;
  if (!baseUrl) {
    throw new Error("REST_BASE_URL environment variable is required");
  }

  const config: RestApiConfig = {
    baseUrl,
    responseSizeLimit: process.env.REST_RESPONSE_SIZE_LIMIT
      ? parseInt(process.env.REST_RESPONSE_SIZE_LIMIT, 10)
      : 10000,
    enableSslVerify: process.env.REST_ENABLE_SSL_VERIFY !== "false",
    timeout: process.env.REST_TIMEOUT
      ? parseInt(process.env.REST_TIMEOUT, 10)
      : 30000,
    customHeaders: getCustomHeadersFromEnv(),
  };

  // OAuth2 client credentials (highest priority)
  if (
    process.env.OAUTH2_TOKEN_URL &&
    process.env.OAUTH2_CLIENT_ID &&
    process.env.OAUTH2_CLIENT_SECRET &&
    process.env.OAUTH2_SCOPE
  ) {
    config.oauth2 = {
      tokenUrl: process.env.OAUTH2_TOKEN_URL,
      clientId: process.env.OAUTH2_CLIENT_ID,
      clientSecret: process.env.OAUTH2_CLIENT_SECRET,
      scope: process.env.OAUTH2_SCOPE,
      grantType: process.env.OAUTH2_GRANT_TYPE || "client_credentials",
    };

    // Parse additional OAuth2 parameters
    if (process.env.OAUTH2_ADDITIONAL_PARAMS) {
      try {
        config.oauth2.additionalParams = JSON.parse(
          process.env.OAUTH2_ADDITIONAL_PARAMS
        );
      } catch (e) {
        console.error("Warning: OAUTH2_ADDITIONAL_PARAMS is not valid JSON");
      }
    }
  }
  // Static bearer token
  else if (process.env.AUTH_BEARER) {
    config.bearerToken = process.env.AUTH_BEARER;
  }
  // Basic auth
  else if (process.env.AUTH_BASIC_USERNAME && process.env.AUTH_BASIC_PASSWORD) {
    config.basicAuth = {
      username: process.env.AUTH_BASIC_USERNAME,
      password: process.env.AUTH_BASIC_PASSWORD,
    };
  }
  // API key
  else if (
    process.env.AUTH_APIKEY_HEADER_NAME &&
    process.env.AUTH_APIKEY_VALUE
  ) {
    config.apiKey = {
      headerName: process.env.AUTH_APIKEY_HEADER_NAME,
      value: process.env.AUTH_APIKEY_VALUE,
    };
  }

  // OpenAPI URL for dynamic discovery (recommended for DAB)
  if (process.env.REST_OPENAPI_URL) {
    config.openApiUrl = process.env.REST_OPENAPI_URL;
    console.error(`OpenAPI URL configured: ${config.openApiUrl}`);
  }

  return config;
}

/**
 * Register REST API tools and prompts to an MCP server
 * @param server - The MCP server instance
 * @param restApiService - Optional pre-configured RestApiService (for testing)
 */
export function registerRestApiTools(
  server: any,
  restApiService?: RestApiService
) {
  let service: RestApiService | null = restApiService || null;

  function getRestApiService(): RestApiService {
    if (!service) {
      const config = buildConfigFromEnv();
      service = new RestApiService(config);
      console.error("REST API service initialized");
      console.error(`  Base URL: ${config.baseUrl}`);
      console.error(`  Auth method: ${service.getAuthMethod()}`);
      if (config.oauth2) {
        console.error(`  OAuth2 Token URL: ${config.oauth2.tokenUrl}`);
      }
    }
    return service;
  }

  // ============================================================
  // TOOLS
  // ============================================================

  // Tool: rest-request
  server.tool(
    "rest-request",
    `Test a REST API endpoint with automatic authentication. Supports GET, POST, PUT, DELETE, PATCH methods. Authentication is handled automatically based on server configuration (OAuth2 client credentials, bearer token, basic auth, or API key). Returns detailed request/response information including timing, headers, and body.`,
    {
      method: z
        .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
        .describe("HTTP method to use"),
      endpoint: z
        .string()
        .describe(
          'Endpoint path (e.g., "/users", "/api/v1/orders"). Do not include the full URL - only the path.'
        ),
      body: z
        .any()
        .optional()
        .describe("Request body for POST/PUT/PATCH requests (object or string)"),
      headers: z
        .record(z.string())
        .optional()
        .describe(
          "Additional headers for this request. Do not use for auth - configure auth via environment variables."
        ),
      host: z
        .string()
        .optional()
        .describe(
          "Override base URL for this request only (e.g., 'https://other-api.com')"
        ),
    },
    async ({
      method,
      endpoint,
      body,
      headers,
      host,
    }: {
      method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      endpoint: string;
      body?: any;
      headers?: Record<string, string>;
      host?: string;
    }) => {
      try {
        const restService = getRestApiService();

        // Validate endpoint doesn't contain full URL
        const urlPattern = /^(https?:\/\/|www\.)/i;
        if (urlPattern.test(endpoint)) {
          return createErrorResponse(
            new Error(
              `Invalid endpoint format. Do not include full URLs. Use just the path (e.g., "/api/users") and optionally specify 'host' to override the base URL.`
            ),
            "rest-request"
          );
        }

        const options: RequestOptions = {
          method,
          endpoint,
          body,
          headers,
          host,
        };

        const result = await restService.request(options);
        return createSuccessResponse(result);
      } catch (error) {
        return createErrorResponse(error, "rest-request");
      }
    }
  );

  // Tool: rest-config
  server.tool(
    "rest-config",
    "Get the current REST API service configuration summary, including base URL, authentication method, SSL settings, and custom headers count.",
    {},
    async () => {
      try {
        const restService = getRestApiService();
        const summary = restService.getConfigSummary();
        return createSuccessResponse(summary);
      } catch (error) {
        return createErrorResponse(error, "rest-config");
      }
    }
  );

  // Tool: rest-refresh-token
  server.tool(
    "rest-refresh-token",
    "Force refresh the OAuth2 access token. Clears the token cache and acquires a new token on the next request. Only relevant when using OAuth2 authentication.",
    {},
    async () => {
      try {
        const restService = getRestApiService();
        const authMethod = restService.getAuthMethod();

        if (authMethod !== "oauth2") {
          return createErrorResponse(
            new Error(
              `Token refresh only available for OAuth2 authentication. Current auth method: ${authMethod}`
            ),
            "rest-refresh-token"
          );
        }

        restService.clearTokenCache();
        return createSuccessResponse({
          message: "OAuth2 token cache cleared. A new token will be acquired on the next request.",
        });
      } catch (error) {
        return createErrorResponse(error, "rest-refresh-token");
      }
    }
  );

  // Tool: rest-batch-request
  server.tool(
    "rest-batch-request",
    "Execute multiple REST API requests sequentially. Useful for testing a series of related endpoints or performing a workflow. Returns results for all requests.",
    {
      requests: z.array(
        z.object({
          method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
          endpoint: z.string(),
          body: z.any().optional(),
          headers: z.record(z.string()).optional(),
          host: z.string().optional(),
        })
      ).describe("Array of request configurations to execute sequentially"),
      stopOnError: z
        .boolean()
        .optional()
        .describe("Stop executing remaining requests if one fails (default: false)"),
    },
    async ({
      requests,
      stopOnError = false,
    }: {
      requests: RequestOptions[];
      stopOnError?: boolean;
    }) => {
      try {
        const restService = getRestApiService();
        const results: {
          index: number;
          endpoint: string;
          success: boolean;
          result?: any;
          error?: string;
        }[] = [];

        for (let i = 0; i < requests.length; i++) {
          const req = requests[i];

          try {
            const result = await restService.request(req);
            results.push({
              index: i,
              endpoint: req.endpoint,
              success: !result.validation.isError,
              result,
            });

            if (stopOnError && result.validation.isError) {
              break;
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            results.push({
              index: i,
              endpoint: req.endpoint,
              success: false,
              error: errorMessage,
            });

            if (stopOnError) {
              break;
            }
          }
        }

        return createSuccessResponse({
          totalRequests: requests.length,
          executedRequests: results.length,
          successfulRequests: results.filter((r) => r.success).length,
          results,
        });
      } catch (error) {
        return createErrorResponse(error, "rest-batch-request");
      }
    }
  );

  // Tool: rest-list-endpoints
  server.tool(
    "rest-list-endpoints",
    "List all available REST API endpoints with their supported HTTP methods. Use this to discover what entities/resources are available in the API. Requires REST_OPENAPI_URL configuration pointing to your API's OpenAPI/Swagger spec.",
    {
      filter: z
        .string()
        .optional()
        .describe(
          "Optional filter to match endpoint paths (case-insensitive contains match). Example: 'exam' returns all exam-related endpoints."
        ),
    },
    async ({ filter }: { filter?: string }) => {
      try {
        const restService = getRestApiService();
        const result = await restService.listEndpointsAsync(filter);
        return createSuccessResponse(result);
      } catch (error) {
        return createErrorResponse(error, "rest-list-endpoints");
      }
    }
  );

  // Tool: rest-get-schema
  server.tool(
    "rest-get-schema",
    "Get the schema/field definitions for a specific entity. Returns field names, types, whether they're required, and any validation rules. Use this before creating or updating records to understand the data structure. Requires REST_OPENAPI_URL configuration pointing to your API's OpenAPI/Swagger spec.",
    {
      entity: z
        .string()
        .describe(
          "Entity name (singular or plural). Examples: 'sic_exam', 'sic_exams', 'contact', 'contacts'"
        ),
    },
    async ({ entity }: { entity: string }) => {
      try {
        const restService = getRestApiService();

        if (!restService.hasOpenApiConfig()) {
          return createErrorResponse(
            new Error(
              "No schema configuration available. Configure REST_OPENAPI_URL pointing to your API's OpenAPI/Swagger spec."
            ),
            "rest-get-schema"
          );
        }

        const schema = await restService.getSchemaAsync(entity);

        if (!schema) {
          return createErrorResponse(
            new Error(
              `Entity '${entity}' not found. Use rest-list-endpoints to see available entities.`
            ),
            "rest-get-schema"
          );
        }

        return createSuccessResponse(schema);
      } catch (error) {
        return createErrorResponse(error, "rest-get-schema");
      }
    }
  );

  // ============================================================
  // PROMPTS
  // ============================================================

  // Prompt: rest-api-guide
  server.prompt(
    "rest-api-guide",
    "Comprehensive guide for using the REST API testing tools",
    {},
    async () => {
      const markdown = `# REST API Testing Guide

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
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text: markdown },
          },
        ],
      };
    }
  );

  // Prompt: rest-api-troubleshoot
  server.prompt(
    "rest-api-troubleshoot",
    "Troubleshooting guide for common REST API testing issues",
    {},
    async () => {
      const markdown = `# REST API Troubleshooting Guide

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
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text: markdown },
          },
        ],
      };
    }
  );

  console.error(
    `REST API tools registered: ${TOOL_COUNT} tools, ${PROMPT_COUNT} prompts`
  );
}

/**
 * Export service class for direct usage
 */
export { RestApiService } from "./RestApiService.js";
export type {
  RestApiConfig,
  RequestOptions,
  RequestResult,
  EndpointDefinition,
  EntitySchema,
  FieldDefinition,
} from "./RestApiService.js";

/**
 * Standalone CLI server (when run directly)
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();

  const server = createMcpServer({
    name: "@mcp-consultant-tools/rest-api",
    version: "1.0.0",
    capabilities: {
      tools: {},
      prompts: {},
    },
  });

  registerRestApiTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start REST API MCP server:", error);
    process.exit(1);
  });

  console.error("@mcp-consultant-tools/rest-api server running on stdio");
}
