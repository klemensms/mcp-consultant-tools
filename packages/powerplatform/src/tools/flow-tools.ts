/**
 * Flow Tools - 9 tools for flow/workflow/business rule inspection
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENTITY_NAME_EXAMPLES, FLOW_CATEGORY_EXAMPLES, STATECODE_EXAMPLES, FLOW_RUN_STATUS_EXAMPLES } from '../tool-examples.js';

export function registerFlowTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-flows",
    "Get Power Automate cloud flows. By default excludes non-custom flows (Customer Insights CXP_, SYSTEM, Copilot for Sales) to show only custom flows. Use exclude* parameters to override. Returns summary info only - use get-flow-definition for full flow details.",
    {
      activeOnly: z.boolean().optional().describe("Only return activated flows (default: false)"),
      maxRecords: z.number().optional().describe("Maximum number of flows to return (default: 25)"),
      excludeCustomerInsights: z.boolean().optional().describe("Exclude Customer Insights flows (CXP_ prefix) (default: true)"),
      excludeSystem: z.boolean().optional().describe("Exclude SYSTEM-modified flows (default: true)"),
      excludeCopilotSales: z.boolean().optional().describe("Exclude Copilot for Sales flows (default: true)"),
      nameContains: z.string().optional().describe("Filter flows by name (case-insensitive contains)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ activeOnly, maxRecords, excludeCustomerInsights, excludeSystem, excludeCopilotSales, nameContains }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getFlows({
          activeOnly: activeOnly ?? false,
          maxRecords: maxRecords ?? 25,
          excludeCustomerInsights: excludeCustomerInsights ?? true,
          excludeSystem: excludeSystem ?? true,
          excludeCopilotSales: excludeCopilotSales ?? true,
          nameContains,
        });

        const resultStr = JSON.stringify(result, null, 2);

        let message = `Found ${result.totalCount} Power Automate flows`;

        if (result.excluded.total > 0) {
          const exclusions: string[] = [];
          if (result.excluded.system > 0) {
            exclusions.push(`${result.excluded.system} SYSTEM`);
          }
          if (result.excluded.copilotSales > 0) {
            exclusions.push(`${result.excluded.copilotSales} Copilot for Sales`);
          }
          message += ` (excluded: ${exclusions.join(', ')})`;
        }

        if (result.filterApplied.excludeCustomerInsights) {
          message += '\nNote: Customer Insights (CXP_) flows filtered server-side';
        }

        if (result.hasMore) {
          message += `\n⚠️ More flows available - increase maxRecords (currently ${result.requestedMax}) to retrieve more`;
        }

        return {
          content: [
            {
              type: "text",
              text: `${message}:\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting flows:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get flows: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "search-workflows",
    "Search workflows (both classic workflows and Power Automate flows) with flexible filtering. Supports searching by name, entity, description, category, and state. Useful for finding documented workflows (search description for 'AUTO-DOCS'), finding workflows by entity, or locating specific workflows by name.",
    {
      name: z.string().optional().describe("Filter by workflow name (case-insensitive partial match)"),
      primaryEntity: z.string().optional().describe(
        descWithExamples("Filter by primary entity logical name", ENTITY_NAME_EXAMPLES)
      ),
      description: z.string().optional().describe("Search in description field (e.g., 'AUTO-DOCS:v1' for documented workflows)"),
      category: z.number().optional().describe(
        descWithExamples("Filter by workflow category", FLOW_CATEGORY_EXAMPLES)
      ),
      statecode: z.number().optional().describe(
        descWithExamples("Filter by state", STATECODE_EXAMPLES)
      ),
      includeDescription: z.boolean().optional().describe("Include full description field in results (default: true)"),
      maxResults: z.number().optional().describe("Maximum number of workflows to return (default: 50, max: 1000)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ name, primaryEntity, description, category, statecode, includeDescription, maxResults }: any) => {
      try {
        const service = ctx.pp;
        const validatedMaxResults = maxResults ? Math.min(maxResults, 1000) : 50;

        const result = await service.searchWorkflows({
          name,
          primaryEntity,
          description,
          category,
          statecode,
          includeDescription: includeDescription ?? true,
          maxResults: validatedMaxResults,
        });

        const resultStr = JSON.stringify(result, null, 2);

        let message = `Found ${result.totalCount} workflow(s)`;

        const filters: string[] = [];
        if (name) filters.push(`name contains '${name}'`);
        if (primaryEntity) filters.push(`entity = '${primaryEntity}'`);
        if (description) filters.push(`description contains '${description}'`);
        if (category !== undefined) filters.push(`category = ${category}`);
        if (statecode !== undefined) filters.push(`state = ${statecode}`);

        if (filters.length > 0) {
          message += ` matching: ${filters.join(', ')}`;
        }

        if (result.hasMore) {
          message += `\n⚠️ More workflows available - increase maxResults (currently ${result.requestedMax}) to retrieve more`;
        }

        return {
          content: [
            {
              type: "text",
              text: `${message}:\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error searching workflows:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to search workflows: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "get-flow-definition",
    "Get the definition of a specific Power Automate flow. Use summary=true to get a parsed summary (trigger, actions, connectors) instead of the full JSON definition.",
    {
      flowId: z.string().describe("The GUID of the flow (workflowid)"),
      summary: z.boolean().optional().describe("Return parsed summary instead of full definition (default: false). Recommended for initial analysis to reduce response size."),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ flowId, summary }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getFlowDefinition(flowId, summary || false);
        const resultStr = JSON.stringify(result, null, 2);

        let message = `Flow definition for '${(result as any).name}'`;
        if (summary) {
          message += ' (summary mode)';
        }

        return {
          content: [
            {
              type: "text",
              text: `${message}:\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting flow definition:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get flow definition: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-flow-runs",
    "Get the run history for a specific Power Automate flow using the Management API. Returns run status, timestamps, trigger info, and error details for failed runs. Use this to investigate flow failures during incident triage.",
    {
      flowId: z.string().describe("The GUID of the flow (workflowid)"),
      status: z.string().optional().describe(
        descWithExamples("Filter by run status", FLOW_RUN_STATUS_EXAMPLES)
      ),
      startedAfter: z.string().optional().describe("Only return runs started after this date (ISO 8601 format, e.g., '2026-01-21T00:00:00Z')"),
      startedBefore: z.string().optional().describe("Only return runs started before this date (ISO 8601 format)"),
      maxRecords: z.number().optional().describe("Maximum number of runs to return (default: 50, max: 250)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ flowId, status, startedAfter, startedBefore, maxRecords }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getFlowRuns(flowId, {
          status,
          startedAfter,
          startedBefore,
          maxRecords: maxRecords || 50,
        });

        const stats = (result.runs || []).reduce((acc: any, run: any) => {
          if (run.status === 'Succeeded') acc.succeeded++;
          else if (run.status === 'Failed' || run.status === 'Faulted' || run.status === 'TimedOut') acc.failed++;
          else if (run.status === 'Running' || run.status === 'Waiting') acc.inProgress++;
          else if (run.status === 'Cancelled') acc.cancelled++;
          else acc.other++;
          return acc;
        }, { succeeded: 0, failed: 0, inProgress: 0, cancelled: 0, other: 0 });

        const failedRuns = result.runs.filter((r: any) => r.status === 'Failed' || r.error);
        const failedSummary = failedRuns.length > 0
          ? `\n\nFailed Runs (${failedRuns.length}):\n` + failedRuns.map((r: any) =>
              `  - ${r.runId}: ${r.error?.message || 'Unknown error'} (${r.startTime})`
            ).join('\n')
          : '';

        const resultStr = JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `Found ${result.totalCount} flow runs for flow ${flowId}${result.hasMore ? ' (more available)' : ''}:\n\nStats:\n- Succeeded: ${stats.succeeded}\n- Failed: ${stats.failed}\n- In Progress: ${stats.inProgress}\n- Cancelled: ${stats.cancelled}\n- Other: ${stats.other}${failedSummary}\n\nFilters Applied: ${JSON.stringify(result.filterApplied)}\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting flow runs:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get flow runs: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-flow-run-details",
    "Get detailed action-level execution information for a specific Power Automate flow run to verify which business logic steps were executed",
    {
      flowId: z.string().describe("The GUID of the flow (workflowid)"),
      runId: z.string().describe("The GUID of the flow run (flowrunid) - get this from get-flow-runs tool"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ flowId, runId }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getFlowRunDetails(flowId, runId);
        const resultStr = JSON.stringify(result, null, 2);

        const r = result as any;
        const actionsList = Object.entries(r.actions || {})
          .map(([name, action]: [string, any]) => {
            const statusIcon = action.status === 'Succeeded' ? '✓' : action.status === 'Failed' ? '✗' : action.status === 'Skipped' ? '⊘' : '?';
            return `  ${statusIcon} ${name}: ${action.status}${action.error ? ' - ' + JSON.stringify(action.error) : ''}`;
          })
          .join('\n');

        return {
          content: [
            {
              type: "text",
              text: `Flow Run Details for ${flowId}/${runId}:\n\nOverall Status: ${r.status}\nStart Time: ${r.startTime}\nEnd Time: ${r.endTime}\n\nTrigger:\n  Name: ${r.trigger?.name}\n  Status: ${r.trigger?.status}\n\nActions Summary:\n- Total: ${r.actionsSummary?.total}\n- Succeeded: ${r.actionsSummary?.succeeded}\n- Failed: ${r.actionsSummary?.failed}\n- Skipped: ${r.actionsSummary?.skipped}\n- Other: ${r.actionsSummary?.other}\n\nAction Execution Details:\n${actionsList}\n\nFull JSON Response:\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting flow run details:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get flow run details: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-workflows",
    "Get a list of classic Dynamics workflows in the environment. Returns summary info only - use get-workflow-definition for full XAML.",
    {
      activeOnly: z.boolean().optional().describe("Only return activated workflows (default: false)"),
      maxRecords: z.number().optional().describe("Maximum number of workflows to return (default: 25)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ activeOnly, maxRecords }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getWorkflows(activeOnly || false, maxRecords || 25);
        const resultStr = JSON.stringify(result, null, 2);

        let message = `Found ${result.totalCount} classic Dynamics workflows`;
        if (result.hasMore) {
          message += `\n⚠️ More workflows available - increase maxRecords (currently ${result.requestedMax}) to retrieve more`;
        }

        return {
          content: [
            {
              type: "text",
              text: `${message}:\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting workflows:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get workflows: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-workflow-definition",
    "Get the definition of a specific classic Dynamics workflow. Use summary=true to get a parsed summary (activities, conditions, email sends) instead of raw XAML.",
    {
      workflowId: z.string().describe("The GUID of the workflow (workflowid)"),
      summary: z.boolean().optional().describe("Return parsed summary instead of full XAML (default: false). Recommended for initial analysis to reduce response size."),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ workflowId, summary }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getWorkflowDefinition(workflowId, summary || false);
        const resultStr = JSON.stringify(result, null, 2);

        let message = `Workflow definition for '${(result as any).name}'`;
        if (summary) {
          message += ' (summary mode)';
        }

        return {
          content: [
            {
              type: "text",
              text: `${message}:\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting workflow definition:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get workflow definition: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-business-rules",
    "Get a list of all business rules in the environment (read-only for troubleshooting)",
    {
      activeOnly: z.boolean().optional().describe("Only return activated business rules (default: false)"),
      maxRecords: z.number().optional().describe("Maximum number of business rules to return (default: 100)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ activeOnly, maxRecords }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getBusinessRules(activeOnly || false, maxRecords || 100);
        const resultStr = JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `Found ${result.totalCount} business rules:\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting business rules:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get business rules: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-business-rule",
    "Get the complete definition of a specific business rule including its XAML (read-only for troubleshooting)",
    {
      workflowId: z.string().describe("The GUID of the business rule (workflowid)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ workflowId }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getBusinessRule(workflowId);
        const resultStr = JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `Business rule definition for '${(result as any).name}':\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting business rule:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get business rule: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
