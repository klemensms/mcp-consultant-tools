/**
 * Shared ServiceContext factory for REST API.
 * Used by both MCP server (index.ts) and CLI (cli.ts).
 */

import { createPiiPipelineFromEnv } from '@mcp-consultant-tools/core';
import { RestApiService } from './services/rest-api-service.js';
import type { RestApiConfig } from './models/index.js';
import type { ServiceContext } from './types.js';

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
    allowedHosts: process.env.REST_ALLOWED_HOSTS
      ? process.env.REST_ALLOWED_HOSTS.split(",")
          .map((h) => h.trim())
          .filter(Boolean)
      : undefined,
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

  // OpenAPI URL for dynamic discovery
  if (process.env.REST_OPENAPI_URL) {
    config.openApiUrl = process.env.REST_OPENAPI_URL;
    console.error(`OpenAPI URL configured: ${config.openApiUrl}`);
  }

  return config;
}

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
export function createServiceContext(): ServiceContext {
  const piiPipeline = createPiiPipelineFromEnv({
    environmentIdentifier: process.env.REST_BASE_URL,
  });
  let service: RestApiService | null = null;

  function getService(): RestApiService {
    if (!service) {
      const config = buildConfigFromEnv();
      service = new RestApiService(config, piiPipeline);
      console.error("REST API service initialized");
      console.error(`  Base URL: ${config.baseUrl}`);
      console.error(`  Auth method: ${service.getAuthMethod()}`);
      if (config.oauth2) {
        console.error(`  OAuth2 Token URL: ${config.oauth2.tokenUrl}`);
      }
    }
    return service;
  }

  return {
    get restApi() { return getService(); },
  };
}
