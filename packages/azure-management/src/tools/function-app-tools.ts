import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  RESOURCE_GROUP_EXAMPLES,
  FUNCTION_APP_NAME_EXAMPLES,
} from '../tool-examples.js';

export function registerFunctionAppTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'list-function-apps',
    'List all Azure Function Apps in the subscription or resource group',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
      includeConfiguration: z.boolean().optional().describe('Include app settings (default: false)'),
      includeSlots: z.boolean().optional().describe('Include deployment slots (default: false)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.functionApps.listFunctionApps(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing function apps:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get-function-app',
    'Get detailed information about a specific Function App',
    {
      name: z
        .string()
        .describe(descWithExamples('Function App name', FUNCTION_APP_NAME_EXAMPLES)),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
      includeConfiguration: z.boolean().optional().describe('Include app settings (default: true)'),
      includeFunctions: z.boolean().optional().describe('List all functions (default: true)'),
      includeDeployments: z.boolean().optional().describe('Include recent deployments (default: false)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.functionApps.getFunctionApp(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error getting function app:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-functions',
    'List all functions within a Function App',
    {
      functionAppName: z
        .string()
        .describe(descWithExamples('Function App name', FUNCTION_APP_NAME_EXAMPLES)),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.functionApps.listFunctions(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing functions:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get-function-keys',
    'Get function and host keys for a Function App (requires Website Contributor role)',
    {
      functionAppName: z
        .string()
        .describe(descWithExamples('Function App name', FUNCTION_APP_NAME_EXAMPLES)),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
      functionName: z.string().optional().describe('Specific function name (omit for host keys only)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.functionApps.getFunctionKeys(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error getting function keys:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
