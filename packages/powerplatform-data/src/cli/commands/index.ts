/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerDataCommands } from './data-commands.js';
import { registerMetadataCommands } from './metadata-commands.js';
import { registerFlowCommands } from './flow-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerDataCommands(program, ctx);
  registerMetadataCommands(program, ctx);
  registerFlowCommands(program, ctx);
}

export { registerDataCommands } from './data-commands.js';
export { registerMetadataCommands } from './metadata-commands.js';
export { registerFlowCommands } from './flow-commands.js';
