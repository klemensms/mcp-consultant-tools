import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, SECURITY_READER } from './tool-helpers.js';
import type { AssessmentStatusCode, AssessmentSeverity } from '../models/defender-types.js';

export function registerAssessmentTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'defender-list-assessments',
    `Security assessments (the recommendations Defender for Cloud raises against your resources), optionally filtered by health status. Reads TWO sources and unions them, because neither is complete: the ARM list only covers assessments on resources inside the subscription, so assessments scoped to the subscription itself or to an identity object (the RBAC recommendations: disabled accounts with owner permissions, guest accounts with write permissions, overprovisioned identities) come from Azure Resource Graph instead; Resource Graph in turn returns nothing on a subscription with no paid Defender plan, where ARM still does. summary.sources reports what each contributed and summary.note appears whenever the list is known to be incomplete, so read it. Neither source filters on status server-side, so both are scanned in full before statusFilter and maxResults are applied; expect a subscription-wide scan on every call. summary.byStatus counts only the assessments actually returned; when truncated is true those counts are a lower bound. Each row carries a resourceDetails describing the assessed resource, and (from api-version 2025-05-04) a risk object with the attack paths that reference it — though on a real estate none of 4,886 unhealthy assessments carried one, so treat an absent risk object as unreported rather than as no risk. A properties key this package does not map arrives in properties.unmappedProperties on the row, and summary.unmappedPropertyKeys names the distinct ones across every row read; check that before concluding a field is absent, because the sibling attack-path mapper's documented allowlist silently discarded a whole risk payload. ${SECURITY_READER} Resource Graph read access is needed as well, and a refusal there is reported in fanOut.failures rather than failing the call.`,
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
