/**
 * Option Set CLI commands: create-global, update-global, add-value, update-value, delete-value, reorder
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerOptionsetCommands(program: Command, ctx: ServiceContext): void {

  const optionset = program.command('optionset').description('Option set operations');

  optionset
    .command('create-global')
    .description('Create a picklist attribute using an existing global option set')
    .requiredOption('--entity <name>', 'Entity logical name')
    .requiredOption('--schema-name <name>', 'Attribute schema name with publisher prefix (e.g., new_status)')
    .requiredOption('--display-name <name>', 'Attribute display name')
    .requiredOption('--global-option-set-name <name>', 'Global option set name to use')
    .option('--description <desc>', 'Attribute description')
    .option('--required-level <level>', 'Required level: None, Recommended, ApplicationRequired')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        const result = await service.createGlobalOptionSetAttribute(
          opts.entity,
          opts.schemaName,
          opts.displayName,
          opts.globalOptionSetName,
          {
            description: opts.description,
            requiredLevel: opts.requiredLevel,
            solutionUniqueName: solution
          }
        );
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  optionset
    .command('update-global')
    .description('Update a global option set display name or description')
    .requiredOption('--metadata-id <guid>', 'The MetadataId of the option set (GUID)')
    .option('--display-name <name>', 'New display name')
    .option('--description <desc>', 'New description')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

        const updates: any = { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata' };
        if (opts.displayName) {
          updates.DisplayName = {
            LocalizedLabels: [{ Label: opts.displayName, LanguageCode: 1033 }]
          };
        }
        if (opts.description) {
          updates.Description = {
            LocalizedLabels: [{ Label: opts.description, LanguageCode: 1033 }]
          };
        }

        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        await service.updateGlobalOptionSet(opts.metadataId, updates, solution);
        outputResult({ success: true, metadataId: opts.metadataId });
      } catch (error) {
        handleCliError(error);
      }
    });

  optionset
    .command('add-value')
    .description('Add a new value to a global option set')
    .requiredOption('--option-set-name <name>', 'The name of the option set')
    .requiredOption('--value <n>', 'The numeric value', parseInt as any)
    .requiredOption('--label <label>', 'The display label for the value')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        await service.addOptionSetValue(opts.optionSetName, opts.value, opts.label, solution);
        outputResult({ success: true, optionSetName: opts.optionSetName, value: opts.value, label: opts.label });
      } catch (error) {
        handleCliError(error);
      }
    });

  optionset
    .command('update-value')
    .description('Update an existing value in a global option set')
    .requiredOption('--option-set-name <name>', 'The name of the option set')
    .requiredOption('--value <n>', 'The numeric value to update', parseInt as any)
    .requiredOption('--label <label>', 'The new display label')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        await service.updateOptionSetValue(opts.optionSetName, opts.value, opts.label, solution);
        outputResult({ success: true, optionSetName: opts.optionSetName, value: opts.value, label: opts.label });
      } catch (error) {
        handleCliError(error);
      }
    });

  optionset
    .command('delete-value')
    .description('Delete a value from a global option set')
    .requiredOption('--option-set-name <name>', 'The name of the option set')
    .requiredOption('--value <n>', 'The numeric value to delete', parseInt as any)
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.deleteOptionSetValue(opts.optionSetName, opts.value);
        outputResult({ success: true, optionSetName: opts.optionSetName, deletedValue: opts.value });
      } catch (error) {
        handleCliError(error);
      }
    });

  optionset
    .command('reorder')
    .description('Reorder the values in a global option set')
    .requiredOption('--option-set-name <name>', 'The name of the option set')
    .requiredOption('--values <json>', 'JSON array of values in desired order (e.g., [1,2,3])')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        const values = JSON.parse(opts.values);
        await service.reorderOptionSetValues(opts.optionSetName, values, solution);
        outputResult({ success: true, optionSetName: opts.optionSetName, reorderedCount: values.length });
      } catch (error) {
        handleCliError(error);
      }
    });
}
