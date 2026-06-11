/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { ApplicationInsightsService } from './services/appinsights-service.js';
import type { ApplicationInsightsConfig } from './services/appinsights-service.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let service: ApplicationInsightsService | null = null;

  function getService(): ApplicationInsightsService {
    if (!service) {
      let resources: any[] = [];

      if (process.env.APPINSIGHTS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.APPINSIGHTS_RESOURCES);
        } catch {
          throw new Error('Failed to parse APPINSIGHTS_RESOURCES JSON');
        }
      } else if (process.env.APPINSIGHTS_APP_ID) {
        resources = [{
          id: 'default',
          name: 'Default Application Insights',
          appId: process.env.APPINSIGHTS_APP_ID,
          active: true,
        }];
      } else {
        throw new Error('Missing Application Insights configuration: APPINSIGHTS_RESOURCES or APPINSIGHTS_APP_ID');
      }

      const config: ApplicationInsightsConfig = {
        resources,
        authMethod: (process.env.APPINSIGHTS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
        tenantId: process.env.APPINSIGHTS_TENANT_ID || '',
        clientId: process.env.APPINSIGHTS_CLIENT_ID || '',
        clientSecret: process.env.APPINSIGHTS_CLIENT_SECRET || '',
      };

      service = new ApplicationInsightsService(config);
      console.error('Application Insights service initialized');
    }
    return service;
  }

  return {
    get appInsights() { return getService(); },
  };
}
