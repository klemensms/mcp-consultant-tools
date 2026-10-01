/**
 * mail-logout deletes the cached refresh token, so a new device code is the only
 * way back. Agents have called it to "renew" an hourly access token; it now
 * refuses without confirm: true.
 */
import { describe, it, expect, vi } from 'vitest';
import { registerAuthTools } from '../auth-tools.js';

function setup() {
  const auth = { logout: vi.fn().mockResolvedValue(undefined) };
  const handlers: Record<string, (args?: any) => Promise<any>> = {};
  registerAuthTools({ tool: (name: string, ...rest: any[]) => { handlers[name] = rest[rest.length - 1]; } }, { auth } as any);
  return { handlers, auth };
}

describe('mail-logout', () => {
  it('refuses without confirm: true and signs nothing out', async () => {
    const { handlers, auth } = setup();
    for (const args of [undefined, {}, { confirm: false }]) {
      const result = await handlers['mail-logout'](args);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/renews itself automatically/);
    }
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('signs out with confirm: true', async () => {
    const { handlers, auth } = setup();
    const result = await handlers['mail-logout']({ confirm: true });
    expect(result.isError).toBeFalsy();
    expect(auth.logout).toHaveBeenCalledOnce();
  });
});
