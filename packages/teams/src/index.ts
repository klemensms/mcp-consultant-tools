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

import { TeamsService } from './services/teams-service.js';
import type { TeamsConfig } from './types.js';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
function createServiceContext(): ServiceContext {
  let service: TeamsService | null = null;

  function getService(): TeamsService {
    if (!service) {
      const authMode = process.env.TEAMS_AUTH_MODE === "client-credentials"
        ? "client-credentials"
        : "device-code";

      const clientId = process.env.TEAMS_CLIENT_ID;
      const tenantId = process.env.TEAMS_TENANT_ID;

      if (!clientId) {
        throw new Error(
          "TEAMS_CLIENT_ID is required. You must register an Azure AD app:\n\n" +
          "1. Go to https://entra.microsoft.com → App registrations → New registration\n" +
          "2. Enable 'Allow public client flows' in Authentication settings\n" +
          "3. Add API permissions: User.Read, Team.ReadBasic.All, Channel.ReadBasic.All, ChannelMessage.Send, Group.Read.All\n" +
          "4. Grant admin consent\n" +
          "5. Set TEAMS_CLIENT_ID to your app's Application (client) ID"
        );
      }

      if (!tenantId) {
        throw new Error(
          "TEAMS_TENANT_ID is required. Set it to your Azure AD tenant ID.\n" +
          "Find it in Azure Portal → Azure Active Directory → Overview → Tenant ID"
        );
      }

      if (authMode === "client-credentials" && !process.env.TEAMS_CLIENT_SECRET) {
        throw new Error(
          "TEAMS_CLIENT_SECRET is required for client-credentials auth mode. " +
          "For interactive authentication, use TEAMS_AUTH_MODE=device-code (default)."
        );
      }

      const config: TeamsConfig = {
        authMode,
        tenantId,
        clientId,
        clientSecret: process.env.TEAMS_CLIENT_SECRET,
        defaultTeamId: process.env.TEAMS_DEFAULT_TEAM_ID,
        defaultChannelId: process.env.TEAMS_DEFAULT_CHANNEL_ID,
      };

      service = new TeamsService(config);
      console.error(`Teams service initialized (${authMode} mode)`);
    }
    return service;
  }

  return {
    get teams() { return getService(); },
  };
}

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
