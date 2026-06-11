/**
 * CLI commands barrel + combined registration
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerProjectCommands } from './project-commands.js';
import { registerTaskCommands } from './task-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerProjectCommands(program, ctx);
  registerTaskCommands(program, ctx);
}

export { registerProjectCommands } from './project-commands.js';
export { registerTaskCommands } from './task-commands.js';
