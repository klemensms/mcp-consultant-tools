/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerFactoryCommands } from './factory-commands.js';
import { registerPipelineCommands } from './pipeline-commands.js';
import { registerDatasetCommands } from './dataset-commands.js';
import { registerLinkedServiceCommands } from './linked-service-commands.js';
import { registerDataFlowCommands } from './data-flow-commands.js';
import { registerTriggerCommands } from './trigger-commands.js';
import { registerIntegrationRuntimeCommands } from './integration-runtime-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerFactoryCommands(program, ctx);
  registerPipelineCommands(program, ctx);
  registerDatasetCommands(program, ctx);
  registerLinkedServiceCommands(program, ctx);
  registerDataFlowCommands(program, ctx);
  registerTriggerCommands(program, ctx);
  registerIntegrationRuntimeCommands(program, ctx);
}

export { registerFactoryCommands } from './factory-commands.js';
export { registerPipelineCommands } from './pipeline-commands.js';
export { registerDatasetCommands } from './dataset-commands.js';
export { registerLinkedServiceCommands } from './linked-service-commands.js';
export { registerDataFlowCommands } from './data-flow-commands.js';
export { registerTriggerCommands } from './trigger-commands.js';
export { registerIntegrationRuntimeCommands } from './integration-runtime-commands.js';
