/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerUserCommands } from './user-commands.js';
import { registerGroupCommands } from './group-commands.js';
import { registerTenantCommands } from './tenant-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerUserCommands(program, ctx);
  registerGroupCommands(program, ctx);
  registerTenantCommands(program, ctx);
}

export { registerUserCommands } from './user-commands.js';
export { registerGroupCommands } from './group-commands.js';
export { registerTenantCommands } from './tenant-commands.js';
