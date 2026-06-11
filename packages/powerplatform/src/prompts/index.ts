/**
 * Prompts barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerEntityPrompts } from './entity-prompts.js';
import { registerAnalysisPrompts } from './analysis-prompts.js';

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  registerEntityPrompts(server, ctx);
  registerAnalysisPrompts(server, ctx);

  // 6 entity + 6 analysis = 12
  console.error(`powerplatform prompts registered: 12 prompts`);
}

export { registerEntityPrompts } from './entity-prompts.js';
export { registerAnalysisPrompts } from './analysis-prompts.js';
