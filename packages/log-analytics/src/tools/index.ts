/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerQueryTools } from './query-tools.js';
import { registerWorkspaceTools } from './workspace-tools.js';
import { registerFunctionTools } from './function-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerWorkspaceTools(server, ctx);
  registerQueryTools(server, ctx);
  registerFunctionTools(server, ctx);
}

export { registerQueryTools } from './query-tools.js';
export { registerWorkspaceTools } from './workspace-tools.js';
export { registerFunctionTools } from './function-tools.js';
