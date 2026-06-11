/**
 * Tool Examples for Service Bus Tools
 * Provides examples to improve LLM accuracy when using these tools
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

// ========================================
// Queue Name Examples
// ========================================

export const QUEUE_NAME_EXAMPLES = [
  { label: "Order processing", value: "orders-queue" },
  { label: "Notifications", value: "notifications" },
  { label: "Audit events", value: "audit-events" },
];

// ========================================
// Topic Name Examples
// ========================================

export const TOPIC_NAME_EXAMPLES = [
  { label: "Order events topic", value: "order-events" },
  { label: "User notifications topic", value: "user-notifications" },
];

// ========================================
// Subscription Name Examples
// ========================================

export const SUBSCRIPTION_NAME_EXAMPLES = [
  { label: "Email handler", value: "email-handler" },
  { label: "Log processor", value: "log-processor" },
];

// ========================================
// Message Count Examples
// ========================================

export const MESSAGE_COUNT_EXAMPLES = [
  { label: "Single message", value: "1" },
  { label: "Small batch", value: "10" },
  { label: "Max Azure allows", value: "32" },
];

// ========================================
// DLQ Reason Examples
// ========================================

export const DLQ_REASON_EXAMPLES = [
  { label: "Max delivery exceeded", value: "MaxDeliveryCountExceeded" },
  { label: "Header too large", value: "HeaderSizeExceeded" },
  { label: "TTL expired", value: "TTLExpiredException" },
];

// ========================================
// Search Filter Examples
// ========================================

export const BODY_CONTAINS_EXAMPLES = [
  { label: "Search by order ID", value: "ORD-12345" },
  { label: "Search by error keyword", value: "timeout" },
  { label: "Search by entity name", value: "contact" },
];

export const CORRELATION_ID_EXAMPLES = [
  { label: "UUID correlation", value: "550e8400-e29b-41d4-a716-446655440000" },
  { label: "Request correlation", value: "req-2025-001" },
];
