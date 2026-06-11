/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerRestTools } from './rest-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerRestTools(server, ctx);
}

export { registerRestTools } from './rest-tools.js';
