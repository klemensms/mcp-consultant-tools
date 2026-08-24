/**
 * Variable Group Tools - 5 tools for variable group operations
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

  server.tool(
    "compare-variable-groups",
    "Compare two Azure DevOps variable groups side by side. Reports variables unique to each group, value differences, and variables whose secret/plaintext status differs. Secret VALUES are never read or returned - a variable that is a secret on either side is listed by name under 'secretsSkipped'.",
    {
      project: z.string().describe("The project name"),
      groupIdA: zCoerceNumber().describe("First variable group ID"),
      groupIdB: zCoerceNumber().describe("Second variable group ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, groupIdA, groupIdB }: any) => {
      try {
        const result = await ctx.variableGroup.compareVariableGroups(project, groupIdA, groupIdB);
        return { content: [{ type: "text", text: `Variable group comparison (${groupIdA} vs ${groupIdB}) in '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error comparing variable groups:", error);
        return { content: [{ type: "text", text: `Failed to compare variable groups: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "compare-environments",
    "Find variable groups named '<base>-<env>' (e.g. billing-dev / billing-uat / billing-prod) and diff each environment against the first in its family. Returns 'unmatchedGroups' (names that fit no suffix) and 'incompleteSets' (families with one environment) so an empty result is explainable rather than a false all-clear. Secret values are never returned. Override 'environmentSuffixes' if your naming convention differs (e.g. '-prd').",
    {
      project: z.string().describe("The project name"),
      nameContains: z.string().optional().describe("Case-insensitive substring filter on group name"),
      environmentSuffixes: z.array(z.string()).optional().describe("Environment suffixes to recognise. Default: -dev, -development, -qa, -uat, -staging, -stage, -test, -prod, -production"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, nameContains, environmentSuffixes }: any) => {
      try {
        const result = await ctx.variableGroup.compareEnvironments(project, { nameContains, environmentSuffixes });
        return { content: [{ type: "text", text: `Environment comparison in '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error comparing environments:", error);
        return { content: [{ type: "text", text: `Failed to compare environments: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "variable-group-summary",
    "Overview of variable groups in a project with per-group variable and secret COUNTS (never secret values). Totals describe exactly the groups returned; 'truncated' is true when more groups matched than 'maxResults' allowed.",
    {
      project: z.string().describe("The project name"),
      nameContains: z.string().optional().describe("Case-insensitive substring filter on group name"),
      maxResults: zCoerceNumber().optional().describe("Maximum groups to return (default 100)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, nameContains, maxResults }: any) => {
      try {
        const result = await ctx.variableGroup.getVariableGroupSummaries(project, { nameContains, maxResults });
        return { content: [{ type: "text", text: `Variable group summary for '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error summarising variable groups:", error);
        return { content: [{ type: "text", text: `Failed to summarise variable groups: ${error.message}` }] };
      }
    }
  );
}
