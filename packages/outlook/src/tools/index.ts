/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerAuthTools } from './auth-tools.js';
import { registerReadTools } from './read-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerAuthTools(server, ctx);
  registerReadTools(server, ctx);
}

export { registerAuthTools } from './auth-tools.js';
export { registerReadTools } from './read-tools.js';
