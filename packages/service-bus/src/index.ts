#!/usr/bin/env node

/**
 * @mcp-consultant-tools/service-bus
 *
 * MCP server for Azure Service Bus integration.
 * Entry point: MCP server startup + backward-compatible registerServiceBusTools().
 */

import { createRequire } from 'node:module';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";

import { ServiceBusService } from './services/service-bus-service.js';
import type { ServiceBusConfig } from './models/index.js';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
function createServiceContext(): ServiceContext {
  let service: ServiceBusService | null = null;

  function getService(): ServiceBusService {
    if (!service) {
      let resources: any[] = [];

      if (process.env.SERVICEBUS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.SERVICEBUS_RESOURCES);
        } catch (error) {
          throw new Error("Failed to parse SERVICEBUS_RESOURCES JSON");
        }
      } else if (process.env.SERVICEBUS_NAMESPACE) {
        resources = [{
          id: 'default',
          name: 'Default Service Bus',
          namespace: process.env.SERVICEBUS_NAMESPACE,
          active: true,
          connectionString: process.env.SERVICEBUS_CONNECTION_STRING || '',
        }];
      } else {
        throw new Error("Missing Service Bus configuration: SERVICEBUS_RESOURCES or SERVICEBUS_NAMESPACE");
      }

      const config: ServiceBusConfig = {
        resources,
        authMethod: (process.env.SERVICEBUS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'connection-string',
        tenantId: process.env.SERVICEBUS_TENANT_ID || '',
        clientId: process.env.SERVICEBUS_CLIENT_ID || '',
        clientSecret: process.env.SERVICEBUS_CLIENT_SECRET || '',
      };

      service = new ServiceBusService(config);
      console.error("Service Bus service initialized");
    }
    return service;
  }

  return {
    get serviceBus() { return getService(); },
  };
}

/**
 * Register Service Bus tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerServiceBusTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);
}

// Backward-compatible exports
export { ServiceBusService } from './services/service-bus-service.js';
export type {
  ServiceBusConfig,
  ServiceBusResource,
  QueueInfo,
  SearchResult,
  SearchCriteria,
} from './models/index.js';
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
    name: "mcp-service-bus",
    version: pkg.version,
    capabilities: { tools: {}, prompts: {} },
  });

  registerServiceBusTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Service Bus MCP server:", error);
    process.exit(1);
  });

  console.error("Service Bus MCP server running");
}
