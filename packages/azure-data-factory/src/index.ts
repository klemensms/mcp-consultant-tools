#!/usr/bin/env node

/**
 * @mcp-consultant-tools/azure-data-factory
 *
 * MCP server for Azure Data Factory integration.
 * Entry point: MCP server startup + backward-compatible registerAzureDataFactoryTools().
 */

import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';

import { AdfService } from './services/adf-service.js';
import type { AdfConfig, AdfFactoryConfig } from './models/index.js';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
function createServiceContext(): ServiceContext {
  let service: AdfService | null = null;

  function getService(): AdfService {
    if (!service) {
      const missingConfig: string[] = [];
      let factories: AdfFactoryConfig[] = [];

      // Parse factory configuration
      if (process.env.AZURE_DATA_FACTORIES) {
        try {
          factories = JSON.parse(process.env.AZURE_DATA_FACTORIES);
        } catch (error) {
          throw new Error('Failed to parse AZURE_DATA_FACTORIES JSON');
        }
      } else if (process.env.AZURE_DATA_FACTORY_SUBSCRIPTION_ID) {
        // Single factory configuration
        factories = [
          {
            id: 'default',
            name: 'Default Data Factory',
            subscriptionId: process.env.AZURE_DATA_FACTORY_SUBSCRIPTION_ID,
            resourceGroup: process.env.AZURE_DATA_FACTORY_RESOURCE_GROUP || '',
            factoryName: process.env.AZURE_DATA_FACTORY_NAME || '',
            active: true,
          },
        ];

        if (!factories[0].resourceGroup) {
          missingConfig.push('AZURE_DATA_FACTORY_RESOURCE_GROUP');
        }
        if (!factories[0].factoryName) {
          missingConfig.push('AZURE_DATA_FACTORY_NAME');
        }
      } else {
        missingConfig.push(
          'AZURE_DATA_FACTORIES or AZURE_DATA_FACTORY_SUBSCRIPTION_ID'
        );
      }

      // Check Azure AD credentials
      if (!process.env.AZURE_TENANT_ID) {
        missingConfig.push('AZURE_TENANT_ID');
      }
      if (!process.env.AZURE_CLIENT_ID) {
        missingConfig.push('AZURE_CLIENT_ID');
      }
      if (!process.env.AZURE_CLIENT_SECRET) {
        missingConfig.push('AZURE_CLIENT_SECRET');
      }

      if (missingConfig.length > 0) {
        throw new Error(
          `Missing Azure Data Factory configuration: ${missingConfig.join(', ')}`
        );
      }

      const config: AdfConfig = {
        factories,
        tenantId: process.env.AZURE_TENANT_ID!,
        clientId: process.env.AZURE_CLIENT_ID!,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
        enableWrite:
          process.env.AZURE_DATA_FACTORY_ENABLE_WRITE?.toLowerCase() === 'true',
        enableTriggerControl:
          process.env.AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL?.toLowerCase() ===
          'true',
      };

      service = new AdfService(config);
      console.error('Azure Data Factory service initialized');
    }
    return service;
  }

  return {
    get adf() { return getService(); },
  };
}

/**
 * Register Azure Data Factory tools to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerAzureDataFactoryTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
}

// Backward-compatible exports
export { AdfService } from './services/adf-service.js';
export type {
  AdfConfig,
  AdfFactoryConfig,
  Pipeline,
  PipelineRun,
  ActivityRun,
  Dataset,
  LinkedService,
  DataFlow,
  Trigger,
  TriggerRun,
  IntegrationRuntime,
  IntegrationRuntimeStatus,
} from './models/index.js';
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
    name: 'mcp-azure-data-factory',
    version: pkg.version,
    capabilities: { tools: {} },
  });

  registerAzureDataFactoryTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start Azure Data Factory MCP server:', error);
    process.exit(1);
  });

  console.error('Azure Data Factory MCP server running');
}
