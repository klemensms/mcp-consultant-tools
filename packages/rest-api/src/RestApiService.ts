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

/**
 * Endpoint definition for API discovery
 */
export interface EndpointDefinition {
  /** Endpoint path (e.g., "/users", "/sic_exams") */
  path: string;
  /** Supported HTTP methods */
  methods: ("GET" | "POST" | "PUT" | "DELETE" | "PATCH")[];
  /** Entity name (singular) if applicable */
  entityName?: string;
  /** Human-readable description */
  description?: string;
}

/**
 * Field definition for entity schema
 */
export interface FieldDefinition {
  /** Field name */
  name: string;
  /** Data type (e.g., "string", "Guid", "int", "datetime", "decimal") */
  type: string;
  /** Whether the field is required for creation */
  required: boolean;
  /** Whether the field can be null */
  nullable: boolean;
  /** Maximum length for string fields */
  maxLength?: number;
  /** Human-readable description */
  description?: string;
  /** Foreign key reference */
  foreignKey?: {
    entity: string;
    field: string;
  };
  /** Enum/option set values */
  enumValues?: string[];
}

/**
 * Entity schema definition
 */
export interface EntitySchema {
  /** Entity name (singular) */
  entityName: string;
  /** Plural name for the endpoint */
  pluralName: string;
  /** Endpoint path */
  endpoint: string;
  /** Primary key field name */
  primaryKey: string;
  /** Field definitions */
  fields: FieldDefinition[];
  /** Example object for creating/updating */
  example?: Record<string, any>;
}

export interface RestApiConfig {
  /** Base URL for all requests (e.g., "https://api.example.com/v1") */
  baseUrl: string;

  /** Response size limit in bytes (default: 10000) */
  responseSizeLimit?: number;

  /** Enable SSL certificate verification (default: true) */
  enableSslVerify?: boolean;

  /** Static bearer token (mutually exclusive with oauth2) */
  bearerToken?: string;

  /** Basic auth credentials */
  basicAuth?: {
    username: string;
    password: string;
  };

  /** API key authentication */
  apiKey?: {
    headerName: string;
    value: string;
  };

  /** OAuth2 client credentials configuration */
  oauth2?: {
    /** Token endpoint URL (e.g., "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token") */
    tokenUrl: string;
    /** OAuth2 Client ID */
    clientId: string;
    /** OAuth2 Client Secret */
    clientSecret: string;
    /** OAuth2 Scope (e.g., "https://api.example.com/.default") */
    scope: string;
    /** Optional grant type (defaults to "client_credentials") */
    grantType?: string;
    /** Optional additional token request parameters */
    additionalParams?: Record<string, string>;
  };

  /** Custom headers to include in all requests */
  customHeaders?: Record<string, string>;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** URL to fetch OpenAPI/Swagger spec for dynamic discovery */
  openApiUrl?: string;
}

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  endpoint: string;
  body?: any;
  headers?: Record<string, string>;
  /** Override base URL for this request only */
  host?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

export interface RequestResult {
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
    authMethod: string;
  };
  response: {
    statusCode: number;
    statusText: string;
    timing: string;
    headers: Record<string, any>;
    body: any;
  };
  validation: {
    isError: boolean;
    messages: string[];
    truncated?: {
      originalSize: number;
      returnedSize: number;
      truncationPoint: number;
      sizeLimit: number;
    };
  };
}

/**
 * Cached OpenAPI spec with parsed endpoints and schemas
 */
interface CachedOpenApiSpec {
  endpoints: EndpointDefinition[];
  schemas: Record<string, EntitySchema>;
  fetchedAt: number;
  source: string;
}

export class RestApiService {
  private config: RestApiConfig;
  private cachedToken: CachedToken | null = null;
  private httpsAgent: https.Agent | undefined;
  private cachedOpenApi: CachedOpenApiSpec | null = null;
  private openApiFetchPromise: Promise<CachedOpenApiSpec> | null = null;

  /** OpenAPI cache TTL in milliseconds (default: 5 minutes) */
  private static readonly OPENAPI_CACHE_TTL = 5 * 60 * 1000;

  constructor(config: RestApiConfig) {
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

    // Build token request body
    const params = new URLSearchParams();
    params.append("grant_type", oauth2.grantType || "client_credentials");
    params.append("client_id", oauth2.clientId);
    params.append("client_secret", oauth2.clientSecret);
    params.append("scope", oauth2.scope);

    // Add any additional parameters
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

    // Cache the token
    // Default to 1 hour expiry if not provided
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

      // Always include request-provided headers as-is
      if (isFromRequest) {
        sanitized[key] = value;
        continue;
      }

      // Redact auth headers
      if (lowerKey === "authorization") {
        sanitized[key] = "[REDACTED]";
        continue;
      }

      // Redact API key header
      if (
        this.config.apiKey &&
        lowerKey === this.config.apiKey.headerName.toLowerCase()
      ) {
        sanitized[key] = "[REDACTED]";
        continue;
      }

      // Show safe headers, redact others
      if (safeHeaders.has(lowerKey)) {
        sanitized[key] = value;
      } else {
        sanitized[key] = "[REDACTED]";
      }
    }

    return sanitized;
  }

  /**
   * Execute an HTTP request
   */
  async request(options: RequestOptions): Promise<RequestResult> {
    const { method, endpoint, body, headers: requestHeaders, host } = options;

    // Normalize endpoint (ensure leading slash, remove trailing)
    const normalizedEndpoint = `/${endpoint.replace(/^\/+|\/+$/g, "")}`;

    // Build full URL
    const baseUrl = host ? host.replace(/\/+$/, "") : this.config.baseUrl;
    const fullUrl = `${baseUrl}${normalizedEndpoint}`;

    // Build headers
    const headers: Record<string, string> = {
      ...this.config.customHeaders,
      ...requestHeaders,
    };

    // Add content-type for JSON body
    if (body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    // Add auth header
    const authHeader = await this.getAuthHeader();
    if (authHeader) {
      headers[authHeader.name] = authHeader.value;
    }

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    // Add body for methods that support it
    if (["POST", "PUT", "PATCH"].includes(method) && body) {
      fetchOptions.body =
        typeof body === "string" ? body : JSON.stringify(body);
    }

    // Add timeout via AbortController
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

      // Get response body
      const responseText = await response.text();
      let responseBody: any;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }

      // Get response headers
      const responseHeaders: Record<string, any> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Check response size
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
          body: responseBody,
        },
        validation,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
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

    // Check cache validity
    const now = Date.now();
    if (
      this.cachedOpenApi &&
      now - this.cachedOpenApi.fetchedAt < RestApiService.OPENAPI_CACHE_TTL
    ) {
      return this.cachedOpenApi;
    }

    // Avoid concurrent fetches - reuse in-flight promise
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

    // Add timeout
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
      const parsed = this.parseOpenApiSpec(spec);

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
   * Parse OpenAPI 3.x spec into our internal format
   */
  private parseOpenApiSpec(spec: OpenApiSpec): {
    endpoints: EndpointDefinition[];
    schemas: Record<string, EntitySchema>;
  } {
    const endpoints: EndpointDefinition[] = [];
    const schemas: Record<string, EntitySchema> = {};

    // Parse paths into endpoints
    if (spec.paths) {
      // Group methods by path
      const pathMethods: Record<string, ("GET" | "POST" | "PUT" | "DELETE" | "PATCH")[]> = {};

      for (const [path, pathItem] of Object.entries(spec.paths)) {
        if (!pathItem) continue;

        const methods: ("GET" | "POST" | "PUT" | "DELETE" | "PATCH")[] = [];

        if (pathItem.get) methods.push("GET");
        if (pathItem.post) methods.push("POST");
        if (pathItem.put) methods.push("PUT");
        if (pathItem.delete) methods.push("DELETE");
        if (pathItem.patch) methods.push("PATCH");

        if (methods.length > 0) {
          // For DAB-style paths, group /entity and /entity/{id} together
          const basePath = path.replace(/\/\{[^}]+\}$/, "");

          if (!pathMethods[basePath]) {
            pathMethods[basePath] = [];
          }

          for (const method of methods) {
            if (!pathMethods[basePath].includes(method)) {
              pathMethods[basePath].push(method);
            }
          }
        }
      }

      // Convert grouped paths to endpoints
      for (const [path, methods] of Object.entries(pathMethods)) {
        // Extract entity name from path (e.g., "/contacts" -> "contact")
        const pathSegments = path.split("/").filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1] || "";
        const entityName = lastSegment.endsWith("s")
          ? lastSegment.slice(0, -1)
          : lastSegment;

        // Get description from one of the operations
        let description: string | undefined;
        const fullPath = spec.paths[path];
        if (fullPath) {
          description =
            fullPath.get?.summary ||
            fullPath.post?.summary ||
            fullPath.get?.description ||
            fullPath.post?.description;
        }

        endpoints.push({
          path,
          methods: methods.sort(),
          entityName: entityName || undefined,
          description,
        });
      }
    }

    // Parse schemas
    if (spec.components?.schemas) {
      for (const [schemaName, schemaObj] of Object.entries(spec.components.schemas)) {
        if (!schemaObj || typeof schemaObj !== "object") continue;

        // Skip input/output wrapper schemas (DAB pattern)
        if (schemaName.endsWith("_input") || schemaName.endsWith("_output")) {
          continue;
        }

        const fields: FieldDefinition[] = [];
        let primaryKey = "id";

        if (schemaObj.properties) {
          const required = new Set(schemaObj.required || []);

          for (const [propName, propObj] of Object.entries(schemaObj.properties)) {
            if (!propObj || typeof propObj !== "object") continue;

            // Detect primary key (common patterns)
            if (
              propName === "id" ||
              propName.endsWith("id") ||
              propName.endsWith("Id")
            ) {
              primaryKey = propName;
            }

            const field: FieldDefinition = {
              name: propName,
              type: this.mapOpenApiType(propObj),
              required: required.has(propName),
              nullable: propObj.nullable === true,
            };

            if (propObj.maxLength) {
              field.maxLength = propObj.maxLength;
            }

            if (propObj.description) {
              field.description = propObj.description;
            }

            if (propObj.enum) {
              field.enumValues = propObj.enum;
            }

            fields.push(field);
          }
        }

        // Derive plural name and endpoint from schema name
        const pluralName = schemaName.endsWith("s") ? schemaName : `${schemaName}s`;
        const endpoint = `/${pluralName.toLowerCase()}`;

        schemas[schemaName.toLowerCase()] = {
          entityName: schemaName,
          pluralName,
          endpoint,
          primaryKey,
          fields,
        };
      }
    }

    return { endpoints, schemas };
  }

  /**
   * Map OpenAPI type to simplified type string
   */
  private mapOpenApiType(propObj: OpenApiProperty): string {
    if (propObj.$ref) {
      // Extract type name from $ref (e.g., "#/components/schemas/User" -> "User")
      const refParts = propObj.$ref.split("/");
      return refParts[refParts.length - 1];
    }

    const type = propObj.type || "any";
    const format = propObj.format;

    if (type === "string") {
      if (format === "uuid") return "Guid";
      if (format === "date-time") return "datetime";
      if (format === "date") return "date";
      return "string";
    }

    if (type === "integer") {
      if (format === "int64") return "long";
      return "int";
    }

    if (type === "number") {
      if (format === "decimal") return "decimal";
      if (format === "double") return "double";
      if (format === "float") return "float";
      return "number";
    }

    if (type === "boolean") return "boolean";
    if (type === "array") return "array";
    if (type === "object") return "object";

    return type;
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

    // Try direct match
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

/**
 * OpenAPI 3.x types (simplified for our needs)
 */
interface OpenApiSpec {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
  };
  paths?: Record<string, OpenApiPathItem | undefined>;
  components?: {
    schemas?: Record<string, OpenApiSchema | undefined>;
  };
}

interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
  patch?: OpenApiOperation;
}

interface OpenApiOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  requestBody?: any;
  responses?: any;
}

interface OpenApiSchema {
  type?: string;
  properties?: Record<string, OpenApiProperty>;
  required?: string[];
  description?: string;
}

interface OpenApiProperty {
  type?: string;
  format?: string;
  description?: string;
  nullable?: boolean;
  maxLength?: number;
  enum?: string[];
  $ref?: string;
}
