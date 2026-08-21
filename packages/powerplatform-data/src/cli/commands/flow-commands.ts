/**
 * Flow CLI Commands - 2 commands mapping to flow MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerFlowCommands(program: Command, ctx: ServiceContext): void {
  const flow = program.command('flow').description('Power Automate flow operations');

  flow
    .command('runs')
    .description('Get run history for a flow')
    .argument('<flowId>', 'Flow GUID (workflowid)')
    .option('-s, --status <status>', 'Filter by status: Succeeded, Failed, Running, Waiting, Cancelled')
    .option('--started-after <date>', 'Only runs started after this date (ISO 8601)')
    .option('--started-before <date>', 'Only runs started before this date (ISO 8601)')
    .option('-m, --max-records <n>', 'Maximum runs to return', '50')
    .action(async (flowId: string, opts: any) => {
      try {
        const result = await ctx.pp.getFlowRuns(flowId, {
          status: opts.status,
          startedAfter: opts.startedAfter,
          startedBefore: opts.startedBefore,
          maxRecords: parseInt(opts.maxRecords, 10),
        });

        const stats = ((result as any).runs || []).reduce((acc: any, run: any) => {
          if (run.status === 'Succeeded') acc.succeeded++;
          else if (run.status === 'Failed' || run.status === 'Faulted' || run.status === 'TimedOut') acc.failed++;
          else if (run.status === 'Running' || run.status === 'Waiting') acc.inProgress++;
          else if (run.status === 'Cancelled') acc.cancelled++;
          else acc.other++;
          return acc;
        }, { succeeded: 0, failed: 0, inProgress: 0, cancelled: 0, other: 0 });

        outputResult(
          {
            fileName: `flow-runs-${flowId}`,
            data: result,
            summary: `Flow ${flowId}: ${(result as any).totalCount} runs (OK: ${stats.succeeded}, Failed: ${stats.failed}, Running: ${stats.inProgress})${(result as any).hasMore ? ` [TRUNCATED at ${(result as any).totalCount} runs of an unknown total; this command caps at 250. Narrow the window with --started-after/--started-before]` : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get flow runs');
      }
    });

  flow
    .command('run-details')
    .description('Get detailed info about a specific flow run')
    .argument('<flowId>', 'Flow GUID (workflowid)')
    .argument('<runId>', 'Flow run GUID')
    .action(async (flowId: string, runId: string) => {
      try {
        const result = await ctx.pp.getFlowRunDetails(flowId, runId) as any;
        const summary = result.actionsSummary || {};
        outputResult(
          {
            fileName: `flow-run-${flowId}-${runId}`,
            data: result,
            summary: `Flow run ${runId}: ${result.status} (${summary.total || 0} actions, ${summary.failed || 0} failed)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get flow run details');
      }
    });
}
