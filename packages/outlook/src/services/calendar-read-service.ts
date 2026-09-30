/**
 * Reading calendars: the user's own, colleagues' shared ones
 * (OUTLOOK_ENABLE_CALENDAR_SHARED), free/busy for anyone and suggested
 * meeting times. Nothing here changes a calendar.
 */
import type { Client } from '@microsoft/microsoft-graph-client';
import { permissionHint, requireCalendarSwitch } from '../permissions.js';
import type { GraphClientProvider } from './mail-read-service.js';
import {
  EVENT_DETAIL_FIELDS, EVENT_SUMMARY_FIELDS, calendarRoot, formatPerson, graphTime, preferZone, toEventDetail,
  toEventSummary, toUtc,
} from './calendar-shared.js';
import type { CalendarInfo, EventDetail, EventSummary, MeetingTimeSuggestion, PersonSchedule } from '../types.js';

const DEFAULT_TOP = 50;
const MAX_TOP = 200;

function clampTop(top?: number): number {
  if (top === undefined || !Number.isFinite(top)) return DEFAULT_TOP;
  return Math.min(Math.max(Math.trunc(top), 1), MAX_TOP);
}

function window(start: string, end: string) {
  const from = toUtc(start, 'start');
  const to = toUtc(end, 'end');
  if (to <= from) {
    throw new Error('end must be after start.');
  }
  return { from, to };
}

export class CalendarReadService {
  constructor(private readonly auth: GraphClientProvider) {}

  private get graph(): Client {
    return this.auth.getGraphClient();
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    requireCalendarSwitch('calendar-read');
    try {
      const response = await this.graph.api('/me/calendars')
        .select(['id', 'name', 'owner', 'canEdit', 'isDefaultCalendar'])
        .top(100)
        .get();
      return (response.value ?? []).map((c: any) => ({
        id: c.id,
        name: c.name ?? '',
        owner: c.owner?.address ?? c.owner?.name ?? '',
        canEdit: Boolean(c.canEdit),
        isDefault: Boolean(c.isDefaultCalendar),
      }));
    } catch (error) {
      throw permissionHint(error, 'calendar-read');
    }
  }

  async listEvents(options: { start: string; end: string; user?: string; top?: number }): Promise<EventSummary[]> {
    requireCalendarSwitch(options.user ? 'calendar-shared' : 'calendar-read');
    const { from, to } = window(options.start, options.end);
    try {
      const response = await this.graph.api(`${calendarRoot(options.user)}/calendarView`)
        .query({ startDateTime: `${from}Z`, endDateTime: `${to}Z` })
        .select(EVENT_SUMMARY_FIELDS)
        .orderby('start/dateTime')
        .top(clampTop(options.top))
        .header('Prefer', preferZone())
        .get();
      return (response.value ?? []).map(toEventSummary);
    } catch (error) {
      throw permissionHint(error, options.user ? 'calendar-shared' : 'calendar-read');
    }
  }

  async getEvent(eventId: string, user?: string): Promise<EventDetail> {
    requireCalendarSwitch(user ? 'calendar-shared' : 'calendar-read');
    try {
      const event = await this.graph.api(`${calendarRoot(user)}/events/${encodeURIComponent(eventId)}`)
        .select(EVENT_DETAIL_FIELDS)
        .header('Prefer', preferZone())
        .get();
      return toEventDetail(event);
    } catch (error) {
      throw permissionHint(error, user ? 'calendar-shared' : 'calendar-read');
    }
  }

  async getSchedule(options: { people: string[]; start: string; end: string; intervalMinutes?: number }): Promise<PersonSchedule[]> {
    requireCalendarSwitch('calendar-read');
    if (!options.people?.length) throw new Error('people needs at least one email address.');
    const { from, to } = window(options.start, options.end);
    try {
      const response = await this.graph.api('/me/calendar/getSchedule')
        .header('Prefer', preferZone())
        .post({
          schedules: options.people,
          startTime: { dateTime: from, timeZone: 'UTC' },
          endTime: { dateTime: to, timeZone: 'UTC' },
          availabilityViewInterval: options.intervalMinutes ?? 30,
        });
      return (response.value ?? []).map((s: any) => ({
        person: s.scheduleId,
        availabilityView: s.availabilityView ?? '',
        items: (s.scheduleItems ?? []).map((i: any) => ({
          status: i.status,
          start: (i.start?.dateTime ?? '').replace(/\.\d+$/, ''),
          end: (i.end?.dateTime ?? '').replace(/\.\d+$/, ''),
          ...(i.subject ? { subject: i.subject } : {}),
          ...(i.location ? { location: i.location } : {}),
        })),
        ...(s.error?.message ? { error: s.error.message } : {}),
      }));
    } catch (error) {
      throw permissionHint(error, 'calendar-read');
    }
  }

  async findMeetingTimes(options: {
    attendees: string[]; durationMinutes: number; start: string; end: string; maxCandidates?: number;
  }): Promise<{ suggestions: MeetingTimeSuggestion[]; emptySuggestionsReason?: string }> {
    requireCalendarSwitch('calendar-read');
    if (!options.attendees?.length) throw new Error('attendees needs at least one email address.');
    window(options.start, options.end);
    try {
      const response = await this.graph.api('/me/findMeetingTimes')
        .header('Prefer', preferZone())
        .post({
          attendees: options.attendees.map((address) => ({ type: 'required', emailAddress: { address } })),
          timeConstraint: {
            activityDomain: 'work',
            timeSlots: [{ start: graphTime(options.start, 'start'), end: graphTime(options.end, 'end') }],
          },
          meetingDuration: `PT${Math.trunc(options.durationMinutes)}M`,
          maxCandidates: options.maxCandidates ?? 10,
          minimumAttendeePercentage: 100,
          isOrganizerOptional: false,
          returnSuggestionReasons: true,
        });
      return {
        suggestions: (response.meetingTimeSuggestions ?? []).map((s: any) => ({
          start: (s.meetingTimeSlot?.start?.dateTime ?? '').replace(/\.\d+$/, ''),
          end: (s.meetingTimeSlot?.end?.dateTime ?? '').replace(/\.\d+$/, ''),
          timeZone: s.meetingTimeSlot?.start?.timeZone ?? 'UTC',
          confidence: s.confidence ?? 0,
          attendeeAvailability: (s.attendeeAvailability ?? []).map((a: any) => ({
            attendee: formatPerson(a.attendee), availability: a.availability,
          })),
        })),
        ...(response.emptySuggestionsReason ? { emptySuggestionsReason: response.emptySuggestionsReason } : {}),
      };
    } catch (error) {
      throw permissionHint(error, 'calendar-shared');
    }
  }
}
