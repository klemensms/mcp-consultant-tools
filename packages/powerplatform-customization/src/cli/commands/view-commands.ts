/**
 * View CLI commands: create, update, delete, set-default
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerViewCommands(program: Command, ctx: ServiceContext): void {

  const view = program.command('view').description('View operations');

  view
    .command('create')
    .description('Create a new view for an entity using FetchXML')
    .requiredOption('--name <name>', 'View name')
    .requiredOption('--entity <name>', 'Entity logical name')
    .requiredOption('--fetch-xml <xml>', 'FetchXML query defining the data filter')
    .requiredOption('--layout-xml <xml>', 'Layout XML defining visible columns and widths')
    .option('--query-type <n>', 'Query type (default: 0 for public view)', parseInt as any)
    .option('--is-default', 'Set as default view', false)
    .option('--description <desc>', 'View description')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        const result = await service.createView(
          opts.name, opts.entity, opts.fetchXml, opts.layoutXml,
          {
            queryType: opts.queryType || 0,
            isDefault: opts.isDefault || false,
            description: opts.description,
            solutionUniqueName: solution
          }
        );
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  view
    .command('update')
    .description('Update an existing view')
    .requiredOption('--view-id <guid>', 'View ID (GUID)')
    .option('--name <name>', 'New view name')
    .option('--fetch-xml <xml>', 'New FetchXML query')
    .option('--layout-xml <xml>', 'New layout XML')
    .option('--is-default', 'Set as default view')
    .option('--description <desc>', 'New description')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const updates: any = {};
        if (opts.name) updates.name = opts.name;
        if (opts.fetchXml) updates.fetchxml = opts.fetchXml;
        if (opts.layoutXml) updates.layoutxml = opts.layoutXml;
        if (opts.isDefault !== undefined) updates.isdefault = opts.isDefault;
        if (opts.description) updates.description = opts.description;
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        await service.updateView(opts.viewId, updates, solution);
        outputResult({ success: true, viewId: opts.viewId });
      } catch (error) {
        handleCliError(error);
      }
    });

  view
    .command('delete')
    .description('Delete a view')
    .requiredOption('--view-id <guid>', 'View ID (GUID)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.deleteView(opts.viewId);
        outputResult({ success: true, deleted: opts.viewId });
      } catch (error) {
        handleCliError(error);
      }
    });

  view
    .command('set-default')
    .description('Set a view as the default view for its entity')
    .requiredOption('--view-id <guid>', 'View ID (GUID)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.setDefaultView(opts.viewId);
        outputResult({ success: true, defaultView: opts.viewId });
      } catch (error) {
        handleCliError(error);
      }
    });
}
