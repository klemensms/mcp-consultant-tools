/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerReadTools } from './read-tools.js';
import { registerWriteTools } from './write-tools.js';
import { registerAuthTools } from './auth-tools.js';
import { registerDiscoveryTools } from './discovery-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerAuthTools(server, ctx);
  registerDiscoveryTools(server, ctx);
  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
}

export { registerReadTools } from './read-tools.js';
export { registerWriteTools } from './write-tools.js';
export { registerAuthTools } from './auth-tools.js';
export { registerDiscoveryTools } from './discovery-tools.js';
