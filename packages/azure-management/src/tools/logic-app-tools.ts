import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, RESOURCE_GROUP_EXAMPLES } from '../tool-examples.js';

export function registerLogicAppTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'list-logic-app-workflows',
    'List Logic App workflows (Microsoft.Logic/workflows). Quote summary.enabled rather than summary.total as live integration: a workflow in state Disabled runs nothing. definition and parameters are withheld from every row by default and named in propertiesWithheld, so their absence is never evidence a workflow has none; triggerNames, actionCount and parameterNames are derived before withholding, so the review signal survives. A workflow being Enabled says nothing about the API connections it runs through - pair this with list-api-connections.',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
      includeDefinition: z
        .boolean()
        .optional()
        .describe(
          'Return the full definition and parameters blocks instead of withholding them (default: false; parameters can carry securestring values)'
        ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.logicApps.listWorkflows(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing logic app workflows:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-api-connections',
    'List API connections (Microsoft.Web/connections) - the credential-holding resources Logic App workflows reach connectors through. ARM ships NO subscription-wide list for this type, so without a resourceGroup this sweeps every resource group and the count is only as complete as that sweep: summary.complete is false and summary.note says so whenever a group refused. A connection whose status is not Connected is counted in summary.broken with the reason in statusError, because a workflow using it fails at run time while still reporting state Enabled. parameterValues is redacted to its keys unless AZURE_REDACT_SECRETS=false.',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(
          descWithExamples(
            'Ask one resource group directly instead of sweeping all of them',
            RESOURCE_GROUP_EXAMPLES
          )
        ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.logicApps.listApiConnections(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing api connections:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
