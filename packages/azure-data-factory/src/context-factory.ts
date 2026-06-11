/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { AdfService } from './services/adf-service.js';
import type { AdfConfig, AdfFactoryConfig } from './models/index.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let service: AdfService | null = null;

  function getService(): AdfService {
    if (!service) {
      const missingConfig: string[] = [];
      let factories: AdfFactoryConfig[] = [];

      if (process.env.AZURE_DATA_FACTORIES) {
        try {
          factories = JSON.parse(process.env.AZURE_DATA_FACTORIES);
        } catch {
          throw new Error('Failed to parse AZURE_DATA_FACTORIES JSON');
        }
      } else if (process.env.AZURE_DATA_FACTORY_SUBSCRIPTION_ID) {
        factories = [{
          id: 'default',
          name: 'Default Data Factory',
          subscriptionId: process.env.AZURE_DATA_FACTORY_SUBSCRIPTION_ID,
          resourceGroup: process.env.AZURE_DATA_FACTORY_RESOURCE_GROUP || '',
          factoryName: process.env.AZURE_DATA_FACTORY_NAME || '',
          active: true,
        }];
        if (!factories[0].resourceGroup) missingConfig.push('AZURE_DATA_FACTORY_RESOURCE_GROUP');
        if (!factories[0].factoryName) missingConfig.push('AZURE_DATA_FACTORY_NAME');
      } else {
        missingConfig.push('AZURE_DATA_FACTORIES or AZURE_DATA_FACTORY_SUBSCRIPTION_ID');
      }

      if (!process.env.AZURE_TENANT_ID) missingConfig.push('AZURE_TENANT_ID');
      if (!process.env.AZURE_CLIENT_ID) missingConfig.push('AZURE_CLIENT_ID');
      if (!process.env.AZURE_CLIENT_SECRET) missingConfig.push('AZURE_CLIENT_SECRET');

      if (missingConfig.length > 0) {
        throw new Error(`Missing Azure Data Factory configuration: ${missingConfig.join(', ')}`);
      }

      const config: AdfConfig = {
        factories,
        tenantId: process.env.AZURE_TENANT_ID!,
        clientId: process.env.AZURE_CLIENT_ID!,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
        enableWrite: process.env.AZURE_DATA_FACTORY_ENABLE_WRITE?.toLowerCase() === 'true',
        enableTriggerControl: process.env.AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL?.toLowerCase() === 'true',
      };

      service = new AdfService(config);
      console.error('Azure Data Factory service initialized');
    }
    return service;
  }

  return {
    get adf() { return getService(); },
  };
}
