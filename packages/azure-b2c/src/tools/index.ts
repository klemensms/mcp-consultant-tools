/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerUserTools } from './user-tools.js';
import { registerGroupTools } from './group-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerUserTools(server, ctx);
  registerGroupTools(server, ctx);
}

export { registerUserTools } from './user-tools.js';
export { registerGroupTools } from './group-tools.js';
