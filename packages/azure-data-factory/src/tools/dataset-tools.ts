import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, FACTORY_ID_EXAMPLES } from '../tool-examples.js';

export function registerDatasetTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'adf-list-datasets',
    'List all datasets in an Azure Data Factory with their types and linked services',
    {
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ factoryId }: { factoryId?: string }) => {
      try {
        const svc = ctx.adf;
        const datasets = await svc.listDatasets(factoryId);
        const factory = svc.resolveFactory(factoryId);

        const summary = datasets.map((d) => ({
          name: d.name,
          type: d.properties.type,
          linkedService: d.properties.linkedServiceName?.referenceName,
          folder: d.properties.folder?.name,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  factory: factory.name,
                  count: datasets.length,
                  datasets: summary,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error listing datasets:', error);
        return {
          content: [
            { type: 'text', text: `Failed to list datasets: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-get-dataset',
    'Get details of a specific dataset including schema and linked service',
    {
      datasetName: z.string().describe('Name of the dataset'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({
      datasetName,
      factoryId,
    }: {
      datasetName: string;
      factoryId?: string;
    }) => {
      try {
        const svc = ctx.adf;
        const dataset = await svc.getDataset(datasetName, factoryId);

        return {
          content: [{ type: 'text', text: JSON.stringify(dataset, null, 2) }],
        };
      } catch (error: any) {
        console.error('Error getting dataset:', error);
        return {
          content: [
            { type: 'text', text: `Failed to get dataset: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
