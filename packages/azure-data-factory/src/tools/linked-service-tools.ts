import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, FACTORY_ID_EXAMPLES } from '../tool-examples.js';

export function registerLinkedServiceTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'adf-list-linked-services',
    'List all linked services in an Azure Data Factory (credentials sanitized for security)',
    {
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({ factoryId }: { factoryId?: string }) => {
      try {
        const svc = ctx.adf;
        const linkedServices = await svc.listLinkedServices(factoryId);
        const factory = svc.resolveFactory(factoryId);

        const summary = linkedServices.map((ls) => ({
          name: ls.name,
          type: ls.properties.type,
          description: ls.properties.description,
          connectVia: ls.properties.connectVia?.referenceName,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  factory: factory.name,
                  count: linkedServices.length,
                  linkedServices: summary,
                  note: 'Connection strings and credentials are redacted for security',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error listing linked services:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to list linked services: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-list-data-flows',
    'List all data flows in an Azure Data Factory',
    {
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({ factoryId }: { factoryId?: string }) => {
      try {
        const svc = ctx.adf;
        const dataFlows = await svc.listDataFlows(factoryId);
        const factory = svc.resolveFactory(factoryId);

        const summary = dataFlows.map((df) => ({
          name: df.name,
          type: df.properties.type,
          description: df.properties.description,
          folder: df.properties.folder?.name,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  factory: factory.name,
                  count: dataFlows.length,
                  dataFlows: summary,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error listing data flows:', error);
        return {
          content: [
            { type: 'text', text: `Failed to list data flows: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-get-data-flow',
    'Get details of a specific data flow including transformations',
    {
      dataFlowName: z.string().describe('Name of the data flow'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({
      dataFlowName,
      factoryId,
    }: {
      dataFlowName: string;
      factoryId?: string;
    }) => {
      try {
        const svc = ctx.adf;
        const dataFlow = await svc.getDataFlow(dataFlowName, factoryId);

        return {
          content: [{ type: 'text', text: JSON.stringify(dataFlow, null, 2) }],
        };
      } catch (error: any) {
        console.error('Error getting data flow:', error);
        return {
          content: [
            { type: 'text', text: `Failed to get data flow: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
