/**
 * Solution CLI commands: create-publisher, create, components, add-component,
 *                        remove-component, export, import, publish-all
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerSolutionCommands(program: Command, ctx: ServiceContext): void {

  const solution = program.command('solution').description('Solution and publisher operations');

  solution
    .command('create-publisher')
    .description('Create a new solution publisher')
    .requiredOption('--unique-name <name>', 'Publisher unique name (lowercase, no spaces)')
    .requiredOption('--friendly-name <name>', 'Publisher display name')
    .requiredOption('--prefix <prefix>', 'Customization prefix (2-8 lowercase letters)')
    .requiredOption('--option-value-prefix <n>', 'Option value prefix (5-digit number)', parseInt as any)
    .option('--description <desc>', 'Publisher description')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.createPublisher(
          opts.uniqueName, opts.friendlyName, opts.prefix,
          opts.optionValuePrefix, opts.description
        );
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  solution
    .command('create')
    .description('Create a new unmanaged solution')
    .requiredOption('--unique-name <name>', 'Solution unique name (no spaces)')
    .requiredOption('--friendly-name <name>', 'Solution display name')
    .requiredOption('--version <ver>', 'Version in major.minor.build.revision format')
    .requiredOption('--publisher-id <guid>', 'Publisher ID (GUID)')
    .option('--description <desc>', 'Solution description')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.createSolution(
          opts.uniqueName, opts.friendlyName, opts.version,
          opts.publisherId, opts.description
        );
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  solution
    .command('components')
    .description('List all components in a solution')
    .requiredOption('--solution-name <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.getSolutionComponents(opts.solutionName);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  solution
    .command('add-component')
    .description('Add a component to a solution')
    .requiredOption('--solution-name <name>', 'Solution unique name')
    .requiredOption('--component-id <guid>', 'Component ID (GUID or MetadataId)')
    .requiredOption('--component-type <n>', 'Component type number (1=Entity, 2=Attribute, etc.)', parseInt as any)
    .option('--add-required', 'Add required components (default: true)', true)
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.addComponentToSolution(
          opts.solutionName, opts.componentId, opts.componentType, opts.addRequired
        );
        outputResult({ success: true, solutionName: opts.solutionName, componentId: opts.componentId, componentType: opts.componentType });
      } catch (error) {
        handleCliError(error);
      }
    });

  solution
    .command('remove-component')
    .description('Remove a component from a solution')
    .requiredOption('--solution-name <name>', 'Solution unique name')
    .requiredOption('--component-id <guid>', 'Component ID (GUID or MetadataId)')
    .requiredOption('--component-type <n>', 'Component type number', parseInt as any)
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.removeComponentFromSolution(opts.solutionName, opts.componentId, opts.componentType);
        outputResult({ success: true, solutionName: opts.solutionName, removed: opts.componentId });
      } catch (error) {
        handleCliError(error);
      }
    });

  solution
    .command('export')
    .description('Export a solution as base64-encoded zip')
    .requiredOption('--solution-name <name>', 'Solution unique name')
    .option('--managed', 'Export as managed solution', false)
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.exportSolution(opts.solutionName, opts.managed ?? false);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  solution
    .command('import')
    .description('Import a solution from base64-encoded zip')
    .requiredOption('--customization-file <base64>', 'Base64-encoded solution zip file')
    .option('--publish-workflows', 'Publish workflows after import (default: true)', true)
    .option('--overwrite', 'Overwrite unmanaged customizations', false)
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.importSolution(
          opts.customizationFile,
          opts.overwrite ?? false,
          opts.publishWorkflows ?? true
        );
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  solution
    .command('publish-all')
    .description('Publish all pending customizations')
    .action(async () => {
      try {
        const service = ctx.pp;
        await service.publishAllCustomizations();
        outputResult({ success: true, message: 'All customizations published' });
      } catch (error) {
        handleCliError(error);
      }
    });
}
