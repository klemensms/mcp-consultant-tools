import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, SECURITY_READER } from './tool-helpers.js';
import type { ComplianceState } from '../models/defender-types.js';

const STANDARD_HINT =
  "Compliance standard name, e.g. 'Azure-CIS-1.1.0' or 'PCI-DSS-3.2.1'. Run defender-list-compliance-standards first - names are exact and vary by subscription.";

export function registerComplianceTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'defender-list-compliance-standards',
    `Regulatory compliance standards enabled on the subscription (Azure CIS, PCI DSS, ISO 27001, NIST, ...), each with its passed/failed/skipped/unsupported control counts. A standard only appears here once it has been enabled in Defender for Cloud's regulatory compliance settings - an empty list means none are enabled, not that the subscription is non-compliant. ${SECURITY_READER}`,
    {},
    READ_ONLY,
    async () => runTool('listing compliance standards', () => ctx.compliance.listStandards())
  );

  server.tool(
    'defender-list-compliance-controls',
    `The controls within one compliance standard, each with its pass/fail state and assessment counts. Filter by state to find what is failing. ${SECURITY_READER}`,
    {
      standardName: z.string().describe(STANDARD_HINT),
      stateFilter: z
        .enum(['Passed', 'Failed', 'Skipped', 'Unsupported'])
        .optional()
        .describe("Filter by control state. 'Failed' is what needs attention."),
    },
    READ_ONLY,
    async (args: { standardName: string; stateFilter?: ComplianceState }) =>
      runTool('listing compliance controls', () => ctx.compliance.listControls(args))
  );

  server.tool(
    'defender-list-compliance-assessments',
    `The individual assessments behind one control of one standard, with per-assessment passed/failed resource counts. This is the drill-down that tells you which resources make a control fail. summary.totalFailedResources sums failing resources across the returned assessments. ${SECURITY_READER}`,
    {
      standardName: z.string().describe(STANDARD_HINT),
      controlName: z
        .string()
        .describe("Control name within the standard, e.g. '1.1'. Run defender-list-compliance-controls to discover them."),
      stateFilter: z
        .enum(['Passed', 'Failed', 'Skipped', 'Unsupported'])
        .optional()
        .describe('Filter by assessment state.'),
    },
    READ_ONLY,
    async (args: { standardName: string; controlName: string; stateFilter?: ComplianceState }) =>
      runTool('listing compliance assessments', () => ctx.compliance.listControlAssessments(args))
  );

  server.tool(
    'defender-get-compliance-summary',
    `Compliance rolled up per standard: passed/failed control counts and a compliance percentage. The percentage counts passed / (passed + failed) - skipped and unsupported controls are excluded from the denominator, matching the Azure portal, so it is not passedControls / totalControls. Pass standardName to focus on one; an unknown name fails with the list of available names rather than reporting 0%. ${SECURITY_READER}`,
    {
      standardName: z
        .string()
        .optional()
        .describe('Optional: focus on a single standard. Omit for all enabled standards.'),
    },
    READ_ONLY,
    async ({ standardName }: { standardName?: string }) =>
      runTool('getting compliance summary', () =>
        ctx.compliance.getComplianceSummary(standardName ? { standardName } : undefined)
      )
  );
}
