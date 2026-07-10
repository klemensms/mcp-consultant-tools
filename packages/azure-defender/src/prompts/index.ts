import type { ServiceContext } from '../types.js';
import {
  SECURITY_POSTURE_REVIEW_TEMPLATE,
  COMPLIANCE_AUDIT_TEMPLATE,
  ATTACK_PATH_ANALYSIS_TEMPLATE,
} from './templates.js';

function staticPrompt(server: any, name: string, description: string, text: string): void {
  server.prompt(name, description, {}, async () => ({
    messages: [{ role: 'user', content: { type: 'text', text } }],
  }));
}

export function registerAllPrompts(server: any, _ctx: ServiceContext): void {
  staticPrompt(
    server,
    'defender-security-posture-review',
    'Review overall Defender for Cloud security posture: secure score, controls, and unhealthy recommendations',
    SECURITY_POSTURE_REVIEW_TEMPLATE
  );

  staticPrompt(
    server,
    'defender-compliance-audit',
    'Audit regulatory compliance posture across the standards enabled on the subscription',
    COMPLIANCE_AUDIT_TEMPLATE
  );

  staticPrompt(
    server,
    'defender-attack-path-analysis',
    'Investigate Defender CSPM attack paths and plan remediation by how many paths each fix breaks',
    ATTACK_PATH_ANALYSIS_TEMPLATE
  );
}

export {
  SECURITY_POSTURE_REVIEW_TEMPLATE,
  COMPLIANCE_AUDIT_TEMPLATE,
  ATTACK_PATH_ANALYSIS_TEMPLATE,
} from './templates.js';
