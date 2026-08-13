#!/usr/bin/env node

/**
 * @mcp-consultant-tools/todoist
 *
 * MCP server for Todoist - projects and task CRUD.
 */

import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';

import { createServiceContext } from './context-factory.js';
import { registerAllTools } from './tools/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export { TodoistService } from './services/todoist-service.js';
export { TodoistClient } from './todoist-client.js';
export type { ServiceContext, TodoistConfig } from './types.js';
export * from './types.js';

/**
 * Register Todoist tools to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerTodoistTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
}

if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: '@mcp-consultant-tools/todoist',
    version: pkg.version,
    capabilities: {
      tools: {},
    },
  });

  registerTodoistTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start @mcp-consultant-tools/todoist MCP server:', error);
    process.exit(1);
  });

  console.error('@mcp-consultant-tools/todoist server running on stdio');
}
