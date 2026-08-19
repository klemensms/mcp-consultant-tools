import { z } from 'zod';
import type { ServiceContext } from '../types.js';

export function registerWorkspaceTools(server: any, ctx: ServiceContext): void {

  server.tool(
    "la-list-workspaces",
    "List all configured Log Analytics workspaces (active and inactive)",
    {},
    // Reads local in-memory config only (no Azure call).
    { readOnlyHint: true },
    async () => {
      try {
        const resources = ctx.logAnalytics.getAllResources();
        return {
          content: [{ type: "text", text: JSON.stringify(resources, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error listing Log Analytics workspaces:", error);
        return {
          content: [{ type: "text", text: `Failed to list workspaces: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "la-get-metadata",
    "Get the SCHEMA CATALOGUE (tables and columns) for a Log Analytics workspace - every table the workspace could hold, which is near-identical across workspaces and says nothing about what any of them has ingested. For what a workspace actually holds, use la-list-workspace-tables.",
    {
      resourceId: z.string().describe("Resource ID (use la-list-workspaces to find IDs)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId }: any) => {
      try {
        const metadata = await ctx.logAnalytics.getMetadata(resourceId);
        return {
          content: [{ type: "text", text: JSON.stringify(metadata, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting Log Analytics metadata:", error);
        return {
          content: [{ type: "text", text: `Failed to get metadata: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "la-list-workspace-tables",
    "List the data types a Log Analytics workspace has ACTUALLY ingested over a window, from the Usage table. The companion to la-get-metadata, which returns the schema catalogue and is the same for every workspace. An empty result carries a note naming the window, so it is never a bare zero.",
    {
      resourceId: z.string().describe("Resource ID (use la-list-workspaces to find IDs)"),
      timespan: z.string().optional().describe("ISO 8601 window to measure (default: P7D)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, timespan }: any) => {
      try {
        const result = await ctx.logAnalytics.listWorkspaceTables(resourceId, timespan || 'P7D');
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error listing workspace tables:", error);
        return {
          content: [{ type: "text", text: `Failed to list workspace tables: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "la-test-access",
    "Test access to a Log Analytics workspace by executing a simple query",
    {
      resourceId: z.string().describe("Resource ID"),
    },
    // Read-only access probe (runs a trivial KQL query).
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId }: any) => {
      try {
        const result = await ctx.logAnalytics.testWorkspaceAccess(resourceId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error testing workspace access:", error);
        return {
          content: [{ type: "text", text: `Failed to test workspace access: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
