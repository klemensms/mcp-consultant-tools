/**
 * Resource Graph CLI Commands - 6 commands mapping to the resource-graph MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

function parsePositiveInt(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${label} must be a positive integer, got: ${value}`);
  }
  return parsed;
}

/** Truncation must be visible in the human-readable summary, not only in the JSON. */
function truncationNote(truncated: boolean): string[] {
  return truncated ? ['', 'WARNING: results were truncated - more rows exist than were returned.'] : [];
}

export function registerResourceGraphCommands(program: Command, ctx: ServiceContext): void {
  const graph = program.command('graph').description('Azure Resource Graph cross-resource queries');

  graph
    .command('nsgs')
    .description('List NSGs with security rules and subnet/NIC associations')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .option('--associated-subnet <subnet>', 'Filter by associated subnet name or ID substring')
    .option('--associated-nic <nic>', 'Filter by associated NIC name or ID substring')
    .option('-m, --max-results <n>', 'Maximum rows to return')
    .action(async (opts: any) => {
      try {
        const maxResults = parsePositiveInt(opts.maxResults, 'max-results');
        const result = await ctx.management.resourceGraph.listNetworkSecurityGroups({
          resourceGroup: opts.resourceGroup,
          associatedSubnet: opts.associatedSubnet,
          associatedNic: opts.associatedNic,
          maxResults,
        });
        outputResult(
          {
            fileName: 'network-security-groups',
            data: result,
            summary: [
              `Found ${result.summary.total} NSG(s)`,
              `  Associated: ${result.summary.associated}`,
              `  Unassociated: ${result.summary.unassociated}`,
              ...truncationNote(result.truncated),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list network security groups'); }
    });

  graph
    .command('role-assignments')
    .description('List Azure RBAC role assignments with resolved role names')
    .option('--principal-id <id>', 'Filter by principal object ID (exact)')
    .option('--role-definition-id <id>', 'Filter by role definition ID substring')
    .option('--scope <scope>', 'Filter by exact assignment scope')
    .option('-m, --max-results <n>', 'Maximum rows to return')
    .action(async (opts: any) => {
      try {
        const maxResults = parsePositiveInt(opts.maxResults, 'max-results');
        const result = await ctx.management.resourceGraph.listRoleAssignments({
          principalId: opts.principalId,
          roleDefinitionId: opts.roleDefinitionId,
          scope: opts.scope,
          maxResults,
        });
        outputResult(
          {
            fileName: 'role-assignments',
            data: result,
            summary: [
              `Found ${result.summary.total} role assignment(s)`,
              '',
              'By role:',
              ...Object.entries(result.summary.byRole).map(([role, count]) => `  ${role}: ${count}`),
              '',
              'By principal type:',
              ...Object.entries(result.summary.byPrincipalType).map(([type, count]) => `  ${type}: ${count}`),
              ...(result.summary.unresolvedRoleNames > 0
                ? ['', `WARNING: ${result.summary.unresolvedRoleNames} assignment(s) have an unresolved role name.`]
                : []),
              ...truncationNote(result.truncated),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list role assignments'); }
    });

  graph
    .command('private-endpoints')
    .description('List private endpoints with connection status and targets')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .option('--target-resource-id <id>', 'Filter by target resource ID substring')
    .option('-m, --max-results <n>', 'Maximum rows to return')
    .action(async (opts: any) => {
      try {
        const maxResults = parsePositiveInt(opts.maxResults, 'max-results');
        const result = await ctx.management.resourceGraph.listPrivateEndpoints({
          resourceGroup: opts.resourceGroup,
          targetResourceId: opts.targetResourceId,
          maxResults,
        });
        outputResult(
          {
            fileName: 'private-endpoints',
            data: result,
            summary: [
              `Found ${result.summary.total} private endpoint(s)`,
              '',
              'By connection status:',
              ...Object.entries(result.summary.byConnectionStatus).map(([status, count]) => `  ${status}: ${count}`),
              ...truncationNote(result.truncated),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list private endpoints'); }
    });

  graph
    .command('consumers')
    .description('Find all resources that reference a given resource ID')
    .argument('<resourceId>', 'Full ARM resource ID')
    .option('-m, --max-results <n>', 'Maximum rows to return')
    .action(async (resourceId: string, opts: any) => {
      try {
        const maxResults = parsePositiveInt(opts.maxResults, 'max-results');
        const result = await ctx.management.resourceGraph.findResourceConsumers({ resourceId, maxResults });
        outputResult(
          {
            fileName: 'resource-consumers',
            data: result,
            summary: [
              `Found ${result.summary.total} resource(s) referencing the target`,
              '',
              'By resource type:',
              ...Object.entries(result.summary.byResourceType).map(([type, count]) => `  ${type}: ${count}`),
              ...truncationNote(result.truncated),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'find resource consumers'); }
    });

  graph
    .command('diagnostic-settings')
    .description('List Azure Monitor diagnostic settings across resources')
    .option('-i, --resource-ids <ids...>', 'Specific ARM resource IDs to inspect')
    .option('-g, --resource-group <name>', 'Enumerate resources in this resource group')
    .option('-t, --resource-type <type>', 'Enumerate resources of this type')
    .option('-m, --max-resources <n>', 'Maximum resources to inspect')
    .action(async (opts: any) => {
      try {
        const maxResources = parsePositiveInt(opts.maxResources, 'max-resources');
        const result = await ctx.management.resourceGraph.listDiagnosticSettings({
          resourceIds: opts.resourceIds,
          resourceGroup: opts.resourceGroup,
          resourceType: opts.resourceType,
          maxResources,
        });
        outputResult(
          {
            fileName: 'diagnostic-settings',
            data: result,
            summary: [
              `Found ${result.summary.total} diagnostic setting(s) across ${result.summary.resourcesInspected} resource(s)`,
              `  With settings: ${result.summary.resourcesWithSettings}`,
              `  Without settings: ${result.summary.resourcesWithoutSettings}`,
              `  Unreadable: ${result.summary.resourcesUnreadable}`,
              ...(result.summary.resourcesUnreadable > 0
                ? ['', 'WARNING: some resources could not be inspected. Absence of settings is unproven for those.']
                : []),
              ...truncationNote(result.truncated),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list diagnostic settings'); }
    });

  graph
    .command('relationships')
    .description("Map a resource's subnet, VNet and reference relationships")
    .argument('<resourceId>', 'Full ARM resource ID')
    .option('-m, --max-results <n>', 'Maximum rows to return per relationship bucket')
    .action(async (resourceId: string, opts: any) => {
      try {
        const maxResults = parsePositiveInt(opts.maxResults, 'max-results');
        const result = await ctx.management.resourceGraph.getResourceRelationships({ resourceId, maxResults });
        outputResult(
          {
            fileName: 'resource-relationships',
            data: result,
            summary: [
              'Resource relationships:',
              `  Same subnet: ${result.summary.sameSubnet}`,
              `  Same VNet: ${result.summary.sameVnet}`,
              `  References this: ${result.summary.referencesThis}`,
              `  Referenced by this: ${result.summary.referencedByThis}`,
              ...truncationNote(result.truncated),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get resource relationships'); }
    });
}
