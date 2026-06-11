/**
 * Project tools - read-only, upsert (Tier 2), and delete (Tier 3).
 * Org-scoped: these tools do NOT take a project parameter for scoping.
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  PROJECT_PROCESS_EXAMPLES,
  PROJECT_VISIBILITY_EXAMPLES,
  PROJECT_STATE_FILTER_EXAMPLES,
  PROJECT_VERSION_CONTROL_EXAMPLES,
} from '../tool-examples.js';

export function registerProjectTools(server: any, ctx: ServiceContext): { readonly: number; upsert: number; delete: number } {
  let readonlyCount = 0;
  let upsertCount = 0;
  let deleteCount = 0;

  // ========================================
  // PROJECT READ-ONLY TOOLS
  // ========================================
  server.tool(
    "list-projects",
    "List all projects in the Azure DevOps organization. Returns project name, state, visibility, and last update time.",
    {
      stateFilter: z.string().optional().describe(
        descWithExamples("Filter by project state (default: wellFormed)", PROJECT_STATE_FILTER_EXAMPLES)
      ),
      top: zCoerceNumber().optional().describe("Maximum number of projects to return"),
      skip: zCoerceNumber().optional().describe("Number of projects to skip (for pagination)"),
    },
    async ({ stateFilter, top, skip }: any) => {
      try {
        const result = await ctx.projects.listProjects(stateFilter, top, skip);
        return { content: [{ type: "text", text: `Projects in organization:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing projects:", error);
        return { content: [{ type: "text", text: `Failed to list projects: ${error.message}` }], isError: true };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-project",
    "Get detailed information about a project including version control type and process template.",
    {
      projectId: z.string().describe("Project name or ID (GUID)"),
    },
    async ({ projectId }: any) => {
      try {
        const result = await ctx.projects.getProject(projectId);
        return { content: [{ type: "text", text: `Project '${projectId}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting project:", error);
        return { content: [{ type: "text", text: `Failed to get project: ${error.message}` }], isError: true };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-project-properties",
    "Get extended project properties (process template ID, system capabilities, etc.).",
    {
      projectId: z.string().describe("Project name or ID (GUID)"),
    },
    async ({ projectId }: any) => {
      try {
        const result = await ctx.projects.getProjectProperties(projectId);
        return { content: [{ type: "text", text: `Properties for '${projectId}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting project properties:", error);
        return { content: [{ type: "text", text: `Failed to get project properties: ${error.message}` }], isError: true };
      }
    }
  );
  readonlyCount++;

  // ========================================
  // PROJECT UPSERT TOOLS (Tier 2)
  // ========================================
  if (ctx.tierFlags.enableProjectUpsert) {
    server.tool(
      "create-project",
      "Create a new Azure DevOps project. Polls until the operation completes (~5-30 seconds). (requires AZUREDEVOPS_ENABLE_PROJECT_UPSERT=true)",
      {
        name: z.string().describe("Project name (must be unique in the organization)"),
        description: z.string().optional().describe("Project description"),
        visibility: z.string().optional().describe(
          descWithExamples("Project visibility (default: private)", PROJECT_VISIBILITY_EXAMPLES)
        ),
        processTemplate: z.string().optional().describe(
          descWithExamples("Process template name (default: Agile)", PROJECT_PROCESS_EXAMPLES)
        ),
        versionControl: z.string().optional().describe(
          descWithExamples("Version control type (default: Git)", PROJECT_VERSION_CONTROL_EXAMPLES)
        ),
      },
      async ({ name, description, visibility, processTemplate, versionControl }: any) => {
        try {
          const result = await ctx.projects.createProject(name, description, visibility, processTemplate, versionControl);
          return { content: [{ type: "text", text: `Created project '${name}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error creating project:", error);
          return { content: [{ type: "text", text: `Failed to create project: ${error.message}` }], isError: true };
        }
      }
    );
    upsertCount++;

    server.tool(
      "update-project",
      "Update a project's name and/or description. (requires AZUREDEVOPS_ENABLE_PROJECT_UPSERT=true)",
      {
        projectId: z.string().describe("Project name or ID (GUID)"),
        name: z.string().optional().describe("New project name"),
        description: z.string().optional().describe("New project description"),
      },
      async ({ projectId, name, description }: any) => {
        try {
          const updates: any = {};
          if (name !== undefined) updates.name = name;
          if (description !== undefined) updates.description = description;
          const result = await ctx.projects.updateProject(projectId, updates);
          return { content: [{ type: "text", text: `Updated project '${projectId}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error updating project:", error);
          return { content: [{ type: "text", text: `Failed to update project: ${error.message}` }], isError: true };
        }
      }
    );
    upsertCount++;
  }

  // ========================================
  // PROJECT DELETE TOOLS (Tier 3)
  // ========================================
  if (ctx.tierFlags.enableProjectDelete) {
    server.tool(
      "delete-project",
      "DESTRUCTIVE: Permanently delete an Azure DevOps project and all its data. This cannot be undone. Polls until the operation completes. (requires AZUREDEVOPS_ENABLE_PROJECT_DELETE=true)",
      {
        projectId: z.string().describe("Project name or ID (GUID) to delete"),
      },
      async ({ projectId }: any) => {
        try {
          const result = await ctx.projects.deleteProject(projectId);
          return { content: [{ type: "text", text: `Deleted project '${projectId}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error deleting project:", error);
          return { content: [{ type: "text", text: `Failed to delete project: ${error.message}` }], isError: true };
        }
      }
    );
    deleteCount++;
  }

  return { readonly: readonlyCount, upsert: upsertCount, delete: deleteCount };
}
