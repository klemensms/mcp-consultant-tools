/**
 * Entity CLI commands: create-entity, update-entity, update-entity-icon, delete-entity
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerEntityCommands(program: Command, ctx: ServiceContext): void {

  program
    .command('create-entity')
    .description('Create a new custom entity (table)')
    .requiredOption('--schema-name <name>', 'Schema name (e.g., new_application)')
    .requiredOption('--display-name <name>', 'Display name')
    .requiredOption('--plural-display-name <name>', 'Plural display name')
    .requiredOption('--description <desc>', 'Description')
    .requiredOption('--ownership-type <type>', 'Ownership: UserOwned, TeamOwned, OrganizationOwned')
    .option('--has-activities', 'Enable activities', false)
    .option('--has-notes', 'Enable notes', false)
    .option('--is-activity-party', 'Can be party in activities', false)
    .option('--primary-attr-schema <name>', 'Primary attribute schema name')
    .option('--primary-attr-display <name>', 'Primary attribute display name')
    .option('--primary-attr-max-length <n>', 'Primary attribute max length', parseInt as any)
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const entityDefinition = {
          "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
          SchemaName: opts.schemaName,
          DisplayName: {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.displayName, LanguageCode: 1033 }]
          },
          DisplayCollectionName: {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.pluralDisplayName, LanguageCode: 1033 }]
          },
          Description: {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.description, LanguageCode: 1033 }]
          },
          OwnershipType: opts.ownershipType,
          IsActivity: false,
          HasActivities: opts.hasActivities,
          HasNotes: opts.hasNotes,
          IsActivityParty: opts.isActivityParty,
          IsDuplicateDetectionEnabled: { Value: false, CanBeChanged: true },
          IsMailMergeEnabled: { Value: false, CanBeChanged: true },
          Attributes: [{
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            SchemaName: opts.primaryAttrSchema || "name",
            IsPrimaryName: true,
            RequiredLevel: { Value: "None", CanBeChanged: true },
            MaxLength: opts.primaryAttrMaxLength || 850,
            FormatName: { Value: "Text" },
            DisplayName: {
              "@odata.type": "Microsoft.Dynamics.CRM.Label",
              LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.primaryAttrDisplay || "Name", LanguageCode: 1033 }]
            },
            Description: {
              "@odata.type": "Microsoft.Dynamics.CRM.Label",
              LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: "The primary attribute for the entity", LanguageCode: 1033 }]
            }
          }],
          HasFeedback: false
        };
        const solutionName = opts.solution || process.env.POWERPLATFORM_DEFAULT_SOLUTION || undefined;
        const result = await service.createEntity(entityDefinition, solutionName);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('update-entity')
    .description('Update an existing custom entity')
    .requiredOption('--metadata-id <guid>', 'Entity MetadataId (GUID)')
    .option('--display-name <name>', 'New display name')
    .option('--plural-display-name <name>', 'New plural display name')
    .option('--description <desc>', 'New description')
    .option('--has-activities', 'Enable activities')
    .option('--has-notes', 'Enable notes')
    .option('--solution <name>', 'Solution context')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const updates: any = {};
        if (opts.displayName) {
          updates.DisplayName = { "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.displayName, LanguageCode: 1033 }] };
        }
        if (opts.pluralDisplayName) {
          updates.DisplayCollectionName = { "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.pluralDisplayName, LanguageCode: 1033 }] };
        }
        if (opts.description) {
          updates.Description = { "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.description, LanguageCode: 1033 }] };
        }
        if (opts.hasActivities !== undefined) updates.HasActivities = opts.hasActivities;
        if (opts.hasNotes !== undefined) updates.HasNotes = opts.hasNotes;
        await service.updateEntity(opts.metadataId, updates, opts.solution);
        outputResult({ success: true, metadataId: opts.metadataId });
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('update-entity-icon')
    .description('Update entity icon using Fluent UI System Icons')
    .requiredOption('--entity <name>', 'Entity logical name')
    .requiredOption('--icon-file <name>', 'Fluent UI icon file name (e.g., people_community_24_filled.svg)')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.updateEntityIcon(opts.entity, opts.iconFile, opts.solution);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('delete-entity')
    .description('Delete a custom entity')
    .requiredOption('--metadata-id <guid>', 'Entity MetadataId (GUID)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.deleteEntity(opts.metadataId);
        outputResult({ success: true, deleted: opts.metadataId });
      } catch (error) {
        handleCliError(error);
      }
    });
}
