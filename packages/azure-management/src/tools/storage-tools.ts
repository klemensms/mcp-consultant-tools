import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, RESOURCE_GROUP_EXAMPLES, STORAGE_ACCOUNT_EXAMPLES } from '../tool-examples.js';

export function registerStorageTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'list-storage-accounts',
    'List all Storage Accounts in the subscription or resource group',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.storage.listStorageAccounts(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing storage accounts:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get-storage-account',
    'Get detailed information about a Storage Account',
    {
      name: z
        .string()
        .describe(descWithExamples('Storage account name', STORAGE_ACCOUNT_EXAMPLES)),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
      includeKeys: z
        .boolean()
        .optional()
        .describe('Include storage keys - requires elevated permissions (default: false)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.storage.getStorageAccount(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error getting storage account:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
