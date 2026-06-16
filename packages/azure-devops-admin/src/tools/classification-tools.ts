/**
 * Classification node tools (iterations & areas) - read-only, upsert (Tier 2), and delete (Tier 3).
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';

export function registerClassificationTools(server: any, ctx: ServiceContext): { readonly: number; upsert: number; delete: number } {
  let readonlyCount = 0;
  let upsertCount = 0;
  let deleteCount = 0;

  // ========================================
  // CLASSIFICATION NODE READ-ONLY TOOLS
  // ========================================
  server.tool(
    "list-iterations",
    "List all iterations (sprints) in a project with their hierarchy, dates, and time frame. Returns flattened list with full paths.",
    {
      project: z.string().describe("The project name"),
      depth: zCoerceNumber().optional().describe("How deep to traverse the hierarchy (default: 10)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, depth }: any) => {
      try {
        const result = await ctx.classification.listClassificationNodes(project, 'iterations', depth || 10);
        return { content: [{ type: "text", text: `Iterations in project '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing iterations:", error);
        return { content: [{ type: "text", text: `Failed to list iterations: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-iteration",
    "Get details of a specific iteration including start/finish dates and time frame.",
    {
      project: z.string().describe("The project name"),
      path: z.string().describe("Iteration path (e.g., 'Sprint 1' or 'Release 1\\Sprint 1'). Use backslash for hierarchy."),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, path }: any) => {
      try {
        const result = await ctx.classification.getClassificationNode(project, 'iterations', path);
        return { content: [{ type: "text", text: `Iteration '${path}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting iteration:", error);
        return { content: [{ type: "text", text: `Failed to get iteration: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "list-areas",
    "List all area paths in a project with their hierarchy. Returns flattened list with full paths.",
    {
      project: z.string().describe("The project name"),
      depth: zCoerceNumber().optional().describe("How deep to traverse the hierarchy (default: 10)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, depth }: any) => {
      try {
        const result = await ctx.classification.listClassificationNodes(project, 'areas', depth || 10);
        return { content: [{ type: "text", text: `Areas in project '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing areas:", error);
        return { content: [{ type: "text", text: `Failed to list areas: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-area",
    "Get details of a specific area path.",
    {
      project: z.string().describe("The project name"),
      path: z.string().describe("Area path (e.g., 'Backend' or 'Product\\Backend'). Use backslash for hierarchy."),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, path }: any) => {
      try {
        const result = await ctx.classification.getClassificationNode(project, 'areas', path);
        return { content: [{ type: "text", text: `Area '${path}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting area:", error);
        return { content: [{ type: "text", text: `Failed to get area: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  // ========================================
  // CLASSIFICATION NODE UPSERT TOOLS (Tier 2)
  // ========================================
  if (ctx.tierFlags.enableClassificationNodeUpsert) {
    server.tool(
      "create-iteration",
      "Create a new iteration (sprint) with optional start and finish dates. (requires AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        name: z.string().describe("Iteration name (e.g., 'Sprint 1')"),
        parentPath: z.string().optional().describe("Parent iteration path to create under (e.g., 'Release 1'). If not specified, creates at root."),
        startDate: z.string().optional().describe("Start date in ISO format (e.g., '2024-01-01')"),
        finishDate: z.string().optional().describe("Finish date in ISO format (e.g., '2024-01-14')"),
        team: z.string().optional().describe("Team name to subscribe the iteration to (e.g., 'My Team'). If provided, the iteration will be automatically added to the team's sprint view."),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, name, parentPath, startDate, finishDate, team }: any) => {
        try {
          const attributes = (startDate || finishDate) ? { startDate, finishDate } : undefined;
          const result = await ctx.classification.createClassificationNode(project, 'iterations', name, parentPath, attributes);

          if (team) {
            const teamResult = await ctx.classification.addIterationToTeam(project, team, result.identifier);
            return { content: [{ type: "text", text: `Created iteration '${name}' and subscribed to team '${team}':\n\n${JSON.stringify({ ...result, teamSubscription: teamResult }, null, 2)}` }] };
          }

          return { content: [{ type: "text", text: `Created iteration '${name}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error creating iteration:", error);
          return { content: [{ type: "text", text: `Failed to create iteration: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "update-iteration",
      "Update an iteration's name or dates. (requires AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        path: z.string().describe("Iteration path to update (e.g., 'Sprint 1' or 'Release 1\\Sprint 1')"),
        name: z.string().optional().describe("New iteration name"),
        startDate: z.string().optional().describe("New start date in ISO format (e.g., '2024-01-01')"),
        finishDate: z.string().optional().describe("New finish date in ISO format (e.g., '2024-01-14')"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, path, name, startDate, finishDate }: any) => {
        try {
          const updates: any = {};
          if (name) updates.name = name;
          if (startDate !== undefined) updates.startDate = startDate;
          if (finishDate !== undefined) updates.finishDate = finishDate;
          const result = await ctx.classification.updateClassificationNode(project, 'iterations', path, updates);
          return { content: [{ type: "text", text: `Updated iteration '${path}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error updating iteration:", error);
          return { content: [{ type: "text", text: `Failed to update iteration: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "create-area",
      "Create a new area path. (requires AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        name: z.string().describe("Area name (e.g., 'Backend')"),
        parentPath: z.string().optional().describe("Parent area path to create under (e.g., 'Product'). If not specified, creates at root."),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, name, parentPath }: any) => {
        try {
          const result = await ctx.classification.createClassificationNode(project, 'areas', name, parentPath);
          return { content: [{ type: "text", text: `Created area '${name}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error creating area:", error);
          return { content: [{ type: "text", text: `Failed to create area: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "update-area",
      "Rename an area path. (requires AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        path: z.string().describe("Area path to update (e.g., 'Backend' or 'Product\\Backend')"),
        name: z.string().describe("New area name"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, path, name }: any) => {
        try {
          const result = await ctx.classification.updateClassificationNode(project, 'areas', path, { name });
          return { content: [{ type: "text", text: `Updated area '${path}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error updating area:", error);
          return { content: [{ type: "text", text: `Failed to update area: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "add-iteration-to-team",
      "Subscribe an existing iteration to a team so it appears in their sprint planning view. (requires AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        team: z.string().describe("The team name (e.g., 'My Team')"),
        iterationId: z.string().describe("The iteration identifier GUID (returned by create-iteration or get-iteration as 'identifier')"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, team, iterationId }: any) => {
        try {
          const result = await ctx.classification.addIterationToTeam(project, team, iterationId);
          return { content: [{ type: "text", text: `Subscribed iteration to team '${team}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error subscribing iteration to team:", error);
          return { content: [{ type: "text", text: `Failed to subscribe iteration to team: ${error.message}` }] };
        }
      }
    );
    upsertCount++;
  }

  // ========================================
  // CLASSIFICATION NODE DELETE TOOLS (Tier 3)
  // ========================================
  if (ctx.tierFlags.enableClassificationNodeDelete) {
    server.tool(
      "delete-iteration",
      "DESTRUCTIVE: Delete an iteration. Work items in this iteration will be reclassified to the target iteration. (requires AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_DELETE=true)",
      {
        project: z.string().describe("The project name"),
        path: z.string().describe("Iteration path to delete (e.g., 'Sprint 1' or 'Release 1\\Sprint 1')"),
        reclassifyId: zCoerceNumber().describe("ID of the iteration to move work items to. Get IDs from list-iterations."),
      },
      { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      async ({ project, path, reclassifyId }: any) => {
        try {
          const result = await ctx.classification.deleteClassificationNode(project, 'iterations', path, reclassifyId);
          return { content: [{ type: "text", text: `Deleted iteration '${path}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error deleting iteration:", error);
          return { content: [{ type: "text", text: `Failed to delete iteration: ${error.message}` }] };
        }
      }
    );
    deleteCount++;

    server.tool(
      "delete-area",
      "DESTRUCTIVE: Delete an area path. Work items in this area will be reclassified to the target area. (requires AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_DELETE=true)",
      {
        project: z.string().describe("The project name"),
        path: z.string().describe("Area path to delete (e.g., 'Backend' or 'Product\\Backend')"),
        reclassifyId: zCoerceNumber().describe("ID of the area to move work items to. Get IDs from list-areas."),
      },
      { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      async ({ project, path, reclassifyId }: any) => {
        try {
          const result = await ctx.classification.deleteClassificationNode(project, 'areas', path, reclassifyId);
          return { content: [{ type: "text", text: `Deleted area '${path}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error deleting area:", error);
          return { content: [{ type: "text", text: `Failed to delete area: ${error.message}` }] };
        }
      }
    );
    deleteCount++;
  }

  return { readonly: readonlyCount, upsert: upsertCount, delete: deleteCount };
}
