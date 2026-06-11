#!/usr/bin/env node

/**
 * @mcp-consultant-tools/powerplatform-data
 *
 * MCP server for PowerPlatform/Dataverse data CRUD operations.
 * Entry point: MCP server startup + backward-compatible registerPowerplatformDataTools().
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';
import { PowerPlatformService } from './PowerPlatformService.js';
import { createServiceContext } from './context-factory.js';
import { registerAllTools } from './tools/index.js';

/**
 * Register powerplatform-data tools with an MCP server.
 * Backward-compatible API for the meta package.
 * @param server - MCP server instance
 * @param service - Optional pre-initialized PowerPlatformService (for testing)
 */
export function registerPowerplatformDataTools(server: any, service?: PowerPlatformService): void {
  const ctx = createServiceContext(service);
  registerAllTools(server, ctx);
}

// Backward-compatible exports
export { PowerPlatformService } from './PowerPlatformService.js';
export type { PowerPlatformConfig } from './PowerPlatformService.js';
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
    name: '@mcp-consultant-tools/powerplatform-data',
    version: '1.0.0',
    capabilities: { tools: {}, prompts: {} }
  });

  registerPowerplatformDataTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start powerplatform-data MCP server:', error);
    process.exit(1);
  });

  console.error('@mcp-consultant-tools/powerplatform-data server running on stdio');
}
