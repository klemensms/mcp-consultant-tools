/**
 * Tenant CLI Commands - tenant-level operations
 *
 * summary (maps to b2c-tenant-summary prompt / getTenantSummary service method)
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerTenantCommands(program: Command, ctx: ServiceContext): void {
  const tenant = program.command('tenant').description('Tenant-level operations');

  tenant
    .command('summary')
    .description('Get a summary of the Azure AD B2C tenant including user and group statistics')
    .action(async () => {
      try {
        const summary = await ctx.groups.getTenantSummary();
        outputResult(
          {
            fileName: 'b2c-tenant-summary',
            data: summary,
            summary: `Tenant ${summary.tenantId}: ${summary.userCount} users, ${summary.groupCount} groups (${summary.enabledUserCount} enabled, ${summary.disabledUserCount} disabled)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get tenant summary'); }
    });
}
