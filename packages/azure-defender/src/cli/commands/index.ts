/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerSecureScoreCommands } from './secure-score-commands.js';
import { registerAssessmentCommands } from './assessment-commands.js';
import { registerComplianceCommands } from './compliance-commands.js';
import { registerAttackPathCommands } from './attack-path-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerSecureScoreCommands(program, ctx);
  registerAssessmentCommands(program, ctx);
  registerComplianceCommands(program, ctx);
  registerAttackPathCommands(program, ctx);
}

export { registerSecureScoreCommands } from './secure-score-commands.js';
export { registerAssessmentCommands } from './assessment-commands.js';
export { registerComplianceCommands } from './compliance-commands.js';
export { registerAttackPathCommands } from './attack-path-commands.js';
