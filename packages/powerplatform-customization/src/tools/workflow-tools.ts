/**
 * Workflow Tools - 6 tools for workflow and automation management
 *
 * Tools: update-workflow-desc, update-flow-description, document-automation,
 *        deactivate-workflow, activate-workflow, document-workflow-safe
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';

export function registerWorkflowTools(server: any, ctx: ServiceContext): void {

server.tool(
  "update-workflow-desc",
  "Update a classic workflow's description field",
  {
    workflowId: z.string().describe("GUID of the workflow"),
    description: z.string().describe("New description content")
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ workflowId, description }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.updateWorkflowDescription(workflowId, description);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (error: any) {
      console.error("Error updating workflow description:", error);
      return { content: [{ type: "text", text: `Failed to update workflow description: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "update-flow-description",
  "Update a Power Automate flow's description field",
  {
    flowId: z.string().describe("GUID of the flow (workflowid)"),
    description: z.string().describe("New description content")
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ flowId, description }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.updateFlowDescription(flowId, description);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (error: any) {
      console.error("Error updating flow description:", error);
      return { content: [{ type: "text", text: `Failed to update flow description: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "document-automation",
  "Analyze a flow or workflow and update its description with YAML metadata (tables modified, trigger, actions)",
  {
    automationId: z.string().describe("GUID of the flow or workflow"),
    type: z.enum(['flow', 'workflow']).optional().describe("Type of automation (auto-detected if not provided)")
  },
  // Name reads like a query but it WRITES a YAML description back to the automation.
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ automationId, type }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.documentAutomation(automationId, type) as any;

      const actionSummary = result.analysis.actionCount > 0
        ? `${result.analysis.actionCount} actions${result.analysis.actions.length > 0 ? ': ' + result.analysis.actions.slice(0, 5).join(', ') + (result.analysis.actionCount > 5 ? '...' : '') : ''}`
        : 'none';

      const responseText = `Successfully documented automation

**Analysis:**
- Tables Modified: ${result.analysis.tablesModified.join(', ') || 'none'}
- Trigger: ${result.analysis.trigger}
- Trigger Fields: ${result.analysis.triggerFields.join(', ') || 'none'}
- Actions: ${actionSummary}

**Description Updated:** ${result.descriptionUpdated ? 'Yes' : 'No'}

**Previous Description:**
${result.previousDescription || '(empty)'}

**New Description:**
${result.newDescription}`;

      return {
        content: [{ type: "text", text: responseText }]
      };
    } catch (error: any) {
      console.error("Error documenting automation:", error);
      return { content: [{ type: "text", text: `Failed to document automation: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "deactivate-workflow",
  "Deactivate a workflow (set to Draft state). Required before modifying classic workflow definitions.",
  {
    workflowId: z.string().describe("GUID of the workflow to deactivate")
  },
  // Deactivating stops the workflow - treat as destructive.
  { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  async ({ workflowId }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.deactivateWorkflow(workflowId) as any;

      const responseText = `Workflow deactivated successfully

**Workflow:** ${result.workflowName}
**Previous State:** ${result.previousState}
**New State:** ${result.newState}

${result.previousState === 'Draft' ? 'Note: Workflow was already in Draft state' : ''}`;

      return {
        content: [{ type: "text", text: responseText }]
      };
    } catch (error: any) {
      console.error("Error deactivating workflow:", error);
      return { content: [{ type: "text", text: `Failed to deactivate workflow: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "activate-workflow",
  "Activate a workflow (set to Activated state). Use after modifying classic workflow definitions.",
  {
    workflowId: z.string().describe("GUID of the workflow to activate")
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ workflowId }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.activateWorkflow(workflowId) as any;

      const responseText = `Workflow activated successfully

**Workflow:** ${result.workflowName}
**Previous State:** ${result.previousState}
**New State:** ${result.newState}

${result.previousState === 'Activated' ? 'Note: Workflow was already in Activated state' : ''}`;

      return {
        content: [{ type: "text", text: responseText }]
      };
    } catch (error: any) {
      console.error("Error activating workflow:", error);
      return { content: [{ type: "text", text: `Failed to activate workflow: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "document-workflow-safe",
  "Safely document a workflow by automatically deactivating -> documenting -> reactivating. Atomic operation with rollback on failure. Recommended for classic workflows that require deactivation before modification.",
  {
    workflowId: z.string().describe("GUID of the workflow to document"),
    type: z.enum(['flow', 'workflow']).optional().describe("Type of automation (auto-detected if not provided)")
  },
  // Writes a description (deactivate→document→reactivate) - net mutating.
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ workflowId, type }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.documentWorkflowSafe(workflowId, type) as any;

      const actionSummary = result.analysis.actionCount > 0
        ? `${result.analysis.actionCount} actions${result.analysis.actions.length > 0 ? ': ' + result.analysis.actions.slice(0, 5).join(', ') + (result.analysis.actionCount > 5 ? '...' : '') : ''}`
        : 'none';

      const stateWarning = result.stateManagement.finalState.includes('WARNING')
        ? `\n\nWARNING: ${result.stateManagement.finalState}`
        : '';

      const responseText = `Successfully documented workflow

**Workflow:** ${result.workflowName}

**Analysis:**
- Tables Modified: ${result.analysis.tablesModified.join(', ') || 'none'}
- Trigger: ${result.analysis.trigger}
- Trigger Fields: ${result.analysis.triggerFields.join(', ') || 'none'}
- Actions: ${actionSummary}

**Description Updated:** ${result.descriptionUpdated ? 'Yes' : 'No'}

**State Management:**
- Initial State: ${result.stateManagement.initialState}
- Was Deactivated: ${result.stateManagement.wasDeactivated ? 'Yes' : 'No'}
- Was Reactivated: ${result.stateManagement.wasReactivated ? 'Yes' : 'No'}
- Final State: ${result.stateManagement.finalState}${stateWarning}

**Previous Description:**
${result.previousDescription || '(empty)'}

**New Description:**
${result.newDescription}`;

      return {
        content: [{ type: "text", text: responseText }]
      };
    } catch (error: any) {
      console.error("Error documenting workflow safely:", error);
      return { content: [{ type: "text", text: `Failed to document workflow: ${error.message}` }], isError: true };
    }
  }
);

}
