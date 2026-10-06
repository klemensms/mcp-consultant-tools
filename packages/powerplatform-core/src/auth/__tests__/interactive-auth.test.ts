/**
 * The browser sign-in's localhost callback: PKCE (S256) on the authorization
 * request and the code redemption, a per-sign-in `state` that the callback
 * checks before redeeming anything, and a callback server bound to 127.0.0.1.
 * MSAL and the browser launch are faked; the callback server is real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import http from 'node:http';

const msal = vi.hoisted(() => ({
  getAuthCodeUrl: vi.fn(),
  acquireTokenByCode: vi.fn(),
}));

vi.mock('@azure/msal-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@azure/msal-node')>();
  class FakePublicClientApplication {
    getTokenCache() {
      return { getAllAccounts: async () => [] };
    }
    getAuthCodeUrl = msal.getAuthCodeUrl;
    acquireTokenByCode = msal.acquireTokenByCode;
  }
  return { ...actual, PublicClientApplication: FakePublicClientApplication };
});

vi.mock('open', () => ({ default: vi.fn(async () => undefined) }));

vi.mock('../token-cache.js', () => ({
  TokenCache: class {
    createPlugin() {
      return { beforeCacheAccess: async () => {}, afterCacheAccess: async () => {} };
    }
    clear() {}
  },
}));

const { InteractiveAuth, CALLBACK_HOST } = await import('../interactive-auth.js');

interface Started {
  request: any;
  port: number;
  server: http.Server;
  signIn: Promise<string>;
}

/** Start a sign-in and wait until the authorization URL has been requested. */
async function startSignIn(): Promise<Started> {
  const servers: http.Server[] = [];
  const realCreate = http.createServer;
  const spy = vi.spyOn(http, 'createServer').mockImplementation(((...args: any[]) => {
    const server = (realCreate as any)(...args);
    servers.push(server);
    return server;
  }) as any);

  let requested!: (value: any) => void;
  const requestSeen = new Promise<any>((resolve) => { requested = resolve; });
  msal.getAuthCodeUrl.mockImplementation(async (request: any) => {
    requested(request);
    return 'https://login.microsoftonline.com/authorize';
  });

  const auth = new InteractiveAuth({ organizationUrl: 'https://yourorg.crm.dynamics.com', clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
  const signIn = auth.getAccessToken('https://yourorg.crm.dynamics.com');
  signIn.catch(() => {});
  const request = await requestSeen;
  spy.mockRestore();
  const port = Number(new URL(request.redirectUri).port);
  const server = servers[servers.length - 1];
  return { request, port, server, signIn };
}

function callback(port: number, query: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: `/?${query}` }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    }).on('error', reject);
  });
}

let started: Started | null = null;

beforeEach(() => {
  msal.getAuthCodeUrl.mockReset();
  msal.acquireTokenByCode.mockReset();
  msal.acquireTokenByCode.mockResolvedValue({ accessToken: 'TOKEN', account: { name: 'Jane Doe' } });
});

afterEach(() => {
  started?.server.close();
  started = null;
});

describe('PKCE', () => {
  it('sends an S256 code challenge, and redeems the code with the verifier that produced it', async () => {
    started = await startSignIn();
    const { request, port, signIn } = started;
    expect(request.codeChallengeMethod).toBe('S256');
    expect(request.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await callback(port, `code=CODE&state=${encodeURIComponent(request.state)}`);
    await expect(signIn).resolves.toBe('TOKEN');

    const redemption = msal.acquireTokenByCode.mock.calls[0][0];
    expect(redemption.code).toBe('CODE');
    const expected = crypto.createHash('sha256').update(redemption.codeVerifier).digest('base64url');
    expect(expected).toBe(request.codeChallenge);
  });

  it('uses a fresh verifier and state for every sign-in', async () => {
    started = await startSignIn();
    const first = started.request;
    started.server.close();
    started = await startSignIn();
    expect(started.request.codeChallenge).not.toBe(first.codeChallenge);
    expect(started.request.state).not.toBe(first.state);
  });
});

describe('state', () => {
  it('sends a random state and passes it to the redemption', async () => {
    started = await startSignIn();
    const { request, port, signIn } = started;
    expect(request.state).toEqual(expect.any(String));
    expect(request.state.length).toBeGreaterThanOrEqual(32);
    await callback(port, `code=CODE&state=${encodeURIComponent(request.state)}`);
    await signIn;
    expect(msal.acquireTokenByCode.mock.calls[0][0].state).toBe(request.state);
  });

  it.each([
    ['a wrong state', 'code=INJECTED&state=not-the-state'],
    ['no state', 'code=INJECTED'],
    ['an error with a wrong state', 'error=access_denied&error_description=x&state=not-the-state'],
  ])('rejects a callback with %s, redeems nothing and keeps waiting', async (_label, query) => {
    started = await startSignIn();
    const { request, port, signIn } = started;
    const response = await callback(port, query);
    expect(response.status).toBe(400);
    expect(response.body).toContain('invalid_state');
    expect(msal.acquireTokenByCode).not.toHaveBeenCalled();

    // The genuine response still completes the sign-in afterwards.
    await callback(port, `code=CODE&state=${encodeURIComponent(request.state)}`);
    await expect(signIn).resolves.toBe('TOKEN');
    expect(msal.acquireTokenByCode).toHaveBeenCalledOnce();
    expect(msal.acquireTokenByCode.mock.calls[0][0].code).toBe('CODE');
  });

  it('still reports a genuine sign-in error that carries the right state', async () => {
    started = await startSignIn();
    const { request, port, signIn } = started;
    const response = await callback(port, `error=access_denied&error_description=denied&state=${encodeURIComponent(request.state)}`);
    expect(response.status).toBe(400);
    await expect(signIn).rejects.toThrow(/access_denied/);
  });
});

describe('callback binding', () => {
  it('listens on 127.0.0.1 only, never on every interface', async () => {
    expect(CALLBACK_HOST).toBe('127.0.0.1');
    started = await startSignIn();
    const address = started.server.address();
    expect(address && typeof address === 'object' ? address.address : address).toBe('127.0.0.1');
  });
});

describe('other paths', () => {
  it.each(['/favicon.ico', '/other', '/callback'])(
    'answers %s with 404 at once and keeps waiting for the sign-in',
    async (path) => {
      started = await startSignIn();
      const { request, port, signIn } = started;
      const status = await new Promise<number>((resolve, reject) => {
        http
          .get({ host: '127.0.0.1', port, path }, (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          })
          .on('error', reject);
      });
      expect(status).toBe(404);

      await callback(port, `code=CODE&state=${encodeURIComponent(request.state)}`);
      await expect(signIn).resolves.toBe('TOKEN');
    }
  );

  it('keeps the redirect URI on http://localhost', async () => {
    started = await startSignIn();
    expect(new URL(started.request.redirectUri).hostname).toBe('localhost');
    expect(new URL(started.request.redirectUri).protocol).toBe('http:');
  });
});
