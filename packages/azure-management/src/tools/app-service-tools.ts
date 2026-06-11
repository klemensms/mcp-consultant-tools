import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  RESOURCE_GROUP_EXAMPLES,
  APP_SERVICE_NAME_EXAMPLES,
  LOG_TYPE_EXAMPLES,
  APP_SETTING_EXAMPLES,
} from '../tool-examples.js';

export function registerAppServiceTools(server: any, ctx: ServiceContext): void {
  // ============================================
  // Read Operations
  // ============================================

  server.tool(
    'list-app-services',
    'List all App Services (web apps) in the subscription or resource group',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
      includeConfiguration: z.boolean().optional().describe('Include app settings (default: false)'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.appServices.listAppServices(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing app services:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get-app-service',
    'Get detailed information about an App Service including config, deployments, and runtime details',
    {
      name: z.string().describe(
        descWithExamples('App Service name', APP_SERVICE_NAME_EXAMPLES)
      ),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
      includeConfiguration: z.boolean().optional().describe('Include app settings (default: true)'),
      includeDeployments: z.boolean().optional().describe('Include recent deployments (default: false)'),
      showValues: z.boolean().optional().describe('Show unredacted config values for this request (default: false). Overrides AZURE_REDACT_SECRETS for this call only.'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.appServices.getAppService(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error getting app service:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-app-service-plans',
    'List all App Service Plans (hosting plans) in the subscription or resource group',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.appServices.listAppServicePlans(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing app service plans:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get-app-service-logs',
    'Fetch recent application logs from an App Service via Kudu SCM API. Supports Docker container logs (Linux), event log (Windows), and stdout logs. Requires Website Contributor role.',
    {
      name: z.string().describe(
        descWithExamples('App Service name', APP_SERVICE_NAME_EXAMPLES)
      ),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
      logType: z.enum(['docker', 'stdout', 'eventlog', 'all']).optional().describe(
        descWithExamples('Type of logs to fetch (default: all available for the OS)', LOG_TYPE_EXAMPLES)
      ),
      maxLines: z.number().optional().describe('Maximum lines to return per log source (default: 200)'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.appServices.getAppServiceLogs(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error getting app service logs:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  // ============================================
  // Write Operations (require AZURE_MGMT_ENABLE_WRITE=true)
  // ============================================

  server.tool(
    'restart-app-service',
    'Restart an App Service (requires AZURE_MGMT_ENABLE_WRITE=true). Useful for applying config changes or recovering from errors.',
    {
      name: z.string().describe(
        descWithExamples('App Service name', APP_SERVICE_NAME_EXAMPLES)
      ),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.appServices.restartAppService(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error restarting app service:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'stop-app-service',
    'Stop a running App Service (requires AZURE_MGMT_ENABLE_WRITE=true). The app will be deallocated.',
    {
      name: z.string().describe(
        descWithExamples('App Service name', APP_SERVICE_NAME_EXAMPLES)
      ),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.appServices.stopAppService(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error stopping app service:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'start-app-service',
    'Start a stopped App Service (requires AZURE_MGMT_ENABLE_WRITE=true).',
    {
      name: z.string().describe(
        descWithExamples('App Service name', APP_SERVICE_NAME_EXAMPLES)
      ),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.appServices.startAppService(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error starting app service:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'set-app-service-config',
    descWithExamples(
      'Update app settings or connection strings on an App Service (requires AZURE_MGMT_ENABLE_WRITE=true). Merges with existing settings — does not replace the full set.',
      APP_SETTING_EXAMPLES
    ),
    {
      name: z.string().describe(
        descWithExamples('App Service name', APP_SERVICE_NAME_EXAMPLES)
      ),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
      appSettings: z.record(z.string()).optional().describe(
        descWithExamples('Key-value pairs of app settings to add or update', APP_SETTING_EXAMPLES)
      ),
      connectionStrings: z.record(
        z.object({
          value: z.string(),
          type: z.string().describe('Connection string type: SQLServer, Custom, SQLAzure, PostgreSQL, MySQL'),
        })
      ).optional().describe('Connection strings to add or update. Merged with existing.'),
      removeSettings: z.array(z.string()).optional().describe('App setting keys to remove'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.appServices.setAppServiceConfig(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error setting app service config:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
