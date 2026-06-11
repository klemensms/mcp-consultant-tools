/**
 * Azure Storage Service
 *
 * Main orchestrator service for Azure Storage operations.
 * Handles multi-account configuration, authentication, and delegates to sub-services.
 *
 * Supports:
 * - Entra ID authentication (recommended)
 * - Connection string authentication (per-account)
 * - Multiple storage accounts
 */

import { BlobServiceClient } from '@azure/storage-blob';
import { ShareServiceClient } from '@azure/storage-file-share';
import { QueueServiceClient } from '@azure/storage-queue';
import { TableServiceClient } from '@azure/data-tables';
import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';
import { auditLogger } from '@mcp-consultant-tools/core';

import type {
  AzureStorageConfig,
  StorageAccountConfig,
  ConnectionTestResult,
} from './types/storage-types.js';

import { BlobService } from './services/BlobService.js';
import { QueueService } from './services/QueueService.js';
import { TableService } from './services/TableService.js';
import { FileService } from './services/FileService.js';

/**
 * Main Azure Storage Service
 */
export class AzureStorageService {
  private config: Required<AzureStorageConfig>;

  // Service clients (lazy-initialized)
  private blobClients: Map<string, BlobServiceClient> = new Map();
  private queueClients: Map<string, QueueServiceClient> = new Map();
  private tableClients: Map<string, TableServiceClient> = new Map();
  private fileClients: Map<string, ShareServiceClient> = new Map();

  // Sub-services
  private blobServices: Map<string, BlobService> = new Map();
  private queueServices: Map<string, QueueService> = new Map();
  private tableServices: Map<string, TableService> = new Map();
  private fileServices: Map<string, FileService> = new Map();

  // Credential for Entra ID auth
  private credential: ClientSecretCredential | DefaultAzureCredential | null = null;

  constructor(config: AzureStorageConfig) {
    // Apply defaults
    this.config = {
      accounts: config.accounts || [],
      authMethod: config.authMethod || 'entra-id',
      tenantId: config.tenantId || '',
      clientId: config.clientId || '',
      clientSecret: config.clientSecret || '',
      maxBlobSizeMB: config.maxBlobSizeMB || 100,
      maxListResults: config.maxListResults || 1000,
      cacheTTL: config.cacheTTL || 300,
    };

    // Initialize credential for Entra ID auth
    if (this.config.authMethod === 'entra-id') {
      if (this.config.tenantId && this.config.clientId && this.config.clientSecret) {
        this.credential = new ClientSecretCredential(
          this.config.tenantId,
          this.config.clientId,
          this.config.clientSecret
        );
      } else {
        // Fall back to DefaultAzureCredential (uses environment or managed identity)
        this.credential = new DefaultAzureCredential();
      }
    }
  }

  // ==========================================================================
  // Client Accessors
  // ==========================================================================

  /**
   * Get BlobServiceClient for an account
   */
  getBlobClient(accountId: string): BlobServiceClient {
    const account = this.getAccountById(accountId);

    if (!this.blobClients.has(accountId)) {
      let client: BlobServiceClient;

      if (account.connectionString) {
        client = BlobServiceClient.fromConnectionString(account.connectionString);
      } else if (this.credential) {
        const url = `https://${account.accountName}.blob.core.windows.net`;
        client = new BlobServiceClient(url, this.credential);
      } else {
        throw new Error(
          `No authentication configured for account '${accountId}'. ` +
            'Provide connection string or Entra ID credentials.'
        );
      }

      this.blobClients.set(accountId, client);
    }

    return this.blobClients.get(accountId)!;
  }

  /**
   * Get QueueServiceClient for an account
   */
  getQueueClient(accountId: string): QueueServiceClient {
    const account = this.getAccountById(accountId);

    if (!this.queueClients.has(accountId)) {
      let client: QueueServiceClient;

      if (account.connectionString) {
        client = QueueServiceClient.fromConnectionString(account.connectionString);
      } else if (this.credential) {
        const url = `https://${account.accountName}.queue.core.windows.net`;
        client = new QueueServiceClient(url, this.credential);
      } else {
        throw new Error(
          `No authentication configured for account '${accountId}'. ` +
            'Provide connection string or Entra ID credentials.'
        );
      }

      this.queueClients.set(accountId, client);
    }

    return this.queueClients.get(accountId)!;
  }

  /**
   * Get TableServiceClient for an account
   */
  getTableClient(accountId: string): TableServiceClient {
    const account = this.getAccountById(accountId);

    if (!this.tableClients.has(accountId)) {
      let client: TableServiceClient;

      if (account.connectionString) {
        client = TableServiceClient.fromConnectionString(account.connectionString);
      } else if (this.credential) {
        const url = `https://${account.accountName}.table.core.windows.net`;
        client = new TableServiceClient(url, this.credential);
      } else {
        throw new Error(
          `No authentication configured for account '${accountId}'. ` +
            'Provide connection string or Entra ID credentials.'
        );
      }

      this.tableClients.set(accountId, client);
    }

    return this.tableClients.get(accountId)!;
  }

  /**
   * Get ShareServiceClient for an account
   */
  getFileClient(accountId: string): ShareServiceClient {
    const account = this.getAccountById(accountId);

    if (!this.fileClients.has(accountId)) {
      let client: ShareServiceClient;

      if (account.connectionString) {
        client = ShareServiceClient.fromConnectionString(account.connectionString);
      } else if (this.credential) {
        const url = `https://${account.accountName}.file.core.windows.net`;
        client = new ShareServiceClient(url, this.credential);
      } else {
        throw new Error(
          `No authentication configured for account '${accountId}'. ` +
            'Provide connection string or Entra ID credentials.'
        );
      }

      this.fileClients.set(accountId, client);
    }

    return this.fileClients.get(accountId)!;
  }

  // ==========================================================================
  // Sub-Service Accessors
  // ==========================================================================

  /**
   * Get BlobService for an account
   */
  getBlobService(accountId: string): BlobService {
    if (!this.blobServices.has(accountId)) {
      const client = this.getBlobClient(accountId);
      this.blobServices.set(
        accountId,
        new BlobService(client, accountId, this.config.maxBlobSizeMB, this.config.maxListResults)
      );
    }
    return this.blobServices.get(accountId)!;
  }

  /**
   * Get QueueService for an account
   */
  getQueueService(accountId: string): QueueService {
    if (!this.queueServices.has(accountId)) {
      const client = this.getQueueClient(accountId);
      this.queueServices.set(accountId, new QueueService(client, accountId, this.config.maxListResults));
    }
    return this.queueServices.get(accountId)!;
  }

  /**
   * Get TableService for an account
   */
  getTableService(accountId: string): TableService {
    if (!this.tableServices.has(accountId)) {
      const client = this.getTableClient(accountId);
      this.tableServices.set(accountId, new TableService(client, accountId, this.config.maxListResults));
    }
    return this.tableServices.get(accountId)!;
  }

  /**
   * Get FileService for an account
   */
  getFileService(accountId: string): FileService {
    if (!this.fileServices.has(accountId)) {
      const client = this.getFileClient(accountId);
      this.fileServices.set(accountId, new FileService(client, accountId, this.config.maxListResults));
    }
    return this.fileServices.get(accountId)!;
  }

  // ==========================================================================
  // Account Management
  // ==========================================================================

  /**
   * Get all configured accounts
   */
  getAllAccounts(): StorageAccountConfig[] {
    return this.config.accounts;
  }

  /**
   * Get active accounts only
   */
  getActiveAccounts(): StorageAccountConfig[] {
    return this.config.accounts.filter((a) => a.active);
  }

  /**
   * Get account by ID (with validation)
   */
  getAccountById(accountId: string): StorageAccountConfig {
    const account = this.config.accounts.find((a) => a.id === accountId);

    if (!account) {
      const available = this.config.accounts.map((a) => a.id).join(', ');
      throw new Error(
        `Storage account '${accountId}' not found. Available accounts: ${available || 'none'}`
      );
    }

    if (!account.active) {
      throw new Error(
        `Storage account '${accountId}' is inactive. Set active: true in configuration.`
      );
    }

    return account;
  }

  // ==========================================================================
  // Connection Testing
  // ==========================================================================

  /**
   * Test connection to a storage account
   */
  async testConnection(accountId: string): Promise<ConnectionTestResult> {
    const timer = auditLogger.startTimer();
    const account = this.getAccountById(accountId);

    const result: ConnectionTestResult = {
      connected: false,
      accountName: account.accountName,
      blobServiceAvailable: false,
      queueServiceAvailable: false,
      tableServiceAvailable: false,
      fileServiceAvailable: false,
      authMethod: account.connectionString ? 'connection-string' : this.config.authMethod,
    };

    try {
      // Test Blob service
      try {
        const blobClient = this.getBlobClient(accountId);
        const iter = blobClient.listContainers();
        await iter.next();
        result.blobServiceAvailable = true;
      } catch (error: any) {
        console.error(`Blob service test failed: ${error.message}`);
      }

      // Test Queue service
      try {
        const queueClient = this.getQueueClient(accountId);
        const iter = queueClient.listQueues();
        await iter.next();
        result.queueServiceAvailable = true;
      } catch (error: any) {
        console.error(`Queue service test failed: ${error.message}`);
      }

      // Test Table service
      try {
        const tableClient = this.getTableClient(accountId);
        const iter = tableClient.listTables();
        await iter.next();
        result.tableServiceAvailable = true;
      } catch (error: any) {
        console.error(`Table service test failed: ${error.message}`);
      }

      // Test File service
      try {
        const fileClient = this.getFileClient(accountId);
        const iter = fileClient.listShares();
        await iter.next();
        result.fileServiceAvailable = true;
      } catch (error: any) {
        console.error(`File service test failed: ${error.message}`);
      }

      result.connected =
        result.blobServiceAvailable ||
        result.queueServiceAvailable ||
        result.tableServiceAvailable ||
        result.fileServiceAvailable;

      auditLogger.log({
        operation: 'test-connection',
        operationType: 'READ',
        componentType: 'StorageAccount',
        componentName: account.accountName,
        parameters: { accountId },
        success: result.connected,
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'test-connection',
        operationType: 'READ',
        componentType: 'StorageAccount',
        componentName: account.accountName,
        parameters: { accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      result.error = error.message;
      return result;
    }
  }

  // ==========================================================================
  // Configuration Accessors
  // ==========================================================================

  /**
   * Get maximum blob size in MB
   */
  getMaxBlobSizeMB(): number {
    return this.config.maxBlobSizeMB;
  }

  /**
   * Get maximum list results
   */
  getMaxListResults(): number {
    return this.config.maxListResults;
  }
}

export type { AzureStorageConfig, StorageAccountConfig };
