/**
 * Prompts barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerB2CPrompts } from './templates.js';

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  registerB2CPrompts(server, ctx);
}

export { registerB2CPrompts } from './templates.js';
