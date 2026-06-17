/**
 * Tools barrel export + combined registration with tier-based counting.
 */
import type { ServiceContext } from '../types.js';
import { registerPipelineTools } from './pipeline-tools.js';
import { registerServiceConnectionTools } from './service-connection-tools.js';
import { registerVariableGroupTools } from './variable-group-tools.js';
import { registerAgentPoolTools } from './agent-pool-tools.js';
import { registerEnvironmentTools } from './environment-tools.js';
import { registerClassificationTools } from './classification-tools.js';
import { registerIterationCapacityTools } from './iteration-capacity-tools.js';
import { registerArtifactFeedTools } from './artifact-feed-tools.js';
import { registerProjectTools } from './project-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  let totalReadonly = 0;
  let totalUpsert = 0;
  let totalDelete = 0;

  const groups = [
    registerPipelineTools(server, ctx),
    registerServiceConnectionTools(server, ctx),
    registerVariableGroupTools(server, ctx),
    registerAgentPoolTools(server, ctx),
    registerEnvironmentTools(server, ctx),
    registerClassificationTools(server, ctx),
    registerIterationCapacityTools(server, ctx),
    registerArtifactFeedTools(server, ctx),
    registerProjectTools(server, ctx),
  ];

  for (const g of groups) {
    totalReadonly += g.readonly;
    totalUpsert += g.upsert;
    totalDelete += g.delete;
  }

  const total = totalReadonly + totalUpsert + totalDelete;
  console.error(`azure-devops-admin tools registered: ${total} tools (${totalReadonly} readonly + ${totalUpsert} upsert + ${totalDelete} delete)`);
}

export { registerPipelineTools } from './pipeline-tools.js';
export { registerServiceConnectionTools } from './service-connection-tools.js';
export { registerVariableGroupTools } from './variable-group-tools.js';
export { registerAgentPoolTools } from './agent-pool-tools.js';
export { registerEnvironmentTools } from './environment-tools.js';
export { registerClassificationTools } from './classification-tools.js';
export { registerIterationCapacityTools } from './iteration-capacity-tools.js';
export { registerArtifactFeedTools } from './artifact-feed-tools.js';
export { registerProjectTools } from './project-tools.js';
