import { describe, it, expect, afterEach } from 'vitest';
import { CalendarWriteService, NO_ONE_NOTIFIED } from '../calendar-write-service.js';
import { recordingGraph, graphError } from '../../__tests__/graph-recorder.js';
import { CALENDAR_SWITCHES } from '../../permissions.js';

const MEETING = {
  id: 'EVT1', isOrganizer: true, subject: 'Review', webLink: 'https://outlook.example.com/e',
  attendees: [{ emailAddress: { address: 'jdoe@example.com' } }],
  organizer: { emailAddress: { name: 'Jane Doe', address: 'jdoe@example.com' } },
};
const APPOINTMENT = { ...MEETING, attendees: [] };

function service(respond: (r: any) => unknown = () => ({ id: 'EVT1', webLink: 'https://outlook.example.com/e' })) {
  const graph = recordingGraph(respond);
  return { svc: new CalendarWriteService({ getGraphClient: () => graph.client }), requests: graph.requests };
}
const on = (...names: string[]) => { for (const n of names) process.env[`OUTLOOK_ENABLE_CALENDAR_${n}`] = 'true'; };

afterEach(() => { for (const name of CALENDAR_SWITCHES) delete process.env[name]; delete process.env.OUTLOOK_TIME_ZONE; });

describe('createEvent', () => {
  it('creates an appointment with the write switch, no attendees, no Teams link, and says no one was notified', async () => {
    on('WRITE');
    process.env.OUTLOOK_TIME_ZONE = 'Europe/London';
    const { svc, requests } = service();
    const result = await svc.createEvent({ subject: 'Focus', start: '2026-07-01T09:00', end: '2026-07-01T10:00' });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', path: '/me/events' });
    expect(requests[0].body).toMatchObject({
      subject: 'Focus', start: { dateTime: '2026-07-01T08:00:00', timeZone: 'UTC' }, isOnlineMeeting: false,
    });
    expect(requests[0].body.attendees).toEqual([]);
    expect(requests[0].body).not.toHaveProperty('onlineMeetingProvider');
    expect(result).toMatchObject({ eventId: 'EVT1', notified: [], message: NO_ONE_NOTIFIED });
  });

  it('refuses a meeting with attendees on the write switch alone, before any request', async () => {
    on('WRITE');
    const { svc, requests } = service();
    await expect(svc.createEvent({ subject: 's', start: '2026-07-01T09:00', end: '2026-07-01T10:00', attendees: ['jdoe@example.com'] }))
      .rejects.toThrow('Set OUTLOOK_ENABLE_CALENDAR_INVITE=true to enable');
    expect(requests).toHaveLength(0);
  });

  it('sends a Teams meeting invitation with the invite switch and names who was notified', async () => {
    on('INVITE');
    const { svc, requests } = service();
    const result = await svc.createEvent({
      subject: 's', start: '2026-07-01T09:00Z', end: '2026-07-01T10:00Z', attendees: ['jdoe@example.com'], optionalAttendees: ['x@example.com'],
    });
    expect(requests[0].body).toMatchObject({
      isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness',
      attendees: [
        { type: 'required', emailAddress: { address: 'jdoe@example.com' } },
        { type: 'optional', emailAddress: { address: 'x@example.com' } },
      ],
    });
    expect(result.notified).toEqual(['jdoe@example.com', 'x@example.com']);
    expect(result.message).toBe('Notified: jdoe@example.com, x@example.com.');
  });

  it('never touches online meetings or transcription unless recording is asked for', async () => {
    on('INVITE');
    const { svc, requests } = service();
    await svc.createEvent({ subject: 's', start: '2026-07-01T09:00Z', end: '2026-07-01T10:00Z', attendees: ['jdoe@example.com'] });
    expect(requests.some((r) => r.path.includes('onlineMeetings'))).toBe(false);
    expect(JSON.stringify(requests[0].body)).not.toMatch(/transcri/i);
  });

  it('needs the delegate switch for another calendar, and the invite switch too when it notifies', async () => {
    on('INVITE');
    const { svc, requests } = service();
    const input = { subject: 's', start: '2026-07-01T09:00Z', end: '2026-07-01T10:00Z', attendees: ['jdoe@example.com'], calendarOwner: 'jdoe@example.com' };
    await expect(svc.createEvent(input)).rejects.toThrow('OUTLOOK_ENABLE_CALENDAR_DELEGATE=true');
    on('DELEGATE');
    await svc.createEvent(input);
    expect(requests[0].path).toBe('/users/jdoe%40example.com/events');
  });

  it('rejects an end before the start', async () => {
    on('WRITE');
    const { svc } = service();
    await expect(svc.createEvent({ subject: 's', start: '2026-07-01T10:00Z', end: '2026-07-01T09:00Z' })).rejects.toThrow('end must be after start');
  });
});

describe('updateEvent', () => {
  it('refuses with every switch off, before any request', async () => {
    const { svc, requests } = service(() => MEETING);
    await expect(svc.updateEvent({ eventId: 'EVT1', subject: 'x' })).rejects.toThrow('OUTLOOK_ENABLE_CALENDAR_WRITE');
    expect(requests).toHaveLength(0);
  });

  it('refuses a meeting with attendees on the write switch alone, after reading it and before any change', async () => {
    on('WRITE');
    const { svc, requests } = service(() => MEETING);
    await expect(svc.updateEvent({ eventId: 'EVT1', subject: 'x' })).rejects.toThrow('OUTLOOK_ENABLE_CALENDAR_INVITE=true');
    expect(requests.map((r) => r.method)).toEqual(['GET']);
  });

  it('refuses a meeting someone else organises and points to respond', async () => {
    on('WRITE', 'INVITE');
    const { svc, requests } = service(() => ({ ...MEETING, isOrganizer: false }));
    await expect(svc.updateEvent({ eventId: 'EVT1', subject: 'x' })).rejects.toThrow('calendar-respond-to-event');
    expect(requests.map((r) => r.method)).toEqual(['GET']);
  });

  it('patches only the fields given and names the attendees notified', async () => {
    on('INVITE');
    const { svc, requests } = service((r) => (r.method === 'GET' ? MEETING : { ...MEETING }));
    const result = await svc.updateEvent({ eventId: 'EVT1', start: '2026-07-01T09:30Z', end: '2026-07-01T10:30Z' });
    expect(requests[1]).toMatchObject({ method: 'PATCH', path: '/me/events/EVT1' });
    expect(Object.keys(requests[1].body).sort()).toEqual(['end', 'start']);
    expect(result.notified).toEqual(['jdoe@example.com']);
  });

  it('updates an appointment with no attendees on the write switch and notifies no one', async () => {
    on('WRITE');
    const { svc } = service(() => APPOINTMENT);
    const result = await svc.updateEvent({ eventId: 'EVT1', subject: 'x' });
    expect(result.message).toBe(NO_ONE_NOTIFIED);
  });
});

describe('cancelEvent', () => {
  it('cancels a meeting with attendees through /cancel with the comment, never a delete', async () => {
    on('INVITE');
    const { svc, requests } = service((r) => (r.method === 'GET' ? MEETING : undefined));
    const result = await svc.cancelEvent({ eventId: 'EVT1', comment: 'Test finished - cancelling.' });
    expect(requests[1]).toMatchObject({ method: 'POST', path: '/me/events/EVT1/cancel', body: { comment: 'Test finished - cancelling.' } });
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
    expect(result.notified).toEqual(['jdoe@example.com']);
  });

  it('deletes an appointment with no attendees on the write switch, never permanently', async () => {
    on('WRITE');
    const { svc, requests } = service((r) => (r.method === 'GET' ? APPOINTMENT : undefined));
    const result = await svc.cancelEvent({ eventId: 'EVT1' });
    expect(requests[1]).toMatchObject({ method: 'DELETE', path: '/me/events/EVT1' });
    expect(requests.some((r) => r.path.includes('permanentDelete'))).toBe(false);
    expect(result.message).toContain('Deleted Items');
    expect(result.message).toContain(NO_ONE_NOTIFIED);
  });

  it('refuses a meeting someone else organises and points to declining', async () => {
    on('WRITE', 'INVITE');
    const { svc } = service(() => ({ ...MEETING, isOrganizer: false }));
    await expect(svc.cancelEvent({ eventId: 'EVT1' })).rejects.toThrow('decline');
  });
});

describe('respondToEvent', () => {
  it('needs the invite switch, before any request', async () => {
    on('WRITE');
    const { svc, requests } = service();
    await expect(svc.respondToEvent({ eventId: 'EVT1', response: 'accept' })).rejects.toThrow('OUTLOOK_ENABLE_CALENDAR_INVITE=true');
    expect(requests).toHaveLength(0);
  });

  it('declines with a comment and names the organiser as notified', async () => {
    on('INVITE');
    const { svc, requests } = service((r) => (r.method === 'GET' ? { ...MEETING, isOrganizer: false } : undefined));
    const result = await svc.respondToEvent({ eventId: 'EVT1', response: 'decline', comment: 'Clash' });
    expect(requests[1]).toMatchObject({ method: 'POST', path: '/me/events/EVT1/decline', body: { comment: 'Clash', sendResponse: true } });
    expect(result.notified).toEqual(['jdoe@example.com']);
  });

  it('refuses to respond to a meeting you organise', async () => {
    on('INVITE');
    const { svc } = service(() => MEETING);
    await expect(svc.respondToEvent({ eventId: 'EVT1', response: 'accept' })).rejects.toThrow('You organise this meeting');
  });
});

describe('recordAutomatically', () => {
  const JOIN = 'https://teams.example.com/l/meetup-join/abc';

  it('finds the online meeting by join URL and turns recording on', async () => {
    on('INVITE');
    const { svc, requests } = service((r) => {
      if (r.method === 'POST') return { id: 'EVT1', webLink: 'w', onlineMeeting: { joinUrl: JOIN } };
      if (r.method === 'GET') return { value: [{ id: 'OM1' }] };
      return { id: 'OM1' };
    });
    const result = await svc.createEvent({
      subject: 's', start: '2026-07-01T09:00Z', end: '2026-07-01T10:00Z', attendees: ['jdoe@example.com'], recordAutomatically: true,
    });
    expect(requests[1]).toMatchObject({ method: 'GET', path: '/me/onlineMeetings', query: { $filter: `JoinWebUrl eq '${JOIN}'` } });
    expect(requests[2]).toMatchObject({ method: 'PATCH', path: '/me/onlineMeetings/OM1', body: { recordAutomatically: true } });
    expect(Object.keys(requests[2].body)).toEqual(['recordAutomatically']);
    expect(result.recording).toBe('Recording will start automatically when the meeting starts.');
  });

  it('keeps the invitation result when the recording step fails, and says why', async () => {
    on('INVITE');
    const { svc } = service((r) => {
      if (r.method === 'POST') return { id: 'EVT1', webLink: 'w', onlineMeeting: { joinUrl: JOIN } };
      return graphError(403, 'Forbidden', 'denied');
    });
    const result = await svc.createEvent({
      subject: 's', start: '2026-07-01T09:00Z', end: '2026-07-01T10:00Z', attendees: ['jdoe@example.com'], recordAutomatically: true,
    });
    expect(result.notified).toEqual(['jdoe@example.com']);
    expect(result.recording).toContain('Recording was not set');
    expect(result.recording).toContain('OnlineMeetings.ReadWrite');
  });

  it('skips recording on a delegate calendar, with a message', async () => {
    on('INVITE', 'DELEGATE');
    const { svc, requests } = service(() => ({ id: 'EVT1', onlineMeeting: { joinUrl: JOIN } }));
    const result = await svc.createEvent({
      subject: 's', start: '2026-07-01T09:00Z', end: '2026-07-01T10:00Z', attendees: ['jdoe@example.com'],
      calendarOwner: 'jdoe@example.com', recordAutomatically: true,
    });
    expect(requests).toHaveLength(1);
    expect(result.recording).toContain('delegate calendar');
  });

  it('says so when the event is not a Teams meeting', async () => {
    on('WRITE');
    const { svc, requests } = service(() => ({ id: 'EVT1' }));
    const result = await svc.createEvent({ subject: 's', start: '2026-07-01T09:00Z', end: '2026-07-01T10:00Z', recordAutomatically: true });
    expect(requests).toHaveLength(1);
    expect(result.recording).toContain('not a Teams meeting');
  });
});
