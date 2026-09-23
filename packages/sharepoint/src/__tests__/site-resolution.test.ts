import { describe, it, expect, beforeEach, vi } from 'vitest';

const graph = vi.hoisted(() => ({ calls: [] as string[], responses: {} as Record<string, any> }));

vi.mock('@mcp-consultant-tools/m365-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-consultant-tools/m365-core')>();
  class FakeDelegatedGraphAuth {
    getGraphClient() {
      return {
        api(path: string) {
          graph.calls.push(path);
          const request: any = {
            select: () => request,
            get: async () => {
              if (!(path in graph.responses)) throw new Error(`unexpected path ${path}`);
              return graph.responses[path];
            },
          };
          return request;
        },
      };
    }
  }
  return { ...actual, DelegatedGraphAuth: FakeDelegatedGraphAuth };
});

import { SharePointService } from '../services/sharepoint-service.js';
import type { SharePointConfig } from '../types/sharepoint-types.js';

const GRAPH_SITE_ID = 'contoso.sharepoint.com,11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222';

function service(mode: 'device-code' | 'client-credentials', sites: SharePointConfig['sites'] = []) {
  return new SharePointService({
    sites,
    authMethod: 'entra-id',
    authMode: mode,
    tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    clientId: 'aaaaaaaa-bbbb-cccc-dddd-000000000000',
    clientSecret: mode === 'client-credentials' ? 'x' : undefined,
  });
}

describe('site resolution', () => {
  beforeEach(() => {
    graph.calls.length = 0;
    graph.responses = {
      '/sites/contoso.sharepoint.com:/sites/example': { id: GRAPH_SITE_ID },
      '/sites/contoso.sharepoint.com:/teams/project': { id: GRAPH_SITE_ID },
      '/sites/contoso.sharepoint.com:/sites/intranet': { id: GRAPH_SITE_ID },
    };
  });

  it('device code: a site URL resolves through /sites/{host}:/sites/{path} and is cached', async () => {
    const spo = service('device-code');
    expect(await spo.getGraphSiteId('https://contoso.sharepoint.com/sites/example')).toBe(GRAPH_SITE_ID);
    expect(await spo.getGraphSiteId('https://contoso.sharepoint.com/sites/example')).toBe(GRAPH_SITE_ID);
    expect(graph.calls).toEqual(['/sites/contoso.sharepoint.com:/sites/example']);
  });

  it('device code: a URL deeper in the site (a library view) resolves to the site', async () => {
    const spo = service('device-code');
    await spo.getGraphSiteId('https://contoso.sharepoint.com/sites/example/Shared%20Documents/Forms/AllItems.aspx');
    expect(graph.calls).toEqual(['/sites/contoso.sharepoint.com:/sites/example']);
  });

  it('device code: a /teams/ site URL resolves', async () => {
    const spo = service('device-code');
    await spo.getGraphSiteId('https://contoso.sharepoint.com/teams/project/');
    expect(graph.calls).toEqual(['/sites/contoso.sharepoint.com:/teams/project']);
  });

  it('device code: a configured id still works', async () => {
    const spo = service('device-code', [
      { id: 'intranet', name: 'Intranet', siteUrl: 'https://contoso.sharepoint.com/sites/intranet', active: true },
    ]);
    await spo.getGraphSiteId('intranet');
    expect(graph.calls).toEqual(['/sites/contoso.sharepoint.com:/sites/intranet']);
  });

  it('device code: an id that is neither configured nor a URL lists both accepted forms', () => {
    const spo = service('device-code');
    expect(() => spo.getSiteById('intranet')).toThrow(/configured site id.*full site URL/s);
  });

  it('device code: a URL that is not a SharePoint site URL is rejected with both forms', () => {
    const spo = service('device-code');
    expect(() => spo.getSiteById('https://example.com/sites/x')).toThrow(/configured site id.*full site URL/s);
    expect(() => spo.getSiteById('https://contoso.sharepoint.com/')).toThrow(/full site URL/);
  });

  it('app-only: a URL is not accepted and the error is unchanged', () => {
    const spo = service('client-credentials', [
      { id: 'intranet', name: 'Intranet', siteUrl: 'https://contoso.sharepoint.com/sites/intranet', active: true },
    ]);
    expect(() => spo.getSiteById('https://contoso.sharepoint.com/sites/example')).toThrow(
      "SharePoint site 'https://contoso.sharepoint.com/sites/example' not found. Available sites: intranet"
    );
  });
});
