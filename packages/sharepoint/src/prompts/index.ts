/**
 * Prompts barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerSharePointPrompts } from './templates.js';

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  registerSharePointPrompts(server, ctx);
}

export { registerSharePointPrompts } from './templates.js';
