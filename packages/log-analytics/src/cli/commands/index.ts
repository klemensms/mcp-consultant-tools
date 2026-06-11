/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerQueryCommands } from './query-commands.js';
import { registerFunctionCommands } from './function-commands.js';
import { registerWorkspaceCommands } from './workspace-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerQueryCommands(program, ctx);
  registerFunctionCommands(program, ctx);
  registerWorkspaceCommands(program, ctx);
}

export { registerQueryCommands } from './query-commands.js';
export { registerFunctionCommands } from './function-commands.js';
export { registerWorkspaceCommands } from './workspace-commands.js';
