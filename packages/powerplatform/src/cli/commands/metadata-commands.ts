/**
 * Metadata CLI Commands - 5 commands for entity metadata inspection
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerMetadataCommands(program: Command, ctx: ServiceContext): void {
  const metadata = program.command('metadata').description('Entity metadata inspection');

  metadata
    .command('get')
    .description('Get metadata for a Dataverse entity')
    .argument('<entityName>', 'Entity logical name (e.g., account, contact, new_customentity)')
    .action(async (entityName: string) => {
      try {
        const result = await ctx.pp.getEntityMetadata(entityName);
        outputResult(
          { fileName: `metadata-${entityName}`, data: result, summary: `Entity metadata for '${entityName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get entity metadata'); }
    });

  metadata
    .command('attributes')
    .description('Get attributes/fields of a Dataverse entity')
    .argument('<entityName>', 'Entity logical name')
    .option('-p, --prefix <prefix>', 'Filter by schema name prefix (e.g., si_)')
    .option('-t, --type <type>', 'Filter by attribute type (e.g., String, Lookup, Picklist)')
    .option('-m, --max <n>', 'Maximum number of attributes to return')
    .action(async (entityName: string, opts: any) => {
      try {
        const result = await ctx.pp.getEntityAttributes(entityName, {
          prefix: opts.prefix,
          attributeType: opts.type,
          maxAttributes: opts.max ? parseInt(opts.max) : undefined,
        });
        outputResult(
          { fileName: `attributes-${entityName}`, data: result, summary: `Attributes for '${entityName}' (${result.returnedCount} returned)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get entity attributes'); }
    });

  metadata
    .command('attribute')
    .description('Get a specific attribute of a Dataverse entity')
    .argument('<entityName>', 'Entity logical name')
    .argument('<attributeName>', 'Attribute logical name (e.g., emailaddress1)')
    .action(async (entityName: string, attributeName: string) => {
      try {
        const result = await ctx.pp.getEntityAttribute(entityName, attributeName);
        outputResult(
          { fileName: `attribute-${entityName}-${attributeName}`, data: result, summary: `Attribute '${attributeName}' for entity '${entityName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get entity attribute'); }
    });

  metadata
    .command('relationships')
    .description('Get relationships for a Dataverse entity')
    .argument('<entityName>', 'Entity logical name')
    .action(async (entityName: string) => {
      try {
        const result = await ctx.pp.getEntityRelationships(entityName);
        const totalCount = (result.oneToMany?.value?.length || 0) + (result.manyToMany?.value?.length || 0);
        outputResult(
          { fileName: `relationships-${entityName}`, data: result, summary: `Relationships for '${entityName}' (${totalCount} total)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get entity relationships'); }
    });

  metadata
    .command('option-set')
    .description('Get a global option set by name')
    .argument('<optionSetName>', 'Global option set name (e.g., new_applicationstatus)')
    .action(async (optionSetName: string) => {
      try {
        const result = await ctx.pp.getGlobalOptionSet(optionSetName);
        outputResult(
          { fileName: `optionset-${optionSetName}`, data: result, summary: `Global option set '${optionSetName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get global option set'); }
    });
}
