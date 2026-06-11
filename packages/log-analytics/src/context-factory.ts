/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { LogAnalyticsService } from './services/log-analytics-service.js';
import type { LogAnalyticsConfig } from './services/log-analytics-service.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let service: LogAnalyticsService | null = null;

  function getService(): LogAnalyticsService {
    if (!service) {
      let resources: any[] = [];

      if (process.env.LOGANALYTICS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.LOGANALYTICS_RESOURCES);
        } catch {
          throw new Error('Failed to parse LOGANALYTICS_RESOURCES JSON');
        }
      } else if (process.env.LOGANALYTICS_WORKSPACE_ID) {
        resources = [{
          id: 'default',
          name: 'Default Workspace',
          workspaceId: process.env.LOGANALYTICS_WORKSPACE_ID,
          active: true,
        }];
      } else {
        throw new Error('Missing Log Analytics configuration: LOGANALYTICS_RESOURCES or LOGANALYTICS_WORKSPACE_ID');
      }

      const config: LogAnalyticsConfig = {
        resources,
        authMethod: (process.env.LOGANALYTICS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
        tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
        clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
        clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
      };

      service = new LogAnalyticsService(config);
      console.error('Log Analytics service initialized');
    }
    return service;
  }

  return {
    get logAnalytics() { return getService(); },
  };
}
