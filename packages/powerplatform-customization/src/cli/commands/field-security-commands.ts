/**
 * Field Security CLI commands - parity with field-security-tools.ts
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

type Permission = 'Allowed' | 'NotAllowed';

function parsePermission(value: string): Permission {
  if (value !== 'Allowed' && value !== 'NotAllowed') {
    throw new Error(`Invalid permission '${value}'. Use 'Allowed' or 'NotAllowed'.`);
  }
  return value;
}

export function registerFieldSecurityCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('set-column-secured')
    .description('Toggle the IsSecured flag on a column (publishes by default)')
    .requiredOption('--entity <name>', 'Entity logical name')
    .requiredOption('--attribute <name>', 'Attribute (column) logical name')
    .requiredOption('--secured <true|false>', 'true to secure, false to unsecure')
    .option('--no-publish', 'Skip publishing the entity after the change')
    .action(async (opts) => {
      try {
        const isSecured = opts.secured === 'true';
        const result = await ctx.pp.setColumnSecured(
          opts.entity,
          opts.attribute,
          isSecured,
          opts.publish !== false
        );
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('set-columns-secured')
    .description('Batch toggle IsSecured for multiple columns on the same entity')
    .requiredOption('--entity <name>', 'Entity logical name')
    .requiredOption('--attributes <list>', 'Comma-separated attribute logical names')
    .requiredOption('--secured <true|false>', 'true to secure, false to unsecure')
    .option('--no-publish', 'Skip publishing the entity after the changes')
    .action(async (opts) => {
      try {
        const attrs = String(opts.attributes)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const isSecured = opts.secured === 'true';
        const results = await ctx.pp.setColumnsSecured(
          opts.entity,
          attrs,
          isSecured,
          opts.publish !== false
        );
        outputResult(results);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('create-field-security-profile')
    .description('Create a new Field Security Profile')
    .requiredOption('--name <name>', 'Display name')
    .option('--description <desc>', 'Description')
    .option('--solution <name>', 'Add to solution')
    .action(async (opts) => {
      try {
        const result = await ctx.pp.createFieldSecurityProfile(
          opts.name,
          opts.description,
          opts.solution
        );
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('update-field-security-profile')
    .description('Update name and/or description of an FSP')
    .requiredOption('--id <guid>', 'Field security profile GUID')
    .option('--name <name>', 'New display name')
    .option('--description <desc>', 'New description')
    .action(async (opts) => {
      try {
        await ctx.pp.updateFieldSecurityProfile(opts.id, {
          name: opts.name,
          description: opts.description,
        });
        outputResult({ updated: opts.id });
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('delete-field-security-profile')
    .description('Delete an FSP (refuses if managed)')
    .requiredOption('--id <guid>', 'Field security profile GUID')
    .action(async (opts) => {
      try {
        await ctx.pp.deleteFieldSecurityProfile(opts.id);
        outputResult({ deleted: opts.id });
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('list-field-security-profiles')
    .description('List FSPs (optional name filter)')
    .option('--name-pattern <substring>', 'Filter by name substring')
    .action(async (opts) => {
      try {
        const result = await ctx.pp.listFieldSecurityProfiles(opts.namePattern);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('get-field-security-profile')
    .description('Get a single FSP with permissions and assignments')
    .requiredOption('--id <guid>', 'Field security profile GUID')
    .action(async (opts) => {
      try {
        const result = await ctx.pp.getFieldSecurityProfile(opts.id);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('add-field-permission')
    .description('Add or upsert a field permission on an FSP')
    .requiredOption('--fsp <guid>', 'Field security profile GUID')
    .requiredOption('--entity <name>', 'Entity logical name')
    .requiredOption('--attribute <name>', 'Attribute logical name (must be secured)')
    .requiredOption('--can-create <Allowed|NotAllowed>', 'Create permission')
    .requiredOption('--can-read <Allowed|NotAllowed>', 'Read permission')
    .requiredOption('--can-update <Allowed|NotAllowed>', 'Update permission')
    .option('--no-upsert', 'Disable upsert (create-only)')
    .action(async (opts) => {
      try {
        const result = await ctx.pp.addFieldPermission({
          fieldSecurityProfileId: opts.fsp,
          entityLogicalName: opts.entity,
          attributeLogicalName: opts.attribute,
          canCreate: parsePermission(opts.canCreate),
          canRead: parsePermission(opts.canRead),
          canUpdate: parsePermission(opts.canUpdate),
          upsert: opts.upsert !== false,
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('add-field-permissions')
    .description('Batch add field permissions from a JSON array')
    .requiredOption('--fsp <guid>', 'Field security profile GUID')
    .requiredOption(
      '--permissions <json>',
      'JSON array: [{entityLogicalName,attributeLogicalName,canCreate,canRead,canUpdate}]'
    )
    .option('--no-upsert', 'Disable upsert (create-only)')
    .action(async (opts) => {
      try {
        const perms = JSON.parse(opts.permissions);
        const result = await ctx.pp.addFieldPermissions(
          opts.fsp,
          perms,
          opts.upsert !== false
        );
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('remove-field-permission')
    .description('Remove a field permission by id')
    .requiredOption('--id <guid>', 'fieldpermission record GUID')
    .action(async (opts) => {
      try {
        await ctx.pp.removeFieldPermission(opts.id);
        outputResult({ removed: opts.id });
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('assign-fsp-to-team')
    .description('Assign a Field Security Profile to a team (idempotent)')
    .requiredOption('--fsp <guid>', 'Field security profile GUID')
    .requiredOption('--team <guid>', 'Team GUID')
    .action(async (opts) => {
      try {
        const result = await ctx.pp.assignFspToTeam(opts.fsp, opts.team);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('unassign-fsp-from-team')
    .description('Remove an FSP from a team')
    .requiredOption('--fsp <guid>', 'Field security profile GUID')
    .requiredOption('--team <guid>', 'Team GUID')
    .action(async (opts) => {
      try {
        await ctx.pp.unassignFspFromTeam(opts.fsp, opts.team);
        outputResult({ unassigned: { fsp: opts.fsp, team: opts.team } });
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('assign-fsp-to-user')
    .description('Assign a Field Security Profile directly to a user (idempotent)')
    .requiredOption('--fsp <guid>', 'Field security profile GUID')
    .requiredOption('--user <guid>', 'System user GUID')
    .action(async (opts) => {
      try {
        const result = await ctx.pp.assignFspToUser(opts.fsp, opts.user);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('unassign-fsp-from-user')
    .description('Remove an FSP from a user')
    .requiredOption('--fsp <guid>', 'Field security profile GUID')
    .requiredOption('--user <guid>', 'System user GUID')
    .action(async (opts) => {
      try {
        await ctx.pp.unassignFspFromUser(opts.fsp, opts.user);
        outputResult({ unassigned: { fsp: opts.fsp, user: opts.user } });
      } catch (error) {
        handleCliError(error);
      }
    });
}
