/**
 * Prompts barrel export + combined registration.
 */
import type { ServiceContext } from '../types.js';
import { registerFabricPrompts } from './templates.js';

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  registerFabricPrompts(server, ctx);
}

export { registerFabricPrompts } from './templates.js';
