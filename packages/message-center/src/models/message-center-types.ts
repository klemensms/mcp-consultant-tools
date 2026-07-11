/**
 * Microsoft Graph v1.0 shapes (raw) for the Service Communications API, and this
 * package's option/result shapes.
 *
 * Raw fields are typed optional wherever Graph may omit them. Two traps drove the design
 * of everything downstream:
 *  - Graph ignores server-side `$filter` on these collections (200 OK, full result), so all
 *    filtering is client-side.
 *  - Microsoft's own docs are inconsistent about enum casing (schema says camelCase,
 *    every example payload is PascalCase), so every enum compare is case-insensitive.
 * See https://learn.microsoft.com/en-us/graph/api/resources/service-communications-api-overview
 */

// ---------------------------------------------------------------------------
// Raw Graph shapes
// ---------------------------------------------------------------------------

/** A single update on a service-health issue. https://learn.microsoft.com/en-us/graph/api/resources/servicehealthissuepost */
export interface GraphServiceHealthIssuePost {
  createdDateTime?: string;
  postType?: string;
  description?: { contentType?: string; content?: string };
}

export interface GraphKeyValuePair {
  name?: string;
  value?: string;
}

/** https://learn.microsoft.com/en-us/graph/api/resources/servicehealth */
export interface GraphServiceHealth {
  /** Stable-ish id, e.g. "Exchange", "OSDPPlatform". Distinct from `service` (display name). */
  id?: string;
  /** Display name, e.g. "Exchange Online". This is what the URL key and message `services` use. */
  service?: string;
  /** A serviceHealthStatus value. Casing varies between docs and the wire — compare case-insensitively. */
  status?: string;
  issues?: GraphServiceHealthIssue[];
}

/** https://learn.microsoft.com/en-us/graph/api/resources/servicehealthissue */
export interface GraphServiceHealthIssue {
  id?: string;
  title?: string;
  /** `advisory` | `incident` (wire casing varies). */
  classification?: string;
  origin?: string;
  /** A serviceHealthStatus value (wire casing varies). Authoritative resolved-ness is `isResolved`. */
  status?: string;
  service?: string;
  feature?: string;
  featureGroup?: string;
  impactDescription?: string;
  /** The authoritative resolved flag. Do NOT derive resolved-ness from `status`. */
  isResolved?: boolean;
  startDateTime?: string;
  endDateTime?: string | null;
  lastModifiedDateTime?: string;
  posts?: GraphServiceHealthIssuePost[];
  details?: GraphKeyValuePair[];
}

/** https://learn.microsoft.com/en-us/graph/api/resources/serviceupdatemessage */
export interface GraphServiceUpdateMessage {
  id?: string;
  title?: string;
  /** `preventOrFixIssue` | `planForChange` | `stayInformed` (wire casing varies). */
  category?: string;
  /** `normal` | `high` | `critical` (wire casing varies). */
  severity?: string;
  tags?: string[];
  isMajorChange?: boolean;
  actionRequiredByDateTime?: string | null;
  /** Display-name strings, e.g. "Exchange Online". Not stable enums. */
  services?: string[];
  body?: { contentType?: string; content?: string };
  details?: GraphKeyValuePair[];
  hasAttachments?: boolean;
  startDateTime?: string;
  endDateTime?: string | null;
  lastModifiedDateTime?: string;
}

export interface GraphCollection<T> {
  value?: T[];
  '@odata.nextLink'?: string;
}

// ---------------------------------------------------------------------------
// Filter option / result shapes
// ---------------------------------------------------------------------------

/** Canonical filter values, in the documented camelCase. Compared case-insensitively to the wire. */
export type IssueClassification = 'advisory' | 'incident';
export type MessageCategory = 'preventOrFixIssue' | 'planForChange' | 'stayInformed';
export type MessageSeverity = 'normal' | 'high' | 'critical';

export interface ListServiceHealthOptions {
  maxResults?: number;
}

export interface ListIssuesOptions {
  /** Case-insensitive substring match on the issue's service display name. */
  service?: string;
  classification?: IssueClassification;
  /** true = only resolved issues, false = only unresolved. Omit for both. */
  isResolved?: boolean;
  maxResults?: number;
}

export interface ListMessagesOptions {
  category?: MessageCategory;
  severity?: MessageSeverity;
  /** Case-insensitive substring match on any of the message's service display names. */
  service?: string;
  isMajorChange?: boolean;
  maxResults?: number;
}

/** A page-bounded, client-side-filtered list. `truncated` = maxResults cut it; counts are a lower bound. */
export interface ServiceHealthListResult {
  services: GraphServiceHealth[];
  total: number;
  truncated: boolean;
}

export interface IssueListResult {
  issues: GraphServiceHealthIssue[];
  total: number;
  truncated: boolean;
}

export interface MessageListResult {
  messages: GraphServiceUpdateMessage[];
  total: number;
  truncated: boolean;
}

/** The post-incident review document for one issue. */
export interface IncidentReport {
  issueId: string;
  /** `text` when the document decoded as UTF-8, `base64` when it looked binary. */
  format: 'text' | 'base64';
  content: string;
}
