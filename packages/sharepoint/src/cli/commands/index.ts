/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerReadCommands } from './read-commands.js';
import { registerWriteCommands } from './write-commands.js';
import { registerAuthCommands } from './auth-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerAuthCommands(program, ctx);
  registerReadCommands(program, ctx);
  registerWriteCommands(program, ctx);
}

export { registerReadCommands } from './read-commands.js';
export { registerWriteCommands } from './write-commands.js';
export { registerAuthCommands } from './auth-commands.js';
