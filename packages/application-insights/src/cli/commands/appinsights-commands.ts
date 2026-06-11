/**
 * Application Insights CLI Commands - 10 commands mapping to MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerAppInsightsCommands(program: Command, ctx: ServiceContext): void {
  // ai-list-resources → list-resources
  program
    .command('list-resources')
    .description('List all configured Application Insights resources (active and inactive)')
    .action(async () => {
      try {
        const resources = ctx.appInsights.getAllResources();
        outputResult(
          { fileName: 'appinsights-resources', data: resources, summary: `Found ${resources.length} resource(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list resources'); }
    });

  // ai-get-metadata → get-metadata
  program
    .command('get-metadata')
    .description('Get schema metadata (tables and columns) for an Application Insights resource')
    .argument('<resourceId>', 'Resource ID (use list-resources to find IDs)')
    .action(async (resourceId: string) => {
      try {
        const metadata = await ctx.appInsights.getMetadata(resourceId);
        outputResult(
          { fileName: `metadata-${resourceId}`, data: metadata, summary: `Metadata for resource '${resourceId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get metadata'); }
    });

  // ai-execute-query → query
  program
    .command('query')
    .description('Execute a KQL (Kusto Query Language) query against Application Insights')
    .argument('<resourceId>', 'Resource ID')
    .argument('<query>', 'KQL query string')
    .option('-t, --timespan <timespan>', 'Time range (e.g., PT1H, P1D, PT12H)')
    .action(async (resourceId: string, query: string, opts: any) => {
      try {
        const result = await ctx.appInsights.executeQuery(resourceId, query, opts.timespan);
        const rowCount = result.tables?.[0]?.rows?.length ?? 0;
        outputResult(
          { fileName: `query-${resourceId}`, data: result, summary: `Query returned ${rowCount} row(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'execute query'); }
    });

  // ai-get-exceptions → exceptions
  program
    .command('exceptions')
    .description('Get recent exceptions from Application Insights')
    .argument('<resourceId>', 'Resource ID')
    .option('-t, --timespan <timespan>', 'Time range (default: PT1H)', 'PT1H')
    .option('-l, --limit <n>', 'Maximum number of results (default: 50)', '50')
    .action(async (resourceId: string, opts: any) => {
      try {
        const result = await ctx.appInsights.getRecentExceptions(
          resourceId,
          opts.timespan,
          parseInt(opts.limit)
        );
        const rowCount = result.tables?.[0]?.rows?.length ?? 0;
        outputResult(
          { fileName: `exceptions-${resourceId}`, data: result, summary: `Found ${rowCount} exception(s) in ${opts.timespan}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get exceptions'); }
    });

  // ai-get-slow-requests → slow-requests
  program
    .command('slow-requests')
    .description('Get slow HTTP requests (above duration threshold)')
    .argument('<resourceId>', 'Resource ID')
    .option('-d, --duration <ms>', 'Duration threshold in milliseconds (default: 5000)', '5000')
    .option('-t, --timespan <timespan>', 'Time range (default: PT1H)', 'PT1H')
    .option('-l, --limit <n>', 'Maximum number of results (default: 50)', '50')
    .action(async (resourceId: string, opts: any) => {
      try {
        const result = await ctx.appInsights.getSlowRequests(
          resourceId,
          parseInt(opts.duration),
          opts.timespan,
          parseInt(opts.limit)
        );
        const rowCount = result.tables?.[0]?.rows?.length ?? 0;
        outputResult(
          { fileName: `slow-requests-${resourceId}`, data: result, summary: `Found ${rowCount} slow request(s) (>${opts.duration}ms) in ${opts.timespan}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get slow requests'); }
    });

  // ai-get-op-perf → op-perf
  program
    .command('op-perf')
    .description('Get performance summary by operation (request count, avg duration, percentiles)')
    .argument('<resourceId>', 'Resource ID')
    .option('-t, --timespan <timespan>', 'Time range (default: PT1H)', 'PT1H')
    .action(async (resourceId: string, opts: any) => {
      try {
        const result = await ctx.appInsights.getOperationPerformance(
          resourceId,
          opts.timespan
        );
        const rowCount = result.tables?.[0]?.rows?.length ?? 0;
        outputResult(
          { fileName: `op-perf-${resourceId}`, data: result, summary: `Performance summary for ${rowCount} operation(s) in ${opts.timespan}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get operation performance'); }
    });

  // ai-get-failed-deps → failed-deps
  program
    .command('failed-deps')
    .description('Get failed dependency calls (external APIs, databases, etc.)')
    .argument('<resourceId>', 'Resource ID')
    .option('-t, --timespan <timespan>', 'Time range (default: PT1H)', 'PT1H')
    .option('-l, --limit <n>', 'Maximum number of results (default: 50)', '50')
    .action(async (resourceId: string, opts: any) => {
      try {
        const result = await ctx.appInsights.getFailedDependencies(
          resourceId,
          opts.timespan,
          parseInt(opts.limit)
        );
        const rowCount = result.tables?.[0]?.rows?.length ?? 0;
        outputResult(
          { fileName: `failed-deps-${resourceId}`, data: result, summary: `Found ${rowCount} failed dependency call(s) in ${opts.timespan}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get failed dependencies'); }
    });

  // ai-get-traces → traces
  program
    .command('traces')
    .description('Get diagnostic traces/logs filtered by severity level')
    .argument('<resourceId>', 'Resource ID')
    .option('-s, --severity <level>', 'Minimum severity (0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical)', '2')
    .option('-t, --timespan <timespan>', 'Time range (default: PT1H)', 'PT1H')
    .option('-l, --limit <n>', 'Maximum number of results (default: 100)', '100')
    .action(async (resourceId: string, opts: any) => {
      try {
        const severityNames = ['Verbose', 'Info', 'Warning', 'Error', 'Critical'];
        const severityLevel = parseInt(opts.severity);
        const result = await ctx.appInsights.getTracesBySeverity(
          resourceId,
          severityLevel,
          opts.timespan,
          parseInt(opts.limit)
        );
        const rowCount = result.tables?.[0]?.rows?.length ?? 0;
        outputResult(
          { fileName: `traces-${resourceId}`, data: result, summary: `Found ${rowCount} trace(s) (>=${severityNames[severityLevel] || severityLevel}) in ${opts.timespan}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get traces'); }
    });

  // ai-get-availability → availability
  program
    .command('availability')
    .description('Get availability test results and uptime statistics')
    .argument('<resourceId>', 'Resource ID')
    .option('-t, --timespan <timespan>', 'Time range (default: PT24H)', 'PT24H')
    .action(async (resourceId: string, opts: any) => {
      try {
        const result = await ctx.appInsights.getAvailabilityResults(
          resourceId,
          opts.timespan
        );
        const rowCount = result.tables?.[0]?.rows?.length ?? 0;
        outputResult(
          { fileName: `availability-${resourceId}`, data: result, summary: `Availability results for ${rowCount} test(s) in ${opts.timespan}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get availability'); }
    });

  // ai-get-custom-events → custom-events
  program
    .command('custom-events')
    .description('Get custom application events')
    .argument('<resourceId>', 'Resource ID')
    .option('-n, --event-name <name>', 'Filter by specific event name')
    .option('-t, --timespan <timespan>', 'Time range (default: PT1H)', 'PT1H')
    .option('-l, --limit <n>', 'Maximum number of results (default: 100)', '100')
    .action(async (resourceId: string, opts: any) => {
      try {
        const result = await ctx.appInsights.getCustomEvents(
          resourceId,
          opts.eventName,
          opts.timespan,
          parseInt(opts.limit)
        );
        const rowCount = result.tables?.[0]?.rows?.length ?? 0;
        const filterDesc = opts.eventName ? ` for '${opts.eventName}'` : '';
        outputResult(
          { fileName: `custom-events-${resourceId}`, data: result, summary: `Found ${rowCount} custom event(s)${filterDesc} in ${opts.timespan}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get custom events'); }
    });
}
