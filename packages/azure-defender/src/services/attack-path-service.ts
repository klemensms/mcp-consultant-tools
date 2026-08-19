import type { DefenderClient } from '../defender-client.js';
import { kqlString } from '../utils/kql.js';
import { queryResourceGraph } from '../utils/resource-graph.js';
import type { AttackPath } from '../models/defender-types.js';

export const ATTACK_PATH_TABLE = 'securityresources';
export const ATTACK_PATH_TYPE = 'microsoft.security/attackpaths';

export const DEFAULT_ATTACK_PATH_RESULTS = 100;
/**
 * Resource Graph caps a single page at 1000 rows and we request `maxResults + 1`
 * to detect truncation, so this stays comfortably under the cap.
 * ceiling: one Resource Graph page; add $skipToken paging if a subscription ever exceeds it.
 */
export const MAX_ATTACK_PATH_RESULTS = 500;

export interface AttackPathsResult {
  attackPaths: AttackPath[];
  truncated: boolean;
  summary: {
    total: number;
    /**
     * Keyed on the effective risk level, so a row of either shape lands in a real
     * bucket. A row carrying neither field counts under `RISK_LEVEL_NOT_REPORTED`.
     */
    byRiskLevel: Record<string, number>;
    /** Keyed on each effective risk factor, so this sums to more than `total`. */
    byRiskFactor: Record<string, number>;
    /** Paths whose payload carried no risk level at all. Not the same as "no risk". */
    riskLevelNotReported: number;
    /** Present only when the breakdown cannot be read at face value. */
    note?: string;
  };
}

/**
 * Bucket for a path whose payload carried no risk level under either name. Named
 * rather than `Unknown`, because `Unknown` reads as a value the API returned.
 */
export const RISK_LEVEL_NOT_REPORTED = 'NotReported';

/** One `where` clause matching a value against several `properties` field names. */
function eitherSpellingClause(fields: string[], value: string): string {
  const escaped = kqlString(value);
  return `| where ${fields.map((f) => `tostring(properties['${f}']) contains ${escaped}`).join(' or ')}`;
}

/**
 * `contains` is KQL's case-insensitive substring operator. The risk fields are
 * dynamic, so they are stringified before matching — a substring hit against the
 * serialized value, not an exact element match. Microsoft enumerates the values of
 * none of them, so an enum would be a guess.
 *
 * Each risk filter matches **both** spellings of its field, joined by `or`. A clause
 * on the documented name alone matches nothing on an Exposure Management row, and an
 * empty filtered list is indistinguishable from a subscription with no such paths.
 */
export function buildAttackPathListQuery(options: {
  riskCategory?: string;
  riskLevel?: string;
  displayNameContains?: string;
  limit: number;
}): string {
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error(`limit must be a positive integer, got: ${options.limit}`);
  }

  const lines = [ATTACK_PATH_TABLE, `| where type == ${kqlString(ATTACK_PATH_TYPE)}`];

  if (options.displayNameContains) {
    lines.push(`| where tostring(properties['displayName']) contains ${kqlString(options.displayNameContains)}`);
  }
  if (options.riskCategory) {
    lines.push(eitherSpellingClause(['riskCategories', 'riskFactors'], options.riskCategory));
  }
  if (options.riskLevel) {
    lines.push(eitherSpellingClause(['riskLevel', 'potentialImpact'], options.riskLevel));
  }

  lines.push(`| limit ${options.limit}`);
  return lines.join('\n');
}

export function buildAttackPathGetQuery(attackPathName: string): string {
  return [
    ATTACK_PATH_TABLE,
    `| where type == ${kqlString(ATTACK_PATH_TYPE)}`,
    `| where name =~ ${kqlString(attackPathName)}`,
    '| limit 1',
  ].join('\n');
}

/** Every `properties` key this mapper names. Anything else lands in `unmappedProperties`. */
const MAPPED_PROPERTY_KEYS = [
  'displayName',
  'description',
  'attackPathType',
  'manualRemediationSteps',
  'refreshInterval',
  'potentialImpact',
  'riskCategories',
  'entryPointEntityInternalID',
  'targetEntityInternalID',
  'assessments',
  'graphComponent',
  'AttackPathID',
  'riskLevel',
  'riskFactors',
  'entryPoint',
  'target',
  'attackPathSteps',
  'mITRETacticsAndTechniques',
  'attackStory',
  'isPartialAttackPath',
] as const;

/**
 * Every `properties` field arrives as an untyped dynamic column, so map defensively.
 *
 * Both the documented legacy shape and the live Exposure Management shape are mapped,
 * because a row carries one or the other and the mapper cannot tell which until it
 * looks. Whatever neither names is carried in `unmappedProperties` rather than
 * dropped: an allowlist that silently discarded the rest is what hid the entire risk
 * payload of every path on a modern tenant.
 */
export function mapAttackPathRow(row: Record<string, unknown>): AttackPath {
  const props = (row.properties ?? {}) as Record<string, unknown>;

  const unmapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!(MAPPED_PROPERTY_KEYS as readonly string[]).includes(key)) unmapped[key] = value;
  }

  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    tenantId: row.tenantId as string | undefined,
    location: row.location as string | undefined,
    subscriptionId: row.subscriptionId as string | undefined,
    properties: {
      displayName: (props.displayName ?? '') as string,
      description: props.description as string | undefined,
      attackPathType: props.attackPathType as string | undefined,
      manualRemediationSteps: props.manualRemediationSteps as string[] | undefined,
      refreshInterval: props.refreshInterval as string | undefined,
      potentialImpact: props.potentialImpact as string | undefined,
      riskCategories: props.riskCategories as string[] | undefined,
      entryPointEntityInternalID: props.entryPointEntityInternalID as string | undefined,
      targetEntityInternalID: props.targetEntityInternalID as string | undefined,
      riskLevel: props.riskLevel as string | undefined,
      riskFactors: props.riskFactors as unknown[] | undefined,
      entryPoint: props.entryPoint,
      target: props.target,
      attackPathSteps: props.attackPathSteps as unknown[] | undefined,
      mITRETacticsAndTechniques: props.mITRETacticsAndTechniques as unknown[] | undefined,
      attackStory: props.attackStory as string | undefined,
      isPartialAttackPath: props.isPartialAttackPath as boolean | undefined,
      assessments: props.assessments as Record<string, unknown> | undefined,
      graphComponent: props.graphComponent as AttackPath['properties']['graphComponent'],
      AttackPathID: props.AttackPathID as string | undefined,
      unmappedProperties: Object.keys(unmapped).length > 0 ? unmapped : undefined,
    },
  };
}

/**
 * A readable label for a dynamic value. A risk factor or an entity arrives as either
 * a string or an object, and `String(object)` is `[object Object]` — which would
 * collapse every distinct factor into one bucket and report a wrong number that looks
 * tidy. An unrecognised object is serialized instead, so it is visibly odd rather
 * than silently merged.
 */
export function labelOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['name', 'displayName', 'riskFactorName', 'type', 'id']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return JSON.stringify(value);
  }
  return undefined;
}

/**
 * The path's risk level under whichever name the row carries. `undefined` means the
 * payload reported none — which is not the same as a path carrying no risk, and must
 * never be rendered as though the API had answered.
 */
export function effectiveRiskLevel(path: AttackPath): string | undefined {
  return labelOf(path.properties.riskLevel) ?? labelOf(path.properties.potentialImpact);
}

/**
 * The path's risk factors under both names, de-duplicated in first-seen order. The
 * two vocabularies differ (`Internet exposure` against `DataExposure`), so they are
 * unioned rather than one preferred: dropping either would shrink a breakdown.
 */
export function effectiveRiskFactors(path: AttackPath): string[] {
  const labels = [
    ...(path.properties.riskFactors ?? []),
    ...(path.properties.riskCategories ?? []),
  ]
    .map(labelOf)
    .filter((label): label is string => label !== undefined);

  return [...new Set(labels)];
}

export function summariseAttackPaths(paths: AttackPath[]): AttackPathsResult['summary'] {
  const byRiskLevel: Record<string, number> = {};
  const byRiskFactor: Record<string, number> = {};
  let riskLevelNotReported = 0;

  for (const path of paths) {
    const level = effectiveRiskLevel(path);
    if (level === undefined) riskLevelNotReported++;

    const bucket = level ?? RISK_LEVEL_NOT_REPORTED;
    byRiskLevel[bucket] = (byRiskLevel[bucket] ?? 0) + 1;

    // A path can carry several factors, so these counts sum to >= total.
    for (const factor of effectiveRiskFactors(path)) {
      byRiskFactor[factor] = (byRiskFactor[factor] ?? 0) + 1;
    }
  }

  const summary: AttackPathsResult['summary'] = {
    total: paths.length,
    byRiskLevel,
    byRiskFactor,
    riskLevelNotReported,
  };

  if (riskLevelNotReported > 0) {
    summary.note =
      `${riskLevelNotReported} of ${paths.length} path(s) did not report a risk level under ` +
      'either `riskLevel` or `potentialImpact`. That is a gap in the payload, not a ' +
      'finding of no risk — do not report those paths as low risk.';
  }

  return summary;
}

export class AttackPathService {
  constructor(private client: DefenderClient) {}

  async listAttackPaths(options?: {
    riskCategory?: string;
    riskLevel?: string;
    displayNameContains?: string;
    maxResults?: number;
  }): Promise<AttackPathsResult> {
    const maxResults = options?.maxResults ?? DEFAULT_ATTACK_PATH_RESULTS;
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_ATTACK_PATH_RESULTS) {
      throw new Error(
        `maxResults must be an integer between 1 and ${MAX_ATTACK_PATH_RESULTS}, got: ${maxResults}`
      );
    }

    // Ask for one extra row so `truncated` is honest without a second request.
    const query = buildAttackPathListQuery({
      riskCategory: options?.riskCategory,
      riskLevel: options?.riskLevel,
      displayNameContains: options?.displayNameContains,
      limit: maxResults + 1,
    });

    // Single page: the query carries its own `| limit`, well under one Resource
    // Graph page, so there is nothing to follow `$skipToken` for.
    const { rows, truncated: resultTruncated } = await queryResourceGraph(this.client, query);
    const truncated = rows.length > maxResults || resultTruncated;
    const attackPaths = rows.slice(0, maxResults).map(mapAttackPathRow);

    return { attackPaths, truncated, summary: summariseAttackPaths(attackPaths) };
  }

  async getAttackPath(options: { attackPathName: string }): Promise<AttackPath | null> {
    const { rows } = await queryResourceGraph(
      this.client,
      buildAttackPathGetQuery(options.attackPathName)
    );
    return rows.length === 0 ? null : mapAttackPathRow(rows[0]);
  }
}
