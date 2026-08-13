#!/usr/bin/env node

/**
 * @mcp-consultant-tools/application-insights
 *
 * MCP server for Azure Application Insights integration.
 * Entry point: MCP server startup + backward-compatible registerApplicationInsightsTools().
 */

import { createRequire } from 'node:module';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";

import { ApplicationInsightsService } from './services/appinsights-service.js';
import type { ApplicationInsightsConfig } from './services/appinsights-service.js';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
function createServiceContext(): ServiceContext {
  let service: ApplicationInsightsService | null = null;

  function getService(): ApplicationInsightsService {
    if (!service) {
      let resources: any[] = [];

      if (process.env.APPINSIGHTS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.APPINSIGHTS_RESOURCES);
        } catch (error) {
          throw new Error("Failed to parse APPINSIGHTS_RESOURCES JSON");
        }
      } else if (process.env.APPINSIGHTS_APP_ID) {
        resources = [{
          id: 'default',
          name: 'Default Application Insights',
          appId: process.env.APPINSIGHTS_APP_ID,
          active: true,
        }];
      } else {
        throw new Error("Missing Application Insights configuration: APPINSIGHTS_RESOURCES or APPINSIGHTS_APP_ID");
      }

      const config: ApplicationInsightsConfig = {
        resources,
        authMethod: (process.env.APPINSIGHTS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
        tenantId: process.env.APPINSIGHTS_TENANT_ID || '',
        clientId: process.env.APPINSIGHTS_CLIENT_ID || '',
        clientSecret: process.env.APPINSIGHTS_CLIENT_SECRET || '',
      };

      service = new ApplicationInsightsService(config);
      console.error("Application Insights service initialized");
    }
    return service;
  }

  return {
    get appInsights() { return getService(); },
  };
}

/**
 * Register Application Insights tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerApplicationInsightsTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);
  console.error("application-insights tools registered: 10 tools, 5 prompts");
}

// Backward-compatible exports
export { ApplicationInsightsService } from './services/appinsights-service.js';
export type {
  ApplicationInsightsConfig,
  ApplicationInsightsResourceConfig,
  QueryResult,
  MetadataResult,
} from './services/appinsights-service.js';
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
    name: "mcp-application-insights",
    version: pkg.version,
    capabilities: { tools: {}, prompts: {} },
  });

  registerApplicationInsightsTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Application Insights MCP server:", error);
    process.exit(1);
  });

  console.error("Application Insights MCP server running");
}
