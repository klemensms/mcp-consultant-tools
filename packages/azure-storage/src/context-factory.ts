/**
 * Shared ServiceContext factory for Azure Storage.
 * Used by both MCP server (index.ts) and CLI (cli.ts).
 */

import { AzureStorageService } from './AzureStorageService.js';
import type { AzureStorageConfig, StorageAccountConfig } from './AzureStorageService.js';
import type { ServiceContext } from './types.js';

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
export function createServiceContext(): ServiceContext {
  let service: AzureStorageService | null = null;

  function getService(): AzureStorageService {
    if (!service) {
      let accounts: StorageAccountConfig[] = [];

      if (process.env.AZURE_STORAGE_ACCOUNTS) {
        try {
          accounts = JSON.parse(process.env.AZURE_STORAGE_ACCOUNTS);
        } catch (error) {
          throw new Error("Failed to parse AZURE_STORAGE_ACCOUNTS JSON");
        }
      } else if (process.env.AZURE_STORAGE_ACCOUNT_NAME) {
        accounts = [{
          id: 'default',
          name: 'Default Storage Account',
          accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
          active: true,
          connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
        }];
      } else {
        throw new Error("Missing Azure Storage configuration: AZURE_STORAGE_ACCOUNTS or AZURE_STORAGE_ACCOUNT_NAME");
      }

      const config: AzureStorageConfig = {
        accounts,
        authMethod: (process.env.AZURE_STORAGE_AUTH_METHOD || 'entra-id') as 'entra-id' | 'connection-string',
        tenantId: process.env.AZURE_STORAGE_TENANT_ID || '',
        clientId: process.env.AZURE_STORAGE_CLIENT_ID || '',
        clientSecret: process.env.AZURE_STORAGE_CLIENT_SECRET || '',
        maxBlobSizeMB: parseInt(process.env.AZURE_STORAGE_MAX_BLOB_SIZE_MB || '100', 10),
        maxListResults: parseInt(process.env.AZURE_STORAGE_MAX_LIST_RESULTS || '1000', 10),
      };

      service = new AzureStorageService(config);
      console.error("Azure Storage service initialized");
    }
    return service;
  }

  return {
    get storage() { return getService(); },
  };
}
