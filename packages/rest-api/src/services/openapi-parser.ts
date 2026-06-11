/**
 * OpenAPI/Swagger spec parsing utilities
 */
import type { EndpointDefinition, FieldDefinition, EntitySchema } from '../models/index.js';

/**
 * Cached OpenAPI spec with parsed endpoints and schemas
 */
export interface CachedOpenApiSpec {
  endpoints: EndpointDefinition[];
  schemas: Record<string, EntitySchema>;
  fetchedAt: number;
  source: string;
}

/**
 * OpenAPI 3.x types (simplified for our needs)
 */
export interface OpenApiSpec {
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

export interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
  patch?: OpenApiOperation;
}

export interface OpenApiOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  requestBody?: any;
  responses?: any;
}

export interface OpenApiSchema {
  type?: string;
  properties?: Record<string, OpenApiProperty>;
  required?: string[];
  description?: string;
}

export interface OpenApiProperty {
  type?: string;
  format?: string;
  description?: string;
  nullable?: boolean;
  maxLength?: number;
  enum?: string[];
  $ref?: string;
}

/**
 * Map OpenAPI type to simplified type string
 */
export function mapOpenApiType(propObj: OpenApiProperty): string {
  if (propObj.$ref) {
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
 * Parse OpenAPI 3.x spec into our internal format
 */
export function parseOpenApiSpec(spec: OpenApiSpec): {
  endpoints: EndpointDefinition[];
  schemas: Record<string, EntitySchema>;
} {
  const endpoints: EndpointDefinition[] = [];
  const schemas: Record<string, EntitySchema> = {};

  // Parse paths into endpoints
  if (spec.paths) {
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

    for (const [path, methods] of Object.entries(pathMethods)) {
      const pathSegments = path.split("/").filter(Boolean);
      const lastSegment = pathSegments[pathSegments.length - 1] || "";
      const entityName = lastSegment.endsWith("s")
        ? lastSegment.slice(0, -1)
        : lastSegment;

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

      if (schemaName.endsWith("_input") || schemaName.endsWith("_output")) {
        continue;
      }

      const fields: FieldDefinition[] = [];
      let primaryKey = "id";

      if (schemaObj.properties) {
        const required = new Set(schemaObj.required || []);

        for (const [propName, propObj] of Object.entries(schemaObj.properties)) {
          if (!propObj || typeof propObj !== "object") continue;

          if (
            propName === "id" ||
            propName.endsWith("id") ||
            propName.endsWith("Id")
          ) {
            primaryKey = propName;
          }

          const field: FieldDefinition = {
            name: propName,
            type: mapOpenApiType(propObj),
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
