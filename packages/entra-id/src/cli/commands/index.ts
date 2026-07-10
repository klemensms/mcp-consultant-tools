/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerAppRegistrationCommands } from './app-registration-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerAppRegistrationCommands(program, ctx);
}

export { registerAppRegistrationCommands } from './app-registration-commands.js';
