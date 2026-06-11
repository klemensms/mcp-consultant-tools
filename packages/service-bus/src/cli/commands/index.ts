/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerNamespaceCommands } from './namespace-commands.js';
import { registerQueueCommands } from './queue-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerNamespaceCommands(program, ctx);
  registerQueueCommands(program, ctx);
}

export { registerNamespaceCommands } from './namespace-commands.js';
export { registerQueueCommands } from './queue-commands.js';
