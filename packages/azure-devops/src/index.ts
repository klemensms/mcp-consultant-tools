#!/usr/bin/env node

/**
 * @mcp-consultant-tools/azure-devops
 *
 * MCP server for Azure DevOps integration.
 * Entry point: MCP server startup + backward-compatible registerAzureDevOpsTools().
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";

import { createServiceContext } from './context-factory.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

/**
 * Register UI resources (MCP Apps) for interactive views.
 */
function registerUiResources(server: any): void {
  const resourceUri = "ui://ado/work-items";
  const htmlPath = path.join(import.meta.dirname, "ui", "work-items-app.html");

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: resourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: await fs.readFile(htmlPath, "utf-8"),
          _meta: {
            ui: {
              csp: {
                resourceDomains: ["https://cdn.jsdelivr.net"],
              },
            },
          },
        },
      ],
    }),
  );
}

/**
 * Register azure-devops tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerAzureDevOpsTools(server: any): void {
  const ctx = createServiceContext();
  registerUiResources(server);
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);
}

// Backward-compatible exports
export { AzureDevOpsClient } from './azure-devops-client.js';
export { createServiceContext } from './context-factory.js';
export type { AzureDevOpsConfig } from './models/index.js';
export type { ServiceContext } from './types.js';

// Auth provider exports
export { AdoAuthProvider, resolveAuthConfig } from './ado-auth-provider.js';
export type { AdoAuthConfig, AuthMode } from './ado-auth-provider.js';

/**
 * Standalone CLI server (when run directly)
 * Uses realpathSync to resolve symlinks created by npx
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: "@mcp-consultant-tools/azure-devops",
    version: "1.0.0",
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    },
  });

  registerAzureDevOpsTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start @mcp-consultant-tools/azure-devops MCP server:", error);
    process.exit(1);
  });

  console.error("@mcp-consultant-tools/azure-devops server running on stdio");
}
