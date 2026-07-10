/**
 * Shared ServiceContext factory for Entra ID.
 * Used by both the MCP server (index.ts) and the CLI (cli.ts) — there is exactly one copy.
 */

import { EntraIdClient, type EntraIdClientConfig } from './entra-client.js';
import { AppRegistrationService } from './services/app-registration-service.js';
import type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let client: EntraIdClient | null = null;
  let appRegistration: AppRegistrationService | null = null;

  function getClient(): EntraIdClient {
    if (!client) {
      const tenantId = process.env.ENTRA_ID_TENANT_ID;
      const clientId = process.env.ENTRA_ID_CLIENT_ID;
      const clientSecret = process.env.ENTRA_ID_CLIENT_SECRET;

      const missingConfig: string[] = [];
      if (!tenantId) missingConfig.push('ENTRA_ID_TENANT_ID');
      if (!clientId) missingConfig.push('ENTRA_ID_CLIENT_ID');
      if (!clientSecret) missingConfig.push('ENTRA_ID_CLIENT_SECRET');

      if (missingConfig.length > 0) {
        throw new Error(`Missing Entra ID configuration: ${missingConfig.join(', ')}`);
      }

      const config: EntraIdClientConfig = {
        tenantId: tenantId!,
        clientId: clientId!,
        clientSecret: clientSecret!,
      };

      client = new EntraIdClient(config);
      // Never log the tenant or client ID — it lands in transcripts and logs.
      console.error('Entra ID client initialized');
    }
    return client;
  }

  return {
    get appRegistration() {
      return (appRegistration ??= new AppRegistrationService(getClient()));
    },
  };
}
