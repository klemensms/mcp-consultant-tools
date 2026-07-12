/**
 * Shared ServiceContext factory for Message Center.
 * Used by both the MCP server (index.ts) and the CLI (cli.ts) — there is exactly one copy.
 */

import { MessageCenterClient, type MessageCenterClientConfig } from './message-center-client.js';
import { HealthService } from './services/health-service.js';
import { MessageService } from './services/message-service.js';
import type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let client: MessageCenterClient | null = null;
  let health: HealthService | null = null;
  let messages: MessageService | null = null;

  function getClient(): MessageCenterClient {
    if (!client) {
      const tenantId = process.env.MESSAGE_CENTER_TENANT_ID;
      const clientId = process.env.MESSAGE_CENTER_CLIENT_ID;
      const clientSecret = process.env.MESSAGE_CENTER_CLIENT_SECRET;

      const missingConfig: string[] = [];
      if (!tenantId) missingConfig.push('MESSAGE_CENTER_TENANT_ID');
      if (!clientId) missingConfig.push('MESSAGE_CENTER_CLIENT_ID');
      if (!clientSecret) missingConfig.push('MESSAGE_CENTER_CLIENT_SECRET');

      if (missingConfig.length > 0) {
        throw new Error(`Missing Message Center configuration: ${missingConfig.join(', ')}`);
      }

      const config: MessageCenterClientConfig = {
        tenantId: tenantId!,
        clientId: clientId!,
        clientSecret: clientSecret!,
      };

      client = new MessageCenterClient(config);
      // Never log the tenant or client ID — it lands in transcripts and logs.
      console.error('Message Center client initialized');
    }
    return client;
  }

  return {
    get health() {
      return (health ??= new HealthService(getClient()));
    },
    get messages() {
      return (messages ??= new MessageService(getClient()));
    },
  };
}
