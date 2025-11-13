#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { ApplicationInsightsService } from "./ApplicationInsightsService.js";
import type { ApplicationInsightsConfig } from "./ApplicationInsightsService.js";
import { z } from 'zod';
import { formatTableAsMarkdown, analyzeExceptions, analyzePerformance, analyzeDependencies } from './utils/appinsights-formatters.js';

export function registerApplicationInsightsTools(server: any, applicationinsightsService?: ApplicationInsightsService) {
  let service: ApplicationInsightsService | null = applicationinsightsService || null;

  function getApplicationInsightsService(): ApplicationInsightsService {
    if (!service) {
      const missingConfig: string[] = [];
      let resources: any[] = [];

      if (process.env.APPINSIGHTS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.APPINSIGHTS_RESOURCES);
        } catch (error) {
          throw new Error("Failed to parse APPINSIGHTS_RESOURCES JSON");
        }
      } else if (process.env.APPINSIGHTS_APP_ID) {
        resources = [{
          id: 'default',
          name: 'Default Application Insights',
          appId: process.env.APPINSIGHTS_APP_ID,
          active: true,
        }];
      } else {
        missingConfig.push("APPINSIGHTS_RESOURCES or APPINSIGHTS_APP_ID");
      }

      if (missingConfig.length > 0) {
        throw new Error(`Missing Application Insights configuration: ${missingConfig.join(", ")}`);
      }

      const config: ApplicationInsightsConfig = {
        resources,
        authMethod: (process.env.APPINSIGHTS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
        tenantId: process.env.APPINSIGHTS_TENANT_ID || '',
        clientId: process.env.APPINSIGHTS_CLIENT_ID || '',
        clientSecret: process.env.APPINSIGHTS_CLIENT_SECRET || '',
      };

      service = new ApplicationInsightsService(config);
      console.error("Application Insights service initialized");
    }
    return service;
  }

  // ========================================
  // PROMPTS
  // ========================================

  server.prompt(
    "appinsights-exception-summary",
    "Generate a comprehensive exception summary report from Application Insights",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const service = getApplicationInsightsService();
        const timespanValue = timespan || 'PT1H';
  
        // Get recent exceptions
        const exceptionsResult = await service.getRecentExceptions(resourceId, timespanValue, 50);
  
        // Get exception type frequency
        const exceptionTypesResult = await service.executeQuery(
          resourceId,
          `
            exceptions
            | where timestamp > ago(${timespanValue.replace(/^P(T)?/, '')})
            | summarize Count=count() by type
            | order by Count desc
          `.trim(),
          timespanValue
        );
  
        // Format results
        const exceptionsList = formatTableAsMarkdown(exceptionsResult.tables[0]);
        const exceptionTypes = formatTableAsMarkdown(exceptionTypesResult.tables[0]);
        const insights = analyzeExceptions(exceptionsResult.tables[0]);
  
        const report = `# Application Insights Exception Summary Report\n\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n\n` +
          `## Key Insights\n\n${insights}\n\n` +
          `## Recent Exceptions\n\n${exceptionsList}\n\n` +
          `## Exception Types (Frequency)\n\n${exceptionTypes}\n\n` +
          `## Recommendations\n\n` +
          `- Review the most frequent exception types to identify systemic issues\n` +
          `- Investigate exceptions in critical operations first\n` +
          `- Check for patterns in timestamps (e.g., deployment times, peak traffic)\n` +
          `- Use operation_Id to correlate exceptions with requests and dependencies`;
  
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
        console.error("Error generating exception summary:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate exception summary: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "appinsights-performance-report",
    "Generate a comprehensive performance analysis report from Application Insights",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const service = getApplicationInsightsService();
        const timespanValue = timespan || 'PT1H';
  
        // Get operation performance
        const performanceResult = await service.getOperationPerformance(resourceId, timespanValue);
  
        // Get slow requests
        const slowRequestsResult = await service.getSlowRequests(resourceId, 5000, timespanValue, 20);
  
        // Format results
        const performanceTable = formatTableAsMarkdown(performanceResult.tables[0]);
        const slowRequestsTable = formatTableAsMarkdown(slowRequestsResult.tables[0]);
        const insights = analyzePerformance(performanceResult.tables[0]);
  
        const report = `# Application Insights Performance Report\n\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n\n` +
          `## Key Insights\n\n${insights}\n\n` +
          `## Operation Performance Summary\n\n${performanceTable}\n\n` +
          `## Slowest Requests (>5s)\n\n${slowRequestsTable}\n\n` +
          `## Performance Recommendations\n\n` +
          `- Focus optimization efforts on operations with high P95/P99 duration\n` +
          `- Investigate operations with high failure counts\n` +
          `- Monitor operations with high request counts for scalability issues\n` +
          `- Use operation_Id to trace slow requests through dependencies`;
  
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
    "appinsights-dependency-health",
    "Generate a dependency health report showing external service issues",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const service = getApplicationInsightsService();
        const timespanValue = timespan || 'PT1H';
  
        // Get failed dependencies
        const failedDepsResult = await service.getFailedDependencies(resourceId, timespanValue, 50);
  
        // Get dependency success rates
        const successRatesResult = await service.executeQuery(
          resourceId,
          `
            dependencies
            | where timestamp > ago(${timespanValue.replace(/^P(T)?/, '')})
            | summarize Total=count(), Failed=countif(success == false), AvgDuration=avg(duration) by target, type
            | extend SuccessRate=round(100.0 * (Total - Failed) / Total, 2)
            | order by SuccessRate asc
          `.trim(),
          timespanValue
        );
  
        // Format results
        const failedDepsTable = formatTableAsMarkdown(failedDepsResult.tables[0]);
        const successRatesTable = formatTableAsMarkdown(successRatesResult.tables[0]);
        const insights = analyzeDependencies(failedDepsResult.tables[0]);
  
        const report = `# Application Insights Dependency Health Report\n\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n\n` +
          `## Key Insights\n\n${insights}\n\n` +
          `## Failed Dependencies\n\n${failedDepsTable}\n\n` +
          `## Dependency Success Rates\n\n${successRatesTable}\n\n` +
          `## Recommendations\n\n` +
          `- Investigate dependencies with success rates below 99%\n` +
          `- Check if external service degradation matches known incidents\n` +
          `- Review timeout configurations for slow dependencies\n` +
          `- Consider implementing circuit breakers for unreliable dependencies`;
  
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
        console.error("Error generating dependency health report:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate dependency health report: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "appinsights-availability-report",
    "Generate an availability and uptime report from Application Insights",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT24H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const service = getApplicationInsightsService();
        const timespanValue = timespan || 'PT24H';
  
        // Get availability results
        const availabilityResult = await service.getAvailabilityResults(resourceId, timespanValue);
  
        // Format results
        const availabilityTable = formatTableAsMarkdown(availabilityResult.tables[0]);
  
        const report = `# Application Insights Availability Report\n\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n\n` +
          `## Availability Test Results\n\n${availabilityTable}\n\n` +
          `## Recommendations\n\n` +
          `- Investigate any tests with success rates below 99.9%\n` +
          `- Review failed tests for patterns (geographic, time-based)\n` +
          `- Consider adding availability tests for critical endpoints if missing\n` +
          `- Set up alerts for availability degradation`;
  
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
        console.error("Error generating availability report:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate availability report: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "appinsights-troubleshooting-guide",
    "Generate a comprehensive troubleshooting guide combining exceptions, performance, and dependencies",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const service = getApplicationInsightsService();
        const timespanValue = timespan || 'PT1H';
  
        // Get data from multiple sources
        const exceptionsResult = await service.getRecentExceptions(resourceId, timespanValue, 20);
        const slowRequestsResult = await service.getSlowRequests(resourceId, 5000, timespanValue, 20);
        const failedDepsResult = await service.getFailedDependencies(resourceId, timespanValue, 20);
        const tracesResult = await service.getTracesBySeverity(resourceId, 3, timespanValue, 30); // Error level
  
        // Format results
        const exceptionsTable = formatTableAsMarkdown(exceptionsResult.tables[0]);
        const slowRequestsTable = formatTableAsMarkdown(slowRequestsResult.tables[0]);
        const failedDepsTable = formatTableAsMarkdown(failedDepsResult.tables[0]);
        const tracesTable = formatTableAsMarkdown(tracesResult.tables[0]);
  
        const report = `# Application Insights Troubleshooting Guide\n\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n` +
          `**Generated**: ${new Date().toISOString()}\n\n` +
          `## 1. Recent Errors and Exceptions\n\n${exceptionsTable}\n\n` +
          `## 2. Performance Issues\n\n${slowRequestsTable}\n\n` +
          `## 3. Dependency Failures\n\n${failedDepsTable}\n\n` +
          `## 4. Diagnostic Logs (Errors)\n\n${tracesTable}\n\n` +
          `## 5. Investigation Steps\n\n` +
          `1. **Identify the pattern**: Check if errors are isolated or widespread\n` +
          `2. **Correlate events**: Use operation_Id to trace requests across services\n` +
          `3. **Check timeline**: Look for correlation with deployments or external events\n` +
          `4. **Review dependencies**: Verify external service health\n` +
          `5. **Analyze traces**: Review detailed logs for error context\n\n` +
          `## 6. Common Patterns and Root Causes\n\n` +
          `- **High exception rate + dependency failures**: External service degradation\n` +
          `- **Slow requests + high dependency duration**: Network or external API latency\n` +
          `- **Exceptions in specific operations**: Code defect or invalid input\n` +
          `- **Timeouts**: Insufficient resources or inefficient queries`;
  
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
        console.error("Error generating troubleshooting guide:", error);
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

  // ========================================
  // TOOLS
  // ========================================

  server.tool(
    "appinsights-list-resources",
    "List all configured Application Insights resources (active and inactive)",
    {},
    async () => {
      try {
        const service = getApplicationInsightsService();
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
        console.error("Error listing Application Insights resources:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to list Application Insights resources: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "appinsights-get-metadata",
    "Get schema metadata (tables and columns) for an Application Insights resource",
    {
      resourceId: z.string().describe("Resource ID (use appinsights-list-resources to find IDs)"),
    },
    async ({ resourceId }: any) => {
      try {
        const service = getApplicationInsightsService();
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
        console.error("Error getting Application Insights metadata:", error);
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
    "appinsights-execute-query",
    "Execute a KQL (Kusto Query Language) query against Application Insights",
    {
      resourceId: z.string().describe("Resource ID"),
      query: z.string().describe("KQL query string"),
      timespan: z.string().optional().describe("Time range (e.g., 'PT1H' for 1 hour, 'P1D' for 1 day, 'PT12H' for 12 hours)"),
    },
    async ({ resourceId, query, timespan }: any) => {
      try {
        const service = getApplicationInsightsService();
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
        console.error("Error executing Application Insights query:", error);
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
    "appinsights-get-exceptions",
    "Get recent exceptions from Application Insights with timestamps, types, and messages",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      limit: z.number().optional().describe("Maximum number of results (default: 50)"),
    },
    async ({ resourceId, timespan, limit }: any) => {
      try {
        const service = getApplicationInsightsService();
        const result = await service.getRecentExceptions(
          resourceId,
          timespan || 'PT1H',
          limit || 50
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
        console.error("Error getting Application Insights exceptions:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get exceptions: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "appinsights-get-slow-requests",
    "Get slow HTTP requests (above duration threshold) from Application Insights",
    {
      resourceId: z.string().describe("Resource ID"),
      durationThresholdMs: z.number().optional().describe("Duration threshold in milliseconds (default: 5000)"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      limit: z.number().optional().describe("Maximum number of results (default: 50)"),
    },
    async ({ resourceId, durationThresholdMs, timespan, limit }: any) => {
      try {
        const service = getApplicationInsightsService();
        const result = await service.getSlowRequests(
          resourceId,
          durationThresholdMs || 5000,
          timespan || 'PT1H',
          limit || 50
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
        console.error("Error getting slow requests:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get slow requests: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "appinsights-get-operation-performance",
    "Get performance summary by operation (request count, avg duration, percentiles)",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const service = getApplicationInsightsService();
        const result = await service.getOperationPerformance(
          resourceId,
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
        console.error("Error getting operation performance:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get operation performance: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "appinsights-get-failed-dependencies",
    "Get failed dependency calls (external APIs, databases, etc.) from Application Insights",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      limit: z.number().optional().describe("Maximum number of results (default: 50)"),
    },
    async ({ resourceId, timespan, limit }: any) => {
      try {
        const service = getApplicationInsightsService();
        const result = await service.getFailedDependencies(
          resourceId,
          timespan || 'PT1H',
          limit || 50
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
        console.error("Error getting failed dependencies:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get failed dependencies: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "appinsights-get-traces",
    "Get diagnostic traces/logs from Application Insights filtered by severity level",
    {
      resourceId: z.string().describe("Resource ID"),
      severityLevel: z.number().optional().describe("Minimum severity level (0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical) (default: 2)"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
    async ({ resourceId, severityLevel, timespan, limit }: any) => {
      try {
        const service = getApplicationInsightsService();
        const result = await service.getTracesBySeverity(
          resourceId,
          severityLevel ?? 2,
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
        console.error("Error getting traces:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get traces: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "appinsights-get-availability",
    "Get availability test results and uptime statistics from Application Insights",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT24H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const service = getApplicationInsightsService();
        const result = await service.getAvailabilityResults(
          resourceId,
          timespan || 'PT24H'
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
        console.error("Error getting availability results:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get availability results: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "appinsights-get-custom-events",
    "Get custom application events from Application Insights",
    {
      resourceId: z.string().describe("Resource ID"),
      eventName: z.string().optional().describe("Filter by specific event name"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
    async ({ resourceId, eventName, timespan, limit }: any) => {
      try {
        const service = getApplicationInsightsService();
        const result = await service.getCustomEvents(
          resourceId,
          eventName,
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
        console.error("Error getting custom events:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get custom events: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  console.error("application-insights tools registered: 10 tools, 5 prompts");

  console.error("Application Insights tools registered: 10 tools, 5 prompts");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "mcp-application-insights",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerApplicationInsightsTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Application Insights MCP server:", error);
    process.exit(1);
  });
  console.error("Application Insights MCP server running");
}
