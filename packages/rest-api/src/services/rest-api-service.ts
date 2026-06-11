/**
 * REST API Service
 *
 * Provides HTTP request functionality with multiple authentication methods:
 * - Static Bearer Token
 * - Basic Authentication
 * - API Key (custom header)
 * - OAuth2 Client Credentials Flow (JWT generation)
 */

import https from "https";
import type {
  PiiProtectionPipeline,
  PipelineReport,
} from '@mcp-consultant-tools/core';
import type {
  RestApiConfig,
  RequestOptions,
  RequestResult,
  EndpointDefinition,
  EntitySchema,
} from '../models/index.js';
import type { CachedOpenApiSpec, OpenApiSpec } from './openapi-parser.js';
import { parseOpenApiSpec } from './openapi-parser.js';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export class RestApiService {
  private config: RestApiConfig;
  private cachedToken: CachedToken | null = null;
  private httpsAgent: https.Agent | undefined;
  private cachedOpenApi: CachedOpenApiSpec | null = null;
  private openApiFetchPromise: Promise<CachedOpenApiSpec> | null = null;

  /** OpenAPI cache TTL in milliseconds (default: 5 minutes) */
  private static readonly OPENAPI_CACHE_TTL = 5 * 60 * 1000;

  constructor(
    config: RestApiConfig,
    private readonly piiPipeline?: PiiProtectionPipeline
  ) {
    this.config = {
      responseSizeLimit: 10000,
      enableSslVerify: true,
      timeout: 30000,
      ...config,
    };

    // Normalize base URL (remove trailing slashes)
    this.config.baseUrl = this.config.baseUrl.replace(/\/+$/, "");

    // Create HTTPS agent if SSL verification is disabled
    if (!this.config.enableSslVerify) {
      this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }

    // Validate mutually exclusive auth methods
    const authMethods = [
      this.config.bearerToken ? "bearer" : null,
      this.config.basicAuth ? "basic" : null,
      this.config.oauth2 ? "oauth2" : null,
      this.config.apiKey ? "apikey" : null,
    ].filter(Boolean);

    if (authMethods.length > 1) {
      console.error(
        `Warning: Multiple auth methods configured (${authMethods.join(", ")}). Only one should be used.`
      );
    }
  }

  /**
   * Get the current authentication method name
   */
  getAuthMethod(): string {
    if (this.config.oauth2) return "oauth2";
    if (this.config.bearerToken) return "bearer";
    if (this.config.basicAuth) return "basic";
    if (this.config.apiKey) return "apikey";
    return "none";
  }

  /**
   * Get OAuth2 access token using client credentials flow
   * Caches token and refreshes when expired
   */
  private async getOAuth2Token(): Promise<string> {
    const oauth2 = this.config.oauth2;
    if (!oauth2) {
      throw new Error("OAuth2 configuration not provided");
    }

    // Check if we have a valid cached token (with 5 minute buffer)
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 5 * 60 * 1000) {
      return this.cachedToken.accessToken;
    }

    console.error("Acquiring new OAuth2 token...");

    const params = new URLSearchParams();
    params.append("grant_type", oauth2.grantType || "client_credentials");
    params.append("client_id", oauth2.clientId);
    params.append("client_secret", oauth2.clientSecret);
    params.append("scope", oauth2.scope);

    if (oauth2.additionalParams) {
      for (const [key, value] of Object.entries(oauth2.additionalParams)) {
        params.append(key, value);
      }
    }

    const response = await fetch(oauth2.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OAuth2 token request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const tokenResponse = await response.json() as {
      access_token: string;
      expires_in?: number;
      token_type?: string;
    };

    if (!tokenResponse.access_token) {
      throw new Error("OAuth2 response missing access_token");
    }

    const expiresIn = tokenResponse.expires_in || 3600;
    this.cachedToken = {
      accessToken: tokenResponse.access_token,
      expiresAt: now + expiresIn * 1000,
    };

    console.error(
      `OAuth2 token acquired, expires in ${Math.round(expiresIn / 60)} minutes`
    );

    return this.cachedToken.accessToken;
  }

  /**
   * Get the Authorization header value based on configured auth method
   */
  private async getAuthHeader(): Promise<{ name: string; value: string } | null> {
    if (this.config.oauth2) {
      const token = await this.getOAuth2Token();
      return { name: "Authorization", value: `Bearer ${token}` };
    }

    if (this.config.bearerToken) {
      return { name: "Authorization", value: `Bearer ${this.config.bearerToken}` };
    }

    if (this.config.basicAuth) {
      const { username, password } = this.config.basicAuth;
      const base64Credentials = Buffer.from(`${username}:${password}`).toString("base64");
      return { name: "Authorization", value: `Basic ${base64Credentials}` };
    }

    if (this.config.apiKey) {
      return { name: this.config.apiKey.headerName, value: this.config.apiKey.value };
    }

    return null;
  }

  /**
   * Sanitize headers for display (redact sensitive values)
   */
  private sanitizeHeaders(
    headers: Record<string, string>,
    isFromRequest: boolean = false
  ): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const safeHeaders = new Set([
      "accept",
      "accept-language",
      "content-type",
      "user-agent",
      "cache-control",
      "if-match",
      "if-none-match",
      "if-modified-since",
      "if-unmodified-since",
    ]);

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();

      if (isFromRequest) {
        sanitized[key] = value;
        continue;
      }

      if (lowerKey === "authorization") {
        sanitized[key] = "[REDACTED]";
        continue;
      }

      if (
        this.config.apiKey &&
        lowerKey === this.config.apiKey.headerName.toLowerCase()
      ) {
        sanitized[key] = "[REDACTED]";
        continue;
      }

      if (safeHeaders.has(lowerKey)) {
        sanitized[key] = value;
      } else {
        sanitized[key] = "[REDACTED]";
      }
    }

    return sanitized;
  }

  /**
   * Apply the PII redaction pipeline to a response body.
   * - Object/array bodies → walked as a tree (Layer 2 no-op since no entity rules; L3 + L4 do the work).
   * - String bodies (plain text/XML/HTML) → wrapped under `body` so Layer 4 NER fires
   *   (`body` is in the default scan-fields list); unwrapped on return.
   * - Other types (null, undefined, primitives) → returned unchanged.
   */
  private redact(body: any): { body: any; piiReport?: PipelineReport } {
    if (!this.piiPipeline?.isEnabled) return { body };
    if (body === null || body === undefined) return { body };

    if (typeof body === 'string') {
      const r = this.piiPipeline.redactResponse('rest-api', { body });
      return { body: r.data.body, piiReport: r.report };
    }

    if (typeof body === 'object') {
      const r = this.piiPipeline.redactResponse('rest-api', body);
      return { body: r.data, piiReport: r.report };
    }

    return { body };
  }

  /**
   * Execute an HTTP request
   */
  async request(options: RequestOptions): Promise<RequestResult> {
    const { method, endpoint, body, headers: requestHeaders, host } = options;

    const normalizedEndpoint = `/${endpoint.replace(/^\/+|\/+$/g, "")}`;
    const baseUrl = host ? host.replace(/\/+$/, "") : this.config.baseUrl;
    const fullUrl = `${baseUrl}${normalizedEndpoint}`;

    const headers: Record<string, string> = {
      ...this.config.customHeaders,
      ...requestHeaders,
    };

    if (body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    const authHeader = await this.getAuthHeader();
    if (authHeader) {
      headers[authHeader.name] = authHeader.value;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (["POST", "PUT", "PATCH"].includes(method) && body) {
      fetchOptions.body =
        typeof body === "string" ? body : JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout || 30000
    );
    fetchOptions.signal = controller.signal;

    const startTime = Date.now();

    try {
      const response = await fetch(fullUrl, fetchOptions);
      clearTimeout(timeoutId);

      const endTime = Date.now();

      const responseText = await response.text();
      let responseBody: any;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }

      const responseHeaders: Record<string, any> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const bodySize = Buffer.from(responseText).length;
      const sizeLimit = this.config.responseSizeLimit || 10000;
      const validation: RequestResult["validation"] = {
        isError: response.status >= 400,
        messages: response.status >= 400
          ? [`Request failed with status ${response.status}`]
          : ["Request completed successfully"],
      };

      if (bodySize > sizeLimit) {
        responseBody =
          typeof responseBody === "string"
            ? responseBody.slice(0, sizeLimit)
            : JSON.stringify(responseBody).slice(0, sizeLimit);
        validation.messages.push(
          `Response truncated: ${sizeLimit} of ${bodySize} bytes returned due to size limit`
        );
        validation.truncated = {
          originalSize: bodySize,
          returnedSize: sizeLimit,
          truncationPoint: sizeLimit,
          sizeLimit,
        };
      }

      const { body: redactedBody, piiReport } = this.redact(responseBody);

      return {
        request: {
          url: fullUrl,
          method,
          headers: {
            ...this.sanitizeHeaders(headers, false),
            ...this.sanitizeHeaders(requestHeaders || {}, true),
          },
          body,
          authMethod: this.getAuthMethod(),
        },
        response: {
          statusCode: response.status,
          statusText: response.statusText,
          timing: `${endTime - startTime}ms`,
          headers: this.sanitizeHeaders(responseHeaders, false),
          body: redactedBody,
        },
        validation,
        ...(piiReport ? { piiReport } : {}),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Force refresh the OAuth2 token (clears cache)
   */
  clearTokenCache(): void {
    this.cachedToken = null;
    console.error("OAuth2 token cache cleared");
  }

  /**
   * Get configuration summary (safe to display)
   */
  getConfigSummary(): {
    baseUrl: string;
    authMethod: string;
    sslVerification: boolean;
    responseSizeLimit: number;
    customHeaderCount: number;
    oauth2TokenUrl?: string;
    openApiUrl?: string;
  } {
    return {
      baseUrl: this.config.baseUrl,
      authMethod: this.getAuthMethod(),
      sslVerification: this.config.enableSslVerify !== false,
      responseSizeLimit: this.config.responseSizeLimit || 10000,
      customHeaderCount: Object.keys(this.config.customHeaders || {}).length,
      ...(this.config.oauth2 && { oauth2TokenUrl: this.config.oauth2.tokenUrl }),
      ...(this.config.openApiUrl && { openApiUrl: this.config.openApiUrl }),
    };
  }

  /**
   * Check if OpenAPI URL is configured
   */
  hasOpenApiConfig(): boolean {
    return !!this.config.openApiUrl;
  }

  /**
   * Fetch and parse OpenAPI spec from configured URL
   * Results are cached for OPENAPI_CACHE_TTL
   */
  private async fetchOpenApiSpec(): Promise<CachedOpenApiSpec> {
    if (!this.config.openApiUrl) {
      throw new Error("OpenAPI URL not configured");
    }

    const now = Date.now();
    if (
      this.cachedOpenApi &&
      now - this.cachedOpenApi.fetchedAt < RestApiService.OPENAPI_CACHE_TTL
    ) {
      return this.cachedOpenApi;
    }

    if (this.openApiFetchPromise) {
      return this.openApiFetchPromise;
    }

    this.openApiFetchPromise = this.doFetchOpenApiSpec();

    try {
      const result = await this.openApiFetchPromise;
      return result;
    } finally {
      this.openApiFetchPromise = null;
    }
  }

  /**
   * Actually fetch and parse the OpenAPI spec
   */
  private async doFetchOpenApiSpec(): Promise<CachedOpenApiSpec> {
    const url = this.config.openApiUrl!;
    console.error(`Fetching OpenAPI spec from ${url}...`);

    const fetchOptions: RequestInit = {};

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    fetchOptions.signal = controller.signal;

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`
        );
      }

      const spec = (await response.json()) as OpenApiSpec;
      const parsed = parseOpenApiSpec(spec);

      this.cachedOpenApi = {
        ...parsed,
        fetchedAt: Date.now(),
        source: `OpenAPI spec from ${url}`,
      };

      console.error(
        `OpenAPI spec loaded: ${parsed.endpoints.length} endpoints, ${Object.keys(parsed.schemas).length} schemas`
      );

      return this.cachedOpenApi;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("OpenAPI fetch timeout after 30 seconds");
      }
      throw error;
    }
  }

  /**
   * Clear OpenAPI cache (forces re-fetch on next call)
   */
  clearOpenApiCache(): void {
    this.cachedOpenApi = null;
    console.error("OpenAPI cache cleared");
  }

  /**
   * List all available API endpoints from OpenAPI spec
   * @param filter Optional filter to match endpoint paths (case-insensitive contains match)
   */
  async listEndpointsAsync(filter?: string): Promise<{
    baseUrl: string;
    endpointCount: number;
    endpoints: EndpointDefinition[];
    source: string;
  }> {
    if (!this.config.openApiUrl) {
      return {
        baseUrl: this.config.baseUrl,
        endpointCount: 0,
        endpoints: [],
        source: "No OpenAPI URL configured. Set REST_OPENAPI_URL environment variable.",
      };
    }

    const openApiData = await this.fetchOpenApiSpec();

    const endpoints = filter
      ? openApiData.endpoints.filter(
          (ep) =>
            ep.path.toLowerCase().includes(filter.toLowerCase()) ||
            ep.entityName?.toLowerCase().includes(filter.toLowerCase()) ||
            ep.description?.toLowerCase().includes(filter.toLowerCase())
        )
      : openApiData.endpoints;

    return {
      baseUrl: this.config.baseUrl,
      endpointCount: endpoints.length,
      endpoints,
      source: openApiData.source,
    };
  }

  /**
   * Get schema for a specific entity from OpenAPI spec
   * @param entity Entity name (singular or plural)
   */
  async getSchemaAsync(entity: string): Promise<EntitySchema | null> {
    if (!this.config.openApiUrl) {
      return null;
    }

    const openApiData = await this.fetchOpenApiSpec();
    const normalizedEntity = entity.toLowerCase();

    for (const [key, schema] of Object.entries(openApiData.schemas)) {
      if (
        key.toLowerCase() === normalizedEntity ||
        schema.entityName.toLowerCase() === normalizedEntity ||
        schema.pluralName.toLowerCase() === normalizedEntity
      ) {
        return schema;
      }
    }

    return null;
  }
}
