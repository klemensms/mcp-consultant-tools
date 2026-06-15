/**
 * REST API types and configuration interfaces
 */

/**
 * Endpoint definition for API discovery
 */
export interface EndpointDefinition {
  /** Endpoint path (e.g., "/users", "/new_exams") */
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

  /**
   * Additional origins the per-request `host` override is allowed to target,
   * beyond the configured base URL's origin. Sourced from REST_ALLOWED_HOSTS.
   * Any `host` whose origin is not the base URL's origin or in this list is
   * rejected — this prevents the configured credentials being sent to an
   * arbitrary host. Empty/undefined = only the base URL origin is reachable.
   */
  allowedHosts?: string[];

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
  piiReport?: import("@mcp-consultant-tools/core").PipelineReport;
}
