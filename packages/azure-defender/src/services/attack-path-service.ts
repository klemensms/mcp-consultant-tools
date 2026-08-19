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
    byPotentialImpact: Record<string, number>;
    byRiskCategory: Record<string, number>;
  };
}

/**
 * `contains` is KQL's case-insensitive substring operator. `riskCategories` is a
 * dynamic array, so it is stringified before matching — a substring hit against the
 * serialized list, not an exact element match. Microsoft does not enumerate the
 * values of either `potentialImpact` or `riskCategories`, so an enum would be a guess.
 */
export function buildAttackPathListQuery(options: {
  riskCategory?: string;
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
    lines.push(`| where tostring(properties['riskCategories']) contains ${kqlString(options.riskCategory)}`);
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

/** Every `properties` field arrives as an untyped dynamic column, so map defensively. */
export function mapAttackPathRow(row: Record<string, unknown>): AttackPath {
  const props = (row.properties ?? {}) as Record<string, unknown>;

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
      assessments: props.assessments as Record<string, unknown> | undefined,
      graphComponent: props.graphComponent as AttackPath['properties']['graphComponent'],
      AttackPathID: props.AttackPathID as string | undefined,
    },
  };
}

export function summariseAttackPaths(paths: AttackPath[]): AttackPathsResult['summary'] {
  const byPotentialImpact: Record<string, number> = {};
  const byRiskCategory: Record<string, number> = {};

  for (const path of paths) {
    const impact = path.properties.potentialImpact ?? 'Unknown';
    byPotentialImpact[impact] = (byPotentialImpact[impact] ?? 0) + 1;

    // A path can carry several categories, so these counts sum to >= total.
    for (const category of path.properties.riskCategories ?? []) {
      byRiskCategory[category] = (byRiskCategory[category] ?? 0) + 1;
    }
  }

  return { total: paths.length, byPotentialImpact, byRiskCategory };
}

export class AttackPathService {
  constructor(private client: DefenderClient) {}

  async listAttackPaths(options?: {
    riskCategory?: string;
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
