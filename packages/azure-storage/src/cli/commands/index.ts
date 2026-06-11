/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerBlobCommands } from './blob-commands.js';
import { registerFileCommands } from './file-commands.js';
import { registerQueueCommands } from './queue-commands.js';
import { registerTableCommands } from './table-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerBlobCommands(program, ctx);
  registerFileCommands(program, ctx);
  registerQueueCommands(program, ctx);
  registerTableCommands(program, ctx);
}

export { registerBlobCommands } from './blob-commands.js';
export { registerFileCommands } from './file-commands.js';
export { registerQueueCommands } from './queue-commands.js';
export { registerTableCommands } from './table-commands.js';
