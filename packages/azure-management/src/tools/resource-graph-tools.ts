import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  RESOURCE_GROUP_EXAMPLES,
  RESOURCE_TYPE_EXAMPLES,
  ARM_RESOURCE_ID_EXAMPLES,
  PRINCIPAL_ID_EXAMPLES,
  ROLE_DEFINITION_ID_EXAMPLES,
} from '../tool-examples.js';
import {
  MAX_RESULTS_CEILING,
  DEFAULT_MAX_RESULTS,
  DEFAULT_MAX_DIAGNOSTIC_RESOURCES,
  MAX_DIAGNOSTIC_RESOURCES_CEILING,
} from '../services/ResourceGraphService.js';

const maxResultsSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_RESULTS_CEILING)
  .optional()
  .describe(
    `Maximum rows to return (default: ${DEFAULT_MAX_RESULTS}, max: ${MAX_RESULTS_CEILING}). When 'truncated' is true, rows were left behind.`
  );

export function registerResourceGraphTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'list-network-security-groups',
    "List Network Security Groups with their security rules and subnet/NIC associations, via Azure Resource Graph. An NSG with no associations enforces nothing. 'truncated: true' means more NSGs exist than were returned.",
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
      associatedSubnet: z
        .string()
        .optional()
        .describe('Filter by associated subnet name or ID substring (applied to the rows returned)'),
      associatedNic: z
        .string()
        .optional()
        .describe('Filter by associated NIC name or ID substring (applied to the rows returned)'),
      maxResults: maxResultsSchema,
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.resourceGraph.listNetworkSecurityGroups(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing network security groups:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-role-assignments',
    "List Azure RBAC role assignments with resolved role names, via Azure Resource Graph. 'roleDefinitionName' is null when the role definition could not be read - check summary.unresolvedRoleNames rather than assuming the role is unknown to Azure.",
    {
      principalId: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by principal object ID (exact)', PRINCIPAL_ID_EXAMPLES)),
      roleDefinitionId: z
        .string()
        .optional()
        .describe(
          descWithExamples('Filter by role definition ID substring', ROLE_DEFINITION_ID_EXAMPLES)
        ),
      scope: z.string().optional().describe('Filter by exact assignment scope (ARM resource ID)'),
      maxResults: maxResultsSchema,
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.resourceGraph.listRoleAssignments(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing role assignments:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-private-endpoints',
    'List private endpoints with their target resource and connection status, via Azure Resource Graph. A connection status other than Approved means traffic is not flowing.',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
      targetResourceId: z
        .string()
        .optional()
        .describe('Filter by target resource ID substring (applied to the rows returned)'),
      maxResults: maxResultsSchema,
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.resourceGraph.listPrivateEndpoints(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing private endpoints:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'find-resource-consumers',
    'Find every resource whose configuration references a given ARM resource ID, and the property path that references it. Use before deleting or renaming a resource.',
    {
      resourceId: z
        .string()
        .describe(
          descWithExamples('Full ARM resource ID to find consumers of', ARM_RESOURCE_ID_EXAMPLES)
        ),
      maxResults: maxResultsSchema,
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.resourceGraph.findResourceConsumers(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error finding resource consumers:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-diagnostic-settings',
    "List Azure Monitor diagnostic settings across resources. Costs one API call per resource, so the fan-out is capped by maxResources. Resources listed under 'unreadableResources' could not be inspected (403/404) - they are NOT evidence that no diagnostic settings are configured.",
    {
      resourceIds: z
        .array(z.string())
        .optional()
        .describe(
          descWithExamples('Specific ARM resource IDs to inspect', ARM_RESOURCE_ID_EXAMPLES)
        ),
      resourceGroup: z
        .string()
        .optional()
        .describe(
          descWithExamples('Enumerate resources in this resource group', RESOURCE_GROUP_EXAMPLES)
        ),
      resourceType: z
        .string()
        .optional()
        .describe(descWithExamples('Enumerate resources of this type', RESOURCE_TYPE_EXAMPLES)),
      maxResources: z
        .number()
        .int()
        .min(1)
        .max(MAX_DIAGNOSTIC_RESOURCES_CEILING)
        .optional()
        .describe(
          `Maximum resources to inspect (default: ${DEFAULT_MAX_DIAGNOSTIC_RESOURCES}, max: ${MAX_DIAGNOSTIC_RESOURCES_CEILING})`
        ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.resourceGraph.listDiagnosticSettings(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing diagnostic settings:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get-resource-relationships',
    'Map a resource\'s relationships: what shares its subnet and VNet, what references it, and what it references. Complements find-resource-consumers with network adjacency.',
    {
      resourceId: z
        .string()
        .describe(descWithExamples('Full ARM resource ID', ARM_RESOURCE_ID_EXAMPLES)),
      maxResults: maxResultsSchema,
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.resourceGraph.getResourceRelationships(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error getting resource relationships:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
