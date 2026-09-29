/**
 * Calendar changes. Registered whatever the switches say, so an agent can see
 * them and tell the user which variable turns them on. Graph sends
 * invitations, updates and cancellations immediately; every result says who
 * was notified.
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';

const json = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const fail = (what: string, error: any) => {
  console.error(`Error: ${what}:`, error);
  return { content: [{ type: 'text', text: `Failed to ${what}: ${error.message}` }], isError: true };
};

const SWITCHES =
  ' No attendees: needs OUTLOOK_ENABLE_CALENDAR_WRITE=true. Notifies anyone: needs OUTLOOK_ENABLE_CALENDAR_INVITE=true, and sends immediately.';
const when = (what: string) => z.string().describe(
  `${what}: ISO date-time, e.g. 2026-10-01T09:00, read in OUTLOOK_TIME_ZONE (default the machine zone) unless it ends in Z or an offset.`
);
const addresses = z.array(z.string()).describe('Email addresses, e.g. ["jdoe@example.com"]');
const owner = z.string().optional().describe(
  "The calendar owner's email, to act on their calendar as their delegate. Needs OUTLOOK_ENABLE_CALENDAR_DELEGATE=true."
);
const record = z.boolean().optional().describe(
  'Record the Teams meeting automatically when it starts (default false). Records video too. Your own calendar only.'
);
const CHANGE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

export function registerCalendarWriteTools(server: any, ctx: ServiceContext): void {

  server.tool(
    'calendar-create-event',
    'Create an appointment, or a meeting with attendees. A meeting with attendees gets a Teams link unless teamsMeeting is false, ' +
      'and the invitations go out at once.' + SWITCHES,
    {
      subject: z.string(),
      start: when('Start'),
      end: when('End'),
      attendees: addresses.optional().describe('Required attendees'),
      optionalAttendees: addresses.optional(),
      location: z.string().optional(),
      body: z.string().optional().describe('Invitation text (plain text)'),
      teamsMeeting: z.boolean().optional().describe('Add a Teams link (default: yes when there are attendees)'),
      recordAutomatically: record,
      showAs: z.enum(['free', 'tentative', 'busy', 'oof', 'workingElsewhere']).optional(),
      calendarOwner: owner,
    },
    CHANGE,
    async (args: any) => {
      try { return json(await ctx.calendarWrite.createEvent(args)); } catch (error: any) { return fail('create event', error); }
    }
  );

  server.tool(
    'calendar-update-event',
    'Change an event you organise: time, subject, location, text or attendees. Pass an occurrence id to change one occurrence, ' +
      'or its seriesMasterId to change the whole series. For a meeting with attendees the update goes out at once.' + SWITCHES,
    {
      eventId: z.string().describe('Event id, or a seriesMasterId for the whole series'),
      subject: z.string().optional(),
      start: when('New start').optional(),
      end: when('New end').optional(),
      location: z.string().optional(),
      body: z.string().optional(),
      attendees: addresses.optional().describe('Replaces the required attendees'),
      optionalAttendees: addresses.optional().describe('Replaces the optional attendees'),
      recordAutomatically: record,
      calendarOwner: owner,
    },
    CHANGE,
    async (args: any) => {
      try { return json(await ctx.calendarWrite.updateEvent(args)); } catch (error: any) { return fail('update event', error); }
    }
  );

  server.tool(
    'calendar-cancel-event',
    'Cancel a meeting you organise, sending attendees the comment, or delete your own appointment (it moves to Deleted Items). ' +
      'For a meeting someone else organises, decline it with calendar-respond-to-event instead.' + SWITCHES,
    {
      eventId: z.string(),
      comment: z.string().optional().describe('Message sent to attendees with the cancellation'),
      calendarOwner: owner,
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async (args: any) => {
      try { return json(await ctx.calendarWrite.cancelEvent(args)); } catch (error: any) { return fail('cancel event', error); }
    }
  );

  server.tool(
    'calendar-respond-to-event',
    'Accept, tentatively accept or decline an invitation, with an optional comment. The organiser is told at once. ' +
      'To suggest another time, give proposedStart and proposedEnd with tentativelyAccept or decline (not accept); ' +
      'the organiser gets a new-time proposal they can accept. ' +
      'Needs OUTLOOK_ENABLE_CALENDAR_INVITE=true.',
    {
      eventId: z.string(),
      response: z.enum(['accept', 'tentativelyAccept', 'decline']),
      comment: z.string().optional(),
      proposedStart: z.string().optional().describe('Proposed new start: ISO date-time, e.g. 2026-10-01T16:00, read in OUTLOOK_TIME_ZONE unless it ends in Z or an offset.'),
      proposedEnd: z.string().optional().describe('Proposed new end, same format as proposedStart.'),
      calendarOwner: owner,
    },
    CHANGE,
    async (args: any) => {
      try { return json(await ctx.calendarWrite.respondToEvent(args)); } catch (error: any) { return fail('respond to event', error); }
    }
  );
}
