import { describe, it, expect } from 'vitest';
import { DiscoveryService, encodeSharingUrl } from '../services/discovery-service.js';
import { fakeGraph } from './fake-graph.js';
import { SEARCH_DRIVEITEM_RESPONSE } from './fixtures/search-driveitem.js';

function discovery(responses: Record<string, unknown>, mode: 'device-code' | 'client-credentials' = 'device-code') {
  const graph = fakeGraph(responses);
  const spo = {
    getAuthMode: () => mode,
    getAuthenticatedGraphClient: async () => graph.client,
    handleError: (error: any) => error,
  };
  return { service: new DiscoveryService(spo as any), calls: graph.calls };
}

describe('searchFiles', () => {
  it('posts one driveItem search request with the query, from and size', async () => {
    const { service, calls } = discovery({ '/search/query': SEARCH_DRIVEITEM_RESPONSE });
    await service.searchFiles('budget', { top: 10, from: 20 });
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/search/query',
        body: { requests: [{ entityTypes: ['driveItem'], query: { queryString: 'budget' }, from: 20, size: 10 }] },
      },
    ]);
  });

  it('defaults to 25 results from 0 and caps the page at 100', async () => {
    const { service, calls } = discovery({ '/search/query': SEARCH_DRIVEITEM_RESPONSE });
    await service.searchFiles('budget');
    await service.searchFiles('budget', { top: 1000 });
    expect((calls[0].body as any).requests[0]).toMatchObject({ from: 0, size: 25 });
    expect((calls[1].body as any).requests[0].size).toBe(100);
  });

  it('maps hits to name, site, location, web URL, last modified, ids and summary', async () => {
    const { service } = discovery({ '/search/query': SEARCH_DRIVEITEM_RESPONSE });
    const result = await service.searchFiles('budget');
    expect(result.total).toBe(2);
    expect(result.moreResultsAvailable).toBe(false);
    expect(result.hits[0]).toEqual({
      name: 'Budget 2026.xlsx',
      webUrl: 'https://contoso.sharepoint.com/sites/example/Shared%20Documents/Finance/Budget%202026.xlsx',
      location: 'contoso.sharepoint.com/sites/example/Shared Documents/Finance',
      siteId: 'contoso.sharepoint.com,aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee,aaaaaaaa-bbbb-cccc-dddd-000000000000',
      driveId: 'b!aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      itemId: '01AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      lastModifiedDateTime: '2026-09-01T10:00:00Z',
      lastModifiedBy: 'Jane Doe',
      size: 20480,
      summary: 'The budget for the year...',
    });
    expect(result.hits[1]).toMatchObject({ name: 'Notes.docx', siteId: undefined, size: undefined, summary: '' });
  });

  it('returns an empty result when there are no hits containers', async () => {
    const { service } = discovery({ '/search/query': { value: [{ hitsContainers: [] }] } });
    expect(await service.searchFiles('nothing')).toEqual({ total: 0, moreResultsAvailable: false, hits: [] });
  });

  it('refuses in app-only mode, because it searches as the signed-in user', async () => {
    const { service, calls } = discovery({}, 'client-credentials');
    await expect(service.searchFiles('budget')).rejects.toThrow(/sign-in.*device-code/i);
    expect(calls).toEqual([]);
  });
});

describe('resolveLink', () => {
  it('encodes a URL as u! + unpadded base64url', () => {
    const url = 'https://contoso.sharepoint.com/:w:/s/example/EaBcD?e=xyz';
    const expected =
      'u!' + Buffer.from(url).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    expect(encodeSharingUrl(url)).toBe(expected);
    expect(encodeSharingUrl(url)).not.toMatch(/[=+/]/);
  });

  it('calls /shares/{encoded}/driveItem and maps the item', async () => {
    const url = 'https://contoso.sharepoint.com/:w:/s/example/EaBcD?e=xyz';
    const path = `/shares/${encodeSharingUrl(url)}/driveItem`;
    const { service, calls } = discovery({
      [path]: {
        id: '01AAA',
        name: 'Plan.docx',
        webUrl: 'https://contoso.sharepoint.com/sites/example/Shared%20Documents/Plan.docx',
        size: 1234,
        file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        lastModifiedDateTime: '2026-09-01T10:00:00Z',
        parentReference: { driveId: 'b!drive', siteId: 'site-1', path: '/drives/b!drive/root:/Shared Documents' },
      },
    });
    const item = await service.resolveLink(url);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`GET ${path}`]);
    expect(item).toEqual({
      name: 'Plan.docx',
      itemId: '01AAA',
      driveId: 'b!drive',
      siteId: 'site-1',
      webUrl: 'https://contoso.sharepoint.com/sites/example/Shared%20Documents/Plan.docx',
      isFolder: false,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1234,
      lastModifiedDateTime: '2026-09-01T10:00:00Z',
      parentPath: '/drives/b!drive/root:/Shared Documents',
    });
  });

  it('resolves a plain library URL through the same endpoint', async () => {
    const url = 'https://contoso.sharepoint.com/sites/example/Shared%20Documents/Plan.docx';
    const path = `/shares/${encodeSharingUrl(url)}/driveItem`;
    const { service } = discovery({ [path]: { id: '01AAA', name: 'Plan.docx', folder: { childCount: 0 } } });
    expect(await service.resolveLink(url)).toMatchObject({ itemId: '01AAA', isFolder: true });
  });

  it('rejects something that is not an https URL before calling Graph', async () => {
    const { service, calls } = discovery({});
    await expect(service.resolveLink('Plan.docx')).rejects.toThrow(/https/);
    expect(calls).toEqual([]);
  });
});

describe('findSites', () => {
  const SITE = {
    id: 'contoso.sharepoint.com,1,2',
    name: 'example',
    displayName: 'Example',
    webUrl: 'https://contoso.sharepoint.com/sites/example',
    description: 'A site',
  };

  it('resolves a site URL through /sites/{host}:/{path}', async () => {
    const { service, calls } = discovery({ '/sites/contoso.sharepoint.com:/sites/example': SITE });
    const sites = await service.findSites('https://contoso.sharepoint.com/sites/example/Shared%20Documents');
    expect(calls.map((c) => c.path)).toEqual(['/sites/contoso.sharepoint.com:/sites/example']);
    expect(sites).toEqual([SITE]);
  });

  it('searches by keyword through /sites?search=', async () => {
    const { service, calls } = discovery({ '/sites?search=project%20alpha': { value: [SITE] } });
    expect(await service.findSites('project alpha')).toEqual([SITE]);
    expect(calls.map((c) => c.path)).toEqual(['/sites?search=project%20alpha']);
  });
});
