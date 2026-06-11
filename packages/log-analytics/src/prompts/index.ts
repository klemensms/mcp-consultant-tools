/**
 * Prompts barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerLogAnalyticsPrompts } from './templates.js';

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  registerLogAnalyticsPrompts(server, ctx);
}

export { registerLogAnalyticsPrompts } from './templates.js';
