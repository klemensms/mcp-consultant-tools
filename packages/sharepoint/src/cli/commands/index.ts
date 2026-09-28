/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerReadCommands } from './read-commands.js';
import { registerWriteCommands } from './write-commands.js';
import { registerAuthCommands } from './auth-commands.js';
import { registerDiscoveryCommands } from './discovery-commands.js';
import { registerContentCommands } from './content-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerAuthCommands(program, ctx);
  registerDiscoveryCommands(program, ctx);
  registerReadCommands(program, ctx);
  registerWriteCommands(program, ctx);
  registerContentCommands(program, ctx);
}

export { registerReadCommands } from './read-commands.js';
export { registerWriteCommands } from './write-commands.js';
export { registerAuthCommands } from './auth-commands.js';
export { registerDiscoveryCommands } from './discovery-commands.js';
export { registerContentCommands } from './content-commands.js';
