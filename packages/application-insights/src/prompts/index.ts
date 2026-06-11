/**
 * Prompts barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerAppInsightsPrompts } from './templates.js';

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  registerAppInsightsPrompts(server, ctx);
}

export { registerAppInsightsPrompts } from './templates.js';
