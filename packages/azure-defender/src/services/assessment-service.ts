import { FanOutRecorder, type FanOutInfo } from '@mcp-consultant-tools/core';
import type { DefenderClient } from '../defender-client.js';
import { DEFENDER_API_VERSIONS } from '../utils/defender-api-versions.js';
import { kqlString } from '../utils/kql.js';
import { queryResourceGraph } from '../utils/resource-graph.js';
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

/** What one of the two assessment sources contributed. */
export interface AssessmentSourceReport {
  /** Rows the source returned, before the union deduplicated them. */
  returned: number;
  /** Rows only this source had. Its blind spot is the other source's `unique`. */
  unique: number;
  /** False when the source could not be read at all. See `fanOut.failures`. */
  available: boolean;
}

export interface AssessmentStatusSummary {
  total: number;
  byStatus: Record<string, number>;
}

export interface AssessmentsResult {
  assessments: SecurityAssessment[];
  truncated: boolean;
  summary: AssessmentStatusSummary & {
    sources: {
      arm: AssessmentSourceReport;
      resourceGraph: AssessmentSourceReport;
    };
    /**
     * Distinct `properties` key names the Resource Graph mapper did not recognise,
     * across every row it read — including rows the union shadowed and `maxResults`
     * trimmed. Present only when there were any. A field arriving here is payload
     * this package is not reading yet, so it belongs in the summary rather than
     * buried on one row of thousands.
     */
    unmappedPropertyKeys?: string[];
    /** Present only when the result cannot be read at face value. */
    note?: string;
  };
  fanOut: FanOutInfo;
}

/**
 * The second source for assessments.
 *
 * The ARM list at subscription scope enumerates assessments on resources *inside*
 * the subscription, so an assessment scoped to the subscription itself or to an
 * identity object, neither of which is a resource inside it, never appears. Those are
 * the RBAC recommendations (disabled accounts with owner permissions, guest
 * accounts with write permissions, overprovisioned identities), which is the
 * highest-value content a Defender report carries.
 *
 * Resource Graph has the opposite blind spot: it returns nothing for a subscription
 * with no paid Defender plan, where the ARM list still returns data. Neither source
 * is complete alone, so both are read and the results unioned.
 */
export const ASSESSMENT_GRAPH_QUERY = [
  'securityresources',
  `| where type =~ ${kqlString('microsoft.security/assessments')}`,
].join('\n');

/** Every `properties` key this mapper names. Anything else lands in `unmappedProperties`. */
const MAPPED_PROPERTY_KEYS = [
  'displayName',
  'status',
  'resourceDetails',
  'risk',
  'additionalData',
  'metadata',
  'links',
] as const;

/**
 * Resource Graph returns the same assessments through a different door, in a
 * different shape: the `id` is lower-cased, `resourceDetails` uses `Id`/`Source`
 * rather than `id`/`source`, and everything under `properties` is an untyped
 * dynamic column. Map defensively, so a missing field reads as absent rather than
 * as a value.
 *
 * This list came from Microsoft's documentation, not from a row anyone has seen, and
 * on the sibling attack-path surface that documentation turned out to be behind the
 * live API — a fixed allowlist there discarded the whole risk payload of every path.
 * So whatever this list does not name is carried in `unmappedProperties` rather than
 * dropped: a field this package is not reading yet arrives visibly, instead of making
 * "no assessment carries risk data" look like a fact about Azure.
 */
export function mapAssessmentGraphRow(row: Record<string, unknown>): SecurityAssessment {
  const props = (row.properties ?? {}) as Record<string, unknown>;
  const status = (props.status ?? {}) as Record<string, unknown>;
  const details = (props.resourceDetails ?? {}) as Record<string, unknown>;

  const unmapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!(MAPPED_PROPERTY_KEYS as readonly string[]).includes(key)) unmapped[key] = value;
  }

  return {
    id: (row.id ?? '') as string,
    name: (row.name ?? '') as string,
    type: (row.type ?? 'microsoft.security/assessments') as string,
    properties: {
      displayName: props.displayName as string | undefined,
      status: {
        code: status.code as AssessmentStatusCode,
        cause: status.cause as string | undefined,
        description: status.description as string | undefined,
      },
      resourceDetails: {
        source: (details.Source ?? details.source ?? 'Azure') as string,
        id: (details.Id ?? details.id) as string | undefined,
      },
      risk: props.risk as SecurityAssessment['properties']['risk'],
      additionalData: props.additionalData as Record<string, unknown> | undefined,
      metadata: props.metadata as SecurityAssessment['properties']['metadata'],
      links: props.links as SecurityAssessment['properties']['links'],
      unmappedProperties: Object.keys(unmapped).length > 0 ? unmapped : undefined,
    },
  };
}

/**
 * Union key. Resource Graph lower-cases every id it returns and ARM does not, so a
 * case-sensitive key counts the assessments both sources hold twice over.
 */
function assessmentKey(assessment: SecurityAssessment): string {
  return (assessment.id ?? '').toLowerCase();
}

/**
 * Status is compared case-insensitively because the two sources are two APIs. A
 * casing difference between them would otherwise drop rows from a filtered list
 * silently, which is the failure this whole command is being fixed for.
 */
function statusMatches(assessment: SecurityAssessment, filter: AssessmentStatusCode): boolean {
  return assessment.properties?.status?.code?.toLowerCase() === filter.toLowerCase();
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
): AssessmentStatusSummary {
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
   * Reads both sources and unions them. See `ASSESSMENT_GRAPH_QUERY` for why one
   * is not enough.
   *
   * Both are scanned in full before anything is trimmed. Handing `maxResults` to
   * the ARM list would decide the answer before the second source was read: the cut
   * would fall on ARM's rows, and the identity- and subscription-scoped assessments
   * only Resource Graph can see are exactly what would be lost. `statusFilter` is
   * client-side for the same reason it always was: neither source filters on
   * status server-side.
   */
  async listAssessments(options?: {
    statusFilter?: AssessmentStatusCode;
    maxResults?: number;
  }): Promise<AssessmentsResult> {
    const path = this.client.subscriptionPath('/providers/Microsoft.Security/assessments');
    const { maxResults, statusFilter } = options ?? {};

    const fanOut = new FanOutRecorder();

    const armPage = await this.client.paginate<SecurityAssessment>(
      path,
      DEFENDER_API_VERSIONS.assessments
    );

    // Recorded rather than thrown: Resource Graph is the supplementary source, and
    // a refusal there must not fail a command that used to work without it. The gap
    // lands in the payload and in the exit code instead.
    const graph = await fanOut.run('subscription', 'resourceGraphAssessments', () =>
      queryResourceGraph(this.client, ASSESSMENT_GRAPH_QUERY, { pageAll: true })
    );

    const armItems = armPage.items;
    const graphRows = graph?.rows ?? [];

    const seen = new Set(armItems.map(assessmentKey));
    const graphKeys = new Set<string>();
    const merged = [...armItems];
    // Collected across every row, before the union drops the duplicates and before
    // `maxResults` trims: a field this package does not read yet must not be invisible
    // just because the one row carrying it lost a tie or fell past the cut.
    const unmappedKeys = new Set<string>();

    for (const row of graphRows) {
      const mapped = mapAssessmentGraphRow(row);
      for (const key of Object.keys(mapped.properties.unmappedProperties ?? {})) {
        unmappedKeys.add(key);
      }
      const key = assessmentKey(mapped);
      graphKeys.add(key);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(mapped);
    }

    const matching = statusFilter ? merged.filter((a) => statusMatches(a, statusFilter)) : merged;
    const trimmed = maxResults !== undefined && matching.length > maxResults;
    const assessments = trimmed ? matching.slice(0, maxResults) : matching;

    const notes: string[] = [];
    if (graph === null) {
      notes.push(
        'Resource Graph could not be queried (see fanOut.failures), so identity- and ' +
          'subscription-scoped assessments are missing from this list: the ARM list returns only ' +
          'assessments on resources inside the subscription. Do not read this as a complete set.'
      );
    } else if (graph.truncated) {
      notes.push(
        'Resource Graph capped its own result, so the assessments it contributed are a lower bound.'
      );
    }

    if (unmappedKeys.size > 0) {
      notes.push(
        `Resource Graph returned ${unmappedKeys.size} properties field(s) this package does ` +
          `not map: ${[...unmappedKeys].join(', ')}. They are carried verbatim in each row's ` +
          '`properties.unmappedProperties`. If any of them holds risk data, a report keyed on ' +
          '`properties.risk` is reading the wrong field rather than finding no risk.'
      );
    }

    return {
      assessments,
      truncated: trimmed || graph?.truncated === true,
      summary: {
        ...summariseAssessments(assessments),
        sources: {
          arm: {
            returned: armItems.length,
            unique: armItems.filter((a) => !graphKeys.has(assessmentKey(a))).length,
            available: true,
          },
          resourceGraph: {
            returned: graphRows.length,
            unique: merged.length - armItems.length,
            available: graph !== null,
          },
        },
        ...(unmappedKeys.size > 0 ? { unmappedPropertyKeys: [...unmappedKeys] } : {}),
        ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
      },
      fanOut: fanOut.result(),
    };
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
