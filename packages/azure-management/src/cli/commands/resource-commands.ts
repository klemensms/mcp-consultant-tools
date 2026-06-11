/**
 * Resource CLI Commands - 6 commands mapping to resource MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerResourceCommands(program: Command, ctx: ServiceContext): void {
  const resource = program.command('resource').description('Azure resource operations');

  resource
    .command('list')
    .description('List all Azure resources in the subscription or resource group')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .option('-t, --resource-type <type>', 'Filter by resource type (e.g., Microsoft.Web/sites)')
    .option('--tag-filter <filter>', 'OData filter for tags')
    .option('-n, --name-contains <text>', 'Filter resources by name substring')
    .option('-m, --max-results <n>', 'Maximum results to return', '100')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.resources.listResources({
          resourceGroup: opts.resourceGroup,
          resourceType: opts.resourceType,
          tagFilter: opts.tagFilter,
          nameContains: opts.nameContains,
          maxResults: opts.maxResults ? parseInt(opts.maxResults) : undefined,
        });
        const count = Array.isArray(result) ? result.length : (result as any)?.count ?? '?';
        outputResult(
          { fileName: 'resources-list', data: result, summary: `Found ${count} resource(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list resources'); }
    });

  resource
    .command('get')
    .description('Get detailed information about a specific Azure resource')
    .option('-i, --resource-id <id>', 'Full ARM resource ID (preferred)')
    .option('-g, --resource-group <name>', 'Resource group name')
    .option('-t, --resource-type <type>', 'Resource type')
    .option('-n, --resource-name <name>', 'Resource name')
    .option('--include-all-properties', 'Include all properties including nulls')
    .action(async (opts: any) => {
      try {
        const options = { includeAllProperties: opts.includeAllProperties };
        let result;
        if (opts.resourceId) {
          result = await ctx.management.resources.getResource(opts.resourceId, options);
        } else if (opts.resourceGroup && opts.resourceType && opts.resourceName) {
          result = await ctx.management.resources.getResourceByName(
            opts.resourceGroup, opts.resourceType, opts.resourceName, options
          );
        } else {
          throw new Error('Provide either --resource-id OR (--resource-group + --resource-type + --resource-name)');
        }
        const name = (result as any)?.name || opts.resourceId || opts.resourceName || 'unknown';
        outputResult(
          { fileName: `resource-${name}`, data: result, summary: `Resource details for '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get resource'); }
    });

  resource
    .command('groups')
    .description('List all resource groups in the subscription')
    .option('--tag-filter <filter>', 'OData filter for tags')
    .option('-n, --name-contains <text>', 'Filter by name substring')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.resources.listResourceGroups({
          tagFilter: opts.tagFilter,
          nameContains: opts.nameContains,
        });
        const count = Array.isArray(result) ? result.length : (result as any)?.count ?? '?';
        outputResult(
          { fileName: 'resource-groups', data: result, summary: `Found ${count} resource group(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list resource groups'); }
    });

  resource
    .command('graph')
    .description('Run Azure Resource Graph queries for advanced searching')
    .argument('<query>', 'KQL-like query')
    .option('-s, --subscriptions <ids>', 'Comma-separated subscription IDs')
    .action(async (query: string, opts: any) => {
      try {
        const subscriptions = opts.subscriptions ? opts.subscriptions.split(',').map((s: string) => s.trim()) : undefined;
        const result = await ctx.management.resources.queryResourceGraph(query, subscriptions);
        outputResult(
          { fileName: 'resource-graph-query', data: result, summary: `Resource Graph query returned results` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'query resource graph'); }
    });

  resource
    .command('tags')
    .description('Get tags for a specific resource')
    .argument('<resourceId>', 'Full ARM resource ID')
    .action(async (resourceId: string) => {
      try {
        const result = await ctx.management.resources.getResourceTags(resourceId);
        outputResult(
          { fileName: 'resource-tags', data: result, summary: `Tags for resource` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get resource tags'); }
    });

  resource
    .command('locations')
    .description('List available Azure locations')
    .option('-c, --region-category <category>', 'Filter: Recommended, Other, all', 'Recommended')
    .option('-g, --geography-group <group>', 'Filter by geography (e.g., Europe, US)')
    .option('--include-metadata', 'Include full metadata with coordinates and paired regions')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.resources.listLocations({
          regionCategory: opts.regionCategory,
          geographyGroup: opts.geographyGroup,
          includeMetadata: opts.includeMetadata,
        });
        const count = Array.isArray(result) ? result.length : (result as any)?.count ?? '?';
        outputResult(
          { fileName: 'azure-locations', data: result, summary: `Found ${count} location(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list locations'); }
    });
}
