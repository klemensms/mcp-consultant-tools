/**
 * Service connection tools - read-only, upsert (Tier 2), and delete (Tier 3).
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, SVC_CONN_TYPE_EXAMPLES } from '../tool-examples.js';

export function registerServiceConnectionTools(server: any, ctx: ServiceContext): { readonly: number; upsert: number; delete: number } {
  let readonlyCount = 0;
  let upsertCount = 0;
  let deleteCount = 0;

  // ========================================
  // SERVICE CONNECTION READ-ONLY TOOLS
  // ========================================
  server.tool(
    "list-svc-conns",
    "List all service connections in a project. Shows connection type, URL, authorization scheme, and sharing status. Credentials are masked.",
    {
      project: z.string().describe("The project name"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project }: any) => {
      try {
        const result = await ctx.serviceConnections.listServiceConnections(project);
        return { content: [{ type: "text", text: `Service connections in project '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing service connections:", error);
        return { content: [{ type: "text", text: `Failed to list service connections: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-svc-conn",
    "Get detailed service connection configuration. Returns type, URL, authorization scheme, data fields, and project references. Secrets are masked.",
    {
      project: z.string().describe("The project name"),
      connectionId: z.string().describe("The service connection ID (GUID)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, connectionId }: any) => {
      try {
        const result = await ctx.serviceConnections.getServiceConnection(project, connectionId);
        return { content: [{ type: "text", text: `Service connection ${connectionId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting service connection:", error);
        return { content: [{ type: "text", text: `Failed to get service connection: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-svc-conn-types",
    "Get all available service connection types (Azure, AWS, Docker, GitHub, etc.) with their authentication schemes and configuration options.",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const result = await ctx.serviceConnections.getServiceConnectionTypes();
        return { content: [{ type: "text", text: `Available service connection types:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting service connection types:", error);
        return { content: [{ type: "text", text: `Failed to get service connection types: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  // ========================================
  // SERVICE CONNECTION UPSERT TOOLS (Tier 2)
  // ========================================
  if (ctx.tierFlags.enableServiceConnUpsert) {
    server.tool(
      "create-svc-conn",
      "Create a new service connection. Use get-svc-conn-types to see available types and auth schemes. (requires AZUREDEVOPS_ENABLE_SERVICE_CONN_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        name: z.string().describe("Connection name"),
        type: z.string().describe(
          descWithExamples("Connection type identifier", SVC_CONN_TYPE_EXAMPLES)
        ),
        url: z.string().optional().describe("Service URL (required for some types)"),
        description: z.string().optional().describe("Connection description"),
        authorization: z.object({
          scheme: z.string().describe("Auth scheme (e.g., 'ServicePrincipal', 'PersonalAccessToken')"),
          parameters: z.record(z.string()).optional().describe("Auth parameters (credentials)")
        }).optional().describe("Authorization configuration"),
        data: z.record(z.string()).optional().describe("Type-specific configuration data"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, name, type, url, description, authorization, data }: any) => {
        try {
          const result = await ctx.serviceConnections.createServiceConnection(project, name, type, { url, description, authorization, data });
          return { content: [{ type: "text", text: `Created service connection '${name}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error creating service connection:", error);
          return { content: [{ type: "text", text: `Failed to create service connection: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "update-svc-conn",
      "Update a service connection's metadata (name, description, URL, data). Cannot update credentials for security. (requires AZUREDEVOPS_ENABLE_SERVICE_CONN_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        connectionId: z.string().describe("The service connection ID (GUID)"),
        name: z.string().optional().describe("New connection name"),
        description: z.string().optional().describe("New description"),
        url: z.string().optional().describe("New service URL"),
        data: z.record(z.string()).optional().describe("Updated data fields"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, connectionId, name, description, url, data }: any) => {
        try {
          const updates: any = {};
          if (name) updates.name = name;
          if (description) updates.description = description;
          if (url) updates.url = url;
          if (data) updates.data = data;
          const result = await ctx.serviceConnections.updateServiceConnection(project, connectionId, updates);
          return { content: [{ type: "text", text: `Updated service connection ${connectionId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error updating service connection:", error);
          return { content: [{ type: "text", text: `Failed to update service connection: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "share-svc-conn",
      "Share a service connection with other projects. (requires AZUREDEVOPS_ENABLE_SERVICE_CONN_UPSERT=true)",
      {
        connectionId: z.string().describe("The service connection ID (GUID)"),
        projectIds: z.array(z.string()).describe("Array of project IDs to share with"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ connectionId, projectIds }: any) => {
        try {
          const result = await ctx.serviceConnections.shareServiceConnection(connectionId, projectIds);
          return { content: [{ type: "text", text: `Shared service connection ${connectionId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error sharing service connection:", error);
          return { content: [{ type: "text", text: `Failed to share service connection: ${error.message}` }] };
        }
      }
    );
    upsertCount++;
  }

  // ========================================
  // SERVICE CONNECTION DELETE TOOLS (Tier 3)
  // ========================================
  if (ctx.tierFlags.enableServiceConnDelete) {
    server.tool(
      "delete-svc-conn",
      "DESTRUCTIVE: Delete a service connection. Pipelines using this connection will fail. (requires AZUREDEVOPS_ENABLE_SERVICE_CONN_DELETE=true)",
      {
        project: z.string().describe("The project name"),
        connectionId: z.string().describe("The service connection ID (GUID) to delete"),
      },
      { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      async ({ project, connectionId }: any) => {
        try {
          const result = await ctx.serviceConnections.deleteServiceConnection(project, connectionId);
          return { content: [{ type: "text", text: `Deleted service connection ${connectionId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error deleting service connection:", error);
          return { content: [{ type: "text", text: `Failed to delete service connection: ${error.message}` }] };
        }
      }
    );
    deleteCount++;
  }

  return { readonly: readonlyCount, upsert: upsertCount, delete: deleteCount };
}
