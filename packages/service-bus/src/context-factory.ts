/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { ServiceBusService } from './services/service-bus-service.js';
import type { ServiceBusConfig } from './models/index.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let service: ServiceBusService | null = null;

  function getService(): ServiceBusService {
    if (!service) {
      let resources: any[] = [];

      if (process.env.SERVICEBUS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.SERVICEBUS_RESOURCES);
        } catch {
          throw new Error('Failed to parse SERVICEBUS_RESOURCES JSON');
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
        throw new Error('Missing Service Bus configuration: SERVICEBUS_RESOURCES or SERVICEBUS_NAMESPACE');
      }

      const config: ServiceBusConfig = {
        resources,
        authMethod: (process.env.SERVICEBUS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'connection-string',
        tenantId: process.env.SERVICEBUS_TENANT_ID || '',
        clientId: process.env.SERVICEBUS_CLIENT_ID || '',
        clientSecret: process.env.SERVICEBUS_CLIENT_SECRET || '',
      };

      service = new ServiceBusService(config);
      console.error('Service Bus service initialized');
    }
    return service;
  }

  return {
    get serviceBus() { return getService(); },
  };
}
