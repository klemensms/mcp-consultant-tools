/**
 * Attribute CLI commands: create-attribute, update-attribute, delete-attribute
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerAttributeCommands(program: Command, ctx: ServiceContext): void {

  program
    .command('create-attribute')
    .description('Create a new attribute (column) on an entity')
    .requiredOption('--entity <name>', 'Entity logical name')
    .requiredOption('--type <type>', 'Attribute type: String, Memo, Integer, Decimal, Money, DateTime, Boolean, Picklist, Lookup, MultiSelectPicklist, AutoNumber')
    .requiredOption('--schema-name <name>', 'Schema name (e.g., new_description)')
    .requiredOption('--display-name <name>', 'Display name')
    .option('--description <desc>', 'Description')
    .option('--is-required', 'Whether the attribute is required', false)
    .option('--max-length <n>', 'Max length (String/Memo)', parseInt as any)
    .option('--auto-number-format <fmt>', 'Auto-number format (AutoNumber type)')
    .option('--precision <n>', 'Decimal precision', parseInt as any)
    .option('--min-value <n>', 'Minimum value', parseFloat as any)
    .option('--max-value <n>', 'Maximum value', parseFloat as any)
    .option('--date-time-behavior <b>', 'DateTime behavior: UserLocal, DateOnly, TimeZoneIndependent')
    .option('--global-option-set <name>', 'Existing global option set name')
    .option('--option-set-options <json>', 'JSON array of option set options')
    .option('--referenced-entity <name>', 'Referenced entity (Lookup)')
    .option('--relationship-schema <name>', 'Relationship schema name (Lookup)')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;

        // Build base definition
        const baseDefinition: any = {
          SchemaName: opts.schemaName,
          RequiredLevel: { Value: opts.isRequired ? "ApplicationRequired" : "None", CanBeChanged: true },
          DisplayName: {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.displayName, LanguageCode: 1033 }]
          },
          Description: {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.description || "", LanguageCode: 1033 }]
          }
        };

        let attributeDefinition: any;
        const attrType = opts.type;

        switch (attrType) {
          case "String":
            attributeDefinition = { ...baseDefinition, "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", MaxLength: opts.maxLength || 100, FormatName: { Value: "Text" } };
            break;
          case "AutoNumber":
            if (!opts.autoNumberFormat) throw new Error("AutoNumber requires --auto-number-format");
            attributeDefinition = { ...baseDefinition, "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", AutoNumberFormat: opts.autoNumberFormat, MaxLength: opts.maxLength || 100, FormatName: { Value: "Text" } };
            break;
          case "Memo":
            attributeDefinition = { ...baseDefinition, "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata", MaxLength: opts.maxLength || 2000, Format: "TextArea" };
            break;
          case "Integer":
            attributeDefinition = { ...baseDefinition, "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata", Format: "None", MinValue: opts.minValue ?? -2147483648, MaxValue: opts.maxValue ?? 2147483647 };
            break;
          case "Decimal":
            attributeDefinition = { ...baseDefinition, "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata", Precision: opts.precision || 2, MinValue: opts.minValue ?? -100000000000, MaxValue: opts.maxValue ?? 100000000000 };
            break;
          case "Money":
            attributeDefinition = { ...baseDefinition, "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata", Precision: opts.precision || 2, MinValue: opts.minValue ?? -922337203685477, MaxValue: opts.maxValue ?? 922337203685477, PrecisionSource: 2 };
            break;
          case "DateTime":
            attributeDefinition = { ...baseDefinition, "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", Format: opts.dateTimeBehavior === "DateOnly" ? "DateOnly" : "DateAndTime", DateTimeBehavior: { Value: opts.dateTimeBehavior || "UserLocal" } };
            break;
          case "Boolean":
            attributeDefinition = {
              ...baseDefinition, "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata", DefaultValue: false,
              OptionSet: {
                "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
                TrueOption: { Value: 1, Label: { "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: "Yes", LanguageCode: 1033 }] } },
                FalseOption: { Value: 0, Label: { "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: "No", LanguageCode: 1033 }] } }
              }
            };
            break;
          case "Picklist":
          case "MultiSelectPicklist": {
            const odataType = attrType === "Picklist"
              ? "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
              : "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata";
            if (opts.globalOptionSet) {
              const globalOS = await service.getGlobalOptionSet(opts.globalOptionSet) as any;
              attributeDefinition = { ...baseDefinition, "@odata.type": odataType, "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${globalOS.MetadataId})` };
            } else if (opts.optionSetOptions) {
              const parsedOptions = JSON.parse(opts.optionSetOptions);
              const normalizedOptions = parsedOptions.map((opt: any, index: number) => {
                if (typeof opt === 'string') {
                  return { Value: index, Label: { "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opt, LanguageCode: 1033 }] } };
                }
                return { Value: opt.value, Label: { "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opt.label, LanguageCode: 1033 }] } };
              });
              const solutionName = opts.solution || process.env.POWERPLATFORM_DEFAULT_SOLUTION || undefined;
              const globalOSDef = {
                "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
                Name: opts.schemaName,
                DisplayName: baseDefinition.DisplayName,
                Description: baseDefinition.Description,
                IsGlobal: true,
                OptionSetType: "Picklist",
                Options: normalizedOptions
              };
              await service.createGlobalOptionSet(globalOSDef, solutionName);
              const createdOS = await service.getGlobalOptionSet(opts.schemaName) as any;
              attributeDefinition = { ...baseDefinition, "@odata.type": odataType, "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${createdOS.MetadataId})` };
            } else {
              throw new Error("Picklist/MultiSelectPicklist requires --global-option-set or --option-set-options");
            }
            break;
          }
          case "Lookup":
            if (!opts.referencedEntity) throw new Error("Lookup requires --referenced-entity");
            attributeDefinition = { ...baseDefinition, "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata", Targets: [opts.referencedEntity] };
            if (opts.relationshipSchema) (attributeDefinition as any).RelationshipSchemaName = opts.relationshipSchema;
            break;
          default:
            throw new Error(`Unsupported attribute type: ${attrType}`);
        }

        const solutionName = opts.solution || process.env.POWERPLATFORM_DEFAULT_SOLUTION || undefined;
        const result = await service.createAttribute(opts.entity, attributeDefinition, solutionName);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('update-attribute')
    .description('Update an existing attribute on an entity')
    .requiredOption('--entity <name>', 'Entity logical name')
    .requiredOption('--attribute <name>', 'Attribute logical name')
    .option('--display-name <name>', 'New display name')
    .option('--description <desc>', 'New description')
    .option('--required-level <level>', 'Required level: None, Recommended, ApplicationRequired')
    .option('--max-length <n>', 'Max length', parseInt as any)
    .option('--format-name <fmt>', 'Format: Text, TextArea, Email, Phone, Url, TickerSymbol')
    .option('--min-value <n>', 'Min value', parseFloat as any)
    .option('--max-value <n>', 'Max value', parseFloat as any)
    .option('--precision <n>', 'Decimal precision', parseInt as any)
    .option('--precision-source <src>', 'Precision source: Precision, Pricing, Currency')
    .option('--format <fmt>', 'DateTime format: DateAndTime, DateOnly')
    .option('--date-time-behavior <b>', 'DateTime behavior: UserLocal, DateOnly, TimeZoneIndependent')
    .option('--is-audit-enabled', 'Enable auditing')
    .option('--no-audit', 'Disable auditing')
    .option('--auto-number-format <fmt>', 'Auto-number format string')
    .option('--solution <name>', 'Solution context')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const updates: any = {};
        if (opts.displayName) {
          updates.DisplayName = { "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.displayName, LanguageCode: 1033 }] };
        }
        if (opts.description) {
          updates.Description = { "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opts.description, LanguageCode: 1033 }] };
        }
        if (opts.requiredLevel) updates.RequiredLevel = { Value: opts.requiredLevel, CanBeChanged: true };
        if (opts.maxLength !== undefined) updates.MaxLength = opts.maxLength;
        if (opts.formatName) updates.FormatName = { Value: opts.formatName };
        if (opts.minValue !== undefined) updates.MinValue = opts.minValue;
        if (opts.maxValue !== undefined) updates.MaxValue = opts.maxValue;
        if (opts.precision !== undefined) updates.Precision = opts.precision;
        if (opts.precisionSource) {
          const map: Record<string, number> = { "Precision": 0, "Pricing": 1, "Currency": 2 };
          updates.PrecisionSource = map[opts.precisionSource];
        }
        if (opts.format) updates.Format = opts.format;
        if (opts.dateTimeBehavior) updates.DateTimeBehavior = { "@odata.type": "Microsoft.Dynamics.CRM.DateTimeBehavior", Value: opts.dateTimeBehavior };
        if (opts.isAuditEnabled) updates.IsAuditEnabled = { Value: true, CanBeChanged: true };
        if (opts.audit === false) updates.IsAuditEnabled = { Value: false, CanBeChanged: true };
        if (opts.autoNumberFormat) updates.AutoNumberFormat = opts.autoNumberFormat;

        await service.updateAttribute(opts.entity, opts.attribute, updates, opts.solution);
        outputResult({ success: true, entity: opts.entity, attribute: opts.attribute });
      } catch (error) {
        handleCliError(error);
      }
    });

  program
    .command('delete-attribute')
    .description('Delete an attribute from an entity')
    .requiredOption('--entity <name>', 'Entity logical name')
    .requiredOption('--attribute-metadata-id <guid>', 'Attribute MetadataId (GUID)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.deleteAttribute(opts.entity, opts.attributeMetadataId);
        outputResult({ success: true, entity: opts.entity, deleted: opts.attributeMetadataId });
      } catch (error) {
        handleCliError(error);
      }
    });
}
