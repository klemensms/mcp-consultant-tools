import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  formatTableAsMarkdown,
  analyzeLogs,
  analyzeFunctionLogs,
  analyzeFunctionErrors,
  analyzeFunctionStats,
  generateRecommendations,
} from '../utils/loganalytics-formatters.js';

export function registerLogAnalyticsPrompts(server: any, ctx: ServiceContext): void {

  server.prompt(
    "la-workspace-summary",
    "Generate a comprehensive health summary for a Log Analytics workspace",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const timespanValue = timespan || 'PT1H';

        const errorsResult = await ctx.logAnalytics.getFunctionErrors(resourceId, undefined, timespanValue, 50);
        const statsResult = await ctx.logAnalytics.getFunctionStats(resourceId, undefined, timespanValue);

        const errorsTable = errorsResult.tables[0] ? formatTableAsMarkdown(errorsResult.tables[0]) : '*No errors*';
        const statsTable = statsResult.tables[0] ? formatTableAsMarkdown(statsResult.tables[0]) : '*No statistics*';

        const errorsAnalysis = analyzeFunctionErrors(errorsResult.tables[0]);
        const statsAnalysis = analyzeFunctionStats(statsResult.tables[0]);

        const report = `# Log Analytics Workspace Health Summary\n\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n` +
          `**Generated**: ${new Date().toISOString()}\n\n` +
          `## Function Statistics\n\n${statsTable}\n\n` +
          `### Key Insights\n${statsAnalysis}\n\n` +
          `## Recent Errors\n\n${errorsTable}\n\n` +
          `### Error Analysis\n${errorsAnalysis}\n\n` +
          `## Recommendations\n\n` +
          generateRecommendations({
            errorCount: errorsResult.tables[0]?.rows.length || 0,
          }).join('\n');

        return {
          messages: [
            {
              role: "assistant",
              content: { type: "text", text: report },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating workspace summary:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: { type: "text", text: `Failed to generate workspace summary: ${error.message}` },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "la-fn-troubleshooting",
    "Generate a comprehensive troubleshooting guide for an Azure Function",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().describe("Function name to analyze"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, functionName, timespan }: any) => {
      try {
        const timespanValue = timespan || 'PT1H';

        const logsResult = await ctx.logAnalytics.getFunctionLogs(resourceId, functionName, timespanValue, undefined, 100);
        const errorsResult = await ctx.logAnalytics.getFunctionErrors(resourceId, functionName, timespanValue, 50);
        const statsResult = await ctx.logAnalytics.getFunctionStats(resourceId, functionName, timespanValue);
        const invocationsResult = await ctx.logAnalytics.getFunctionInvocations(resourceId, functionName, timespanValue, 50);

        const logsTable = logsResult.tables[0] ? formatTableAsMarkdown(logsResult.tables[0]) : '*No logs*';
        const errorsTable = errorsResult.tables[0] ? formatTableAsMarkdown(errorsResult.tables[0]) : '*No errors*';
        const statsTable = statsResult.tables[0] ? formatTableAsMarkdown(statsResult.tables[0]) : '*No statistics*';
        const invocationsTable = invocationsResult.tables[0] ? formatTableAsMarkdown(invocationsResult.tables[0]) : '*No invocations*';

        const logsAnalysis = analyzeFunctionLogs(logsResult.tables[0]);
        const errorsAnalysis = analyzeFunctionErrors(errorsResult.tables[0]);
        const statsAnalysis = analyzeFunctionStats(statsResult.tables[0]);

        const report = `# Azure Function Troubleshooting Guide\n\n` +
          `**Function**: ${functionName}\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n` +
          `**Generated**: ${new Date().toISOString()}\n\n` +
          `## Executive Summary\n\n${statsTable}\n\n` +
          `### Statistics Insights\n${statsAnalysis}\n\n` +
          `## Error Analysis\n\n${errorsTable}\n\n` +
          `### Error Insights\n${errorsAnalysis}\n\n` +
          `## Recent Logs\n\n${logsTable}\n\n` +
          `### Log Insights\n${logsAnalysis}\n\n` +
          `## Recent Invocations\n\n${invocationsTable}\n\n` +
          `## Recommendations\n\n` +
          generateRecommendations({
            errorCount: errorsResult.tables[0]?.rows.length || 0,
          }).join('\n');

        return {
          messages: [
            {
              role: "assistant",
              content: { type: "text", text: report },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating function troubleshooting guide:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: { type: "text", text: `Failed to generate troubleshooting guide: ${error.message}` },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "la-fn-performance",
    "Generate a performance analysis report for Azure Functions",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().optional().describe("Function name (optional, analyzes all if not specified)"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, functionName, timespan }: any) => {
      try {
        const timespanValue = timespan || 'PT1H';

        const statsResult = await ctx.logAnalytics.getFunctionStats(resourceId, functionName, timespanValue);
        const invocationsResult = await ctx.logAnalytics.getFunctionInvocations(resourceId, functionName, timespanValue, 100);

        const statsTable = statsResult.tables[0] ? formatTableAsMarkdown(statsResult.tables[0]) : '*No statistics*';
        const invocationsTable = invocationsResult.tables[0] ? formatTableAsMarkdown(invocationsResult.tables[0]) : '*No invocations*';

        const statsAnalysis = analyzeFunctionStats(statsResult.tables[0]);

        const report = `# Azure Function Performance Report\n\n` +
          `**Function**: ${functionName || 'All Functions'}\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n` +
          `**Generated**: ${new Date().toISOString()}\n\n` +
          `## Execution Statistics\n\n${statsTable}\n\n` +
          `### Performance Insights\n${statsAnalysis}\n\n` +
          `## Recent Invocations\n\n${invocationsTable}\n\n` +
          `## Recommendations\n\n` +
          `- Monitor success rates and investigate functions below 95%\n` +
          `- Review invocation patterns for optimization opportunities\n` +
          `- Consider implementing retry logic for transient failures\n`;

        return {
          messages: [
            {
              role: "assistant",
              content: { type: "text", text: report },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating performance report:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: { type: "text", text: `Failed to generate performance report: ${error.message}` },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "la-logs-report",
    "Generate a formatted logs report with insights and analysis",
    {
      resourceId: z.string().describe("Resource ID"),
      tableName: z.string().describe("Table name to query"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      limit: z.string().optional().describe("Maximum number of logs (default: 100)"),
    },
    async ({ resourceId, tableName, timespan, limit }: any) => {
      try {
        const timespanValue = timespan || 'PT1H';
        const limitValue = limit ? parseInt(limit, 10) : 100;

        const logsResult = await ctx.logAnalytics.getRecentEvents(resourceId, tableName, timespanValue, limitValue);

        const logsTable = logsResult.tables[0] ? formatTableAsMarkdown(logsResult.tables[0]) : '*No logs*';
        const analysis = analyzeLogs(logsResult.tables[0], tableName);

        const report = `# Log Analytics Report\n\n` +
          `**Table**: ${tableName}\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n` +
          `**Limit**: ${limitValue}\n` +
          `**Generated**: ${new Date().toISOString()}\n\n` +
          `## Log Entries\n\n${logsTable}\n\n` +
          `### Analysis\n${analysis}\n\n` +
          `## Recommendations\n\n` +
          `- Review log patterns for anomalies\n` +
          `- Investigate any error or warning entries\n` +
          `- Consider adjusting log retention policies\n`;

        return {
          messages: [
            {
              role: "assistant",
              content: { type: "text", text: report },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating logs report:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: { type: "text", text: `Failed to generate logs report: ${error.message}` },
            },
          ],
        };
      }
    }
  );
}
