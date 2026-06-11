/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerRestCommands } from './rest-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerRestCommands(program, ctx);
}

export { registerRestCommands } from './rest-commands.js';
