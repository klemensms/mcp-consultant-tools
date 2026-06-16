/**
 * Pipeline tools - read-only, upsert (Tier 2), and delete (Tier 3).
 * Includes build troubleshooting tools.
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  TIMELINE_SCOPE_EXAMPLES,
  BUILD_DETAIL_EXAMPLES,
  LOG_MODE_EXAMPLES,
  APPROVAL_STATUS_EXAMPLES,
  PIPELINE_FOLDER_EXAMPLES,
} from '../tool-examples.js';

export function registerPipelineTools(server: any, ctx: ServiceContext): { readonly: number; upsert: number; delete: number } {
  let readonlyCount = 0;
  let upsertCount = 0;
  let deleteCount = 0;

  // ========================================
  // PIPELINE READ-ONLY TOOLS (always available)
  // ========================================
  server.tool(
    "list-pipelines",
    "List all YAML pipeline definitions in an Azure DevOps project. Returns pipeline ID, name, path, repository, and YAML file path.",
    {
      project: z.string().describe("The project name"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project }: any) => {
      try {
        const result = await ctx.pipelines.listPipelineDefinitions(project);
        return { content: [{ type: "text", text: `Pipeline definitions in project '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing pipelines:", error);
        return { content: [{ type: "text", text: `Failed to list pipelines: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-pipeline-definition",
    "Get detailed YAML pipeline definition including triggers, variables (secrets masked), queue settings, and repository configuration.",
    {
      project: z.string().describe("The project name"),
      definitionId: zCoerceNumber().describe("The pipeline definition ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, definitionId }: any) => {
      try {
        const result = await ctx.pipelines.getPipelineDefinition(project, definitionId);
        return { content: [{ type: "text", text: `Pipeline definition ${definitionId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting pipeline definition:", error);
        return { content: [{ type: "text", text: `Failed to get pipeline definition: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-pipeline-yaml",
    "Get the YAML content for a pipeline definition. Returns the raw azure-pipelines.yml content.",
    {
      project: z.string().describe("The project name"),
      definitionId: zCoerceNumber().describe("The pipeline definition ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, definitionId }: any) => {
      try {
        const result = await ctx.pipelines.getPipelineYaml(project, definitionId);
        return { content: [{ type: "text", text: `Pipeline YAML for definition ${definitionId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting pipeline YAML:", error);
        return { content: [{ type: "text", text: `Failed to get pipeline YAML: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "list-pipeline-runs",
    "List recent pipeline runs for a definition. Returns build ID, status, result, branch, timestamps, and who triggered it.",
    {
      project: z.string().describe("The project name"),
      definitionId: zCoerceNumber().describe("The pipeline definition ID"),
      top: zCoerceNumber().optional().describe("Maximum number of results (default: 10)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, definitionId, top }: any) => {
      try {
        const result = await ctx.pipelines.listPipelineRuns(project, definitionId, top || 10);
        return { content: [{ type: "text", text: `Recent runs for pipeline ${definitionId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing pipeline runs:", error);
        return { content: [{ type: "text", text: `Failed to list pipeline runs: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  // ========================================
  // BUILD TROUBLESHOOTING TOOLS (Read-only)
  // ========================================
  server.tool(
    "get-build-status",
    "Get build status and details. Use detail='summary' for basic status, 'timeline' for step breakdown (default scope='problems' shows only failed/warning items), or 'full' for logs. The timelineScope controls what records are included: 'problems' (default, only errors/warnings), 'stages' (minimal), 'jobs' (moderate), 'all' (everything).",
    {
      project: z.string().describe("The project name"),
      buildId: zCoerceNumber().describe("The build ID"),
      detail: z.enum(["summary", "timeline", "full"]).optional().describe(
        descWithExamples("Level of detail (default: 'summary')", BUILD_DETAIL_EXAMPLES)
      ),
      timelineScope: z.enum(["stages", "jobs", "all", "problems"]).optional().describe(
        descWithExamples("Controls which timeline records are included (default: 'problems')", TIMELINE_SCOPE_EXAMPLES)
      ),
      maxIssues: zCoerceNumber().optional().describe("Maximum issues per record (default: 5, prioritizes errors over warnings)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, buildId, detail, timelineScope, maxIssues }: any) => {
      try {
        const result = await ctx.pipelines.getBuildStatus(project, buildId, detail || 'summary', timelineScope || 'problems', maxIssues || 5);
        return { content: [{ type: "text", text: `Build ${buildId} status:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting build status:", error);
        return { content: [{ type: "text", text: `Failed to get build status: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-build-timeline",
    "Get step-by-step breakdown of a build. Shows stages, jobs, and tasks with timing, status, and error/warning counts. Use scope to control output size: 'problems' (default, only errors/warnings), 'stages' (minimal), 'jobs' (moderate), 'all' (everything). Always includes summary stats regardless of scope.",
    {
      project: z.string().describe("The project name"),
      buildId: zCoerceNumber().describe("The build ID"),
      scope: z.enum(["stages", "jobs", "all", "problems"]).optional().describe(
        descWithExamples("Filter scope for timeline records (default: 'problems')", TIMELINE_SCOPE_EXAMPLES)
      ),
      maxIssues: zCoerceNumber().optional().describe("Maximum issues per record (default: 5, prioritizes errors over warnings)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, buildId, scope, maxIssues }: any) => {
      try {
        const result = await ctx.pipelines.getBuildTimeline(project, buildId, scope || 'problems', maxIssues || 5);
        return { content: [{ type: "text", text: `Build ${buildId} timeline:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting build timeline:", error);
        return { content: [{ type: "text", text: `Failed to get build timeline: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-build-logs",
    "Get build logs. Without logId, returns list of available logs with line counts. With logId, returns that log's content filtered by mode to reduce noise from progress indicators.",
    {
      project: z.string().describe("The project name"),
      buildId: zCoerceNumber().describe("The build ID"),
      logId: zCoerceNumber().optional().describe("Optional specific log ID to retrieve content"),
      mode: z.enum(['summary', 'full', 'errors']).optional().describe(
        descWithExamples("Filter mode for log output (default: 'summary')", LOG_MODE_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, buildId, logId, mode }: any) => {
      try {
        const result = await ctx.pipelines.getBuildLogs(project, buildId, logId, mode || 'summary');
        return { content: [{ type: "text", text: `Build ${buildId} logs:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting build logs:", error);
        return { content: [{ type: "text", text: `Failed to get build logs: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "list-pending-approvals",
    "List pending pipeline approvals for a build. Reads the build timeline to find approval checkpoints, then queries approval details including assigned approvers, status, and instructions.",
    {
      project: z.string().describe("The project name"),
      buildId: zCoerceNumber().describe("The build ID to check for pending approvals"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, buildId }: any) => {
      try {
        const result = await ctx.pipelines.listPendingApprovals(project, buildId);
        return { content: [{ type: "text", text: `Pending approvals for build ${buildId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing pending approvals:", error);
        return { content: [{ type: "text", text: `Failed to list pending approvals: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  // ========================================
  // PIPELINE UPSERT TOOLS (Tier 2)
  // ========================================
  if (ctx.tierFlags.enablePipelineUpsert) {
    server.tool(
      "create-pipeline",
      "Create a new YAML pipeline definition. Supports Azure Repos (default), GitHub, and GitHub Enterprise repositories. (requires AZUREDEVOPS_ENABLE_PIPELINE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        name: z.string().describe("Pipeline name"),
        yamlPath: z.string().describe("Path to YAML file in repository (e.g., 'azure-pipelines.yml' or 'pipelines/build.yml')"),
        folder: z.string().optional().describe(
          descWithExamples("Optional folder path (default: root)", PIPELINE_FOLDER_EXAMPLES)
        ),
        repositoryId: z.string().describe(
          "Repository identifier. For Azure Repos: GUID. For GitHub: 'org/repo' format (e.g., 'myorg/my-repo')"
        ),
        repositoryType: z.enum(["TfsGit", "GitHub", "GitHubEnterprise"])
          .optional()
          .describe("Repository type. Default: 'TfsGit' (Azure Repos). Use 'GitHub' for github.com or 'GitHubEnterprise' for self-hosted GitHub."),
        repositoryUrl: z.string().optional().describe(
          "Repository URL. Required for GitHub/GitHubEnterprise (e.g., 'https://github.com/org/repo.git' or 'https://ghe.company.com/org/repo.git')"
        ),
        defaultBranch: z.string().optional().describe(
          "Default branch for the pipeline. Required for GitHub/GitHubEnterprise (e.g., 'refs/heads/main' or 'main')"
        ),
        serviceConnectionId: z.string().optional().describe(
          "Service connection ID (GUID) for GitHub authentication. Required for GitHub/GitHubEnterprise. Get from list-service-connections tool."
        ),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, name, repositoryId, yamlPath, folder, repositoryType, repositoryUrl, defaultBranch, serviceConnectionId }: any) => {
        try {
          const result = await ctx.pipelines.createPipelineDefinition(
            project, name, repositoryId, yamlPath, folder, repositoryType, repositoryUrl, defaultBranch, serviceConnectionId
          );
          return { content: [{ type: "text", text: `Created pipeline '${name}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error creating pipeline:", error);
          return { content: [{ type: "text", text: `Failed to create pipeline: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "update-pipeline",
      "Update a pipeline definition (name, path, queue status, triggers, or variables). (requires AZUREDEVOPS_ENABLE_PIPELINE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        definitionId: zCoerceNumber().describe("The pipeline definition ID"),
        name: z.string().optional().describe("New pipeline name"),
        path: z.string().optional().describe("New folder path"),
        queueStatus: z.enum(["enabled", "disabled", "paused"]).optional().describe("Queue status"),
        variables: z.record(z.object({
          value: z.string(),
          isSecret: z.boolean().optional(),
          allowOverride: z.boolean().optional()
        })).optional().describe("Pipeline variables to set"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, definitionId, name, path, queueStatus, variables }: any) => {
        try {
          const updates: any = {};
          if (name) updates.name = name;
          if (path) updates.path = path;
          if (queueStatus) updates.queueStatus = queueStatus;
          if (variables) updates.variables = variables;
          const result = await ctx.pipelines.updatePipelineDefinition(project, definitionId, updates);
          return { content: [{ type: "text", text: `Updated pipeline ${definitionId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error updating pipeline:", error);
          return { content: [{ type: "text", text: `Failed to update pipeline: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "rename-pipeline",
      "Rename a pipeline definition. (requires AZUREDEVOPS_ENABLE_PIPELINE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        definitionId: zCoerceNumber().describe("The pipeline definition ID"),
        newName: z.string().describe("The new pipeline name"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, definitionId, newName }: any) => {
        try {
          const result = await ctx.pipelines.renamePipelineDefinition(project, definitionId, newName);
          return { content: [{ type: "text", text: `Renamed pipeline ${definitionId} to '${newName}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error renaming pipeline:", error);
          return { content: [{ type: "text", text: `Failed to rename pipeline: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "queue-build",
      "Queue a new pipeline build/run. Optionally specify source branch, commit SHA, variables, or template parameters. (requires AZUREDEVOPS_ENABLE_PIPELINE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        definitionId: zCoerceNumber().describe("The pipeline definition ID"),
        sourceBranch: z.string().optional().describe("Source branch ref (e.g., 'refs/heads/main', 'refs/heads/feature/foo', 'refs/tags/v1.0.0'). Defaults to the pipeline's default branch if omitted."),
        sourceVersion: z.string().optional().describe("Commit SHA to build. If omitted, builds the tip of sourceBranch."),
        variables: z.record(z.string()).optional().describe("Runtime variables to pass"),
        parameters: z.record(z.any()).optional().describe("Template parameters for YAML pipelines"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, definitionId, sourceBranch, sourceVersion, variables, parameters }: any) => {
        try {
          const result = await ctx.pipelines.queueBuild(project, definitionId, sourceBranch, variables, parameters, sourceVersion);
          return { content: [{ type: "text", text: `Queued build for pipeline ${definitionId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error queuing build:", error);
          return { content: [{ type: "text", text: `Failed to queue build: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "cancel-build",
      "Cancel a running build. The build will finish its current task before stopping. (requires AZUREDEVOPS_ENABLE_PIPELINE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        buildId: zCoerceNumber().describe("The build ID to cancel"),
      },
      // Aborts an in-progress build (loses run progress; only re-creatable via retry-build) — treat as destructive.
      { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      async ({ project, buildId }: any) => {
        try {
          const result = await ctx.pipelines.cancelBuild(project, buildId);
          return { content: [{ type: "text", text: `Cancelled build ${buildId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error cancelling build:", error);
          return { content: [{ type: "text", text: `Failed to cancel build: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "retry-build",
      "Retry a failed build with the same configuration. Creates a new build with same definition, branch, and parameters. (requires AZUREDEVOPS_ENABLE_PIPELINE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        buildId: zCoerceNumber().describe("The failed build ID to retry"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, buildId }: any) => {
        try {
          const result = await ctx.pipelines.retryBuild(project, buildId);
          return { content: [{ type: "text", text: `Retried build ${buildId}, new build:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error retrying build:", error);
          return { content: [{ type: "text", text: `Failed to retry build: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "approve-stage",
      "Approve or reject a pipeline stage gate. Use list-pending-approvals to find approval IDs. (requires AZUREDEVOPS_ENABLE_PIPELINE_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        approvalId: z.string().describe("The approval ID (from list-pending-approvals)"),
        status: z.enum(["approved", "rejected"]).describe(
          descWithExamples("Whether to approve or reject", APPROVAL_STATUS_EXAMPLES)
        ),
        comment: z.string().optional().describe("Optional comment for the approval/rejection"),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, approvalId, status, comment }: any) => {
        try {
          const result = await ctx.pipelines.approveStage(project, approvalId, status, comment);
          return { content: [{ type: "text", text: `Stage ${status}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error approving stage:", error);
          return { content: [{ type: "text", text: `Failed to ${status} stage: ${error.message}` }] };
        }
      }
    );
    upsertCount++;
  }

  // ========================================
  // PIPELINE DELETE TOOLS (Tier 3)
  // ========================================
  if (ctx.tierFlags.enablePipelineDelete) {
    server.tool(
      "delete-pipeline",
      "DESTRUCTIVE: Delete a pipeline definition. This cannot be undone. (requires AZUREDEVOPS_ENABLE_PIPELINE_DELETE=true)",
      {
        project: z.string().describe("The project name"),
        definitionId: zCoerceNumber().describe("The pipeline definition ID to delete"),
      },
      { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      async ({ project, definitionId }: any) => {
        try {
          const result = await ctx.pipelines.deletePipelineDefinition(project, definitionId);
          return { content: [{ type: "text", text: `Deleted pipeline ${definitionId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error deleting pipeline:", error);
          return { content: [{ type: "text", text: `Failed to delete pipeline: ${error.message}` }] };
        }
      }
    );
    deleteCount++;
  }

  return { readonly: readonlyCount, upsert: upsertCount, delete: deleteCount };
}
