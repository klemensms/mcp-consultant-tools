import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, TIMESPAN_EXAMPLES, RESOURCE_ID_EXAMPLES } from '../tool-examples.js';

export function registerTelemetryTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "ai-get-exceptions",
    "Get recent exceptions from Application Insights with timestamps, types, and messages",
    {
      resourceId: z.string().describe(
        descWithExamples("Resource ID", RESOURCE_ID_EXAMPLES)
      ),
      timespan: z.string().optional().describe(
        descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)
      ),
      limit: z.number().optional().describe("Maximum number of results (default: 50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, timespan, limit }: any) => {
      try {
        const result = await ctx.appInsights.getRecentExceptions(
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
    "ai-get-slow-requests",
    "Get slow HTTP requests (above duration threshold) from Application Insights",
    {
      resourceId: z.string().describe(
        descWithExamples("Resource ID", RESOURCE_ID_EXAMPLES)
      ),
      durationThresholdMs: z.number().optional().describe("Duration threshold in milliseconds (default: 5000)"),
      timespan: z.string().optional().describe(
        descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)
      ),
      limit: z.number().optional().describe("Maximum number of results (default: 50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, durationThresholdMs, timespan, limit }: any) => {
      try {
        const result = await ctx.appInsights.getSlowRequests(
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
    "ai-get-op-perf",
    "Get performance summary by operation (request count, avg duration, percentiles)",
    {
      resourceId: z.string().describe(
        descWithExamples("Resource ID", RESOURCE_ID_EXAMPLES)
      ),
      timespan: z.string().optional().describe(
        descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, timespan }: any) => {
      try {
        const result = await ctx.appInsights.getOperationPerformance(
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
    "ai-get-failed-deps",
    "Get failed dependency calls (external APIs, databases, etc.) from Application Insights",
    {
      resourceId: z.string().describe(
        descWithExamples("Resource ID", RESOURCE_ID_EXAMPLES)
      ),
      timespan: z.string().optional().describe(
        descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)
      ),
      limit: z.number().optional().describe("Maximum number of results (default: 50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, timespan, limit }: any) => {
      try {
        const result = await ctx.appInsights.getFailedDependencies(
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
    "ai-get-traces",
    "Get diagnostic traces/logs from Application Insights filtered by severity level",
    {
      resourceId: z.string().describe(
        descWithExamples("Resource ID", RESOURCE_ID_EXAMPLES)
      ),
      severityLevel: z.number().optional().describe("Minimum severity level (0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical) (default: 2)"),
      timespan: z.string().optional().describe(
        descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)
      ),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, severityLevel, timespan, limit }: any) => {
      try {
        const result = await ctx.appInsights.getTracesBySeverity(
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
    "ai-get-availability",
    "Get availability test results and uptime statistics from Application Insights",
    {
      resourceId: z.string().describe(
        descWithExamples("Resource ID", RESOURCE_ID_EXAMPLES)
      ),
      timespan: z.string().optional().describe(
        descWithExamples("Time range (default: PT24H)", TIMESPAN_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, timespan }: any) => {
      try {
        const result = await ctx.appInsights.getAvailabilityResults(
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
    "ai-get-custom-events",
    "Get custom application events from Application Insights",
    {
      resourceId: z.string().describe(
        descWithExamples("Resource ID", RESOURCE_ID_EXAMPLES)
      ),
      eventName: z.string().optional().describe("Filter by specific event name"),
      timespan: z.string().optional().describe(
        descWithExamples("Time range (default: PT1H)", TIMESPAN_EXAMPLES)
      ),
      limit: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, eventName, timespan, limit }: any) => {
      try {
        const result = await ctx.appInsights.getCustomEvents(
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
}
