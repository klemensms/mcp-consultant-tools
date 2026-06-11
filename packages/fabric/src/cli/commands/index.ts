/**
 * CLI Commands barrel export + combined registration.
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerWorkspaceCommands } from './workspace-commands.js';
import { registerCapacityCommands } from './capacity-commands.js';
import { registerItemCommands } from './item-commands.js';
import { registerShortcutCommands } from './shortcut-commands.js';
import { registerDomainCommands } from './domain-commands.js';
import { registerAdminCommands } from './admin-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerWorkspaceCommands(program, ctx);
  registerCapacityCommands(program, ctx);
  registerItemCommands(program, ctx);
  registerShortcutCommands(program, ctx);
  registerDomainCommands(program, ctx);
  registerAdminCommands(program, ctx);
}

export { registerWorkspaceCommands } from './workspace-commands.js';
export { registerCapacityCommands } from './capacity-commands.js';
export { registerItemCommands } from './item-commands.js';
export { registerShortcutCommands } from './shortcut-commands.js';
export { registerDomainCommands } from './domain-commands.js';
export { registerAdminCommands } from './admin-commands.js';
