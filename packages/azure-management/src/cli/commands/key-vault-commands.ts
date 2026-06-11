/**
 * Key Vault CLI Commands - 3 commands mapping to key vault MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerKeyVaultCommands(program: Command, ctx: ServiceContext): void {
  const keyVault = program.command('key-vault').description('Azure Key Vault operations');

  keyVault
    .command('list')
    .description('List all Key Vaults in the subscription or resource group')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.keyVaults.listKeyVaults({
          resourceGroup: opts.resourceGroup,
        });
        const count = result.summary?.total ?? '?';
        outputResult(
          { fileName: 'key-vaults-list', data: result, summary: `Found ${count} Key Vault(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list key vaults'); }
    });

  keyVault
    .command('get')
    .description('Get detailed information about a Key Vault')
    .argument('<vaultName>', 'Key Vault name')
    .option('-g, --resource-group <name>', 'Resource group')
    .option('--include-access-policies', 'Include access policies (default: true)')
    .action(async (vaultName: string, opts: any) => {
      try {
        const result = await ctx.management.keyVaults.getKeyVault({
          name: vaultName,
          resourceGroup: opts.resourceGroup,
          includeAccessPolicies: opts.includeAccessPolicies,
        });
        outputResult(
          { fileName: `key-vault-${vaultName}`, data: result, summary: `Key Vault '${vaultName}' details` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get key vault'); }
    });

  keyVault
    .command('secrets')
    .description('List secret names (NOT values) in a Key Vault')
    .argument('<vaultName>', 'Key Vault name')
    .action(async (vaultName: string) => {
      try {
        const result = await ctx.management.keyVaults.listKeyVaultSecrets({
          vaultName,
        });
        const count = result.summary?.total ?? '?';
        outputResult(
          { fileName: `key-vault-secrets-${vaultName}`, data: result, summary: `Found ${count} secret(s) in '${vaultName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list key vault secrets'); }
    });
}
