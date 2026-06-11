/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerEntityCommands } from './entity-commands.js';
import { registerAttributeCommands } from './attribute-commands.js';
import { registerAppCommands } from './app-commands.js';
import { registerIntegrationCommands } from './integration-commands.js';
import { registerWebhookCommands } from './webhook-commands.js';
import { registerOptionsetCommands } from './optionset-commands.js';
import { registerFlowCommands } from './flow-commands.js';
import { registerFormCommands } from './form-commands.js';
import { registerViewCommands } from './view-commands.js';
import { registerPluginCommands } from './plugin-commands.js';
import { registerRelationshipCommands } from './relationship-commands.js';
import { registerSolutionCommands } from './solution-commands.js';
import { registerWebresourceCommands } from './webresource-commands.js';
import { registerWorkflowCommands } from './workflow-commands.js';
import { registerFieldSecurityCommands } from './field-security-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerEntityCommands(program, ctx);
  registerAttributeCommands(program, ctx);
  registerAppCommands(program, ctx);
  registerIntegrationCommands(program, ctx);
  registerWebhookCommands(program, ctx);
  registerOptionsetCommands(program, ctx);
  registerFlowCommands(program, ctx);
  registerFormCommands(program, ctx);
  registerViewCommands(program, ctx);
  registerPluginCommands(program, ctx);
  registerRelationshipCommands(program, ctx);
  registerSolutionCommands(program, ctx);
  registerWebresourceCommands(program, ctx);
  registerWorkflowCommands(program, ctx);
  registerFieldSecurityCommands(program, ctx);
}

export { registerFieldSecurityCommands } from './field-security-commands.js';
export { registerEntityCommands } from './entity-commands.js';
export { registerAttributeCommands } from './attribute-commands.js';
export { registerAppCommands } from './app-commands.js';
export { registerIntegrationCommands } from './integration-commands.js';
export { registerWebhookCommands } from './webhook-commands.js';
export { registerOptionsetCommands } from './optionset-commands.js';
export { registerFlowCommands } from './flow-commands.js';
export { registerFormCommands } from './form-commands.js';
export { registerViewCommands } from './view-commands.js';
export { registerPluginCommands } from './plugin-commands.js';
export { registerRelationshipCommands } from './relationship-commands.js';
export { registerSolutionCommands } from './solution-commands.js';
export { registerWebresourceCommands } from './webresource-commands.js';
export { registerWorkflowCommands } from './workflow-commands.js';
