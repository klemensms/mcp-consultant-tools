/**
 * Environment tools - read-only, upsert (Tier 2), and delete (Tier 3).
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENVIRONMENT_NAME_EXAMPLES, CHECK_TYPE_EXAMPLES } from '../tool-examples.js';

export function registerEnvironmentTools(server: any, ctx: ServiceContext): { readonly: number; upsert: number; delete: number } {
  let readonlyCount = 0;
  let upsertCount = 0;
  let deleteCount = 0;

  // ========================================
  // ENVIRONMENT READ-ONLY TOOLS
  // ========================================
  server.tool(
    "list-environments",
    "List all deployment environments in a project. Shows environment name, description, and modification info.",
    {
      project: z.string().describe("The project name"),
    },
    async ({ project }: any) => {
      try {
        const result = await ctx.environments.listEnvironments(project);
        return { content: [{ type: "text", text: `Environments in project '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing environments:", error);
        return { content: [{ type: "text", text: `Failed to list environments: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-environment",
    "Get detailed environment configuration including associated resources (Kubernetes, VMs, etc.).",
    {
      project: z.string().describe("The project name"),
      environmentId: zCoerceNumber().describe("The environment ID"),
    },
    async ({ project, environmentId }: any) => {
      try {
        const result = await ctx.environments.getEnvironment(project, environmentId);
        return { content: [{ type: "text", text: `Environment ${environmentId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting environment:", error);
        return { content: [{ type: "text", text: `Failed to get environment: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-env-deployments",
    "Get deployment history for an environment. Shows pipeline, owner, start/finish times, and result.",
    {
      project: z.string().describe("The project name"),
      environmentId: zCoerceNumber().describe("The environment ID"),
      top: zCoerceNumber().optional().describe("Maximum number of results (default: 10)"),
    },
    async ({ project, environmentId, top }: any) => {
      try {
        const result = await ctx.environments.getEnvironmentDeployments(project, environmentId, top || 10);
        return { content: [{ type: "text", text: `Deployments to environment ${environmentId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting environment deployments:", error);
        return { content: [{ type: "text", text: `Failed to get environment deployments: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-env-checks",
    "Get all checks (approvals, business hours, branch control, etc.) configured for an environment. Essential for understanding pipeline approval requirements.",
    {
      project: z.string().describe("The project name"),
      environmentId: zCoerceNumber().describe("The environment ID"),
    },
    async ({ project, environmentId }: any) => {
      try {
        const result = await ctx.environments.getEnvironmentChecks(project, environmentId);
        return { content: [{ type: "text", text: `Checks for environment ${environmentId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting environment checks:", error);
        return { content: [{ type: "text", text: `Failed to get environment checks: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  // ========================================
  // ENVIRONMENT UPSERT TOOLS (Tier 2)
  // ========================================
  if (ctx.tierFlags.enableEnvironmentUpsert) {
    server.tool(
      "create-environment",
      "Create a new deployment environment. (requires AZUREDEVOPS_ENABLE_ENVIRONMENT_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        name: z.string().describe(
          descWithExamples("Environment name", ENVIRONMENT_NAME_EXAMPLES)
        ),
        description: z.string().optional().describe("Environment description"),
      },
      async ({ project, name, description }: any) => {
        try {
          const result = await ctx.environments.createEnvironment(project, name, description);
          return { content: [{ type: "text", text: `Created environment '${name}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error creating environment:", error);
          return { content: [{ type: "text", text: `Failed to create environment: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "update-environment",
      "Update an environment's name or description. (requires AZUREDEVOPS_ENABLE_ENVIRONMENT_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        environmentId: zCoerceNumber().describe("The environment ID"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
      },
      async ({ project, environmentId, name, description }: any) => {
        try {
          const updates: any = {};
          if (name) updates.name = name;
          if (description) updates.description = description;
          const result = await ctx.environments.updateEnvironment(project, environmentId, updates);
          return { content: [{ type: "text", text: `Updated environment ${environmentId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error updating environment:", error);
          return { content: [{ type: "text", text: `Failed to update environment: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "create-env-check",
      "Add an approval, business hours, branch control, or other check to an environment. Supports all Azure DevOps check types. (requires AZUREDEVOPS_ENABLE_ENVIRONMENT_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        environmentId: zCoerceNumber().describe("The environment ID"),
        checkType: z.enum([
          "Approval",
          "BusinessHours",
          "BranchControl",
          "InvokeRESTAPI",
          "InvokeAzureFunction",
          "ExclusiveLock",
          "RequiredTemplate"
        ]).describe(
          descWithExamples("Check type to add", CHECK_TYPE_EXAMPLES)
        ),
        settings: z.any().describe("Check-specific settings. For Approval: {approvers: [{id: 'user-guid'}], minRequiredApprovers: 1, instructions: '...'}. For BusinessHours: {businessHours: {startTime: '09:00', endTime: '17:00', timeZoneId: 'UTC'}}. For BranchControl: {allowedBranches: ['refs/heads/main']}"),
        timeout: zCoerceNumber().optional().describe("Timeout in minutes (default: 43200 = 30 days)"),
      },
      async ({ project, environmentId, checkType, settings, timeout }: any) => {
        try {
          const configuration = { ...settings };
          if (timeout) configuration.timeout = timeout;
          const result = await ctx.environments.addEnvironmentCheck(project, environmentId, checkType, configuration);
          return { content: [{ type: "text", text: `Created ${checkType} check on environment ${environmentId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error creating environment check:", error);
          return { content: [{ type: "text", text: `Failed to create environment check: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "update-env-check",
      "Update an existing environment check's settings or timeout. (requires AZUREDEVOPS_ENABLE_ENVIRONMENT_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        checkId: zCoerceNumber().describe("The check configuration ID to update"),
        settings: z.any().optional().describe("Updated check-specific settings"),
        timeout: zCoerceNumber().optional().describe("Updated timeout in minutes"),
      },
      async ({ project, checkId, settings, timeout }: any) => {
        try {
          const updates: any = {};
          if (settings !== undefined) updates.settings = settings;
          if (timeout !== undefined) updates.timeout = timeout;
          const result = await ctx.environments.updateEnvironmentCheck(project, checkId, updates);
          return { content: [{ type: "text", text: `Updated check ${checkId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error updating environment check:", error);
          return { content: [{ type: "text", text: `Failed to update environment check: ${error.message}` }] };
        }
      }
    );
    upsertCount++;
  }

  // ========================================
  // ENVIRONMENT DELETE TOOLS (Tier 3)
  // ========================================
  if (ctx.tierFlags.enableEnvironmentDelete) {
    server.tool(
      "delete-environment",
      "DESTRUCTIVE: Delete a deployment environment. Pipelines targeting this environment will fail. (requires AZUREDEVOPS_ENABLE_ENVIRONMENT_DELETE=true)",
      {
        project: z.string().describe("The project name"),
        environmentId: zCoerceNumber().describe("The environment ID to delete"),
      },
      async ({ project, environmentId }: any) => {
        try {
          const result = await ctx.environments.deleteEnvironment(project, environmentId);
          return { content: [{ type: "text", text: `Deleted environment ${environmentId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error deleting environment:", error);
          return { content: [{ type: "text", text: `Failed to delete environment: ${error.message}` }] };
        }
      }
    );
    deleteCount++;

    server.tool(
      "delete-env-check",
      "Delete an approval, business hours, branch control, or other check from an environment. (requires AZUREDEVOPS_ENABLE_ENVIRONMENT_DELETE=true)",
      {
        project: z.string().describe("The project name"),
        checkId: zCoerceNumber().describe("The check configuration ID to delete (get from get-env-checks)"),
      },
      async ({ project, checkId }: any) => {
        try {
          const result = await ctx.environments.removeEnvironmentCheck(project, checkId);
          return { content: [{ type: "text", text: `Deleted check ${checkId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error deleting environment check:", error);
          return { content: [{ type: "text", text: `Failed to delete environment check: ${error.message}` }] };
        }
      }
    );
    deleteCount++;
  }

  return { readonly: readonlyCount, upsert: upsertCount, delete: deleteCount };
}
