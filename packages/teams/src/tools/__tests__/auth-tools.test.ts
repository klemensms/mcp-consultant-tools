/**
 * An agent read the hourly access-token time in auth-status as the sign-in
 * deadline and called logout to "renew", which deletes the refresh token and
 * forces a new device code. Status no longer shows a bare expiry, and logout
 * refuses without confirm: true.
 */
import { describe, it, expect, vi } from 'vitest';
import { registerAuthStatusTool, registerLogoutTool } from '../authenticate.js';

function setup(status: any = {}) {
  const teams = {
    logout: vi.fn().mockResolvedValue(undefined),
    getAuthStatus: vi.fn().mockResolvedValue(status),
  };
  const handlers: Record<string, (args?: any) => Promise<any>> = {};
  const server = { tool: (name: string, ...rest: any[]) => { handlers[name] = rest[rest.length - 1]; } };
  registerAuthStatusTool(server, { teams } as any);
  registerLogoutTool(server, { teams } as any);
  return { handlers, teams };
}

describe('logout', () => {
  it('refuses without confirm: true and signs nothing out', async () => {
    const { handlers, teams } = setup();
    for (const args of [undefined, {}, { confirm: false }]) {
      const result = await handlers['logout'](args);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/renews itself automatically/);
    }
    expect(teams.logout).not.toHaveBeenCalled();
  });

  it('logs out with confirm: true', async () => {
    const { handlers, teams } = setup();
    expect((await handlers['logout']({ confirm: true })).isError).toBeFalsy();
    expect(teams.logout).toHaveBeenCalledOnce();
  });
});

describe('auth-status', () => {
  it('says the sign-in renews automatically and shows no "Expires" line', async () => {
    const { handlers } = setup({
      status: 'authenticated',
      authMode: 'device-code',
      accessTokenExpiresAt: '2026-10-01T15:02:44.000Z',
      renewsAutomatically: true,
      message: 'Authenticated. The sign-in renews itself automatically.',
    });
    const text = (await handlers['auth-status']({})).content[0].text;
    expect(text).toContain('renews automatically, no action needed');
    expect(text).not.toMatch(/Expires/);
  });
});
