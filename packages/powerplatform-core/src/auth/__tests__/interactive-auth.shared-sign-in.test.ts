/**
 * Parallel tool calls that all need a browser sign-in share one: one callback
 * server, one browser tab. Each waiting call then repeats the silent lookup
 * for its OWN resource, so a Flow call never receives a Dataverse token.
 * MSAL and the browser launch are faked; the callback server is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'node:http';

const ORG = 'https://yourorg.crm.dynamics.com';
const FLOW = 'https://service.flow.microsoft.com';

const msal = vi.hoisted(() => ({
  accounts: [] as Array<Record<string, unknown>>,
  authCodeUrlRequests: [] as Array<Record<string, any>>,
  silentScopes: [] as string[],
  getAuthCodeUrl: null as unknown as (r: Record<string, any>) => Promise<string>,
  acquireTokenByCode: null as unknown as (r: Record<string, any>) => Promise<unknown>,
}));
const openMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@azure/msal-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@azure/msal-node')>();
  class FakePublicClientApplication {
    getTokenCache() {
      return { getAllAccounts: async () => msal.accounts };
    }
    async acquireTokenSilent(request: { scopes: string[] }) {
      msal.silentScopes.push(request.scopes[0]);
      return { accessToken: `silent:${request.scopes[0]}` };
    }
    getAuthCodeUrl(request: Record<string, any>) {
      return msal.getAuthCodeUrl(request);
    }
    acquireTokenByCode(request: Record<string, any>) {
      return msal.acquireTokenByCode(request);
    }
  }
  return { ...actual, PublicClientApplication: FakePublicClientApplication };
});
vi.mock('open', () => ({ default: openMock }));
vi.mock('../token-cache.js', () => ({
  TokenCache: class {
    createPlugin() {
      return { beforeCacheAccess: async () => {}, afterCacheAccess: async () => {} };
    }
    clear() {}
  },
}));

const { InteractiveAuth } = await import('../interactive-auth.js');

function newAuth() {
  return new InteractiveAuth({
    organizationUrl: ORG,
    clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  });
}

function hit(port: number, query: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: `/?${query}` }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      })
      .on('error', reject);
  });
}

/** Resolves with the authorization request once the browser would have opened. */
let nextAuthRequest: Promise<Record<string, any>>;

beforeEach(() => {
  msal.accounts = [];
  msal.authCodeUrlRequests = [];
  msal.silentScopes = [];
  openMock.mockClear();
  let seen!: (r: Record<string, any>) => void;
  nextAuthRequest = new Promise((resolve) => { seen = resolve; });
  msal.getAuthCodeUrl = async (request) => {
    msal.authCodeUrlRequests.push(request);
    seen(request);
    return 'https://login.microsoftonline.com/authorize';
  };
  msal.acquireTokenByCode = async (request) => {
    // A successful redemption puts the account in the cache, as MSAL does.
    msal.accounts = [{ name: 'Jane Doe' }];
    return { accessToken: `interactive:${request.scopes[0]}`, account: { name: 'Jane Doe' } };
  };
});

async function complete(): Promise<void> {
  const request = await nextAuthRequest;
  const port = Number(new URL(request.redirectUri).port);
  await hit(port, `code=CODE&state=${encodeURIComponent(request.state)}`);
}

describe('shared browser sign-in', () => {
  it('opens one browser tab for parallel calls and gives each call a token for its own resource', async () => {
    const auth = newAuth();
    const calls = [auth.getAccessToken(ORG), auth.getAccessToken(FLOW), auth.getAccessToken(ORG)];
    await complete();
    const [org1, flow, org2] = await Promise.all(calls);

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(msal.authCodeUrlRequests).toHaveLength(1);
    expect(org1).toBe(`interactive:${ORG}/.default`);
    expect(flow).toBe(`silent:${FLOW}/.default`);
    expect(org2).toBe(`silent:${ORG}/.default`);
    expect(msal.silentScopes).toContain(`${FLOW}/.default`);
  });

  it('never hands the Flow caller the Dataverse token when the Flow call started the sign-in', async () => {
    const auth = newAuth();
    const calls = [auth.getAccessToken(FLOW), auth.getAccessToken(ORG)];
    await complete();
    const [flow, org] = await Promise.all(calls);
    expect(flow).toBe(`interactive:${FLOW}/.default`);
    expect(org).toBe(`silent:${ORG}/.default`);
  });

  it('fails waiting calls with the sign-in error instead of opening another tab', async () => {
    msal.acquireTokenByCode = async () => {
      throw new Error('redemption refused');
    };
    const auth = newAuth();
    const calls = [auth.getAccessToken(ORG), auth.getAccessToken(FLOW)];
    calls.forEach((c) => c.catch(() => {}));
    await complete();
    await expect(calls[0]).rejects.toThrow('redemption refused');
    await expect(calls[1]).rejects.toThrow('redemption refused');
    expect(openMock).toHaveBeenCalledTimes(1);
  });

  it('clears the shared sign-in once it ends, so a later sign-in starts afresh', async () => {
    const auth = newAuth();
    const first = auth.getAccessToken(ORG);
    await complete();
    await first;

    msal.accounts = [];
    let seen!: (r: Record<string, any>) => void;
    nextAuthRequest = new Promise((resolve) => { seen = resolve; });
    msal.getAuthCodeUrl = async (request) => {
      msal.authCodeUrlRequests.push(request);
      seen(request);
      return 'https://login.microsoftonline.com/authorize';
    };
    const second = auth.getAccessToken(ORG);
    await complete();
    await expect(second).resolves.toBe(`interactive:${ORG}/.default`);
    expect(openMock).toHaveBeenCalledTimes(2);
  });
});
