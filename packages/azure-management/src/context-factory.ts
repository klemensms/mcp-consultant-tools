/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { AzureManagementService, type AzureManagementConfig } from './AzureManagementService.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let managementService: AzureManagementService | null = null;

  function getService(): AzureManagementService {
    if (!managementService) {
      const missingConfig: string[] = [];

      const tenantId = process.env.AZURE_TENANT_ID;
      const clientId = process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;
      const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;

      if (!tenantId) missingConfig.push('AZURE_TENANT_ID');
      if (!clientId) missingConfig.push('AZURE_CLIENT_ID');
      if (!clientSecret) missingConfig.push('AZURE_CLIENT_SECRET');
      if (!subscriptionId) missingConfig.push('AZURE_SUBSCRIPTION_ID');

      if (missingConfig.length > 0) {
        throw new Error(`Missing Azure Management config: ${missingConfig.join(', ')}`);
      }

      const config: AzureManagementConfig = {
        tenantId: tenantId!,
        clientId: clientId!,
        clientSecret: clientSecret!,
        subscriptionId: subscriptionId!,
        resourceGroup: process.env.AZURE_RESOURCE_GROUP,
        redactSecrets: process.env.AZURE_REDACT_SECRETS !== 'false',
        enableWrite: process.env.AZURE_MGMT_ENABLE_WRITE === 'true',
      };

      managementService = new AzureManagementService(config);
    }
    return managementService;
  }

  return {
    get management() { return getService(); },
  };
}
