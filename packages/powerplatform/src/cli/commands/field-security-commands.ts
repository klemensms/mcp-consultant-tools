/**
 * Field Security CLI Commands (read-only) - 3 commands
 * Subcommand group: `fsp`
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerFieldSecurityCommands(program: Command, ctx: ServiceContext): void {
  const fsp = program.command('fsp').description('Field Security Profiles (read-only)');

  fsp
    .command('list')
    .description('List Field Security Profiles')
    .option('-n, --name-pattern <substring>', 'Filter by name substring')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.listFieldSecurityProfiles(opts.namePattern);
        outputResult(
          {
            fileName: 'field-security-profiles',
            data: result,
            summary: `Field security profiles: ${result.length} found`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list field security profiles');
      }
    });

  fsp
    .command('get <id>')
    .description('Get an FSP with permissions and assignments')
    .action(async (id: string) => {
      try {
        const result = await ctx.pp.getFieldSecurityProfile(id);
        outputResult(
          {
            fileName: `field-security-profile-${id}`,
            data: result,
            summary: `FSP "${result.name}" — ${result.permissions.length} permissions, ${result.teams.length} teams, ${result.users.length} users`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get field security profile');
      }
    });

  fsp
    .command('secured-columns <entity>')
    .description('List all secured columns on an entity with FSP coverage')
    .action(async (entity: string) => {
      try {
        const result = await ctx.pp.getSecuredColumns(entity);
        outputResult(
          {
            fileName: `secured-columns-${entity}`,
            data: result,
            summary: `Secured columns on ${entity}: ${result.length} found`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get secured columns');
      }
    });
}
