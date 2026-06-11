/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerReadTools } from './read-tools.js';
import { registerWriteTools } from './write-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
}

export { registerReadTools } from './read-tools.js';
export { registerWriteTools } from './write-tools.js';
