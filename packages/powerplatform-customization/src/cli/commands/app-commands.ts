/**
 * App CLI commands: add-entities, validate, publish
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerAppCommands(program: Command, ctx: ServiceContext): void {

  const app = program.command('app').description('Model-driven app operations');

  app
    .command('add-entities')
    .description('Add entities to a model-driven app')
    .requiredOption('--app-id <guid>', 'The GUID of the app (appmoduleid)')
    .requiredOption('--entity-names <names>', 'Comma-separated entity logical names (e.g., account,contact)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const entityNames = opts.entityNames.split(',').map((n: string) => n.trim());
        const result = await service.addEntitiesToApp(opts.appId, entityNames);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  app
    .command('validate')
    .description('Validate a model-driven app before publishing')
    .requiredOption('--app-id <guid>', 'The GUID of the app (appmoduleid)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.validateApp(opts.appId);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  app
    .command('publish')
    .description('Publish a model-driven app to make it available to users')
    .requiredOption('--app-id <guid>', 'The GUID of the app (appmoduleid)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.publishApp(opts.appId);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });
}
