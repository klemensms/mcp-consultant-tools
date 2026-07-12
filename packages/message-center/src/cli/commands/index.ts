/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerHealthCommands } from './health-commands.js';
import { registerMessageCommands } from './message-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerHealthCommands(program, ctx);
  registerMessageCommands(program, ctx);
}

export { registerHealthCommands } from './health-commands.js';
export { registerMessageCommands } from './message-commands.js';
