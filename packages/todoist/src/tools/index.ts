/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerProjectTools } from './project-tools.js';
import { registerTaskTools } from './task-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerProjectTools(server, ctx);
  registerTaskTools(server, ctx);
  console.error('todoist tools registered: 12 tools');
}

export { registerProjectTools } from './project-tools.js';
export { registerTaskTools } from './task-tools.js';
