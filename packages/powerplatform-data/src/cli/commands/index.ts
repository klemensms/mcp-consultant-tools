/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerDataCommands } from './data-commands.js';
import { registerMetadataCommands } from './metadata-commands.js';
import { registerEmailCommands } from './email-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerDataCommands(program, ctx);
  registerMetadataCommands(program, ctx);
  registerEmailCommands(program, ctx);
}

export { registerDataCommands } from './data-commands.js';
export { registerMetadataCommands } from './metadata-commands.js';
export { registerEmailCommands } from './email-commands.js';
