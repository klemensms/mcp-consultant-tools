/**
 * Query CLI Commands - 6 commands for KQL queries, log search, and investigation
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';
import {
  formatTableAsMarkdown,
  formatInvestigateAppMarkdown,
  filterColumns,
  resolveColumnPreset,
} from '../../utils/loganalytics-formatters.js';

export function registerQueryCommands(program: Command, ctx: ServiceContext): void {
  const query = program.command('query').description('KQL query and log search operations');

  query
    .command('execute')
    .description('Execute a custom KQL query against Log Analytics workspace')
    .argument('<resourceId>', 'Resource ID')
    .argument('<kql>', 'KQL query string')
    .option('-t, --timespan <timespan>', 'Time range (e.g., PT1H, P1D) — outer bound on the query; narrower than the KQL\'s ago() clips results. Default: derived from the widest ago() in the KQL, else PT1H')
    .option('-p, --preset <preset>', 'Column preset: minimal, investigation, full')
    .option('-c, --columns <columns>', 'Custom columns (comma-separated)')
    .option('-f, --format <format>', 'Output format: json, markdown', 'json')
    .action(async (resourceId: string, kql: string, opts: any) => {
      try {
        const result = await ctx.logAnalytics.executeQuery(resourceId, kql, opts.timespan);

        // Apply column filtering
        const columns = opts.columns ? opts.columns.split(',').map((c: string) => c.trim()) : undefined;
        const columnsToInclude = resolveColumnPreset(opts.preset, columns);
        const filteredTables = result.tables.map((t: any) => filterColumns(t, columnsToInclude));
        const filteredResult = { ...result, tables: filteredTables };

        // Format output
        let data: any = filteredResult;
        if (opts.format === 'markdown' && filteredTables.length > 0) {
          let markdown = `**Effective timespan:** ${result.effectiveTimespan}\n\n`;
          if (result.timespanWarning) {
            markdown += `⚠️ ${result.timespanWarning}\n\n`;
          }
          data = markdown + filteredTables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n');
        }

        const rowCount = filteredTables.reduce((acc: number, t: any) => acc + (t.rows?.length || 0), 0);
        let summary = `Query returned ${rowCount} row(s) [timespan: ${result.effectiveTimespan}]`;
        if (result.timespanWarning) {
          summary += `\n⚠️ ${result.timespanWarning}`;
        }
        outputResult(
          { fileName: `query-${resourceId}`, data, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'execute query'); }
    });

  query
    .command('recent')
    .description('Get recent events from a specific Log Analytics table')
    .argument('<resourceId>', 'Resource ID')
    .argument('<tableName>', 'Table name (e.g., AppTraces, AppExceptions, FunctionAppLogs)')
    .option('-t, --timespan <timespan>', 'Time range (e.g., PT1H, P1D)', 'PT1H')
    .option('-l, --limit <n>', 'Maximum results', '100')
    .option('-p, --preset <preset>', 'Column preset: minimal, investigation, full')
    .option('-c, --columns <columns>', 'Custom columns (comma-separated)')
    .option('-f, --format <format>', 'Output format: json, markdown', 'json')
    .action(async (resourceId: string, tableName: string, opts: any) => {
      try {
        const result = await ctx.logAnalytics.getRecentEvents(
          resourceId, tableName, opts.timespan, parseInt(opts.limit)
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
        outputResult(
          { fileName: `recent-${resourceId}-${tableName}`, data, summary: `Found ${rowCount} recent event(s) in ${tableName}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get recent events'); }
    });

  query
    .command('search')
    .description('Search logs by text content across tables or a specific table')
    .argument('<resourceId>', 'Resource ID')
    .argument('<searchText>', 'Text to search for (case-insensitive)')
    .option('--table <tableName>', 'Table name to search in (searches all if not specified)')
    .option('-t, --timespan <timespan>', 'Time range (e.g., PT1H, P1D)', 'PT1H')
    .option('-l, --limit <n>', 'Maximum results', '100')
    .option('-p, --preset <preset>', 'Column preset: minimal, investigation, full')
    .option('-c, --columns <columns>', 'Custom columns (comma-separated)')
    .option('-f, --format <format>', 'Output format: json, markdown', 'json')
    .action(async (resourceId: string, searchText: string, opts: any) => {
      try {
        const result = await ctx.logAnalytics.searchLogs(
          resourceId, searchText, opts.table, opts.timespan, parseInt(opts.limit)
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
        outputResult(
          { fileName: `search-${resourceId}-${searchText.replace(/\s+/g, '-')}`, data, summary: `Found ${rowCount} result(s) matching '${searchText}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'search logs'); }
    });

  query
    .command('error-summary')
    .description('Get aggregated error summary by type - ideal for starting investigations')
    .argument('<resourceId>', 'Resource ID')
    .option('-t, --timespan <timespan>', 'Time range (e.g., PT1H, P1D)', 'PT1H')
    .option('--table <tableName>', 'Table to analyze: AppExceptions, AppTraces, FunctionAppLogs', 'AppExceptions')
    .option('--min-count <n>', 'Minimum error count to include', '1')
    .option('--no-deduplicate', 'Disable retry deduplication (grouped by OperationId by default)')
    .option('-f, --format <format>', 'Output format: json, markdown', 'markdown')
    .action(async (resourceId: string, opts: any) => {
      try {
        const table = opts.table || 'AppExceptions';
        const timespanValue = opts.timespan || 'PT1H';
        const minCountValue = parseInt(opts.minCount) || 1;
        const dedupe = opts.deduplicate !== false;

        let kql: string;
        if (table === 'AppExceptions') {
          if (dedupe) {
            kql = `
              AppExceptions
              | summarize
                  RetryCount = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(OuterMessage)
                by OperationId, ExceptionType, AppRoleName
              | summarize
                  UniqueErrors = count(),
                  TotalRetries = sum(RetryCount),
                  FirstSeen = min(FirstSeen),
                  LastSeen = max(LastSeen),
                  SampleMessage = take_any(SampleMessage)
                by ExceptionType, AppRoleName
              | where UniqueErrors >= ${minCountValue}
              | order by UniqueErrors desc
            `;
          } else {
            kql = `
              AppExceptions
              | summarize
                  Count = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(OuterMessage)
                by ExceptionType, AppRoleName
              | where Count >= ${minCountValue}
              | order by Count desc
            `;
          }
        } else if (table === 'AppTraces') {
          if (dedupe) {
            kql = `
              AppTraces
              | where SeverityLevel >= 3
              | summarize
                  RetryCount = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(Message)
                by OperationId, AppRoleName, SeverityLevel
              | summarize
                  UniqueErrors = count(),
                  TotalRetries = sum(RetryCount),
                  FirstSeen = min(FirstSeen),
                  LastSeen = max(LastSeen),
                  SampleMessage = take_any(SampleMessage)
                by AppRoleName, SeverityLevel
              | where UniqueErrors >= ${minCountValue}
              | order by UniqueErrors desc
            `;
          } else {
            kql = `
              AppTraces
              | where SeverityLevel >= 3
              | summarize
                  Count = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(Message)
                by AppRoleName, SeverityLevel
              | where Count >= ${minCountValue}
              | order by Count desc
            `;
          }
        } else {
          if (dedupe) {
            kql = `
              FunctionAppLogs
              | where ExceptionDetails != ''
              | summarize
                  RetryCount = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(Message)
                by InvocationId, FunctionName
              | summarize
                  UniqueErrors = count(),
                  TotalRetries = sum(RetryCount),
                  FirstSeen = min(FirstSeen),
                  LastSeen = max(LastSeen),
                  SampleMessage = take_any(SampleMessage)
                by FunctionName
              | where UniqueErrors >= ${minCountValue}
              | order by UniqueErrors desc
            `;
          } else {
            kql = `
              FunctionAppLogs
              | where ExceptionDetails != ''
              | summarize
                  Count = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(Message)
                by FunctionName
              | where Count >= ${minCountValue}
              | order by Count desc
            `;
          }
        }

        const result = await ctx.logAnalytics.executeQuery(resourceId, kql, timespanValue);

        const format = opts.format || 'markdown';
        let data: any = result;
        if (format === 'markdown' && result.tables && result.tables.length > 0) {
          const dedupeNote = dedupe ? ' (deduplicated by OperationId)' : '';
          data = `## Error Summary (${table})${dedupeNote}\n\n**Time range:** ${timespanValue}\n\n` +
            result.tables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n');
        }

        const rowCount = result.tables?.reduce((acc: number, t: any) => acc + (t.rows?.length || 0), 0) || 0;
        outputResult(
          { fileName: `error-summary-${resourceId}`, data, summary: `Error summary: ${rowCount} error type(s) found in ${table}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get error summary'); }
    });

  query
    .command('investigate-app')
    .description('Combined investigation: exceptions + traces + recent errors (deduplicated)')
    .argument('<resourceId>', 'Resource ID')
    .option('--app-name <pattern>', 'Filter by app name (searches AppRoleName, partial match)')
    .option('-t, --timespan <timespan>', 'Time range (e.g., PT1H, P1D)', 'PT1H')
    .option('--no-details', 'Exclude recent error details')
    .option('--details-limit <n>', 'Max recent errors to include', '20')
    .option('--no-deduplicate', 'Disable retry deduplication (grouped by OperationId by default)')
    .option('-f, --format <format>', 'Output format: json, markdown', 'markdown')
    .action(async (resourceId: string, opts: any) => {
      try {
        const timespanValue = opts.timespan || 'PT1H';
        const showDetails = opts.details !== false;
        const limit = parseInt(opts.detailsLimit) || 20;
        const dedupe = opts.deduplicate !== false;
        const appNamePattern = opts.appName;

        const result = await ctx.logAnalytics.investigateApp(
          resourceId, appNamePattern, timespanValue, showDetails, limit, dedupe
        );

        const format = opts.format || 'markdown';
        const data: any = format === 'markdown' ? formatInvestigateAppMarkdown(result) : result;

        outputResult(
          { fileName: `investigate-app-${resourceId}`, data, summary: `App investigation report for '${appNamePattern || 'all apps'}' (${timespanValue})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'investigate app'); }
    });

  query
    .command('investigate-sync')
    .description('Investigate sync-function-app failures. Auto-derives sync app from workspace ID.')
    .argument('<resourceId>', 'Resource ID (e.g., log-dev-acme-uks-01)')
    .option('-t, --timespan <timespan>', 'Time range (default: PT8H - typical work day)', 'PT8H')
    .option('--no-details', 'Exclude recent error details')
    .option('--details-limit <n>', 'Max recent errors to include', '10')
    .action(async (resourceId: string, opts: any) => {
      try {
        const timespanValue = opts.timespan || 'PT8H';
        const showDetails = opts.details !== false;
        const limit = parseInt(opts.detailsLimit) || 10;

        const match = resourceId.match(/^log-([^-]+)-([^-]+)/);
        if (!match) {
          console.error(`Could not parse environment/client from resourceId '${resourceId}'. Expected format: log-{environment}-{client}-...`);
          process.exit(1);
        }

        const environment = match[1];
        const client = match[2];
        const syncAppPattern = `func-${environment}-${client}-sc-sync`;

        const errorsByFunctionQuery = `
          AppExceptions
          | where AppRoleName contains "${syncAppPattern}"
          | extend FunctionName = tostring(Properties.AzureFunctions_FunctionName)
          | summarize
              RetryCount = count(),
              FirstSeen = min(TimeGenerated),
              LastSeen = max(TimeGenerated),
              SampleMessage = take_any(OuterMessage)
            by OperationId, FunctionName, ExceptionType
          | summarize
              UniqueErrors = count(),
              TotalRetries = sum(RetryCount),
              FirstSeen = min(FirstSeen),
              LastSeen = max(LastSeen),
              SampleMessage = take_any(SampleMessage)
            by FunctionName, ExceptionType
          | order by UniqueErrors desc
        `;

        const errorCategoryQuery = `
          AppExceptions
          | where AppRoleName contains "${syncAppPattern}"
          | extend ErrorCategory = case(
              ExceptionType contains "FaultException" or ExceptionType contains "OrganizationService", "Dataverse",
              ExceptionType contains "ServiceBus", "ServiceBus",
              ExceptionType contains "Sql", "Database",
              ExceptionType contains "Timeout", "Timeout",
              ExceptionType contains "Socket" or ExceptionType contains "Http", "Network",
              "Other"
            )
          | summarize
              RetryCount = count(),
              UniqueOps = dcount(OperationId)
            by ErrorCategory
          | order by UniqueOps desc
        `;

        const recentErrorsQuery = showDetails ? `
          AppExceptions
          | where AppRoleName contains "${syncAppPattern}"
          | extend FunctionName = tostring(Properties.AzureFunctions_FunctionName)
          | summarize
              TimeGenerated = max(TimeGenerated),
              RetryCount = count(),
              OuterMessage = take_any(OuterMessage)
            by OperationId, FunctionName, ExceptionType
          | project TimeGenerated, FunctionName, ExceptionType, OuterMessage, RetryCount
          | order by TimeGenerated desc
          | take ${limit}
        ` : null;

        const errorTracesQuery = `
          AppTraces
          | where AppRoleName contains "${syncAppPattern}"
          | where SeverityLevel >= 3
          | summarize
              RetryCount = count()
            by OperationId, Message
          | summarize
              UniqueErrors = count(),
              TotalCount = sum(RetryCount)
            by Message
          | order by UniqueErrors desc
          | take 10
        `;

        const [errorsByFunction, errorCategory, recentErrors, errorTraces] = await Promise.all([
          ctx.logAnalytics.executeQuery(resourceId, errorsByFunctionQuery, timespanValue),
          ctx.logAnalytics.executeQuery(resourceId, errorCategoryQuery, timespanValue),
          recentErrorsQuery ? ctx.logAnalytics.executeQuery(resourceId, recentErrorsQuery, timespanValue) : null,
          ctx.logAnalytics.executeQuery(resourceId, errorTracesQuery, timespanValue),
        ]);

        let markdown = `# Sync Investigation\n\n`;
        markdown += `**Environment:** ${environment}\n`;
        markdown += `**Client:** ${client}\n`;
        markdown += `**Sync App:** ${syncAppPattern}-*\n`;
        markdown += `**Time range:** ${timespanValue}\n`;
        markdown += `**Deduplication:** enabled (grouped by OperationId)\n\n`;

        markdown += `## Error Categories\n\n`;
        if (errorCategory.tables?.[0]?.rows?.length > 0) {
          markdown += formatTableAsMarkdown(errorCategory.tables[0]);
        } else {
          markdown += '*No errors found*';
        }
        markdown += '\n\n';

        markdown += `## Errors by Sync Operation\n\n`;
        if (errorsByFunction.tables?.[0]?.rows?.length > 0) {
          markdown += formatTableAsMarkdown(errorsByFunction.tables[0]);
        } else {
          markdown += '*No errors found*';
        }
        markdown += '\n\n';

        markdown += `## Error Traces (Severity 3+)\n\n`;
        if (errorTraces.tables?.[0]?.rows?.length > 0) {
          markdown += formatTableAsMarkdown(errorTraces.tables[0]);
        } else {
          markdown += '*No error traces found*';
        }
        markdown += '\n\n';

        if (showDetails && recentErrors) {
          markdown += `## Recent Errors (${limit} max)\n\n`;
          if (recentErrors.tables?.[0]?.rows?.length > 0) {
            markdown += formatTableAsMarkdown(recentErrors.tables[0]);
          } else {
            markdown += '*No recent errors*';
          }
        }

        outputResult(
          { fileName: `investigate-sync-${resourceId}`, data: markdown, summary: `function-app sync investigation for ${syncAppPattern}-* (${timespanValue})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'investigate sync'); }
    });
}
