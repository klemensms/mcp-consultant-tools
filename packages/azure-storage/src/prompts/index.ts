/**
 * Prompts barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerStoragePrompts } from './templates.js';

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  registerStoragePrompts(server, ctx);
}

export { registerStoragePrompts } from './templates.js';
