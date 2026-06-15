#!/usr/bin/env node

/**
 * @mcp-consultant-tools/rest-api
 *
 * MCP server for REST API testing with OAuth2 client credentials support.
 * Entry point: MCP server startup + registerRestApiTools().
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";

import { createServiceContext } from './context-factory.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

/**
 * Register REST API tools and prompts to an MCP server.
 *
 * Config + ServiceContext are built by the shared context-factory so the MCP
 * server and CLI never drift (e.g. REST_ALLOWED_HOSTS must be honoured by both).
 */
export function registerRestApiTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server);
}

// Backward-compatible exports
export { RestApiService } from './services/rest-api-service.js';
export type {
  RestApiConfig,
  RequestOptions,
  RequestResult,
  EndpointDefinition,
  EntitySchema,
  FieldDefinition,
} from './models/index.js';
export type { ServiceContext } from './types.js';

/**
 * Standalone CLI server (when run directly)
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: "@mcp-consultant-tools/rest-api",
    version: "1.0.0",
    capabilities: {
      tools: {},
      prompts: {},
    },
  });

  registerRestApiTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start REST API MCP server:", error);
    process.exit(1);
  });

  console.error("@mcp-consultant-tools/rest-api server running on stdio");
}
