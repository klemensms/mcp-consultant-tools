/**
 * Helpers shared by the calendar services: the user's time zone, turning a
 * time the agent gives into UTC for Graph, the path for the user's own or a
 * colleague's calendar, and mapping Graph events to what the tools return.
 */
import { htmlToText, wrapUntrusted } from '../mail-content.js';
import type { EventAttendee, EventDetail, EventSummary } from '../types.js';

export const EVENT_SUMMARY_FIELDS = [
  'id', 'seriesMasterId', 'type', 'subject', 'start', 'end', 'isAllDay', 'location', 'organizer', 'isOrganizer',
  'attendees', 'showAs', 'sensitivity', 'isCancelled', 'responseStatus', 'onlineMeeting', 'webLink',
];
export const EVENT_DETAIL_FIELDS = [...EVENT_SUMMARY_FIELDS, 'body'];

/** OUTLOOK_TIME_ZONE (an IANA name such as Europe/London), else the machine's zone. */
export function userTimeZone(): string {
  return process.env.OUTLOOK_TIME_ZONE?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function preferZone(zone: string = userTimeZone()): string {
  return `outlook.timezone="${zone}"`;
}

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** Offset of zone from UTC, in minutes, at the given instant. */
function offsetMinutes(instant: Date, zone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(instant).map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

function utcString(date: Date): string {
  return date.toISOString().slice(0, 19);
}

/**
 * A time the agent gives, as UTC without a zone suffix. A value with Z or an
 * offset is taken as it is; a value without one is local time in zone.
 */
export function toUtc(value: string, parameter: string, zone: string = userTimeZone()): string {
  const trimmed = value.trim();
  if (HAS_ZONE.test(trimmed)) {
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
      return utcString(date);
    }
  }
  const match = LOCAL.exec(trimmed);
  if (!match) {
    throw new Error(
      `${parameter} must be an ISO date or date-time, such as 2026-10-01 or 2026-10-01T09:00, read in ${zone} unless it ends in Z or an offset; got "${value}".`
    );
  }
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = match;
  const guess = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  const first = new Date(guess.getTime() - offsetMinutes(guess, zone) * 60000);
  const settled = new Date(guess.getTime() - offsetMinutes(first, zone) * 60000);
  return utcString(settled);
}

export function graphTime(value: string, parameter: string, zone?: string) {
  return { dateTime: toUtc(value, parameter, zone), timeZone: 'UTC' };
}

/** /me for the signed-in user, /users/{email} for a colleague or a delegate calendar's owner. */
export function calendarRoot(owner?: string): string {
  return owner ? `/users/${encodeURIComponent(owner)}` : '/me';
}

export function formatPerson(person?: { emailAddress?: { name?: string; address?: string } }): string {
  const name = person?.emailAddress?.name?.trim();
  const address = person?.emailAddress?.address?.trim();
  if (name && address && name !== address) {
    return `${name} <${address}>`;
  }
  return address || name || '';
}

function trimTime(dateTime?: string): string {
  return (dateTime ?? '').replace(/\.\d+$/, '');
}

export function toEventSummary(event: any): EventSummary {
  return {
    id: event.id,
    ...(event.seriesMasterId ? { seriesMasterId: event.seriesMasterId } : {}),
    type: event.type ?? 'singleInstance',
    subject: event.subject ?? '',
    start: trimTime(event.start?.dateTime),
    end: trimTime(event.end?.dateTime),
    timeZone: event.start?.timeZone ?? 'UTC',
    isAllDay: Boolean(event.isAllDay),
    location: event.location?.displayName ?? '',
    organizer: formatPerson(event.organizer),
    isOrganizer: Boolean(event.isOrganizer),
    attendees: (event.attendees ?? []).map((a: any) => a.emailAddress?.address).filter(Boolean),
    showAs: event.showAs ?? 'unknown',
    sensitivity: event.sensitivity ?? 'normal',
    isCancelled: Boolean(event.isCancelled),
    response: event.responseStatus?.response ?? 'none',
    ...(event.onlineMeeting?.joinUrl ? { teamsJoinUrl: event.onlineMeeting.joinUrl } : {}),
    webLink: event.webLink ?? '',
  };
}

export function toEventDetail(event: any): EventDetail {
  const summary = toEventSummary(event);
  const raw = event.body?.content ?? '';
  const text = event.body?.contentType === 'html' ? htmlToText(raw) : raw;
  const attendeeDetails: EventAttendee[] = (event.attendees ?? []).map((a: any) => ({
    address: a.emailAddress?.address ?? '',
    name: a.emailAddress?.name ?? '',
    type: a.type ?? 'required',
    response: a.status?.response ?? 'none',
  }));
  return {
    ...summary,
    attendeeDetails,
    bodyText: wrapUntrusted(text, `calendar event "${summary.subject}" organised by ${summary.organizer}`),
  };
}
