import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AppRegistrationService,
  countCredentials,
  matchesFilter,
  matchesName,
  resolvePermissions,
  toSummary,
  collectRedirectUris,
} from '../app-registration-service.js';
import type { EntraIdClient } from '../../entra-client.js';
import type { GraphApplication, GraphServicePrincipal } from '../../models/entra-types.js';

const NOW = new Date('2026-07-10T12:00:00.000Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

const GUID_A = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const GUID_B = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';

function app(overrides: Partial<GraphApplication> = {}): GraphApplication {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    appId: GUID_A,
    displayName: 'Contoso API',
    passwordCredentials: [],
    keyCredentials: [],
    ...overrides,
  };
}

const secret = (days: number) => ({ keyId: 'k1', endDateTime: at(days), hint: 'abc' });
const cert = (days: number) => ({ keyId: 'k2', endDateTime: at(days), type: 'AsymmetricX509Cert' });

/** A stub EntraIdClient. The service only ever touches these three members. */
function fakeClient() {
  return {
    paginate: vi.fn(),
    get: vi.fn(),
    getServicePrincipalByAppId: vi.fn().mockResolvedValue(null),
    enhanceError: vi.fn((e: unknown, op: string) => new Error(`enhanced: ${op}`)),
  };
}

function service(client: ReturnType<typeof fakeClient>) {
  return new AppRegistrationService(client as unknown as EntraIdClient);
}

// ---------------------------------------------------------------------------
// The defect this package exists to not repeat
// ---------------------------------------------------------------------------

describe('certificates are first-class credentials', () => {
  const certOnly = toSummary(app({ keyCredentials: [cert(5)] }), NOW, 30);

  it('does not report a cert-only app as having no credentials', () => {
    // The ported source filtered on secrets only, so this app matched "no-secrets"
    // and never matched "expiring-secrets" — a false all-clear on an expiring cert.
    expect(matchesFilter(certOnly, 'no-credentials', 'any')).toBe(false);
  });

  it('reports a cert-only app with an expiring certificate as expiring', () => {
    expect(matchesFilter(certOnly, 'expiring-credentials', 'any')).toBe(true);
  });

  it('still lets a caller ask specifically about secrets', () => {
    expect(matchesFilter(certOnly, 'no-credentials', 'secret')).toBe(true);
    expect(matchesFilter(certOnly, 'expiring-credentials', 'secret')).toBe(false);
  });

  it('still lets a caller ask specifically about certificates', () => {
    const secretOnly = toSummary(app({ passwordCredentials: [secret(5)] }), NOW, 30);
    expect(matchesFilter(secretOnly, 'no-credentials', 'certificate')).toBe(true);
  });
});

describe('matchesFilter', () => {
  it('expiring never overlaps expired', () => {
    const summary = toSummary(app({ passwordCredentials: [secret(-1)] }), NOW, 30);
    expect(matchesFilter(summary, 'expired-credentials', 'any')).toBe(true);
    expect(matchesFilter(summary, 'expiring-credentials', 'any')).toBe(false);
  });

  it('an app with only an active credential matches nothing', () => {
    const summary = toSummary(app({ passwordCredentials: [secret(90)] }), NOW, 30);
    expect(matchesFilter(summary, 'no-credentials', 'any')).toBe(false);
    expect(matchesFilter(summary, 'expiring-credentials', 'any')).toBe(false);
    expect(matchesFilter(summary, 'expired-credentials', 'any')).toBe(false);
  });

  it('an app with a credential of unknown expiry is not credential-free', () => {
    const summary = toSummary(app({ passwordCredentials: [{ keyId: 'k' }] }), NOW, 30);
    expect(matchesFilter(summary, 'no-credentials', 'any')).toBe(false);
    expect(summary.credentialCounts.unknown).toBe(1);
  });
});

describe('matchesName', () => {
  const summary = toSummary(app({ displayName: 'Contoso Payments API' }), NOW, 30);

  it('matches a case-insensitive substring, not just a prefix', () => {
    expect(matchesName(summary, 'payments')).toBe(true);
    expect(matchesName(summary, 'PAYMENTS')).toBe(true);
  });

  it('does not match an absent substring', () => {
    expect(matchesName(summary, 'billing')).toBe(false);
  });

  it('tolerates a null displayName', () => {
    expect(matchesName(toSummary(app({ displayName: null }), NOW, 30), 'x')).toBe(false);
  });
});

describe('countCredentials', () => {
  it('counts secrets and certificates separately and by status', () => {
    const summary = toSummary(
      app({
        passwordCredentials: [secret(-5), secret(10)],
        keyCredentials: [cert(200), { keyId: 'k3' }],
      }),
      NOW,
      30
    );

    expect(summary.credentialCounts).toEqual({
      secrets: 2,
      certificates: 2,
      expired: 1,
      expiring: 1,
      active: 1,
      unknown: 1,
    });
  });

  it('reports zeroes for an app with no credentials', () => {
    expect(countCredentials([], [])).toEqual({
      secrets: 0,
      certificates: 0,
      expired: 0,
      expiring: 0,
      active: 0,
      unknown: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// listAppRegistrations
// ---------------------------------------------------------------------------

describe('AppRegistrationService.listAppRegistrations', () => {
  let client: ReturnType<typeof fakeClient>;

  beforeEach(() => {
    client = fakeClient();
  });

  it('always selects both credential collections', async () => {
    client.paginate.mockResolvedValue({ items: [], truncated: false });
    await service(client).listAppRegistrations({}, NOW);

    const select = client.paginate.mock.calls[0][1] as string[];
    expect(select).toContain('passwordCredentials');
    expect(select).toContain('keyCredentials');
  });

  it('pushes maxResults down to the fetch when there is no client-side filter', async () => {
    client.paginate.mockResolvedValue({ items: [app()], truncated: true });

    const result = await service(client).listAppRegistrations({ maxResults: 1 }, NOW);

    expect(client.paginate).toHaveBeenCalledWith('/applications', expect.any(Array), 1);
    expect(result.truncated).toBe(true);
  });

  it('scans the whole tenant before trimming when a filter is set', async () => {
    // The ported source appended $top to the request and then paged past it anyway,
    // so `top` never limited anything and a filter could miss matches beyond page one.
    client.paginate.mockResolvedValue({
      items: [
        app({ id: '1', passwordCredentials: [secret(-1)] }),
        app({ id: '2', passwordCredentials: [secret(-2)] }),
        app({ id: '3', passwordCredentials: [secret(-3)] }),
      ],
      truncated: false,
    });

    const result = await service(client).listAppRegistrations(
      { filter: 'expired-credentials', maxResults: 2 },
      NOW
    );

    expect(client.paginate).toHaveBeenCalledWith('/applications', expect.any(Array), undefined);
    expect(result.applications).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('does not report truncation when the filtered set fits inside maxResults', async () => {
    client.paginate.mockResolvedValue({
      items: [app({ id: '1', passwordCredentials: [secret(-1)] }), app({ id: '2' })],
      truncated: false,
    });

    const result = await service(client).listAppRegistrations(
      { filter: 'expired-credentials', maxResults: 5 },
      NOW
    );

    expect(result.applications).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });

  it('classifies credentials against the SAME threshold the filter uses', async () => {
    // The ported source hardcoded a 30-day status but filtered on expiryDays, so a
    // 60-day secret matched `expiring-secrets --expiry-days 90` while reporting "active".
    client.paginate.mockResolvedValue({
      items: [app({ passwordCredentials: [secret(60)] })],
      truncated: false,
    });

    const result = await service(client).listAppRegistrations(
      { filter: 'expiring-credentials', expiryDays: 90 },
      NOW
    );

    expect(result.applications).toHaveLength(1);
    expect(result.applications[0].secrets[0].status).toBe('expiring');
    expect(result.expiryDays).toBe(90);
  });

  it('combines a name filter with a credential filter', async () => {
    client.paginate.mockResolvedValue({
      items: [
        app({ id: '1', displayName: 'Payments API', passwordCredentials: [secret(-1)] }),
        app({ id: '2', displayName: 'Billing API', passwordCredentials: [secret(-1)] }),
        app({ id: '3', displayName: 'Payments Web', passwordCredentials: [secret(90)] }),
      ],
      truncated: false,
    });

    const result = await service(client).listAppRegistrations(
      { filter: 'expired-credentials', nameContains: 'payments' },
      NOW
    );

    expect(result.applications.map((a) => a.objectId)).toEqual(['1']);
    expect(result.total).toBe(1);
  });

  it('surfaces a Graph failure through enhanceError', async () => {
    client.paginate.mockRejectedValue({ statusCode: 403, message: 'Insufficient privileges' });

    await expect(service(client).listAppRegistrations({}, NOW)).rejects.toThrow(/enhanced/);
    expect(client.enhanceError).toHaveBeenCalledWith(expect.anything(), 'listing app registrations');
  });
});

// ---------------------------------------------------------------------------
// getAppRegistration
// ---------------------------------------------------------------------------

describe('AppRegistrationService.getAppRegistration', () => {
  let client: ReturnType<typeof fakeClient>;

  beforeEach(() => {
    client = fakeClient();
  });

  it('rejects a non-GUID before it reaches a Graph URL', async () => {
    await expect(service(client).getAppRegistration("x') or startswith(displayName,'")).rejects.toThrow(
      /must be a GUID/
    );
    expect(client.get).not.toHaveBeenCalled();
  });

  it('looks the app up by object ID first', async () => {
    client.get.mockResolvedValue(app());
    await service(client).getAppRegistration(GUID_A, 30, NOW);
    expect(client.get).toHaveBeenCalledWith(`/applications/${GUID_A}`, expect.any(Array));
  });

  it('falls back to the appId alternate key on a 404', async () => {
    client.get
      .mockRejectedValueOnce({ statusCode: 404, message: 'not found' })
      .mockResolvedValueOnce(app());

    const detail = await service(client).getAppRegistration(GUID_A, 30, NOW);

    expect(client.get).toHaveBeenNthCalledWith(2, `/applications(appId='${GUID_A}')`, expect.any(Array));
    expect(detail.appId).toBe(GUID_A);
  });

  it('does NOT swallow a 403 as "not found"', async () => {
    // The ported source caught every error from the object-id lookup and retried by
    // appId, so a missing Application.Read.All grant was reported as a missing app.
    client.get.mockRejectedValue({ statusCode: 403, message: 'Insufficient privileges' });

    await expect(service(client).getAppRegistration(GUID_A, 30, NOW)).rejects.toThrow(/enhanced/);
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('reports not-found only after both lookups 404', async () => {
    client.get.mockRejectedValue({ statusCode: 404, message: 'not found' });

    await expect(service(client).getAppRegistration(GUID_A, 30, NOW)).rejects.toThrow(
      /App registration not found/
    );
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('tolerates an application with no requiredResourceAccess', async () => {
    // Graph omits an unset collection rather than returning []. The ported source
    // iterated it unguarded and threw a TypeError.
    client.get.mockResolvedValue(app({ requiredResourceAccess: undefined }));

    const detail = await service(client).getAppRegistration(GUID_A, 30, NOW);

    expect(detail.apiPermissions).toEqual([]);
    expect(detail.redirectUris).toEqual([]);
    expect(detail.exposedScopes).toEqual([]);
  });

  it('resolves each distinct resource app exactly once, in parallel', async () => {
    client.get.mockResolvedValue(
      app({
        requiredResourceAccess: [
          { resourceAppId: GUID_B, resourceAccess: [{ id: 'r1', type: 'Role' }] },
          { resourceAppId: GUID_B, resourceAccess: [{ id: 's1', type: 'Scope' }] },
        ],
      })
    );

    await service(client).getAppRegistration(GUID_A, 30, NOW);

    expect(client.getServicePrincipalByAppId).toHaveBeenCalledTimes(1);
    expect(client.getServicePrincipalByAppId).toHaveBeenCalledWith(GUID_B);
  });
});

// ---------------------------------------------------------------------------
// Detail mappers
// ---------------------------------------------------------------------------

describe('collectRedirectUris', () => {
  it('tags each URI with its platform and tolerates missing platforms', () => {
    expect(
      collectRedirectUris(
        app({
          web: { redirectUris: ['https://contoso.example/cb'] },
          spa: { redirectUris: ['https://contoso.example/spa'] },
        })
      )
    ).toEqual([
      { uri: 'https://contoso.example/cb', platform: 'web' },
      { uri: 'https://contoso.example/spa', platform: 'spa' },
    ]);
  });
});

describe('resolvePermissions', () => {
  const sp: GraphServicePrincipal = {
    appId: GUID_B,
    displayName: 'Microsoft Graph',
    appRoles: [{ id: 'role-1', value: 'Application.Read.All' }],
    oauth2PermissionScopes: [{ id: 'scope-1', value: 'User.Read' }],
  };

  it('names application permissions from appRoles and delegated ones from scopes', () => {
    const permissions = resolvePermissions(
      [
        {
          resourceAppId: GUID_B,
          resourceAccess: [
            { id: 'role-1', type: 'Role' },
            { id: 'scope-1', type: 'Scope' },
          ],
        },
      ],
      new Map([[GUID_B, sp]])
    );

    expect(permissions).toEqual([
      {
        resourceAppId: GUID_B,
        resourceDisplayName: 'Microsoft Graph',
        permissionName: 'Application.Read.All',
        permissionType: 'Application',
        unresolved: false,
      },
      {
        resourceAppId: GUID_B,
        resourceDisplayName: 'Microsoft Graph',
        permissionName: 'User.Read',
        permissionType: 'Delegated',
        unresolved: false,
      },
    ]);
  });

  it('flags a permission it could not resolve rather than passing a GUID off as a name', () => {
    const permissions = resolvePermissions(
      [{ resourceAppId: GUID_B, resourceAccess: [{ id: 'unknown-id', type: 'Role' }] }],
      new Map([[GUID_B, null]])
    );

    expect(permissions[0]).toMatchObject({
      resourceDisplayName: GUID_B,
      permissionName: 'unknown-id',
      unresolved: true,
    });
  });

  it('tolerates a resource entry with no resourceAccess', () => {
    expect(resolvePermissions([{ resourceAppId: GUID_B }], new Map())).toEqual([]);
  });
});
