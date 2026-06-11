/**
 * Web Resource CLI commands: create, update, delete, deploy
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerWebresourceCommands(program: Command, ctx: ServiceContext): void {

  const webresource = program.command('webresource').description('Web resource operations');

  webresource
    .command('create')
    .description('Create a new web resource (JavaScript, CSS, HTML, Image, etc.)')
    .requiredOption('--name <name>', 'Web resource name with publisher prefix (e.g., si_/scripts/validation.js)')
    .requiredOption('--display-name <name>', 'Display name')
    .requiredOption('--type <n>', 'Web resource type: 1=HTML, 2=CSS, 3=JS, 4=XML, 5=PNG, 6=JPG, 7=GIF, 8=XAP, 9=XSL, 10=ICO, 11=SVG, 12=RESX', parseInt as any)
    .requiredOption('--content <base64>', 'Base64-encoded content of the file')
    .option('--description <desc>', 'Description')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        const result = await service.createWebResource(
          opts.name, opts.displayName, opts.type, opts.content,
          { description: opts.description, solutionUniqueName: solution }
        );
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  webresource
    .command('update')
    .description('Update an existing web resource')
    .requiredOption('--web-resource-id <guid>', 'Web resource ID (GUID)')
    .option('--display-name <name>', 'New display name')
    .option('--content <base64>', 'New base64-encoded content')
    .option('--description <desc>', 'New description')
    .option('--solution <name>', 'Solution context')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const updates: any = {};
        if (opts.displayName) updates.displayname = opts.displayName;
        if (opts.content) updates.content = opts.content;
        if (opts.description) updates.description = opts.description;
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        await service.updateWebResource(opts.webResourceId, updates, solution);
        outputResult({ success: true, webResourceId: opts.webResourceId });
      } catch (error) {
        handleCliError(error);
      }
    });

  webresource
    .command('delete')
    .description('Delete a web resource')
    .requiredOption('--web-resource-id <guid>', 'Web resource ID (GUID)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.deleteWebResource(opts.webResourceId);
        outputResult({ success: true, deleted: opts.webResourceId });
      } catch (error) {
        handleCliError(error);
      }
    });

  webresource
    .command('deploy')
    .description('Deploy a web resource from a local file (auto-detects type from extension)')
    .argument('<filePath>', 'Path to local web resource file (.html, .js, .css, etc.)')
    .option('--web-resource-id <guid>', 'Update existing web resource (omit to create new)')
    .option('--name <name>', 'Web resource name (required for create, e.g. si_/scripts/validation.js)')
    .option('--display-name <name>', 'Display name (required for create)')
    .option('--type <n>', 'Override auto-detected web resource type', parseInt as any)
    .option('--description <desc>', 'Description')
    .option('--solution <name>', 'Solution unique name')
    .action(async (filePath: string, opts: any) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const solution = opts.solution || POWERPLATFORM_DEFAULT_SOLUTION;
        const result = await service.deployWebResourceFromFile(filePath, {
          webResourceId: opts.webResourceId,
          name: opts.name,
          displayName: opts.displayName,
          webResourceType: opts.type,
          description: opts.description,
          solutionUniqueName: solution,
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });
}
