/**
 * Build Tools - 3 tools for build troubleshooting
 *
 * NOTE: These tools are duplicated in azure-devops-admin package.
 * If you update these, also update packages/azure-devops-admin/src/index.ts
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';

export function registerBuildTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-build-status",
    "Get build status and details. Use detail='summary' for basic status, 'timeline' for step breakdown (default scope='problems' shows only failed/warning items), or 'full' for logs. The timelineScope controls what records are included: 'problems' (default, only errors/warnings), 'stages' (minimal), 'jobs' (moderate), 'all' (everything).",
    {
      project: z.string().describe("The project name"),
      buildId: zCoerceNumber().describe("The build ID"),
      detail: z.enum(["summary", "timeline", "full"]).optional().describe("Level of detail: 'summary' (default), 'timeline' (include steps), or 'full' (include logs)"),
      timelineScope: z.enum(["stages", "jobs", "all", "problems"]).optional().describe("Timeline scope: 'problems' (default, only errors/warnings/failures), 'stages' (minimal), 'jobs' (moderate), 'all' (everything - may be large)"),
      maxIssues: zCoerceNumber().optional().describe("Maximum issues per record (default: 5, prioritizes errors over warnings)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, buildId, detail, timelineScope, maxIssues }: any) => {
      try {
        const result = await ctx.build.getBuildStatus(project, buildId, detail || 'summary', timelineScope || 'problems', maxIssues || 5);
        return { content: [{ type: "text", text: `Build ${buildId} status:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting build status:", error);
        return { content: [{ type: "text", text: `Failed to get build status: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "get-build-timeline",
    "Get step-by-step breakdown of a build. Shows stages, jobs, and tasks with timing, status, and error/warning counts. Use scope to control output size: 'problems' (default, only errors/warnings), 'stages' (minimal), 'jobs' (moderate), 'all' (everything). Always includes summary stats regardless of scope.",
    {
      project: z.string().describe("The project name"),
      buildId: zCoerceNumber().describe("The build ID"),
      scope: z.enum(["stages", "jobs", "all", "problems"]).optional().describe("Filter scope: 'problems' (default, only errors/warnings/failures), 'stages' (minimal), 'jobs' (moderate), 'all' (everything - may be large)"),
      maxIssues: zCoerceNumber().optional().describe("Maximum issues per record (default: 5, prioritizes errors over warnings)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, buildId, scope, maxIssues }: any) => {
      try {
        const result = await ctx.build.getBuildTimeline(project, buildId, scope || 'problems', maxIssues || 5);
        return { content: [{ type: "text", text: `Build ${buildId} timeline:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting build timeline:", error);
        return { content: [{ type: "text", text: `Failed to get build timeline: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "get-build-logs",
    "Get build logs. Without logId, returns list of available logs with line counts. With logId, returns that log's content filtered by mode to reduce noise from progress indicators.",
    {
      project: z.string().describe("The project name"),
      buildId: zCoerceNumber().describe("The build ID"),
      logId: zCoerceNumber().optional().describe("Optional specific log ID to retrieve content"),
      mode: z.enum(['summary', 'full', 'errors']).optional().describe(
        "Filter mode: 'summary' (default) removes progress indicators like 'Receiving objects: 1%', 'full' returns everything, 'errors' shows only errors/warnings"
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, buildId, logId, mode }: any) => {
      try {
        const result = await ctx.build.getBuildLogs(project, buildId, logId, mode || 'summary');
        return { content: [{ type: "text", text: `Build ${buildId} logs:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting build logs:", error);
        return { content: [{ type: "text", text: `Failed to get build logs: ${error.message}` }] };
      }
    }
  );
}
