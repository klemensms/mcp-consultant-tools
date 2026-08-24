/**
 * Flow Tools - 11 tools for Power Automate flow management
 *
 * Tools: create-flow, delete-flow, clone-flow, activate-flow, deactivate-flow,
 *        create-flow-from-def, get-flow-def-template, update-flow-definition,
 *        get-flow-runs, cancel-flow-run, resubmit-flow-run
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, FLOW_TEMPLATE_EXAMPLES } from '../tool-examples.js';

export function registerFlowTools(server: any, ctx: ServiceContext): void {

server.tool(
  "create-flow",
  "Create a new Power Automate flow from an existing template flow. Uses template-based creation by copying an existing flow's definition and modifying it.",
  {
    name: z.string().describe("Display name for the new flow"),
    templateFlowId: z.string().describe("GUID of the template flow to copy from"),
    description: z.string().optional().describe("Description for the new flow"),
    state: z.enum(['draft', 'activated']).optional().describe("Initial state (default: draft)"),
    connectionReferenceMappings: z.record(z.string()).optional().describe(
      "Map of connection reference names to new connection IDs. Format: {'connectionRefName': 'newConnectionId'}"
    )
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ name, templateFlowId, description, state, connectionReferenceMappings }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.createFlow(name, templateFlowId, {
        description, state, connectionReferenceMappings
      }) as any;

      const responseText = `Flow created successfully

**Flow ID:** ${result.flowId}
**Flow Name:** ${result.flowName}
**State:** ${result.state}
**Connection References Updated:** ${result.connectionReferencesUpdated}
${result.warnings.length > 0 ? `\nWarnings:\n${result.warnings.map((w: string) => `- ${w}`).join('\n')}` : ''}

${result.state === 'draft' ? 'Use activate-flow to activate the flow when ready.' : ''}`;

      return { content: [{ type: "text", text: responseText }] };
    } catch (error: any) {
      console.error("Error creating flow:", error);
      return { content: [{ type: "text", text: `Failed to create flow: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete-flow",
  "Delete a Power Automate flow. WARNING: This is permanent and cannot be undone. Flow must be in Draft state before deletion. Use deactivate-flow first if active.",
  {
    flowId: z.string().describe("GUID of the flow to delete"),
    confirm: z.boolean().describe("Must be true to proceed (safety check). Set to true only after confirming with user.")
  },
  { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  async ({ flowId, confirm }: any) => {
    try {
      if (!confirm) {
        return {
          content: [{ type: "text", text: "Deletion cancelled: confirm parameter must be true to proceed" }],
          isError: true
        };
      }

      const service = ctx.pp;
      const result = await service.deleteFlow(flowId) as any;

      const responseText = `Flow deleted successfully

**Flow ID:** ${result.flowId}
**Flow Name:** ${result.flowName}
**Previous State:** ${result.previousState}

WARNING: This operation is permanent and cannot be undone.`;

      return { content: [{ type: "text", text: responseText }] };
    } catch (error: any) {
      console.error("Error deleting flow:", error);
      return { content: [{ type: "text", text: `Failed to delete flow: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "clone-flow",
  "Clone an existing Power Automate flow with a new name. Creates an exact copy in Draft state with optional connection reference updates.",
  {
    sourceFlowId: z.string().describe("GUID of the flow to clone"),
    newName: z.string().describe("Display name for the cloned flow"),
    description: z.string().optional().describe("Description for the cloned flow (defaults to original description)"),
    updateConnectionReferences: z.boolean().optional().describe("If true, update connection references using mappings (default: false)"),
    connectionReferenceMappings: z.record(z.string()).optional().describe(
      "Map of connection reference names to new connection IDs (only used if updateConnectionReferences=true)"
    )
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ sourceFlowId, newName, description, updateConnectionReferences, connectionReferenceMappings }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.cloneFlow(sourceFlowId, newName, {
        description, updateConnectionReferences, connectionReferenceMappings
      }) as any;

      const responseText = `Flow cloned successfully

**Source Flow:** ${result.sourceFlowName} (${result.sourceFlowId})
**New Flow ID:** ${result.newFlowId}
**New Flow Name:** ${result.newFlowName}
**State:** ${result.state}
**Connection References Updated:** ${result.connectionReferencesUpdated}

Use activate-flow to activate the cloned flow when ready.`;

      return { content: [{ type: "text", text: responseText }] };
    } catch (error: any) {
      console.error("Error cloning flow:", error);
      return { content: [{ type: "text", text: `Failed to clone flow: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "activate-flow",
  "Activate a Power Automate flow (set to Activated state). Flow must be valid and connections must be configured.",
  {
    flowId: z.string().describe("GUID of the flow to activate")
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ flowId }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.activateFlow(flowId) as any;

      const responseText = `Flow activated successfully

**Flow:** ${result.workflowName}
**Previous State:** ${result.previousState}
**New State:** ${result.newState}

${result.previousState === 'Activated' ? 'Note: Flow was already in Activated state' : ''}`;

      return { content: [{ type: "text", text: responseText }] };
    } catch (error: any) {
      console.error("Error activating flow:", error);
      return { content: [{ type: "text", text: `Failed to activate flow: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "deactivate-flow",
  "Deactivate a Power Automate flow (set to Draft state). Use before modifying flow definition or deleting.",
  {
    flowId: z.string().describe("GUID of the flow to deactivate")
  },
  // Deactivating stops the flow - treat as destructive.
  { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  async ({ flowId }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.deactivateFlow(flowId) as any;

      const responseText = `Flow deactivated successfully

**Flow:** ${result.workflowName}
**Previous State:** ${result.previousState}
**New State:** ${result.newState}

${result.previousState === 'Draft' ? 'Note: Flow was already in Draft state' : ''}`;

      return { content: [{ type: "text", text: responseText }] };
    } catch (error: any) {
      console.error("Error deactivating flow:", error);
      return { content: [{ type: "text", text: `Failed to deactivate flow: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "create-flow-from-def",
  "Create a new Power Automate flow from a clientdata JSON definition. " +
  "No template flow required - create flows from scratch. " +
  "Use get-flow-def-template to get starter templates.",
  {
    name: z.string().describe("Display name for the new flow"),
    clientData: z.string().describe(
      "Flow definition JSON (stringified). Must include 'properties.definition' with triggers and actions. " +
      "Use get-flow-def-template to get a starter template, then replace placeholders."
    ),
    description: z.string().optional().describe("Description for the new flow"),
    primaryEntity: z.string().optional().describe("Primary entity logical name (default: 'none')"),
    state: z.enum(['draft', 'activated']).optional().describe("Initial state (default: draft)")
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ name, clientData, description, primaryEntity, state }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.createFlowFromDefinition(name, clientData, {
        description, primaryEntity, state
      }) as any;

      const responseText = `Flow created successfully from definition

**Flow ID:** ${result.flowId}
**Flow Name:** ${result.flowName}
**State:** ${result.state}
${result.warnings.length > 0 ? `\nWarnings:\n${result.warnings.map((w: string) => `- ${w}`).join('\n')}` : ''}

${result.state === 'draft' ? 'Use activate-flow to activate the flow when ready.' : ''}`;

      return { content: [{ type: "text", text: responseText }] };
    } catch (error: any) {
      console.error("Error creating flow from definition:", error);
      return { content: [{ type: "text", text: `Failed to create flow from definition: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "get-flow-def-template",
  "Get a pre-built Power Automate flow definition template. " +
  "Templates include placeholders that must be replaced before use. " +
  "Use with create-flow-from-def to create flows from scratch.",
  {
    templateType: z.enum([
      'dataverse-on-create',
      'dataverse-on-update',
      'dataverse-on-delete',
      'dataverse-on-create-with-condition-and-update',
      'scheduled-recurrence',
      'manual-trigger',
      'http-request'
    ]).describe(
      descWithExamples("Type of flow template to retrieve", FLOW_TEMPLATE_EXAMPLES)
    )
  },
  // Returns a static local template - no external call.
  { readOnlyHint: true },
  async ({ templateType }: any) => {
    try {
      const service = ctx.pp;
      const template = service.getFlowDefinitionTemplate(templateType) as any;

      const placeholderDoc = template.placeholders.length > 0
        ? `\n\n**Placeholders to Replace:**\n${template.placeholders.map((p: any) =>
            `- \`${p.placeholder}\`: ${p.description} (e.g., \`${p.example}\`)`
          ).join('\n')}`
        : '';

      const connectionDoc = template.connectionReferences.length > 0
        ? `\n\n**Required Connections:**\n${template.connectionReferences.map((c: any) =>
            `- \`${c.name}\`: ${c.description}${c.required ? ' (required)' : ' (optional)'}`
          ).join('\n')}`
        : '\n\n**Required Connections:** None';

      const responseText = `Flow Template: **${template.name}**

**Description:** ${template.description}
${placeholderDoc}
${connectionDoc}

**Usage:**
1. Copy the clientData JSON below
2. Replace all {{PLACEHOLDER}} values with your actual values
3. Use create-flow-from-def with the modified JSON

---
**clientData JSON:**
\`\`\`json
${JSON.stringify(template.clientData, null, 2)}
\`\`\``;

      return { content: [{ type: "text", text: responseText }] };
    } catch (error: any) {
      console.error("Error getting flow definition template:", error);
      return { content: [{ type: "text", text: `Failed to get flow definition template: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "update-flow-definition",
  "Update an existing Power Automate flow's clientdata definition. " +
  "Automatically handles state management: deactivates flow if active, updates definition, then reactivates. " +
  "Use get-flow-definition to get current definition, modify it, then use this tool to apply changes.",
  {
    flowId: z.string().describe("GUID of the flow to update"),
    clientData: z.string().describe(
      "Updated flow definition JSON (stringified). Must include 'properties.definition' with triggers and actions. " +
      "Get the current definition using get-flow-definition, modify it, then pass it here."
    ),
    reactivate: z.boolean().optional().describe(
      "Auto-reactivate flow if it was active before update (default: true). " +
      "Set to false to leave flow in Draft state after update."
    ),
    validateDefinition: z.boolean().optional().describe(
      "Validate JSON structure before update (default: true). " +
      "Set to false to skip validation (use with caution)."
    )
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ flowId, clientData, reactivate, validateDefinition }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.updateFlowDefinition(flowId, clientData, {
        reactivate, validateDefinition
      }) as any;

      const warningsText = result.validationWarnings.length > 0
        ? `\n\nWarnings:\n${result.validationWarnings.map((w: string) => `- ${w}`).join('\n')}`
        : '';

      const responseText = `Flow definition updated successfully

**Flow ID:** ${result.flowId}
**Flow Name:** ${result.flowName}

**State Management:**
- Initial State: ${result.stateManagement.initialState}
- Was Deactivated: ${result.stateManagement.wasDeactivated ? 'Yes' : 'No'}
- Was Reactivated: ${result.stateManagement.wasReactivated ? 'Yes' : 'No'}
- Final State: ${result.stateManagement.finalState}${warningsText}`;

      return { content: [{ type: "text", text: responseText }] };
    } catch (error: any) {
      console.error("Error updating flow definition:", error);
      return { content: [{ type: "text", text: `Failed to update flow definition: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "get-flow-runs",
  "Get the run history for a specific Power Automate flow using the Management API. " +
  "Returns run status, timestamps, trigger info, and error details for failed runs. " +
  "Use this to investigate flow failures during incident triage.",
  {
    flowId: z.string().describe("GUID of the flow (workflowid)"),
    status: z.string().optional().describe("Filter by status: Succeeded, Failed, Running, Waiting, Cancelled"),
    startedAfter: z.string().optional().describe("Only return runs started after this date (ISO 8601 format, e.g., '2026-01-21T00:00:00Z')"),
    startedBefore: z.string().optional().describe("Only return runs started before this date (ISO 8601 format)"),
    maxRecords: z.number().optional().describe("Maximum number of runs to return (default: 50, max: 250)")
  },
  { readOnlyHint: true, openWorldHint: true },
  async ({ flowId, status, startedAfter, startedBefore, maxRecords }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.getFlowRuns(flowId, {
        status, startedAfter, startedBefore,
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
        content: [{
          type: "text",
          text: `Found ${result.totalCount} flow runs for flow ${flowId}${result.hasMore ? ` [TRUNCATED at ${result.totalCount} runs of an unknown total; this command caps at 250. Narrow the window with startedAfter/startedBefore]` : ''}:\n\nStats:\n- Succeeded: ${stats.succeeded}\n- Failed: ${stats.failed}\n- In Progress: ${stats.inProgress}\n- Cancelled: ${stats.cancelled}\n- Other: ${stats.other}${failedSummary}\n\nFilters Applied: ${JSON.stringify(result.filterApplied)}\n\n${resultStr}`
        }]
      };
    } catch (error: any) {
      console.error("Error getting flow runs:", error);
      return { content: [{ type: "text", text: `Failed to get flow runs: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "cancel-flow-run",
  "Cancel a running or waiting Power Automate flow run. " +
  "Cannot cancel flows that have already completed (Succeeded, Failed, or Cancelled). " +
  "Use get-flow-runs to find running flow instances.",
  {
    flowId: z.string().describe("GUID of the flow"),
    runId: z.string().describe("GUID of the flow run to cancel (from get-flow-runs)")
  },
  // Cancels an in-flight run.
  { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  async ({ flowId, runId }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.cancelFlowRun(flowId, runId) as any;

      const responseText = `Flow run cancelled successfully

**Flow ID:** ${result.flowId}
**Run ID:** ${result.runId}
**Previous Status:** ${result.previousStatus}
**New Status:** Cancelled`;

      return { content: [{ type: "text", text: responseText }] };
    } catch (error: any) {
      console.error("Error cancelling flow run:", error);
      return { content: [{ type: "text", text: `Failed to cancel flow run: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "resubmit-flow-run",
  "Resubmit/retry a failed Power Automate flow run using the original trigger inputs. " +
  "Creates a new flow run with the same input data as the original failed run. " +
  "Use get-flow-runs to find failed flow instances.",
  {
    flowId: z.string().describe("GUID of the flow"),
    runId: z.string().describe("GUID of the failed flow run to retry (from get-flow-runs)")
  },
  // Creates a new run from the original inputs - mutating.
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ flowId, runId }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.resubmitFlowRun(flowId, runId) as any;

      const responseText = `Flow run resubmitted successfully

**Flow ID:** ${result.flowId}
**Original Run ID:** ${result.originalRunId}
**New Run ID:** ${result.newRunId}
**Trigger Name:** ${result.triggerName}

Use get-flow-runs to check the status of the new run.`;

      return { content: [{ type: "text", text: responseText }] };
    } catch (error: any) {
      console.error("Error resubmitting flow run:", error);
      return { content: [{ type: "text", text: `Failed to resubmit flow run: ${error.message}` }], isError: true };
    }
  }
);

}
