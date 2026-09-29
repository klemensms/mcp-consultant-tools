/**
 * Outlook calendar CLI commands: `calendar calendars|events|event|schedule|find-times`.
 * Maps the calendar-* tools: reads here, changes in registerCalendarWriteCommands.
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import type { EventChangeResult, EventSummary } from '../../types.js';
import { outputResult, handleCliError } from '../output.js';

const int = (value: string) => parseInt(value, 10);
const list = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean);

export function eventLines(events: EventSummary[]): string {
  return events
    .map((e) => `  ${e.start} - ${e.end} (${e.timeZone})  ${e.subject}  [${e.showAs}]${e.isOrganizer ? '  (you organise)' : ''}\n      id: ${e.id}`)
    .join('\n');
}

export function registerCalendarCommands(program: Command, ctx: ServiceContext): Command {
  const calendar = program.command('calendar').description('Read and schedule calendar events');

  // calendar-list-calendars
  calendar.command('calendars').description('List your calendars and the shared ones you have added')
    .action(async () => {
      try {
        const calendars = await ctx.calendar.listCalendars();
        outputResult({ fileName: 'calendars', data: calendars,
          summary: calendars.map((c) => `  ${c.name}  (${c.owner})${c.canEdit ? '  editable' : ''}  id: ${c.id}`).join('\n') });
      } catch (error) { handleCliError(error); }
    });

  // calendar-list-events
  calendar.command('events').description('List events in a date range')
    .requiredOption('--start <when>', 'Start, e.g. 2026-10-01 or 2026-10-01T09:00')
    .requiredOption('--end <when>', 'End')
    .option('--user <email>', "A colleague's shared calendar")
    .option('--top <n>', 'Maximum events', int)
    .action(async (opts) => {
      try {
        const events = await ctx.calendar.listEvents(opts);
        outputResult({ fileName: 'events', data: events, summary: eventLines(events) });
      } catch (error) { handleCliError(error); }
    });

  // calendar-get-event
  calendar.command('event <eventId>').description('Get one event in full')
    .option('--user <email>', "A colleague's shared calendar")
    .action(async (eventId: string, opts) => {
      try {
        const event = await ctx.calendar.getEvent(eventId, opts.user);
        outputResult({ fileName: 'event', data: event, summary: eventLines([event]) });
      } catch (error) { handleCliError(error); }
    });

  // calendar-get-schedule
  calendar.command('schedule').description('Free/busy for several people')
    .requiredOption('--people <emails>', 'Comma-separated email addresses', list)
    .requiredOption('--start <when>', 'Start')
    .requiredOption('--end <when>', 'End')
    .option('--interval <minutes>', 'Slot length', int)
    .action(async (opts) => {
      try {
        const schedules = await ctx.calendar.getSchedule({ ...opts, intervalMinutes: opts.interval });
        outputResult({ fileName: 'schedule', data: schedules,
          summary: schedules.map((s) => `  ${s.person}  ${s.availabilityView}${s.error ? `  (${s.error})` : ''}`).join('\n') });
      } catch (error) { handleCliError(error); }
    });

  // calendar-find-meeting-times
  calendar.command('find-times').description('Suggest meeting slots when everyone is free')
    .requiredOption('--attendees <emails>', 'Comma-separated email addresses', list)
    .requiredOption('--duration <minutes>', 'Meeting length', int)
    .requiredOption('--start <when>', 'Earliest start')
    .requiredOption('--end <when>', 'Latest end')
    .option('--max <n>', 'Maximum suggestions', int)
    .action(async (opts) => {
      try {
        const result = await ctx.calendar.findMeetingTimes({
          attendees: opts.attendees, durationMinutes: opts.duration, start: opts.start, end: opts.end, maxCandidates: opts.max,
        });
        outputResult({ fileName: 'meeting-times', data: result,
          summary: result.suggestions.map((s) => `  ${s.start} - ${s.end} (${s.timeZone})  confidence ${s.confidence}`).join('\n')
            || `  No suggestions: ${result.emptySuggestionsReason ?? 'unknown reason'}` });
      } catch (error) { handleCliError(error); }
    });

  return calendar;
}

function changeSummary(r: EventChangeResult): string {
  return [`  ${r.message}`, r.recording ? `  ${r.recording}` : '', `  id: ${r.eventId}`].filter(Boolean).join('\n');
}

export function registerCalendarWriteCommands(calendar: Command, ctx: ServiceContext): void {
  // calendar-create-event
  calendar.command('create').description('Create an appointment, or a meeting with attendees (invitations go out at once)')
    .requiredOption('--subject <text>', 'Subject')
    .requiredOption('--start <when>', 'Start')
    .requiredOption('--end <when>', 'End')
    .option('--attendees <emails>', 'Required attendees, comma-separated', list)
    .option('--optional <emails>', 'Optional attendees, comma-separated', list)
    .option('--location <text>', 'Location')
    .option('--body <text>', 'Invitation text')
    .option('--no-teams', 'No Teams link')
    .option('--record', 'Record automatically')
    .option('--show-as <status>', 'free, tentative, busy, oof or workingElsewhere')
    .option('--owner <email>', 'Act on this calendar as its delegate')
    .action(async (opts) => {
      try {
        const result = await ctx.calendarWrite.createEvent({
          subject: opts.subject, start: opts.start, end: opts.end, attendees: opts.attendees, optionalAttendees: opts.optional,
          location: opts.location, body: opts.body, teamsMeeting: opts.teams === false ? false : undefined,
          recordAutomatically: opts.record, showAs: opts.showAs, calendarOwner: opts.owner,
        });
        outputResult({ fileName: 'event-created', data: result, summary: changeSummary(result) });
      } catch (error) { handleCliError(error); }
    });

  // calendar-update-event
  calendar.command('update <eventId>').description('Change an event you organise')
    .option('--subject <text>', 'Subject')
    .option('--start <when>', 'New start')
    .option('--end <when>', 'New end')
    .option('--location <text>', 'Location')
    .option('--body <text>', 'Text')
    .option('--attendees <emails>', 'Replace required attendees', list)
    .option('--optional <emails>', 'Replace optional attendees', list)
    .option('--record', 'Record automatically')
    .option('--no-record', 'Stop automatic recording')
    .option('--owner <email>', 'Act on this calendar as its delegate')
    .action(async (eventId: string, opts) => {
      try {
        const result = await ctx.calendarWrite.updateEvent({
          eventId, subject: opts.subject, start: opts.start, end: opts.end, location: opts.location, body: opts.body,
          attendees: opts.attendees, optionalAttendees: opts.optional, recordAutomatically: opts.record, calendarOwner: opts.owner,
        });
        outputResult({ fileName: 'event-updated', data: result, summary: changeSummary(result) });
      } catch (error) { handleCliError(error); }
    });

  // calendar-cancel-event
  calendar.command('cancel <eventId>').description('Cancel a meeting you organise, or delete your own appointment')
    .option('--comment <text>', 'Message to attendees')
    .option('--owner <email>', 'Act on this calendar as its delegate')
    .action(async (eventId: string, opts) => {
      try {
        const result = await ctx.calendarWrite.cancelEvent({ eventId, comment: opts.comment, calendarOwner: opts.owner });
        outputResult({ fileName: 'event-cancelled', data: result, summary: changeSummary(result) });
      } catch (error) { handleCliError(error); }
    });

  // calendar-respond-to-event
  calendar.command('respond <eventId> <response>').description('accept, tentativelyAccept or decline an invitation')
    .option('--comment <text>', 'Comment to the organiser')
    .option('--propose-start <datetime>', 'Propose a new start (with tentativelyAccept or decline)')
    .option('--propose-end <datetime>', 'Propose a new end (with tentativelyAccept or decline)')
    .option('--owner <email>', 'Act on this calendar as its delegate')
    .action(async (eventId: string, response: any, opts) => {
      try {
        const result = await ctx.calendarWrite.respondToEvent({
          eventId, response, comment: opts.comment, calendarOwner: opts.owner,
          proposedStart: opts.proposeStart, proposedEnd: opts.proposeEnd,
        });
        outputResult({ fileName: 'event-response', data: result, summary: changeSummary(result) });
      } catch (error) { handleCliError(error); }
    });
}
