import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  formatTableAsMarkdown,
  formatInvestigateAppMarkdown,
  filterColumns,
  resolveColumnPreset,
} from '../utils/loganalytics-formatters.js';
import { buildErrorSummaryQuery } from '../utils/error-summary-query.js';
import {
  descWithExamples,
  TIMESPAN_EXAMPLES,
  COLUMN_PRESET_EXAMPLES,
  APP_NAME_EXAMPLES,
  OUTPUT_FORMAT_EXAMPLES,
  SEVERITY_EXAMPLES,
} from '../tool-examples.js';

export function registerFunctionTools(server: any, ctx: ServiceContext): void {

  server.tool(
    "la-get-fn-logs",
    "Get Azure Function logs from FunctionAppLogs table with optional filtering",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().optional().describe(descWithExamples("Function name to filter by (optional)", APP_NAME_EXAMPLES)),
      timespan: z.string().optional().describe(descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)),
      severityLevel: z.number().optional().describe(descWithExamples("Minimum severity level", SEVERITY_EXAMPLES)),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
      columnPreset: z.enum(["minimal", "investigation", "full"]).optional()
        .describe(descWithExamples("Column preset for filtering results", COLUMN_PRESET_EXAMPLES)),
      columns: z.array(z.string()).optional()
        .describe("Custom columns to include (overrides columnPreset)"),
      outputFormat: z.enum(["json", "markdown"]).optional()
        .describe(descWithExamples("Output format (default: json)", OUTPUT_FORMAT_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, functionName, timespan, severityLevel, limit, columnPreset, columns, outputFormat }: any) => {
      try {
        const result = await ctx.logAnalytics.getFunctionLogs(
          resourceId,
          functionName,
          timespan || 'PT1H',
          severityLevel,
          limit || 100
        );
        const columnsToInclude = resolveColumnPreset(columnPreset, columns);
        const filteredTables = result.tables.map((t: any) => filterColumns(t, columnsToInclude));
        const filteredResult = { ...result, tables: filteredTables };

        if (outputFormat === 'markdown' && filteredTables.length > 0) {
          const markdown = filteredTables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n');
          return { content: [{ type: "text", text: markdown }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(filteredResult, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting function logs:", error);
        return {
          content: [{ type: "text", text: `Failed to get function logs: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "la-get-fn-errors",
    "Get Azure Function error logs with exception details",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().optional().describe(descWithExamples("Function name to filter by (optional)", APP_NAME_EXAMPLES)),
      timespan: z.string().optional().describe(descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
      columnPreset: z.enum(["minimal", "investigation", "full"]).optional()
        .describe(descWithExamples("Column preset for filtering results", COLUMN_PRESET_EXAMPLES)),
      columns: z.array(z.string()).optional()
        .describe("Custom columns to include (overrides columnPreset)"),
      outputFormat: z.enum(["json", "markdown"]).optional()
        .describe(descWithExamples("Output format (default: json)", OUTPUT_FORMAT_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, functionName, timespan, limit, columnPreset, columns, outputFormat }: any) => {
      try {
        const result = await ctx.logAnalytics.getFunctionErrors(
          resourceId,
          functionName,
          timespan || 'PT1H',
          limit || 100
        );
        const columnsToInclude = resolveColumnPreset(columnPreset, columns);
        const filteredTables = result.tables.map((t: any) => filterColumns(t, columnsToInclude));
        const filteredResult = { ...result, tables: filteredTables };

        if (outputFormat === 'markdown' && filteredTables.length > 0) {
          const markdown = filteredTables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n');
          return { content: [{ type: "text", text: markdown }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(filteredResult, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting function errors:", error);
        return {
          content: [{ type: "text", text: `Failed to get function errors: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "la-get-fn-stats",
    "Get execution statistics for Azure Functions (count, success rate, errors). Returns aggregated data - no column filtering needed. One row per function, not per FunctionName: the bare name, the Functions.-prefixed variant and blank host rows are collapsed after the query, and `normalization` says what was collapsed or dropped.",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().optional().describe(descWithExamples("Function name (optional, returns stats for all functions if not specified)", APP_NAME_EXAMPLES)),
      timespan: z.string().optional().describe(descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)),
      outputFormat: z.enum(["json", "markdown"]).optional()
        .describe(descWithExamples("Output format (default: json)", OUTPUT_FORMAT_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, functionName, timespan, outputFormat }: any) => {
      try {
        const result = await ctx.logAnalytics.getFunctionStats(
          resourceId,
          functionName,
          timespan || 'PT1H'
        );

        if (outputFormat === 'markdown' && result.tables && result.tables.length > 0) {
          // Keep the normalisation note: markdown drops everything but the tables, and a
          // collapsed table with no note is indistinguishable from the raw one.
          const note = result.normalization?.note;
          const markdown =
            result.tables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n') +
            (note ? `\n\n> ${note}` : '');
          return { content: [{ type: "text", text: markdown }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting function stats:", error);
        return {
          content: [{ type: "text", text: `Failed to get function stats: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "la-get-fn-invocations",
    "Get Azure Function invocation history from requests/traces tables",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().optional().describe(descWithExamples("Function name to filter by (optional)", APP_NAME_EXAMPLES)),
      timespan: z.string().optional().describe(descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
      columnPreset: z.enum(["minimal", "investigation", "full"]).optional()
        .describe(descWithExamples("Column preset for filtering results", COLUMN_PRESET_EXAMPLES)),
      columns: z.array(z.string()).optional()
        .describe("Custom columns to include (overrides columnPreset)"),
      outputFormat: z.enum(["json", "markdown"]).optional()
        .describe(descWithExamples("Output format (default: json)", OUTPUT_FORMAT_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, functionName, timespan, limit, columnPreset, columns, outputFormat }: any) => {
      try {
        const result = await ctx.logAnalytics.getFunctionInvocations(
          resourceId,
          functionName,
          timespan || 'PT1H',
          limit || 100
        );
        const columnsToInclude = resolveColumnPreset(columnPreset, columns);
        const filteredTables = result.tables.map((t: any) => filterColumns(t, columnsToInclude));
        const filteredResult = { ...result, tables: filteredTables };

        if (outputFormat === 'markdown' && filteredTables.length > 0) {
          const markdown = filteredTables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n');
          return { content: [{ type: "text", text: markdown }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(filteredResult, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting function invocations:", error);
        return {
          content: [{ type: "text", text: `Failed to get function invocations: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "la-get-error-summary",
    "Get aggregated error summary by type - ideal for starting investigations. Returns counts, first/last seen, and sample messages.",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe(descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)),
      tableName: z.enum(["AppExceptions", "AppTraces", "FunctionAppLogs"]).optional()
        .describe("Table to analyze (default: AppExceptions)"),
      minCount: z.number().optional().describe("Minimum error count to include (default: 1)"),
      deduplicateRetries: z.boolean().optional()
        .describe("Collapse repeats of the same error before counting (default: true) - by OperationId, or by FunctionInvocationId on FunctionAppLogs, which has no OperationId. Shows UniqueErrors count and total RetryCount."),
      outputFormat: z.enum(["json", "markdown"]).optional()
        .describe(descWithExamples("Output format (default: markdown for readability)", OUTPUT_FORMAT_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, timespan, tableName, minCount, deduplicateRetries, outputFormat }: any) => {
      try {
        const table = tableName || 'AppExceptions';
        const timespanValue = timespan || 'PT1H';
        const minCountValue = minCount || 1;
        const dedupe = deduplicateRetries !== false;

        const { kql: query, dedupeKey } = buildErrorSummaryQuery({
          table,
          dedupe,
          minCount: minCountValue,
        });
        const result = await ctx.logAnalytics.executeQuery(resourceId, query, timespanValue);

        const format = outputFormat || 'markdown';
        if (format === 'markdown' && result.tables && result.tables.length > 0) {
          const dedupeNote = dedupeKey ? ` (deduplicated by ${dedupeKey})` : '';
          const markdown = `## Error Summary (${table})${dedupeNote}\n\n**Time range:** ${timespanValue}\n\n` +
            result.tables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n');
          return { content: [{ type: "text", text: markdown }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting error summary:", error);
        return {
          content: [{ type: "text", text: `Failed to get error summary: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "la-investigate-app",
    "Combined investigation tool: searches AppTraces + AppExceptions, returns summary + recent error details. Best starting point for app investigations.",
    {
      resourceId: z.string().describe("Resource ID"),
      appNamePattern: z.string().optional().describe(descWithExamples("Filter by app name (searches AppRoleName). Partial match supported.", APP_NAME_EXAMPLES)),
      timespan: z.string().optional().describe(descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)),
      includeDetails: z.boolean().optional().describe("Include recent error details (default: true)"),
      detailsLimit: z.number().optional().describe("Max recent errors to include (default: 20)"),
      deduplicateRetries: z.boolean().optional()
        .describe("Group by OperationId to deduplicate retry attempts (default: true)"),
      outputFormat: z.enum(["json", "markdown"]).optional()
        .describe(descWithExamples("Output format (default: markdown for readability; json returns the structured exceptionSummary / traceSeverity / recentErrors query results)", OUTPUT_FORMAT_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, appNamePattern, timespan, includeDetails, detailsLimit, deduplicateRetries, outputFormat }: any) => {
      try {
        const timespanValue = timespan || 'PT1H';
        const showDetails = includeDetails !== false;
        const limit = detailsLimit || 20;
        const dedupe = deduplicateRetries !== false;

        const result = await ctx.logAnalytics.investigateApp(
          resourceId, appNamePattern, timespanValue, showDetails, limit, dedupe
        );

        if ((outputFormat || 'markdown') === 'json') {
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        return { content: [{ type: "text", text: formatInvestigateAppMarkdown(result) }] };
      } catch (error: any) {
        console.error("Error investigating app:", error);
        return {
          content: [{ type: "text", text: `Failed to investigate app: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "la-investigate-sync",
    "Investigate sync-function-app failures. Only useful for clients using a sync function app. Auto-derives sync app name from workspace ID (log-{env}-{client}-... → func-{env}-{client}-sc-sync-...). Best tool for sync-function-app debugging.",
    {
      resourceId: z.string().describe("Resource ID (e.g., 'log-dev-acme-uks-01'). Environment and client are auto-extracted."),
      timespan: z.string().optional().describe(descWithExamples("Time range (default: PT8H - typical work day)", TIMESPAN_EXAMPLES)),
      includeDetails: z.boolean().optional().describe("Include recent error details (default: true)"),
      detailsLimit: z.number().optional().describe("Max recent errors to include (default: 10)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, timespan, includeDetails, detailsLimit }: any) => {
      try {
        const timespanValue = timespan || 'PT8H';
        const showDetails = includeDetails !== false;
        const limit = detailsLimit || 10;

        const match = resourceId.match(/^log-([^-]+)-([^-]+)/);
        if (!match) {
          return {
            content: [{
              type: "text",
              text: `Could not parse environment/client from resourceId '${resourceId}'. Expected format: log-{environment}-{client}-...`,
            }],
            isError: true,
          };
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
          markdown += '*No errors found* ✅';
        }
        markdown += '\n\n';

        markdown += `## Errors by Sync Operation\n\n`;
        if (errorsByFunction.tables?.[0]?.rows?.length > 0) {
          markdown += formatTableAsMarkdown(errorsByFunction.tables[0]);
        } else {
          markdown += '*No errors found* ✅';
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

        return { content: [{ type: "text", text: markdown }] };
      } catch (error: any) {
        console.error("Error investigating sync:", error);
        return {
          content: [{ type: "text", text: `Failed to investigate sync: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
