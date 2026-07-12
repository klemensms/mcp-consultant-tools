/**
 * Service context shared between the MCP server (index.ts) and the CLI (cli.ts).
 * Uses lazy getters so a missing credential only surfaces when a tool actually runs.
 */
import type { SecureScoreService } from './services/secure-score-service.js';
import type { AssessmentService } from './services/assessment-service.js';
import type { ComplianceService } from './services/compliance-service.js';
import type { AttackPathService } from './services/attack-path-service.js';

export interface ServiceContext {
  readonly secureScore: SecureScoreService;
  readonly assessment: AssessmentService;
  readonly compliance: ComplianceService;
  readonly attackPath: AttackPathService;
}
