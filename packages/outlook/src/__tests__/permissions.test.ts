import { describe, it, expect, afterEach } from 'vitest';
import { describeMailAccess, permissionHint } from '../permissions.js';

const SWITCHES = ['OUTLOOK_ENABLE_WRITE', 'OUTLOOK_ENABLE_SEND', 'OUTLOOK_ENABLE_DELETE'];

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

  it('reports each switch and its variable; read has no switch', () => {
    process.env.OUTLOOK_ENABLE_SEND = 'true';
    const access = describeMailAccess([]);
    expect(access.read.enabled).toBe(true);
    expect(access.read.switch).toBeUndefined();
    expect(access.write).toMatchObject({ switch: 'OUTLOOK_ENABLE_WRITE', enabled: false });
    expect(access.send).toMatchObject({ switch: 'OUTLOOK_ENABLE_SEND', enabled: true });
    expect(access.delete).toMatchObject({ switch: 'OUTLOOK_ENABLE_DELETE', enabled: false });
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
