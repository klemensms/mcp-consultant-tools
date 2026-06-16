import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, RESOURCE_GROUP_EXAMPLES, KEY_VAULT_NAME_EXAMPLES } from '../tool-examples.js';

export function registerKeyVaultTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'list-key-vaults',
    'List all Key Vaults in the subscription or resource group',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.keyVaults.listKeyVaults(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing key vaults:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get-key-vault',
    'Get detailed information about a Key Vault',
    {
      name: z.string().describe(descWithExamples('Key Vault name', KEY_VAULT_NAME_EXAMPLES)),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
      includeAccessPolicies: z.boolean().optional().describe('Include access policies (default: true)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.keyVaults.getKeyVault(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error getting key vault:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-key-vault-secrets',
    'List secret names (NOT values) in a Key Vault. Requires Key Vault Secrets User role.',
    {
      vaultName: z.string().describe(descWithExamples('Key Vault name', KEY_VAULT_NAME_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.keyVaults.listKeyVaultSecrets(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing key vault secrets:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
