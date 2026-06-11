import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { formatIntegrationRuntimeStatus } from '../utils/formatters.js';
import { descWithExamples, FACTORY_ID_EXAMPLES } from '../tool-examples.js';

export function registerMonitoringTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'adf-list-integration-runtimes',
    'List all integration runtimes in an Azure Data Factory',
    {
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({ factoryId }: { factoryId?: string }) => {
      try {
        const svc = ctx.adf;
        const runtimes = await svc.listIntegrationRuntimes(factoryId);
        const factory = svc.resolveFactory(factoryId);

        const summary = runtimes.map((ir) => ({
          name: ir.name,
          type: ir.properties.type,
          state: ir.properties.state,
          description: ir.properties.description,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  factory: factory.name,
                  count: runtimes.length,
                  integrationRuntimes: summary,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error listing integration runtimes:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to list integration runtimes: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-get-integration-runtime-status',
    'Get detailed status of an integration runtime including node counts and availability',
    {
      irName: z.string().describe('Name of the integration runtime'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({ irName, factoryId }: { irName: string; factoryId?: string }) => {
      try {
        const svc = ctx.adf;
        const status = await svc.getIntegrationRuntimeStatus(irName, factoryId);

        return {
          content: [{ type: 'text', text: formatIntegrationRuntimeStatus(status) }],
        };
      } catch (error: any) {
        console.error('Error getting integration runtime status:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get integration runtime status: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-start-integration-runtime',
    'Start a managed integration runtime. Requires AZURE_DATA_FACTORY_ENABLE_WRITE=true.',
    {
      irName: z.string().describe('Name of the integration runtime to start'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({ irName, factoryId }: { irName: string; factoryId?: string }) => {
      try {
        const svc = ctx.adf;
        await svc.startIntegrationRuntime(irName, factoryId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Integration runtime '${irName}' start initiated`,
                  note: 'Managed IR startup can take 2-5 minutes',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error starting integration runtime:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to start integration runtime: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-stop-integration-runtime',
    'Stop a managed integration runtime. Requires AZURE_DATA_FACTORY_ENABLE_WRITE=true.',
    {
      irName: z.string().describe('Name of the integration runtime to stop'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({ irName, factoryId }: { irName: string; factoryId?: string }) => {
      try {
        const svc = ctx.adf;
        await svc.stopIntegrationRuntime(irName, factoryId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Integration runtime '${irName}' stop initiated`,
                  note: 'The IR may take a moment to fully stop',
                },
                null,
                2
              ),
            },
          ],
          isError: false,
        };
      } catch (error: any) {
        console.error('Error stopping integration runtime:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to stop integration runtime: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
