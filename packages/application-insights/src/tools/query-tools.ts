import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, KQL_QUERY_EXAMPLES, TIMESPAN_EXAMPLES, RESOURCE_ID_EXAMPLES } from '../tool-examples.js';

export function registerQueryTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "ai-list-resources",
    "List all configured Application Insights resources with their IDs, names, and active status",
    {},
    // Reads locally-configured resources only (no remote call) → local-only read.
    { readOnlyHint: true },
    async () => {
      try {
        const resources = ctx.appInsights.getAllResources();

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
    "ai-get-metadata",
    "Get schema metadata (available tables and their columns) for an Application Insights resource",
    {
      resourceId: z.string().describe(
        descWithExamples("Resource ID (use ai-list-resources to find IDs)", RESOURCE_ID_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId }: any) => {
      try {
        const metadata = await ctx.appInsights.getMetadata(resourceId);

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
    "ai-execute-query",
    "Execute a KQL (Kusto Query Language) query against Application Insights",
    {
      resourceId: z.string().describe(
        descWithExamples("Resource ID", RESOURCE_ID_EXAMPLES)
      ),
      query: z.string().describe(
        descWithExamples("KQL query string", KQL_QUERY_EXAMPLES)
      ),
      timespan: z.string().optional().describe(
        descWithExamples("Time range in ISO 8601 duration format (default: none, queries all data)", TIMESPAN_EXAMPLES)
      ),
    },
    // KQL against App Insights is a read-only query language (no mutation/DDL).
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, query, timespan }: any) => {
      try {
        const result = await ctx.appInsights.executeQuery(resourceId, query, timespan);

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
}
