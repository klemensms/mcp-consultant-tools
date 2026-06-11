#!/usr/bin/env node

/**
 * @mcp-consultant-tools/azure-management
 *
 * MCP server for Azure Resource Manager integration.
 * Entry point: MCP server startup + backward-compatible registerAzureManagementTools().
 */

import { realpathSync } from 'fs';
import { pathToFileURL } from 'url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';
import { AzureManagementService, type AzureManagementConfig } from './AzureManagementService.js';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

// Re-export for use in meta package
export { AzureManagementService, type AzureManagementConfig };
export { registerAzureManagementTools };

/**
 * Build a ServiceContext from environment variables (lazy initialization).
 */
function createServiceContext(): ServiceContext {
  let management: AzureManagementService | null = null;

  return {
    get management(): AzureManagementService {
      if (!management) {
        const missingConfig: string[] = [];

        const tenantId = process.env.AZURE_TENANT_ID;
        const clientId = process.env.AZURE_CLIENT_ID;
        const clientSecret = process.env.AZURE_CLIENT_SECRET;
        const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;

        if (!tenantId) missingConfig.push('AZURE_TENANT_ID');
        if (!clientId) missingConfig.push('AZURE_CLIENT_ID');
        if (!clientSecret) missingConfig.push('AZURE_CLIENT_SECRET');
        if (!subscriptionId) missingConfig.push('AZURE_SUBSCRIPTION_ID');

        if (missingConfig.length > 0) {
          throw new Error(`Missing Azure Management config: ${missingConfig.join(', ')}`);
        }

        const config: AzureManagementConfig = {
          tenantId: tenantId!,
          clientId: clientId!,
          clientSecret: clientSecret!,
          subscriptionId: subscriptionId!,
          resourceGroup: process.env.AZURE_RESOURCE_GROUP,
          redactSecrets: process.env.AZURE_REDACT_SECRETS !== 'false',
          enableWrite: process.env.AZURE_MGMT_ENABLE_WRITE === 'true',
        };

        management = new AzureManagementService(config);
      }
      return management;
    },
  };
}

/**
 * Register all Azure Management tools and prompts on the MCP server.
 * Backward-compatible wrapper.
 */
function registerAzureManagementTools(
  server: any,
  service?: AzureManagementService
): void {
  let ctx: ServiceContext;

  if (service) {
    ctx = { management: service };
  } else {
    ctx = createServiceContext();
  }

  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);

  console.error('Azure Management tools registered: 31 tools, 4 prompts');
}

// ========================================
// CLI ENTRY POINT
// ========================================

if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: 'mcp-azure-management',
    version: '1.0.0',
    capabilities: {
      tools: {},
      prompts: {},
    },
  });

  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start Azure Management MCP server:', error);
    process.exit(1);
  });

  console.error('Azure Management MCP server running');
}
