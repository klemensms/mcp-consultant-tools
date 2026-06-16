/**
 * Variable group tools - read-only, upsert (Tier 2), and delete (Tier 3).
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';
import { descWithExamples, VARIABLE_EXPRESSION_EXAMPLES } from '../tool-examples.js';

export function registerVariableGroupTools(server: any, ctx: ServiceContext): { readonly: number; upsert: number; delete: number } {
  let readonlyCount = 0;
  let upsertCount = 0;
  let deleteCount = 0;

  // ========================================
  // VARIABLE GROUP READ-ONLY TOOLS
  // ========================================
  server.tool(
    "get-variable-groups",
    "List all variable groups in a project. Shows group name, description, and variable names (secrets masked).",
    {
      project: z.string().describe("The project name"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project }: any) => {
      try {
        const result = await ctx.variableGroups.getVariableGroups(project);
        return { content: [{ type: "text", text: `Variable groups in project '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting variable groups:", error);
        return { content: [{ type: "text", text: `Failed to get variable groups: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-variable-group",
    "Get a specific variable group by ID. Returns all variables with values (secrets masked).",
    {
      project: z.string().describe("The project name"),
      groupId: zCoerceNumber().describe("The variable group ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, groupId }: any) => {
      try {
        const result = await ctx.variableGroups.getVariableGroup(project, groupId);
        return { content: [{ type: "text", text: `Variable group ${groupId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting variable group:", error);
        return { content: [{ type: "text", text: `Failed to get variable group: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  // ========================================
  // VARIABLE GROUP UPSERT TOOLS (Tier 2)
  // ========================================
  if (ctx.tierFlags.enableVariableGroupUpsert) {
    server.tool(
      "create-variable-group",
      "Create a new variable group. Variables can be marked as secret. (requires AZUREDEVOPS_ENABLE_VARIABLE_GROUP_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        name: z.string().describe("Variable group name"),
        description: z.string().optional().describe("Variable group description"),
        variables: z.record(z.object({
          value: z.string(),
          isSecret: z.boolean().optional()
        })).optional().describe("Initial variables to set"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, name, description, variables }: any) => {
        try {
          const result = await ctx.variableGroups.createVariableGroup(project, name, description, variables);
          return { content: [{ type: "text", text: `Created variable group '${name}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error creating variable group:", error);
          return { content: [{ type: "text", text: `Failed to create variable group: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "update-variable-group",
      "Update a variable group's name or description. Use set-variable to modify variables. (requires AZUREDEVOPS_ENABLE_VARIABLE_GROUP_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        groupId: zCoerceNumber().describe("The variable group ID"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, groupId, name, description }: any) => {
        try {
          const updates: any = {};
          if (name) updates.name = name;
          if (description) updates.description = description;
          const result = await ctx.variableGroups.updateVariableGroupMetadata(project, groupId, updates);
          return { content: [{ type: "text", text: `Updated variable group ${groupId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error updating variable group:", error);
          return { content: [{ type: "text", text: `Failed to update variable group: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "set-variable",
      "Set or update a variable in a variable group. Creates the variable if it doesn't exist. (requires AZUREDEVOPS_ENABLE_VARIABLE_GROUP_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        groupId: zCoerceNumber().describe("The variable group ID"),
        variableName: z.string().describe("Variable name"),
        value: z.string().describe(
          descWithExamples("Variable value. Supports pipeline expressions when referenced in YAML", VARIABLE_EXPRESSION_EXAMPLES)
        ),
        isSecret: z.boolean().optional().describe("Mark as secret (default: false)"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, groupId, variableName, value, isSecret }: any) => {
        try {
          const result = await ctx.variableGroups.setVariable(project, groupId, variableName, value, isSecret || false);
          return { content: [{ type: "text", text: `Set variable '${variableName}' in group ${groupId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error setting variable:", error);
          return { content: [{ type: "text", text: `Failed to set variable: ${error.message}` }] };
        }
      }
    );
    upsertCount++;
  }

  // ========================================
  // VARIABLE GROUP DELETE TOOLS (Tier 3)
  // ========================================
  if (ctx.tierFlags.enableVariableGroupDelete) {
    server.tool(
      "remove-variable",
      "Remove a variable from a variable group. (requires AZUREDEVOPS_ENABLE_VARIABLE_GROUP_DELETE=true)",
      {
        project: z.string().describe("The project name"),
        groupId: zCoerceNumber().describe("The variable group ID"),
        variableName: z.string().describe("Variable name to remove"),
      },
      { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      async ({ project, groupId, variableName }: any) => {
        try {
          const result = await ctx.variableGroups.removeVariable(project, groupId, variableName);
          return { content: [{ type: "text", text: `Removed variable '${variableName}' from group ${groupId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error removing variable:", error);
          return { content: [{ type: "text", text: `Failed to remove variable: ${error.message}` }] };
        }
      }
    );
    deleteCount++;

    server.tool(
      "delete-variable-group",
      "DESTRUCTIVE: Delete a variable group. Pipelines using this group will fail. (requires AZUREDEVOPS_ENABLE_VARIABLE_GROUP_DELETE=true)",
      {
        project: z.string().describe("The project name"),
        groupId: zCoerceNumber().describe("The variable group ID to delete"),
      },
      { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      async ({ project, groupId }: any) => {
        try {
          const result = await ctx.variableGroups.deleteVariableGroup(project, groupId);
          return { content: [{ type: "text", text: `Deleted variable group ${groupId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error deleting variable group:", error);
          return { content: [{ type: "text", text: `Failed to delete variable group: ${error.message}` }] };
        }
      }
    );
    deleteCount++;
  }

  return { readonly: readonlyCount, upsert: upsertCount, delete: deleteCount };
}
