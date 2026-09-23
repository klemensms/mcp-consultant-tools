#!/usr/bin/env node

/**
 * @mcp-consultant-tools/sharepoint
 *
 * MCP server for SharePoint Online integration.
 * Entry point: MCP server startup + backward-compatible registerSharePointTools().
 */

import { createRequire } from 'node:module';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";

import { createServiceContext } from './context-factory.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Register SharePoint tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerSharePointTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);

  const writeEnabled = process.env.SHAREPOINT_ENABLE_WRITE === 'true';
  const deleteEnabled = process.env.SHAREPOINT_ENABLE_DELETE === 'true';
  const writeToolCount = writeEnabled ? 5 : 0;
  const deleteToolCount = deleteEnabled ? 1 : 0;
  const totalTools = 22 + writeToolCount + deleteToolCount;
  console.error(`SharePoint tools registered: ${totalTools} tools (${writeToolCount + deleteToolCount} write), 10 prompts`);
}

// Backward-compatible exports
export { SharePointService } from './services/sharepoint-service.js';
export type { SharePointConfig } from './services/sharepoint-service.js';
export { ListService } from './services/list-service.js';
export { FileOperationsService } from './services/file-operations-service.js';
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
    name: "mcp-sharepoint",
    version: pkg.version,
    capabilities: { tools: {}, prompts: {} },
  });

  registerSharePointTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start SharePoint MCP server:", error);
    process.exit(1);
  });

  console.error("SharePoint MCP server running");
}
