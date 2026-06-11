import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  RESOURCE_TYPE_EXAMPLES,
  RESOURCE_GROUP_EXAMPLES,
  RESOURCE_GRAPH_EXAMPLES,
} from '../tool-examples.js';

export function registerResourceTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'list-resources',
    'List all Azure resources in the subscription or resource group with filtering',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
      resourceType: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource type', RESOURCE_TYPE_EXAMPLES)),
      tagFilter: z
        .string()
        .optional()
        .describe("OData filter for tags (e.g., \"tagName eq 'env' and tagValue eq 'dev'\")"),
      nameContains: z.string().optional().describe('Filter resources by name substring'),
      maxResults: z.number().optional().describe('Maximum results to return (default: 100)'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.resources.listResources(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing resources:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get-resource',
    'Get detailed information about a specific Azure resource. By default filters out null properties to reduce token usage.',
    {
      resourceId: z
        .string()
        .optional()
        .describe('Full ARM resource ID (preferred) - use this OR name+type+resourceGroup'),
      resourceGroup: z.string().optional().describe('Resource group name (if not using resourceId)'),
      resourceType: z
        .string()
        .optional()
        .describe(
          descWithExamples('Resource type (if not using resourceId)', RESOURCE_TYPE_EXAMPLES)
        ),
      resourceName: z.string().optional().describe('Resource name (if not using resourceId)'),
      includeAllProperties: z
        .boolean()
        .optional()
        .describe('Include all properties including nulls (default: false - filters out null/empty values)'),
    },
    async (args: any) => {
      try {
        const options = { includeAllProperties: args.includeAllProperties };
        let result;
        if (args.resourceId) {
          result = await ctx.management.resources.getResource(args.resourceId, options);
        } else if (args.resourceGroup && args.resourceType && args.resourceName) {
          result = await ctx.management.resources.getResourceByName(
            args.resourceGroup,
            args.resourceType,
            args.resourceName,
            options
          );
        } else {
          throw new Error(
            'Provide either resourceId OR (resourceGroup + resourceType + resourceName)'
          );
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error getting resource:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-resource-groups',
    'List all resource groups in the subscription',
    {
      tagFilter: z.string().optional().describe('OData filter for tags'),
      nameContains: z.string().optional().describe('Filter by name substring'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.resources.listResourceGroups(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing resource groups:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'query-resource-graph',
    'Run Azure Resource Graph queries for advanced resource searching',
    {
      query: z.string().describe(descWithExamples('KQL-like query', RESOURCE_GRAPH_EXAMPLES)),
      subscriptions: z
        .array(z.string())
        .optional()
        .describe('Subscription IDs to query (defaults to current subscription)'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.resources.queryResourceGraph(args.query, args.subscriptions);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error querying resource graph:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get-resource-tags',
    'Get tags for a specific resource',
    {
      resourceId: z.string().describe('Full ARM resource ID'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.resources.getResourceTags(args.resourceId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error getting resource tags:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-locations',
    'List available Azure locations. By default returns only recommended physical regions with minimal data to reduce token usage.',
    {
      regionCategory: z
        .enum(['Recommended', 'Other', 'all'])
        .optional()
        .describe("Filter by region category (default: 'Recommended' - excludes staging/logical regions)"),
      geographyGroup: z
        .string()
        .optional()
        .describe("Filter by geography (e.g., 'Europe', 'US', 'Asia Pacific', 'UK')"),
      includeMetadata: z
        .boolean()
        .optional()
        .describe('Include full metadata with coordinates and paired regions (default: false)'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.resources.listLocations(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing locations:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
