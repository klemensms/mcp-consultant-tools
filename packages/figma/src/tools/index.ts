/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerFigmaTools } from './figma-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerFigmaTools(server, ctx);
}

export { registerFigmaTools } from './figma-tools.js';
