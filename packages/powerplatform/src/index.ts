#!/usr/bin/env node

/**
 * @mcp-consultant-tools/powerplatform
 *
 * MCP server for PowerPlatform read-only integration (46 tools, 12 prompts).
 * Entry point: MCP server startup + backward-compatible registerPowerPlatformTools().
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';
import { PowerPlatformService, type PowerPlatformConfig } from './PowerPlatformService.js';
import { TokenCache } from '@mcp-consultant-tools/powerplatform-core';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

/**
 * Build a ServiceContext with lazy initialization.
 */
function createServiceContext(service?: PowerPlatformService): ServiceContext {
  let ppService: PowerPlatformService | null = service || null;

  function getPowerPlatformService(): PowerPlatformService {
    if (!ppService) {
      const coreRequiredVars = [
        'POWERPLATFORM_URL',
        'POWERPLATFORM_CLIENT_ID',
        'POWERPLATFORM_TENANT_ID'
      ];

      const missing = coreRequiredVars.filter(v => !process.env[v]);
      if (missing.length > 0) {
        throw new Error(`Missing required PowerPlatform configuration: ${missing.join(', ')}`);
      }

      const hasClientSecret = !!process.env.POWERPLATFORM_CLIENT_SECRET;

      const config: PowerPlatformConfig = {
        organizationUrl: process.env.POWERPLATFORM_URL!,
        clientId: process.env.POWERPLATFORM_CLIENT_ID!,
        clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
        tenantId: process.env.POWERPLATFORM_TENANT_ID!,
      };

      ppService = new PowerPlatformService(config);

      const authMode = hasClientSecret ? 'service-principal' : 'interactive';
      console.error(`PowerPlatform auth mode: ${authMode}`);
    }
    return ppService;
  }

  return {
    get pp() { return getPowerPlatformService(); }
  };
}

/**
 * Register PowerPlatform read-only tools with an MCP server
 * @param server - MCP server instance
 * @param service - Optional pre-initialized PowerPlatformService (for testing)
 */
export function registerPowerPlatformTools(server: any, service?: PowerPlatformService) {
  const ctx = createServiceContext(service);
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);
}

// Backward-compatible exports
export { PowerPlatformService } from './PowerPlatformService.js';
export type { PowerPlatformConfig } from './PowerPlatformService.js';
export type { ServiceContext } from './types.js';

// CLI entry point (standalone execution)
// Uses realpathSync to resolve symlinks created by npx
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  // Handle CLI commands
  const args = process.argv.slice(2);

  if (args.includes('--logout') || args.includes('-l')) {
    const clientId = process.env.POWERPLATFORM_CLIENT_ID;
    if (!clientId) {
      console.error('Error: POWERPLATFORM_CLIENT_ID is required for logout');
      console.error('Set the environment variable or use a .env file');
      process.exit(1);
    }

    const cache = new TokenCache(clientId);
    if (cache.exists()) {
      cache.clear();
      console.log('✓ Cached tokens cleared successfully');
      console.log(`  Cache file: ${cache.getCachePath()}`);
    } else {
      console.log('No cached tokens found');
    }
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
PowerPlatform MCP Server

USAGE:
  npx @mcp-consultant-tools/powerplatform [OPTIONS]

OPTIONS:
  --help, -h      Show this help message
  --logout, -l    Clear cached authentication tokens

AUTHENTICATION:
  Service Principal (with client secret):
    POWERPLATFORM_URL=https://org.crm.dynamics.com
    POWERPLATFORM_CLIENT_ID=your-client-id
    POWERPLATFORM_CLIENT_SECRET=your-secret
    POWERPLATFORM_TENANT_ID=your-tenant-id

  Interactive User Auth (without client secret):
    POWERPLATFORM_URL=https://org.crm.dynamics.com
    POWERPLATFORM_CLIENT_ID=your-client-id
    POWERPLATFORM_TENANT_ID=your-tenant-id

  When no client secret is provided, the server will open a browser
  for interactive sign-in using Microsoft Entra ID SSO.

EXAMPLES:
  # Start MCP server with service principal
  POWERPLATFORM_CLIENT_SECRET=xxx npx @mcp-consultant-tools/powerplatform

  # Start MCP server with interactive auth (opens browser)
  npx @mcp-consultant-tools/powerplatform

  # Clear cached tokens
  npx @mcp-consultant-tools/powerplatform --logout
`);
    process.exit(0);
  }

  // Start MCP server
  const server = createMcpServer({
    name: '@mcp-consultant-tools/powerplatform',
    version: '1.0.0',
    capabilities: { tools: {}, prompts: {} }
  });

  registerPowerPlatformTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start PowerPlatform MCP server:', error);
    process.exit(1);
  });

  console.error('PowerPlatform MCP server running (read-only)');
}
