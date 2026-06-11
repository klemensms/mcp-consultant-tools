/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerPipelineCommands } from './pipeline-commands.js';
import { registerEnvironmentCommands } from './environment-commands.js';
import { registerServiceConnectionCommands } from './service-connection-commands.js';
import { registerVariableGroupCommands } from './variable-group-commands.js';
import { registerAgentPoolCommands } from './agent-pool-commands.js';
import { registerClassificationCommands } from './classification-commands.js';
import { registerArtifactFeedCommands } from './artifact-feed-commands.js';
import { registerProjectCommands } from './project-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerPipelineCommands(program, ctx);
  registerEnvironmentCommands(program, ctx);
  registerServiceConnectionCommands(program, ctx);
  registerVariableGroupCommands(program, ctx);
  registerAgentPoolCommands(program, ctx);
  registerClassificationCommands(program, ctx);
  registerArtifactFeedCommands(program, ctx);
  registerProjectCommands(program, ctx);
}

export { registerPipelineCommands } from './pipeline-commands.js';
export { registerEnvironmentCommands } from './environment-commands.js';
export { registerServiceConnectionCommands } from './service-connection-commands.js';
export { registerVariableGroupCommands } from './variable-group-commands.js';
export { registerAgentPoolCommands } from './agent-pool-commands.js';
export { registerClassificationCommands } from './classification-commands.js';
export { registerArtifactFeedCommands } from './artifact-feed-commands.js';
export { registerProjectCommands } from './project-commands.js';
