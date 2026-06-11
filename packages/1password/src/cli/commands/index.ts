/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerSecretCommands } from './secret-commands.js';
import { registerItemCommands } from './item-commands.js';
import { registerVaultCommands } from './vault-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerSecretCommands(program, ctx);
  registerItemCommands(program, ctx);
  registerVaultCommands(program, ctx);
}

export { registerSecretCommands } from './secret-commands.js';
export { registerItemCommands } from './item-commands.js';
export { registerVaultCommands } from './vault-commands.js';
