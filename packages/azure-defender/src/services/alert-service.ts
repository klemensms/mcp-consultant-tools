import type { DefenderClient } from '../defender-client.js';
import { DEFENDER_API_VERSIONS } from '../utils/defender-api-versions.js';
import type { SecurityAlert, AlertSeverity, AlertStatus } from '../models/defender-types.js';

/** Default fetch ceiling. An estate with thousands of alerts should not arrive by accident. */
export const DEFAULT_ALERT_RESULTS = 200;

export interface AlertFilter {
  status?: AlertStatus;
  severity?: AlertSeverity;
}

export interface AlertSummary {
  /** Alerts returned after filtering. */
  total: number;
  /** Alerts ARM returned before any filter ran. Equal to `total` when nothing filtered. */
  matchedOf: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  /**
   * Entities carrying more than one alert, busiest first. Clustering is usually the
   * finding - 25 Active alerts spread over 25 machines and 25 on one domain controller
   * are the same count and a different incident.
   */
  topEntities: Array<{ entity: string; alerts: number }>;
  note?: string;
}

export interface AlertListResult {
  alerts: SecurityAlert[];
  truncated: boolean;
  summary: AlertSummary;
}

/**
 * Carry every `properties` key ARM sent.
 *
 * There is no field allowlist here, deliberately. Two mappers in this package were built
 * from Microsoft's published field tables and silently discarded live payload the table
 * did not mention - the entire Exposure Management risk block on attack paths, and
 * whatever the assessment table omitted. Alerts are the worst possible surface for that
 * mistake: `extendedProperties` is detection-specific and undocumented by design, and it
 * is where the evidence lives.
 */
export function mapAlertRow(row: SecurityAlert): SecurityAlert {
  return row;
}

/**
 * Filter client-side, because `Alerts_List` accepts no `$filter` at any api-version.
 * Matching is case-insensitive: a `--status active` that silently matched nothing would
 * read as "no active alerts", which is the failure this whole chain exists to remove.
 */
export function filterAlerts(alerts: SecurityAlert[], filter: AlertFilter): SecurityAlert[] {
  const wantStatus = filter.status?.toLowerCase();
  const wantSeverity = filter.severity?.toLowerCase();

  return alerts.filter((a) => {
    if (wantStatus && a.properties.status?.toLowerCase() !== wantStatus) return false;
    if (wantSeverity && a.properties.severity?.toLowerCase() !== wantSeverity) return false;
    return true;
  });
}

/**
 * Aggregate the returned alerts.
 *
 * `fetched` is the count before filtering and `truncated` says whether the fetch itself
 * was cut short. Both are needed: a count of 1 means something different when 32 rows
 * arrived and 31 were filtered out, and different again when the fetch stopped at 1.
 */
export function summariseAlerts(
  alerts: SecurityAlert[],
  fetched: number,
  truncated: boolean,
  filtered = false
): AlertSummary {
  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const perEntity: Record<string, number> = {};

  for (const a of alerts) {
    const status = a.properties.status ?? 'Unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;

    const severity = a.properties.severity ?? 'Unknown';
    bySeverity[severity] = (bySeverity[severity] || 0) + 1;

    const entity = a.properties.compromisedEntity;
    if (entity) perEntity[entity] = (perEntity[entity] || 0) + 1;
  }

  const topEntities = Object.entries(perEntity)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([entity, alerts]) => ({ entity, alerts }));

  const notes: string[] = [];
  const removed = fetched - alerts.length;
  if (removed > 0) {
    notes.push(
      `A filter removed ${removed} of ${fetched} alert(s) returned by ARM. The counts ` +
        `below cover only what matched.`
    );
  }
  if (truncated) {
    notes.push(
      `The fetch stopped at the result limit, so every count here is a lower bound, not ` +
        `a subscription total.`
    );
    if (filtered) {
      notes.push(
        `The limit applied to the fetch, before the filter ran, so alerts matching the ` +
          `filter may exist beyond it. Raise maxResults for a filtered total.`
      );
    }
  }

  return {
    total: alerts.length,
    matchedOf: fetched,
    byStatus,
    bySeverity,
    topEntities,
    note: notes.length > 0 ? notes.join(' ') : undefined,
  };
}

export class AlertService {
  constructor(private client: DefenderClient) {}

  /**
   * List security alerts across the subscription.
   *
   * Uses the subscription-wide `Alerts_List`, not the region-scoped
   * `Microsoft.Security/locations/{location}/alerts`. Both exist; the region-scoped one
   * needs a location per call and would silently omit any region the caller did not
   * think to ask for, which is exactly the partial-scope-as-clean-result defect this
   * package has been removing everywhere else.
   */
  async listAlerts(
    options: { status?: AlertStatus; severity?: AlertSeverity; maxResults?: number } = {}
  ): Promise<AlertListResult> {
    const { status, severity, maxResults = DEFAULT_ALERT_RESULTS } = options;

    const path = this.client.subscriptionPath('/providers/Microsoft.Security/alerts');
    const { items, truncated } = await this.client.paginate<SecurityAlert>(
      path,
      DEFENDER_API_VERSIONS.alerts,
      undefined,
      maxResults
    );

    const mapped = items.map(mapAlertRow);
    const isFiltered = Boolean(status || severity);
    const alerts = isFiltered ? filterAlerts(mapped, { status, severity }) : mapped;

    return {
      alerts,
      truncated,
      summary: summariseAlerts(alerts, mapped.length, truncated, isFiltered),
    };
  }
}
