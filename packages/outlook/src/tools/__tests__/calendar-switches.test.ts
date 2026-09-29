import { describe, it, expect, afterEach } from 'vitest';
import { registerAllTools } from '../index.js';
import { CalendarReadService } from '../../services/calendar-read-service.js';
import { recordingGraph } from '../../__tests__/graph-recorder.js';
import { CALENDAR_SWITCHES } from '../../permissions.js';

export function setupCalendar(respond: (r: any) => unknown = () => ({ value: [] })) {
  const graph = recordingGraph(respond);
  const provider = { getGraphClient: () => graph.client };
  const ctx: any = { auth: {}, calendar: new CalendarReadService(provider) };
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

  it('reads the own calendar with no switch', async () => {
    const { handlers, requests } = setupCalendar();
    const result = await handlers['calendar-list-events']({ start: '2026-07-01', end: '2026-07-02' });
    expect(result.isError).toBeUndefined();
    expect(requests[0].path).toBe('/me/calendarView');
  });
});
