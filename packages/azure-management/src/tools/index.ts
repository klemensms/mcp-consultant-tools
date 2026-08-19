import type { ServiceContext } from '../types.js';
import { registerResourceTools } from './resource-tools.js';
import { registerComputeTools } from './compute-tools.js';
import { registerFunctionAppTools } from './function-app-tools.js';
import { registerAppServiceTools } from './app-service-tools.js';
import { registerKeyVaultTools } from './key-vault-tools.js';
import { registerStorageTools } from './storage-tools.js';
import { registerSqlTools } from './sql-tools.js';
import { registerMonitoringTools } from './monitoring-tools.js';
import { registerLogicAppTools } from './logic-app-tools.js';
import { registerNetworkingTools } from './networking-tools.js';
import { registerResourceGraphTools } from './resource-graph-tools.js';
import { registerLogStreamTools } from './log-stream-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerResourceTools(server, ctx);
  registerComputeTools(server, ctx);
  registerFunctionAppTools(server, ctx);
  registerAppServiceTools(server, ctx);
  registerKeyVaultTools(server, ctx);
  registerStorageTools(server, ctx);
  registerSqlTools(server, ctx);
  registerMonitoringTools(server, ctx);
  registerLogicAppTools(server, ctx);
  registerNetworkingTools(server, ctx);
  registerResourceGraphTools(server, ctx);
  registerLogStreamTools(server, ctx);
}

export {
  registerResourceTools,
  registerComputeTools,
  registerFunctionAppTools,
  registerAppServiceTools,
  registerKeyVaultTools,
  registerStorageTools,
  registerSqlTools,
  registerMonitoringTools,
  registerLogicAppTools,
  registerNetworkingTools,
  registerResourceGraphTools,
  registerLogStreamTools,
};
