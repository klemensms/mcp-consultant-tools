import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  formatPipelineRunSummary,
  formatActivityRuns,
  formatPipelineList,
  formatPipelineRunsJson,
  formatActivityRunsJson,
} from '../utils/formatters.js';
import { descWithExamples, PIPELINE_PARAM_EXAMPLES, RUN_STATUS_EXAMPLES, FACTORY_ID_EXAMPLES } from '../tool-examples.js';

export function registerPipelineTools(server: any, ctx: ServiceContext): void {
  // ========================================
  // FACTORY TOOLS
  // ========================================

  server.tool(
    'adf-list-factories',
    'List all configured Azure Data Factory instances',
    {},
    async () => {
      try {
        const svc = ctx.adf;
        const factories = svc.getAllFactories();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  factories: factories.map((f) => ({
                    id: f.id,
                    name: f.name,
                    factoryName: f.factoryName,
                    resourceGroup: f.resourceGroup,
                    active: f.active,
                  })),
                  writeEnabled: svc.isWriteEnabled(),
                  triggerControlEnabled: svc.isTriggerControlEnabled(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error listing factories:', error);
        return {
          content: [
            { type: 'text', text: `Failed to list factories: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // PIPELINE TOOLS
  // ========================================

  server.tool(
    'adf-list-pipelines',
    'List all pipelines in an Azure Data Factory',
    {
      factoryId: z
        .string()
        .optional()
        .describe(descWithExamples('Factory ID (use adf-list-factories to find IDs)', FACTORY_ID_EXAMPLES)),
    },
    async ({ factoryId }: { factoryId?: string }) => {
      try {
        const svc = ctx.adf;
        const pipelines = await svc.listPipelines(factoryId);
        const factory = svc.resolveFactory(factoryId);

        return {
          content: [
            {
              type: 'text',
              text:
                `## Pipelines in ${factory.name}\n\n` +
                formatPipelineList(pipelines) +
                `\n\n**Total: ${pipelines.length} pipelines**`,
            },
          ],
        };
      } catch (error: any) {
        console.error('Error listing pipelines:', error);
        return {
          content: [
            { type: 'text', text: `Failed to list pipelines: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-get-pipeline',
    'Get details of a specific pipeline including activities and parameters',
    {
      pipelineName: z.string().describe('Name of the pipeline'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({
      pipelineName,
      factoryId,
    }: {
      pipelineName: string;
      factoryId?: string;
    }) => {
      try {
        const svc = ctx.adf;
        const pipeline = await svc.getPipeline(pipelineName, factoryId);

        return {
          content: [{ type: 'text', text: JSON.stringify(pipeline, null, 2) }],
        };
      } catch (error: any) {
        console.error('Error getting pipeline:', error);
        return {
          content: [
            { type: 'text', text: `Failed to get pipeline: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-run-pipeline',
    'Trigger an Azure Data Factory pipeline run. Requires AZURE_DATA_FACTORY_ENABLE_WRITE=true.',
    {
      pipelineName: z.string().describe('Name of the pipeline to run'),
      parameters: z
        .record(z.any())
        .optional()
        .describe(descWithExamples('Pipeline parameters as key-value pairs', PIPELINE_PARAM_EXAMPLES)),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({
      pipelineName,
      parameters,
      factoryId,
    }: {
      pipelineName: string;
      parameters?: Record<string, any>;
      factoryId?: string;
    }) => {
      try {
        const svc = ctx.adf;
        const result = await svc.runPipeline(pipelineName, parameters, factoryId);
        const factory = svc.resolveFactory(factoryId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  runId: result.runId,
                  message: `Pipeline '${pipelineName}' triggered successfully`,
                  factory: factory.name,
                  monitorUrl: `https://adf.azure.com/en/monitoring/pipelineRuns/${result.runId}`,
                  nextSteps: [
                    `Use adf-get-pipeline-run with runId '${result.runId}' to check status`,
                    "Use adf-get-activity-runs to see activity-level details if the run fails",
                  ],
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error running pipeline:', error);
        return {
          content: [
            { type: 'text', text: `Failed to run pipeline: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-get-pipeline-run',
    'Get the status and details of a pipeline run including error messages if failed',
    {
      runId: z.string().describe('The pipeline run ID (returned by adf-run-pipeline or adf-query-pipeline-runs)'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({ runId, factoryId }: { runId: string; factoryId?: string }) => {
      try {
        const svc = ctx.adf;
        const run = await svc.getPipelineRun(runId, factoryId);

        return {
          content: [{ type: 'text', text: formatPipelineRunSummary(run) }],
        };
      } catch (error: any) {
        console.error('Error getting pipeline run:', error);
        return {
          content: [
            { type: 'text', text: `Failed to get pipeline run: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-get-activity-runs',
    'Get activity-level details for a pipeline run. Essential for debugging - shows which activity failed and why.',
    {
      runId: z.string().describe('The pipeline run ID'),
      status: z
        .enum(['Succeeded', 'Failed', 'InProgress', 'Cancelled', 'Queued'])
        .optional()
        .describe(descWithExamples('Filter by activity status', RUN_STATUS_EXAMPLES)),
      activityName: z
        .string()
        .optional()
        .describe('Filter by specific activity name'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({
      runId,
      status,
      activityName,
      factoryId,
    }: {
      runId: string;
      status?: string;
      activityName?: string;
      factoryId?: string;
    }) => {
      try {
        const svc = ctx.adf;
        const activities = await svc.getActivityRuns(runId, factoryId, {
          status,
          activityName,
        });

        // Try to get pipeline run info for context
        let pipelineRun;
        try {
          pipelineRun = await svc.getPipelineRun(runId, factoryId);
        } catch {
          // Ignore - just for context
        }

        const formatted = formatActivityRuns(activities, pipelineRun);
        const json = formatActivityRunsJson(activities);

        return {
          content: [
            { type: 'text', text: formatted },
            {
              type: 'text',
              text: '\n\n---\n\n**JSON Response:**\n\n```json\n' + JSON.stringify(json, null, 2) + '\n```',
            },
          ],
        };
      } catch (error: any) {
        console.error('Error getting activity runs:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get activity runs: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-cancel-pipeline-run',
    'Cancel a running pipeline. Requires AZURE_DATA_FACTORY_ENABLE_WRITE=true.',
    {
      runId: z.string().describe('The pipeline run ID to cancel'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({ runId, factoryId }: { runId: string; factoryId?: string }) => {
      try {
        const svc = ctx.adf;
        await svc.cancelPipelineRun(runId, factoryId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Pipeline run '${runId}' cancellation initiated`,
                  note: 'The pipeline may take a moment to fully cancel',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error cancelling pipeline run:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to cancel pipeline run: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-query-pipeline-runs',
    'Query pipeline runs with filters (date range, status, pipeline name)',
    {
      lastDays: z
        .number()
        .optional()
        .default(7)
        .describe('Number of days to look back (default: 7)'),
      pipelineName: z.string().optional().describe('Filter by pipeline name'),
      status: z
        .enum(['Queued', 'InProgress', 'Succeeded', 'Failed', 'Canceling', 'Cancelled'])
        .optional()
        .describe(descWithExamples('Filter by run status', RUN_STATUS_EXAMPLES)),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({
      lastDays,
      pipelineName,
      status,
      factoryId,
    }: {
      lastDays?: number;
      pipelineName?: string;
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
          orderBy: [{ orderBy: 'RunStart' as const, order: 'DESC' as const }],
        };

        if (pipelineName) {
          request.filters.push({
            operand: 'PipelineName',
            operator: 'Equals',
            values: [pipelineName],
          });
        }

        if (status) {
          request.filters.push({
            operand: 'Status',
            operator: 'Equals',
            values: [status],
          });
        }

        const result = await svc.queryPipelineRuns(request, factoryId);
        const formatted = formatPipelineRunsJson(result.value);

        return {
          content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }],
        };
      } catch (error: any) {
        console.error('Error querying pipeline runs:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to query pipeline runs: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'adf-rerun-pipeline',
    'Rerun a failed pipeline from the point of failure (recovery mode). Requires AZURE_DATA_FACTORY_ENABLE_WRITE=true.',
    {
      failedRunId: z.string().describe('The run ID of the failed pipeline'),
      startFromFailure: z
        .boolean()
        .optional()
        .default(true)
        .describe('Start from failed activities (default: true)'),
      startActivityName: z
        .string()
        .optional()
        .describe('Optionally specify exact activity to start from'),
      factoryId: z.string().optional().describe(descWithExamples('Factory ID', FACTORY_ID_EXAMPLES)),
    },
    async ({
      failedRunId,
      startFromFailure,
      startActivityName,
      factoryId,
    }: {
      failedRunId: string;
      startFromFailure?: boolean;
      startActivityName?: string;
      factoryId?: string;
    }) => {
      try {
        const svc = ctx.adf;

        // Get the original run to find the pipeline name
        const originalRun = await svc.getPipelineRun(failedRunId, factoryId);

        const result = await svc.runPipeline(
          originalRun.pipelineName,
          originalRun.parameters,
          factoryId,
          {
            referencePipelineRunId: failedRunId,
            isRecovery: true,
            startFromFailure: startFromFailure ?? true,
            startActivityName,
          }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  runId: result.runId,
                  message: `Pipeline '${originalRun.pipelineName}' rerun initiated in recovery mode`,
                  originalRunId: failedRunId,
                  startFromFailure: startFromFailure ?? true,
                  startActivityName: startActivityName || 'Auto-detect failed activities',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        console.error('Error rerunning pipeline:', error);
        return {
          content: [
            { type: 'text', text: `Failed to rerun pipeline: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
