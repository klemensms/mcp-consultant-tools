#!/usr/bin/env node

/**
 * @mcp-consultant-tools/message-center
 *
 * MCP server for Microsoft 365 Service Health + Message Center.
 * Entry point: MCP server startup + backward-compatible registerMessageCenterTools().
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';

import { createServiceContext } from './context-factory.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

/**
 * Register Message Center tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerMessageCenterTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);
}

export { MessageCenterClient, statusCodeOf } from './message-center-client.js';
export type { MessageCenterClientConfig, PaginatedResult } from './message-center-client.js';
export { HealthService, findServiceHealth, matchesIssue, decodeIncidentReport } from './services/health-service.js';
export { MessageService, matchesMessage } from './services/message-service.js';
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
    name: 'mcp-message-center',
    version: '1.0.0',
    capabilities: { tools: {}, prompts: {} },
  });

  registerMessageCenterTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start Message Center MCP server:', error);
    process.exit(1);
  });

  console.error('Message Center MCP server running');
}
