/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerMetadataCommands } from './metadata-commands.js';
import { registerPluginCommands } from './plugin-commands.js';
import { registerFlowCommands } from './flow-commands.js';
import { registerAppCommands } from './app-commands.js';
import { registerFormCommands } from './form-commands.js';
import { registerSolutionCommands } from './solution-commands.js';
import { registerIntegrationCommands } from './integration-commands.js';
import { registerSecurityCommands } from './security-commands.js';
import { registerFieldSecurityCommands } from './field-security-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerMetadataCommands(program, ctx);
  registerPluginCommands(program, ctx);
  registerFlowCommands(program, ctx);
  registerAppCommands(program, ctx);
  registerFormCommands(program, ctx);
  registerSolutionCommands(program, ctx);
  registerIntegrationCommands(program, ctx);
  registerSecurityCommands(program, ctx);
  registerFieldSecurityCommands(program, ctx);
}

export { registerMetadataCommands } from './metadata-commands.js';
export { registerPluginCommands } from './plugin-commands.js';
export { registerFlowCommands } from './flow-commands.js';
export { registerAppCommands } from './app-commands.js';
export { registerFormCommands } from './form-commands.js';
export { registerSolutionCommands } from './solution-commands.js';
export { registerIntegrationCommands } from './integration-commands.js';
export { registerSecurityCommands } from './security-commands.js';
export { registerFieldSecurityCommands } from './field-security-commands.js';
