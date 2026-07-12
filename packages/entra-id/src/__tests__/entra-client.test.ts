import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
/** Every `.api()` call records the path it was given and the chained query options. */
const builders: Array<{ path: string; select?: string[]; top?: number }> = [];

const apiMock = vi.fn((path: string) => {
  const record: { path: string; select?: string[]; top?: number } = { path };
  builders.push(record);

  const builder = {
    select(value: string[]) {
      record.select = value;
      return builder;
    },
    top(value: number) {
      record.top = value;
      return builder;
    },
    get: () => getMock(path),
  };
  return builder;
});

vi.mock('@microsoft/microsoft-graph-client', () => ({
  Client: { initWithMiddleware: () => ({ api: apiMock }) },
}));

vi.mock('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js', () => ({
  TokenCredentialAuthenticationProvider: class {},
}));

vi.mock('@azure/identity', () => ({
  ClientSecretCredential: class {},
}));

const { EntraIdClient, statusCodeOf } = await import('../entra-client.js');

const CONFIG = { tenantId: 't', clientId: 'c', clientSecret: 's' };
const makeClient = () => new EntraIdClient(CONFIG);

beforeEach(() => {
  getMock.mockReset();
  apiMock.mockClear();
  builders.length = 0;
});

describe('EntraIdClient construction', () => {
  it.each(['tenantId', 'clientId', 'clientSecret'] as const)('throws when %s is missing', (key) => {
    expect(() => new EntraIdClient({ ...CONFIG, [key]: '' })).toThrow(/requires tenantId/);
  });
});

describe('EntraIdClient.paginate', () => {
  it('requests the maximum page size and passes the select through', async () => {
    getMock.mockResolvedValueOnce({ value: [] });

    await makeClient().paginate('/applications', ['id', 'passwordCredentials']);

    expect(builders[0]).toEqual({
      path: '/applications',
      select: ['id', 'passwordCredentials'],
      top: 999,
    });
  });

  it('follows @odata.nextLink and concatenates pages', async () => {
    getMock
      .mockResolvedValueOnce({ value: [1, 2], '@odata.nextLink': 'https://graph/next' })
      .mockResolvedValueOnce({ value: [3] });

    const result = await makeClient().paginate<number>('/applications', ['id']);

    expect(result).toEqual({ items: [1, 2, 3], truncated: false });
    expect(apiMock).toHaveBeenNthCalledWith(2, 'https://graph/next');
  });

  it('uses the nextLink URL verbatim, adding no $select and no $top', async () => {
    // Graph bakes the original query into nextLink; mutating it is explicitly unsupported.
    getMock
      .mockResolvedValueOnce({ value: [1], '@odata.nextLink': 'https://graph/next' })
      .mockResolvedValueOnce({ value: [2] });

    await makeClient().paginate<number>('/applications', ['id']);

    expect(builders[1]).toEqual({ path: 'https://graph/next' });
  });

  it('tolerates a 200 with no value array', async () => {
    getMock.mockResolvedValueOnce({});
    expect(await makeClient().paginate('/applications', ['id'])).toEqual({
      items: [],
      truncated: false,
    });
  });

  it('reports truncated=true and trims when more rows exist than maxResults', async () => {
    getMock.mockResolvedValueOnce({ value: [1, 2, 3, 4] });

    expect(await makeClient().paginate<number>('/applications', ['id'], 2)).toEqual({
      items: [1, 2],
      truncated: true,
    });
  });

  it('reports truncated=false when the total exactly equals maxResults', async () => {
    // The extra row that would prove truncation never arrives, so this is complete.
    getMock.mockResolvedValueOnce({ value: [1, 2] });

    expect(await makeClient().paginate<number>('/applications', ['id'], 2)).toEqual({
      items: [1, 2],
      truncated: false,
    });
  });

  it('stops fetching further pages once past maxResults', async () => {
    getMock
      .mockResolvedValueOnce({ value: [1, 2, 3], '@odata.nextLink': 'https://graph/next' })
      .mockResolvedValueOnce({ value: [4] });

    const result = await makeClient().paginate<number>('/applications', ['id'], 2);

    expect(result).toEqual({ items: [1, 2], truncated: true });
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});

describe('EntraIdClient.getServicePrincipalByAppId', () => {
  const APP_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('addresses the service principal by its appId alternate key', async () => {
    getMock.mockResolvedValueOnce({ appId: APP_ID, displayName: 'Microsoft Graph' });

    const sp = await makeClient().getServicePrincipalByAppId(APP_ID);

    expect(builders[0].path).toBe(`/servicePrincipals(appId='${APP_ID}')`);
    expect(sp?.displayName).toBe('Microsoft Graph');
  });

  it('caches the result, including a miss, so a repeat costs no request', async () => {
    getMock.mockResolvedValueOnce({ appId: APP_ID });
    const client = makeClient();

    await client.getServicePrincipalByAppId(APP_ID);
    await client.getServicePrincipalByAppId(APP_ID);

    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('returns null rather than throwing when the service principal is unreadable', async () => {
    getMock.mockRejectedValueOnce({ statusCode: 404 });
    expect(await makeClient().getServicePrincipalByAppId(APP_ID)).toBeNull();
  });

  it('never puts a non-GUID resourceAppId into a URL', async () => {
    expect(await makeClient().getServicePrincipalByAppId("x') or true--")).toBeNull();
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe('EntraIdClient.enhanceError', () => {
  const client = makeClient();

  it('names the missing grant on 403', () => {
    const error = client.enhanceError({ statusCode: 403, message: 'Insufficient privileges' }, 'listing');
    expect(error.message).toMatch(/Application\.Read\.All/);
  });

  it('points at the credential env vars on 401', () => {
    const error = client.enhanceError({ statusCode: 401, message: 'bad token' }, 'listing');
    expect(error.message).toMatch(/ENTRA_ID_CLIENT_SECRET/);
  });

  it('describes throttling on 429', () => {
    expect(client.enhanceError({ statusCode: 429, message: 'too many' }, 'listing').message).toMatch(
      /Throttled/
    );
  });

  it('falls back to the raw message when there is no status code', () => {
    expect(client.enhanceError(new Error('socket hang up'), 'listing').message).toMatch(
      /Failed while listing: socket hang up/
    );
  });
});

describe('statusCodeOf', () => {
  it('reads a Graph error status code', () => {
    expect(statusCodeOf({ statusCode: 404 })).toBe(404);
  });

  it.each([undefined, null, new Error('x')])('returns undefined for %o', (value) => {
    expect(statusCodeOf(value)).toBeUndefined();
  });
});
