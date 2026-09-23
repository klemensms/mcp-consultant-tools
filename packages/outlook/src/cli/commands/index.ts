/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerAuthCommands } from './auth-commands.js';
import { registerReadCommands } from './read-commands.js';
import { registerWriteCommands } from './write-commands.js';
import { registerSendCommands } from './send-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerAuthCommands(program, ctx);
  registerReadCommands(program, ctx);
  registerWriteCommands(program, ctx);
  registerSendCommands(program, ctx);
}

export { registerAuthCommands } from './auth-commands.js';
export { registerReadCommands } from './read-commands.js';
export { registerWriteCommands } from './write-commands.js';
export { registerSendCommands } from './send-commands.js';
