#!/usr/bin/env node

/**
 * @mcp-consultant-tools/log-analytics
 *
 * MCP server for Azure Log Analytics integration.
 * Entry point: MCP server startup + backward-compatible registerLogAnalyticsTools().
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";

import { LogAnalyticsService } from './services/log-analytics-service.js';
import type { LogAnalyticsConfig } from './services/log-analytics-service.js';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
function createServiceContext(): ServiceContext {
  let service: LogAnalyticsService | null = null;

  function getService(): LogAnalyticsService {
    if (!service) {
      let resources: any[] = [];

      if (process.env.LOGANALYTICS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.LOGANALYTICS_RESOURCES);
        } catch (error) {
          throw new Error("Failed to parse LOGANALYTICS_RESOURCES JSON");
        }
      } else if (process.env.LOGANALYTICS_WORKSPACE_ID) {
        resources = [{
          id: 'default',
          name: 'Default Workspace',
          workspaceId: process.env.LOGANALYTICS_WORKSPACE_ID,
          active: true,
        }];
      } else {
        throw new Error("Missing Log Analytics configuration: LOGANALYTICS_RESOURCES or LOGANALYTICS_WORKSPACE_ID");
      }

      const config: LogAnalyticsConfig = {
        resources,
        authMethod: (process.env.LOGANALYTICS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
        tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
        clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
        clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
      };

      service = new LogAnalyticsService(config);
      console.error("Log Analytics service initialized");
    }
    return service;
  }

  return {
    get logAnalytics() { return getService(); },
  };
}

/**
 * Register Log Analytics tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerLogAnalyticsTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);
}

// Backward-compatible exports
export { LogAnalyticsService } from './services/log-analytics-service.js';
export type {
  LogAnalyticsConfig,
  LogAnalyticsResourceConfig,
  QueryResult,
  MetadataResult,
} from './services/log-analytics-service.js';
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
    name: "mcp-log-analytics",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} },
  });

  registerLogAnalyticsTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Log Analytics MCP server:", error);
    process.exit(1);
  });

  console.error("Log Analytics MCP server running");
}
