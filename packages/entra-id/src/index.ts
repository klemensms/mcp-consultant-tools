#!/usr/bin/env node

/**
 * @mcp-consultant-tools/entra-id
 *
 * MCP server for Microsoft Entra ID app-registration audit.
 * Entry point: MCP server startup + backward-compatible registerEntraIdTools().
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';

import { createServiceContext } from './context-factory.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

/**
 * Register Entra ID tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerEntraIdTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);
}

export { EntraIdClient, statusCodeOf } from './entra-client.js';
export type { EntraIdClientConfig, PaginatedResult } from './entra-client.js';
export { AppRegistrationService, DEFAULT_EXPIRY_DAYS } from './services/app-registration-service.js';
export { classifyCredential } from './utils/credential-status.js';
export type { CredentialStatus } from './utils/credential-status.js';
export { createServiceContext } from './context-factory.js';
export type { ServiceContext } from './types.js';

/**
 * Standalone MCP server (when run directly).
 * Uses realpathSync to resolve symlinks created by npx.
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: 'mcp-entra-id',
    version: '1.0.0',
    capabilities: { tools: {}, prompts: {} },
  });

  registerEntraIdTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start Entra ID MCP server:', error);
    process.exit(1);
  });

  console.error('Entra ID MCP server running');
}
