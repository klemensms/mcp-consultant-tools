/**
 * Microsoft 365 Service Health reads: per-service health overviews, service-health issues
 * (incidents and advisories), and post-incident review documents.
 *
 * Every filter is applied CLIENT-SIDE. Graph ignores server-side `$filter`/`$orderby` on
 * these collections (200 OK, full result), so building one would return a wrong-but-plausible
 * subset — the exact false all-clear this tool must avoid. The source this was ported from
 * built `$filter=service eq '...' and classification eq '...' and isResolved eq ...` plus
 * `$orderby`, then reported the returned count as the filtered total.
 */

import { MessageCenterClient } from '../message-center-client.js';
import { assertAnnouncementId } from '../utils/announcement-id.js';
import { equalsIgnoreCase, includesIgnoreCase, sortByLastModifiedDesc } from '../utils/filters.js';
import type {
  GraphServiceHealth,
  GraphServiceHealthIssue,
  GraphCollection,
  ListServiceHealthOptions,
  ListIssuesOptions,
  ServiceHealthListResult,
  IssueListResult,
  IncidentReport,
} from '../models/message-center-types.js';

const BASE_PATH = '/admin/serviceAnnouncement';

// ---------------------------------------------------------------------------
// Pure predicates and mappers — unit-tested without a Graph client
// ---------------------------------------------------------------------------

/**
 * A `service` argument may be the display name ("Exchange Online") or the stable id
 * ("Exchange"), and its casing is not guaranteed, so match case-insensitively against BOTH.
 * The URL key for a single healthOverview is the display string, which is why get-service-health
 * resolves against the fetched list instead of putting the caller's string into the path.
 */
export function findServiceHealth(
  services: GraphServiceHealth[],
  nameOrId: string
): GraphServiceHealth | undefined {
  return services.find(
    (s) => equalsIgnoreCase(s.service, nameOrId) || equalsIgnoreCase(s.id, nameOrId)
  );
}

/** All filters are AND-ed and compared case-insensitively; `isResolved` is the authoritative flag. */
export function matchesIssue(issue: GraphServiceHealthIssue, options: ListIssuesOptions): boolean {
  if (options.service !== undefined && !includesIgnoreCase(issue.service, options.service)) {
    return false;
  }
  if (options.classification !== undefined && !equalsIgnoreCase(issue.classification, options.classification)) {
    return false;
  }
  // Derive resolved-ness from the boolean, never from the status enum (whose casing is unreliable).
  if (options.isResolved !== undefined && (issue.isResolved ?? false) !== options.isResolved) {
    return false;
  }
  return true;
}

/**
 * Decode a PIR document buffer. Graph returns it as a file stream with no pinned content-type,
 * so sniff for binary (a NUL byte in the head) and fall back to base64 rather than emitting
 * mojibake as if it were text.
 */
export function decodeIncidentReport(buffer: Buffer, issueId: string): IncidentReport {
  const head = buffer.subarray(0, 8000);
  const looksBinary = head.includes(0x00);
  return looksBinary
    ? { issueId, format: 'base64', content: buffer.toString('base64') }
    : { issueId, format: 'text', content: buffer.toString('utf-8') };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class HealthService {
  constructor(private client: MessageCenterClient) {}

  /** Status of every M365 service the tenant subscribes to. Small collection; no issue expansion. */
  async listServiceHealth(options: ListServiceHealthOptions = {}): Promise<ServiceHealthListResult> {
    let page;
    try {
      page = await this.client.paginate<GraphServiceHealth>(
        `${BASE_PATH}/healthOverviews`,
        options.maxResults
      );
    } catch (error) {
      throw this.client.enhanceError(error, 'listing service health overviews');
    }
    return { services: page.items, total: page.items.length, truncated: page.truncated };
  }

  /**
   * Detailed health of one service, with its issues expanded. Resolves the caller's
   * name/id against the fetched list case-insensitively, so a wrong-cased or display-vs-id
   * mismatch does not become a 404 reported as "service not found".
   */
  async getServiceHealth(nameOrId: string): Promise<GraphServiceHealth> {
    let collection;
    try {
      collection = await this.client.get<GraphCollection<GraphServiceHealth>>(
        `${BASE_PATH}/healthOverviews`,
        ['issues']
      );
    } catch (error) {
      throw this.client.enhanceError(error, 'getting service health');
    }

    const services = collection.value ?? [];
    const match = findServiceHealth(services, nameOrId);
    if (!match) {
      const available = services.map((s) => s.service).filter(Boolean).join(', ');
      throw new Error(
        `Service not found: '${nameOrId}'. Available services: ${available || '(none returned)'}`
      );
    }
    return match;
  }

  /** Service-health issues across all services, filtered and ordered client-side. */
  async listIssues(options: ListIssuesOptions = {}): Promise<IssueListResult> {
    const hasFilter =
      options.service !== undefined ||
      options.classification !== undefined ||
      options.isResolved !== undefined;

    // A filter must see every issue before trimming; only an unfiltered list can stop paging early.
    const fetchLimit = hasFilter ? undefined : options.maxResults;

    let page;
    try {
      page = await this.client.paginate<GraphServiceHealthIssue>(`${BASE_PATH}/issues`, fetchLimit);
    } catch (error) {
      throw this.client.enhanceError(error, 'listing service health issues');
    }

    let issues = hasFilter ? page.items.filter((i) => matchesIssue(i, options)) : page.items;
    issues = sortByLastModifiedDesc(issues);
    let truncated = page.truncated;

    if (hasFilter && options.maxResults !== undefined && issues.length > options.maxResults) {
      issues = issues.slice(0, options.maxResults);
      truncated = true;
    }

    return { issues, total: issues.length, truncated };
  }

  /** One issue by its service-announcement ID. */
  async getIssue(issueId: string): Promise<GraphServiceHealthIssue> {
    const id = assertAnnouncementId(issueId, 'issueId');
    try {
      return await this.client.get<GraphServiceHealthIssue>(`${BASE_PATH}/issues/${id}`);
    } catch (error) {
      throw this.client.enhanceError(error, `getting issue ${id}`);
    }
  }

  /**
   * The post-incident review document for an issue. Graph only exposes one for issues whose
   * status is `postIncidentReviewPublished`, and errors otherwise — surfaced as a clear message
   * rather than a raw 404.
   */
  async getIncidentReport(issueId: string): Promise<IncidentReport> {
    const id = assertAnnouncementId(issueId, 'issueId');
    let buffer: Buffer;
    try {
      buffer = await this.client.getRaw(`${BASE_PATH}/issues/${id}/incidentReport`);
    } catch (error) {
      throw this.client.enhanceError(
        error,
        `getting the incident report for ${id} (only issues with status postIncidentReviewPublished have one)`
      );
    }
    return decodeIncidentReport(buffer, id);
  }
}
