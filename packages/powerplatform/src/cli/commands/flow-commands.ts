/**
 * Flow CLI Commands - 11 commands for flow/workflow/business rule inspection
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError, truncationSuffix } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerFlowCommands(program: Command, ctx: ServiceContext): void {
  const flow = program.command('flow').description('Power Automate flow and workflow operations');

  flow
    .command('list')
    .description('List Power Automate cloud flows')
    .option('--active-only', 'Only return activated flows', false)
    .option('-m, --max <n>', 'Maximum number of flows to return (0 = all, the default)', '0')
    .option('--include-customer-insights', 'Include Customer Insights flows (CXP_ prefix)', false)
    .option('--include-system', 'Include SYSTEM-modified flows', false)
    .option('--include-copilot-sales', 'Include Copilot for Sales flows', false)
    .option('-n, --name <text>', 'Filter flows by name (case-insensitive contains)')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getFlows({
          activeOnly: opts.activeOnly,
          maxRecords: parseInt(opts.max),
          excludeCustomerInsights: !opts.includeCustomerInsights,
          excludeSystem: !opts.includeSystem,
          excludeCopilotSales: !opts.includeCopilotSales,
          nameContains: opts.name,
        });
        outputResult(
          { fileName: 'flows', data: result, summary: `Found ${result.totalCount} Power Automate flows${truncationSuffix(result.truncation)}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list flows'); }
    });

  flow
    .command('search')
    .description('Search workflows (classic workflows and Power Automate flows)')
    .option('-n, --name <text>', 'Filter by workflow name (partial match)')
    .option('-e, --entity <name>', 'Filter by primary entity logical name')
    .option('-d, --description <text>', 'Search in description field')
    .option('-c, --category <n>', 'Filter by category (0=Workflow, 5=ModernFlow)')
    .option('-s, --state <n>', 'Filter by state (0=Draft, 1=Activated)')
    .option('--no-description', 'Exclude description from results')
    .option('-m, --max <n>', 'Maximum results', '50')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.searchWorkflows({
          name: opts.name,
          primaryEntity: opts.entity,
          description: opts.description,
          category: opts.category !== undefined ? parseInt(opts.category) : undefined,
          statecode: opts.state !== undefined ? parseInt(opts.state) : undefined,
          includeDescription: opts.description !== false,
          maxResults: parseInt(opts.max),
        });
        outputResult(
          { fileName: 'workflow-search', data: result, summary: `Found ${result.totalCount} workflow(s)${result.hasMore ? ' (more available)' : ''}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'search workflows'); }
    });

  flow
    .command('definition')
    .description('Get the definition of a Power Automate flow')
    .argument('<flowId>', 'Flow GUID (workflowid)')
    .option('--summary', 'Return parsed summary instead of full definition', false)
    .action(async (flowId: string, opts: any) => {
      try {
        const result = await ctx.pp.getFlowDefinition(flowId, opts.summary);
        const name = (result as any)?.name || flowId;
        outputResult(
          { fileName: `flow-def-${flowId}`, data: result, summary: `Flow definition for '${name}'${opts.summary ? ' (summary)' : ''}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get flow definition'); }
    });

  flow
    .command('runs')
    .description('Get run history for a Power Automate flow')
    .argument('<flowId>', 'Flow GUID (workflowid)')
    .option('-s, --status <status>', 'Filter by run status (Succeeded, Failed, Running, Cancelled)')
    .option('--started-after <date>', 'Only runs started after this date (ISO 8601)')
    .option('--started-before <date>', 'Only runs started before this date (ISO 8601)')
    .option('-m, --max <n>', 'Maximum number of runs to return', '50')
    .action(async (flowId: string, opts: any) => {
      try {
        const result = await ctx.pp.getFlowRuns(flowId, {
          status: opts.status,
          startedAfter: opts.startedAfter,
          startedBefore: opts.startedBefore,
          maxRecords: parseInt(opts.max),
        });
        outputResult(
          { fileName: `flow-runs-${flowId}`, data: result, summary: `Found ${result.totalCount} flow runs for ${flowId}${result.hasMore ? ' (more available)' : ''}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get flow runs'); }
    });

  flow
    .command('run-details')
    .description('Get detailed action-level execution info for a flow run')
    .argument('<flowId>', 'Flow GUID (workflowid)')
    .argument('<runId>', 'Flow run GUID (from flow runs)')
    .action(async (flowId: string, runId: string) => {
      try {
        const result = await ctx.pp.getFlowRunDetails(flowId, runId);
        const status = (result as any)?.status || 'unknown';
        outputResult(
          { fileName: `flow-run-${flowId}-${runId}`, data: result, summary: `Flow run details: status=${status}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get flow run details'); }
    });

  flow
    .command('health')
    .description('Scan cloud flows for run-health metrics (success rate, failures) over N days')
    .option('-d, --days <n>', 'Days of run history to analyse', '7')
    .option('--max-runs <n>', 'Max runs sampled per flow, newest first', '100')
    .option('--max-flows <n>', 'Max flows to scan', '500')
    .option('--all-flows', 'Scan draft flows too (default: activated only)', false)
    .option('--concurrency <n>', 'Concurrent per-flow run fetches', '5')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.scanFlowHealth({
          daysBack: parseInt(opts.days),
          maxRunsPerFlow: parseInt(opts.maxRuns),
          maxFlows: parseInt(opts.maxFlows),
          activeOnly: !opts.allFlows,
          concurrency: parseInt(opts.concurrency),
        });
        const s = result.summary;
        outputResult(
          {
            fileName: 'flow-health-scan',
            data: result,
            summary: `Flow health (last ${result.daysAnalyzed}d): scanned ${s.totalFlowsScanned}, healthy ${s.flowsHealthy}, failing ${s.flowsWithFailures}, no runs ${s.flowsNoRuns}, errored ${s.flowsErrored}; overall success ${s.overallSuccessRate ?? 'n/a'}%`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'scan flow health'); }
    });

  flow
    .command('inventory')
    .description('Complete inventory of cloud flows (deployment metadata, no run history)')
    .option('-m, --max <n>', 'Maximum flows to return', '500')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getFlowInventory({ maxRecords: parseInt(opts.max) });
        outputResult(
          { fileName: 'flow-inventory', data: result, summary: `Flow inventory: ${result.totalCount} cloud flow(s)${result.hasMore ? ' (more available)' : ''}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get flow inventory'); }
    });

  flow
    .command('workflows')
    .description('List classic Dynamics workflows')
    .option('--active-only', 'Only return activated workflows', false)
    .option('-m, --max <n>', 'Maximum number of workflows to return', '25')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getWorkflows(opts.activeOnly, parseInt(opts.max));
        outputResult(
          { fileName: 'classic-workflows', data: result, summary: `Found ${result.totalCount} classic Dynamics workflows${result.hasMore ? ' (more available)' : ''}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list workflows'); }
    });

  flow
    .command('workflow-def')
    .description('Get the definition of a classic Dynamics workflow')
    .argument('<workflowId>', 'Workflow GUID (workflowid)')
    .option('--summary', 'Return parsed summary instead of full XAML', false)
    .action(async (workflowId: string, opts: any) => {
      try {
        const result = await ctx.pp.getWorkflowDefinition(workflowId, opts.summary);
        const name = (result as any)?.name || workflowId;
        outputResult(
          { fileName: `workflow-def-${workflowId}`, data: result, summary: `Workflow definition for '${name}'${opts.summary ? ' (summary)' : ''}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get workflow definition'); }
    });

  flow
    .command('business-rules')
    .description('List all business rules in the environment')
    .option('--active-only', 'Only return activated business rules', false)
    .option('-m, --max <n>', 'Maximum number of business rules to return', '100')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getBusinessRules(opts.activeOnly, parseInt(opts.max));
        outputResult(
          { fileName: 'business-rules', data: result, summary: `Found ${result.totalCount} business rules` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list business rules'); }
    });

  flow
    .command('business-rule')
    .description('Get the definition of a specific business rule')
    .argument('<workflowId>', 'Business rule GUID (workflowid)')
    .action(async (workflowId: string) => {
      try {
        const result = await ctx.pp.getBusinessRule(workflowId);
        const name = (result as any)?.name || workflowId;
        outputResult(
          { fileName: `business-rule-${workflowId}`, data: result, summary: `Business rule '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get business rule'); }
    });
}
