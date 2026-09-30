/**
 * The two read switches, OUTLOOK_ENABLE_MAIL_READ and OUTLOOK_ENABLE_CALENDAR_READ,
 * are on while unset, so a configuration from before they existed keeps
 * reading. Any value but `true` turns the group off: every tool in it refuses,
 * naming its variable, before any Graph call. The auth tools have no switch.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { registerAllTools } from '../index.js';
import { MailReadService } from '../../services/mail-read-service.js';
import { MailWriteService } from '../../services/mail-write-service.js';
import { MailSendService } from '../../services/mail-send-service.js';
import { CalendarReadService } from '../../services/calendar-read-service.js';
import { CalendarWriteService } from '../../services/calendar-write-service.js';
import { recordingGraph } from '../../__tests__/graph-recorder.js';
import { describeCalendarAccess, describeMailAccess } from '../../permissions.js';

const VARS = ['OUTLOOK_ENABLE_MAIL_READ', 'OUTLOOK_ENABLE_CALENDAR_READ', 'OUTLOOK_ENABLE_CALENDAR_SHARED'];

const MAIL_READ_TOOLS: Record<string, object> = {
  'mail-list-folders': {},
  'mail-list-categories': {},
  'mail-list-messages': {},
  'mail-search-messages': { query: 'budget' },
  'mail-get-message': { id: 'M' },
  'mail-get-conversation': { conversationId: 'C' },
  'mail-download-attachment': { messageId: 'M', attachmentId: 'A' },
};
const CALENDAR_READ_TOOLS: Record<string, object> = {
  'calendar-list-calendars': {},
  'calendar-list-events': { start: '2026-07-01', end: '2026-07-02' },
  'calendar-get-event': { eventId: 'E' },
  'calendar-get-schedule': { people: ['jdoe@example.com'], start: '2026-07-01T09:00', end: '2026-07-01T17:00' },
  'calendar-find-meeting-times': { attendees: ['jdoe@example.com'], durationMinutes: 30, start: '2026-07-01T09:00', end: '2026-07-01T17:00' },
};

function setup() {
  const graph = recordingGraph(() => ({ value: [] }));
  const provider = { getGraphClient: () => graph.client };
  const ctx: any = {
    auth: {},
    mail: new MailReadService(provider, { downloadDir: '/tmp/unused' }),
    write: new MailWriteService(provider, { maxAttachmentMB: 25 }),
    send: new MailSendService(provider),
    calendar: new CalendarReadService(provider),
    calendarWrite: new CalendarWriteService(provider),
  };
  const handlers: Record<string, (args: any) => Promise<any>> = {};
  registerAllTools({ tool: (name: string, ...rest: any[]) => { handlers[name] = rest[rest.length - 1]; } }, ctx);
  return { handlers, requests: graph.requests };
}

async function expectRefused(tools: Record<string, object>, variable: string) {
  const { handlers, requests } = setup();
  for (const [name, args] of Object.entries(tools)) {
    expect(handlers[name], `${name} is registered`).toBeTypeOf('function');
    const result = await handlers[name](args);
    expect(result.isError, name).toBe(true);
    expect(result.content[0].text, name).toContain(`Set ${variable}=true, or remove the variable, to enable`);
  }
  expect(requests).toHaveLength(0);
}

afterEach(() => {
  for (const name of VARS) delete process.env[name];
});

describe('mail read switch', () => {
  it('reads while OUTLOOK_ENABLE_MAIL_READ is unset or true', async () => {
    for (const value of [undefined, '', 'true']) {
      if (value === undefined) delete process.env.OUTLOOK_ENABLE_MAIL_READ;
      else process.env.OUTLOOK_ENABLE_MAIL_READ = value;
      const { handlers, requests } = setup();
      const result = await handlers['mail-list-messages']({});
      expect(result.isError, String(value)).toBeFalsy();
      expect(requests).toHaveLength(1);
    }
  });

  it.each(['false', 'no', '0'])('refuses every mail read tool when set to %s', async (value) => {
    process.env.OUTLOOK_ENABLE_MAIL_READ = value;
    await expectRefused(MAIL_READ_TOOLS, 'OUTLOOK_ENABLE_MAIL_READ');
  });

  it('leaves the calendar reading when mail read is off', async () => {
    process.env.OUTLOOK_ENABLE_MAIL_READ = 'false';
    const { handlers } = setup();
    expect((await handlers['calendar-list-events']({ start: '2026-07-01', end: '2026-07-02' })).isError).toBeFalsy();
  });

  it('is reported by auth status', () => {
    expect(describeMailAccess([]).read).toMatchObject({ switch: 'OUTLOOK_ENABLE_MAIL_READ', enabled: true });
    process.env.OUTLOOK_ENABLE_MAIL_READ = 'false';
    expect(describeMailAccess([]).read.enabled).toBe(false);
  });
});

describe('calendar read switch', () => {
  it.each(['false', 'off'])('refuses every calendar read tool when set to %s', async (value) => {
    process.env.OUTLOOK_ENABLE_CALENDAR_READ = value;
    await expectRefused(CALENDAR_READ_TOOLS, 'OUTLOOK_ENABLE_CALENDAR_READ');
  });

  it('leaves mail reading when calendar read is off', async () => {
    process.env.OUTLOOK_ENABLE_CALENDAR_READ = 'false';
    const { handlers } = setup();
    expect((await handlers['mail-list-messages']({})).isError).toBeFalsy();
  });

  it('is reported by auth status, on while unset', () => {
    expect(describeCalendarAccess([])['calendar-read']).toMatchObject({ switch: 'OUTLOOK_ENABLE_CALENDAR_READ', enabled: true });
    process.env.OUTLOOK_ENABLE_CALENDAR_READ = 'false';
    expect(describeCalendarAccess([])['calendar-read'].enabled).toBe(false);
  });
});

describe('auth tools', () => {
  it('stay available with both read switches off', () => {
    process.env.OUTLOOK_ENABLE_MAIL_READ = 'false';
    process.env.OUTLOOK_ENABLE_CALENDAR_READ = 'false';
    const { handlers } = setup();
    for (const name of ['mail-authenticate', 'mail-auth-status', 'mail-logout']) {
      expect(handlers[name], name).toBeTypeOf('function');
    }
  });
});
