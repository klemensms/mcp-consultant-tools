import { z } from 'zod';
import type { ServiceContext } from '../types.js';

const TOOL_DESCRIPTION = `Set the audit engagement context for subsequent MCP tool calls against this client environment. Audit-on environments (\`MCP_AUDIT_LEVEL=lean\` or \`full\`) require this to be set before any data-access tool calls.

Pass \`workItemIds\` as an array of ADO work item identifiers. Where focus is clear (one specific item), pass a single-element array \`["Acme-12345"]\`. Where work spans related items (a user story plus its sub-tasks, or several overlapping bugs you're trying to disambiguate between), list all related items - accurately reflecting ambiguity is forensically better than picking one arbitrarily.

If no ADO work item exists yet, strongly recommend to the user that they create a placeholder one (free-text body is fine - the ID matters; can be closed or converted to a user story / bug later if anything emerges from this work). Pass \`["exploration"]\` only as a last resort for genuine pre-ticket investigation; this is allowed but is challenged by compliance review post-hoc.

Re-call this tool whenever conversation focus shifts to a different bug or work item - every tool call from that point forward will be audited under the new context.`;

export function registerAuditTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'set-audit-engagement',
    TOOL_DESCRIPTION,
    {
      workItemIds: z
        .array(z.string().min(1).max(200))
        .min(1)
        .max(50)
        .describe('Array of ADO work item IDs (or ["exploration"] as a last resort). Up to 50 IDs, each up to 200 chars.'),
      reason: z
        .string()
        .max(2000)
        .optional()
        .describe('Optional free-text reason for this engagement context. Max 2000 chars.'),
    },
    // Sets local/session audit-engagement state only; no external API call → no openWorldHint.
    { readOnlyHint: false, destructiveHint: false },
    async ({ workItemIds, reason }: { workItemIds: string[]; reason?: string }) => {
      if (!ctx.audit) {
        return {
          content: [{ type: 'text', text: 'Audit subsystem disabled (MCP_AUDIT_LEVEL=off). No engagement to set.' }],
        };
      }
      try {
        await ctx.audit.setEngagement(workItemIds, reason);
        const list = workItemIds.join(', ');
        return {
          content: [{ type: 'text', text: `✓ Audit engagement set to: ${list}${reason ? ` - ${reason}` : ''}` }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `❌ Failed to set audit engagement: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
