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

export class RestApiService {
  private config: RestApiConfig;
  private cachedToken: CachedToken | null = null;
  private httpsAgent: https.Agent | undefined;

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
  } {
    return {
      baseUrl: this.config.baseUrl,
      authMethod: this.getAuthMethod(),
      sslVerification: this.config.enableSslVerify !== false,
      responseSizeLimit: this.config.responseSizeLimit || 10000,
      customHeaderCount: Object.keys(this.config.customHeaders || {}).length,
      ...(this.config.oauth2 && { oauth2TokenUrl: this.config.oauth2.tokenUrl }),
    };
  }
}
