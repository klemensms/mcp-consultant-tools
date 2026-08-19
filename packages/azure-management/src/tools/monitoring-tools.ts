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
    { readOnlyHint: true, openWorldHint: true },
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
    { readOnlyHint: true, openWorldHint: true },
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
    { readOnlyHint: true, openWorldHint: true },
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

  server.tool(
    'list-scheduled-query-rules',
    'List log-search alert rules (Microsoft.Insights/scheduledQueryRules). A DIFFERENT provider surface from list-alert-rules, which reads Microsoft.Insights/metricAlerts - neither count is the whole alerting configuration, and summary.note says so on every result including an empty one. Quote summary.alerting rather than summary.total as coverage: a disabled rule fires nothing, and a kind LogToMetric rule emits a metric instead of alerting. Rules with no action group are counted separately, because they evaluate and then notify nobody.',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.monitoring.listScheduledQueryRules(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing scheduled query rules:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
