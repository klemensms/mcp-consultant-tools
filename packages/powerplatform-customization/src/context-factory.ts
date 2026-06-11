/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { PowerPlatformService, PowerPlatformConfig } from './PowerPlatformService.js';
import { initializePublisherPrefix } from '@mcp-consultant-tools/powerplatform-core';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(service?: PowerPlatformService): ServiceContext {
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
    get pp() { return getPowerPlatformService(); },
  };
}
