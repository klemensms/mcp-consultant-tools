/**
 * Outlook types shared by the services, tools and CLI.
 */
import type { DelegatedGraphAuth } from '@mcp-consultant-tools/m365-core';
import type { MailReadService } from './services/mail-read-service.js';
import type { MailWriteService } from './services/mail-write-service.js';
import type { MailSendService } from './services/mail-send-service.js';
import type { CalendarReadService } from './services/calendar-read-service.js';
import type { CalendarWriteService } from './services/calendar-write-service.js';

export interface MailSummary {
  id: string;
  conversationId: string;
  subject: string;
  from: string;
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  preview: string;
  webLink: string;
}

export interface MailAttachmentInfo {
  id: string;
  name: string;
  size: number;
  contentType: string;
  isInline: boolean;
}

export interface MailDetail extends MailSummary {
  to: string[];
  cc: string[];
  /** Plain text, wrapped as untrusted email content. */
  bodyText: string;
  attachments: MailAttachmentInfo[];
}

export interface MailFolder {
  id: string;
  displayName: string;
  unreadItemCount: number;
  totalItemCount: number;
}

export interface ListMessagesOptions {
  /** Well-known folder name (inbox, archive, drafts, sentitems, deleteditems) or a folder id. Default inbox. */
  folder?: string;
  /** Default 20, capped at 50. */
  top?: number;
  unreadOnly?: boolean;
  /** Sender email address. */
  from?: string;
  /** ISO date or date-time; received on or after. */
  since?: string;
  /** ISO date or date-time; received on or before. */
  until?: string;
  hasAttachments?: boolean;
}

export interface SavedAttachment {
  path: string;
  size: number;
  contentType: string;
}

export interface CalendarInfo {
  id: string;
  name: string;
  owner: string;
  canEdit: boolean;
  isDefault: boolean;
}

export interface EventAttendee {
  address: string;
  name: string;
  /** required, optional or resource */
  type: string;
  /** none, accepted, tentativelyAccepted, declined, notResponded, organizer */
  response: string;
}

export interface EventSummary {
  id: string;
  /** Set on an occurrence of a repeating meeting: pass it instead of id to change the whole series. */
  seriesMasterId?: string;
  /** singleInstance, occurrence, exception or seriesMaster */
  type: string;
  subject: string;
  start: string;
  end: string;
  /** The zone start and end are expressed in, as Graph returned it. */
  timeZone: string;
  isAllDay: boolean;
  location: string;
  organizer: string;
  isOrganizer: boolean;
  attendees: string[];
  /** free, tentative, busy, oof, workingElsewhere, unknown */
  showAs: string;
  /** normal, personal, private, confidential */
  sensitivity: string;
  isCancelled: boolean;
  /** Your own response. */
  response: string;
  teamsJoinUrl?: string;
  webLink: string;
}

export interface EventDetail extends EventSummary {
  attendeeDetails: EventAttendee[];
  /** Plain text, wrapped as untrusted content. */
  bodyText: string;
}

export interface ScheduleItem {
  status: string;
  start: string;
  end: string;
  subject?: string;
  location?: string;
}

export interface PersonSchedule {
  person: string;
  /** One digit per interval: 0 free, 1 tentative, 2 busy, 3 out of office, 4 working elsewhere. */
  availabilityView: string;
  items: ScheduleItem[];
  error?: string;
}

export interface MeetingTimeSuggestion {
  start: string;
  end: string;
  timeZone: string;
  confidence: number;
  attendeeAvailability: { attendee: string; availability: string }[];
}

export interface EventChangeResult {
  eventId: string;
  webLink: string;
  /** Everyone Graph notified; empty when no one was. */
  notified: string[];
  message: string;
  /** Only when recordAutomatically was asked for. */
  recording?: string;
}

export interface ServiceContext {
  readonly auth: DelegatedGraphAuth;
  readonly mail: MailReadService;
  readonly write: MailWriteService;
  readonly send: MailSendService;
  readonly calendar: CalendarReadService;
  readonly calendarWrite: CalendarWriteService;
}
