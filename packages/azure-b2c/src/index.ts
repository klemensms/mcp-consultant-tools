#!/usr/bin/env node
/**
 * @mcp-consultant-tools/azure-b2c
 *
 * MCP server for Azure AD B2C user management via Microsoft Graph API.
 * Entry point: MCP server startup + backward-compatible registerAzureB2CTools().
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets, createPiiPipelineFromEnv } from "@mcp-consultant-tools/core";

import { B2CClient } from './b2c-client.js';
import { UserService } from './services/user-service.js';
import { GroupService } from './services/group-service.js';
import type { AzureB2CConfig } from './models/index.js';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
function createServiceContext(): ServiceContext {
  const piiPipeline = createPiiPipelineFromEnv({
    environmentIdentifier: process.env.AZURE_B2C_TENANT_ID,
  });
  let client: B2CClient | null = null;
  let userService: UserService | null = null;
  let groupService: GroupService | null = null;

  function getClient(): B2CClient {
    if (!client) {
      const missingConfig: string[] = [];

      const tenantId = process.env.AZURE_B2C_TENANT_ID;
      const clientId = process.env.AZURE_B2C_CLIENT_ID;
      const clientSecret = process.env.AZURE_B2C_CLIENT_SECRET;

      if (!tenantId) missingConfig.push("AZURE_B2C_TENANT_ID");
      if (!clientId) missingConfig.push("AZURE_B2C_CLIENT_ID");
      if (!clientSecret) missingConfig.push("AZURE_B2C_CLIENT_SECRET");

      if (missingConfig.length > 0) {
        throw new Error(`Missing Azure B2C configuration: ${missingConfig.join(", ")}`);
      }

      const config: AzureB2CConfig = {
        tenantId: tenantId!,
        clientId: clientId!,
        clientSecret: clientSecret!,
        enablePasswordReset: process.env.AZURE_B2C_ENABLE_PASSWORD_RESET === 'true',
        enableUserCreate: process.env.AZURE_B2C_ENABLE_USER_CREATE === 'true',
        enableUserUpdate: process.env.AZURE_B2C_ENABLE_USER_UPDATE === 'true',
        enableUserDelete: process.env.AZURE_B2C_ENABLE_USER_DELETE === 'true',
        maxResults: parseInt(process.env.AZURE_B2C_MAX_RESULTS || '100'),
      };

      client = new B2CClient(config);
      console.error("Azure B2C client initialized");
    }
    return client;
  }

  function getUserService(): UserService {
    if (!userService) {
      userService = new UserService(getClient(), piiPipeline);
    }
    return userService;
  }

  function getGroupService(): GroupService {
    if (!groupService) {
      groupService = new GroupService(getClient(), getUserService());
    }
    return groupService;
  }

  return {
    get client() { return getClient(); },
    get users() { return getUserService(); },
    get groups() { return getGroupService(); },
  };
}

/**
 * Register Azure B2C tools and prompts on an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerAzureB2CTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);
}

// Backward-compatible exports
export { B2CClient } from './b2c-client.js';
export { UserService } from './services/user-service.js';
export { GroupService } from './services/group-service.js';
export type {
  AzureB2CConfig,
  B2CUser,
  B2CGroup,
  B2CIdentity,
  CreateUserRequest,
  UpdateUserRequest,
  TenantSummary,
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
    name: "azure-b2c",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} },
  });

  registerAzureB2CTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Azure B2C MCP server:", error);
    process.exit(1);
  });

  console.error("Azure B2C MCP server running");
}
