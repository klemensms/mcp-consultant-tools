import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GRAPH_DEFAULT = 'https://graph.microsoft.com/.default';

const fake = vi.hoisted(() => ({ instances: [] as any[] }));

vi.mock('@azure/msal-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@azure/msal-node')>();
  const { vi: v } = await import('vitest');
  class FakePublicClientApplication {
    config: any;
    accounts: any[] = [];
    acquireTokenSilent = v.fn();
    acquireTokenByDeviceCode = v.fn();
    tokenCache = {
      getAllAccounts: v.fn(async () => this.accounts),
      removeAccount: v.fn(async (account: any) => {
        this.accounts = this.accounts.filter((a) => a !== account);
      }),
    };
    constructor(config: any) {
      this.config = config;
      fake.instances.push(this);
    }
    getTokenCache() {
      return this.tokenCache;
    }
  }
  return { ...actual, PublicClientApplication: FakePublicClientApplication };
});

import { InteractionRequiredAuthError } from '@azure/msal-node';
import { DelegatedGraphAuth } from '../delegated-auth.js';

function jwt(scp: string): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ scp })}.`;
}

const ACCOUNT = { username: 'jdoe@example.com', homeAccountId: 'h1' };
const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000);

describe('DelegatedGraphAuth', () => {
  let dir: string;

  beforeEach(() => {
    fake.instances.length = 0;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm365-core-auth-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function makeAuth() {
    const auth = new DelegatedGraphAuth({
      serverName: 'outlook',
      tenantId: 'tenant-1',
      clientId: 'client-1',
      tokenDir: dir,
      authToolName: 'mail-authenticate',
    });
    return { auth, pca: fake.instances[fake.instances.length - 1] };
  }

  /** Device-code stub: fires the callback at once, completes when release() is called. */
  function stubDeviceCode(pca: any, token = jwt('Mail.Read')) {
    let release!: () => void;
    let fail!: (e: Error) => void;
    pca.acquireTokenByDeviceCode.mockImplementation((request: any) => {
      const done = new Promise((resolve, reject) => {
        release = () => resolve({ accessToken: token, expiresOn: inOneHour(), account: ACCOUNT });
        fail = reject;
      });
      queueMicrotask(() =>
        request.deviceCodeCallback({
          userCode: 'ABCD-1234',
          verificationUri: 'https://microsoft.com/devicelogin',
          expiresIn: 900,
          message: 'sign in',
        })
      );
      return done;
    });
    return { release: () => release(), fail: (e: Error) => fail(e) };
  }

  it('builds a public client against the tenant authority with a cache plugin', () => {
    const { pca } = makeAuth();
    expect(pca.config.auth).toEqual({
      clientId: 'client-1',
      authority: 'https://login.microsoftonline.com/tenant-1',
    });
    expect(pca.config.cache.cachePlugin).toBeDefined();
  });

  it('requests only the Graph .default scope for device code and silent refresh', async () => {
    const { auth, pca } = makeAuth();
    stubDeviceCode(pca);
    await auth.startDeviceCode();
    expect(pca.acquireTokenByDeviceCode.mock.calls[0][0].scopes).toEqual([GRAPH_DEFAULT]);

    const second = makeAuth();
    second.pca.accounts = [ACCOUNT];
    second.pca.acquireTokenSilent.mockResolvedValue({ accessToken: 't', expiresOn: inOneHour(), account: ACCOUNT });
    await second.auth.getAccessToken();
    expect(second.pca.acquireTokenSilent.mock.calls[0][0]).toEqual({ account: ACCOUNT, scopes: [GRAPH_DEFAULT] });
  });

  it('startDeviceCode returns the code and URL before sign-in completes', async () => {
    const { auth, pca } = makeAuth();
    stubDeviceCode(pca);
    const start = await auth.startDeviceCode();
    expect(start).toMatchObject({
      state: 'pending',
      userCode: 'ABCD-1234',
      verificationUri: 'https://microsoft.com/devicelogin',
      expiresInSeconds: 900,
    });
    expect((await auth.getStatus()).state).toBe('pending');
  });

  it('a second startDeviceCode while pending returns the same code without a new flow', async () => {
    const { auth, pca } = makeAuth();
    stubDeviceCode(pca);
    await auth.startDeviceCode();
    const again = await auth.startDeviceCode();
    expect(again.userCode).toBe('ABCD-1234');
    expect(pca.acquireTokenByDeviceCode).toHaveBeenCalledTimes(1);
  });

  it('startDeviceCode rejects, rather than hanging, when the flow fails before a code is issued', async () => {
    const { auth, pca } = makeAuth();
    pca.acquireTokenByDeviceCode.mockRejectedValue(new Error('AADSTS700016: application not found'));
    await expect(auth.startDeviceCode()).rejects.toThrow('AADSTS700016');
  });

  it('waitForCompletion resolves authenticated with the granted scopes once sign-in completes', async () => {
    const { auth, pca } = makeAuth();
    const flow = stubDeviceCode(pca, jwt('User.Read Mail.Read'));
    await auth.startDeviceCode();
    const waiting = auth.waitForCompletion(5000);
    flow.release();
    const status = await waiting;
    expect(status).toMatchObject({ state: 'authenticated', account: 'jdoe@example.com' });
    expect(status.grantedScopes).toEqual(['User.Read', 'Mail.Read']);
  });

  it('waitForCompletion reports a failed sign-in as not authenticated with the reason', async () => {
    const { auth, pca } = makeAuth();
    const flow = stubDeviceCode(pca);
    await auth.startDeviceCode();
    const waiting = auth.waitForCompletion(5000);
    flow.fail(new Error('AADSTS50126: declined'));
    const status = await waiting;
    expect(status.state).toBe('not_authenticated');
    expect(status.message).toContain('AADSTS50126');
  });

  it('waitForCompletion times out while still pending', async () => {
    const { auth, pca } = makeAuth();
    stubDeviceCode(pca);
    await auth.startDeviceCode();
    const status = await auth.waitForCompletion(20);
    expect(status.state).toBe('pending');
  });

  it('getAccessToken returns the in-memory token without touching MSAL again', async () => {
    const { auth, pca } = makeAuth();
    const flow = stubDeviceCode(pca, jwt('Mail.Read'));
    await auth.startDeviceCode();
    const waiting = auth.waitForCompletion(5000);
    flow.release();
    await waiting;
    expect(await auth.getAccessToken()).toBe(jwt('Mail.Read'));
    expect(pca.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it('getAccessToken renews silently from the cached account', async () => {
    const { auth, pca } = makeAuth();
    pca.accounts = [ACCOUNT];
    pca.acquireTokenSilent.mockResolvedValue({ accessToken: 'silent-token', expiresOn: inOneHour(), account: ACCOUNT });
    expect(await auth.getAccessToken()).toBe('silent-token');
  });

  it('getAccessToken throws a message naming the authenticate tool when nothing works', async () => {
    const { auth } = makeAuth();
    await expect(auth.getAccessToken()).rejects.toThrow(/mail-authenticate/);
  });

  it('an InteractionRequiredAuthError on refresh reports expired when a cache file exists', async () => {
    const { auth, pca } = makeAuth();
    fs.writeFileSync(path.join(dir, 'outlook-token-cache-client-1.enc'), 'x');
    pca.accounts = [ACCOUNT];
    pca.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError('invalid_grant'));
    expect((await auth.getStatus()).state).toBe('expired');
    await expect(auth.getAccessToken()).rejects.toThrow(/authenticate/);
  });

  it('reports not_authenticated with no cache and no account', async () => {
    const { auth } = makeAuth();
    expect((await auth.getStatus()).state).toBe('not_authenticated');
  });

  it('logout removes every account and the cache file', async () => {
    const { auth, pca } = makeAuth();
    const file = path.join(dir, 'outlook-token-cache-client-1.enc');
    fs.writeFileSync(file, 'x');
    pca.accounts = [ACCOUNT];
    await auth.logout();
    expect(pca.tokenCache.removeAccount).toHaveBeenCalledWith(ACCOUNT);
    expect(pca.accounts).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
    expect((await auth.getStatus()).state).toBe('not_authenticated');
  });

  it('getGraphClient sends the current access token as a bearer token', async () => {
    const { auth, pca } = makeAuth();
    pca.accounts = [ACCOUNT];
    pca.acquireTokenSilent.mockResolvedValue({ accessToken: 'silent-token', expiresOn: inOneHour(), account: ACCOUNT });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'me' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    try {
      await auth.getGraphClient().api('/me').get();
      const [, init] = fetchSpy.mock.calls[0];
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get('Authorization')).toBe('Bearer silent-token');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
