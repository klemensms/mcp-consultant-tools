import type { ServiceContext } from '../types.js';
import { registerPipelineTools } from './pipeline-tools.js';
import { registerDatasetTools } from './dataset-tools.js';
import { registerLinkedServiceTools } from './linked-service-tools.js';
import { registerTriggerTools } from './trigger-tools.js';
import { registerMonitoringTools } from './monitoring-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerPipelineTools(server, ctx);
  registerDatasetTools(server, ctx);
  registerLinkedServiceTools(server, ctx);
  registerTriggerTools(server, ctx);
  registerMonitoringTools(server, ctx);
}

export { registerPipelineTools } from './pipeline-tools.js';
export { registerDatasetTools } from './dataset-tools.js';
export { registerLinkedServiceTools } from './linked-service-tools.js';
export { registerTriggerTools } from './trigger-tools.js';
export { registerMonitoringTools } from './monitoring-tools.js';
