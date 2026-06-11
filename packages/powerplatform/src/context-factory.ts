/**
 * Shared ServiceContext factory for PowerPlatform.
 * Used by both MCP server (index.ts) and CLI (cli.ts).
 */

import { PowerPlatformService, type PowerPlatformConfig } from './PowerPlatformService.js';
import type { ServiceContext } from './types.js';

/**
 * Build a ServiceContext from environment variables (lazy client initialization).
 */
export function createServiceContext(service?: PowerPlatformService): ServiceContext {
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
