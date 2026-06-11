/**
 * Function CLI Commands - 4 commands for Azure Functions monitoring
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';
import {
  formatTableAsMarkdown,
  filterColumns,
  resolveColumnPreset,
} from '../../utils/loganalytics-formatters.js';

export function registerFunctionCommands(program: Command, ctx: ServiceContext): void {
  const fn = program.command('fn').description('Azure Functions monitoring operations');

  fn
    .command('logs')
    .description('Get Azure Function logs from FunctionAppLogs table')
    .argument('<resourceId>', 'Resource ID')
    .option('-n, --function-name <name>', 'Function name to filter by')
    .option('-t, --timespan <timespan>', 'Time range (e.g., PT1H, P1D)', 'PT1H')
    .option('-s, --severity <level>', 'Minimum severity level (0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical)')
    .option('-l, --limit <n>', 'Maximum results', '100')
    .option('-p, --preset <preset>', 'Column preset: minimal, investigation, full')
    .option('-c, --columns <columns>', 'Custom columns (comma-separated)')
    .option('-f, --format <format>', 'Output format: json, markdown', 'json')
    .action(async (resourceId: string, opts: any) => {
      try {
        const severity = opts.severity !== undefined ? parseInt(opts.severity) : undefined;
        const result = await ctx.logAnalytics.getFunctionLogs(
          resourceId, opts.functionName, opts.timespan, severity, parseInt(opts.limit)
        );

        const columns = opts.columns ? opts.columns.split(',').map((c: string) => c.trim()) : undefined;
        const columnsToInclude = resolveColumnPreset(opts.preset, columns);
        const filteredTables = result.tables.map((t: any) => filterColumns(t, columnsToInclude));
        const filteredResult = { ...result, tables: filteredTables };

        let data: any = filteredResult;
        if (opts.format === 'markdown' && filteredTables.length > 0) {
          data = filteredTables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n');
        }

        const rowCount = filteredTables.reduce((acc: number, t: any) => acc + (t.rows?.length || 0), 0);
        const fnLabel = opts.functionName ? ` for '${opts.functionName}'` : '';
        outputResult(
          { fileName: `fn-logs-${resourceId}`, data, summary: `Found ${rowCount} function log(s)${fnLabel}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get function logs'); }
    });

  fn
    .command('errors')
    .description('Get Azure Function error logs with exception details')
    .argument('<resourceId>', 'Resource ID')
    .option('-n, --function-name <name>', 'Function name to filter by')
    .option('-t, --timespan <timespan>', 'Time range (e.g., PT1H, P1D)', 'PT1H')
    .option('-l, --limit <n>', 'Maximum results', '100')
    .option('-p, --preset <preset>', 'Column preset: minimal, investigation, full')
    .option('-c, --columns <columns>', 'Custom columns (comma-separated)')
    .option('-f, --format <format>', 'Output format: json, markdown', 'json')
    .action(async (resourceId: string, opts: any) => {
      try {
        const result = await ctx.logAnalytics.getFunctionErrors(
          resourceId, opts.functionName, opts.timespan, parseInt(opts.limit)
        );

        const columns = opts.columns ? opts.columns.split(',').map((c: string) => c.trim()) : undefined;
        const columnsToInclude = resolveColumnPreset(opts.preset, columns);
        const filteredTables = result.tables.map((t: any) => filterColumns(t, columnsToInclude));
        const filteredResult = { ...result, tables: filteredTables };

        let data: any = filteredResult;
        if (opts.format === 'markdown' && filteredTables.length > 0) {
          data = filteredTables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n');
        }

        const rowCount = filteredTables.reduce((acc: number, t: any) => acc + (t.rows?.length || 0), 0);
        const fnLabel = opts.functionName ? ` for '${opts.functionName}'` : '';
        outputResult(
          { fileName: `fn-errors-${resourceId}`, data, summary: `Found ${rowCount} function error(s)${fnLabel}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get function errors'); }
    });

  fn
    .command('stats')
    .description('Get execution statistics for Azure Functions (count, success rate)')
    .argument('<resourceId>', 'Resource ID')
    .option('-n, --function-name <name>', 'Function name (stats for all if not specified)')
    .option('-t, --timespan <timespan>', 'Time range (e.g., PT1H, P1D)', 'PT1H')
    .option('-f, --format <format>', 'Output format: json, markdown', 'json')
    .action(async (resourceId: string, opts: any) => {
      try {
        const result = await ctx.logAnalytics.getFunctionStats(
          resourceId, opts.functionName, opts.timespan
        );

        let data: any = result;
        if (opts.format === 'markdown' && result.tables && result.tables.length > 0) {
          data = result.tables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n');
        }

        const fnLabel = opts.functionName ? ` for '${opts.functionName}'` : ' for all functions';
        outputResult(
          { fileName: `fn-stats-${resourceId}`, data, summary: `Function statistics${fnLabel}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get function stats'); }
    });

  fn
    .command('invocations')
    .description('Get Azure Function invocation history from requests/traces tables')
    .argument('<resourceId>', 'Resource ID')
    .option('-n, --function-name <name>', 'Function name to filter by')
    .option('-t, --timespan <timespan>', 'Time range (e.g., PT1H, P1D)', 'PT1H')
    .option('-l, --limit <n>', 'Maximum results', '100')
    .option('-p, --preset <preset>', 'Column preset: minimal, investigation, full')
    .option('-c, --columns <columns>', 'Custom columns (comma-separated)')
    .option('-f, --format <format>', 'Output format: json, markdown', 'json')
    .action(async (resourceId: string, opts: any) => {
      try {
        const result = await ctx.logAnalytics.getFunctionInvocations(
          resourceId, opts.functionName, opts.timespan, parseInt(opts.limit)
        );

        const columns = opts.columns ? opts.columns.split(',').map((c: string) => c.trim()) : undefined;
        const columnsToInclude = resolveColumnPreset(opts.preset, columns);
        const filteredTables = result.tables.map((t: any) => filterColumns(t, columnsToInclude));
        const filteredResult = { ...result, tables: filteredTables };

        let data: any = filteredResult;
        if (opts.format === 'markdown' && filteredTables.length > 0) {
          data = filteredTables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n');
        }

        const rowCount = filteredTables.reduce((acc: number, t: any) => acc + (t.rows?.length || 0), 0);
        const fnLabel = opts.functionName ? ` for '${opts.functionName}'` : '';
        outputResult(
          { fileName: `fn-invocations-${resourceId}`, data, summary: `Found ${rowCount} invocation(s)${fnLabel}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get function invocations'); }
    });
}
