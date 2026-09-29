/**
 * Outlook calendar CLI commands: `calendar calendars|events|event|schedule|find-times`.
 * Maps the calendar-* read tools; the write commands are added by registerCalendarWriteCommands.
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import type { EventSummary } from '../../types.js';
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
