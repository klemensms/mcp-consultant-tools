/**
 * Prompts barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerGhePrompts } from './templates.js';

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  registerGhePrompts(server, ctx);
}

export { registerGhePrompts } from './templates.js';
