/**
 * Pipeline CLI Commands - 8 commands for pipeline operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';
import { buildDebugRunRequest, summariseDebugRuns } from '../../services/debug-run-query.js';

export function registerPipelineCommands(program: Command, ctx: ServiceContext): void {
  const pipeline = program.command('pipeline').description('Pipeline operations');

  pipeline
    .command('list')
    .description('List all pipelines in an Azure Data Factory')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (opts: any) => {
      try {
        const svc = ctx.adf;
        const pipelines = await svc.listPipelines(opts.factoryId);
        const factory = svc.resolveFactory(opts.factoryId);
        outputResult(
          { fileName: 'pipelines', data: pipelines, summary: `${pipelines.length} pipelines in ${factory.name}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list pipelines'); }
    });

  pipeline
    .command('get')
    .description('Get details of a specific pipeline')
    .argument('<name>', 'Pipeline name')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.adf.getPipeline(name, opts.factoryId);
        outputResult(
          { fileName: `pipeline-${name}`, data: result, summary: `Pipeline: ${name}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get pipeline'); }
    });

  pipeline
    .command('run')
    .description('Trigger a pipeline run (requires ENABLE_WRITE=true)')
    .argument('<name>', 'Pipeline name')
    .option('-f, --factory-id <id>', 'Factory ID')
    .option('-p, --parameters <json>', 'Pipeline parameters as JSON')
    .action(async (name: string, opts: any) => {
      try {
        const svc = ctx.adf;
        const params = opts.parameters ? JSON.parse(opts.parameters) : undefined;
        const result = await svc.runPipeline(name, params, opts.factoryId);
        const factory = svc.resolveFactory(opts.factoryId);
        const data = {
          runId: result.runId,
          message: `Pipeline '${name}' triggered successfully`,
          factory: factory.name,
        };
        outputResult(
          { persist: false, fileName: `pipeline-run-${result.runId}`, data, summary: `Pipeline '${name}' triggered. Run ID: ${result.runId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'run pipeline'); }
    });

  pipeline
    .command('get-run')
    .description('Get the status and details of a pipeline run')
    .argument('<runId>', 'Pipeline run ID')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (runId: string, opts: any) => {
      try {
        const result = await ctx.adf.getPipelineRun(runId, opts.factoryId);
        outputResult(
          { fileName: `pipeline-run-${runId}`, data: result, summary: `Pipeline run ${runId}: ${(result as any).status}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get pipeline run'); }
    });

  pipeline
    .command('cancel-run')
    .description('Cancel a running pipeline (requires ENABLE_WRITE=true)')
    .argument('<runId>', 'Pipeline run ID to cancel')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (runId: string, opts: any) => {
      try {
        await ctx.adf.cancelPipelineRun(runId, opts.factoryId);
        const data = { message: `Pipeline run '${runId}' cancellation initiated` };
        outputResult(
          { persist: false, fileName: `pipeline-cancel-${runId}`, data, summary: `Pipeline run '${runId}' cancellation initiated` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'cancel pipeline run'); }
    });

  pipeline
    .command('query-runs')
    .description('Query pipeline runs with filters')
    .option('-d, --last-days <n>', 'Number of days to look back', '7')
    .option('-n, --pipeline-name <name>', 'Filter by pipeline name')
    .option('-s, --status <status>', 'Filter by status (Queued|InProgress|Succeeded|Failed|Canceling|Cancelled)')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (opts: any) => {
      try {
        const svc = ctx.adf;
        const now = new Date();
        const days = parseInt(opts.lastDays) || 7;

        const request = {
          lastUpdatedAfter: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
          lastUpdatedBefore: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          filters: [] as any[],
          orderBy: [{ orderBy: 'RunStart' as const, order: 'DESC' as const }],
        };

        if (opts.pipelineName) {
          request.filters.push({ operand: 'PipelineName', operator: 'Equals', values: [opts.pipelineName] });
        }
        if (opts.status) {
          request.filters.push({ operand: 'Status', operator: 'Equals', values: [opts.status] });
        }

        const result = await svc.queryPipelineRuns(request, opts.factoryId);
        outputResult(
          { fileName: 'pipeline-runs', data: result.value, summary: `${result.value.length} pipeline runs found (last ${days} days)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'query pipeline runs'); }
    });

  pipeline
    .command('query-debug-runs')
    .description('Query DEBUG-mode pipeline run history (undocumented ARM op; ~15-day server-side retention)')
    .option('-d, --last-days <n>', 'Number of days to look back', '7')
    .option('-n, --pipeline-name <name>', 'Filter by pipeline name')
    .option('-s, --status <status>', 'Filter by status (Queued|InProgress|Succeeded|Failed|Canceling|Cancelled)')
    .option('-m, --max-results <n>', 'Max runs to return before truncating', '100')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (opts: any) => {
      try {
        const svc = ctx.adf;
        const days = parseInt(opts.lastDays) || 7;
        const maxResults = parseInt(opts.maxResults) || 100;

        const request = buildDebugRunRequest({
          lastDays: days,
          now: Date.now(),
          pipelineName: opts.pipelineName,
          status: opts.status,
        });

        const { runs, truncated } = await svc.queryDebugPipelineRuns(request, opts.factoryId, maxResults);
        const summary = summariseDebugRuns(runs, truncated);
        outputResult(
          {
            fileName: 'debug-pipeline-runs',
            data: { ...summary, runs },
            summary: `${summary.returned} debug runs found (last ${days} days)${truncated ? ` — truncated at ${maxResults}, more available` : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'query debug pipeline runs'); }
    });

  pipeline
    .command('activity-runs')
    .description('Get activity-level details for a pipeline run')
    .argument('<runId>', 'Pipeline run ID')
    .option('-s, --status <status>', 'Filter by activity status (Succeeded|Failed|InProgress|Cancelled|Queued)')
    .option('-a, --activity-name <name>', 'Filter by activity name')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (runId: string, opts: any) => {
      try {
        const svc = ctx.adf;
        const activities = await svc.getActivityRuns(runId, opts.factoryId, {
          status: opts.status,
          activityName: opts.activityName,
        });
        const failed = activities.filter((a: any) => a.status === 'Failed').length;
        outputResult(
          { fileName: `activity-runs-${runId}`, data: activities, summary: `${activities.length} activities (${failed} failed) for run ${runId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get activity runs'); }
    });

  pipeline
    .command('rerun')
    .description('Rerun a failed pipeline from the point of failure (requires ENABLE_WRITE=true)')
    .argument('<failedRunId>', 'Run ID of the failed pipeline')
    .option('--no-start-from-failure', 'Do not start from failed activities')
    .option('-a, --start-activity <name>', 'Specific activity to start from')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (failedRunId: string, opts: any) => {
      try {
        const svc = ctx.adf;
        const originalRun = await svc.getPipelineRun(failedRunId, opts.factoryId);
        const startFromFailure = opts.startFromFailure !== false;

        const result = await svc.runPipeline(
          originalRun.pipelineName,
          originalRun.parameters,
          opts.factoryId,
          {
            referencePipelineRunId: failedRunId,
            isRecovery: true,
            startFromFailure,
            startActivityName: opts.startActivity,
          }
        );

        const data = {
          runId: result.runId,
          message: `Pipeline '${originalRun.pipelineName}' rerun initiated in recovery mode`,
          originalRunId: failedRunId,
          startFromFailure,
          startActivityName: opts.startActivity || 'Auto-detect failed activities',
        };
        outputResult(
          { persist: false, fileName: `pipeline-rerun-${result.runId}`, data, summary: `Rerun initiated for '${originalRun.pipelineName}'. New run ID: ${result.runId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'rerun pipeline'); }
    });
}
