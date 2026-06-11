/**
 * Domain CLI Commands - mirrors the fabric domain MCP tools.
 * Domain routes use the Fabric admin API and require Fabric admin rights.
 */
import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerDomainCommands(program: Command, ctx: ServiceContext): void {
  const domain = program.command('domain').description('Domain (governance) operations - Fabric admin API');

  domain
    .command('list')
    .description('List all domains in the tenant')
    .action(async () => {
      try {
        const result = await ctx.domains.listDomains();
        outputResult(
          { fileName: 'domains', data: result, summary: `Found ${result.count} domain(s)` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'list domains'); }
    });

  domain
    .command('get')
    .description('Get a domain by ID')
    .argument('<domainId>', 'Domain ID (GUID)')
    .action(async (domainId: string) => {
      try {
        const result = await ctx.domains.getDomain(domainId);
        outputResult(
          { fileName: `domain-${domainId}`, data: result, summary: `Domain '${result.displayName ?? domainId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'get domain'); }
    });

  domain
    .command('assign-workspaces')
    .description('Assign workspaces to a domain (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<domainId>', 'Domain ID (GUID)')
    .argument('<workspaceIds...>', 'One or more workspace IDs (GUIDs)')
    .action(async (domainId: string, workspaceIds: string[]) => {
      try {
        const result = await ctx.domains.assignWorkspaces(domainId, workspaceIds);
        outputResult(
          { fileName: `domain-assign-${domainId}`, data: result, summary: `Assigned ${workspaceIds.length} workspace(s) to domain '${domainId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'assign workspaces to domain'); }
    });

  domain
    .command('unassign-workspaces')
    .description('Unassign workspaces from a domain (requires FABRIC_ENABLE_WRITE=true)')
    .argument('<domainId>', 'Domain ID (GUID)')
    .argument('<workspaceIds...>', 'One or more workspace IDs (GUIDs)')
    .action(async (domainId: string, workspaceIds: string[]) => {
      try {
        const result = await ctx.domains.unassignWorkspaces(domainId, workspaceIds);
        outputResult(
          { fileName: `domain-unassign-${domainId}`, data: result, summary: `Unassigned ${workspaceIds.length} workspace(s) from domain '${domainId}'` },
          getGlobalFlags(program),
        );
      } catch (error) { handleCliError(error, 'unassign workspaces from domain'); }
    });
}
