/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerAuthCommands } from './auth-commands.js';
import { registerReadCommands } from './read-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerAuthCommands(program, ctx);
  registerReadCommands(program, ctx);
}

export { registerAuthCommands } from './auth-commands.js';
export { registerReadCommands } from './read-commands.js';
