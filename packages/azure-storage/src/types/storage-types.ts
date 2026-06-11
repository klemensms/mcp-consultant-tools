/**
 * Azure Storage Type Definitions
 *
 * Interfaces for storage account configuration, blob, file, queue, and table operations.
 */

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Storage account configuration
 */
export interface StorageAccountConfig {
  /** User-friendly ID (e.g., "prod-storage") */
  id: string;
  /** Display name (e.g., "Production Storage") */
  name: string;
  /** Storage account name (e.g., "mystorageaccount") */
  accountName: string;
  /** Enable/disable toggle */
  active: boolean;
  /** Optional: per-account connection string (overrides Entra ID auth) */
  connectionString?: string;
  /** Optional: description */
  description?: string;
}

/**
 * Main service configuration
 */
export interface AzureStorageConfig {
  /** List of storage accounts */
  accounts: StorageAccountConfig[];
  /** Authentication method */
  authMethod: 'entra-id' | 'connection-string';
  /** For Entra ID auth */
  tenantId?: string;
  /** For Entra ID auth */
  clientId?: string;
  /** For Entra ID auth */
  clientSecret?: string;
  /** Maximum blob size for upload (MB, default: 100) */
  maxBlobSizeMB?: number;
  /** Maximum list results (default: 1000) */
  maxListResults?: number;
  /** Cache TTL in seconds (default: 300) */
  cacheTTL?: number;
}

// =============================================================================
// Blob Storage Types
// =============================================================================

/**
 * Container information
 */
export interface ContainerInfo {
  name: string;
  lastModified?: Date;
  publicAccess?: string;
  leaseState?: string;
  leaseStatus?: string;
  metadata?: Record<string, string>;
}

/**
 * Blob information
 */
export interface BlobInfo {
  name: string;
  containerName: string;
  contentType?: string;
  contentLength?: number;
  lastModified?: Date;
  etag?: string;
  blobType?: string;
  accessTier?: string;
  leaseState?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
}

/**
 * Blob list options
 */
export interface BlobListOptions {
  prefix?: string;
  maxResults?: number;
  includeMetadata?: boolean;
  includeTags?: boolean;
  includeDeleted?: boolean;
}

/**
 * Blob upload options
 */
export interface BlobUploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
  overwrite?: boolean;
}

/**
 * Blob copy options
 */
export interface BlobCopyOptions {
  destinationContainer: string;
  destinationBlob: string;
  sourceAccountId?: string;
  overwrite?: boolean;
}

// =============================================================================
// File Share Types
// =============================================================================

/**
 * File share information
 */
export interface FileShareInfo {
  name: string;
  lastModified?: Date;
  quota?: number;
  accessTier?: string;
  metadata?: Record<string, string>;
}

/**
 * File/Directory item information
 */
export interface FileItemInfo {
  name: string;
  kind: 'file' | 'directory';
  path: string;
  contentLength?: number;
  lastModified?: Date;
  contentType?: string;
  metadata?: Record<string, string>;
}

/**
 * File list options
 */
export interface FileListOptions {
  path?: string;
  maxResults?: number;
  includeMetadata?: boolean;
}

/**
 * File upload options
 */
export interface FileUploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  overwrite?: boolean;
}

// =============================================================================
// Queue Storage Types
// =============================================================================

/**
 * Queue information
 */
export interface QueueInfo {
  name: string;
  approximateMessagesCount?: number;
  metadata?: Record<string, string>;
}

/**
 * Queue message
 */
export interface QueueMessage {
  messageId: string;
  popReceipt?: string;
  messageText: string;
  insertedOn?: Date;
  expiresOn?: Date;
  nextVisibleOn?: Date;
  dequeueCount?: number;
}

/**
 * Send message options
 */
export interface SendMessageOptions {
  /** Time before message becomes visible (seconds) */
  visibilityTimeout?: number;
  /** Time until message expires (seconds) */
  timeToLive?: number;
}

/**
 * Receive message options
 */
export interface ReceiveMessageOptions {
  /** Number of messages to receive (max 32) */
  numberOfMessages?: number;
  /** Visibility timeout in seconds */
  visibilityTimeout?: number;
}

// =============================================================================
// Table Storage Types
// =============================================================================

/**
 * Table information
 */
export interface TableInfo {
  name: string;
}

/**
 * Table entity (row)
 */
export interface TableEntity {
  partitionKey: string;
  rowKey: string;
  timestamp?: Date;
  etag?: string;
  [key: string]: any;
}

/**
 * Query entities options
 */
export interface QueryEntitiesOptions {
  filter?: string;
  select?: string[];
  top?: number;
}

/**
 * Batch operation types
 */
export type BatchOperationType = 'create' | 'update' | 'upsert' | 'delete';

/**
 * Batch operation item
 */
export interface BatchOperationItem {
  operation: BatchOperationType;
  entity: TableEntity;
}

// =============================================================================
// Common Types
// =============================================================================

/**
 * Operation result with success/failure info
 */
export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * List result with pagination
 */
export interface ListResult<T> {
  items: T[];
  continuationToken?: string;
  hasMore: boolean;
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  connected: boolean;
  accountName: string;
  blobServiceAvailable: boolean;
  queueServiceAvailable: boolean;
  tableServiceAvailable: boolean;
  fileServiceAvailable: boolean;
  authMethod: string;
  error?: string;
}
