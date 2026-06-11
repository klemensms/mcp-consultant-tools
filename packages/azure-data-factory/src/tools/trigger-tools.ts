import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { formatTriggerList } from '../utils/formatters.js';
import { descWithExamples, FACTORY_ID_EXAMPLES, TRIGGER_RUN_STATUS_EXAMPLES } from '../tool-examples.js';

export function registerTriggerTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'adf-list-triggers',
    'List all triggers in an Azure Data Factory with their current state',
    {
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({ factoryId }: { factoryId?: string }) => {
      try {
        const svc = ctx.adf;
        const triggers = await svc.listTriggers(factoryId);
        const factory = svc.resolveFactory(factoryId);

        return {
          content: [
            {
              type: 'text',
              text:
                `## Triggers in ${factory.name}\n\n` +
                formatTriggerList(triggers) +
                `\n\n**Total: ${triggers.length} triggers**`,
            },
          ],
        };
      } catch (error: any) {
        console.error('Error listing triggers:', error);
        return {
          content: [
            { type: 'text', text: `Failed to list triggers: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-get-trigger',
    'Get details of a specific trigger including its schedule and configuration',
    {
      triggerName: z.string().describe('Name of the trigger'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({
      triggerName,
      factoryId,
    }: {
      triggerName: string;
      factoryId?: string;
    }) => {
      try {
        const svc = ctx.adf;
        const trigger = await svc.getTrigger(triggerName, factoryId);

        return {
          content: [{ type: 'text', text: JSON.stringify(trigger, null, 2) }],
        };
      } catch (error: any) {
        console.error('Error getting trigger:', error);
        return {
          content: [
            { type: 'text', text: `Failed to get trigger: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-start-trigger',
    'Start (activate) a trigger. Requires AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL=true.',
    {
      triggerName: z.string().describe('Name of the trigger to start'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({
      triggerName,
      factoryId,
    }: {
      triggerName: string;
      factoryId?: string;
    }) => {
      try {
        const svc = ctx.adf;
        await svc.startTrigger(triggerName, factoryId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Trigger '${triggerName}' start initiated`,
                  note: 'The trigger may take a moment to fully start',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error starting trigger:', error);
        return {
          content: [
            { type: 'text', text: `Failed to start trigger: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-stop-trigger',
    'Stop (deactivate) a trigger. Requires AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL=true.',
    {
      triggerName: z.string().describe('Name of the trigger to stop'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({
      triggerName,
      factoryId,
    }: {
      triggerName: string;
      factoryId?: string;
    }) => {
      try {
        const svc = ctx.adf;
        await svc.stopTrigger(triggerName, factoryId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Trigger '${triggerName}' stop initiated`,
                  note: 'The trigger may take a moment to fully stop',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error stopping trigger:', error);
        return {
          content: [
            { type: 'text', text: `Failed to stop trigger: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-query-trigger-runs',
    'Query trigger execution history',
    {
      lastDays: z
        .number()
        .optional()
        .default(7)
        .describe('Number of days to look back (default: 7)'),
      triggerName: z.string().optional().describe('Filter by trigger name'),
      status: z
        .enum(['Succeeded', 'Failed', 'Inprogress'])
        .optional()
        .describe(descWithExamples('Filter by run status', TRIGGER_RUN_STATUS_EXAMPLES)),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({
      lastDays,
      triggerName,
      status,
      factoryId,
    }: {
      lastDays?: number;
      triggerName?: string;
      status?: string;
      factoryId?: string;
    }) => {
      try {
        const svc = ctx.adf;
        const now = new Date();
        const days = lastDays || 7;

        const request = {
          lastUpdatedAfter: new Date(
            now.getTime() - days * 24 * 60 * 60 * 1000
          ).toISOString(),
          lastUpdatedBefore: new Date(
            now.getTime() + 24 * 60 * 60 * 1000
          ).toISOString(),
          filters: [] as any[],
          orderBy: [
            { orderBy: 'TriggerRunTimestamp' as const, order: 'DESC' as const },
          ],
        };

        if (triggerName) {
          request.filters.push({
            operand: 'TriggerName',
            operator: 'Equals',
            values: [triggerName],
          });
        }

        if (status) {
          request.filters.push({
            operand: 'Status',
            operator: 'Equals',
            values: [status],
          });
        }

        const result = await svc.queryTriggerRuns(request, factoryId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: result.value.length,
                  triggerRuns: result.value.map((tr) => ({
                    triggerRunId: tr.triggerRunId,
                    triggerName: tr.triggerName,
                    triggerType: tr.triggerType,
                    status: tr.status,
                    timestamp: tr.triggerRunTimestamp,
                    message: tr.message,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error querying trigger runs:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to query trigger runs: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
