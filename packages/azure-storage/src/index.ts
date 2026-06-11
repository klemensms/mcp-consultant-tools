#!/usr/bin/env node
/**
 * @mcp-consultant-tools/azure-storage
 *
 * MCP server for Azure Storage integration.
 * Entry point: MCP server startup + backward-compatible registerAzureStorageTools().
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";

import { AzureStorageService } from './AzureStorageService.js';
import type { AzureStorageConfig, StorageAccountConfig } from './AzureStorageService.js';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
function createServiceContext(): ServiceContext {
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

/**
 * Register Azure Storage tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerAzureStorageTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);
  console.error("azure-storage tools registered: 47 tools, 8 prompts");
}

// Backward-compatible exports
export { AzureStorageService } from './AzureStorageService.js';
export type { AzureStorageConfig, StorageAccountConfig } from './AzureStorageService.js';
export type { ServiceContext } from './types.js';

/**
 * Standalone CLI server (when run directly)
 * Uses realpathSync to resolve symlinks created by npx
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: "mcp-azure-storage",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} },
  });

  registerAzureStorageTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Azure Storage MCP server:", error);
    process.exit(1);
  });

  console.error("Azure Storage MCP server running");
}
