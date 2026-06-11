/**
 * Relationship CLI commands: create-o2m, create-m2m, delete, update
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerRelationshipCommands(program: Command, ctx: ServiceContext): void {

  const relationship = program.command('relationship').description('Entity relationship operations');

  relationship
    .command('create-o2m')
    .description('Create a one-to-many (1:N) relationship between two entities')
    .requiredOption('--referenced-entity <name>', 'The parent (one side) entity logical name')
    .requiredOption('--referencing-entity <name>', 'The child (many side) entity logical name')
    .requiredOption('--schema-name <name>', 'Relationship schema name (e.g., new_account_application)')
    .requiredOption('--lookup-attr-schema <name>', 'Lookup attribute schema name on child entity')
    .requiredOption('--lookup-attr-display <name>', 'Lookup attribute display name')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

        const relationshipDefinition = {
          "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
          SchemaName: opts.schemaName,
          ReferencedEntity: opts.referencedEntity,
          ReferencingEntity: opts.referencingEntity,
          Lookup: {
            "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            SchemaName: opts.lookupAttrSchema,
            DisplayName: {
              "@odata.type": "Microsoft.Dynamics.CRM.Label",
              LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.lookupAttrDisplay, LanguageCode: 1033 }]
            }
          }
        };

        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        await service.createOneToManyRelationship(relationshipDefinition, solution);
        outputResult({ success: true, schemaName: opts.schemaName, type: '1:N' });
      } catch (error) {
        handleCliError(error);
      }
    });

  relationship
    .command('create-m2m')
    .description('Create a many-to-many (N:N) relationship between two entities')
    .requiredOption('--entity1 <name>', 'First entity logical name')
    .requiredOption('--entity2 <name>', 'Second entity logical name')
    .requiredOption('--schema-name <name>', 'Relationship schema name')
    .requiredOption('--intersect-entity-name <name>', 'Intersect entity name')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

        const relationshipDefinition = {
          "@odata.type": "Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata",
          SchemaName: opts.schemaName,
          Entity1LogicalName: opts.entity1,
          Entity2LogicalName: opts.entity2,
          IntersectEntityName: opts.intersectEntityName
        };

        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        await service.createManyToManyRelationship(relationshipDefinition, solution);
        outputResult({ success: true, schemaName: opts.schemaName, type: 'N:N' });
      } catch (error) {
        handleCliError(error);
      }
    });

  relationship
    .command('delete')
    .description('Delete a relationship (removes lookup column and all association data)')
    .requiredOption('--metadata-id <guid>', 'Relationship MetadataId (GUID)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.deleteRelationship(opts.metadataId);
        outputResult({ success: true, deleted: opts.metadataId });
      } catch (error) {
        handleCliError(error);
      }
    });

  relationship
    .command('update')
    .description('Update relationship navigation property names')
    .requiredOption('--metadata-id <guid>', 'Relationship MetadataId (GUID)')
    .option('--referenced-nav-property <name>', 'Referenced entity navigation property name')
    .option('--referencing-nav-property <name>', 'Referencing entity navigation property name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const updates: any = {};
        if (opts.referencedNavProperty) updates.ReferencedEntityNavigationPropertyName = opts.referencedNavProperty;
        if (opts.referencingNavProperty) updates.ReferencingEntityNavigationPropertyName = opts.referencingNavProperty;
        await service.updateRelationship(opts.metadataId, updates);
        outputResult({ success: true, metadataId: opts.metadataId });
      } catch (error) {
        handleCliError(error);
      }
    });
}
