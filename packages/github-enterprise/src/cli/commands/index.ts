/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerBranchCommands } from './branch-commands.js';
import { registerCommitCommands } from './commit-commands.js';
import { registerFileCommands } from './file-commands.js';
import { registerPrCommands } from './pr-commands.js';
import { registerRepoCommands } from './repo-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerRepoCommands(program, ctx);
  registerBranchCommands(program, ctx);
  registerCommitCommands(program, ctx);
  registerFileCommands(program, ctx);
  registerPrCommands(program, ctx);
}

export { registerBranchCommands } from './branch-commands.js';
export { registerCommitCommands } from './commit-commands.js';
export { registerFileCommands } from './file-commands.js';
export { registerPrCommands } from './pr-commands.js';
export { registerRepoCommands } from './repo-commands.js';
