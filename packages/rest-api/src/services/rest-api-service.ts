/**
 * REST API Service
 *
 * Provides HTTP request functionality with multiple authentication methods:
 * - Static Bearer Token
 * - Basic Authentication
 * - API Key (custom header)
 * - OAuth2 Client Credentials Flow (JWT generation)
 */

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
  private cachedOpenApi: CachedOpenApiSpec | null = null;
  private openApiFetchPromise: Promise<CachedOpenApiSpec> | null = null;
  /** Origin of the configured base URL (e.g. "https://api.example.com"). */
  private baseOrigin: string;
  /** Origins the `host` override is permitted to target. */
  private allowedOrigins: Set<string>;

  /** OpenAPI cache TTL in milliseconds (default: 5 minutes) */
  private static readonly OPENAPI_CACHE_TTL = 5 * 60 * 1000;

  /** Max bytes accepted for a fetched OpenAPI spec (memory-exhaustion guard). */
  private static readonly OPENAPI_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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

    // Compute the allowlist of origins the per-request `host` override may
    // target. Defaults to ONLY the base URL's origin so the configured
    // credentials can never be sent to an arbitrary host; REST_ALLOWED_HOSTS
    // widens it explicitly.
    try {
      this.baseOrigin = new URL(this.config.baseUrl).origin;
    } catch {
      this.baseOrigin = this.config.baseUrl;
    }
    this.allowedOrigins = new Set([this.baseOrigin]);
    for (const h of this.config.allowedHosts ?? []) {
      try {
        this.allowedOrigins.add(new URL(h).origin);
      } catch {
        console.error(
          `Warning: REST_ALLOWED_HOSTS entry "${h}" is not a valid URL; ignored.`
        );
      }
    }

    // SSL verification defaults ON and this server never disables it on the
    // operator's behalf: native fetch ignores https.Agent, and mutating
    // process.env.NODE_TLS_REJECT_UNAUTHORIZED would silently weaken TLS for the
    // WHOLE process. If REST_ENABLE_SSL_VERIFY=false is set we warn loudly and
    // tell the operator to opt out explicitly in the environment themselves, so
    // the insecure scope is visible at deploy time rather than hidden in code.
    if (!this.config.enableSslVerify) {
      console.error(
        "⚠️  SECURITY WARNING: REST_ENABLE_SSL_VERIFY=false was set, but this " +
          "server will NOT disable TLS certificate verification on your behalf — " +
          "doing so silently is unsafe. Requests STILL verify certificates. If " +
          "you genuinely must hit a self-signed/dev endpoint, set " +
          "NODE_TLS_REJECT_UNAUTHORIZED=0 in the server's own environment — that " +
          "makes the insecure scope explicit. Never do this against production " +
          "or over an untrusted network."
      );
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
    const baseUrl = this.resolveBaseUrl(host);
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
      // Never auto-follow redirects: a 3xx from the target could otherwise
      // bounce the request (and its auth headers) to an unvetted origin.
      redirect: "error",
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
  /**
   * Resolve the base URL for a request, enforcing the host-override allowlist.
   *
   * Without a `host` override, the configured base URL is used. With one, the
   * override's ORIGIN must match the base URL's origin or an entry in
   * REST_ALLOWED_HOSTS — otherwise the request is rejected. This stops the
   * configured credentials being exfiltrated to an attacker-chosen host (e.g.
   * via prompt injection setting `host: "https://attacker.example"`).
   */
  private resolveBaseUrl(host?: string): string {
    if (!host) {
      return this.config.baseUrl;
    }

    const normalized = host.replace(/\/+$/, "");
    let origin: string;
    try {
      origin = new URL(normalized).origin;
    } catch {
      throw new Error(
        `Invalid 'host' override: "${host}" is not a valid absolute URL (expected e.g. "https://api.example.com").`
      );
    }

    if (!this.allowedOrigins.has(origin)) {
      throw new Error(
        `Host override "${origin}" is not allowed. The 'host' parameter may only target ` +
          `the configured base URL origin (${this.baseOrigin})` +
          (this.allowedOrigins.size > 1
            ? ` or an allowed host (${[...this.allowedOrigins].join(", ")})`
            : "") +
          `. To call additional hosts, add their origin to the REST_ALLOWED_HOSTS environment variable.`
      );
    }

    return normalized;
  }

  getConfigSummary(): {
    baseUrl: string;
    authMethod: string;
    sslVerification: boolean;
    responseSizeLimit: number;
    customHeaderCount: number;
    allowedHosts: string[];
    oauth2TokenUrl?: string;
    openApiUrl?: string;
  } {
    return {
      baseUrl: this.config.baseUrl,
      authMethod: this.getAuthMethod(),
      sslVerification: this.config.enableSslVerify !== false,
      responseSizeLimit: this.config.responseSizeLimit || 10000,
      customHeaderCount: Object.keys(this.config.customHeaders || {}).length,
      allowedHosts: [...this.allowedOrigins],
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

    // Validate scheme up front: only http(s). Blocks file:/data:/etc. so a
    // misconfigured or injected REST_OPENAPI_URL can't reach local resources.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(
        `Invalid REST_OPENAPI_URL: "${url}" is not a valid absolute URL.`
      );
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new Error(
        `Invalid REST_OPENAPI_URL scheme "${parsedUrl.protocol}": only http and https are allowed.`
      );
    }

    console.error(`Fetching OpenAPI spec from ${url}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const fetchOptions: RequestInit = {
      signal: controller.signal,
      // Never auto-follow redirects: a 3xx could bounce the fetch to an unvetted
      // host (mirrors the main request path's hardening).
      redirect: "error",
    };

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`
        );
      }

      // Bound response size to guard against memory exhaustion from a huge or
      // hostile spec. Reject early on a declared-oversize Content-Length, then
      // re-check the actual bytes (chunked responses omit Content-Length).
      const max = RestApiService.OPENAPI_MAX_BYTES;
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > max) {
        throw new Error(
          `OpenAPI spec too large: ${declared} bytes exceeds the ${max}-byte limit.`
        );
      }

      const text = await response.text();
      if (Buffer.byteLength(text) > max) {
        throw new Error(
          `OpenAPI spec too large: response exceeds the ${max}-byte limit.`
        );
      }

      let spec: OpenApiSpec;
      try {
        spec = JSON.parse(text) as OpenApiSpec;
      } catch {
        throw new Error("OpenAPI spec is not valid JSON.");
      }

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
