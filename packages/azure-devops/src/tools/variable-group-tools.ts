/**
 * Variable Group Tools - 2 tools for variable group operations
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';

export function registerVariableGroupTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "list-variable-groups",
    "List all variable groups in an Azure DevOps project. Variable groups store values and secrets used in pipelines.",
    {
      project: z.string().describe("The project name"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project }: any) => {
      try {
        const result = await ctx.variableGroup.getVariableGroups(project);
        return { content: [{ type: "text", text: `Variable groups in project '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing variable groups:", error);
        return { content: [{ type: "text", text: `Failed to list variable groups: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "get-variable-group",
    "Get a specific variable group by ID from Azure DevOps. Returns all variables (secrets are masked).",
    {
      project: z.string().describe("The project name"),
      groupId: zCoerceNumber().describe("The variable group ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, groupId }: any) => {
      try {
        const result = await ctx.variableGroup.getVariableGroup(project, groupId);
        return { content: [{ type: "text", text: `Variable group ${groupId} in project '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting variable group:", error);
        return { content: [{ type: "text", text: `Failed to get variable group: ${error.message}` }] };
      }
    }
  );
}
