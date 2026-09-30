/**
 * Calendar read tools. The user's own calendar, free/busy and suggested
 * times need OUTLOOK_ENABLE_CALENDAR_READ, which is on while unset; a
 * colleague's calendar needs OUTLOOK_ENABLE_CALENDAR_SHARED.
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';

const json = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const fail = (what: string, error: any) => {
  console.error(`Error: ${what}:`, error);
  return { content: [{ type: 'text', text: `Failed to ${what}: ${error.message}` }], isError: true };
};

const when = (what: string) => z.string().describe(
  `${what}: ISO date or date-time, e.g. 2026-10-01 or 2026-10-01T09:00. Read in OUTLOOK_TIME_ZONE (default the machine zone) unless it ends in Z or an offset.`
);
const user = z.string().optional().describe(
  "A colleague's email, to read their calendar instead of yours. Needs their calendar shared with you and OUTLOOK_ENABLE_CALENDAR_SHARED=true."
);
const READ = { readOnlyHint: true, openWorldHint: true };

export function registerCalendarReadTools(server: any, ctx: ServiceContext): void {

  server.tool(
    'calendar-list-calendars',
    'List your calendars, plus the shared calendars you have added in Outlook, with whether you can edit each.',
    {},
    READ,
    async () => {
      try { return json(await ctx.calendar.listCalendars()); } catch (error: any) { return fail('list calendars', error); }
    }
  );

  server.tool(
    'calendar-list-events',
    'List events between start and end, oldest first, for you or a colleague whose calendar is shared with you. ' +
      'Each occurrence of a repeating meeting is listed; its seriesMasterId identifies the whole series. Private events show as busy with no details.',
    { start: when('Start'), end: when('End'), user, top: z.number().optional().describe('Maximum events (default 50, max 200)') },
    READ,
    async (args: any) => {
      try { return json(await ctx.calendar.listEvents(args)); } catch (error: any) { return fail('list events', error); }
    }
  );

  server.tool(
    'calendar-get-event',
    'Get one event in full: attendees with their responses, the Teams link and the invitation text (untrusted content).',
    { eventId: z.string().describe('Event id from calendar-list-events'), user },
    READ,
    async (args: any) => {
      try { return json(await ctx.calendar.getEvent(args.eventId, args.user)); } catch (error: any) { return fail('get event', error); }
    }
  );

  server.tool(
    'calendar-get-schedule',
    "Free/busy for several people at once, for anyone in your organisation, even if they have shared nothing. " +
      'availabilityView has one digit per interval: 0 free, 1 tentative, 2 busy, 3 out of office, 4 working elsewhere. Subjects appear only where their settings allow.',
    {
      people: z.array(z.string()).describe('Email addresses, e.g. ["jdoe@example.com"]'),
      start: when('Start'),
      end: when('End'),
      intervalMinutes: z.number().optional().describe('Length of each availabilityView slot (default 30)'),
    },
    READ,
    async (args: any) => {
      try { return json(await ctx.calendar.getSchedule(args)); } catch (error: any) { return fail('get schedule', error); }
    }
  );

  server.tool(
    'calendar-find-meeting-times',
    'Suggest meeting slots in working hours when every attendee and you are free, between start and end.',
    {
      attendees: z.array(z.string()).describe('Email addresses of the people who must attend'),
      durationMinutes: z.number().describe('Meeting length in minutes, e.g. 30'),
      start: when('Earliest start'),
      end: when('Latest end'),
      maxCandidates: z.number().optional().describe('Maximum suggestions (default 10)'),
    },
    READ,
    async (args: any) => {
      try { return json(await ctx.calendar.findMeetingTimes(args)); } catch (error: any) { return fail('find meeting times', error); }
    }
  );
}
