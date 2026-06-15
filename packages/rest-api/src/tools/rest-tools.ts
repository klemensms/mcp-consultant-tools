/**
 * REST API tool registrations
 */
import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@mcp-consultant-tools/core";
import type { ServiceContext } from "../types.js";
import type { RequestOptions } from "../models/index.js";
import {
  descWithExamples,
  ENDPOINT_EXAMPLES,
  METHOD_EXAMPLES,
  HOST_OVERRIDE_EXAMPLES,
  ENDPOINT_FILTER_EXAMPLES,
  ENTITY_EXAMPLES,
} from "../tool-examples.js";

export function registerRestTools(server: any, ctx: ServiceContext): void {
  // Tool: rest-request
  server.tool(
    "rest-request",
    `Test a REST API endpoint with automatic authentication. Supports GET, POST, PUT, DELETE, PATCH methods. Authentication is handled automatically based on server configuration (OAuth2 client credentials, bearer token, basic auth, or API key). Returns detailed request/response information including timing, headers, and body.`,
    {
      method: z
        .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
        .describe(descWithExamples("HTTP method to use", METHOD_EXAMPLES)),
      endpoint: z
        .string()
        .describe(
          descWithExamples('Endpoint path. Do not include the full URL - only the path.', ENDPOINT_EXAMPLES)
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
          descWithExamples("Override base URL for this request only. Restricted: the host's origin must match the configured base URL or an origin listed in REST_ALLOWED_HOSTS, otherwise the request is rejected (prevents sending credentials to an unvetted host).", HOST_OVERRIDE_EXAMPLES)
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

        const result = await ctx.restApi.request(options);
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
        const summary = ctx.restApi.getConfigSummary();
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
        const authMethod = ctx.restApi.getAuthMethod();

        if (authMethod !== "oauth2") {
          return createErrorResponse(
            new Error(
              `Token refresh only available for OAuth2 authentication. Current auth method: ${authMethod}`
            ),
            "rest-refresh-token"
          );
        }

        ctx.restApi.clearTokenCache();
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
            const result = await ctx.restApi.request(req);
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
          descWithExamples("Optional filter to match endpoint paths (case-insensitive contains match)", ENDPOINT_FILTER_EXAMPLES)
        ),
    },
    async ({ filter }: { filter?: string }) => {
      try {
        const result = await ctx.restApi.listEndpointsAsync(filter);
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
          descWithExamples("Entity name (singular or plural)", ENTITY_EXAMPLES)
        ),
    },
    async ({ entity }: { entity: string }) => {
      try {
        if (!ctx.restApi.hasOpenApiConfig()) {
          return createErrorResponse(
            new Error(
              "No schema configuration available. Configure REST_OPENAPI_URL pointing to your API's OpenAPI/Swagger spec."
            ),
            "rest-get-schema"
          );
        }

        const schema = await ctx.restApi.getSchemaAsync(entity);

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

  console.error("rest-api tools registered: 6 tools");
}
