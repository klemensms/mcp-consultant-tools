#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { LogAnalyticsService } from "./LogAnalyticsService.js";
import type { LogAnalyticsConfig } from "./LogAnalyticsService.js";
import { z } from 'zod';
import { formatTableAsMarkdown, formatTableAsCSV, analyzeLogs, analyzeFunctionLogs, analyzeFunctionErrors, analyzeFunctionStats, generateRecommendations } from './utils/loganalytics-formatters.js';

export function registerLogAnalyticsTools(server: any, loganalyticsService?: LogAnalyticsService) {
  let service: LogAnalyticsService | null = loganalyticsService || null;

  function getLogAnalyticsService(): LogAnalyticsService {
    if (!service) {
      const missingConfig: string[] = [];
      let resources: any[] = [];

      if (process.env.LOGANALYTICS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.LOGANALYTICS_RESOURCES);
        } catch (error) {
          throw new Error("Failed to parse LOGANALYTICS_RESOURCES JSON");
        }
      } else if (process.env.LOGANALYTICS_WORKSPACE_ID) {
        resources = [{
          id: 'default',
          name: 'Default Workspace',
          workspaceId: process.env.LOGANALYTICS_WORKSPACE_ID,
          active: true,
        }];
      } else {
        missingConfig.push("LOGANALYTICS_RESOURCES or LOGANALYTICS_WORKSPACE_ID");
      }

      if (missingConfig.length > 0) {
        throw new Error(`Missing Log Analytics configuration: ${missingConfig.join(", ")}`);
      }

      const config: LogAnalyticsConfig = {
        resources,
        authMethod: (process.env.LOGANALYTICS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
        tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
        clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
        clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
      };

      service = new LogAnalyticsService(config);
      console.error("Log Analytics service initialized");
    }
    return service;
  }

  // ========================================
  // PROMPTS
  // ========================================

  server.prompt(
    "loganalytics-workspace-summary",
    "Generate a comprehensive health summary for a Log Analytics workspace",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, timespan }) => {
      try {
        const service = getLogAnalyticsService();
        const timespanValue = timespan || 'PT1H';
  
        // Get recent errors from FunctionAppLogs
        const errorsResult = await service.getFunctionErrors(resourceId, undefined, timespanValue, 50);
        const statsResult = await service.getFunctionStats(resourceId, undefined, timespanValue);
  
        // Format results
        const errorsTable = errorsResult.tables[0] ? formatLATableAsMarkdown(errorsResult.tables[0]) : '*No errors*';
        const statsTable = statsResult.tables[0] ? formatLATableAsMarkdown(statsResult.tables[0]) : '*No statistics*';
  
        // Analyze
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
              content: {
                type: "text",
                text: report,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating workspace summary:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate workspace summary: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "loganalytics-function-troubleshooting",
    "Generate a comprehensive troubleshooting guide for an Azure Function",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().describe("Function name to analyze"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, functionName, timespan }) => {
      try {
        const service = getLogAnalyticsService();
        const timespanValue = timespan || 'PT1H';
  
        // Get comprehensive data
        const logsResult = await service.getFunctionLogs(resourceId, functionName, timespanValue, undefined, 100);
        const errorsResult = await service.getFunctionErrors(resourceId, functionName, timespanValue, 50);
        const statsResult = await service.getFunctionStats(resourceId, functionName, timespanValue);
        const invocationsResult = await service.getFunctionInvocations(resourceId, functionName, timespanValue, 50);
  
        // Format results
        const logsTable = logsResult.tables[0] ? formatLATableAsMarkdown(logsResult.tables[0]) : '*No logs*';
        const errorsTable = errorsResult.tables[0] ? formatLATableAsMarkdown(errorsResult.tables[0]) : '*No errors*';
        const statsTable = statsResult.tables[0] ? formatLATableAsMarkdown(statsResult.tables[0]) : '*No statistics*';
        const invocationsTable = invocationsResult.tables[0] ? formatLATableAsMarkdown(invocationsResult.tables[0]) : '*No invocations*';
  
        // Analyze
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
              content: {
                type: "text",
                text: report,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating function troubleshooting guide:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate troubleshooting guide: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "loganalytics-function-performance-report",
    "Generate a performance analysis report for Azure Functions",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().optional().describe("Function name (optional, analyzes all if not specified)"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, functionName, timespan }) => {
      try {
        const service = getLogAnalyticsService();
        const timespanValue = timespan || 'PT1H';
  
        // Get performance data
        const statsResult = await service.getFunctionStats(resourceId, functionName, timespanValue);
        const invocationsResult = await service.getFunctionInvocations(resourceId, functionName, timespanValue, 100);
  
        // Format results
        const statsTable = statsResult.tables[0] ? formatLATableAsMarkdown(statsResult.tables[0]) : '*No statistics*';
        const invocationsTable = invocationsResult.tables[0] ? formatLATableAsMarkdown(invocationsResult.tables[0]) : '*No invocations*';
  
        // Analyze
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
              content: {
                type: "text",
                text: report,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating performance report:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate performance report: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "loganalytics-logs-report",
    "Generate a formatted logs report with insights and analysis",
    {
      resourceId: z.string().describe("Resource ID"),
      tableName: z.string().describe("Table name to query"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      limit: z.string().optional().describe("Maximum number of logs (default: 100)"),
    },
    async ({ resourceId, tableName, timespan, limit }) => {
      try {
        const service = getLogAnalyticsService();
        const timespanValue = timespan || 'PT1H';
        const limitValue = limit ? parseInt(limit, 10) : 100;
  
        // Get logs
        const logsResult = await service.getRecentEvents(resourceId, tableName, timespanValue, limitValue);
  
        // Format results
        const logsTable = logsResult.tables[0] ? formatLATableAsMarkdown(logsResult.tables[0]) : '*No logs*';
  
        // Analyze
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
              content: {
                type: "text",
                text: report,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating logs report:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate logs report: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  // ========================================
  // TOOLS
  // ========================================

  server.tool(
    "loganalytics-list-workspaces",
    "List all configured Log Analytics workspaces (active and inactive)",
    {},
    async () => {
      try {
        const service = getLogAnalyticsService();
        const resources = service.getAllResources();
  
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resources, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error listing Log Analytics workspaces:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to list workspaces: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "loganalytics-get-metadata",
    "Get schema metadata (tables and columns) for a Log Analytics workspace",
    {
      resourceId: z.string().describe("Resource ID (use loganalytics-list-workspaces to find IDs)"),
    },
    async ({ resourceId }) => {
      try {
        const service = getLogAnalyticsService();
        const metadata = await service.getMetadata(resourceId);
  
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(metadata, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting Log Analytics metadata:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get metadata: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "loganalytics-execute-query",
    "Execute a custom KQL query against Log Analytics workspace",
    {
      resourceId: z.string().describe("Resource ID"),
      query: z.string().describe("KQL query string"),
      timespan: z.string().optional().describe("Time range (e.g., 'PT1H', 'P1D')"),
    },
    async ({ resourceId, query, timespan }) => {
      try {
        const service = getLogAnalyticsService();
        const result = await service.executeQuery(resourceId, query, timespan);
  
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error executing Log Analytics query:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to execute query: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "loganalytics-test-workspace-access",
    "Test access to a Log Analytics workspace by executing a simple query",
    {
      resourceId: z.string().describe("Resource ID"),
    },
    async ({ resourceId }) => {
      try {
        const service = getLogAnalyticsService();
        const result = await service.testWorkspaceAccess(resourceId);
  
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error testing workspace access:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to test workspace access: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "loganalytics-get-recent-events",
    "Get recent events from a specific Log Analytics table",
    {
      resourceId: z.string().describe("Resource ID"),
      tableName: z.string().describe("Table name (e.g., 'FunctionAppLogs', 'traces', 'requests')"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
    async ({ resourceId, tableName, timespan, limit }) => {
      try {
        const service = getLogAnalyticsService();
        const result = await service.getRecentEvents(
          resourceId,
          tableName,
          timespan || 'PT1H',
          limit || 100
        );
  
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting recent events:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get recent events: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "loganalytics-search-logs",
    "Search logs by text content across tables or a specific table",
    {
      resourceId: z.string().describe("Resource ID"),
      searchText: z.string().describe("Text to search for"),
      tableName: z.string().optional().describe("Table name to search in (optional, searches all if not specified)"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
    async ({ resourceId, searchText, tableName, timespan, limit }) => {
      try {
        const service = getLogAnalyticsService();
        const result = await service.searchLogs(
          resourceId,
          searchText,
          tableName,
          timespan || 'PT1H',
          limit || 100
        );
  
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error searching logs:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to search logs: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "loganalytics-get-function-logs",
    "Get Azure Function logs from FunctionAppLogs table with optional filtering",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().optional().describe("Function name to filter by (optional)"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      severityLevel: z.number().optional().describe("Minimum severity level (0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical)"),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
    async ({ resourceId, functionName, timespan, severityLevel, limit }) => {
      try {
        const service = getLogAnalyticsService();
        const result = await service.getFunctionLogs(
          resourceId,
          functionName,
          timespan || 'PT1H',
          severityLevel,
          limit || 100
        );
  
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting function logs:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get function logs: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "loganalytics-get-function-errors",
    "Get Azure Function error logs with exception details",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().optional().describe("Function name to filter by (optional)"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
    async ({ resourceId, functionName, timespan, limit }) => {
      try {
        const service = getLogAnalyticsService();
        const result = await service.getFunctionErrors(
          resourceId,
          functionName,
          timespan || 'PT1H',
          limit || 100
        );
  
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting function errors:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get function errors: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "loganalytics-get-function-stats",
    "Get execution statistics for Azure Functions (count, success rate, errors)",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().optional().describe("Function name (optional, returns stats for all functions if not specified)"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, functionName, timespan }) => {
      try {
        const service = getLogAnalyticsService();
        const result = await service.getFunctionStats(
          resourceId,
          functionName,
          timespan || 'PT1H'
        );
  
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting function stats:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get function stats: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "loganalytics-get-function-invocations",
    "Get Azure Function invocation history from requests/traces tables",
    {
      resourceId: z.string().describe("Resource ID"),
      functionName: z.string().optional().describe("Function name to filter by (optional)"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
    async ({ resourceId, functionName, timespan, limit }) => {
      try {
        const service = getLogAnalyticsService();
        const result = await service.getFunctionInvocations(
          resourceId,
          functionName,
          timespan || 'PT1H',
          limit || 100
        );
  
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting function invocations:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get function invocations: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  console.error("log-analytics tools registered: 10 tools, 4 prompts");

  console.error("Log Analytics tools registered: 10 tools, 4 prompts");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "mcp-log-analytics",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerLogAnalyticsTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Log Analytics MCP server:", error);
    process.exit(1);
  });
  console.error("Log Analytics MCP server running");
}
