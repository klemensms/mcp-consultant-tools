import type { ServiceContext } from '../types.js';
import { registerSecureScoreTools } from './secure-score-tools.js';
import { registerAssessmentTools } from './assessment-tools.js';
import { registerComplianceTools } from './compliance-tools.js';
import { registerAttackPathTools } from './attack-path-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerSecureScoreTools(server, ctx);
  registerAssessmentTools(server, ctx);
  registerComplianceTools(server, ctx);
  registerAttackPathTools(server, ctx);
}

export { registerSecureScoreTools } from './secure-score-tools.js';
export { registerAssessmentTools } from './assessment-tools.js';
export { registerComplianceTools } from './compliance-tools.js';
export { registerAttackPathTools } from './attack-path-tools.js';
