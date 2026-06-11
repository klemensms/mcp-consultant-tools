/**
 * Storage CLI Commands - 2 commands mapping to storage MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerStorageCommands(program: Command, ctx: ServiceContext): void {
  const storage = program.command('storage').description('Azure Storage operations');

  storage
    .command('list')
    .description('List all Storage Accounts in the subscription or resource group')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.storage.listStorageAccounts({
          resourceGroup: opts.resourceGroup,
        });
        const count = result.summary?.total ?? '?';
        outputResult(
          { fileName: 'storage-accounts-list', data: result, summary: `Found ${count} Storage Account(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list storage accounts'); }
    });

  storage
    .command('get')
    .description('Get detailed information about a Storage Account')
    .argument('<accountName>', 'Storage account name')
    .option('-g, --resource-group <name>', 'Resource group')
    .option('--include-keys', 'Include storage keys (requires elevated permissions)')
    .action(async (accountName: string, opts: any) => {
      try {
        const result = await ctx.management.storage.getStorageAccount({
          name: accountName,
          resourceGroup: opts.resourceGroup,
          includeKeys: opts.includeKeys,
        });
        outputResult(
          { fileName: `storage-account-${accountName}`, data: result, summary: `Storage Account '${accountName}' details` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get storage account'); }
    });
}
