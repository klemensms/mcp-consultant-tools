import { FanOutRecorder, type FanOutInfo } from '@mcp-consultant-tools/core';
import type { DefenderClient } from '../defender-client.js';
import {
  DEFENDER_API_VERSIONS,
  DEFENDER_DIAGNOSTIC_API_VERSIONS,
} from '../utils/defender-api-versions.js';
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
 * A malformed ID would otherwise produce a request against the wrong path - or,
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
     * across every row it read - including rows the union shadowed and `maxResults`
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
 * live API - a fixed allowlist there discarded the whole risk payload of every path.
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

/**
 * Request path for the assessment-definition catalogue. Prefixed with a
 * `/subscriptions/{id}` scope by the subscription-scoped operation, used bare by the
 * tenant-scoped one.
 */
const METADATA_PROVIDER_PATH = '/providers/Microsoft.Security/assessmentMetadata';

/** Where the assessment-metadata catalogue was read from. */
export type MetadataScope = 'subscription' | 'tenant';

/**
 * How one optional field is populated across a catalogue.
 *
 * `populated`, `presentButEmpty` and `absent` are counted separately on purpose. The
 * report behind this diagnostic said the two ranking fields were "null on all 1,302
 * definitions", but an optional field ARM does not populate is ABSENT, not null, and
 * the two have different causes: absent means the service never sent the field,
 * present-but-empty means it sent the field and had nothing to put in it. Collapsing
 * them throws away the only clue about which end of the wire the problem is at.
 */
export interface FieldPopulation {
  /** Key present, carrying a usable value. */
  populated: number;
  /** Key present but `null` or an empty string - sent and emptied, not omitted. */
  presentButEmpty: number;
  /** Key not on the item at all - what an unpopulated optional field looks like. */
  absent: number;
  /** First item found carrying a value, so the shape can be read rather than assumed. */
  example: { name: string; displayName: string; value: string } | null;
}

/** One (scope, api-version) combination, and what it returned. */
export type MetadataFieldProbe =
  | {
      /** `<scope>@<api-version>`, the handle the summary and verdict refer to. */
      label: string;
      scope: MetadataScope;
      apiVersion: string;
      /** Request path. `{subscriptionId}` stands in for the configured subscription. */
      path: string;
      ok: true;
      /** Definitions this combination returned. Compare across probes before choosing one. */
      total: number;
      implementationEffort: FieldPopulation;
      userImpact: FieldPopulation;
    }
  | {
      label: string;
      scope: MetadataScope;
      apiVersion: string;
      path: string;
      ok: false;
      /** Why this combination could not be read. Also in `fanOut.failures`. */
      error: string;
    };

export interface MetadataFieldDiagnosticResult {
  /** What this command answers, so a payload read on its own is not ambiguous. */
  question: string;
  probes: MetadataFieldProbe[];
  summary: {
    probesRun: number;
    probesSucceeded: number;
    /** Labels of the probes where either field was populated on at least one item. */
    populatedBy: string[];
    /** One reading of the probes, saying what they do not settle as well as what they do. */
    verdict: string;
  };
  fanOut: FanOutInfo;
}

/**
 * Counts how one optional ranking field is populated across a catalogue.
 * Exported for unit tests.
 */
export function countFieldPopulation(
  items: AssessmentMetadata[],
  field: 'implementationEffort' | 'userImpact'
): FieldPopulation {
  const population: FieldPopulation = {
    populated: 0,
    presentButEmpty: 0,
    absent: 0,
    example: null,
  };

  for (const item of items) {
    const properties = (item.properties ?? {}) as Record<string, unknown>;

    if (!(field in properties)) {
      population.absent++;
      continue;
    }

    const value = properties[field];
    if (value === null || value === undefined || value === '') {
      population.presentButEmpty++;
      continue;
    }

    population.populated++;
    population.example ??= {
      name: item.name,
      displayName: item.properties?.displayName ?? '',
      value: String(value),
    };
  }

  return population;
}

/**
 * One line per DISTINCT reason, naming every probe that hit it.
 *
 * Collapsing only exact duplicates is lossless: a bad credential fails all four probes
 * with the same 900-character AAD error, and printing it four times buries the one
 * thing worth reading. Two probes failing differently still get two lines.
 * Exported for unit tests.
 */
export function groupFailuresByReason(failures: FanOutInfo['failures']): string {
  const byReason = new Map<string, string[]>();
  for (const failure of failures) {
    byReason.set(failure.reason, [...(byReason.get(failure.reason) ?? []), failure.item]);
  }
  return [...byReason.entries()]
    .map(([reason, items]) => `${items.join(', ')}: ${reason}`)
    .join('; ');
}

/**
 * The one sentence a reader takes away, and the only place the four probes are turned
 * into a conclusion.
 *
 * It says what is NOT settled as well as what is. A probe that could not be read is
 * not a probe that found nothing, and this whole investigation exists because those
 * two were once reported as the same thing. Exported for unit tests.
 */
export function metadataFieldVerdict(
  probes: MetadataFieldProbe[],
  populatedBy: string[]
): string {
  const failed = probes.filter((p) => !p.ok).map((p) => p.label);
  const caveat =
    failed.length > 0
      ? ` Not settled for ${failed.join(', ')}, which could not be read (see fanOut.failures): that is unknown, not empty.`
      : '';

  const current = `subscription@${DEFENDER_API_VERSIONS.assessmentMetadata}`;

  if (populatedBy.length === 0) {
    return (
      'Neither implementationEffort nor userImpact is populated on any definition at any ' +
      'combination that returned, so an effort/impact ranking cannot be computed from this ' +
      "catalogue, and the absence belongs to the estate or the service rather than to this " +
      "package's request." +
      caveat
    );
  }

  if (populatedBy.includes(current)) {
    return (
      `The combination this package already reads (${current}) populates the fields here, so an ` +
      'all-null measurement did not come from the request. Look at the subscription it was ' +
      'measured against, or at whatever rendered the fields.' +
      caveat
    );
  }

  const legacy = DEFENDER_DIAGNOSTIC_API_VERSIONS.assessmentMetadataLegacy;
  const versionNote = populatedBy.every((label) => label.endsWith(`@${legacy}`))
    ? ` Every combination that populates them is at api-version ${legacy}, whose severity enum has ` +
      "no 'Critical' value, so reading the catalogue there instead trades one capability for the " +
      'other rather than adding one.'
    : '';

  return (
    `The fields are populated at ${populatedBy.join(', ')} but not at ${current}, which is what ` +
    "this package reads today. Compare each probe's total before changing anything: a combination " +
    'that populates the fields over a smaller catalogue is a trade-off, not a fix.' +
    versionNote +
    caveat
  );
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

  /**
   * Probes four (scope, api-version) combinations of the assessment-definition
   * catalogue and reports which of them, if any, populates `implementationEffort`
   * and `userImpact`.
   *
   * Both axes are here because neither has been ruled out and neither has been
   * tried. The api-version axis is the recorded hypothesis and it is weaker than it
   * looks: both versions mark the two fields optional, so the only evidence of a
   * version difference is which published examples happen to include them. The scope
   * axis has never been called at all - `listAssessmentMetadata` only ever reads the
   * subscription-scoped path, and a shared response definition says nothing about
   * whether the service populates an optional field the same way at both scopes.
   *
   * Each combination is recorded rather than thrown, so one refusal - a tenant-scope
   * 403, an api-version the surface rejects - still leaves the other three answers in
   * the payload. If every combination fails, the whole call fails: four refusals and a
   * catalogue that genuinely carries neither field must not come back looking the same.
   */
  async diagnoseMetadataFields(): Promise<MetadataFieldDiagnosticResult> {
    const specs: Array<{ scope: MetadataScope; apiVersion: string }> = [
      // What the package does today, first, so it reads as the baseline.
      { scope: 'subscription', apiVersion: DEFENDER_API_VERSIONS.assessmentMetadata },
      {
        scope: 'subscription',
        apiVersion: DEFENDER_DIAGNOSTIC_API_VERSIONS.assessmentMetadataLegacy,
      },
      { scope: 'tenant', apiVersion: DEFENDER_API_VERSIONS.assessmentMetadata },
      { scope: 'tenant', apiVersion: DEFENDER_DIAGNOSTIC_API_VERSIONS.assessmentMetadataLegacy },
    ];

    const fanOut = new FanOutRecorder();
    const probes: MetadataFieldProbe[] = [];

    for (const spec of specs) {
      const label = `${spec.scope}@${spec.apiVersion}`;
      const path =
        spec.scope === 'subscription'
          ? `/subscriptions/{subscriptionId}${METADATA_PROVIDER_PATH}`
          : METADATA_PROVIDER_PATH;

      // The subscription path is resolved inside the callback on purpose: an
      // unconfigured subscription throws there, which belongs in this probe's failure
      // rather than abandoning the two tenant-scope probes that never needed one.
      const page = await fanOut.run(label, 'assessmentMetadata', () =>
        this.client.paginate<AssessmentMetadata>(
          spec.scope === 'subscription'
            ? this.client.subscriptionPath(METADATA_PROVIDER_PATH)
            : METADATA_PROVIDER_PATH,
          spec.apiVersion
        )
      );

      if (page === null) {
        const failures = fanOut.result().failures;
        probes.push({
          ...spec,
          label,
          path,
          ok: false,
          error: failures[failures.length - 1]?.reason ?? 'unknown',
        });
        continue;
      }

      probes.push({
        ...spec,
        label,
        path,
        ok: true,
        total: page.items.length,
        implementationEffort: countFieldPopulation(page.items, 'implementationEffort'),
        userImpact: countFieldPopulation(page.items, 'userImpact'),
      });
    }

    const succeeded = probes.filter((probe) => probe.ok);
    if (succeeded.length === 0) {
      throw new Error(
        `All ${specs.length} assessment-metadata probes failed, so nothing was measured. ` +
          'Returning an empty result here would be indistinguishable from a catalogue that ' +
          'carries neither ranking field, which is the exact confusion this command exists to ' +
          `remove. Failures: ${groupFailuresByReason(fanOut.result().failures)}`
      );
    }

    const populatedBy = probes
      .filter(
        (probe) =>
          probe.ok &&
          (probe.implementationEffort.populated > 0 || probe.userImpact.populated > 0)
      )
      .map((probe) => probe.label);

    return {
      question:
        'Which scope and api-version, if any, populates implementationEffort and userImpact on ' +
        'the assessment-definition catalogue? Read summary.populatedBy and summary.verdict first, ' +
        'then fanOut.failures before treating any probe as an answer.',
      probes,
      summary: {
        probesRun: specs.length,
        probesSucceeded: succeeded.length,
        populatedBy,
        verdict: metadataFieldVerdict(probes, populatedBy),
      },
      fanOut: fanOut.result(),
    };
  }
}
