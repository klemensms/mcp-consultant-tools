#!/usr/bin/env node

/**
 * @mcp-consultant-tools/teams
 *
 * MCP server for Microsoft Teams integration.
 * Entry point: MCP server startup + backward-compatible registerTeamsTools().
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";

import { createServiceContext } from './context-factory.js';
import { registerAllTools } from './tools/index.js';

/**
 * Register Teams tools to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerTeamsTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
}

// Backward-compatible exports
export { TeamsService } from './services/teams-service.js';
export type { TeamsConfig } from './types.js';
export type { ServiceContext } from './types.js';
export * from './types.js';
export { getCardFromTemplate, AVAILABLE_TEMPLATES } from './cards/templates.js';

/**
 * Standalone CLI server (when run directly)
 * Uses realpathSync to resolve symlinks created by npx
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: "@mcp-consultant-tools/teams",
    version: "1.0.0",
    capabilities: {
      tools: {},
      prompts: {},
    },
  });

  registerTeamsTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start @mcp-consultant-tools/teams MCP server:", error);
    process.exit(1);
  });

  console.error("@mcp-consultant-tools/teams server running on stdio");
}
