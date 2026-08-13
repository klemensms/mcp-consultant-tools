/**
 * Vault CLI Commands - maps to vault MCP tools:
 *   list-vaults, get-vault, create-vault, update-vault, delete-vault,
 *   grant-vault-permissions, update-vault-permissions, revoke-vault-permissions
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerVaultCommands(program: Command, ctx: ServiceContext): void {
  const vault = program.command('vault').description('1Password vault management');

  vault
    .command('list')
    .description('List all accessible vaults (filtered by OP_ALLOWED_VAULTS)')
    .action(async () => {
      try {
        const vaults = await ctx.vaults.listVaults();
        outputResult(
          {
            fileName: `vaults-list`,
            data: vaults,
            summary: `Found ${vaults.length} vault(s)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list vaults');
      }
    });

  vault
    .command('get <vaultId>')
    .description('Get vault details')
    .option('--accessors', 'Include accessor (group/user) info', false)
    .action(async (vaultId: string, opts: any) => {
      try {
        const result = await ctx.vaults.getVault(vaultId, opts.accessors);
        outputResult(
          {
            fileName: `vault-${vaultId}`,
            data: result,
            summary: `Vault '${vaultId}'${opts.accessors ? ' (with accessors)' : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get vault');
      }
    });

  vault
    .command('create <name>')
    .description('Create a new vault (requires OP_ENABLE_VAULT_ADMIN=true)')
    .option('--description <desc>', 'Vault description')
    .action(async (name: string, opts: any) => {
      try {
        ctx.checkVaultAdminEnabled();
        const result = await ctx.vaults.createVault(name, opts.description);
        outputResult(
          { persist: false,
            fileName: `created-vault`,
            data: result,
            summary: `Vault '${name}' created successfully`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'create vault');
      }
    });

  vault
    .command('update <vaultId>')
    .description('Update vault name or description (requires OP_ENABLE_VAULT_ADMIN=true)')
    .option('--name <name>', 'New vault name')
    .option('--description <desc>', 'New vault description')
    .action(async (vaultId: string, opts: any) => {
      try {
        ctx.checkVaultAdminEnabled();
        const changes: { name?: string; description?: string } = {};
        if (opts.name) changes.name = opts.name;
        if (opts.description) changes.description = opts.description;
        const result = await ctx.vaults.updateVault(vaultId, changes);
        outputResult(
          { persist: false,
            fileName: `updated-vault-${vaultId}`,
            data: result,
            summary: `Vault '${vaultId}' updated`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'update vault');
      }
    });

  vault
    .command('delete <vaultId>')
    .description('Permanently delete a vault (requires OP_ENABLE_VAULT_ADMIN=true)')
    .option('--confirm', 'Confirm deletion (required)', false)
    .action(async (vaultId: string, opts: any) => {
      try {
        ctx.checkVaultAdminEnabled();
        if (!opts.confirm) {
          process.stderr.write(
            `Delete vault requires --confirm flag.\n` +
            `You are about to permanently delete vault '${vaultId}' and ALL its items.\n` +
            `This operation cannot be undone.\n` +
            `To proceed, run again with --confirm.\n`
          );
          process.exit(1);
        }
        await ctx.vaults.deleteVault(vaultId);
        outputResult(
          { persist: false,
            fileName: `deleted-vault-${vaultId}`,
            data: { vaultId, deleted: true },
            summary: `Vault '${vaultId}' deleted`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'delete vault');
      }
    });

  vault
    .command('grant-permissions <vaultId> <grantsJson>')
    .description(
      'Grant group permissions on a vault (requires OP_ENABLE_VAULT_ADMIN=true). ' +
      'grantsJson: JSON array of {groupId, permissions[]} objects. ' +
      'Valid permissions: read, create, update, delete, share, manage'
    )
    .action(async (vaultId: string, grantsJson: string) => {
      try {
        ctx.checkVaultAdminEnabled();
        const groupPermissions = JSON.parse(grantsJson);
        await ctx.vaults.grantPermissions(vaultId, groupPermissions);
        outputResult(
          { persist: false,
            fileName: `grant-permissions-${vaultId}`,
            data: { vaultId, groupPermissions, granted: true },
            summary: `Permissions granted on vault '${vaultId}' for ${groupPermissions.length} group(s)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'grant vault permissions');
      }
    });

  vault
    .command('update-permissions <updatesJson>')
    .description(
      'Update group permissions across multiple vaults (requires OP_ENABLE_VAULT_ADMIN=true). ' +
      'updatesJson: JSON array of {vaultId, groupId, permissions[]} objects. ' +
      'Valid permissions: read, create, update, delete, share, manage'
    )
    .action(async (updatesJson: string) => {
      try {
        ctx.checkVaultAdminEnabled();
        const groupPermissions = JSON.parse(updatesJson);
        await ctx.vaults.updatePermissions(groupPermissions);
        outputResult(
          { persist: false,
            fileName: `update-permissions`,
            data: { groupPermissions, updated: true },
            summary: `Permissions updated for ${groupPermissions.length} vault/group combination(s)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'update vault permissions');
      }
    });

  vault
    .command('revoke-permissions <vaultId>')
    .description('Revoke all permissions for one or more groups on a vault (requires OP_ENABLE_VAULT_ADMIN=true)')
    .argument('<groupIds...>', 'Group IDs to revoke permissions for')
    .action(async (vaultId: string, groupIds: string[]) => {
      try {
        ctx.checkVaultAdminEnabled();
        await ctx.vaults.revokePermissions(vaultId, groupIds);
        outputResult(
          { persist: false,
            fileName: `revoke-permissions-${vaultId}`,
            data: { vaultId, groupIds, revoked: true },
            summary: `Permissions revoked for ${groupIds.length} group(s) on vault '${vaultId}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'revoke vault permissions');
      }
    });
}
