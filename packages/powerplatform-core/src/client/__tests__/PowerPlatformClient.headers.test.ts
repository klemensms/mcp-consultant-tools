import { describe, it, expect, vi, beforeEach } from 'vitest';

const axiosMock = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: axiosMock }));

import { PowerPlatformClient } from '../PowerPlatformClient.js';
import type { AuthProvider } from '../../auth/index.js';

const BASE = 'https://yourorg.crm.dynamics.com';

const auth: AuthProvider = {
  getAccessToken: async () => 'real-token',
  getAuthMode: () => 'service-principal',
} as unknown as AuthProvider;

function client(): PowerPlatformClient {
  return new PowerPlatformClient(
    { organizationUrl: BASE, clientId: 'x', tenantId: 'y' } as never,
    auth
  );
}

const hostile = {
  Authorization: 'Bearer attacker',
  Accept: 'text/plain',
  'OData-MaxVersion': '1.0',
  'OData-Version': '1.0',
  'Content-Type': 'text/plain',
  Prefer: 'odata.maxpagesize=10',
  'MSCRM.SuppressDuplicateDetection': 'false',
};

type Config = { headers: Record<string, string>; maxRedirects?: number; url: string };

describe('PowerPlatformClient request hardening', () => {
  beforeEach(() => {
    axiosMock.mockReset();
    axiosMock.mockResolvedValue({ data: {}, headers: {}, status: 204 });
  });

  const calls: Array<[string, (c: PowerPlatformClient) => Promise<unknown>]> = [
    ['makeRequest', c => c.makeRequest('api/data/v9.2/accounts', 'POST', { a: 1 }, hostile)],
    [
      'makeRequestWithResponse',
      c => c.makeRequestWithResponse('api/data/v9.2/accounts', 'POST', { a: 1 }, hostile),
    ],
    [
      'makeRequestNoContent',
      c => c.makeRequestNoContent('api/data/v9.2/accounts(1)', 'PATCH', { a: 1 }, hostile),
    ],
  ];

  for (const [name, call] of calls) {
    it(`${name} turns redirects off`, async () => {
      await call(client());
      const config = axiosMock.mock.calls[0][0] as Config;
      expect(config.maxRedirects).toBe(0);
    });

    it(`${name} keeps the fixed headers whatever the caller passes`, async () => {
      await call(client());
      const { headers } = axiosMock.mock.calls[0][0] as Config;
      expect(headers.Authorization).toBe('Bearer real-token');
      expect(headers.Accept).toBe('application/json');
      expect(headers['OData-MaxVersion']).toBe('4.0');
      expect(headers['OData-Version']).toBe('4.0');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it(`${name} still sends caller headers such as Prefer and MSCRM.*`, async () => {
      await call(client());
      const { headers } = axiosMock.mock.calls[0][0] as Config;
      expect(headers.Prefer).toBe('odata.maxpagesize=10');
      expect(headers['MSCRM.SuppressDuplicateDetection']).toBe('false');
    });
  }

  it('does not let a differently-cased header slip past the fixed one', async () => {
    await client().makeRequest('api/data/v9.2/accounts', 'GET', undefined, {
      authorization: 'Bearer attacker',
    });
    const { headers } = axiosMock.mock.calls[0][0] as Config;
    const auths = Object.entries(headers).filter(([k]) => k.toLowerCase() === 'authorization');
    expect(auths).toEqual([['Authorization', 'Bearer real-token']]);
  });

  it('logs the failed endpoint without its query string', async () => {
    axiosMock.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 400 } }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      client().makeRequest("api/data/v9.2/contacts?$filter=emailaddress1 eq 'jdoe@example.com'")
    ).rejects.toThrow();
    const logged = JSON.stringify(spy.mock.calls);
    spy.mockRestore();
    expect(logged).toContain('api/data/v9.2/contacts');
    expect(logged).not.toContain('jdoe@example.com');
  });
});
