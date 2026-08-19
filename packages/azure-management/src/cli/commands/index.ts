/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerResourceCommands } from './resource-commands.js';
import { registerComputeCommands } from './compute-commands.js';
import { registerFunctionAppCommands } from './function-app-commands.js';
import { registerAppServiceCommands } from './app-service-commands.js';
import { registerKeyVaultCommands } from './key-vault-commands.js';
import { registerMonitoringCommands } from './monitoring-commands.js';
import { registerNetworkingCommands } from './networking-commands.js';
import { registerSqlCommands } from './sql-commands.js';
import { registerStorageCommands } from './storage-commands.js';
import { registerResourceGraphCommands } from './resource-graph-commands.js';
import { registerLogStreamCommands } from './log-stream-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerResourceCommands(program, ctx);
  registerComputeCommands(program, ctx);
  registerFunctionAppCommands(program, ctx);
  registerAppServiceCommands(program, ctx);
  registerKeyVaultCommands(program, ctx);
  registerMonitoringCommands(program, ctx);
  registerNetworkingCommands(program, ctx);
  registerSqlCommands(program, ctx);
  registerStorageCommands(program, ctx);
  registerResourceGraphCommands(program, ctx);
  registerLogStreamCommands(program, ctx);
}

export { registerResourceCommands } from './resource-commands.js';
export { registerComputeCommands } from './compute-commands.js';
export { registerFunctionAppCommands } from './function-app-commands.js';
export { registerAppServiceCommands } from './app-service-commands.js';
export { registerKeyVaultCommands } from './key-vault-commands.js';
export { registerMonitoringCommands } from './monitoring-commands.js';
export { registerNetworkingCommands } from './networking-commands.js';
export { registerSqlCommands } from './sql-commands.js';
export { registerStorageCommands } from './storage-commands.js';
export { registerResourceGraphCommands } from './resource-graph-commands.js';
export { registerLogStreamCommands } from './log-stream-commands.js';
