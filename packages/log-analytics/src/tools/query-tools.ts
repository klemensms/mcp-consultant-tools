import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  formatTableAsMarkdown,
  filterColumns,
  resolveColumnPreset,
} from '../utils/loganalytics-formatters.js';
import {
  descWithExamples,
  KQL_EXAMPLES,
  TIMESPAN_EXAMPLES,
  COLUMN_PRESET_EXAMPLES,
  TABLE_NAME_EXAMPLES,
  OUTPUT_FORMAT_EXAMPLES,
} from '../tool-examples.js';

export function registerQueryTools(server: any, ctx: ServiceContext): void {

  server.tool(
    "la-execute-query",
    "Execute a custom KQL query against Log Analytics workspace",
    {
      resourceId: z.string().describe("Resource ID"),
      query: z.string().describe(descWithExamples("KQL query string", KQL_EXAMPLES)),
      timespan: z.string().optional().describe(descWithExamples("Time range — the OUTER BOUND on the query; narrower than the KQL's own ago() clips results. Default: derived from the widest ago() in the KQL, else PT1H", TIMESPAN_EXAMPLES)),
      columnPreset: z.enum(["minimal", "investigation", "full"]).optional()
        .describe(descWithExamples("Column preset for filtering results. 'minimal' reduces token count significantly", COLUMN_PRESET_EXAMPLES)),
      columns: z.array(z.string()).optional()
        .describe("Custom columns to include (overrides columnPreset). E.g., ['TimeGenerated', 'Message']"),
      outputFormat: z.enum(["json", "markdown"]).optional()
        .describe(descWithExamples("Output format (default: json)", OUTPUT_FORMAT_EXAMPLES)),
    },
    // KQL is read-only by design.
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, query, timespan, columnPreset, columns, outputFormat }: any) => {
      try {
        const result = await ctx.logAnalytics.executeQuery(resourceId, query, timespan);
        const columnsToInclude = resolveColumnPreset(columnPreset, columns);
        const filteredTables = result.tables.map((t: any) => filterColumns(t, columnsToInclude));
        const filteredResult = { ...result, tables: filteredTables };

        if (outputFormat === 'markdown' && filteredTables.length > 0) {
          let markdown = `**Effective timespan:** ${result.effectiveTimespan}\n\n`;
          if (result.timespanWarning) {
            markdown += `⚠️ ${result.timespanWarning}\n\n`;
          }
          markdown += filteredTables.map((t: any) => formatTableAsMarkdown(t)).join('\n\n');
          return { content: [{ type: "text", text: markdown }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(filteredResult, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error executing Log Analytics query:", error);
        return {
          content: [{ type: "text", text: `Failed to execute query: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "la-get-recent-events",
    "Get recent events from a specific Log Analytics table",
    {
      resourceId: z.string().describe("Resource ID"),
      tableName: z.string().describe(descWithExamples("Table name to query", TABLE_NAME_EXAMPLES)),
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
    async ({ resourceId, tableName, timespan, limit, columnPreset, columns, outputFormat }: any) => {
      try {
        const result = await ctx.logAnalytics.getRecentEvents(
          resourceId,
          tableName,
          timespan,
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
        console.error("Error getting recent events:", error);
        return {
          content: [{ type: "text", text: `Failed to get recent events: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "la-search-logs",
    "Search logs by text content across tables or a specific table",
    {
      resourceId: z.string().describe("Resource ID"),
      searchText: z.string().describe("Text to search for (case-insensitive)"),
      tableName: z.string().optional().describe(descWithExamples("Table name to search in (optional, searches all if not specified)", TABLE_NAME_EXAMPLES)),
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
    async ({ resourceId, searchText, tableName, timespan, limit, columnPreset, columns, outputFormat }: any) => {
      try {
        const result = await ctx.logAnalytics.searchLogs(
          resourceId,
          searchText,
          tableName,
          timespan,
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
        console.error("Error searching logs:", error);
        return {
          content: [{ type: "text", text: `Failed to search logs: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
