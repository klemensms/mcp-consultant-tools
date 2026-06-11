/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerAppInsightsCommands } from './appinsights-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerAppInsightsCommands(program, ctx);
}

export { registerAppInsightsCommands } from './appinsights-commands.js';
