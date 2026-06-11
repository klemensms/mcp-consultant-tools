/**
 * Webhook CLI commands: register
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerWebhookCommands(program: Command, ctx: ServiceContext): void {

  const webhook = program.command('webhook').description('Webhook operations');

  webhook
    .command('register')
    .description('Register a webhook endpoint with an SDK message processing step in one operation')
    .requiredOption('--name <name>', 'Friendly name for the webhook')
    .requiredOption('--url <url>', 'Webhook URL (must be HTTPS)')
    .requiredOption('--auth-type <type>', 'Auth type: Anonymous, HttpHeader, HttpQueryString, WebKey')
    .requiredOption('--entity-name <name>', 'Entity logical name to trigger on')
    .requiredOption('--message-name <name>', 'SDK message: Create, Update, Delete, etc.')
    .option('--auth-value <value>', 'Authentication value (API key, token)')
    .option('--stage <stage>', 'Execution stage: PreValidation, PreOperation, PostOperation (default: PostOperation)')
    .option('--execution-mode <mode>', 'Execution mode: Sync, Async (default: Async)')
    .option('--filtering-attributes <attrs>', 'Comma-separated fields to monitor for Update message')
    .option('--description <desc>', 'Description of the webhook')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

        const stageMap: Record<string, number> = {
          PreValidation: 10, PreOperation: 20, PostOperation: 40
        };
        const modeMap: Record<string, number> = { Sync: 0, Async: 1 };

        const result = await service.registerWebhook({
          name: opts.name,
          url: opts.url,
          authType: opts.authType,
          authValue: opts.authValue,
          entityName: opts.entityName,
          messageName: opts.messageName,
          stage: opts.stage ? stageMap[opts.stage] : undefined,
          executionMode: opts.executionMode ? modeMap[opts.executionMode] : undefined,
          filteringAttributes: opts.filteringAttributes || undefined,
          description: opts.description,
          solutionUniqueName: opts.solution || POWERPLATFORM_DEFAULT_SOLUTION,
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });
}
