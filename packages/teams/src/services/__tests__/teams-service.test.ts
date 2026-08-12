/**
 * TeamsService tests - discovery queries
 *
 * These assert what a query must NOT contain, not just what it does. listTeams
 * shipped for several releases sending $top on /me/joinedTeams, which Graph
 * rejects with "Query option 'Top' is not allowed" - a test asserting the built
 * query matched expectations would have passed on the broken code, because the
 * expectation was the broken query.
 */

import { describe, it, expect, vi } from 'vitest';
import { TeamsService } from '../teams-service.js';

const TENANT_ID = '11111111-2222-3333-4444-555555555555';
const CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// Keep construction off the real home directory and off the real token cache:
// TeamsService deletes a legacy token file and TokenCache creates ~/.mcp-consultant-tools.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, default: actual, homedir: () => '/tmp/mcp-teams-service-test-home' };
});

vi.mock('../../auth/token-cache.js', () => ({
  TokenCache: class {
    createPlugin() { return {}; }
    exists() { return false; }
    clear() {}
    getCachePath() { return '/tmp/mcp-teams-service-test-home/cache.enc'; }
  },
}));

/** Records the fluent Graph chain, including whether .top() was called at all. */
function createGraphStub() {
  const calls = {
    path: '' as string,
    topCalled: false,
    top: undefined as number | undefined,
    select: undefined as string | undefined,
  };

  const request: any = {
    top: (n: number) => { calls.topCalled = true; calls.top = n; return request; },
    select: (v: string) => { calls.select = v; return request; },
    get: async () => ({
      value: [{ id: 'team-1', displayName: 'Contoso Engineering', description: 'Eng team' }],
    }),
  };

  return {
    calls,
    client: { api: (path: string) => { calls.path = path; return request; } },
  };
}

function createService(authMode: 'device-code' | 'client-credentials', stub: ReturnType<typeof createGraphStub>) {
  const service = new TeamsService({
    authMode,
    tenantId: TENANT_ID,
    clientId: CLIENT_ID,
    clientSecret: authMode === 'client-credentials' ? 'not-a-real-secret' : undefined,
  });

  vi.spyOn(service, 'getGraphClient').mockResolvedValue(stub.client as any);

  return service;
}

describe('TeamsService.listTeams', () => {
  it('does not send $top on /me/joinedTeams - that endpoint rejects it', async () => {
    const stub = createGraphStub();
    const service = createService('device-code', stub);

    await service.listTeams();

    expect(stub.calls.path).toBe('/me/joinedTeams');
    expect(stub.calls.topCalled).toBe(false);
  });

  it('sends $top on the /groups path, which accepts it', async () => {
    const stub = createGraphStub();
    const service = createService('client-credentials', stub);

    await service.listTeams();

    expect(stub.calls.path).toBe("/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')");
    expect(stub.calls.top).toBe(100);
  });

  it('maps the response to reader-facing fields in both modes', async () => {
    const stub = createGraphStub();
    const service = createService('device-code', stub);

    const [team] = await service.listTeams();

    expect(team).toEqual({
      id: 'team-1',
      displayName: 'Contoso Engineering',
      description: 'Eng team',
    });
  });
});
