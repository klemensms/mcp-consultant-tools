/**
 * Workflow CLI commands: publish-entity, update-desc, update-flow-desc, document,
 *                        deactivate, activate, document-safe
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerWorkflowCommands(program: Command, ctx: ServiceContext): void {

  const workflow = program.command('workflow').description('Workflow and automation operations');

  workflow
    .command('publish-entity')
    .description('Publish all customizations for a specific entity')
    .requiredOption('--entity <name>', 'Entity logical name to publish')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        await service.publishEntity(opts.entity);
        outputResult({ success: true, entity: opts.entity, message: 'Entity published' });
      } catch (error) {
        handleCliError(error);
      }
    });

  workflow
    .command('update-desc')
    .description('Update a classic workflow\'s description field')
    .requiredOption('--workflow-id <guid>', 'GUID of the workflow')
    .requiredOption('--description <desc>', 'New description content')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.updateWorkflowDescription(opts.workflowId, opts.description);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  workflow
    .command('update-flow-desc')
    .description('Update a Power Automate flow\'s description field')
    .requiredOption('--flow-id <guid>', 'GUID of the flow (workflowid)')
    .requiredOption('--description <desc>', 'New description content')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.updateFlowDescription(opts.flowId, opts.description);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  workflow
    .command('document')
    .description('Analyze a flow or workflow and update its description with YAML metadata')
    .requiredOption('--automation-id <guid>', 'GUID of the flow or workflow')
    .option('--type <type>', 'Type: flow, workflow (auto-detected if not provided)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.documentAutomation(opts.automationId, opts.type);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  workflow
    .command('deactivate')
    .description('Deactivate a workflow (set to Draft state)')
    .requiredOption('--workflow-id <guid>', 'GUID of the workflow to deactivate')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.deactivateWorkflow(opts.workflowId);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  workflow
    .command('activate')
    .description('Activate a workflow (set to Activated state)')
    .requiredOption('--workflow-id <guid>', 'GUID of the workflow to activate')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.activateWorkflow(opts.workflowId);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  workflow
    .command('document-safe')
    .description('Safely document a workflow: deactivate -> document -> reactivate (atomic with rollback)')
    .requiredOption('--workflow-id <guid>', 'GUID of the workflow to document')
    .option('--type <type>', 'Type: flow, workflow (auto-detected if not provided)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const result = await service.documentWorkflowSafe(opts.workflowId, opts.type);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });
}
