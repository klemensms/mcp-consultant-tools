import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, SECURITY_READER } from './tool-helpers.js';
import type { AssessmentStatusCode, AssessmentSeverity } from '../models/defender-types.js';

export function registerAssessmentTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'defender-list-assessments',
    `Security assessments (the recommendations Defender for Cloud raises against your resources), optionally filtered by health status. The ARM endpoint has no server-side status filter, so setting statusFilter scans every assessment in the subscription before trimming — expect it to be slower, not faster. summary.byStatus counts only the assessments actually returned; when truncated is true, maxResults cut the list and those counts are a lower bound. Omit maxResults for subscription-wide totals. Each row carries a resourceDetails describing the assessed resource, and (from api-version 2025-05-04) a risk object with the attack paths that reference it. ${SECURITY_READER}`,
    {
      statusFilter: z
        .enum(['Healthy', 'Unhealthy', 'NotApplicable'])
        .optional()
        .describe("Filter by assessment status. 'Unhealthy' is what needs remediation."),
      maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum assessments to return. Omit for all — a busy subscription can have thousands.'),
    },
    READ_ONLY,
    async (args: { statusFilter?: AssessmentStatusCode; maxResults?: number }) =>
      runTool('listing assessments', () => ctx.assessment.listAssessments(args))
  );

  server.tool(
    'defender-get-assessment',
    `One security assessment for one specific resource. Needs both the resource's full ARM ID and the assessment's name (a GUID). Get the pair from defender-list-assessments — each row's id embeds both. resourceId must start with '/subscriptions/'; a bare resource name will be rejected rather than silently queried against the wrong path. ${SECURITY_READER}`,
    {
      resourceId: z
        .string()
        .describe(
          "Full ARM resource ID, e.g. '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/resourceGroups/my-rg/providers/Microsoft.Compute/virtualMachines/my-vm'"
        ),
      assessmentName: z
        .string()
        .describe("Assessment name/GUID, e.g. 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'"),
    },
    READ_ONLY,
    async (args: { resourceId: string; assessmentName: string }) =>
      runTool('getting assessment', () => ctx.assessment.getAssessment(args))
  );

  server.tool(
    'defender-list-assessment-metadata',
    `The catalogue of assessment definitions available in the subscription — severity, categories, remediation text, threats, and MITRE tactics/techniques. This describes what each assessment MEANS; defender-list-assessments describes which resources currently fail it. Severity includes 'Critical', which only exists from api-version 2025-05-04 onwards. summary.byCategory counts each category an assessment belongs to, so it sums to more than summary.total. ${SECURITY_READER}`,
    {
      severityFilter: z
        .enum(['Critical', 'High', 'Medium', 'Low'])
        .optional()
        .describe('Filter by severity level. Matched case-insensitively.'),
    },
    READ_ONLY,
    async (args: { severityFilter?: AssessmentSeverity }) =>
      runTool('listing assessment metadata', () => ctx.assessment.listAssessmentMetadata(args))
  );
}
