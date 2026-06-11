#!/usr/bin/env node

/**
 * @mcp-consultant-tools/figma
 *
 * MCP server for Figma integration.
 * Entry point: MCP server startup + backward-compatible registerFigmaTools().
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";

import { FigmaService } from './services/figma-service.js';
import type { FigmaConfig } from './models/index.js';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
function createServiceContext(): ServiceContext {
  let service: FigmaService | null = null;

  function getService(): FigmaService {
    if (!service) {
      const missingConfig: string[] = [];
      if (!process.env.FIGMA_API_KEY && !process.env.FIGMA_OAUTH_TOKEN) {
        missingConfig.push("FIGMA_API_KEY or FIGMA_OAUTH_TOKEN");
      }

      if (missingConfig.length > 0) {
        throw new Error(
          `Missing required Figma configuration: ${missingConfig.join(", ")}. ` +
          `Set FIGMA_API_KEY or FIGMA_OAUTH_TOKEN environment variable.`
        );
      }

      const config: FigmaConfig = {
        apiKey: process.env.FIGMA_API_KEY,
        oauthToken: process.env.FIGMA_OAUTH_TOKEN,
        useOAuth: process.env.FIGMA_USE_OAUTH === "true",
      };

      service = new FigmaService(config);
      console.error("Figma service initialized");
    }
    return service;
  }

  return {
    get figma() { return getService(); },
  };
}

/**
 * Register Figma tools to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerFigmaTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
}

// Backward-compatible exports
export { FigmaService } from './services/figma-service.js';
export type { FigmaConfig, FigmaDataOptions } from './models/index.js';
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
    name: "@mcp-consultant-tools/figma",
    version: "1.0.0",
    capabilities: {
      tools: {},
    },
  });

  registerFigmaTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Figma MCP server:", error);
    process.exit(1);
  });

  console.error("@mcp-consultant-tools/figma server running on stdio");
}
