/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerQueryCommands } from './query-commands.js';
import { registerConnectionCommands } from './connection-commands.js';
import { registerViewCommands } from './view-commands.js';
import { registerSprocCommands } from './sproc-commands.js';
import { registerCrudCommands } from './crud-commands.js';
import { registerUnrestrictedCommands } from './unrestricted-commands.js';
import { registerPerformanceCommands } from './performance-commands.js';
import { registerSessionCommands } from './session-commands.js';
import { registerSpaceCommands } from './space-commands.js';
import { registerIndexCommands } from './index-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerQueryCommands(program, ctx);
  registerConnectionCommands(program, ctx);
  registerViewCommands(program, ctx);
  registerSprocCommands(program, ctx);
  registerCrudCommands(program, ctx);
  registerUnrestrictedCommands(program, ctx);
  registerPerformanceCommands(program, ctx);
  registerSessionCommands(program, ctx);
  registerSpaceCommands(program, ctx);
  registerIndexCommands(program, ctx);
}

export { registerQueryCommands } from './query-commands.js';
export { registerConnectionCommands } from './connection-commands.js';
export { registerViewCommands } from './view-commands.js';
export { registerSprocCommands } from './sproc-commands.js';
export { registerCrudCommands } from './crud-commands.js';
export { registerUnrestrictedCommands } from './unrestricted-commands.js';
export { registerPerformanceCommands } from './performance-commands.js';
export { registerSessionCommands } from './session-commands.js';
export { registerSpaceCommands } from './space-commands.js';
export { registerIndexCommands } from './index-commands.js';
