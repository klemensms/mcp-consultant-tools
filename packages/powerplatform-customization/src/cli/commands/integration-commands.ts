/**
 * Integration CLI commands: create-endpoint, update-endpoint, delete-endpoint
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerIntegrationCommands(program: Command, ctx: ServiceContext): void {

  const integration = program.command('integration').description('Service endpoint operations');

  integration
    .command('create-endpoint')
    .description('Create a new service endpoint (webhook, Service Bus, Event Hub, etc.)')
    .requiredOption('--name <name>', 'Friendly name for the service endpoint')
    .requiredOption('--url <url>', 'Endpoint URL (must be HTTPS for webhooks)')
    .requiredOption('--contract <type>', 'Contract type: Webhook, Queue, Topic, EventHub, EventGrid, REST, OneWay, TwoWay')
    .requiredOption('--auth-type <type>', 'Auth type: Anonymous, HttpHeader, HttpQueryString, WebKey, SASKey, AzureKey, Certificate')
    .option('--auth-value <value>', 'Authentication value (API key, token)')
    .option('--description <desc>', 'Description of the endpoint')
    .option('--message-format <format>', 'Message format: Json, BinaryXML, TextXML')
    .option('--path <path>', 'Service Bus queue/topic path')
    .option('--saskeyname <name>', 'Service Bus SAS key name')
    .option('--saskey <key>', 'Service Bus SAS key value')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const result = await service.createServiceEndpoint({
          name: opts.name,
          url: opts.url,
          contract: opts.contract,
          authType: opts.authType,
          authValue: opts.authValue,
          description: opts.description,
          messageFormat: opts.messageFormat,
          path: opts.path,
          saskeyname: opts.saskeyname,
          saskey: opts.saskey,
          solutionUniqueName: opts.solution || POWERPLATFORM_DEFAULT_SOLUTION,
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  integration
    .command('update-endpoint')
    .description('Update an existing service endpoint')
    .requiredOption('--service-endpoint-id <guid>', 'GUID of the service endpoint to update')
    .option('--name <name>', 'New friendly name')
    .option('--url <url>', 'New endpoint URL')
    .option('--auth-type <type>', 'New auth type: Anonymous, HttpHeader, HttpQueryString, WebKey, SASKey, AzureKey, Certificate')
    .option('--auth-value <value>', 'New authentication value')
    .option('--description <desc>', 'New description')
    .option('--message-format <format>', 'New message format: Json, BinaryXML, TextXML')
    .option('--path <path>', 'New Service Bus queue/topic path')
    .option('--namespace-address <uri>', 'Service Bus namespace URI (sb://). Runtime-authoritative for Queue/Topic/EventHub.')
    .option('--sas-key <value>', 'Service Bus SAS key value')
    .option('--sas-key-name <name>', 'Service Bus SAS key / policy name')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        await service.updateServiceEndpoint({
          serviceEndpointId: opts.serviceEndpointId,
          name: opts.name,
          url: opts.url,
          authType: opts.authType,
          authValue: opts.authValue,
          description: opts.description,
          messageFormat: opts.messageFormat,
          path: opts.path,
          namespaceAddress: opts.namespaceAddress,
          sasKey: opts.sasKey,
          saskeyname: opts.sasKeyName,
          solutionUniqueName: opts.solution || POWERPLATFORM_DEFAULT_SOLUTION || undefined,
        });
        outputResult({ success: true, serviceEndpointId: opts.serviceEndpointId });
      } catch (error) {
        handleCliError(error);
      }
    });

  integration
    .command('delete-endpoint')
    .description('Delete a service endpoint (also removes associated SDK steps)')
    .requiredOption('--service-endpoint-id <guid>', 'GUID of the service endpoint to delete')
    .option('--confirm', 'Confirm deletion (required)', false)
    .action(async (opts) => {
      try {
        if (!opts.confirm) {
          console.error('Deletion not confirmed. Use --confirm to proceed.');
          process.exit(1);
        }
        const service = ctx.pp;
        await service.deleteServiceEndpoint(opts.serviceEndpointId);
        outputResult({ success: true, deleted: opts.serviceEndpointId });
      } catch (error) {
        handleCliError(error);
      }
    });
}
