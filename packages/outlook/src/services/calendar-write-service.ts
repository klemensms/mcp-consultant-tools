/**
 * Changing calendars. Which switch a call needs depends on what it does:
 * a change that notifies nobody on your own calendar needs
 * OUTLOOK_ENABLE_CALENDAR_WRITE; anything that notifies another person needs
 * OUTLOOK_ENABLE_CALENDAR_INVITE; any change on a calendar you are a delegate
 * on needs OUTLOOK_ENABLE_CALENDAR_DELEGATE, plus invite when it notifies.
 * Graph sends invitations, updates and cancellations the moment the call is
 * made; there is no draft meeting.
 */
import type { Client } from '@microsoft/microsoft-graph-client';
import { isEnabled } from '@mcp-consultant-tools/m365-core';
import { permissionHint, requireCalendarSwitch } from '../permissions.js';
import type { CalendarGroup } from '../permissions.js';
import type { GraphClientProvider } from './mail-read-service.js';
import { calendarRoot, graphTime, toUtc } from './calendar-shared.js';
import type { EventChangeResult } from '../types.js';

export const NO_ONE_NOTIFIED = 'No one was notified.';

export interface CreateEventInput {
  subject: string; start: string; end: string;
  attendees?: string[]; optionalAttendees?: string[];
  location?: string; body?: string;
  /** Default: true when there are attendees, false otherwise. */
  teamsMeeting?: boolean;
  /** Default false. Task 6. */
  recordAutomatically?: boolean;
  showAs?: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere';
  /** Email of the calendar's owner, to act as their delegate. */
  calendarOwner?: string;
}

export interface UpdateEventInput {
  eventId: string; calendarOwner?: string;
  subject?: string; start?: string; end?: string; location?: string; body?: string;
  /** Replaces the attendee list when given. */
  attendees?: string[]; optionalAttendees?: string[];
  recordAutomatically?: boolean;
}

function notifiedLine(notified: string[]): string {
  return notified.length ? `Notified: ${notified.join(', ')}.` : NO_ONE_NOTIFIED;
}

function addressesOf(event: any): string[] {
  return (event.attendees ?? []).map((a: any) => a.emailAddress?.address).filter(Boolean);
}

function attendeeList(required: string[] = [], optional: string[] = []) {
  return [
    ...required.map((address) => ({ type: 'required', emailAddress: { address } })),
    ...optional.map((address) => ({ type: 'optional', emailAddress: { address } })),
  ];
}

function checkOrder(start: string, end: string): void {
  if (toUtc(end, 'end') <= toUtc(start, 'start')) {
    throw new Error('end must be after start.');
  }
}

function gate(owner: string | undefined, notifies: boolean): void {
  if (owner) {
    requireCalendarSwitch('calendar-delegate');
    if (notifies) requireCalendarSwitch('calendar-invite');
    return;
  }
  requireCalendarSwitch(notifies ? 'calendar-invite' : 'calendar-write');
}

/** Before reading an event to decide: refuse at once when no switch could allow the change. */
function pregate(owner: string | undefined): void {
  if (owner) {
    requireCalendarSwitch('calendar-delegate');
    return;
  }
  if (!isEnabled('OUTLOOK_ENABLE_CALENDAR_WRITE') && !isEnabled('OUTLOOK_ENABLE_CALENDAR_INVITE')) {
    throw new Error(
      'Changing your calendar is disabled. Set OUTLOOK_ENABLE_CALENDAR_WRITE=true for appointments that notify nobody, ' +
        'or OUTLOOK_ENABLE_CALENDAR_INVITE=true for meetings with attendees.'
    );
  }
}

function hintGroup(owner: string | undefined, notifies: boolean): CalendarGroup {
  return owner ? 'calendar-delegate' : notifies ? 'calendar-invite' : 'calendar-write';
}

export class CalendarWriteService {
  constructor(private readonly auth: GraphClientProvider) {}

  private get graph(): Client {
    return this.auth.getGraphClient();
  }

  private eventPath(eventId: string, owner?: string): string {
    return `${calendarRoot(owner)}/events/${encodeURIComponent(eventId)}`;
  }

  private async readEvent(eventId: string, owner?: string): Promise<any> {
    try {
      return await this.graph.api(this.eventPath(eventId, owner))
        .select(['id', 'subject', 'isOrganizer', 'attendees', 'organizer', 'onlineMeeting', 'isOnlineMeeting', 'webLink'])
        .get();
    } catch (error) {
      throw permissionHint(error, owner ? 'calendar-delegate' : 'calendar-read');
    }
  }

  async createEvent(input: CreateEventInput): Promise<EventChangeResult> {
    if (!input.subject?.trim()) throw new Error('subject is required.');
    const attendees = attendeeList(input.attendees, input.optionalAttendees);
    const notifies = attendees.length > 0;
    gate(input.calendarOwner, notifies);
    checkOrder(input.start, input.end);
    const teams = input.teamsMeeting ?? notifies;
    const event: Record<string, unknown> = {
      subject: input.subject,
      start: graphTime(input.start, 'start'),
      end: graphTime(input.end, 'end'),
      attendees,
      isOnlineMeeting: teams,
      ...(teams ? { onlineMeetingProvider: 'teamsForBusiness' } : {}),
      ...(input.location ? { location: { displayName: input.location } } : {}),
      ...(input.body ? { body: { contentType: 'text', content: input.body } } : {}),
      ...(input.showAs ? { showAs: input.showAs } : {}),
    };
    let created: any;
    try {
      created = await this.graph.api(`${calendarRoot(input.calendarOwner)}/events`).post(event);
    } catch (error) {
      throw permissionHint(error, hintGroup(input.calendarOwner, notifies));
    }
    const notified = attendees.map((a) => a.emailAddress.address);
    return { eventId: created.id, webLink: created.webLink ?? '', notified, message: notifiedLine(notified) };
  }

  async updateEvent(input: UpdateEventInput): Promise<EventChangeResult> {
    pregate(input.calendarOwner);
    const existing = await this.readEvent(input.eventId, input.calendarOwner);
    if (!existing.isOrganizer) {
      throw new Error('Only meetings you organise can be changed. To answer an invitation, use calendar-respond-to-event.');
    }
    const replacing = input.attendees !== undefined || input.optionalAttendees !== undefined;
    const attendees = replacing ? attendeeList(input.attendees, input.optionalAttendees) : undefined;
    const notified = attendees ? attendees.map((a) => a.emailAddress.address) : addressesOf(existing);
    const notifies = notified.length > 0 || addressesOf(existing).length > 0;
    gate(input.calendarOwner, notifies);
    if (input.start && input.end) checkOrder(input.start, input.end);
    const patch: Record<string, unknown> = {
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.start ? { start: graphTime(input.start, 'start') } : {}),
      ...(input.end ? { end: graphTime(input.end, 'end') } : {}),
      ...(input.location !== undefined ? { location: { displayName: input.location } } : {}),
      ...(input.body !== undefined ? { body: { contentType: 'text', content: input.body } } : {}),
      ...(attendees ? { attendees } : {}),
    };
    let updated: any = existing;
    if (Object.keys(patch).length > 0) {
      try {
        updated = await this.graph.api(this.eventPath(input.eventId, input.calendarOwner)).patch(patch);
      } catch (error) {
        throw permissionHint(error, hintGroup(input.calendarOwner, notifies));
      }
    }
    const sent = Object.keys(patch).length > 0 ? notified : [];
    return { eventId: input.eventId, webLink: updated?.webLink ?? existing.webLink ?? '', notified: sent, message: notifiedLine(sent) };
  }

  async cancelEvent(input: { eventId: string; comment?: string; calendarOwner?: string }): Promise<EventChangeResult> {
    pregate(input.calendarOwner);
    const existing = await this.readEvent(input.eventId, input.calendarOwner);
    if (!existing.isOrganizer) {
      throw new Error('Only meetings you organise can be cancelled. To leave a meeting someone else organises, decline it with calendar-respond-to-event.');
    }
    const attendees = addressesOf(existing);
    const notifies = attendees.length > 0;
    gate(input.calendarOwner, notifies);
    const path = this.eventPath(input.eventId, input.calendarOwner);
    try {
      if (notifies) {
        await this.graph.api(`${path}/cancel`).post(input.comment ? { comment: input.comment } : {});
      } else {
        await this.graph.api(path).delete();
      }
    } catch (error) {
      throw permissionHint(error, hintGroup(input.calendarOwner, notifies));
    }
    return {
      eventId: input.eventId,
      webLink: existing.webLink ?? '',
      notified: attendees,
      message: notifies
        ? `Cancelled. ${notifiedLine(attendees)}`
        : `Deleted; the appointment is in Deleted Items. ${NO_ONE_NOTIFIED}`,
    };
  }

  async respondToEvent(input: {
    eventId: string; response: 'accept' | 'tentativelyAccept' | 'decline'; comment?: string; calendarOwner?: string;
  }): Promise<EventChangeResult> {
    gate(input.calendarOwner, true);
    const existing = await this.readEvent(input.eventId, input.calendarOwner);
    if (existing.isOrganizer) {
      throw new Error('You organise this meeting, so there is no invitation to answer. Use calendar-update-event or calendar-cancel-event.');
    }
    try {
      await this.graph.api(`${this.eventPath(input.eventId, input.calendarOwner)}/${input.response}`)
        .post({ ...(input.comment ? { comment: input.comment } : {}), sendResponse: true });
    } catch (error) {
      throw permissionHint(error, hintGroup(input.calendarOwner, true));
    }
    const organiser = existing.organizer?.emailAddress?.address;
    const notified = organiser ? [organiser] : [];
    return { eventId: input.eventId, webLink: existing.webLink ?? '', notified, message: notifiedLine(notified) };
  }
}
