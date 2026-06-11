/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerRepoTools } from './repo-tools.js';
import { registerPrTools } from './pr-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerRepoTools(server, ctx);
  registerPrTools(server, ctx);
}

export { registerRepoTools } from './repo-tools.js';
export { registerPrTools } from './pr-tools.js';
