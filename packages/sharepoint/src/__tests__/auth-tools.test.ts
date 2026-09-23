import { describe, it, expect, beforeEach, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  startDeviceCode: vi.fn(),
  getStatus: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@mcp-consultant-tools/m365-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-consultant-tools/m365-core')>();
  class FakeDelegatedGraphAuth {
    startDeviceCode = auth.startDeviceCode;
    getStatus = auth.getStatus;
    logout = auth.logout;
  }
  return { ...actual, DelegatedGraphAuth: FakeDelegatedGraphAuth };
});

import { SharePointService } from '../services/sharepoint-service.js';
import { registerAuthTools } from '../tools/auth-tools.js';
import type { ServiceContext } from '../types.js';

function register(mode: 'device-code' | 'client-credentials') {
  const spo = new SharePointService({
    sites: [],
    authMethod: 'entra-id',
    authMode: mode,
    tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    clientId: 'aaaaaaaa-bbbb-cccc-dddd-000000000000',
    clientSecret: mode === 'client-credentials' ? 'x' : undefined,
  });
  const handlers: Record<string, (args: any) => Promise<any>> = {};
  const server = {
    tool: (name: string, ...rest: any[]) => {
      handlers[name] = rest[rest.length - 1];
    },
  };
  registerAuthTools(server, { sharepoint: spo } as unknown as ServiceContext);
  return handlers;
}

const text = (result: any) => result.content[0].text as string;

describe('auth tools', () => {
  beforeEach(() => {
    auth.startDeviceCode.mockReset();
    auth.getStatus.mockReset();
    auth.logout.mockReset();
  });

  it('registers spo-authenticate, spo-auth-status and spo-logout', () => {
    expect(Object.keys(register('device-code')).sort()).toEqual(['spo-auth-status', 'spo-authenticate', 'spo-logout']);
  });

  it.each(['spo-authenticate', 'spo-auth-status', 'spo-logout'])(
    'app-only: %s reports that no sign-in is needed rather than failing',
    async (name) => {
      const result = await register('client-credentials')[name]({});
      expect(result.isError).toBeFalsy();
      expect(text(result)).toMatch(/no sign-in (is )?needed/i);
    }
  );

  it('device code: spo-authenticate returns the URL and code', async () => {
    auth.startDeviceCode.mockResolvedValue({
      state: 'pending',
      userCode: 'ABCD-1234',
      verificationUri: 'https://microsoft.com/devicelogin',
      expiresInSeconds: 900,
      message: 'Open the URL',
    });
    const result = await register('device-code')['spo-authenticate']({});
    expect(text(result)).toContain('ABCD-1234');
    expect(text(result)).toContain('https://microsoft.com/devicelogin');
  });

  it('device code: spo-auth-status reports read and write as available with Sites.ReadWrite.All', async () => {
    auth.getStatus.mockResolvedValue({
      state: 'authenticated',
      grantedScopes: ['User.Read', 'Sites.ReadWrite.All'],
      message: 'Signed in.',
    });
    const status = JSON.parse(text(await register('device-code')['spo-auth-status']({})));
    expect(status.mode).toBe('device-code');
    expect(status.grantedScopes).toEqual(['User.Read', 'Sites.ReadWrite.All']);
    expect(status.capabilities.read).toMatch(/^available/);
    expect(status.capabilities.writeAndDelete).toMatch(/^available/);
  });

  it('device code: spo-auth-status names the missing permissions when the token has none for SharePoint', async () => {
    auth.getStatus.mockResolvedValue({ state: 'authenticated', grantedScopes: ['User.Read'], message: 'Signed in.' });
    const status = JSON.parse(text(await register('device-code')['spo-auth-status']({})));
    expect(status.capabilities.read).toMatch(/^missing.*Sites\.Read\.All/);
    expect(status.capabilities.writeAndDelete).toMatch(/^missing.*Sites\.ReadWrite\.All/);
  });

  it('device code: read-only grant gives read but not write', async () => {
    auth.getStatus.mockResolvedValue({ state: 'authenticated', grantedScopes: ['Sites.Read.All'], message: 'ok' });
    const status = JSON.parse(text(await register('device-code')['spo-auth-status']({})));
    expect(status.capabilities.read).toMatch(/^available/);
    expect(status.capabilities.writeAndDelete).toMatch(/^missing/);
  });

  it('device code: spo-logout clears the sign-in', async () => {
    auth.logout.mockResolvedValue(undefined);
    const result = await register('device-code')['spo-logout']({});
    expect(auth.logout).toHaveBeenCalledOnce();
    expect(text(result)).toMatch(/signed out/i);
  });
});
