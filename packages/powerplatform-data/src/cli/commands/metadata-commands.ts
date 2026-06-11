/**
 * Metadata CLI Commands - 2 commands mapping to metadata MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerMetadataCommands(program: Command, ctx: ServiceContext): void {
  const metadata = program.command('metadata').description('Dataverse entity metadata operations');

  metadata
    .command('get')
    .description('Get entity metadata (EntitySetName, PrimaryIdAttribute, etc.)')
    .argument('<entityLogicalName>', 'Logical name of the entity (e.g., account, contact)')
    .action(async (entityLogicalName: string) => {
      try {
        const raw = await ctx.pp.getEntityMetadata(entityLogicalName) as any;
        const summary = {
          LogicalName: raw.LogicalName,
          EntitySetName: raw.EntitySetName,
          PrimaryIdAttribute: raw.PrimaryIdAttribute,
          PrimaryNameAttribute: raw.PrimaryNameAttribute,
          DisplayName: raw.DisplayName?.UserLocalizedLabel?.Label,
          DisplayCollectionName: raw.DisplayCollectionName?.UserLocalizedLabel?.Label,
          SchemaName: raw.SchemaName,
          LogicalCollectionName: raw.LogicalCollectionName,
          IsCustomEntity: raw.IsCustomEntity,
          MetadataId: raw.MetadataId,
        };
        outputResult(
          {
            fileName: `metadata-${entityLogicalName}`,
            data: summary,
            summary: `Entity '${entityLogicalName}': EntitySetName=${summary.EntitySetName}, PrimaryId=${summary.PrimaryIdAttribute}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get entity metadata');
      }
    });

  metadata
    .command('lookup-target')
    .description('Get lookup field target entity info (for @odata.bind syntax)')
    .argument('<entityLogicalName>', 'Entity containing the lookup (e.g., ste_transaction)')
    .argument('<lookupAttributeName>', 'Lookup attribute name (e.g., parentaccountid)')
    .action(async (entityLogicalName: string, lookupAttributeName: string) => {
      try {
        const attribute = await ctx.pp.getEntityAttribute(entityLogicalName, lookupAttributeName) as any;

        if (!attribute.Targets || attribute.Targets.length === 0) {
          process.stderr.write(
            `Attribute '${lookupAttributeName}' on entity '${entityLogicalName}' is not a lookup field or has no targets.\n`
          );
          process.exit(1);
        }

        const lookupSchemaName = attribute.SchemaName;
        const isPolymorphic = attribute.Targets.length > 1;

        const targetResults = await Promise.all(
          attribute.Targets.map(async (targetEntity: string) => {
            try {
              const targetMetadata = await ctx.pp.getEntityMetadata(targetEntity) as any;
              const bindingPropertyName = isPolymorphic
                ? `${lookupSchemaName}_${targetEntity}`
                : lookupSchemaName;
              return {
                LogicalName: targetEntity,
                EntitySetName: targetMetadata.EntitySetName,
                PrimaryIdAttribute: targetMetadata.PrimaryIdAttribute,
                DisplayName: targetMetadata.DisplayName?.UserLocalizedLabel?.Label,
                BindingPropertyName: bindingPropertyName,
              };
            } catch {
              return {
                LogicalName: targetEntity,
                EntitySetName: `${targetEntity}s`,
                BindingPropertyName: isPolymorphic ? `${lookupSchemaName}_${targetEntity}` : lookupSchemaName,
                error: 'Could not fetch metadata',
              };
            }
          })
        );

        const result = {
          lookupAttribute: {
            SchemaName: lookupSchemaName,
            LogicalName: lookupAttributeName,
            IsPolymorphic: isPolymorphic,
          },
          targets: targetResults,
          bindingSyntax: `${targetResults[0].BindingPropertyName}@odata.bind: /${targetResults[0].EntitySetName}(<guid>)`,
        };

        outputResult(
          {
            fileName: `lookup-${entityLogicalName}-${lookupAttributeName}`,
            data: result,
            summary: `Lookup '${lookupAttributeName}' on '${entityLogicalName}': bind via ${targetResults[0].BindingPropertyName}@odata.bind -> /${targetResults[0].EntitySetName}(<guid>)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get lookup target');
      }
    });
}
