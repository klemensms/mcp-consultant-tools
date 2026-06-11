/**
 * Prompts barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerServiceBusPrompts } from './templates.js';

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  registerServiceBusPrompts(server, ctx);
}

export { registerServiceBusPrompts } from './templates.js';
