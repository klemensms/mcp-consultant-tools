import type { DefenderClient } from '../defender-client.js';
import { DEFENDER_API_VERSIONS } from '../utils/defender-api-versions.js';
import type {
  SecurityAssessment,
  AssessmentMetadata,
  AssessmentStatusCode,
  AssessmentSeverity,
} from '../models/defender-types.js';

/**
 * `getAssessment` appends a provider segment to a caller-supplied ARM resource ID.
 * A malformed ID would otherwise produce a request against the wrong path — or,
 * with a full URL, against a different host.
 */
export function normalizeArmResourceId(resourceId: string): string {
  const trimmed = resourceId.trim();
  if (!trimmed.startsWith('/subscriptions/')) {
    throw new Error(
      `resourceId must be a full ARM resource ID starting with '/subscriptions/', got: '${resourceId}'`
    );
  }
  return trimmed.replace(/\/+$/, '');
}

export interface AssessmentsResult {
  assessments: SecurityAssessment[];
  truncated: boolean;
  summary: {
    total: number;
    byStatus: Record<string, number>;
  };
}

export interface AssessmentMetadataResult {
  metadata: AssessmentMetadata[];
  summary: {
    total: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };
}

/** Counts cover exactly the assessments passed in. Exported for unit tests. */
export function summariseAssessments(
  assessments: SecurityAssessment[]
): AssessmentsResult['summary'] {
  const byStatus: Record<string, number> = {};
  for (const assessment of assessments) {
    const status = assessment.properties?.status?.code ?? 'Unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }
  return { total: assessments.length, byStatus };
}

export function summariseAssessmentMetadata(
  metadata: AssessmentMetadata[]
): AssessmentMetadataResult['summary'] {
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const item of metadata) {
    const severity = item.properties?.severity ?? 'Unknown';
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;

    for (const category of item.properties?.categories ?? []) {
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }
  }

  return { total: metadata.length, bySeverity, byCategory };
}

export class AssessmentService {
  constructor(private client: DefenderClient) {}

  /**
   * `statusFilter` is applied client-side — the ARM list endpoint has no status
   * filter — so filtering forces a full scan before `maxResults` can be honoured.
   * Truncating first (as the ported source did) would hide matches beyond the cut.
   */
  async listAssessments(options?: {
    statusFilter?: AssessmentStatusCode;
    maxResults?: number;
  }): Promise<AssessmentsResult> {
    const path = this.client.subscriptionPath('/providers/Microsoft.Security/assessments');
    const { maxResults, statusFilter } = options ?? {};

    let assessments: SecurityAssessment[];
    let truncated: boolean;

    if (statusFilter) {
      const page = await this.client.paginate<SecurityAssessment>(
        path,
        DEFENDER_API_VERSIONS.assessments
      );
      const matching = page.items.filter((a) => a.properties?.status?.code === statusFilter);
      truncated = maxResults !== undefined && matching.length > maxResults;
      assessments = truncated ? matching.slice(0, maxResults) : matching;
    } else {
      const page = await this.client.paginate<SecurityAssessment>(
        path,
        DEFENDER_API_VERSIONS.assessments,
        undefined,
        maxResults
      );
      assessments = page.items;
      truncated = page.truncated;
    }

    return { assessments, truncated, summary: summariseAssessments(assessments) };
  }

  async getAssessment(options: {
    resourceId: string;
    assessmentName: string;
  }): Promise<SecurityAssessment> {
    const scope = normalizeArmResourceId(options.resourceId);
    const path = `${scope}/providers/Microsoft.Security/assessments/${encodeURIComponent(options.assessmentName)}`;
    return this.client.get<SecurityAssessment>(path, DEFENDER_API_VERSIONS.assessments);
  }

  async listAssessmentMetadata(options?: {
    severityFilter?: AssessmentSeverity;
  }): Promise<AssessmentMetadataResult> {
    const path = this.client.subscriptionPath('/providers/Microsoft.Security/assessmentMetadata');
    const { items } = await this.client.paginate<AssessmentMetadata>(
      path,
      DEFENDER_API_VERSIONS.assessmentMetadata
    );

    const severityFilter = options?.severityFilter;
    const metadata = severityFilter
      ? items.filter(
          (m) => m.properties?.severity?.toLowerCase() === severityFilter.toLowerCase()
        )
      : items;

    return { metadata, summary: summariseAssessmentMetadata(metadata) };
  }
}
