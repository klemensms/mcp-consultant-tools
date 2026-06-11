/**
 * Tool Examples for REST API Tools
 * Provides examples to improve LLM accuracy when using these tools
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

// ========================================
// Endpoint Examples
// ========================================

export const ENDPOINT_EXAMPLES = [
  { label: "List users", value: "/api/v1/users" },
  { label: "Get specific resource", value: "/api/v1/orders/12345" },
  { label: "Nested resource", value: "/api/v1/users/42/addresses" },
];

// ========================================
// Header Examples
// ========================================

export const HEADER_EXAMPLES = [
  { label: "JSON content type", value: '{"Content-Type":"application/json","Accept":"application/json"}' },
  { label: "Custom API version", value: '{"api-version":"2024-01-01"}' },
];

// ========================================
// Method Examples
// ========================================

export const METHOD_EXAMPLES = [
  { label: "Read data", value: "GET" },
  { label: "Create resource", value: "POST" },
  { label: "Full update", value: "PUT" },
  { label: "Partial update", value: "PATCH" },
  { label: "Remove resource", value: "DELETE" },
];

// ========================================
// Auth Type Examples
// ========================================

export const AUTH_TYPE_EXAMPLES = [
  { label: "OAuth2 bearer token", value: "bearer" },
  { label: "Basic credentials", value: "basic" },
  { label: "API key header", value: "api-key" },
];

// ========================================
// Query Parameter Examples
// ========================================

export const QUERY_PARAM_EXAMPLES = [
  { label: "OData filter", value: '{"$top":"10","$filter":"status eq \'active\'"}' },
  { label: "Pagination", value: '{"page":"1","pageSize":"25"}' },
];

// ========================================
// Host Override Examples
// ========================================

export const HOST_OVERRIDE_EXAMPLES = [
  { label: "Different API host", value: "https://other-api.example.com" },
  { label: "Staging environment", value: "https://staging-api.example.com" },
];

// ========================================
// Entity/Schema Examples
// ========================================

export const ENTITY_EXAMPLES = [
  { label: "User entity", value: "users" },
  { label: "Singular form", value: "contact" },
  { label: "Custom entity", value: "new_exam" },
];

// ========================================
// Filter Examples (for list-endpoints)
// ========================================

export const ENDPOINT_FILTER_EXAMPLES = [
  { label: "Find exam endpoints", value: "exam" },
  { label: "Find user endpoints", value: "user" },
  { label: "Find auth endpoints", value: "auth" },
];
