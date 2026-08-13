#!/usr/bin/env node

/**
 * @mcp-consultant-tools/1password
 *
 * MCP server for 1Password vault and item management.
 * Entry point: MCP server startup + backward-compatible registerOnePasswordTools().
 */

import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';
import { registerAllTools } from './tools/index.js';
import { createServiceContext } from './context-factory.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Register onepassword tools with an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerOnePasswordTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
}

// Re-exports for consumers
export { OnePasswordClient } from './onepassword-client.js';
export type { ServiceContext, OnePasswordConfig } from './types.js';

/**
 * Standalone MCP server (when run directly)
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: '@mcp-consultant-tools/1password',
    version: pkg.version,
    capabilities: { tools: {} },
  });

  registerOnePasswordTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start onepassword MCP server:', error);
    process.exit(1);
  });

  console.error('@mcp-consultant-tools/1password server running on stdio');
}
