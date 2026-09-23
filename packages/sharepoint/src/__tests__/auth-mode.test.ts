import { describe, it, expect, beforeEach, vi } from 'vitest';

const spies = vi.hoisted(() => ({ confidential: [] as any[], delegated: [] as any[] }));

vi.mock('@azure/msal-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@azure/msal-node')>();
  class FakeConfidentialClientApplication {
    constructor(public config: any) {
      spies.confidential.push(config);
    }
  }
  return { ...actual, ConfidentialClientApplication: FakeConfidentialClientApplication };
});

vi.mock('@mcp-consultant-tools/m365-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-consultant-tools/m365-core')>();
  class FakeDelegatedGraphAuth {
    constructor(public config: any) {
      spies.delegated.push(config);
    }
  }
  return { ...actual, DelegatedGraphAuth: FakeDelegatedGraphAuth };
});

import { resolveAuthMode } from '../auth-mode.js';
import { loadSharePointConfig } from '../config.js';
import { SharePointService } from '../services/sharepoint-service.js';

const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-000000000000';
const SITE_URL = 'https://contoso.sharepoint.com/sites/example';

describe('resolveAuthMode', () => {
  it('uses client credentials when a secret is set and there is no override', () => {
    expect(resolveAuthMode({ SHAREPOINT_CLIENT_SECRET: 'x' })).toBe('client-credentials');
  });

  it('uses device code when no secret is set', () => {
    expect(resolveAuthMode({})).toBe('device-code');
  });

  it('treats an empty secret as absent', () => {
    expect(resolveAuthMode({ SHAREPOINT_CLIENT_SECRET: '' })).toBe('device-code');
  });

  it('lets SHAREPOINT_AUTH_MODE=device-code override a configured secret', () => {
    expect(resolveAuthMode({ SHAREPOINT_CLIENT_SECRET: 'x', SHAREPOINT_AUTH_MODE: 'device-code' })).toBe('device-code');
  });

  it('lets SHAREPOINT_AUTH_MODE=client-credentials force app-only', () => {
    expect(resolveAuthMode({ SHAREPOINT_AUTH_MODE: 'client-credentials' })).toBe('client-credentials');
  });

  it('rejects an unknown override, naming the allowed values', () => {
    expect(() => resolveAuthMode({ SHAREPOINT_AUTH_MODE: 'interactive' })).toThrow(
      /SHAREPOINT_AUTH_MODE.*client-credentials.*device-code/
    );
  });
});

describe('loadSharePointConfig', () => {
  it('device-code mode starts with no configured sites', () => {
    const config = loadSharePointConfig({ SHAREPOINT_TENANT_ID: TENANT, SHAREPOINT_CLIENT_ID: CLIENT });
    expect(config.authMode).toBe('device-code');
    expect(config.sites).toEqual([]);
    expect(config.clientSecret).toBeUndefined();
  });

  it('device-code mode still takes SHAREPOINT_SITE_URL as a named shortcut', () => {
    const config = loadSharePointConfig({
      SHAREPOINT_TENANT_ID: TENANT,
      SHAREPOINT_CLIENT_ID: CLIENT,
      SHAREPOINT_SITE_URL: SITE_URL,
    });
    expect(config.sites).toEqual([{ id: 'default', name: 'Default SharePoint Site', siteUrl: SITE_URL, active: true }]);
  });

  it('device-code mode still requires the tenant and client ids', () => {
    expect(() => loadSharePointConfig({})).toThrow(
      'Missing SharePoint configuration: SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID'
    );
  });

  it('client-credentials mode still requires sites, exactly as before', () => {
    expect(() =>
      loadSharePointConfig({
        SHAREPOINT_TENANT_ID: TENANT,
        SHAREPOINT_CLIENT_ID: CLIENT,
        SHAREPOINT_CLIENT_SECRET: 'x',
      })
    ).toThrow('Missing SharePoint configuration: SHAREPOINT_SITES or SHAREPOINT_SITE_URL');
  });

  it('forcing client-credentials without a secret names the missing secret', () => {
    expect(() =>
      loadSharePointConfig({
        SHAREPOINT_TENANT_ID: TENANT,
        SHAREPOINT_CLIENT_ID: CLIENT,
        SHAREPOINT_SITE_URL: SITE_URL,
        SHAREPOINT_AUTH_MODE: 'client-credentials',
      })
    ).toThrow('Missing SharePoint configuration: SHAREPOINT_CLIENT_SECRET');
  });

  it('client-credentials mode builds the same config as before', () => {
    const sites = [{ id: 'intranet', name: 'Intranet', siteUrl: SITE_URL, active: true }];
    const config = loadSharePointConfig({
      SHAREPOINT_TENANT_ID: TENANT,
      SHAREPOINT_CLIENT_ID: CLIENT,
      SHAREPOINT_CLIENT_SECRET: 'x',
      SHAREPOINT_SITES: JSON.stringify(sites),
    });
    expect(config).toEqual({
      sites,
      authMethod: 'entra-id',
      authMode: 'client-credentials',
      tenantId: TENANT,
      clientId: CLIENT,
      clientSecret: 'x',
    });
  });

  it('still rejects malformed SHAREPOINT_SITES JSON', () => {
    expect(() =>
      loadSharePointConfig({ SHAREPOINT_TENANT_ID: TENANT, SHAREPOINT_CLIENT_ID: CLIENT, SHAREPOINT_SITES: '{' })
    ).toThrow('Failed to parse SHAREPOINT_SITES JSON');
  });
});

describe('SharePointService auth construction', () => {
  beforeEach(() => {
    spies.confidential.length = 0;
    spies.delegated.length = 0;
  });

  it('app-only: builds a ConfidentialClientApplication and never a DelegatedGraphAuth', () => {
    const service = new SharePointService(
      loadSharePointConfig({
        SHAREPOINT_TENANT_ID: TENANT,
        SHAREPOINT_CLIENT_ID: CLIENT,
        SHAREPOINT_CLIENT_SECRET: 'x',
        SHAREPOINT_SITE_URL: SITE_URL,
      })
    );
    expect(service.getAuthMode()).toBe('client-credentials');
    expect(spies.confidential).toEqual([
      { auth: { clientId: CLIENT, clientSecret: 'x', authority: `https://login.microsoftonline.com/${TENANT}` } },
    ]);
    expect(spies.delegated).toEqual([]);
  });

  it('device code: builds a DelegatedGraphAuth for the sharepoint cache and never a ConfidentialClientApplication', () => {
    const service = new SharePointService(
      loadSharePointConfig({ SHAREPOINT_TENANT_ID: TENANT, SHAREPOINT_CLIENT_ID: CLIENT })
    );
    expect(service.getAuthMode()).toBe('device-code');
    expect(spies.delegated).toEqual([
      { serverName: 'sharepoint', tenantId: TENANT, clientId: CLIENT, authToolName: 'spo-authenticate' },
    ]);
    expect(spies.confidential).toEqual([]);
  });
});
