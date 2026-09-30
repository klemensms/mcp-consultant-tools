import { describe, it, expect, afterEach } from 'vitest';
import { registerAllTools } from '../index.js';
import { CalendarReadService } from '../../services/calendar-read-service.js';
import { CalendarWriteService } from '../../services/calendar-write-service.js';
import { recordingGraph } from '../../__tests__/graph-recorder.js';
import { CALENDAR_SWITCHES } from '../../permissions.js';

export function setupCalendar(respond: (r: any) => unknown = () => ({ value: [] })) {
  const graph = recordingGraph(respond);
  const provider = { getGraphClient: () => graph.client };
  const ctx: any = { auth: {}, calendar: new CalendarReadService(provider), calendarWrite: new CalendarWriteService(provider) };
  const handlers: Record<string, (args: any) => Promise<any>> = {};
  registerAllTools({ tool: (name: string, ...rest: any[]) => { handlers[name] = rest[rest.length - 1]; } }, ctx);
  return { handlers, requests: graph.requests, provider, ctx };
}

afterEach(() => { for (const name of CALENDAR_SWITCHES) delete process.env[name]; });

describe('calendar read tools', () => {
  it('registers all five', () => {
    const { handlers } = setupCalendar();
    for (const name of ['calendar-list-calendars', 'calendar-list-events', 'calendar-get-event', 'calendar-get-schedule', 'calendar-find-meeting-times']) {
      expect(handlers[name], name).toBeTypeOf('function');
    }
  });

  it("refuses a colleague's calendar naming OUTLOOK_ENABLE_CALENDAR_SHARED, before any request", async () => {
    const { handlers, requests } = setupCalendar();
    for (const [name, args] of [
      ['calendar-list-events', { start: '2026-07-01', end: '2026-07-02', user: 'jdoe@example.com' }],
      ['calendar-get-event', { eventId: 'EVT1', user: 'jdoe@example.com' }],
    ] as const) {
      const result = await handlers[name](args);
      expect(result.isError, name).toBe(true);
      expect(result.content[0].text).toContain('Set OUTLOOK_ENABLE_CALENDAR_SHARED=true to enable');
    }
    expect(requests).toHaveLength(0);
  });

  it('reads the own calendar while OUTLOOK_ENABLE_CALENDAR_READ is unset', async () => {
    const { handlers, requests } = setupCalendar();
    const result = await handlers['calendar-list-events']({ start: '2026-07-01', end: '2026-07-02' });
    expect(result.isError).toBeUndefined();
    expect(requests[0].path).toBe('/me/calendarView');
  });
});

const WRITE_TOOLS: Record<string, object> = {
  'calendar-create-event': { subject: 's', start: '2026-07-01T09:00Z', end: '2026-07-01T10:00Z' },
  'calendar-update-event': { eventId: 'EVT1', subject: 'x' },
  'calendar-cancel-event': { eventId: 'EVT1' },
};

describe('calendar write tools, switches off', () => {
  it('registers all four', () => {
    const { handlers } = setupCalendar();
    for (const name of ['calendar-create-event', 'calendar-update-event', 'calendar-cancel-event', 'calendar-respond-to-event']) {
      expect(handlers[name], name).toBeTypeOf('function');
    }
  });

  it('refuses every change naming the write switch, before any request', async () => {
    const { handlers, requests } = setupCalendar();
    for (const [name, args] of Object.entries(WRITE_TOOLS)) {
      const result = await handlers[name](args);
      expect(result.isError, name).toBe(true);
      expect(result.content[0].text, name).toContain('OUTLOOK_ENABLE_CALENDAR_WRITE');
    }
    expect(requests).toHaveLength(0);
  });

  it('refuses a response naming the invite switch, before any request', async () => {
    const { handlers, requests } = setupCalendar();
    const result = await handlers['calendar-respond-to-event']({ eventId: 'EVT1', response: 'accept' });
    expect(result.content[0].text).toContain('Set OUTLOOK_ENABLE_CALENDAR_INVITE=true to enable');
    expect(requests).toHaveLength(0);
  });

  it('refuses any delegate change naming the delegate switch, before any request', async () => {
    process.env.OUTLOOK_ENABLE_CALENDAR_WRITE = 'true';
    process.env.OUTLOOK_ENABLE_CALENDAR_INVITE = 'true';
    const { handlers, requests } = setupCalendar();
    for (const [name, args] of Object.entries(WRITE_TOOLS)) {
      const result = await handlers[name]({ ...args, calendarOwner: 'jdoe@example.com' });
      expect(result.content[0].text, name).toContain('Set OUTLOOK_ENABLE_CALENDAR_DELEGATE=true to enable');
    }
    expect(requests).toHaveLength(0);
  });

  it('does not let the mail switches open the calendar', async () => {
    for (const name of ['OUTLOOK_ENABLE_WRITE', 'OUTLOOK_ENABLE_DRAFTS', 'OUTLOOK_ENABLE_SEND', 'OUTLOOK_ENABLE_DELETE']) process.env[name] = 'true';
    const { handlers, requests } = setupCalendar();
    const result = await handlers['calendar-create-event'](WRITE_TOOLS['calendar-create-event']);
    expect(result.isError).toBe(true);
    expect(requests).toHaveLength(0);
    for (const name of ['OUTLOOK_ENABLE_WRITE', 'OUTLOOK_ENABLE_DRAFTS', 'OUTLOOK_ENABLE_SEND', 'OUTLOOK_ENABLE_DELETE']) delete process.env[name];
  });
});
