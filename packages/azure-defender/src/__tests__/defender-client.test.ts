import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestMock = vi.fn();

vi.mock('axios', () => {
  class AxiosError extends Error {
    response?: { status: number; data?: unknown; headers: Record<string, string> };
    constructor(message: string) {
      super(message);
      this.name = 'AxiosError';
    }
  }
  return {
    default: { create: () => ({ request: (...args: unknown[]) => requestMock(...args) }) },
    AxiosError,
  };
});

vi.mock('@azure/identity', () => ({
  ClientSecretCredential: class {
    async getToken() {
      return { token: 'fake-token', expiresOnTimestamp: Date.now() + 3_600_000 };
    }
  },
}));

const { DefenderClient } = await import('../defender-client.js');
const { AxiosError } = await import('axios');

const makeClient = () =>
  new DefenderClient({
    tenantId: 't',
    clientId: 'c',
    clientSecret: 's',
    subscriptionId: 'SUB',
    maxRetries: 0,
  });

const makeClientWithoutSubscription = () =>
  new DefenderClient({ tenantId: 't', clientId: 'c', clientSecret: 's', maxRetries: 0 });

beforeEach(() => requestMock.mockReset());

describe('DefenderClient.getSubscriptionId', () => {
  it('throws a configuration error when no subscription is set', () => {
    expect(() => makeClientWithoutSubscription().getSubscriptionId()).toThrow(
      /AZURE_SUBSCRIPTION_ID/
    );
  });

  it('returns the configured subscription id', () => {
    expect(makeClient().getSubscriptionId()).toBe('SUB');
  });
});

describe('DefenderClient.buildUrl', () => {
  it('always appends the api-version it was given', async () => {
    requestMock.mockResolvedValue({ data: { value: [] } });
    await makeClient().get('/some/path', '2025-05-04');
    expect(requestMock.mock.calls[0][0].url).toBe('/some/path?api-version=2025-05-04');
  });

  it('merges extra params with &', async () => {
    requestMock.mockResolvedValue({ data: {} });
    await makeClient().get('/p', '2020-01-01', { $expand: 'definition' });
    const url: string = requestMock.mock.calls[0][0].url;
    expect(url.startsWith('/p?')).toBe(true);
    expect(url).toContain('%24expand=definition');
    expect(url).toContain('api-version=2020-01-01');
  });
});

describe('DefenderClient.paginate', () => {
  it('follows nextLink and concatenates pages', async () => {
    requestMock
      .mockResolvedValueOnce({ data: { value: [1, 2], nextLink: 'https://arm/next' } })
      .mockResolvedValueOnce({ data: { value: [3] } });

    const result = await makeClient().paginate<number>('/p', '2020-01-01');

    expect(result.items).toEqual([1, 2, 3]);
    expect(result.truncated).toBe(false);
    expect(requestMock.mock.calls[1][0].url).toBe('https://arm/next');
  });

  it('tolerates a 200 with no `value` array', async () => {
    requestMock.mockResolvedValueOnce({ data: {} });
    const result = await makeClient().paginate<number>('/p', '2020-01-01');
    expect(result).toEqual({ items: [], truncated: false });
  });

  it('reports truncated=true and trims when more rows exist than maxResults', async () => {
    requestMock.mockResolvedValueOnce({ data: { value: [1, 2, 3, 4] } });

    const result = await makeClient().paginate<number>('/p', '2020-01-01', undefined, 2);

    expect(result.items).toEqual([1, 2]);
    expect(result.truncated).toBe(true);
  });

  it('reports truncated=false when the total exactly equals maxResults', async () => {
    // The extra row that would prove truncation never arrives, so this is a
    // complete result - not a coincidentally-full page.
    requestMock.mockResolvedValueOnce({ data: { value: [1, 2] } });

    const result = await makeClient().paginate<number>('/p', '2020-01-01', undefined, 2);

    expect(result.items).toEqual([1, 2]);
    expect(result.truncated).toBe(false);
  });

  it('stops fetching further pages once past maxResults', async () => {
    requestMock
      .mockResolvedValueOnce({ data: { value: [1, 2, 3], nextLink: 'https://arm/next' } })
      .mockResolvedValueOnce({ data: { value: [4] } });

    const result = await makeClient().paginate<number>('/p', '2020-01-01', undefined, 2);

    expect(result.items).toEqual([1, 2]);
    expect(result.truncated).toBe(true);
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});

describe('DefenderClient error normalisation', () => {
  it('surfaces the ARM error code and message', async () => {
    const error = new AxiosError('Request failed');
    (error as any).response = {
      status: 403,
      data: { error: { code: 'AuthorizationFailed', message: 'does not have authorization' } },
      headers: {},
    };
    requestMock.mockRejectedValueOnce(error);

    await expect(makeClient().get('/p', '2020-01-01')).rejects.toThrow(
      /AuthorizationFailed: does not have authorization/
    );
  });

  it('falls back to the axios message when there is no ARM error body', async () => {
    const error = new AxiosError('socket hang up');
    (error as any).response = { status: 500, data: undefined, headers: {} };
    requestMock.mockRejectedValueOnce(error);

    await expect(makeClient().get('/p', '2020-01-01')).rejects.toThrow(/Defender API error/);
  });
});
