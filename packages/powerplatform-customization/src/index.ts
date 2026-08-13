#!/usr/bin/env node
import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';
import { PowerPlatformService, PowerPlatformConfig } from './PowerPlatformService.js';
import { initializePublisherPrefix } from '@mcp-consultant-tools/powerplatform-core';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Create service context with lazy initialization.
 * @param service - Optional pre-initialized service (for testing/meta package)
 */
function createServiceContext(service?: PowerPlatformService): ServiceContext {
  let ppService: PowerPlatformService | null = service || null;

  function getPowerPlatformService(): PowerPlatformService {
    if (!ppService) {
      const requiredVars = [
        'POWERPLATFORM_URL',
        'POWERPLATFORM_CLIENT_ID',
        'POWERPLATFORM_TENANT_ID',
        'PUBLISHER_PREFIX'
      ];

      const missing = requiredVars.filter(v => !process.env[v]);
      if (missing.length > 0) {
        throw new Error(`Missing required PowerPlatform configuration: ${missing.join(', ')}`);
      }

      initializePublisherPrefix();

      const config: PowerPlatformConfig = {
        organizationUrl: process.env.POWERPLATFORM_URL!,
        clientId: process.env.POWERPLATFORM_CLIENT_ID!,
        clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
        tenantId: process.env.POWERPLATFORM_TENANT_ID!,
      };

      ppService = new PowerPlatformService(config);
    }
    return ppService;
  }

  return {
    get pp() { return getPowerPlatformService(); }
  };
}

/**
 * Register powerplatform-customization tools with an MCP server
 * @param server - MCP server instance
 * @param service - Optional pre-initialized PowerPlatformService (for testing)
 */
export function registerPowerplatformCustomizationTools(server: any, service?: PowerPlatformService) {
  const ctx = createServiceContext(service);
  registerAllTools(server, ctx);
}

// Backward-compat exports
export { PowerPlatformService } from './PowerPlatformService.js';
export type { PowerPlatformConfig } from './PowerPlatformService.js';
export type { ServiceContext } from './types.js';

// CLI entry point (standalone execution)
// Uses realpathSync to resolve symlinks created by npx
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: '@mcp-consultant-tools/powerplatform-customization',
    version: pkg.version,
    capabilities: { tools: {}, prompts: {} }
  });

  registerPowerplatformCustomizationTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start powerplatform-customization MCP server:', error);
    process.exit(1);
  });

  console.error('powerplatform-customization MCP server running');
}
