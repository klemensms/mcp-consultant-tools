#!/usr/bin/env node

/**
 * @mcp-consultant-tools/fabric
 *
 * MCP server for Microsoft Fabric integration.
 * Entry point: MCP server startup + backward-compatible registerFabricTools().
 */

import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';

import { createServiceContext } from './context-factory.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Register Microsoft Fabric tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerFabricTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);

  const writeEnabled = process.env.FABRIC_ENABLE_WRITE === 'true';
  const deleteEnabled = process.env.FABRIC_ENABLE_DELETE === 'true';
  console.error(
    `Microsoft Fabric tools registered: 27 tools, 2 prompts ` +
    `(write: ${writeEnabled ? 'enabled' : 'disabled'}, delete: ${deleteEnabled ? 'enabled' : 'disabled'})`,
  );
}

// Backward-compatible exports
export { FabricClient } from './fabric-client.js';
export { createServiceContext } from './context-factory.js';
export type { ServiceContext } from './types.js';
export { FabricAuthProvider, resolveAuthConfig } from './fabric-auth-provider.js';
export type { FabricAuthConfig } from './fabric-auth-provider.js';

/**
 * Standalone MCP server (when run directly).
 * Uses realpathSync to resolve symlinks created by npx.
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: '@mcp-consultant-tools/fabric',
    version: pkg.version,
    capabilities: { tools: {}, prompts: {} },
  });

  registerFabricTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start Microsoft Fabric MCP server:', error);
    process.exit(1);
  });

  console.error('Microsoft Fabric MCP server running on stdio');
}
