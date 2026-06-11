/**
 * Flow CLI commands: create, delete, clone, activate, deactivate, create-from-def,
 *                    get-template, update-def, runs, cancel-run, resubmit-run
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerFlowCommands(program: Command, ctx: ServiceContext): void {

  const flow = program.command('flow').description('Power Automate flow operations');

  flow
    .command('create')
    .description('Create a new flow from an existing template flow')
    .requiredOption('--name <name>', 'Display name for the new flow')
    .requiredOption('--template-flow-id <guid>', 'GUID of the template flow to copy from')
    .option('--description <desc>', 'Description for the new flow')
    .option('--state <state>', 'Initial state: draft, activated (default: draft)')
    .option('--connection-reference-mappings <json>', 'JSON map of connection ref names to new connection IDs')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const connectionReferenceMappings = opts.connectionReferenceMappings
          ? JSON.parse(opts.connectionReferenceMappings) : undefined;
        const result = await service.createFlow(opts.name, opts.templateFlowId, {
          description: opts.description,
          state: opts.state,
          connectionReferenceMappings
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  flow
    .command('delete')
    .description('Delete a Power Automate flow (permanent, cannot be undone)')
    .requiredOption('--flow-id <guid>', 'GUID of the flow to delete')
    .option('--confirm', 'Confirm deletion (required)', false)
    .action(async (opts) => {
      try {
        if (!opts.confirm) {
          console.error('Deletion not confirmed. Use --confirm to proceed.');
          process.exit(1);
        }
        const service = ctx.pp;
        const result = await service.deleteFlow(opts.flowId);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  flow
    .command('clone')
    .description('Clone an existing flow with a new name')
    .requiredOption('--source-flow-id <guid>', 'GUID of the flow to clone')
    .requiredOption('--new-name <name>', 'Display name for the cloned flow')
    .option('--description <desc>', 'Description for the cloned flow')
    .option('--update-connection-references', 'Update connection references using mappings', false)
    .option('--connection-reference-mappings <json>', 'JSON map of connection ref names to new connection IDs')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const connectionReferenceMappings = opts.connectionReferenceMappings
          ? JSON.parse(opts.connectionReferenceMappings) : undefined;
        const result = await service.cloneFlow(opts.sourceFlowId, opts.newName, {
          description: opts.description,
          updateConnectionReferences: opts.updateConnectionReferences,
          connectionReferenceMappings
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  flow
    .command('activate')
    .description('Activate a Power Automate flow')
    .requiredOption('--flow-id <guid>', 'GUID of the flow to activate')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.activateFlow(opts.flowId);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  flow
    .command('deactivate')
    .description('Deactivate a Power Automate flow (set to Draft)')
    .requiredOption('--flow-id <guid>', 'GUID of the flow to deactivate')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.deactivateFlow(opts.flowId);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  flow
    .command('create-from-def')
    .description('Create a new flow from a clientdata JSON definition')
    .requiredOption('--name <name>', 'Display name for the new flow')
    .requiredOption('--client-data <json>', 'Flow definition JSON (stringified)')
    .option('--description <desc>', 'Description for the new flow')
    .option('--primary-entity <name>', 'Primary entity logical name (default: none)')
    .option('--state <state>', 'Initial state: draft, activated (default: draft)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.createFlowFromDefinition(opts.name, opts.clientData, {
          description: opts.description,
          primaryEntity: opts.primaryEntity,
          state: opts.state
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  flow
    .command('get-template')
    .description('Get a pre-built flow definition template')
    .requiredOption('--template-type <type>', 'Template type: dataverse-on-create, dataverse-on-update, dataverse-on-delete, dataverse-on-create-with-condition-and-update, scheduled-recurrence, manual-trigger, http-request')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const template = service.getFlowDefinitionTemplate(opts.templateType);
        outputResult(template);
      } catch (error) {
        handleCliError(error);
      }
    });

  flow
    .command('update-def')
    .description('Update an existing flow\'s clientdata definition')
    .requiredOption('--flow-id <guid>', 'GUID of the flow to update')
    .requiredOption('--client-data <json>', 'Updated flow definition JSON (stringified)')
    .option('--no-reactivate', 'Do not auto-reactivate flow after update')
    .option('--no-validate', 'Skip JSON structure validation')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.updateFlowDefinition(opts.flowId, opts.clientData, {
          reactivate: opts.reactivate,
          validateDefinition: opts.validate
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  flow
    .command('runs')
    .description('Get run history for a specific flow')
    .requiredOption('--flow-id <guid>', 'GUID of the flow')
    .option('--status <status>', 'Filter by status: Succeeded, Failed, Running, Waiting, Cancelled')
    .option('--started-after <date>', 'Only runs started after this date (ISO 8601)')
    .option('--started-before <date>', 'Only runs started before this date (ISO 8601)')
    .option('--max-records <n>', 'Maximum runs to return (default: 50)', parseInt as any)
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.getFlowRuns(opts.flowId, {
          status: opts.status,
          startedAfter: opts.startedAfter,
          startedBefore: opts.startedBefore,
          maxRecords: opts.maxRecords || 50,
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  flow
    .command('cancel-run')
    .description('Cancel a running or waiting flow run')
    .requiredOption('--flow-id <guid>', 'GUID of the flow')
    .requiredOption('--run-id <guid>', 'GUID of the flow run to cancel')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.cancelFlowRun(opts.flowId, opts.runId);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  flow
    .command('resubmit-run')
    .description('Resubmit/retry a failed flow run using original trigger inputs')
    .requiredOption('--flow-id <guid>', 'GUID of the flow')
    .requiredOption('--run-id <guid>', 'GUID of the failed flow run to retry')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.resubmitFlowRun(opts.flowId, opts.runId);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });
}
