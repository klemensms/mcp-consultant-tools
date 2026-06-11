/**
 * Tool Examples for Azure Storage
 *
 * Examples for tool parameters to improve LLM accuracy.
 * Anthropic research shows 72% → 90% accuracy improvement with examples.
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

// =============================================================================
// Account ID Examples
// =============================================================================

export const ACCOUNT_ID_EXAMPLES = [
  { label: 'Production storage', value: 'prod' },
  { label: 'Development storage', value: 'dev' },
  { label: 'Backup storage', value: 'backup' },
];

// =============================================================================
// Blob Storage Examples
// =============================================================================

export const CONTAINER_NAME_EXAMPLES = [
  { label: 'Documents container', value: 'documents' },
  { label: 'Images container', value: 'images' },
  { label: 'Backups container', value: 'backups' },
];

export const BLOB_NAME_EXAMPLES = [
  { label: 'Simple file', value: 'report.pdf' },
  { label: 'File in folder', value: 'reports/2024/january.pdf' },
  { label: 'JSON data', value: 'data/customers.json' },
];

export const BLOB_PREFIX_EXAMPLES = [
  { label: 'All in folder', value: 'reports/2024/' },
  { label: 'By file type pattern', value: 'logs/app-' },
  { label: 'All PDFs (conceptual)', value: '' },
];

export const BLOB_TAG_FILTER_EXAMPLES = [
  { label: 'By department', value: '"Department"=\'Finance\'' },
  { label: 'By status', value: '"Status"=\'Archived\'' },
  { label: 'Multiple conditions', value: '"Year"=\'2024\' AND "Type"=\'Report\'' },
];

export const CONTENT_TYPE_EXAMPLES = [
  { label: 'PDF document', value: 'application/pdf' },
  { label: 'JSON data', value: 'application/json' },
  { label: 'Plain text', value: 'text/plain' },
  { label: 'CSV file', value: 'text/csv' },
];

export const METADATA_EXAMPLES = [
  { label: 'Author metadata', value: '{"author": "John Doe"}' },
  { label: 'Multiple tags', value: '{"department": "HR", "year": "2024"}' },
];

// =============================================================================
// File Share Examples
// =============================================================================

export const SHARE_NAME_EXAMPLES = [
  { label: 'Team share', value: 'team-files' },
  { label: 'Project share', value: 'project-alpha' },
  { label: 'Archive share', value: 'archive-2024' },
];

export const FILE_PATH_EXAMPLES = [
  { label: 'Root level', value: '' },
  { label: 'Single folder', value: 'documents' },
  { label: 'Nested path', value: 'projects/alpha/specs' },
];

export const FILE_NAME_EXAMPLES = [
  { label: 'Document', value: 'proposal.docx' },
  { label: 'In subfolder', value: 'reports/summary.xlsx' },
];

// =============================================================================
// Queue Storage Examples
// =============================================================================

export const QUEUE_NAME_EXAMPLES = [
  { label: 'Task queue', value: 'task-queue' },
  { label: 'Notification queue', value: 'notifications' },
  { label: 'Processing queue', value: 'orders-to-process' },
];

export const MESSAGE_TEXT_EXAMPLES = [
  { label: 'Simple text', value: 'Process order #12345' },
  { label: 'JSON message', value: '{"orderId": 12345, "action": "process"}' },
];

export const VISIBILITY_TIMEOUT_EXAMPLES = [
  { label: 'Quick processing', value: '30' },
  { label: 'Standard processing', value: '300' },
  { label: 'Long processing', value: '3600' },
];

// =============================================================================
// Table Storage Examples
// =============================================================================

export const TABLE_NAME_EXAMPLES = [
  { label: 'Customers table', value: 'Customers' },
  { label: 'Orders table', value: 'Orders' },
  { label: 'Audit log table', value: 'AuditLogs' },
];

export const PARTITION_KEY_EXAMPLES = [
  { label: 'By region', value: 'US-West' },
  { label: 'By date', value: '2024-01' },
  { label: 'By category', value: 'Electronics' },
];

export const ROW_KEY_EXAMPLES = [
  { label: 'Customer ID', value: 'CUST-12345' },
  { label: 'Order ID', value: 'ORD-2024-0001' },
  { label: 'Timestamp-based', value: '20240115T143022Z' },
];

export const ODATA_FILTER_EXAMPLES = [
  { label: 'By partition', value: "PartitionKey eq 'US-West'" },
  { label: 'By property', value: "Status eq 'Active'" },
  { label: 'Date range', value: "Timestamp ge datetime'2024-01-01'" },
  { label: 'Combined filter', value: "PartitionKey eq 'Sales' and Amount gt 1000" },
];

export const SELECT_COLUMNS_EXAMPLES = [
  { label: 'Basic fields', value: 'PartitionKey,RowKey,Name' },
  { label: 'Order fields', value: 'OrderId,CustomerName,Amount,Status' },
];

export const ENTITY_JSON_EXAMPLES = [
  {
    label: 'Simple entity',
    value: '{"PartitionKey": "US-West", "RowKey": "CUST-001", "Name": "Acme Corp"}',
  },
  {
    label: 'With typed values',
    value:
      '{"PartitionKey": "Orders", "RowKey": "ORD-001", "Amount": 150.50, "Status": "Pending"}',
  },
];

// =============================================================================
// Batch Operation Examples
// =============================================================================

export const BATCH_OPERATIONS_EXAMPLES = [
  {
    label: 'Insert batch',
    value:
      '[{"operation":"create","entity":{"PartitionKey":"PK1","RowKey":"RK1","Name":"Item1"}}]',
  },
  {
    label: 'Mixed operations',
    value:
      '[{"operation":"upsert","entity":{"PartitionKey":"PK1","RowKey":"RK1","Name":"Updated"}},{"operation":"delete","entity":{"PartitionKey":"PK1","RowKey":"RK2"}}]',
  },
];
