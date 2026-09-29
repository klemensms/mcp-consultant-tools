import { describe, it, expect, afterEach } from 'vitest';
import { toUtc, userTimeZone, calendarRoot, toEventSummary, preferZone } from '../calendar-shared.js';

afterEach(() => { delete process.env.OUTLOOK_TIME_ZONE; });

describe('toUtc', () => {
  it('reads a time without a zone in the given zone, across the clock change', () => {
    expect(toUtc('2026-07-01T09:00', 'start', 'Europe/London')).toBe('2026-07-01T08:00:00');
    expect(toUtc('2026-12-01T09:00:00', 'start', 'Europe/London')).toBe('2026-12-01T09:00:00');
    expect(toUtc('2026-07-01T09:00', 'start', 'America/New_York')).toBe('2026-07-01T13:00:00');
  });

  it('treats a date alone as midnight in the zone', () => {
    expect(toUtc('2026-07-01', 'start', 'Europe/London')).toBe('2026-06-30T23:00:00');
  });

  it('honours an explicit zone or offset in the value', () => {
    expect(toUtc('2026-07-01T09:00:00Z', 'start', 'Europe/London')).toBe('2026-07-01T09:00:00');
    expect(toUtc('2026-07-01T09:00:00+02:00', 'start', 'Europe/London')).toBe('2026-07-01T07:00:00');
  });

  it('rejects something that is not a date, naming the parameter', () => {
    expect(() => toUtc('next tuesday', 'start', 'Europe/London')).toThrow('start must be');
  });
});

describe('userTimeZone', () => {
  it('uses OUTLOOK_TIME_ZONE when set, else the machine zone', () => {
    process.env.OUTLOOK_TIME_ZONE = 'Europe/London';
    expect(userTimeZone()).toBe('Europe/London');
    delete process.env.OUTLOOK_TIME_ZONE;
    expect(userTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('calendarRoot and preferZone', () => {
  it('uses /me without an owner and an encoded /users path with one', () => {
    expect(calendarRoot()).toBe('/me');
    expect(calendarRoot('j+doe@example.com')).toBe('/users/j%2Bdoe%40example.com');
    expect(preferZone('Europe/London')).toBe('outlook.timezone="Europe/London"');
  });
});

describe('toEventSummary', () => {
  it('maps a Graph event', () => {
    const summary = toEventSummary({
      id: 'EVT1', seriesMasterId: 'SER1', type: 'occurrence', subject: 'Review',
      start: { dateTime: '2026-07-01T09:00:00.0000000', timeZone: 'Europe/London' },
      end: { dateTime: '2026-07-01T09:30:00.0000000', timeZone: 'Europe/London' },
      isAllDay: false, location: { displayName: 'Room 1' },
      organizer: { emailAddress: { name: 'Jane Doe', address: 'jdoe@example.com' } }, isOrganizer: false,
      attendees: [{ type: 'required', emailAddress: { address: 'jdoe@example.com' }, status: { response: 'accepted' } }],
      showAs: 'busy', sensitivity: 'normal', isCancelled: false, responseStatus: { response: 'accepted' },
      onlineMeeting: { joinUrl: 'https://teams.example.com/l/meetup-join/abc' }, webLink: 'https://outlook.example.com/e',
    });
    expect(summary).toMatchObject({
      id: 'EVT1', seriesMasterId: 'SER1', start: '2026-07-01T09:00:00', timeZone: 'Europe/London',
      organizer: 'Jane Doe <jdoe@example.com>', attendees: ['jdoe@example.com'], response: 'accepted',
      teamsJoinUrl: 'https://teams.example.com/l/meetup-join/abc',
    });
  });
});
