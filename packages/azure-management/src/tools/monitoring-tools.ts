import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, RESOURCE_GROUP_EXAMPLES } from '../tool-examples.js';

export function registerMonitoringTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'list-alert-rules',
    'List all metric alert rules in the subscription or resource group',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
      targetResourceId: z.string().optional().describe('Filter alerts for a specific resource ID'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.monitoring.listAlertRules(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing alert rules:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-action-groups',
    'List all action groups (notification targets) in the subscription or resource group',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.monitoring.listActionGroups(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing action groups:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-smart-detector-alerts',
    'List all smart detector (AI-based) alert rules',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.monitoring.listSmartDetectorAlerts(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing smart detector alerts:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
