import { describe, it, expect, afterEach } from 'vitest';
import {
  CALENDAR_SWITCHES, describeCalendarAccess, describeMailAccess, draftsEnabled, permissionHint, requireCalendarSwitch,
} from '../permissions.js';

const SWITCHES = ['OUTLOOK_ENABLE_WRITE', 'OUTLOOK_ENABLE_DRAFTS', 'OUTLOOK_ENABLE_SEND', 'OUTLOOK_ENABLE_DELETE', 'OUTLOOK_ENABLE_CATEGORIES'];

afterEach(() => {
  for (const name of SWITCHES) delete process.env[name];
});

describe('describeMailAccess', () => {
  it('reports every group missing when the token carries no mail permission', () => {
    const access = describeMailAccess(['Sites.ReadWrite.All', 'User.Read']);
    expect(access.read.granted).toBe(false);
    expect(access.write.granted).toBe(false);
    expect(access.send.granted).toBe(false);
    expect(access.delete.granted).toBe(false);
    expect(access.read.needs).toEqual(['Mail.Read', 'Mail.ReadWrite']);
  });

  it('treats Mail.Read as covering read only', () => {
    const access = describeMailAccess(['Mail.Read']);
    expect(access.read.granted).toBe(true);
    expect(access.write.granted).toBe(false);
    expect(access.delete.granted).toBe(false);
  });

  it('treats Mail.ReadWrite as covering read, write and delete, and Mail.Send as send', () => {
    const access = describeMailAccess(['Mail.ReadWrite', 'Mail.Send']);
    expect(access.read.granted).toBe(true);
    expect(access.write.granted).toBe(true);
    expect(access.delete.granted).toBe(true);
    expect(access.send.granted).toBe(true);
  });

  it('matches permission names without regard to case', () => {
    expect(describeMailAccess(['mail.readwrite']).write.granted).toBe(true);
  });

  it('reports each switch and its variable; read is on while its switch is unset', () => {
    process.env.OUTLOOK_ENABLE_SEND = 'true';
    const access = describeMailAccess([]);
    expect(access.read.enabled).toBe(true);
    expect(access.read.switch).toBe('OUTLOOK_ENABLE_MAIL_READ');
    expect(access.write).toMatchObject({ switch: 'OUTLOOK_ENABLE_WRITE', enabled: false });
    expect(access.send).toMatchObject({ switch: 'OUTLOOK_ENABLE_SEND', enabled: true });
    expect(access.delete).toMatchObject({ switch: 'OUTLOOK_ENABLE_DELETE', enabled: false });
    expect(access.categories).toMatchObject({ switch: 'OUTLOOK_ENABLE_CATEGORIES', enabled: false, needs: ['Mail.ReadWrite'] });
  });
});

describe('drafts switch', () => {
  it('follows OUTLOOK_ENABLE_WRITE while OUTLOOK_ENABLE_DRAFTS is unset', () => {
    expect(draftsEnabled()).toBe(false);
    process.env.OUTLOOK_ENABLE_WRITE = 'true';
    expect(draftsEnabled()).toBe(true);
    expect(describeMailAccess([]).drafts).toMatchObject({ switch: 'OUTLOOK_ENABLE_DRAFTS', enabled: true, followsWrite: true });
  });

  it('uses its own value once set, whatever write says', () => {
    process.env.OUTLOOK_ENABLE_WRITE = 'true';
    process.env.OUTLOOK_ENABLE_DRAFTS = 'false';
    expect(draftsEnabled()).toBe(false);
    delete process.env.OUTLOOK_ENABLE_WRITE;
    process.env.OUTLOOK_ENABLE_DRAFTS = 'true';
    expect(draftsEnabled()).toBe(true);
    expect(describeMailAccess([]).drafts).toMatchObject({ enabled: true, followsWrite: false });
    expect(describeMailAccess([]).write.enabled).toBe(false);
  });

  it('needs Mail.ReadWrite, and reports whether a SharePoint link can be attached as a file', () => {
    const without = describeMailAccess(['Mail.ReadWrite']).drafts;
    expect(without.granted).toBe(true);
    expect(without.attachFromLink).toMatchObject({ granted: false });
    expect(without.attachFromLink.needs).toContain('Files.Read.All');
    expect(describeMailAccess(['Mail.ReadWrite', 'files.read.all']).drafts.attachFromLink.granted).toBe(true);
  });
});

describe('permissionHint', () => {
  it('turns a 403 into the missing-permission message', () => {
    const error = permissionHint(Object.assign(new Error('Access is denied.'), { statusCode: 403 }), 'read');
    expect(error.message).toMatch(/Mail\.Read or Mail\.ReadWrite/);
    expect(error.message).toMatch(/administrator/i);
  });

  it('leaves any other error as it was', () => {
    const original = Object.assign(new Error('Not found'), { statusCode: 404 });
    expect(permissionHint(original, 'read')).toBe(original);
  });
});

describe('describeCalendarAccess', () => {
  afterEach(() => { for (const name of CALENDAR_SWITCHES) delete process.env[name]; });

  it('reports every calendar group missing without a calendar permission', () => {
    const access = describeCalendarAccess(['Mail.ReadWrite']);
    for (const group of Object.values(access)) expect(group.granted).toBe(false);
  });

  it('treats Calendars.ReadWrite as own calendar and Calendars.ReadWrite.Shared as shared and delegate', () => {
    const access = describeCalendarAccess(['Calendars.ReadWrite', 'Calendars.ReadWrite.Shared']);
    expect(access['calendar-read'].granted).toBe(true);
    expect(access['calendar-write'].granted).toBe(true);
    expect(access['calendar-invite'].granted).toBe(true);
    expect(access['calendar-shared'].granted).toBe(true);
    expect(access['calendar-delegate'].granted).toBe(true);
    expect(access['calendar-recording'].granted).toBe(false);
  });

  it('names each switch and reports the write ones off by default; read is on while unset and recording has none', () => {
    const access = describeCalendarAccess([]);
    expect(access['calendar-read']).toMatchObject({ switch: 'OUTLOOK_ENABLE_CALENDAR_READ', enabled: true });
    expect(access['calendar-recording'].switch).toBeUndefined();
    expect(access['calendar-shared']).toMatchObject({ switch: 'OUTLOOK_ENABLE_CALENDAR_SHARED', enabled: false });
    expect(access['calendar-write']).toMatchObject({ switch: 'OUTLOOK_ENABLE_CALENDAR_WRITE', enabled: false });
    expect(access['calendar-invite']).toMatchObject({ switch: 'OUTLOOK_ENABLE_CALENDAR_INVITE', enabled: false });
    expect(access['calendar-delegate']).toMatchObject({ switch: 'OUTLOOK_ENABLE_CALENDAR_DELEGATE', enabled: false });
    process.env.OUTLOOK_ENABLE_CALENDAR_INVITE = 'true';
    expect(describeCalendarAccess([])['calendar-invite'].enabled).toBe(true);
  });
});

describe('requireCalendarSwitch', () => {
  afterEach(() => { for (const name of CALENDAR_SWITCHES) delete process.env[name]; });

  it('throws naming the variable while off, and passes when exactly "true"', () => {
    expect(() => requireCalendarSwitch('calendar-invite')).toThrow('Set OUTLOOK_ENABLE_CALENDAR_INVITE=true to enable');
    process.env.OUTLOOK_ENABLE_CALENDAR_INVITE = '1';
    expect(() => requireCalendarSwitch('calendar-invite')).toThrow();
    process.env.OUTLOOK_ENABLE_CALENDAR_INVITE = 'true';
    expect(() => requireCalendarSwitch('calendar-invite')).not.toThrow();
  });

  it('never throws for groups without a switch', () => {
    expect(() => requireCalendarSwitch('calendar-read')).not.toThrow();
    expect(() => requireCalendarSwitch('calendar-recording')).not.toThrow();
  });
});

describe('calendar permissionHint', () => {
  it('names the calendar permission on a 403', () => {
    const hint = permissionHint({ statusCode: 403 }, 'calendar-shared');
    expect(hint.message).toContain('Calendars.Read.Shared or Calendars.ReadWrite.Shared');
    expect(permissionHint({ statusCode: 403 }, 'calendar-recording').message).toContain('OnlineMeetings.ReadWrite');
  });
});
