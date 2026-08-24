/**
 * Form CLI commands: create, update, delete, activate, deactivate
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerFormCommands(program: Command, ctx: ServiceContext): void {

  const form = program.command('form').description('Form operations');

  form
    .command('create')
    .description('Create a new form (Main, QuickCreate, QuickView, Card) for an entity')
    .requiredOption('--name <name>', 'Form name')
    .requiredOption('--entity <name>', 'Entity logical name')
    .requiredOption('--form-type <type>', 'Form type: Main, QuickCreate, QuickView, Card')
    .requiredOption('--form-xml <xml>', 'Form XML definition')
    .option('--description <desc>', 'Form description')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        const result = await service.createForm(
          opts.name, opts.entity, opts.formType, opts.formXml,
          { description: opts.description, solutionUniqueName: solution }
        );
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  form
    .command('update')
    .description('Update an existing form')
    .requiredOption('--form-id <guid>', 'Form ID (GUID)')
    .option('--name <name>', 'New form name')
    .option('--form-xml <xml>', 'New form XML definition')
    .option('--description <desc>', 'New description')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const updates: any = {};
        if (opts.name) updates.name = opts.name;
        if (opts.formXml) updates.formxml = opts.formXml;
        if (opts.description) updates.description = opts.description;
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        await service.updateForm(opts.formId, updates, solution);
        outputResult({ success: true, formId: opts.formId });
      } catch (error) {
        handleCliError(error);
      }
    });

  form
    .command('delete')
    .description('Delete a form')
    .requiredOption('--form-id <guid>', 'Form ID (GUID)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.deleteForm(opts.formId);
        outputResult({ success: true, deleted: opts.formId });
      } catch (error) {
        handleCliError(error);
      }
    });

  form
    .command('activate')
    .description('Activate a form')
    .requiredOption('--form-id <guid>', 'Form ID (GUID)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.activateForm(opts.formId);
        outputResult({ success: true, activated: opts.formId });
      } catch (error) {
        handleCliError(error);
      }
    });

  form
    .command('deactivate')
    .description('Deactivate a form')
    .requiredOption('--form-id <guid>', 'Form ID (GUID)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.deactivateForm(opts.formId);
        outputResult({ success: true, deactivated: opts.formId });
      } catch (error) {
        handleCliError(error);
      }
    });

  form
    .command('download')
    .description('Download a form\'s XML to a local file (writes sidecar .meta.json + history snapshot)')
    .argument('<filePath>', 'Local file path to write the form XML to')
    .option('--form-id <guid>', 'Form ID (overrides entity/name/type lookup)')
    .option('--entity <name>', 'Entity logical name (required when form-id not provided)')
    .option('--form-name <name>', 'Form display name (e.g., Contact)')
    .option('--form-type <type>', 'Form type: Main | QuickCreate | QuickView | Card')
    .action(async (filePath: string, opts: any) => {
      try {
        const service = ctx.pp;
        const result = await service.downloadFormToFile(filePath, {
          formId: opts.formId,
          entityLogicalName: opts.entity,
          formName: opts.formName,
          formType: opts.formType,
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  form
    .command('deploy')
    .description('Deploy a local form XML file to Dataverse (PATCHes formxml verbatim, updates sidecar, writes history snapshot)')
    .argument('<filePath>', 'Local file path of the form XML to deploy')
    .option('--form-id <guid>', 'Override target form ID (defaults to sidecar .meta.json)')
    .option('--expected-version <n>', 'Optimistic concurrency check - reject if remote version doesn\'t match')
    .option('--solution <name>', 'Solution unique name (MSCRM.SolutionUniqueName header)')
    .action(async (filePath: string, opts: any) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION || undefined;
        const result = await service.deployFormFromFile(filePath, {
          formId: opts.formId,
          expectedVersionNumber: opts.expectedVersion,
          solutionUniqueName: solution,
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  form
    .command('diff')
    .description('Compare a local form XML file to the current remote form (read-only, no changes)')
    .argument('<filePath>', 'Local file path of the form XML to compare')
    .option('--form-id <guid>', 'Override target form ID (defaults to sidecar .meta.json)')
    .action(async (filePath: string, opts: any) => {
      try {
        const service = ctx.pp;
        const result = await service.diffFormWithFile(filePath, { formId: opts.formId });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });
}
