/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerWikiCommands } from './wiki-commands.js';
import { registerWorkItemCommands } from './work-item-commands.js';
import { registerPullRequestCommands } from './pull-request-commands.js';
import { registerBuildCommands } from './build-commands.js';
import { registerGitCommands } from './git-commands.js';
import { registerVariableGroupCommands } from './variable-group-commands.js';
import { registerSyncCommands } from './sync-commands.js';
import { registerConfigurationCommands } from './configuration-commands.js';
import { registerChecklistCommands } from './checklist-commands.js';
import { registerTestCommands } from './test-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerConfigurationCommands(program, ctx);
  registerWikiCommands(program, ctx);
  registerWorkItemCommands(program, ctx);
  registerPullRequestCommands(program, ctx);
  registerBuildCommands(program, ctx);
  registerGitCommands(program, ctx);
  registerVariableGroupCommands(program, ctx);
  registerSyncCommands(program, ctx);
  registerChecklistCommands(program, ctx);
  registerTestCommands(program, ctx);
}

export { registerWikiCommands } from './wiki-commands.js';
export { registerWorkItemCommands } from './work-item-commands.js';
export { registerPullRequestCommands } from './pull-request-commands.js';
export { registerBuildCommands } from './build-commands.js';
export { registerGitCommands } from './git-commands.js';
export { registerVariableGroupCommands } from './variable-group-commands.js';
export { registerSyncCommands } from './sync-commands.js';
export { registerConfigurationCommands } from './configuration-commands.js';
export { registerChecklistCommands } from './checklist-commands.js';
export { registerTestCommands } from './test-commands.js';
