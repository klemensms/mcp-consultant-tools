/**
 * Security CLI Commands - 4 commands for connection references and security roles
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError, truncationSuffix } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerSecurityCommands(program: Command, ctx: ServiceContext): void {
  const security = program.command('security').description('Security roles and connection references');

  security
    .command('connection-refs')
    .description('Get all connection references with connector details')
    .option('-m, --max <n>', 'Maximum records to return (0 = all, the default)', '0')
    .option('--managed-only', 'Filter to managed connection references only', false)
    .option('--has-connection', 'Filter: only refs with connections set')
    .option('--no-connection', 'Filter: only refs without connections')
    .action(async (opts: any) => {
      try {
        let hasConnection: boolean | undefined;
        if (opts.hasConnection) hasConnection = true;
        if (opts.connection === false) hasConnection = false;

        const result = await ctx.pp.getConnectionReferences({
          maxRecords: parseInt(opts.max),
          managedOnly: opts.managedOnly,
          hasConnection,
        });
        outputResult(
          { fileName: 'connection-references', data: result, summary: `Connection references: ${result.summary.total} total, ${result.summary.withConnection} with connection${truncationSuffix(result.truncation)}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get connection references'); }
    });

  security
    .command('roles')
    .description('Get custom security roles in the environment')
    .option('-s, --solution <name>', 'Filter to roles in a specific solution')
    .option('--include-system', 'Include system roles (System Admin, etc.)', false)
    .option('-m, --max <n>', 'Maximum records to return (0 = all, the default)', '0')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getSecurityRoles({
          solutionUniqueName: opts.solution,
          excludeSystemRoles: !opts.includeSystem,
          maxRecords: parseInt(opts.max),
        });
        outputResult(
          { fileName: 'security-roles', data: result, summary: `Security roles: ${result.summary.total} total (${result.summary.managed} managed, ${result.summary.unmanaged} unmanaged)${truncationSuffix(result.truncation)}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get security roles'); }
    });

  security
    .command('role-privileges')
    .description('Get privilege assignments for a specific security role')
    .argument('<roleId>', 'Role ID (GUID)')
    .option('-e, --entity <name>', 'Filter privileges to a specific entity (partial match)')
    .option('-a, --access-right <right>', 'Filter by access right (Create, Read, Write, Delete, etc.)')
    .action(async (roleId: string, opts: any) => {
      try {
        const result = await ctx.pp.getSecurityRolePrivileges({
          roleId,
          entityFilter: opts.entity,
          accessRightFilter: opts.accessRight,
        });
        outputResult(
          { fileName: `role-privileges-${roleId}`, data: result, summary: `Role privileges: ${result.summary.total} privileges across ${result.summary.entityCount} entities` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get security role privileges'); }
    });

  security
    .command('roles-by-solution')
    .description('Get all security roles in a specific solution')
    .argument('<solutionName>', 'Solution unique name')
    .option('--include-privileges', 'Include privilege count summary per role', false)
    .action(async (solutionName: string, opts: any) => {
      try {
        const result = await ctx.pp.getSecurityRolesBySolution({
          solutionUniqueName: solutionName,
          includePrivileges: opts.includePrivileges,
        });
        outputResult(
          { fileName: `roles-solution-${solutionName}`, data: result, summary: `Security roles in solution '${solutionName}': ${result.summary.total} roles` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get security roles by solution'); }
    });
}
